const { rid, now } = require('./util');

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

function buildRecon({ db }) {
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
  return { check, run, runDaily, list, detail };
}
module.exports = { buildRecon, STUCK_DAYS };
