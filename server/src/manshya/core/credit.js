const { ApiError, rid, now, num } = require('./util');
const { A } = require('./ledger');

const addMonth = (iso) => { const d = new Date(iso), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString(); };
const pmt = (p, apr, n) => { const r = apr / 12; return Math.ceil((p * r) / (1 - Math.pow(1 + r, -n))); };

// Business credit: a revolving credit line and fixed-term loans, offered from trading history.
// Ledger: credit:<id> goes negative by what the customer owes, so every journal still sums to zero.
module.exports = function buildCredit({ db, ledger, core, config, notify, emit }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const acct = (id) => `credit:${id}`, owed = (id) => -ledger.balance(acct(id)), P = () => config.credit.products;

  const products = () => P().map((p) => ({ id: p.id, name: p.name, apr: p.apr, min: p.min, max: p.max, revolving: !!p.revolving, terms: p.terms || null }));
  const volume90 = (mid) => get("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE merchant_id=? AND status IN ('paid','partially_refunded','refunded') AND created_at>=?", mid, new Date(Date.now() - 90 * 864e5).toISOString()).v;
  const pubApp = (a) => ({ id: a.id, product: a.product, requested: a.requested, term_months: a.term_months, status: a.status, offered_limit: a.offered_limit, apr: a.apr, reason: a.reason, expires_at: a.expires_at, created_at: a.created_at });

  // Personalised offer: up to 30% of the last 90 days of sales, for verified businesses with enough history.
  function apply(m, b = {}) {
    const prod = P().find((p) => p.id === b.product);
    if (!prod) throw new ApiError(400, 'invalid_product', 'Choose one of the available credit products');
    const requested = num(b.requested, 'requested', { min: prod.min, max: prod.max });
    let term = null;
    if (prod.terms) { term = num(b.termMonths, 'termMonths', { min: 1, max: 120 }); if (!prod.terms.includes(term)) throw new ApiError(400, 'invalid_termMonths', `termMonths must be one of ${prod.terms.join(', ')}`); }
    core.getAccount(m.id, b.accountId);
    if (get("SELECT 1 FROM credit_facilities WHERE merchant_id=? AND product=? AND status='active'", m.id, prod.id)) throw new ApiError(409, 'already_have', 'You already have this product');
    if (get("SELECT 1 FROM credit_applications WHERE merchant_id=? AND product=? AND status='offered' AND expires_at>?", m.id, prod.id, now())) throw new ApiError(409, 'offer_open', 'You already have an offer waiting. Accept or decline it first.');
    let status = 'offered', reason = null, offered = 0;
    if (!m.verified) { status = 'declined'; reason = 'Verify your business first'; }
    else {
      offered = Math.min(requested, Math.floor((volume90(m.id) * config.credit.salesShare) / 100000) * 100000, prod.max);
      if (offered < config.credit.minOffer) { status = 'declined'; reason = 'Not enough trading history yet'; offered = 0; }
    }
    const id = rid('cra');
    run('INSERT INTO credit_applications(id,merchant_id,product,requested,term_months,account_id,status,offered_limit,apr,reason,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      id, m.id, prod.id, requested, term, b.accountId, status, offered || null, prod.apr, reason, new Date(Date.now() + 7 * 864e5).toISOString(), now());
    return pubApp(get('SELECT * FROM credit_applications WHERE id=?', id));
  }
  const listApplications = (m) => ({ data: all('SELECT * FROM credit_applications WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id).map(pubApp) });
  const decline = (m, id) => { if (!run("UPDATE credit_applications SET status='declined_by_you' WHERE id=? AND merchant_id=? AND status='offered'", id, m.id).changes) throw notFound('application'); return { id, status: 'declined_by_you' }; };

  const pubFac = (f) => { const o = owed(f.id); return { id: f.id, product: f.product, limit: f.limit_amount, owed: o, available: f.term_months ? 0 : Math.max(0, f.limit_amount - o), apr: f.apr, term_months: f.term_months, instalment: f.instalment, next_due: f.next_due, status: f.status, missed: f.missed }; };
  const facility = (m, id) => { const f = get('SELECT * FROM credit_facilities WHERE id=? AND merchant_id=?', id, m.id); if (!f) throw notFound('facility'); return pubFac(f); };
  const listFacilities = (m) => ({ data: all('SELECT * FROM credit_facilities WHERE merchant_id=? ORDER BY created_at DESC', m.id).map(pubFac) });
  const statement = (m, id) => ({ facility: facility(m, id), data: all('SELECT j.created_at date,j.kind,j.memo,e.amount FROM entries e JOIN journals j ON j.id=e.journal_id WHERE e.account_id=? ORDER BY e.id DESC LIMIT 100', acct(id)) });

  function accept(m, id) {
    const a = get("SELECT * FROM credit_applications WHERE id=? AND merchant_id=? AND status='offered'", id, m.id);
    if (!a || a.expires_at < now()) throw notFound('application');
    const prod = P().find((p) => p.id === a.product), fid = rid('crf'), loan = !prod.revolving;
    tx(() => {
      if (!run("UPDATE credit_applications SET status='accepted' WHERE id=? AND status='offered'", id).changes) throw new ApiError(409, 'not_offered', 'This offer was already used');
      run('INSERT INTO credit_facilities(id,merchant_id,application_id,product,limit_amount,apr,term_months,instalment,autopay_account,last_interest,next_due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        fid, m.id, id, a.product, a.offered_limit, a.apr, a.term_months, loan ? pmt(a.offered_limit, a.apr, a.term_months) : null, a.account_id, now().slice(0, 7), loan ? addMonth(now()) : null, now());
      if (loan) ledger.post('credit_draw', [{ account: A.bank(a.account_id), merchant: m.id, kind: 'bank', amount: a.offered_limit }, { account: acct(fid), merchant: m.id, kind: 'credit', amount: -a.offered_limit }], { ref: fid, memo: `${prod.name} paid out` });
    });
    return facility(m, fid);
  }
  function draw(m, id, b = {}) {
    const f = get("SELECT * FROM credit_facilities WHERE id=? AND merchant_id=? AND status='active'", id, m.id);
    if (!f) throw notFound('facility');
    if (f.term_months) throw new ApiError(409, 'not_revolving', 'A term loan is paid out once, when you accept it');
    const a = core.getAccount(m.id, b.accountId), amount = num(b.amount, 'amount', { min: 100, max: 1e10 });
    tx(() => {
      if (owed(id) + amount > f.limit_amount) throw new ApiError(409, 'over_limit', 'That is more than your available credit');
      ledger.post('credit_draw', [{ account: A.bank(a.id), merchant: m.id, kind: 'bank', amount }, { account: acct(id), merchant: m.id, kind: 'credit', amount: -amount }], { ref: id, memo: 'Credit drawn' });
    });
    return facility(m, id);
  }
  const post = (f, accountId, amount, memo) => ledger.post('credit_repay', [{ account: A.bank(accountId), merchant: f.merchant_id, kind: 'bank', amount: -amount, floor: 0 }, { account: acct(f.id), merchant: f.merchant_id, kind: 'credit', amount }], { ref: f.id, memo });
  function repay(m, id, b = {}) {
    const f = get("SELECT * FROM credit_facilities WHERE id=? AND merchant_id=? AND status='active'", id, m.id);
    if (!f) throw notFound('facility');
    const a = core.getAccount(m.id, b.accountId);
    tx(() => {
      const o = owed(id), amount = b.amount === undefined ? o : num(b.amount, 'amount', { min: 1, max: 1e10 });
      if (amount <= 0) throw new ApiError(409, 'nothing_owed', 'There is nothing to pay');
      if (amount > o) throw new ApiError(409, 'overpayment', `You only owe ${(o / 100).toFixed(2)}`);
      post(f, a.id, amount, 'Credit repayment');
      if (f.term_months && o - amount === 0) run("UPDATE credit_facilities SET status='closed' WHERE id=?", id);
    });
    return facility(m, id);
  }

  // Run monthly: interest on what is owed, then the automatic instalment on term loans.
  function runDue(at = new Date()) {
    const month = at.toISOString().slice(0, 7); let interest = 0, paid = 0, missed = 0;
    for (const f of all("SELECT * FROM credit_facilities WHERE status='active' AND (last_interest IS NULL OR last_interest<?)", month)) {
      if (run('UPDATE credit_facilities SET last_interest=? WHERE id=? AND (last_interest IS NULL OR last_interest<?)', month, f.id, month).changes !== 1) continue;
      const i = Math.floor((owed(f.id) * f.apr) / 12);
      if (i > 0) { tx(() => ledger.post('credit_interest', [{ account: acct(f.id), merchant: f.merchant_id, kind: 'credit', amount: -i }, { account: 'sys:interest_income', kind: 'system', amount: i }], { ref: f.id, memo: 'Interest' })); interest++; }
    }
    for (const f of all("SELECT * FROM credit_facilities WHERE status='active' AND term_months IS NOT NULL AND next_due<=?", at.toISOString())) {
      const next = addMonth(f.next_due);
      if (run('UPDATE credit_facilities SET next_due=? WHERE id=? AND next_due=?', next, f.id, f.next_due).changes !== 1) continue;
      const amount = Math.min(f.instalment, owed(f.id));
      if (amount <= 0) continue;
      try {
        tx(() => { post(f, f.autopay_account, amount, 'Loan instalment'); if (owed(f.id) === 0) run("UPDATE credit_facilities SET status='closed' WHERE id=?", f.id); });
        paid++;
      } catch (e) {
        run('UPDATE credit_facilities SET next_due=?,missed=missed+1 WHERE id=?', new Date(at.getTime() + 864e5).toISOString(), f.id);
        notify(f.merchant_id, 'credit', 'Loan instalment missed', 'Add money to your account. We will try again tomorrow.'); missed++;
      }
    }
    return { interest, paid, missed };
  }

  /* back office */
  const adminList = () => ({ applications: all('SELECT a.*,m.name merchant FROM credit_applications a JOIN merchants m ON m.id=a.merchant_id ORDER BY a.created_at DESC LIMIT 100').map((a) => ({ ...pubApp(a), merchant: a.merchant })),
    facilities: all('SELECT f.*,m.name merchant FROM credit_facilities f JOIN merchants m ON m.id=f.merchant_id ORDER BY f.created_at DESC LIMIT 100').map((f) => ({ ...pubFac(f), merchant: f.merchant })) });
  function adminDecide(id, b = {}) {
    const a = get("SELECT * FROM credit_applications WHERE id=? AND status IN ('declined','offered')", id);
    if (!a) throw notFound('application');
    if (b.decision === 'decline') { run("UPDATE credit_applications SET status='declined',offered_limit=NULL,reason=? WHERE id=?", String(b.reason || 'Declined after review').slice(0, 200), id); return { id, status: 'declined' }; }
    if (b.decision !== 'approve') throw new ApiError(400, 'invalid_decision', 'decision must be approve or decline');
    const prod = P().find((p) => p.id === a.product), limit = num(b.offeredLimit, 'offeredLimit', { min: config.credit.minOffer, max: prod.max });
    run("UPDATE credit_applications SET status='offered',offered_limit=?,reason=?,expires_at=? WHERE id=?", limit, 'Approved after review', new Date(Date.now() + 7 * 864e5).toISOString(), id);
    notify(a.merchant_id, 'credit', 'Your credit offer is ready', 'Open Credit to accept it.');
    return { id, status: 'offered', offered_limit: limit };
  }
  return { products, apply, listApplications, decline, accept, listFacilities, facility, statement, draw, repay, runDue, adminList, adminDecide, pmt };
};
