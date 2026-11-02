const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { ApiError } = require('./util');
const { LEDGER_GUARDS } = require('./db');
const { buildRecon } = require('./reconcile');

/**
 * Backups of the banking database (the ledger, accounts, cards, everything in manshya.db).
 *
 * A backup nobody has opened is a hope, not a backup, so every one is VERIFIED as soon as it is taken: the file is opened on its own, SQLite's own integrity check must pass, every
 * journal must balance, the books must add up to zero, the append-only guards must be present, and the database must still belong to the mode it was created in. The result is
 * written next to it in a manifest with its size and checksum. A backup that fails any of that is kept for investigation but is never counted as a good one, and never causes a good one
 * to be deleted.
 *
 *   create()        take a backup now (SQLite's online backup, safe while the system is running), verify it, and trim old ones
 *   runDaily(at)    called by the scheduler: takes one if there has not been a good one in the last day
 *   list()          what exists, newest first, with each one's verification result (never the contents)
 *   restoreCheck()  the real test: copy a backup to a scratch file, open it as a database, and run the full daily reconciliation on it
 *
 * UPLOADED DOCUMENTS (the KYC evidence customers send) are not in the database: they are files beside it. They are written once and never change, so they are MIRRORED rather than
 * re-copied: every backup copies any file the mirror does not have yet into `backups/uploads-mirror/`, never overwrites or deletes one, and reports (and alerts on) any file that has
 * CHANGED or DISAPPEARED from the live store since it was mirrored, and any document the database lists whose file is not there. An off-site store can take each new file as it is mirrored
 * (`offsite.putUpload(file, key)`).
 *
 * Where they go: next to the database, in `backups/`, on the same volume. That protects against corruption, mistakes and bad deploys, NOT against losing the volume itself: a copy
 * must also leave the machine. That needs somewhere to send it (a bucket, another host), which is yours to provide, so it is a hook: pass `offsite.put(file, manifest)` and every
 * good backup is handed to it; a failure there raises an alert but never deletes anything. Files are readable only by the owner (0600): they contain everything.
 */
const NAME = /^manshya-(sandbox|live)-\d{8}T\d{6}Z\.db$/;
const DAY = 864e5;

/** Opens a database file on its own and says whether it is sound. Never changes it. */
function inspect(file) {
  const problems = []; let c;
  try { c = new Database(file, { readonly: true, fileMustExist: true }); }
  catch (e) { return { ok: false, problems: [`The file cannot be opened as a database: ${e.message}`], journals: 0, entries: 0, mode: null }; }
  try {
    const integrity = c.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') problems.push(`SQLite's integrity check failed: ${integrity}`);
    const unbalanced = c.prepare('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)<>0)').get().n;
    if (unbalanced) problems.push(`${unbalanced} journal(s) do not balance`);
    const total = c.prepare('SELECT COALESCE(SUM(amount),0) s FROM entries').get().s;
    if (total !== 0) problems.push(`All entries add up to ${total} cents instead of 0`);
    const guards = new Set(c.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((r) => r.name));
    const missing = LEDGER_GUARDS.filter((g) => !guards.has(g));
    if (missing.length) problems.push(`The append-only guards are missing: ${missing.join(', ')}`);
    const mode = c.prepare("SELECT value FROM kv WHERE key='payments_mode'").get()?.value ?? null;
    if (!mode) problems.push('The database does not say which payments mode it belongs to');
    const journals = c.prepare('SELECT COUNT(*) n FROM journals').get().n, entries = c.prepare('SELECT COUNT(*) n FROM entries').get().n;
    return { ok: problems.length === 0, problems, journals, entries, mode };
  } catch (e) { return { ok: false, problems: [`The database could not be read: ${e.message}`], journals: 0, entries: 0, mode: null }; }
  finally { c.close(); }
}

function buildBackups({ db, dir, uploadsDir = null, mode = 'sandbox', keep = 14, offsite = null, notify = () => {}, nowFn = () => new Date() }) {
  const enabled = !!dir;
  if (enabled) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const manifestOf = (file) => `${file}.json`;
  const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  function read(name) { try { return JSON.parse(fs.readFileSync(manifestOf(path.join(dir, name)), 'utf8')); } catch { return null; } }
  function list() {
    if (!enabled) return { enabled: false, data: [] };
    const data = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().map((name) => {
      const m = read(name); const st = fs.statSync(path.join(dir, name));
      return m ? { name, ...m } : { name, created_at: st.mtime.toISOString(), bytes: st.size, ok: false, problems: ['No verification record: this backup was never verified'], unverified: true };
    });
    return { enabled: true, data };
  }

  /** Keeps the newest `keep` verified backups (and every one that failed, for investigation, up to a limit), and never touches the newest good one. */
  function trim() {
    const all = list().data, good = all.filter((b) => b.ok), bad = all.filter((b) => !b.ok);
    const drop = [...good.slice(keep), ...bad.slice(keep)];
    for (const b of drop) { for (const f of [path.join(dir, b.name), manifestOf(path.join(dir, b.name))]) fs.rmSync(f, { force: true }); }
    return drop.length;
  }

  const walk = (root, rel = '') => fs.existsSync(path.join(root, rel)) ? fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(root, path.join(rel, e.name)) : [path.join(rel, e.name)])) : [];

  /** Copies any uploaded file the mirror does not have yet, and reports anything that is not as it should be. Never overwrites or deletes in the mirror. */
  async function mirrorUploads() {
    if (!uploadsDir || !fs.existsSync(uploadsDir)) return null;
    const dest = path.join(dir, 'uploads-mirror'); fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    const out = { files: 0, bytes: 0, copied: 0, changed: [], missing: [], documents_without_file: 0, offsite_failed: 0 };
    const live = new Set(walk(uploadsDir));
    for (const rel of live) {
      const src = path.join(uploadsDir, rel), dst = path.join(dest, rel), size = fs.statSync(src).size; out.files++; out.bytes += size;
      if (fs.existsSync(dst)) { if (fs.statSync(dst).size !== size || sha256(dst) !== sha256(src)) out.changed.push(rel); continue; }       // already mirrored; written once, so it must still be the same
      fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 }); fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL); fs.chmodSync(dst, 0o600); out.copied++;
      if (offsite && offsite.putUpload) { try { await offsite.putUpload(dst, rel); } catch { out.offsite_failed++; } }
    }
    out.missing = walk(dest).filter((rel) => !live.has(rel));                                         // mirrored once, gone from the live store now: kept in the mirror
    try { for (const d of db.prepare("SELECT storage_key FROM documents WHERE storage_key IS NOT NULL").all()) if (!live.has(path.normalize(d.storage_key))) out.documents_without_file++; } catch { /* no documents table */ }
    const bad = [];
    if (out.changed.length) bad.push(`${out.changed.length} uploaded file(s) have CHANGED since they were first saved (they are write-once): ${out.changed.slice(0, 5).join(', ')}`);
    if (out.missing.length) bad.push(`${out.missing.length} uploaded file(s) have DISAPPEARED from the live store (the mirror still has them): ${out.missing.slice(0, 5).join(', ')}`);
    if (out.documents_without_file) bad.push(`${out.documents_without_file} document(s) listed in the database have no file in the live store`);
    if (bad.length) notify('Uploaded documents are not as they should be', `While backing up:\n- ${bad.join('\n- ')}\nNothing in the mirror has been changed or removed.`);
    if (out.offsite_failed) notify('Uploaded documents could not be sent off the machine', `${out.offsite_failed} newly mirrored file(s) could not be handed to the offsite store. They are safe in the mirror on the volume.`);
    return out;
  }

  async function create(by = 'schedule') {
    if (!enabled) throw new ApiError(409, 'backups_off', 'Backups need a database file. This database is in memory.');
    const at = nowFn(), name = `manshya-${mode}-${stamp(at)}.db`, file = path.join(dir, name);
    if (fs.existsSync(file)) return { ...read(name), name, skipped: 'already taken this second' };
    await db.backup(file);                                    // SQLite's online backup: consistent, and the system keeps running
    fs.chmodSync(file, 0o600);
    const check = inspect(file), bytes = fs.statSync(file).size, sum = sha256(file);
    if (check.mode && check.mode !== mode) { check.ok = false; check.problems.push(`The backup says it belongs to ${check.mode} mode but this system is in ${mode} mode`); }
    let uploads = null; try { uploads = await mirrorUploads(); } catch (e) { notify('Uploaded documents could not be mirrored', e.message); uploads = { error: e.message }; }
    const manifest = { created_at: at.toISOString(), by, bytes, sha256: sum, mode: check.mode, journals: check.journals, entries: check.entries, ok: check.ok, problems: check.problems, uploads, offsite: null };
    fs.writeFileSync(manifestOf(file), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    if (!check.ok) notify('Backup FAILED verification', `The backup ${name} was taken but is not sound:\n- ${check.problems.join('\n- ')}\nIt has been kept for investigation and does not count as a good backup. Older good backups have not been touched.`);
    else if (offsite) {
      try { manifest.offsite = (await offsite.put(file, manifest)) ?? 'sent'; fs.writeFileSync(manifestOf(file), JSON.stringify(manifest, null, 2), { mode: 0o600 }); }
      catch (e) { notify('Backup could not be sent off the machine', `The backup ${name} is good and is on the volume, but handing it to the offsite store failed: ${e.message}. It has not been deleted.`); manifest.offsite = `failed: ${e.message}`; fs.writeFileSync(manifestOf(file), JSON.stringify(manifest, null, 2), { mode: 0o600 }); }
    }
    const removed = trim();
    return { name, ...manifest, removed };
  }

  /** Called every minute by the scheduler; only does anything when there has not been a good backup for a day. */
  async function runDaily(at = nowFn()) {
    if (!enabled) return { skipped: 'memory database' };
    const last = list().data.find((b) => b.ok);
    if (last && at.getTime() - Date.parse(last.created_at) < DAY) return { skipped: 'a good backup was taken in the last day' };
    try { const r = await create('schedule'); return { name: r.name, ok: r.ok }; }
    catch (e) { notify('Backup FAILED', `The scheduled backup could not be taken: ${e.message}`); return { ok: false, error: e.message }; }
  }

  /**
   * The real restore test (the go-live item "Database and ledger restore tested"): copies the backup to a scratch file, opens it as a working database, and runs the same
   * reconciliation the system runs every day. The backup itself is never opened for writing.
   */
  function restoreCheck(name) {
    if (!enabled) throw new ApiError(409, 'backups_off', 'Backups need a database file. This database is in memory.');
    if (!NAME.test(name || '')) throw new ApiError(400, 'invalid_backup', 'That is not the name of a backup');
    const file = path.join(dir, name); if (!fs.existsSync(file)) throw new ApiError(404, 'backup_not_found', 'No such backup');
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-')), copy = path.join(scratch, 'restored.db');
    try {
      fs.copyFileSync(file, copy);
      const sound = inspect(copy); if (!sound.ok) return { name, restored: false, ok: false, problems: sound.problems };
      const c = new Database(copy);
      try { const r = buildRecon({ db: c }).run(nowFn(), 'restore-check'); const items = c.prepare('SELECT check_name, detail FROM recon_exceptions WHERE run_id=?').all(r.id).map((i) => ({ check: i.check_name, detail: i.detail })); return { name, restored: true, ok: r.ok, exceptions: r.exceptions, items: items.slice(0, 50), journals: sound.journals, entries: sound.entries }; }
      finally { c.close(); }
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }

  return { enabled, create, runDaily, list, restoreCheck, trim };
}

module.exports = { buildBackups, inspect };
