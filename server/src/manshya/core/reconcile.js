const crypto = require('crypto');
const { ApiError, rid, now } = require('./util');

// Daily reconciliation of the books against the records that produced them. It needs no outside file: every check compares two things
// VINK itself holds, so a difference is a real fault (a missing or wrong posting), never a timing question with a bank.
//
//   journal_unbalanced      a journal whose lines do not add up to zero
//   books_not_zero          all entries together do not add up to zero
//   negative_balance        a customer account (available, retained, bank, savings, rewards) below zero
//   payment_not_posted      a paid payment with no 'payment' journal, or one that posted a different amount
//   payment_orphan_journal  a 'payment' journal that belongs to no payment
//   refund_mismatch         the refunded amount on a payment differs from what the refund journals moved
//   payout_not_posted       a payout that left the platform without its 'payout' journal
//   transfer_not_posted     a transfer that was accepted without its 'transfer' journal
//   stuck_processing        a transfer or payout still "processing" after STUCK_DAYS (the bank never confirmed it)
//   webhook_dead_letters    webhook events that gave up (information: replay them from the dashboard)
//
// Runs are stored (recon_runs / recon_exceptions) so there is a record of every day the books were checked and what was found.
const STUCK_DAYS = 3;
const MONEY_KINDS = "('available','retained','bank','savings','rewards')";

function buildRecon({ db, notify = () => {} }) {
  const all = (sql, ...p) => db.prepare(sql).all(...p), get = (sql, ...p) => db.prepare(sql).get(...p);

  function check(at) {
    const ex = [];
    const add = (check, ref, detail, merchant = null) => ex.push({ check, ref, detail, merchant_id: merchant });

    for (const j of all('SELECT journal_id, SUM(amount) s FROM entries GROUP BY journal_id HAVING s<>0'))
      add('journal_unbalanced', j.journal_id, `Lines add up to ${j.s} cents instead of 0`);
    const total = get('SELECT COALESCE(SUM(amount),0) s FROM entries').s;
    if (total !== 0) add('books_not_zero', null, `All entries add up to ${total} cents instead of 0`);

    for (const a of all(`SELECT e.account_id, l.merchant_id, SUM(e.amount) s FROM entries e JOIN ledger_accounts l ON l.id=e.account_id WHERE l.kind IN ${MONEY_KINDS} GROUP BY e.account_id HAVING s<0`))
      add('negative_balance', a.account_id, `Balance is ${a.s} cents`, a.merchant_id);

    const posted = (kind) => new Map(all("SELECT j.ref ref, COUNT(*) n FROM journals j WHERE j.kind=? AND j.ref IS NOT NULL GROUP BY j.ref", kind).map((r) => [r.ref, r.n]));
    const paymentJ = posted('payment');
    const clearing = new Map(all("SELECT j.ref ref, SUM(e.amount) s FROM journals j JOIN entries e ON e.journal_id=j.id WHERE j.kind='payment' AND e.account_id='sys:clearing' GROUP BY j.ref").map((r) => [r.ref, r.s]));
    const refunded = new Map(all("SELECT j.ref ref, SUM(e.amount) s FROM journals j JOIN entries e ON e.journal_id=j.id WHERE j.kind IN ('refund','refund_reversal') AND e.account_id='sys:clearing' GROUP BY j.ref").map((r) => [r.ref, r.s]));
    const payments = all("SELECT id,merchant_id,amount,refunded,status FROM payments");
    const known = new Set(payments.map((p) => p.id));
    for (const p of payments) {
      if (['paid', 'partially_refunded', 'refunded'].includes(p.status)) {
        if (!paymentJ.has(p.id)) add('payment_not_posted', p.id, `Payment of ${p.amount} cents is marked ${p.status} but was never posted to the books`, p.merchant_id);
        else if (-(clearing.get(p.id) ?? 0) !== p.amount) add('payment_not_posted', p.id, `Payment is ${p.amount} cents but ${-(clearing.get(p.id) ?? 0)} cents was posted`, p.merchant_id);
      }
      if ((refunded.get(p.id) ?? 0) !== p.refunded) add('refund_mismatch', p.id, `Marked refunded ${p.refunded} cents, refund postings total ${refunded.get(p.id) ?? 0} cents`, p.merchant_id);
    }
    for (const ref of paymentJ.keys()) if (!known.has(ref)) add('payment_orphan_journal', ref, 'A payment posting exists for a payment that is not on record');

    const payoutJ = posted('payout');
    for (const p of all("SELECT id,merchant_id,net,status FROM payouts WHERE status NOT IN ('pending_approval','rejected','failed')"))
      if (!payoutJ.has(p.id)) add('payout_not_posted', p.id, `Payout of ${p.net} cents is ${p.status} but was never posted to the books`, p.merchant_id);
    const transferJ = posted('transfer');
    for (const t of all("SELECT id,merchant_id,amount,status FROM transfers WHERE status NOT IN ('failed')"))
      if (!transferJ.has(t.id)) add('transfer_not_posted', t.id, `Transfer of ${t.amount} cents is ${t.status} but was never posted to the books`, t.merchant_id);

    const cutoff = new Date(at.getTime() - STUCK_DAYS * 864e5).toISOString();
    for (const t of all("SELECT id,merchant_id,amount,created_at FROM transfers WHERE status='processing' AND created_at<?", cutoff)) add('stuck_processing', t.id, `Transfer of ${t.amount} cents still processing since ${t.created_at}`, t.merchant_id);
    for (const p of all("SELECT id,merchant_id,net,created_at FROM payouts WHERE status='processing' AND created_at<?", cutoff)) add('stuck_processing', p.id, `Payout of ${p.net} cents still processing since ${p.created_at}`, p.merchant_id);

    const dead = get('SELECT COUNT(*) n FROM events WHERE dead=1').n;
    if (dead) add('webhook_dead_letters', null, `${dead} webhook event(s) gave up after repeated failures and can be replayed`);
    return ex;
  }

  // Email the operations address when a SCHEDULED run finds something it has not already told them about. The same unresolved problems
  // are not repeated every day; a clean run re-arms the alert.
  function alertIfNew(id, at, issues, by) {
    const sig = issues.length ? crypto.createHash('sha256').update(issues.map((e) => e.check + '|' + e.ref).sort().join('\n')).digest('hex') : '';
    const last = get("SELECT value FROM kv WHERE key='recon_alert_sig'");
    if (by !== 'schedule' || (last ? last.value : '') === sig) return;
    db.prepare("INSERT INTO kv(key,value) VALUES('recon_alert_sig',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(sig);
    if (!issues.length) return;
    const lines = issues.slice(0, 25).map((e) => `- ${e.check}${e.ref ? ' (' + e.ref + ')' : ''}: ${e.detail}`);
    try {
      notify(`VINK reconciliation: ${issues.length} exception${issues.length === 1 ? '' : 's'} found`,
        `The daily check of the books on ${at.toISOString().slice(0, 10)} found ${issues.length} problem(s).\n\n${lines.join('\n')}${issues.length > 25 ? `\n...and ${issues.length - 25} more` : ''}\n\nOpen the back office, Reconciliation, to see run ${id}.`);
    } catch (e) { console.error('[reconciliation] alert failed:', e.message); }
  }

  /** Runs every check now, stores the run and its exceptions, and returns the summary. `ok` is false when any money check found something. */
  function run(at = new Date(), by = 'schedule') {
    const ex = check(at);
    const id = rid('rec');
    const issues = ex.filter((e) => e.check !== 'webhook_dead_letters');
    db.transaction(() => {
      db.prepare('INSERT INTO recon_runs(id,ran_at,ran_by,ok,exceptions) VALUES(?,?,?,?,?)').run(id, at.toISOString(), by, issues.length === 0 ? 1 : 0, ex.length);
      const ins = db.prepare('INSERT INTO recon_exceptions(run_id,check_name,ref,detail,merchant_id) VALUES(?,?,?,?,?)');
      for (const e of ex) ins.run(id, e.check, e.ref, e.detail, e.merchant_id);
    })();
    if (issues.length) console.error(`[reconciliation] ${issues.length} exception(s) found in run ${id}`);
    alertIfNew(id, at, issues, by);
    return { id, ran_at: at.toISOString(), ok: issues.length === 0, exceptions: ex.length, by };
  }

  /** The scheduler calls this every minute; it only does the work once a day. */
  function runDaily(at = new Date()) {
    const last = get('SELECT ran_at FROM recon_runs ORDER BY ran_at DESC LIMIT 1');
    if (last && at.getTime() - Date.parse(last.ran_at) < 864e5) return { skipped: true };
    return run(at, 'schedule');
  }

  const list = (limit = 30) => ({ data: all('SELECT id,ran_at,ran_by,ok,exceptions FROM recon_runs ORDER BY ran_at DESC LIMIT ?', Math.min(Math.max(limit | 0, 1), 200)).map((r) => ({ ...r, ok: !!r.ok })) });
  const detail = (id) => {
    const r = get('SELECT id,ran_at,ran_by,ok,exceptions FROM recon_runs WHERE id=?', id);
    return r ? { ...r, ok: !!r.ok, items: all('SELECT check_name "check",ref,detail,merchant_id FROM recon_exceptions WHERE run_id=? ORDER BY id', id) } : null;
  };
  /* ---------- settlement files: compare what a provider or bank says with our own records ---------- */
  const parseCsv = (t) => {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  };
  const GUESS = { ref: ['gateway_ref', 'reference', 'ref', 'transaction id', 'transaction_id', 'rail_ref'], amount: ['amount', 'gross', 'net'], date: ['date', 'settlement date', 'value date'] };
  const PAID = ['paid', 'partially_refunded', 'refunded'];

  /**
   * kind 'acquirer': the card/EFT provider's settlement file against our payments (by gateway_ref).
   * kind 'bank': the bank's statement of what we paid out against our payouts and transfers (by rail_ref).
   * Column names differ by provider, so they can be given (columns: { ref, amount, date }); common names are recognised.
   * amountUnit is 'rand' (125.50) or 'cents' (12550). Importing the same file twice is refused.
   */
  function matchSettlement(b = {}, by = 'staff') {
    const kind = b.kind === 'bank' ? 'bank' : b.kind === 'acquirer' ? 'acquirer' : null;
    if (!kind) throw new ApiError(400, 'invalid_kind', "kind must be 'acquirer' or 'bank'");
    if (typeof b.csv !== 'string' || !b.csv.trim() || b.csv.length > 400000) throw new ApiError(400, 'invalid_csv', 'Paste the settlement file as CSV text (up to 400 KB)');
    const rows = parseCsv(b.csv), head = rows.shift().map((h) => h.trim().toLowerCase());
    const col = (want, names) => { const w = (want || '').trim().toLowerCase(); if (w) return head.indexOf(w); for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
    const c = b.columns || {}, ri = col(c.ref, GUESS.ref), ai = col(c.amount, GUESS.amount), di = col(c.date, GUESS.date);
    if (ri < 0 || ai < 0) throw new ApiError(400, 'invalid_csv', `Could not find the reference and amount columns. The file has: ${head.join(', ')}. Say which to use with columns.`);
    if (rows.length > 5000) throw new ApiError(400, 'invalid_csv', 'Up to 5000 rows at a time');
    const unit = b.amountUnit === 'cents' ? 'cents' : 'rand';
    const file = rows.map((r) => {
      const n = parseFloat(String(r[ai] || '').replace(/[^0-9.\-]/g, ''));
      return { ref: String(r[ri] || '').trim().slice(0, 80), amount: Math.abs(unit === 'cents' ? Math.round(n) : Math.round(n * 100)), date: di >= 0 ? String(r[di] || '').trim().slice(0, 10) : '' };
    });
    if (file.some((r) => !r.ref || !Number.isFinite(r.amount))) throw new ApiError(400, 'invalid_csv', 'Every row needs a reference and a numeric amount');

    const hash = crypto.createHash('sha256').update(kind + '\n' + b.csv.trim()).digest('hex');
    if (get('SELECT 1 FROM recon_settlements WHERE file_hash=?', hash)) throw new ApiError(409, 'already_imported', 'This exact file has already been imported');

    const refs = JSON.stringify([...new Set(file.map((r) => r.ref))]);
    const ours = new Map();
    if (kind === 'acquirer') {
      for (const p of all('SELECT id,gateway_ref ref,amount,status,merchant_id FROM payments WHERE gateway_ref IN (SELECT value FROM json_each(?))', refs)) ours.set(p.ref, { ...p, ok: PAID.includes(p.status) });
    } else {
      for (const p of all('SELECT id,rail_ref ref,net amount,status,merchant_id FROM payouts WHERE rail_ref IN (SELECT value FROM json_each(?))', refs)) ours.set(p.ref, { ...p, ok: p.status !== 'failed' });
      for (const t of all('SELECT id,rail_ref ref,amount,status,merchant_id FROM transfers WHERE rail_ref IN (SELECT value FROM json_each(?))', refs)) ours.set(t.ref, { ...t, ok: t.status !== 'failed' });
    }
    const items = [];
    let matched = 0, matchedTotal = 0;
    const seen = new Set();
    for (const r of file) {
      if (seen.has(r.ref)) { items.push({ bucket: 'duplicate_in_file', ref: r.ref, file_amount: r.amount, our_amount: null, detail: 'The reference appears more than once in the file', merchant_id: null }); continue; }
      seen.add(r.ref);
      const o = ours.get(r.ref);
      if (!o) items.push({ bucket: 'not_in_our_records', ref: r.ref, file_amount: r.amount, our_amount: null, detail: 'The file lists a reference we have no record of', merchant_id: null });
      else if (o.amount !== r.amount) items.push({ bucket: 'amount_mismatch', ref: r.ref, file_amount: r.amount, our_amount: o.amount, detail: `File says ${r.amount} cents, we have ${o.amount} (${o.id})`, merchant_id: o.merchant_id });
      else if (!o.ok) items.push({ bucket: 'status_mismatch', ref: r.ref, file_amount: r.amount, our_amount: o.amount, detail: `The file settles it but our record (${o.id}) is ${o.status}`, merchant_id: o.merchant_id });
      else { matched++; matchedTotal += r.amount; }
    }
    // the other direction: things we recorded inside the file's date range that the file does not mention
    const dates = file.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (dates.length) {
      const from = dates[0] + 'T00:00:00', to = new Date(Date.parse(dates[dates.length - 1]) + 864e5).toISOString();
      const inFile = new Set(file.map((r) => r.ref));
      const ourSide = kind === 'acquirer'
        ? all("SELECT id,gateway_ref ref,amount,merchant_id FROM payments WHERE status IN ('paid','partially_refunded','refunded') AND gateway_ref IS NOT NULL AND created_at>=? AND created_at<?", from, to)
        : [...all("SELECT id,rail_ref ref,net amount,merchant_id FROM payouts WHERE status NOT IN ('pending_approval','rejected','failed') AND rail_ref IS NOT NULL AND created_at>=? AND created_at<?", from, to),
          ...all("SELECT id,rail_ref ref,amount,merchant_id FROM transfers WHERE status<>'failed' AND rail_ref IS NOT NULL AND created_at>=? AND created_at<?", from, to)];
      for (const o of ourSide) if (!inFile.has(o.ref)) items.push({ bucket: 'missing_from_file', ref: o.ref, file_amount: null, our_amount: o.amount, detail: `We recorded ${o.id} but the file does not list it`, merchant_id: o.merchant_id });
    }
    const count = (k) => items.filter((i) => i.bucket === k).length;
    const id = rid('stl');
    const summary = { rows: file.length, matched, matched_total: matchedTotal, file_total: file.reduce((s, r) => s + r.amount, 0), amount_mismatch: count('amount_mismatch'), status_mismatch: count('status_mismatch'), not_in_our_records: count('not_in_our_records'), missing_from_file: count('missing_from_file'), duplicate_in_file: count('duplicate_in_file') };
    db.transaction(() => {
      db.prepare('INSERT INTO recon_settlements(id,imported_at,imported_by,kind,source,file_hash,summary,problems) VALUES(?,?,?,?,?,?,?,?)').run(id, now(), by, kind, String(b.source || '').slice(0, 80), hash, JSON.stringify(summary), items.length);
      const ins = db.prepare('INSERT INTO recon_settlement_items(settlement_id,bucket,ref,file_amount,our_amount,detail,merchant_id) VALUES(?,?,?,?,?,?,?)');
      for (const i of items) ins.run(id, i.bucket, i.ref, i.file_amount, i.our_amount, i.detail, i.merchant_id);
    })();
    return { id, kind, ok: items.length === 0, summary, items: items.slice(0, 300), truncated: items.length > 300 };
  }
  const listSettlements = (limit = 30) => ({ data: all('SELECT id,imported_at,imported_by,kind,source,summary,problems FROM recon_settlements ORDER BY imported_at DESC LIMIT ?', Math.min(Math.max(limit | 0, 1), 200)).map((r) => ({ ...r, summary: JSON.parse(r.summary), ok: r.problems === 0 })) });
  const settlementDetail = (id) => {
    const r = get('SELECT id,imported_at,imported_by,kind,source,summary,problems FROM recon_settlements WHERE id=?', id);
    return r ? { ...r, summary: JSON.parse(r.summary), ok: r.problems === 0, items: all('SELECT bucket,ref,file_amount,our_amount,detail,merchant_id FROM recon_settlement_items WHERE settlement_id=? ORDER BY id LIMIT 500', id) } : null;
  };

  return { check, run, runDaily, list, detail, matchSettlement, listSettlements, settlementDetail };
}
module.exports = { buildRecon, STUCK_DAYS };
