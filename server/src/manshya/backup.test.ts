import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { tampering } from "./tamper";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");
const { buildBackups, inspect } = require("./core/backup");

const dirs: string[] = [], servers: Server[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise<void>((ok) => s.close(() => ok())); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "bk-")); dirs.push(d); return d; };
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

/** An engine on a real file, with some history, that records the alert emails it would send. */
async function engine(extra: any = {}) {
  const root = scratch(), sent: any[] = [];
  const mn = createManshya({ dbPath: join(root, "manshya.db"), mailer: { send: async (m: any) => { sent.push(m); return { id: "x" }; } }, reconAlertEmail: "ops@vink.co.za", ...extra });
  const m = mn.services.createMerchant("Backup Co"), a = mn.services.createBankAccount(m.id, "Main", "current");
  mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -100_000 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 100_000 }])).immediate();
  await mn.services.createPayment(m, { amount: 40_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r1", customer: { name: "A", email: "a@b.co" } });
  return { mn, m, a, root, sent, dir: join(root, "backups") };
}

describe("taking a backup", () => {
  it("copies the database while it is running, verifies the copy, and records its size, checksum and what it holds", async () => {
    const { mn, dir } = await engine(); const r = await mn.backups.create("test");
    expect(r).toMatchObject({ ok: true, problems: [], mode: "sandbox", by: "test" }); expect(r.name).toMatch(/^manshya-sandbox-\d{8}T\d{6}Z\.db$/);
    const file = join(dir, r.name); expect(r.sha256).toBe(sha(file)); expect(r.bytes).toBe(statSync(file).size);
    expect(r.journals).toBe(mn.db.prepare("SELECT COUNT(*) n FROM journals").get().n); expect(r.entries).toBe(mn.db.prepare("SELECT COUNT(*) n FROM entries").get().n);
    expect(mn.backups.list().data.map((b: any) => b.name)).toEqual([r.name]);
  });
  it("is readable only by the owner, because it holds everything, and lives beside the database", async () => {
    const { mn, dir } = await engine(); const r = await mn.backups.create(); expect(statSync(join(dir, r.name)).mode & 0o777).toBe(0o600); expect(statSync(join(dir, `${r.name}.json`)).mode & 0o777).toBe(0o600);
  });
  it("captures what had happened by then, not what happened before: a later backup holds the later history", async () => {
    const { mn, m, a } = await engine(); const first = await mn.backups.create();
    mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -5 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 5 }])).immediate();
    await new Promise((r) => setTimeout(r, 1100)); const second = await mn.backups.create(); expect(second.journals).toBe(first.journals + 1);
  });
  it("is refused plainly for an in-memory database, which has nothing to copy, and the daily job just skips it", async () => {
    const mn = createManshya(); expect(mn.backups.enabled).toBe(false); await expect(mn.backups.create()).rejects.toThrow(/in memory/); expect(await mn.backups.runDaily()).toEqual({ skipped: "memory database" }); expect(mn.backups.list()).toEqual({ enabled: false, data: [] });
  });
});

describe("a backup is only trusted once it has been opened and checked", () => {
  it("says what is wrong with a file that is not a database, an unbalanced ledger, missing guards, and a database from the other mode", async () => {
    const { mn, dir } = await engine(); const good = await mn.backups.create(); expect(inspect(join(dir, good.name))).toMatchObject({ ok: true, problems: [] });
    const junk = join(dir, "junk.db"); writeFileSync(junk, "this is not a database at all, just text".repeat(50)); expect(inspect(junk)).toMatchObject({ ok: false }); expect(inspect(junk).problems[0]).toMatch(/cannot be opened|could not be read|integrity/);
    expect(inspect(join(dir, "nope.db"))).toMatchObject({ ok: false });
    const bad = tampering(createManshya({ dbPath: join(scratch(), "x.db") })); bad.db.prepare("INSERT INTO ledger_accounts(id,merchant_id,kind) VALUES('a',NULL,'general')").run(); bad.db.prepare("INSERT INTO journals(id,kind,ref,memo,created_at) VALUES('j','deposit',NULL,NULL,'2026-01-01')").run(); bad.db.prepare("INSERT INTO entries(journal_id,account_id,amount) VALUES('j','a',7)").run();
    const file = join(scratch(), "unbal.db"); await bad.db.backup(file); const i = inspect(file); expect(i.ok).toBe(false); expect(i.problems.join(" ")).toMatch(/do not balance/); expect(i.problems.join(" ")).toMatch(/instead of 0/); expect(i.problems.join(" ")).toMatch(/append-only guards are missing/);
  });
  it("catches damage that SQLite itself reports, in a database that still opens and still reads: one changed character in the file", async () => {
    const Database = require("better-sqlite3"); const { mn, dir } = await engine(); const r = await mn.backups.create(); const file = join(dir, r.name);
    const w = new Database(file); w.exec("CREATE TABLE zz(a,b); CREATE INDEX zi ON zz(a)"); const ins = w.prepare("INSERT INTO zz VALUES(?,?)"); w.transaction(() => { for (let i = 0; i < 500; i++) ins.run("key-" + String(i).padStart(4, "0"), i); })(); w.close();
    const buf = readFileSync(file); let last = -1, at = -1; const needle = Buffer.from("key-0123"); while ((at = buf.indexOf(needle, at + 1)) >= 0) last = at; buf[last + 7] = 0x58; writeFileSync(file, buf);       // the index and the table now disagree
    const i = inspect(file); expect(i.ok).toBe(false); expect(i.problems.join(" ")).toMatch(/integrity check failed: row \d+ missing from index zi/);
    expect(mn.backups.restoreCheck(r.name)).toMatchObject({ restored: false, ok: false }); expect(mn.backups.restoreCheck(r.name).problems.join(" ")).toMatch(/integrity check failed/);
  });
  it("is kept but not counted as good, and raises an alert, when it fails: and the older good backups are untouched", async () => {
    const { mn, dir, sent } = await engine(); const good = await mn.backups.create();
    mn.db.prepare("UPDATE kv SET value='live' WHERE key='payments_mode'").run();                                           // the database now claims to be from the other mode
    await new Promise((r) => setTimeout(r, 1100)); const bad = await mn.backups.create();
    expect(bad).toMatchObject({ ok: false }); expect(bad.problems.join(" ")).toMatch(/live mode but this system is in sandbox mode/);
    expect(mn.backups.list().data.map((b: any) => [b.name, b.ok])).toEqual([[bad.name, false], [good.name, true]]); expect(existsSync(join(dir, good.name))).toBe(true);
    await new Promise((r) => setTimeout(r, 20)); expect(sent.map((s) => s.subject)).toContain("Backup FAILED verification"); expect(sent.at(-1).text).toContain(bad.name);
  });
  it("shows a file in the folder that was never verified as exactly that, not as good", async () => {
    const { mn, dir } = await engine(); const r = await mn.backups.create(); rmSync(join(dir, `${r.name}.json`));
    expect(mn.backups.list().data[0]).toMatchObject({ name: r.name, ok: false, unverified: true });
  });
});

describe("rotation and the daily job", () => {
  /** An engine whose clock we control. */
  async function clocked(keep: number, offsite: any = null) {
    const { mn, dir, sent } = await engine(); let t = Date.parse("2026-11-01T02:00:00Z"); const notify = (s: string, b: string) => sent.push({ subject: s, text: b });
    const b = buildBackups({ db: mn.db, dir, mode: "sandbox", keep, offsite, notify, nowFn: () => new Date(t) });
    return { mn, b, dir, sent, advance: (ms: number) => { t += ms; }, at: () => new Date(t) };
  }
  it("keeps the newest few good backups and removes the older ones, never the newest", async () => {
    const { b, advance, dir } = await clocked(3); const names: string[] = []; for (let i = 0; i < 5; i++) { names.push((await b.create()).name); advance(864e5); }
    expect(b.list().data.map((x: any) => x.name)).toEqual([names[4], names[3], names[2]]); expect(readdirSync(dir).filter((f: string) => f.endsWith(".db"))).toHaveLength(3); expect(readdirSync(dir).filter((f: string) => f.endsWith(".json"))).toHaveLength(3);
  });
  it("does not let a run of bad backups push out the good ones", async () => {
    const { mn, b, advance } = await clocked(2); const good = await b.create(); advance(864e5);
    mn.db.prepare("UPDATE kv SET value='live' WHERE key='payments_mode'").run(); for (let i = 0; i < 4; i++) { await b.create(); advance(864e5); }
    const list = b.list().data; expect(list.filter((x: any) => x.ok).map((x: any) => x.name)).toEqual([good.name]); expect(list.filter((x: any) => !x.ok)).toHaveLength(2);       // the good one survives; the failures are capped
  });
  it("takes one when there has not been a good one for a day, and not before", async () => {
    const { b, advance } = await clocked(5); const first = await b.runDaily(); expect(first.ok).toBe(true);
    advance(3 * 36e5); expect(await b.runDaily()).toEqual({ skipped: "a good backup was taken in the last day" }); advance(25 * 36e5); expect((await b.runDaily()).ok).toBe(true); expect(b.list().data).toHaveLength(2);
  });
  it("tries again at the next run after a failure, and says so", async () => {
    const { b, sent } = await clocked(5); const real = (b as any).create; void real; const broken = buildBackups({ db: { backup: async () => { throw new Error("disk full"); } }, dir: scratch(), mode: "sandbox", notify: (s: string, t: string) => sent.push({ subject: s, text: t }) });
    expect(await broken.runDaily()).toMatchObject({ ok: false, error: "disk full" }); expect(sent.at(-1)).toMatchObject({ subject: "Backup FAILED" }); expect(sent.at(-1).text).toContain("disk full");
  });
  it("hands every good backup to the off-site store, records that, and on failure alerts without deleting anything", async () => {
    const put: any[] = []; const { b, sent, dir } = await clocked(5, { put: async (f: string, m: any) => { put.push([f, m.ok]); return "bucket/key-1"; } });
    const ok = await b.create(); expect(put).toEqual([[join(dir, ok.name), true]]); expect(b.list().data[0].offsite).toBe("bucket/key-1");
    const { b: b2, sent: s2, dir: d2 } = await clocked(5, { put: async () => { throw new Error("bucket unreachable"); } }); const r = await b2.create();
    expect(r.ok).toBe(true); expect(r.offsite).toBe("failed: bucket unreachable"); expect(existsSync(join(d2, r.name))).toBe(true); expect(s2.at(-1)).toMatchObject({ subject: "Backup could not be sent off the machine" }); expect(sent).toEqual([]);
  });
});

describe("the restore test", () => {
  it("opens a copy of the backup as a working database and runs the full reconciliation on it, leaving the backup itself untouched", async () => {
    const { mn, dir } = await engine(); const r = await mn.backups.create(); const before = sha(join(dir, r.name));
    expect(mn.backups.restoreCheck(r.name)).toMatchObject({ restored: true, ok: true, exceptions: 0, items: [], journals: r.journals, entries: r.entries }); expect(sha(join(dir, r.name))).toBe(before);
  });
  it("finds a problem that was already in the books when the backup was taken, and says what", async () => {
    const { mn } = await engine(); mn.db.prepare("UPDATE payments SET amount = amount + 100").run();                // the payments table is not guarded: the books are structurally sound but wrong
    const r = await mn.backups.create(); const c = mn.backups.restoreCheck(r.name); expect(c).toMatchObject({ restored: true, ok: false }); expect(c.items.map((i: any) => i.check)).toContain("payment_not_posted");
  });
  it("refuses a name that is not a backup, so it can never be pointed at another file, and reports one that is missing", async () => {
    const { mn } = await engine(); for (const bad of ["../../etc/passwd", "manshya.db", "x", "", "manshya-sandbox-20260101T000000Z.db/../../x"]) expect(() => mn.backups.restoreCheck(bad), bad).toThrow(/not the name of a backup/);
    expect(() => mn.backups.restoreCheck("manshya-sandbox-20200101T000000Z.db")).toThrow(/No such backup/);
  });
  it("reports a backup that is itself unsound without trying to restore it", async () => {
    const { mn, dir } = await engine(); const r = await mn.backups.create(); const file = join(dir, r.name); const buf = readFileSync(file); writeFileSync(file, Buffer.concat([buf.subarray(0, 4096), Buffer.alloc(buf.length - 4096, 7)]));
    expect(mn.backups.restoreCheck(r.name)).toMatchObject({ restored: false, ok: false }); expect(mn.backups.restoreCheck(r.name).problems.length).toBeGreaterThan(0);
  });
});

describe("the staff routes", () => {
  async function app(role: string) {
    const { mn, dir } = await engine({ adminAuthenticate: async () => ({ actor: `staff:${role}`, role }) }); const a = express(); a.use("/v", mn.router);
    const s: Server = await new Promise((ok) => { const x = a.listen(0, "127.0.0.1", () => ok(x)); }); servers.push(s); const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}/v/admin`;
    return { mn, dir, base, call: async (method: string, p: string) => { const r = await fetch(base + p, { method }); return { status: r.status, body: await r.json().catch(() => null) as any }; } };
  }
  it("lets a superadmin take a backup, see it listed, and run the restore test", async () => {
    const { call } = await app("superadmin"); const made = await call("POST", "/backups"); expect(made).toMatchObject({ status: 201, body: { ok: true } });
    expect((await call("GET", "/backups")).body.data.map((b: any) => b.name)).toEqual([made.body.name]); expect(await call("POST", `/backups/${made.body.name}/restore-check`)).toMatchObject({ status: 200, body: { restored: true, ok: true } });
  });
  it("lets other staff see that backups exist, but not take one or run the restore test, and offers no way to download one", async () => {
    const su = await app("superadmin"); const made = await su.call("POST", "/backups"); void made;
    const { call, mn } = await app("support"); await mn.backups.create(); const l = await call("GET", "/backups"); expect(l.status).toBe(200); expect(JSON.stringify(l.body)).not.toMatch(/SQLite format|sha256sum/);
    expect((await call("POST", "/backups")).status).toBe(403); expect((await call("POST", `/backups/${l.body.data[0].name}/restore-check`)).status).toBe(403);
    for (const p of [`/backups/${l.body.data[0].name}`, `/backups/${l.body.data[0].name}/download`, `/backups/${l.body.data[0].name}/file`]) { const r = await call("GET", p); expect(r.status, p).not.toBe(200); expect(JSON.stringify(r.body ?? {}), p).not.toMatch(/SQLite|sha256/); }       // nothing serves the file
  });
});

describe("uploaded documents (the KYC evidence, which is files beside the database, not rows in it)", () => {
  const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString("base64");
  async function withDocs(extra: any = {}) {
    const e = await engine(extra); const up = (name: string, text: string) => e.mn.account.addDocumentFile(e.m, { type: "id_document", filename: name, contentBase64: pdf(text) });
    const d1 = up("id.pdf", "first"), d2 = up("address.pdf", "second"); const live = (d: any) => join(e.root, "uploads", "docs", e.m.id, d.id); const mirror = (d: any) => join(e.dir, "uploads-mirror", "docs", e.m.id, d.id);
    return { ...e, up, d1, d2, live, mirror };
  }
  it("copies every uploaded file into the mirror, readable only by the owner, and does not copy any of them again", async () => {
    const { mn, d1, d2, live, mirror } = await withDocs(); const first = await mn.backups.create();
    expect(first.uploads).toMatchObject({ files: 2, copied: 2, changed: [], missing: [], documents_without_file: 0 }); for (const d of [d1, d2]) { expect(readFileSync(mirror(d))).toEqual(readFileSync(live(d))); expect(statSync(mirror(d)).mode & 0o777).toBe(0o600); }
    await new Promise((r) => setTimeout(r, 1100)); expect((await mn.backups.create()).uploads).toMatchObject({ files: 2, copied: 0 });
  });
  it("copies a file that arrives later, and leaves the earlier ones alone", async () => {
    const { mn, up, mirror, d1 } = await withDocs(); await mn.backups.create(); const before = statSync(mirror(d1)).mtimeMs; const d3 = up("tax.pdf", "third");
    await new Promise((r) => setTimeout(r, 1100)); expect((await mn.backups.create()).uploads).toMatchObject({ files: 3, copied: 1 }); expect(readFileSync(mirror(d3)).toString()).toContain("third"); expect(statSync(mirror(d1)).mtimeMs).toBe(before);
  });
  it("says so, and alerts, when a file that was written once has changed, and keeps the original in the mirror", async () => {
    const { mn, d1, live, mirror, sent } = await withDocs(); await mn.backups.create(); writeFileSync(live(d1), "%PDF-1.4 tampered");
    await new Promise((r) => setTimeout(r, 1100)); const r = await mn.backups.create(); expect(r.uploads.changed).toHaveLength(1); expect(r.uploads.changed[0]).toContain(d1.id); expect(r.uploads).toMatchObject({ copied: 0, missing: [] });
    expect(readFileSync(mirror(d1)).toString()).toContain("first"); await new Promise((r2) => setTimeout(r2, 20)); expect(sent.map((x) => x.subject)).toContain("Uploaded documents are not as they should be"); expect(sent.at(-1).text).toMatch(/have CHANGED/);
  });
  it("says so, and alerts, when a file has disappeared from the live store, keeps it in the mirror, and flags the document that now has no file", async () => {
    const { mn, d1, live, mirror, sent } = await withDocs(); await mn.backups.create(); rmSync(live(d1)); await new Promise((r) => setTimeout(r, 1100)); const r = await mn.backups.create();
    expect(r.uploads).toMatchObject({ missing: [expect.stringContaining(d1.id)], documents_without_file: 1 }); expect(existsSync(mirror(d1))).toBe(true); await new Promise((r2) => setTimeout(r2, 20)); expect(sent.at(-1).text).toMatch(/DISAPPEARED/); expect(sent.at(-1).text).toMatch(/no file in the live store/);
  });
  it("hands only the NEWLY mirrored files to the off-site store, and a failure there alerts without losing the file", async () => {
    const got: string[] = []; const { mn, up, sent } = await withDocs({ offsite: { put: async () => "ok", putUpload: async (_f: string, key: string) => { got.push(key); } } }); await mn.backups.create(); expect(got).toHaveLength(2);
    up("late.pdf", "late"); await new Promise((r) => setTimeout(r, 1100)); await mn.backups.create(); expect(got).toHaveLength(3);
    const b = await withDocs({ offsite: { putUpload: async () => { throw new Error("no"); } } }); const r = await b.mn.backups.create(); expect(r.uploads).toMatchObject({ copied: 2, offsite_failed: 2 }); expect(existsSync(b.mirror(b.d1))).toBe(true);
    await new Promise((r2) => setTimeout(r2, 20)); expect(b.sent.map((x) => x.subject)).toContain("Uploaded documents could not be sent off the machine"); expect(sent).toEqual([]);
  });
  it("has nothing to mirror, and no trouble, when no document has ever been uploaded", async () => { const { mn } = await engine(); expect((await mn.backups.create()).uploads).toMatchObject({ files: 0, copied: 0, changed: [], missing: [], documents_without_file: 0 }); });
});

