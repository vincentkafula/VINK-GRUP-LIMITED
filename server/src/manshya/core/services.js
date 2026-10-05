const crypto = require('crypto');
const { ApiError, rid, now, sha256, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

module.exports = function buildServices({ db, ledger, gateways, rails, config, emit, hooks = {} }) {
  const tx = (fn) => db.transaction(fn).immediate();
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const notFound = (what) => new ApiError(404, `${what}_not_found`, `${what.replace('_', ' ')} not found`);

  /* ---------- merchants, keys, accounts ---------- */
  function createMerchant(name, { id, verified = false } = {}) {
    id = id || rid('mer');
    run('INSERT INTO merchants(id,name,verified,created_at) VALUES(?,?,?,?)', id, text(name, 'name'), verified ? 1 : 0, now());
    createBankAccount(id, { name: 'Business current', kind: 'current' });
    return get('SELECT * FROM merchants WHERE id=?', id);
  }
  function issueApiKey(merchantId, label = 'default', role = 'admin') {
    const key = `mk_${config.mode}_${crypto.randomBytes(24).toString('base64url')}`;
    run('INSERT INTO api_keys(hash,merchant_id,label,role,hint,created_at) VALUES(?,?,?,?,?,?)', sha256(key), merchantId, label, role, key.slice(-4), now());
    return key; // shown once; only the hash is stored
  }
  const revokeApiKeys = (merchantId, label) =>
    run('UPDATE api_keys SET revoked=1 WHERE merchant_id=? AND (? IS NULL OR label=?)', merchantId, label || null, label || null);

  function createBankAccount(merchantId, { name = 'Business current', kind = 'current' } = {}) {
    const id = rid('acc');
    let number;
    do { number = String(crypto.randomInt(1e9, 1e10)); } while (get('SELECT 1 FROM bank_accounts WHERE number=?', number));
    run('INSERT INTO bank_accounts(id,merchant_id,name,number,kind,created_at) VALUES(?,?,?,?,?,?)',
      id, merchantId, text(name, 'name', { max: 60 }), number, oneOf(kind, 'kind', ['current', 'savings']), now());
    return getAccount(merchantId, id);
  }
  function getAccount(merchantId, id) {
    const a = get('SELECT * FROM bank_accounts WHERE id=? AND merchant_id=?', id, merchantId);
    if (!a) throw notFound('account');
    return { ...a, balance: ledger.balance(A.bank(id)) };
  }
  const listAccounts = (m) => all('SELECT id FROM bank_accounts WHERE merchant_id=? ORDER BY created_at', m.id).map((r) => getAccount(m.id, r.id));

  /* ---------- fees and balances ---------- */
  const feeFor = (channel, amount) => {
    const f = config.fees[channel];
    return Math.min(amount, Math.round(amount * f.pct) + f.fixed);
  };
  const reserveRate = (m) => (m.verified ? config.reservePctVerified : config.reservePct);

  function balance(m) {
    const available = ledger.balance(A.avail(m.id)), retained = ledger.balance(A.ret(m.id));
    return {
      currency: 'ZAR', total: available + retained, retained, available,
      payout_fee: config.payoutFee, available_for_payout: Math.max(0, available - config.payoutFee),
    };
  }

  /* ---------- payments ---------- */
  const publicPayment = (p) => ({
    id: p.id, channel: p.channel, method: p.method, amount: p.amount, fee: p.fee, refunded: p.refunded,
    currency: p.currency, status: p.status, failure_reason: p.failure_reason, reference: p.reference,
    customer: { name: p.customer_name, email: p.customer_email }, device_id: p.device_id, staff_id: p.staff_id,
    items: p.items ? JSON.parse(p.items) : null,
    created_at: p.created_at, settled_at: p.settled_at,
  });
  function getPayment(m, id) {
    const p = get('SELECT * FROM payments WHERE id=? AND merchant_id=?', id, m.id);
    if (!p) throw notFound('payment');
    return publicPayment(p);
  }
  const like = (s) => '%' + String(s).slice(0, 60).replace(/[\\%_]/g, '\\$&') + '%';
  function listPayments(m, q = {}) {
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
    const term = q.q ? like(q.q) : null;
    const rows = all(
      `SELECT * FROM payments WHERE merchant_id=? AND (? IS NULL OR status=?) AND (? IS NULL OR channel=?)
       AND (? IS NULL OR created_at<?)
       AND (? IS NULL OR reference LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
       ORDER BY created_at DESC LIMIT ?`,
      m.id, q.status || null, q.status || null, q.channel || null, q.channel || null, q.before || null, q.before || null,
      term, term, term, term, term, limit);
    return { data: rows.map(publicPayment), next_before: rows.length === limit ? rows[rows.length - 1].created_at : null };
  }

  async function createPayment(m, b = {}) {
    const channel = oneOf(b.channel || 'online', 'channel', ['online', 'pos']);
    const method = oneOf(b.method || 'card', 'method', ['card', 'eft', 'qr']);
    if (JSON.parse(m.settings || '{}').payment_methods?.[method] === false)
      throw new ApiError(400, 'method_disabled', 'This payment method is turned off in your settings');
    let amountIn = b.amount, items = null, staffId = null;
    if (channel === 'pos') {
      if (Array.isArray(b.items) && b.items.length) {          // price from the catalogue, never from the client
        if (b.items.length > 50) throw new ApiError(400, 'invalid_items', 'Too many items');
        let total = 0;
        items = b.items.map((it) => {
          const prod = get('SELECT * FROM products WHERE id=? AND merchant_id=? AND active=1', it && it.productId, m.id);
          if (!prod) throw notFound('product');
          const qty = num(it.qty === undefined ? 1 : it.qty, 'qty', { min: 1, max: 999 });
          total += prod.price * qty;
          return { productId: prod.id, name: prod.name, qty, price: prod.price };
        });
        amountIn = total;
      }
      if (b.staffId) {
        const st = get("SELECT id FROM staff WHERE id=? AND merchant_id=? AND status='active'", b.staffId, m.id);
        if (!st) throw notFound('staff');
        staffId = st.id;
      }
    }
    const amount = num(amountIn, 'amount', { min: 100, max: 100000000 });
    const gatewayName = b.gateway || config.defaultGateway;
    const gw = gateways[gatewayName];
    if (!gw) throw new ApiError(400, 'invalid_gateway', 'Unknown gateway');
    let deviceId = null;
    if (channel === 'pos') {
      const d = get('SELECT * FROM devices WHERE id=? AND merchant_id=? AND status=?', b.deviceId, m.id, 'active');
      if (!d) throw notFound('device');
      deviceId = d.id;
      run('UPDATE devices SET last_seen=? WHERE id=?', now(), d.id);
    }
    const c = b.customer || {};
    const p = {
      id: rid('pay'), merchant_id: m.id, channel, method, amount, currency: 'ZAR', status: 'pending',
      reference: text(b.reference, 'reference', { optional: true, max: 64 }),
      customer_name: text(c.name, 'customer.name', { optional: true }),
      customer_email: text(c.email, 'customer.email', { optional: true }),
      gateway: gatewayName, device_id: deviceId, staff_id: staffId, items: items ? JSON.stringify(items) : null, created_at: now(),
    };
    run(`INSERT INTO payments(id,merchant_id,channel,method,amount,currency,status,reference,customer_name,customer_email,gateway,device_id,staff_id,items,created_at)
         VALUES(@id,@merchant_id,@channel,@method,@amount,@currency,@status,@reference,@customer_name,@customer_email,@gateway,@device_id,@staff_id,@items,@created_at)`, p);
    let r;
    try {
      r = await gw.createCharge({ paymentId: p.id, amount, currency: 'ZAR', method, channel, reference: p.reference, customer: c, paymentToken: b.paymentToken });
    } catch (e) {
      failPayment(p.id, 'gateway_error');
      throw new ApiError(502, 'gateway_error', 'The payment gateway could not process this payment');
    }
    run('UPDATE payments SET gateway_ref=? WHERE id=?', r.gatewayRef || null, p.id);
    if (r.status === 'paid') settlePayment(p.id);
    else if (r.status === 'failed') failPayment(p.id, r.reason || 'declined');
    const out = getPayment(m, p.id);
    if (r.redirectUrl) out.redirect_url = r.redirectUrl;
    return out;
  }

  // Idempotent: only a 'pending' payment can settle, and only once.
  function settlePayment(paymentId) {
    let done = null;
    tx(() => {
      const p = get('SELECT * FROM payments WHERE id=?', paymentId);
      if (!p || p.status !== 'pending') return;
      const m = get('SELECT * FROM merchants WHERE id=?', p.merchant_id);
      const fee = feeFor(p.channel, p.amount);
      const retained = Math.round((p.amount - fee) * reserveRate(m));
      const net = p.amount - fee - retained;
      ledger.post('payment', [
        { account: A.clearing, amount: -p.amount, kind: 'system' },
        { account: A.avail(m.id), merchant: m.id, kind: 'available', amount: net },
        { account: A.ret(m.id), merchant: m.id, kind: 'retained', amount: retained },
        { account: A.fees, amount: fee, kind: 'system' },
      ], { ref: p.id, memo: `Payment ${p.reference || p.id}` });
      run("UPDATE payments SET status='paid',fee=?,settled_at=? WHERE id=?", fee, now(), p.id);
      run("UPDATE payment_requests SET status='paid' WHERE payment_id=?", p.id);
      done = p.id;
    });
    if (done) { const p = get('SELECT * FROM payments WHERE id=?', done); emit(p.merchant_id, 'payment.paid', publicPayment(p)); if (hooks.payment) hooks.payment(p); }
  }
  function failPayment(paymentId, reason) {
    const r = run("UPDATE payments SET status='failed',failure_reason=? WHERE id=? AND status='pending'", reason, paymentId);
    if (r.changes) {
      const p = get('SELECT * FROM payments WHERE id=?', paymentId);
      run("UPDATE payment_requests SET status='open',payment_id=NULL WHERE payment_id=? AND status='processing'", paymentId);
      emit(p.merchant_id, 'payment.failed', publicPayment(p));
      if (hooks.payment) hooks.payment(p);
    }
  }

  // Ledger first (reserves the money atomically), then the gateway, with compensation on failure.
  async function refundPayment(m, paymentId, b = {}) {
    const p = get('SELECT * FROM payments WHERE id=? AND merchant_id=?', paymentId, m.id);
    if (!p) throw notFound('payment');
    const remaining = p.amount - p.refunded;
    if (!['paid', 'partially_refunded'].includes(p.status) || remaining <= 0)
      throw new ApiError(409, 'not_refundable', 'This payment cannot be refunded');
    const amount = b.amount === undefined ? remaining : num(b.amount, 'amount', { min: 1, max: remaining });
    tx(() => {
      const cur = get('SELECT * FROM payments WHERE id=?', p.id);
      if (!['paid', 'partially_refunded'].includes(cur.status) || cur.amount - cur.refunded < amount)
        throw new ApiError(409, 'not_refundable', 'This payment cannot be refunded');
      ledger.post('refund', [
        { account: A.avail(m.id), merchant: m.id, kind: 'available', amount: -amount, floor: 0 },
        { account: A.clearing, amount, kind: 'system' },
      ], { ref: p.id, memo: `Refund of ${p.id}` });
      const refunded = cur.refunded + amount;
      run('UPDATE payments SET refunded=?,status=? WHERE id=?', refunded, refunded === cur.amount ? 'refunded' : 'partially_refunded', p.id);
    });
    try {
      await gateways[p.gateway].refund({ gatewayRef: p.gateway_ref, amount, currency: p.currency });
    } catch {
      tx(() => {
        ledger.post('refund_reversal', [
          { account: A.avail(m.id), merchant: m.id, kind: 'available', amount },
          { account: A.clearing, amount: -amount, kind: 'system' },
        ], { ref: p.id });
        const cur = get('SELECT * FROM payments WHERE id=?', p.id);
        const left = cur.refunded - amount;
        run('UPDATE payments SET refunded=?,status=? WHERE id=?', left, left === 0 ? 'paid' : 'partially_refunded', p.id);
      });
      throw new ApiError(502, 'gateway_error', 'The gateway rejected the refund. Nothing was refunded.');
    }
    const out = getPayment(m, p.id);
    emit(m.id, 'payment.refunded', out);
    return out;
  }

  // Called by the gateway webhook route after the signature has been verified.
  function applyGatewayEvent(gatewayName, evt) {
    const p = get('SELECT * FROM payments WHERE gateway=? AND gateway_ref=?', gatewayName, evt.gatewayRef);
    if (!p) return false;
    if (evt.amount !== undefined && evt.amount !== p.amount) return false; // never settle on an amount mismatch
    if (evt.status === 'paid') settlePayment(p.id);
    else if (evt.status === 'failed') failPayment(p.id, evt.reason || 'declined');
    return true;
  }

  /* ---------- payment requests (pay links) ---------- */
  function createRequest(m, b = {}) {
    const days = b.expiresInDays === undefined ? 7 : num(b.expiresInDays, 'expiresInDays', { min: 1, max: 60 });
    const r = {
      id: rid('prq'), merchant_id: m.id, token: crypto.randomBytes(18).toString('base64url'),
      amount: num(b.amount, 'amount', { min: 100, max: 100000000 }),
      description: text(b.description, 'description', { optional: true, max: 140 }),
      customer_email: text(b.customerEmail, 'customerEmail', { optional: true }),
      status: 'open', created_at: now(), expires_at: new Date(Date.now() + days * 864e5).toISOString(),
    };
    run(`INSERT INTO payment_requests(id,merchant_id,token,amount,description,customer_email,status,created_at,expires_at)
         VALUES(@id,@merchant_id,@token,@amount,@description,@customer_email,@status,@created_at,@expires_at)`, r);
    return publicRequest(r);
  }
  const publicRequest = (r) => ({
    id: r.id, amount: r.amount, description: r.description, customer_email: r.customer_email, status: r.status,
    payment_id: r.payment_id || null, token: r.token, created_at: r.created_at, expires_at: r.expires_at,
  });
  function listRequests(m, q = {}) {
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 100);
    const term = q.q ? like(q.q) : null, open = q.status === 'open_or_processing';
    const rows = all(`SELECT * FROM payment_requests WHERE merchant_id=?
      AND (? IS NULL OR status=?) AND (? = 0 OR status IN ('open','processing')) AND (? = 0 OR status NOT IN ('open','processing'))
      AND (? IS NULL OR description LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
      ORDER BY created_at DESC LIMIT ?`,
      m.id, open || q.history ? null : q.status || null, open || q.history ? null : q.status || null, open ? 1 : 0, q.history ? 1 : 0, term, term, term, term, limit);
    return { data: rows.map(publicRequest) };
  }
  const cancelRequest = (m, id) => {
    const r = run("UPDATE payment_requests SET status='cancelled' WHERE id=? AND merchant_id=? AND status='open'", id, m.id);
    if (!r.changes) throw new ApiError(409, 'not_cancellable', 'Only open requests can be cancelled');
    return { id, status: 'cancelled' };
  };
  function getRequestByToken(token) {
    const r = get('SELECT * FROM payment_requests WHERE token=?', String(token));
    if (!r) throw notFound('payment_request');
    const m = get('SELECT name FROM merchants WHERE id=?', r.merchant_id);
    return { merchant: m.name, amount: r.amount, description: r.description, status: r.status, expired: r.expires_at < now() };
  }
  async function payRequest(token, b = {}) {
    const r = get('SELECT * FROM payment_requests WHERE token=?', String(token));
    if (!r) throw notFound('payment_request');
    if (r.expires_at < now()) throw new ApiError(410, 'expired', 'This payment request has expired');
    // Atomically claim the request so it can only be paid once.
    if (!run("UPDATE payment_requests SET status='processing' WHERE id=? AND status='open'", r.id).changes)
      throw new ApiError(409, 'not_payable', 'This payment request is no longer open');
    const m = get('SELECT * FROM merchants WHERE id=?', r.merchant_id);
    let p;
    try {
      p = await createPayment(m, {
        amount: r.amount, method: b.method, reference: r.description || r.id, paymentToken: b.paymentToken,
        customer: { name: b.name, email: b.email || r.customer_email },
      });
    } catch (e) { run("UPDATE payment_requests SET status='open' WHERE id=?", r.id); throw e; }
    if (p.status === 'failed') run("UPDATE payment_requests SET status='open',payment_id=NULL WHERE id=?", r.id);
    else run('UPDATE payment_requests SET payment_id=?,status=? WHERE id=?', p.id, p.status === 'paid' ? 'paid' : 'processing', r.id);
    return { payment: p, status: p.status };
  }

  /* ---------- rails helper with compensation ---------- */
  async function sendOnRail({ table, id, lines, amount, beneficiary, reference, merchantId }) {
    try {
      const r = await rails.send({ amount, beneficiary, reference });
      run(`UPDATE ${table} SET status=?,rail_ref=? WHERE id=?`, r.status === 'completed' ? 'completed' : 'processing', r.railRef || null, id);
    } catch {
      tx(() => {
        ledger.post('reversal', ledger.reverse(lines), { ref: id, memo: 'Reversal: bank rail failure' });
        run(`UPDATE ${table} SET status='failed' WHERE id=?`, id);
      });
      emit(merchantId, `${table === 'payouts' ? 'payout' : 'transfer'}.failed`, { id });
      throw new ApiError(502, 'rail_error', 'The bank could not process this transfer. Your money was returned.');
    }
  }

  /* ---------- payouts ---------- */
  const publicPayout = (p) => ({
    id: p.id, gross: p.gross, fee: p.fee, net: p.net, status: p.status,
    destination: { type: p.destination_type, ref: p.destination_ref }, created_at: p.created_at,
  });
  const listPayouts = (m) => ({ data: all('SELECT * FROM payouts WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id).map(publicPayout) });

  const payoutLines = (m, p) => [
    { account: A.avail(m.id), merchant: m.id, kind: 'available', amount: -p.gross, floor: 0 },
    { account: A.fees, amount: p.fee, kind: 'system' },
    p.destination_type === 'bank_account' ? { account: A.bank(p.destination_ref), merchant: m.id, kind: 'bank', amount: p.net } : { account: A.out, kind: 'system', amount: p.net },
  ];
  // Money moves here. `isNew` rows are inserted in the same transaction as the ledger entry.
  async function executePayout(m, p, isNew) {
    const lines = payoutLines(m, p), ben = p.destination_type === 'beneficiary' ? getBeneficiary(m.id, p.destination_ref) : null;
    tx(() => {
      if (!isNew && get('SELECT status FROM payouts WHERE id=?', p.id).status !== 'pending_approval') throw new ApiError(409, 'not_pending', 'This payout is no longer waiting for approval');
      ledger.post('payout', lines, { ref: p.id, memo: 'Payout' });
      const status = ben ? 'processing' : 'completed';
      if (isNew) run('INSERT INTO payouts(id,merchant_id,gross,fee,net,status,destination_type,destination_ref,requested_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', p.id, m.id, p.gross, p.fee, p.net, status, p.destination_type, p.destination_ref, p.requested_by || null, now());
      else run('UPDATE payouts SET status=? WHERE id=?', status, p.id);
    });
    if (ben) await sendOnRail({ table: 'payouts', id: p.id, lines, amount: p.net, beneficiary: ben, reference: p.id, merchantId: m.id });
    const out = publicPayout(get('SELECT * FROM payouts WHERE id=?', p.id));
    emit(m.id, 'payout.created', out);
    return out;
  }
  // opts.rank is the caller's role rank (0 viewer .. 3 owner). Large payouts from finance users wait for an admin.
  async function requestPayout(m, b = {}, opts = {}) {
    const d = b.destination || {}, type = oneOf(d.type, 'destination.type', ['bank_account', 'beneficiary']), fee = config.payoutFee;
    const gross = b.amount === undefined ? balance(m).available : num(b.amount, 'amount', { min: 1, max: 1e10 });
    if (gross <= fee) throw new ApiError(409, 'below_minimum', 'The balance is too low to cover the payout fee');
    let ref;
    if (type === 'bank_account') { getAccount(m.id, d.accountId); ref = d.accountId; } else ref = getBeneficiary(m.id, d.beneficiaryId).id;
    const p = { id: rid('po'), gross, fee, net: gross - fee, destination_type: type, destination_ref: ref, requested_by: opts.actor };
    if (opts.rank !== undefined && opts.rank < 2 && gross > config.payoutApprovalThreshold) {
      run("INSERT INTO payouts(id,merchant_id,gross,fee,net,status,destination_type,destination_ref,requested_by,created_at) VALUES(?,?,?,?,?,'pending_approval',?,?,?,?)", p.id, m.id, gross, fee, p.net, type, ref, opts.actor || null, now());
      const out = publicPayout(get('SELECT * FROM payouts WHERE id=?', p.id));
      emit(m.id, 'payout.pending_approval', out);
      return out;
    }
    return executePayout(m, p, true);
  }
  async function approvePayout(m, id, opts = {}) {
    const p = get("SELECT * FROM payouts WHERE id=? AND merchant_id=? AND status='pending_approval'", id, m.id);
    if (!p) throw notFound('payout');
    if (p.requested_by && p.requested_by === opts.actor && opts.rank < 3) throw new ApiError(403, 'second_person_needed', 'Someone else must approve a payout you requested');
    return executePayout(m, p, false);
  }
  function rejectPayout(m, id) {
    if (!run("UPDATE payouts SET status='rejected' WHERE id=? AND merchant_id=? AND status='pending_approval'", id, m.id).changes) throw notFound('payout');
    return { id, status: 'rejected' };
  }

  /* ---------- point of sale ---------- */
  const publicDevice = (d, extra = {}) => ({
    id: d.id, name: d.name, status: d.status, last_seen: d.last_seen,
    online: !!d.last_seen && Date.now() - Date.parse(d.last_seen) < 5 * 60e3, ...extra,
  });
  function createDevice(m, b = {}) {
    const id = rid('dev');
    run('INSERT INTO devices(id,merchant_id,name,created_at,last_seen) VALUES(?,?,?,?,?)', id, m.id, text(b.name, 'name', { max: 60 }), now(), now());
    return publicDevice(get('SELECT * FROM devices WHERE id=?', id));
  }
  const listDevices = (m) => ({ data: all('SELECT * FROM devices WHERE merchant_id=? ORDER BY created_at', m.id).map((d) => publicDevice(d)) });
  function heartbeat(m, id) {
    if (!run('UPDATE devices SET last_seen=? WHERE id=? AND merchant_id=?', now(), id, m.id).changes) throw notFound('device');
    return { ok: true };
  }

  /* ---------- banking ---------- */
  function getBeneficiary(merchantId, id) {
    const b = get('SELECT * FROM beneficiaries WHERE id=? AND merchant_id=?', id, merchantId);
    if (!b) throw notFound('beneficiary');
    return b;
  }
  function createBeneficiary(m, b = {}) {
    const acct = text(b.accountNumber, 'accountNumber', { max: 16 });
    if (!/^\d{6,16}$/.test(acct)) throw new ApiError(400, 'invalid_accountNumber', 'accountNumber must be 6 to 16 digits');
    const branch = text(b.branchCode, 'branchCode', { optional: true, max: 6 });
    if (branch && !/^\d{6}$/.test(branch)) throw new ApiError(400, 'invalid_branchCode', 'branchCode must be 6 digits');
    const id = rid('ben');
    run('INSERT INTO beneficiaries(id,merchant_id,name,bank,account_number,branch_code,created_at) VALUES(?,?,?,?,?,?,?)',
      id, m.id, text(b.name, 'name', { max: 80 }), text(b.bank, 'bank', { max: 60 }), acct, branch, now());
    return getBeneficiary(m.id, id);
  }
  const listBeneficiaries = (m) => ({ data: all('SELECT * FROM beneficiaries WHERE merchant_id=? ORDER BY name', m.id) });

  async function transfer(m, b = {}) {
    const kind = oneOf(b.type, 'type', ['own', 'internal', 'beneficiary']);
    const amount = num(b.amount, 'amount', { min: 100, max: config.bank.perTransferLimit });
    const from = getAccount(m.id, b.fromAccountId);
    const reference = text(b.reference, 'reference', { optional: true, max: 35 });
    let toLine, ben = null, toRef;
    if (kind === 'own') {
      const to = getAccount(m.id, b.toAccountId);
      if (to.id === from.id) throw new ApiError(400, 'same_account', 'Choose a different destination account');
      toLine = { account: A.bank(to.id), merchant: m.id, kind: 'bank' }; toRef = to.id;
    } else if (kind === 'internal') {
      const to = get('SELECT * FROM bank_accounts WHERE number=?', text(b.accountNumber, 'accountNumber', { max: 20 }));
      if (!to) throw notFound('account');
      if (to.id === from.id) throw new ApiError(400, 'same_account', 'Choose a different destination account');
      toLine = { account: A.bank(to.id), merchant: to.merchant_id, kind: 'bank' }; toRef = to.number;
    } else {
      ben = getBeneficiary(m.id, b.beneficiaryId);
      toLine = { account: A.out, kind: 'system' }; toRef = ben.id;
    }
    const id = rid('trf');
    const lines = [{ account: A.bank(from.id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { ...toLine, amount }];
    tx(() => {
      if (ben) {
        const today = get(`SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE merchant_id=? AND kind='beneficiary' AND status!='failed' AND substr(created_at,1,10)=?`, m.id, now().slice(0, 10)).s;
        if (today + amount > config.bank.dailyExternalLimit) throw new ApiError(409, 'limit_exceeded', 'This would exceed your daily limit for payments to other banks');
        const refused = config.limitGuard && config.limitGuard({ merchantId: m.id, verified: !!get('SELECT verified FROM merchants WHERE id=?', m.id)?.verified, channel: 'transfer_out', amount, usedToday: today });
        if (refused) throw new ApiError(409, 'limit_exceeded', refused);
      }
      ledger.post('transfer', lines, { ref: id, memo: reference || (ben ? `To ${ben.name}` : 'Transfer') });
      run('INSERT INTO transfers(id,merchant_id,from_account,kind,to_ref,amount,reference,status,category,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id, m.id, from.id, kind, toRef, amount, reference, ben ? 'processing' : 'completed', text(b.category, 'category', { optional: true, max: 30 }) || (kind === 'own' ? 'Own transfer' : 'Payments'), now());
    });
    if (ben) await sendOnRail({ table: 'transfers', id, lines, amount, beneficiary: ben, reference: reference || id, merchantId: m.id });
    const out = get('SELECT * FROM transfers WHERE id=?', id);
    emit(m.id, 'transfer.created', out);
    return out;
  }
  const listTransfers = (m) => ({ data: all('SELECT * FROM transfers WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id) });

  function statement(m, accountId, q = {}) {
    getAccount(m.id, accountId);
    const from = typeof q.from === 'string' ? q.from.slice(0, 30) : null, to = typeof q.to === 'string' ? q.to.slice(0, 30) : null;
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);
    const rows = all(`SELECT date,kind,memo,ref,amount,balance FROM (
        SELECT e.id,j.created_at date,j.kind,j.memo,j.ref,e.amount,SUM(e.amount) OVER (ORDER BY e.id) balance
        FROM entries e JOIN journals j ON j.id=e.journal_id WHERE e.account_id=?)
      WHERE (? IS NULL OR date>=?) AND (? IS NULL OR date<=?) ORDER BY id DESC LIMIT ?`,
      A.bank(accountId), from, from, to, to, limit);
    return { account_id: accountId, data: rows };
  }

  // Card state only. Real issuing needs a BIN sponsor / issuer processor: plug it in here.
  const publicCard = (c) => ({ id: c.id, account_id: c.account_id, brand: c.brand, last4: c.last4, limit: c.spend_limit, status: c.status });
  function issueCard(m, b = {}) {
    getAccount(m.id, b.accountId);
    const id = rid('card');
    run('INSERT INTO cards(id,merchant_id,account_id,brand,last4,spend_limit,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
      id, m.id, b.accountId, 'Visa', String(crypto.randomInt(0, 10000)).padStart(4, '0'),
      b.limit === undefined ? 1200000 : num(b.limit, 'limit', { min: 0, max: 1e9 }), 'active', now());
    return publicCard(get('SELECT * FROM cards WHERE id=?', id));
  }
  const listCards = (m) => ({ data: all('SELECT * FROM cards WHERE merchant_id=? ORDER BY created_at', m.id).map(publicCard) });
  function updateCard(m, id, b = {}) {
    const c = get('SELECT * FROM cards WHERE id=? AND merchant_id=?', id, m.id);
    if (!c) throw notFound('card');
    const status = b.status === undefined ? c.status : oneOf(b.status, 'status', ['active', 'frozen']);
    const limit = b.limit === undefined ? c.spend_limit : num(b.limit, 'limit', { min: 0, max: 1e9 });
    run('UPDATE cards SET status=?,spend_limit=? WHERE id=?', status, limit, id);
    return publicCard(get('SELECT * FROM cards WHERE id=?', id));
  }

  /* ---------- dashboards ---------- */
  const prevMonth = (mo) => { let [y, n] = mo.split('-').map(Number); n -= 1; if (!n) { n = 12; y -= 1; } return `${y}-${String(n).padStart(2, '0')}`; };
  const PAID = "('paid','partially_refunded','refunded')";
  function daily(mid, channel, month) {
    return all(`SELECT CAST(substr(created_at,9,2) AS INTEGER) day, SUM(amount) total FROM payments
      WHERE merchant_id=? AND channel=? AND status IN ${PAID} AND substr(created_at,1,7)=? GROUP BY day ORDER BY day`, mid, channel, month);
  }
  function dashOnline(m, monthQ) {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthQ || '') ? monthQ : now().slice(0, 7);
    const s = get(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) total, COUNT(DISTINCT lower(customer_email)) shoppers FROM payments
      WHERE merchant_id=? AND channel='online' AND status IN ${PAID} AND substr(created_at,1,7)=?`, m.id, month);
    return {
      month, previous_month: prevMonth(month),
      merchant: { id: m.id, name: m.name, verified: !!m.verified },
      stats: { unique_shoppers: s.shoppers, total_transactions: s.n, total_amount: s.total, avg_value: s.n ? Math.round(s.total / s.n) : 0 },
      balance: balance(m),
      series: { current: daily(m.id, 'online', month), previous: daily(m.id, 'online', prevMonth(month)) },
      recent: all("SELECT * FROM payments WHERE merchant_id=? AND channel='online' ORDER BY created_at DESC LIMIT 5", m.id).map(publicPayment),
    };
  }
  function dashPos(m) {
    const today = now().slice(0, 10);
    const t = get(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) total FROM payments WHERE merchant_id=? AND channel='pos' AND status IN ${PAID} AND substr(created_at,1,10)=?`, m.id, today);
    const declined = get("SELECT COUNT(*) n FROM payments WHERE merchant_id=? AND channel='pos' AND status='failed' AND substr(created_at,1,10)=?", m.id, today).n;
    const devices = all(`SELECT d.*, COALESCE(SUM(CASE WHEN p.status IN ${PAID} THEN p.amount END),0) today_total,
      COUNT(CASE WHEN p.status IN ${PAID} THEN 1 END) today_count FROM devices d
      LEFT JOIN payments p ON p.device_id=d.id AND substr(p.created_at,1,10)=? WHERE d.merchant_id=? GROUP BY d.id ORDER BY d.created_at`, today, m.id)
      .map((d) => publicDevice(d, { today_total: d.today_total, today_count: d.today_count }));
    return { today: { sales: t.total, transactions: t.n, declined, fees: Math.round(t.total * config.fees.pos.pct) }, devices };
  }
  function dashBank(m) {
    const accounts = listAccounts(m);
    const activity = all(`SELECT j.created_at date,j.kind,j.memo,e.amount,a.name account FROM entries e
      JOIN journals j ON j.id=e.journal_id JOIN bank_accounts a ON e.account_id='bank:'||a.id
      WHERE a.merchant_id=? ORDER BY e.id DESC LIMIT 8`, m.id);
    return { total: accounts.reduce((s, a) => s + a.balance, 0), accounts, activity, cards: listCards(m).data };
  }

  return {
    createMerchant, issueApiKey, revokeApiKeys, createBankAccount, getAccount, listAccounts, balance,
    createPayment, getPayment, listPayments, refundPayment, settlePayment, applyGatewayEvent,
    createRequest, listRequests, cancelRequest, getRequestByToken, payRequest,
    requestPayout, approvePayout, rejectPayout, sendOnRail, listPayouts, createDevice, listDevices, heartbeat,
    profileEmail: (m) => { try { const e = (JSON.parse(get('SELECT profile FROM merchants WHERE id=?', m.id).profile || '{}').personal || {}).email; return e ? e.toLowerCase() : null; } catch { return null; } },
    createBeneficiary, listBeneficiaries, getBeneficiary, like, hasGateway: (n) => !!gateways[n], transfer, listTransfers, statement,
    issueCard, listCards, updateCard, dashOnline, dashPos, dashBank,
  };
};
