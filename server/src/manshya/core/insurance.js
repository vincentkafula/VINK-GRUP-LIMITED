const { ApiError, rid, now, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

const addMonth = (iso) => { const d = new Date(iso), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString(); };

// Insurance cover (funeral, life, business contents): quotes, monthly premiums, claims. The underwriter is a partner:
// premiums and claims move through ledger accounts so you can settle with them.
module.exports = function buildInsurance({ db, ledger, core, config, notify, emit }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const prods = () => config.insurance.products;

  const products = () => prods().map((p) => ({ id: p.id, name: p.name, covers: p.covers, waiting_days: p.waitingDays, summary: p.summary, example_premium: Math.max(config.insurance.minPremium, Math.ceil(p.covers[0] * p.rate)) }));
  const premiumFor = (p, cover) => Math.max(config.insurance.minPremium, Math.ceil(cover * p.rate));
  function quote(b = {}) {
    const p = prods().find((x) => x.id === b.product);
    if (!p) throw new ApiError(400, 'invalid_product', 'Choose one of the available products');
    const cover = num(b.cover, 'cover', { min: 1, max: 1e10 });
    if (!p.covers.includes(cover)) throw new ApiError(400, 'invalid_cover', 'Choose one of the cover amounts offered');
    return { product: p.id, name: p.name, cover, premium: premiumFor(p, cover), waiting_days: p.waitingDays };
  }
  const pub = (p) => ({ id: p.id, product: p.product, cover: p.cover, premium: p.premium, beneficiary: p.beneficiary, status: p.status, waiting_until: p.waiting_until, next_due: p.next_due, created_at: p.created_at });
  function buy(m, b = {}) {
    const q = quote(b), a = core.getAccount(m.id, b.accountId), id = rid('pol');
    const prod = prods().find((x) => x.id === q.product), waiting = new Date(Date.now() + prod.waitingDays * 864e5).toISOString();
    tx(() => {
      ledger.post('premium', [{ account: A.bank(a.id), merchant: m.id, kind: 'bank', amount: -q.premium, floor: 0 }, { account: 'sys:premiums', kind: 'system', amount: q.premium }], { ref: id, memo: `${q.name} premium` });
      run('INSERT INTO policies(id,merchant_id,account_id,product,cover,premium,beneficiary,waiting_until,next_due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, m.id, a.id, q.product, q.cover, q.premium, text(b.beneficiary, 'beneficiary', { optional: true, max: 80 }), waiting, addMonth(now()), now());
    });
    return pub(get('SELECT * FROM policies WHERE id=?', id));
  }
  const list = (m) => ({ data: all('SELECT * FROM policies WHERE merchant_id=? ORDER BY created_at DESC', m.id).map(pub) });
  const cancel = (m, id) => { if (!run("UPDATE policies SET status='cancelled' WHERE id=? AND merchant_id=? AND status IN ('active','lapsed')", id, m.id).changes) throw notFound('policy'); return { id, status: 'cancelled' }; };

  // Monthly premiums. Three missed months in a row and the policy lapses.
  function runPremiums(at = new Date()) {
    let paid = 0, failed = 0;
    for (const p of all("SELECT * FROM policies WHERE status='active' AND next_due<=?", at.toISOString())) {
      const next = addMonth(p.next_due);
      if (run('UPDATE policies SET next_due=? WHERE id=? AND next_due=?', next, p.id, p.next_due).changes !== 1) continue;
      try {
        tx(() => ledger.post('premium', [{ account: A.bank(p.account_id), merchant: p.merchant_id, kind: 'bank', amount: -p.premium, floor: 0 }, { account: 'sys:premiums', kind: 'system', amount: p.premium }], { ref: p.id, memo: 'Insurance premium' }));
        run('UPDATE policies SET failures=0 WHERE id=?', p.id); paid++;
      } catch {
        const failures = p.failures + 1;
        run('UPDATE policies SET failures=?,next_due=?,status=? WHERE id=?', failures, new Date(at.getTime() + 864e5 * 3).toISOString(), failures >= 3 ? 'lapsed' : 'active', p.id);
        notify(p.merchant_id, 'insurance', failures >= 3 ? 'Your cover has lapsed' : 'Premium not paid', 'Add money to your account to keep your cover.'); failed++;
      }
    }
    return { paid, failed };
  }

  function claim(m, b = {}) {
    const p = get("SELECT * FROM policies WHERE id=? AND merchant_id=? AND status='active'", b.policyId, m.id);
    if (!p) throw notFound('policy');
    const cause = oneOf(b.cause, 'cause', ['natural', 'accident']), amount = num(b.amount, 'amount', { min: 100, max: p.cover }), id = rid('clm');
    const waiting = cause === 'natural' && p.waiting_until > now();
    run('INSERT INTO claims(id,merchant_id,policy_id,cause,description,amount,status,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, m.id, p.id, cause, text(b.description, 'description', { max: 1000 }), amount,
      waiting ? 'rejected' : 'submitted', waiting ? `Natural causes are covered from ${p.waiting_until.slice(0, 10)}` : null, now());
    return get('SELECT * FROM claims WHERE id=?', id);
  }
  const listClaims = (m) => ({ data: all('SELECT * FROM claims WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id) });
  const adminClaims = (status) => ({ data: all('SELECT c.*,m.name merchant,p.product FROM claims c JOIN merchants m ON m.id=c.merchant_id JOIN policies p ON p.id=c.policy_id WHERE (? IS NULL OR c.status=?) ORDER BY c.created_at DESC LIMIT 100', status || null, status || null) });
  function decide(id, b = {}) {
    const c = get("SELECT * FROM claims WHERE id=? AND status='submitted'", id);
    if (!c) throw notFound('claim');
    if (b.decision === 'decline') { run("UPDATE claims SET status='declined',reason=?,decided_at=? WHERE id=?", String(b.reason || 'Declined after review').slice(0, 200), now(), id); notify(c.merchant_id, 'insurance', 'Claim declined', b.reason || ''); return { id, status: 'declined' }; }
    if (b.decision !== 'approve') throw new ApiError(400, 'invalid_decision', 'decision must be approve or decline');
    const p = get('SELECT * FROM policies WHERE id=?', c.policy_id), pay = b.amount === undefined ? c.amount : num(b.amount, 'amount', { min: 100, max: Math.min(c.amount, p.cover) });
    tx(() => {
      if (!run("UPDATE claims SET status='paid',paid=?,decided_at=? WHERE id=? AND status='submitted'", pay, now(), id).changes) throw new ApiError(409, 'already_decided', 'This claim was already decided');
      ledger.post('claim', [{ account: 'sys:claims_pool', kind: 'system', amount: -pay }, { account: A.bank(p.account_id), merchant: c.merchant_id, kind: 'bank', amount: pay }], { ref: id, memo: 'Insurance claim paid' });
    });
    notify(c.merchant_id, 'insurance', 'Claim paid', `R ${(pay / 100).toFixed(2)} was paid into your account.`);
    return { id, status: 'paid', paid: pay };
  }
  return { products, quote, buy, list, cancel, runPremiums, claim, listClaims, adminClaims, decide };
};
