const crypto = require('crypto');
const { ApiError, rid, now, sha256, num, text, oneOf, validSaId } = require('./util');
const { A } = require('./ledger');

// Platform back office: onboarding decisions, KYC, merchant control, monitoring, fraud flags, disputes.
module.exports = function buildAdmin({ db, ledger, core, account, config, mail, emit, identity }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const merchant = (id) => { const m = get('SELECT * FROM merchants WHERE id=?', id); if (!m) throw notFound('merchant'); return m; };
  const adminAudit = (actor, mid, action) => run('INSERT INTO audit_log(merchant_id,actor,action,status,created_at) VALUES(?,?,?,?,?)', mid || 'platform', actor, action.slice(0, 160), 200, now());

  function issueAdminKey(label = 'admin', role = 'superadmin') {
    const key = 'mka_' + crypto.randomBytes(24).toString('base64url');
    run('INSERT INTO admin_keys(hash,label,hint,role,created_at) VALUES(?,?,?,?,?)', sha256(key), text(label, 'label', { max: 60 }), key.slice(-4), oneOf(role, 'role', ['superadmin', 'compliance', 'support']), now());
    return key;
  }
  const authenticate = async (req) => {
    const m = /^Bearer (mka_[A-Za-z0-9_-]{20,})$/.exec(req.get('authorization') || '');
    const row = m && get('SELECT label,hint,role FROM admin_keys WHERE hash=? AND revoked=0', sha256(m[1]));
    return row ? { actor: `admin:${row.label}…${row.hint}`, role: row.role } : null;
  };

  /* overview and merchants */
  function overview() {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const pay = get(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) volume, COALESCE(SUM(fee),0) fees FROM payments WHERE status IN ('paid','partially_refunded','refunded') AND created_at>=?`, since);
    const unbalanced = get('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').n;
    return {
      merchants: { total: get('SELECT COUNT(*) n FROM merchants').n, active: get("SELECT COUNT(*) n FROM merchants WHERE status='active'").n, suspended: get("SELECT COUNT(*) n FROM merchants WHERE status='suspended'").n, verified: get('SELECT COUNT(*) n FROM merchants WHERE verified=1').n },
      queue: { applications: get("SELECT COUNT(*) n FROM applications WHERE status='submitted'").n, documents: get("SELECT COUNT(*) n FROM documents WHERE status='pending'").n, fraud_flags: get("SELECT COUNT(*) n FROM fraud_flags WHERE status='open'").n, disputes: get("SELECT COUNT(*) n FROM disputes WHERE status='open'").n, payouts_waiting: get("SELECT COUNT(*) n FROM payouts WHERE status='pending_approval'").n, support: get("SELECT COUNT(*) n FROM support_tickets WHERE status='open'").n },
      last_30_days: { payments: pay.n, volume: pay.volume, processing_fees: pay.fees },
      platform: { fee_revenue: ledger.balance(A.fees), disputes_held: ledger.balance('sys:disputes'), ledger_ok: unbalanced === 0 && get('SELECT COALESCE(SUM(amount),0) s FROM entries').s === 0 },
    };
  }
  const listMerchants = (q = {}) => ({ data: all(`SELECT id,name,verified,status,created_at FROM merchants WHERE (? IS NULL OR name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\') AND (? IS NULL OR status=?) ORDER BY created_at DESC LIMIT 100`,
    q.q ? core.like(q.q) : null, q.q ? core.like(q.q) : null, q.q ? core.like(q.q) : null, q.status || null, q.status || null).map((m) => ({ ...m, verified: !!m.verified, balance: core.balance(m) })) });
  function getMerchant(id) {
    const m = merchant(id);
    return {
      id: m.id, name: m.name, verified: !!m.verified, status: m.status, created_at: m.created_at, profile: account.getProfile(m), balance: core.balance(m), ubos: account.listUbos(m).data, documents: account.listDocuments(m).data,
      counts: { payments: get('SELECT COUNT(*) n FROM payments WHERE merchant_id=?', id).n, open_flags: get("SELECT COUNT(*) n FROM fraud_flags WHERE merchant_id=? AND status='open'", id).n, open_disputes: get("SELECT COUNT(*) n FROM disputes WHERE merchant_id=? AND status='open'", id).n },
    };
  }
  function setStatus(id, status, reason, actor) {
    const m = merchant(id); oneOf(status, 'status', ['active', 'suspended']);
    run('UPDATE merchants SET status=? WHERE id=?', status, id);
    adminAudit(actor, id, `${status === 'suspended' ? 'suspend' : 'reinstate'} merchant: ${reason || 'no reason given'}`);
    account.notify(id, 'account', status === 'suspended' ? 'Account suspended' : 'Account reinstated', reason || '');
    return { id: m.id, status };
  }

  /* KYC */
  const kycQueue = () => ({ data: all("SELECT d.id,d.type,d.filename,d.status,d.created_at,(d.storage_key IS NOT NULL) has_file,m.id merchant_id,m.name merchant FROM documents d JOIN merchants m ON m.id=d.merchant_id WHERE d.status='pending' ORDER BY d.created_at LIMIT 200") });
  const review = (id, status, note, actor) => { const r = account.reviewDocument(id, status, note); adminAudit(actor, get('SELECT merchant_id m FROM documents WHERE id=?', id).m, `document ${status}`); return r; };

  /* transaction monitoring and fraud rules (monitor only: nothing is blocked automatically) */
  function listTransactions(q = {}) {
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
    const rows = all(`SELECT p.id,p.merchant_id,m.name merchant,p.channel,p.amount,p.status,p.customer_email,p.created_at,
        EXISTS(SELECT 1 FROM fraud_flags f WHERE f.payment_id=p.id) flagged FROM payments p JOIN merchants m ON m.id=p.merchant_id
      WHERE p.amount>=? AND (? IS NULL OR p.status=?) AND (? IS NULL OR p.merchant_id=?) AND (? = 0 OR EXISTS(SELECT 1 FROM fraud_flags f WHERE f.payment_id=p.id))
      ORDER BY p.created_at DESC LIMIT ?`, q.min ? parseInt(q.min, 10) || 0 : 0, q.status || null, q.status || null, q.merchant || null, q.merchant || null, ['1', 'true'].includes(String(q.flagged)) ? 1 : 0, limit);
    return { data: rows.map((r) => ({ ...r, flagged: !!r.flagged })) };
  }
  function flag(p, rule, detail) {
    const since = new Date(Date.now() - config.fraud.windowMinutes * 60e3).toISOString();
    if (get('SELECT 1 FROM fraud_flags WHERE merchant_id=? AND rule=? AND created_at>=?', p.merchant_id, rule, since)) return;
    run('INSERT INTO fraud_flags(id,merchant_id,payment_id,rule,detail,created_at) VALUES(?,?,?,?,?,?)', rid('flg'), p.merchant_id, p.id, rule, detail, now());
  }
  function onPayment(p) {
    try {
      const w = config.fraud, since = new Date(Date.now() - w.windowMinutes * 60e3).toISOString();
      if (p.status === 'paid' && p.amount >= w.largeAmount) flag(p, 'large_amount', `Payment of R ${(p.amount / 100).toFixed(2)}`);
      if (p.customer_email) {
        const n = get('SELECT COUNT(*) n FROM payments WHERE merchant_id=? AND lower(customer_email)=lower(?) AND created_at>=?', p.merchant_id, p.customer_email, since).n;
        if (n >= w.velocity) flag(p, 'velocity', `${n} payments from one customer in ${w.windowMinutes} minutes`);
      }
      if (p.status === 'failed') {
        const n = get("SELECT COUNT(*) n FROM payments WHERE merchant_id=? AND status='failed' AND created_at>=?", p.merchant_id, since).n;
        if (n >= w.declineSpike) flag(p, 'decline_spike', `${n} declined payments in ${w.windowMinutes} minutes`);
      }
    } catch { /* monitoring must never break a payment */ }
  }
  const listFlags = (status) => ({ data: all('SELECT f.*,m.name merchant FROM fraud_flags f JOIN merchants m ON m.id=f.merchant_id WHERE (? IS NULL OR f.status=?) ORDER BY f.created_at DESC LIMIT 200', status || null, status || null) });
  function resolveFlag(id, outcome, actor) {
    oneOf(outcome, 'outcome', ['dismissed', 'confirmed']);
    if (!run("UPDATE fraud_flags SET status=? WHERE id=? AND status='open'", outcome, id).changes) throw notFound('flag');
    adminAudit(actor, null, `fraud flag ${outcome}: ${id}`);
    return { id, status: outcome };
  }

  /* disputes and chargebacks: funds are held while a dispute is open */
  function openDispute(b = {}, actor) {
    const p = get('SELECT * FROM payments WHERE id=?', text(b.paymentId, 'paymentId', { max: 60 }));
    if (!p || !['paid', 'partially_refunded'].includes(p.status)) throw new ApiError(409, 'not_disputable', 'Only paid payments can be disputed');
    const held = get("SELECT COALESCE(SUM(amount),0) s FROM disputes WHERE payment_id=? AND status='open'", p.id).s;
    const amount = b.amount === undefined ? p.amount - p.refunded - held : num(b.amount, 'amount', { min: 1, max: p.amount - p.refunded - held });
    if (amount <= 0) throw new ApiError(409, 'not_disputable', 'Nothing left to dispute on this payment');
    const id = rid('dsp');
    tx(() => {
      ledger.post('dispute_hold', [{ account: A.avail(p.merchant_id), merchant: p.merchant_id, kind: 'available', amount: -amount }, { account: 'sys:disputes', kind: 'system', amount }], { ref: id, memo: `Dispute on ${p.id}` });
      run('INSERT INTO disputes(id,merchant_id,payment_id,amount,reason,created_at) VALUES(?,?,?,?,?,?)', id, p.merchant_id, p.id, amount, text(b.reason, 'reason', { optional: true, max: 200 }), now());
    });
    if (actor) adminAudit(actor, p.merchant_id, `open dispute ${id}`);
    account.notify(p.merchant_id, 'dispute', 'Payment disputed', `R ${(amount / 100).toFixed(2)} is on hold. Add your evidence.`);
    emit(p.merchant_id, 'dispute.opened', { id, payment_id: p.id, amount });
    return get('SELECT * FROM disputes WHERE id=?', id);
  }
  const listDisputes = (merchantId, status) => ({ data: all('SELECT * FROM disputes WHERE (? IS NULL OR merchant_id=?) AND (? IS NULL OR status=?) ORDER BY created_at DESC LIMIT 200', merchantId || null, merchantId || null, status || null, status || null) });
  function addEvidence(m, id, body) {
    const t = text(body, 'evidence', { max: 2000 });
    if (!run("UPDATE disputes SET evidence=? WHERE id=? AND merchant_id=? AND status='open'", t, id, m.id).changes) throw notFound('dispute');
    return { id, evidence: t };
  }
  function resolveDispute(id, outcome, actor) {
    oneOf(outcome, 'outcome', ['merchant', 'customer']);
    const d = get("SELECT * FROM disputes WHERE id=? AND status='open'", id);
    if (!d) throw notFound('dispute');
    tx(() => {
      if (outcome === 'merchant') ledger.post('dispute_release', [{ account: 'sys:disputes', kind: 'system', amount: -d.amount }, { account: A.avail(d.merchant_id), merchant: d.merchant_id, kind: 'available', amount: d.amount }], { ref: id, memo: 'Dispute won' });
      else {
        ledger.post('chargeback', [{ account: 'sys:disputes', kind: 'system', amount: -d.amount }, { account: A.clearing, kind: 'system', amount: d.amount }], { ref: id, memo: 'Chargeback' });
        ledger.post('chargeback_fee', [{ account: A.avail(d.merchant_id), merchant: d.merchant_id, kind: 'available', amount: -config.chargebackFee }, { account: A.fees, kind: 'system', amount: config.chargebackFee }], { ref: id, memo: 'Chargeback fee' });
        const p = get('SELECT * FROM payments WHERE id=?', d.payment_id), refunded = p.refunded + d.amount;
        run('UPDATE payments SET refunded=?,status=? WHERE id=?', refunded, refunded >= p.amount ? 'refunded' : 'partially_refunded', p.id);
      }
      run("UPDATE disputes SET status=?,outcome=?,resolved_at=? WHERE id=?", outcome === 'merchant' ? 'won' : 'lost', outcome, now(), id);
    });
    adminAudit(actor, d.merchant_id, `resolve dispute ${id}: ${outcome}`);
    account.notify(d.merchant_id, 'dispute', outcome === 'merchant' ? 'Dispute won' : 'Dispute lost', outcome === 'merchant' ? 'The held money is back in your balance.' : `The payment was returned to the customer. A R ${(config.chargebackFee / 100).toFixed(2)} fee applies.`);
    emit(d.merchant_id, 'dispute.resolved', { id, outcome });
    return get('SELECT * FROM disputes WHERE id=?', id);
  }

  /* onboarding: anyone can apply, a person decides */
  async function apply(b = {}) {
    const email = text(b.email, 'email', { max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'invalid_email', 'email is not valid');
    const idn = text(b.idNumber, 'idNumber', { max: 13 });
    if (!validSaId(idn)) throw new ApiError(400, 'invalid_idNumber', 'That ID number is not valid');
    if (get("SELECT 1 FROM applications WHERE email=? AND status IN ('submitted','approved')", email)) throw new ApiError(409, 'already_applied', 'An application for this email already exists');
    let idStatus = 'unchecked';
    try { idStatus = (await identity.check({ idNumber: idn, fullName: String(b.ownerName || '') })).status; } catch { idStatus = 'unchecked'; }
    const id = rid('app');
    run('INSERT INTO applications(id,business_name,owner_name,id_number,email,phone,identity_status,created_at) VALUES(?,?,?,?,?,?,?,?)', id, text(b.businessName, 'businessName', { max: 100 }), text(b.ownerName, 'ownerName', { max: 100 }), idn, email, text(b.phone, 'phone', { optional: true, max: 20 }), idStatus, now());
    mail(null, email, 'We received your application', 'Thanks for applying. We will review your details and email you once a decision is made.');
    return { id, status: 'submitted' };
  }
  const listApplications = (status) => ({ data: all('SELECT id,business_name,owner_name,email,phone,identity_status,status,merchant_id,note,created_at FROM applications WHERE (? IS NULL OR status=?) ORDER BY created_at DESC LIMIT 200', status || null, status || null) });
  function decide(id, decision, note, actor, override = false) {
    oneOf(decision, 'decision', ['approve', 'reject']);
    const a = get("SELECT * FROM applications WHERE id=? AND status='submitted'", id);
    if (!a) throw notFound('application');
    if (decision === 'reject') {
      run("UPDATE applications SET status='rejected',note=? WHERE id=?", note || null, id);
      mail(null, a.email, 'About your application', note || 'We were unable to approve your application at this time.');
      adminAudit(actor, null, `reject application ${id}`);
      return { id, status: 'rejected' };
    }
    if (a.identity_status === 'refer' && !override) throw new ApiError(409, 'identity_referred', 'The identity check was referred. Review it, then approve with override.');
    const m = core.createMerchant(a.business_name);
    account.updateProfile(m, { business: { legal_name: a.business_name }, personal: { name: a.owner_name, email: a.email, id_number: a.id_number } });
    account.inviteUser(m, { name: a.owner_name, email: a.email, role: 'admin' });
    const apiKey = core.issueApiKey(m.id, 'onboarding', 'admin');
    run("UPDATE applications SET status='approved',merchant_id=?,note=? WHERE id=?", m.id, note || null, id);
    mail(m.id, a.email, 'Your account is approved', 'Your business account is ready. Your account manager will share your sign-in details securely.');
    adminAudit(actor, m.id, `approve application ${id}`);
    return { id, status: 'approved', merchant_id: m.id, api_key: apiKey };   // the key is shown once, hand it over securely
  }
  const auditFeed = (q = {}) => ({ data: all('SELECT id,merchant_id,actor,action,status,created_at FROM audit_log WHERE (? IS NULL OR merchant_id=?) ORDER BY id DESC LIMIT ?', q.merchant || null, q.merchant || null, Math.min(parseInt(q.limit, 10) || 100, 500)) });

  return { issueAdminKey, authenticate, overview, listMerchants, getMerchant, setStatus, kycQueue, review, listTransactions, onPayment, listFlags, resolveFlag, openDispute, listDisputes, addEvidence, resolveDispute, apply, listApplications, decide, auditFeed };
};
