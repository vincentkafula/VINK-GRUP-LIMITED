const { ApiError, rid, now } = require('./util');

// Well-known ledger accounts
const A = {
  avail: (m) => `m:${m}:available`,
  ret: (m) => `m:${m}:retained`,
  bank: (id) => `bank:${id}`,
  clearing: 'sys:clearing',       // money received from / owed to payment gateways
  fees: 'sys:fees',               // Manshya revenue
  out: 'sys:external_out',        // money sent to other banks
  in: 'sys:external_in',          // money received from other banks
};

function buildLedger(db) {
  const ensure = db.prepare('INSERT OR IGNORE INTO ledger_accounts(id,merchant_id,kind) VALUES(?,?,?)');
  const insJ = db.prepare('INSERT INTO journals(id,kind,ref,memo,created_at) VALUES(?,?,?,?,?)');
  const insE = db.prepare('INSERT INTO entries(journal_id,account_id,amount) VALUES(?,?,?)');
  const sum = db.prepare('SELECT COALESCE(SUM(amount),0) b FROM entries WHERE account_id=?');

  const balance = (account) => sum.get(account).b;

  // Post one balanced journal. MUST run inside a db transaction (BEGIN IMMEDIATE) so the
  // floor check and the insert are atomic. A line may carry `floor` (minimum balance after posting).
  function post(kind, lines, { ref, memo } = {}) {
    if (!lines.every((l) => Number.isInteger(l.amount))) throw new ApiError(500, 'ledger_error', 'Non-integer amount');
    if (lines.reduce((s, l) => s + l.amount, 0) !== 0) throw new ApiError(500, 'ledger_error', 'Unbalanced journal');
    for (const l of lines) {
      if (l.floor !== undefined && balance(l.account) + l.amount < l.floor)
        throw new ApiError(409, 'insufficient_funds', 'Insufficient funds');
    }
    const id = rid('jr');
    insJ.run(id, kind, ref || null, memo || null, now());
    for (const l of lines) {
      ensure.run(l.account, l.merchant || null, l.kind || 'general');
      insE.run(id, l.account, l.amount);
    }
    return id;
  }
  const reverse = (lines) => lines.map(({ floor, ...l }) => ({ ...l, amount: -l.amount }));

  return { post, reverse, balance };
}
module.exports = { buildLedger, A };
