const crypto = require('crypto');
const QRCode = require('qrcode');
const { ApiError, rid, now, sha256, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

// Instant payments, QR, payment requests between customers, inbound credits, cash send and international payments.
module.exports = function buildPayments2({ db, ledger, core, rails, config, emit, notify }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const secret = () => { let r = get("SELECT value FROM kv WHERE key='qr_secret'"); if (!r) { run("INSERT OR IGNORE INTO kv(key,value) VALUES('qr_secret',?)", crypto.randomBytes(32).toString('hex')); r = get("SELECT value FROM kv WHERE key='qr_secret'"); } return r.value; };
  const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex').slice(0, 16);
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const externalToday = (mid) => get("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE merchant_id=? AND kind IN ('beneficiary','payshap') AND status!='failed' AND substr(created_at,1,10)=?", mid, now().slice(0, 10)).s;

  /* PayShap-style instant payment to a mobile number */
  async function payshap(m, b = {}) {
    const from = core.getAccount(m.id, b.fromAccountId);
    const amount = num(b.amount, 'amount', { min: 100, max: config.payshapLimit });
    const shapId = text(b.shapId, 'shapId', { max: 10 });
    if (!/^0\d{9}$/.test(shapId)) throw new ApiError(400, 'invalid_shapId', 'shapId must be a 10 digit cellphone number');
    const reference = text(b.reference, 'reference', { optional: true, max: 35 }), id = rid('trf');
    const lines = [{ account: A.bank(from.id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { account: A.out, kind: 'system', amount }];
    tx(() => {
      if (externalToday(m.id) + amount > config.bank.dailyExternalLimit) throw new ApiError(409, 'limit_exceeded', 'This would exceed your daily limit for payments to other banks');
      const refused = config.limitGuard && config.limitGuard({ merchantId: m.id, verified: !!get('SELECT verified FROM merchants WHERE id=?', m.id)?.verified, channel: 'transfer_out', amount, usedToday: externalToday(m.id) });
      if (refused) throw new ApiError(409, 'limit_exceeded', refused);
      ledger.post('transfer', lines, { ref: id, memo: reference || `PayShap to ${shapId}` });
      run("INSERT INTO transfers(id,merchant_id,from_account,kind,to_ref,amount,reference,status,category,created_at) VALUES(?,?,?,'payshap',?,?,?,'processing','Instant payments',?)", id, m.id, from.id, shapId, amount, reference, now());
    });
    await core.sendOnRail({ table: 'transfers', id, lines, amount, beneficiary: { name: shapId, shapId }, reference: reference || id, merchantId: m.id });
    return get('SELECT * FROM transfers WHERE id=?', id);
  }

  /* QR: receive ("Pay Me") and scan-to-pay. The payload is signed so amounts cannot be edited. */
  async function qrCreate(m, b = {}) {
    const a = core.getAccount(m.id, b.accountId);
    const amount = b.amount === undefined ? '' : String(num(b.amount, 'amount', { min: 100, max: 100000000 }));
    const ref = text(b.reference, 'reference', { optional: true, max: 35 }) || '';
    if (ref.includes('|')) throw new ApiError(400, 'invalid_reference', 'reference cannot contain |');
    const body = `MNSH1|${a.number}|${amount}|${ref}`, payload = `${body}|${hmac(body)}`;
    return { payload, amount: amount ? +amount : null, reference: ref || null, account_number: a.number, svg: await QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
  }
  function parseQr(payload) {
    const p = String(payload || '').split('|');
    if (p.length !== 5 || p[0] !== 'MNSH1' || !safeEq(p[4], hmac(p.slice(0, 4).join('|')))) throw new ApiError(400, 'invalid_qr', 'This QR code is not valid. Only VINK QR codes can be paid here.');
    const to = get('SELECT * FROM bank_accounts WHERE number=?', p[1]);
    if (!to) throw notFound('account');
    return { number: p[1], amount: p[2] ? +p[2] : null, reference: p[3] || null, merchant: get('SELECT name FROM merchants WHERE id=?', to.merchant_id).name };
  }
  async function qrPay(m, b = {}) {
    const q = parseQr(b.payload);
    const amount = q.amount !== null ? q.amount : num(b.amount, 'amount', { min: 100, max: 100000000 });   // a fixed amount cannot be overridden
    return core.transfer(m, { type: 'internal', fromAccountId: b.fromAccountId, accountNumber: q.number, amount, reference: q.reference || 'QR payment', category: 'QR payments' });
  }

  /* payment requests between customers: someone asks you for money, you approve or decline */
  function createRtp(m, b = {}) {
    const mine = core.getAccount(m.id, b.fromAccountId);
    const payer = get('SELECT * FROM bank_accounts WHERE number=?', text(b.payerAccountNumber, 'payerAccountNumber', { max: 20 }));
    if (!payer) throw notFound('account');
    if (payer.merchant_id === m.id) throw new ApiError(400, 'same_owner', 'You cannot request money from your own account');
    const id = rid('rtp');
    run('INSERT INTO rtp(id,requester_merchant,requester_account,payer_merchant,payer_account,amount,note,created_at) VALUES(?,?,?,?,?,?,?,?)', id, m.id, mine.id, payer.merchant_id, payer.id,
      num(b.amount, 'amount', { min: 100, max: 100000000 }), text(b.note, 'note', { optional: true, max: 100 }), now());
    notify(payer.merchant_id, 'request', 'Payment request', `${m.name} is asking for R ${(b.amount / 100).toFixed(2)}`);
    return { id, status: 'pending' };
  }
  function listRtp(m) {
    const row = (r, who) => ({ id: r.id, amount: r.amount, note: r.note, status: r.status, created_at: r.created_at, [who]: r.name });
    return {
      incoming: all('SELECT r.*,x.name FROM rtp r JOIN merchants x ON x.id=r.requester_merchant WHERE r.payer_merchant=? ORDER BY r.created_at DESC LIMIT 50', m.id).map((r) => row(r, 'from')),
      outgoing: all('SELECT r.*,x.name FROM rtp r JOIN merchants x ON x.id=r.payer_merchant WHERE r.requester_merchant=? ORDER BY r.created_at DESC LIMIT 50', m.id).map((r) => row(r, 'to')),
    };
  }
  async function approveRtp(m, id, b = {}) {
    const r = get('SELECT * FROM rtp WHERE id=? AND payer_merchant=?', id, m.id);
    if (!r) throw notFound('request');
    if (!run("UPDATE rtp SET status='processing' WHERE id=? AND status='pending'", id).changes) throw new ApiError(409, 'not_pending', 'This request has already been dealt with');
    try {
      await core.transfer(m, { type: 'internal', fromAccountId: b.fromAccountId, accountNumber: get('SELECT number FROM bank_accounts WHERE id=?', r.requester_account).number, amount: r.amount, reference: r.note || 'Payment request', category: 'Payments' });
    } catch (e) { run("UPDATE rtp SET status='pending' WHERE id=?", id); throw e; }
    run("UPDATE rtp SET status='paid' WHERE id=?", id);
    notify(r.requester_merchant, 'request', 'Request paid', `${m.name} paid R ${(r.amount / 100).toFixed(2)}`);
    return { id, status: 'paid' };
  }
  const closeRtp = (m, id, who, status) => {
    if (!run(`UPDATE rtp SET status=? WHERE id=? AND ${who}=? AND status='pending'`, status, id, m.id).changes) throw notFound('request');
    return { id, status };
  };

  /* inbound credits from other banks (called by the rail's signed notification) */
  function receiveInbound(evt = {}) {
    const currency = oneOf(evt.currency || 'ZAR', 'currency', ['ZAR', ...Object.keys(config.fx.rates)]);
    const amount = num(evt.amount, 'amount', { min: 1, max: 1e11 }), railRef = text(evt.railRef, 'railRef', { max: 80 });
    const a = get('SELECT * FROM bank_accounts WHERE number=?', String(evt.accountNumber || ''));
    if (!a) return { matched: false };
    const zar = currency === 'ZAR' ? amount : Math.floor(amount * config.fx.rates[currency] * (1 - config.fx.markupPct));
    let fresh = false;
    tx(() => {
      if (!run('INSERT OR IGNORE INTO inbound_credits(rail_ref,merchant_id,account_id,amount,currency,sender,created_at) VALUES(?,?,?,?,?,?,?)', railRef, a.merchant_id, a.id, zar, currency, text(evt.sender, 'sender', { optional: true, max: 80 }), now()).changes) return;
      ledger.post('inbound', [{ account: A.in, kind: 'system', amount: -zar }, { account: A.bank(a.id), merchant: a.merchant_id, kind: 'bank', amount: zar }], { ref: railRef, memo: `From ${evt.sender || 'another bank'}${evt.reference ? ': ' + evt.reference : ''}` });
      fresh = true;
    });
    if (fresh) { notify(a.merchant_id, 'transfer', 'Money received', `R ${(zar / 100).toFixed(2)}${currency !== 'ZAR' ? ` (from ${currency})` : ''} from ${evt.sender || 'another bank'}`); emit(a.merchant_id, 'transfer.received', { rail_ref: railRef, amount: zar, currency }); }
    return { matched: true, duplicate: !fresh };
  }

  /* send cash: a code the recipient uses at an ATM or retailer */
  async function cashSend(m, b = {}) {
    const from = core.getAccount(m.id, b.fromAccountId), amount = num(b.amount, 'amount', { min: 1000, max: config.cash.maxAmount });
    const phone = text(b.phone, 'phone', { max: 10 });
    if (!/^0\d{9}$/.test(phone)) throw new ApiError(400, 'invalid_phone', 'phone must be a 10 digit cellphone number');
    const id = rid('cash'), code = String(crypto.randomInt(0, 1e8)).padStart(8, '0'), expires = new Date(Date.now() + config.cash.expiresHours * 36e5).toISOString();
    tx(() => {
      ledger.post('cash_send', [{ account: A.bank(from.id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { account: 'sys:cash_escrow', kind: 'system', amount }], { ref: id, memo: `Cash for ${phone}` });
      run('INSERT INTO cash_vouchers(id,merchant_id,from_account,phone,amount,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)', id, m.id, from.id, phone, amount, sha256(`${id}:${code}`), expires, now());
    });
    return { id, code, phone, amount, expires_at: expires };   // the code is shown once
  }
  const listCash = (m) => ({ data: all('SELECT id,phone,amount,status,expires_at,created_at FROM cash_vouchers WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id) });
  const refundCash = (v, status) => tx(() => {
    if (!run("UPDATE cash_vouchers SET status=? WHERE id=? AND status='active'", status, v.id).changes) return false;
    ledger.post('cash_refund', [{ account: 'sys:cash_escrow', kind: 'system', amount: -v.amount }, { account: A.bank(v.from_account), merchant: v.merchant_id, kind: 'bank', amount: v.amount }], { ref: v.id, memo: `Cash ${status}` });
    return true;
  });
  function cashCancel(m, id) {
    const v = get('SELECT * FROM cash_vouchers WHERE id=? AND merchant_id=?', id, m.id);
    if (!v || !refundCash(v, 'cancelled')) throw notFound('voucher');
    return { id, status: 'cancelled' };
  }
  // Called by the ATM or retailer network. Five wrong codes for a number lock its vouchers.
  function cashCollect(b = {}) {
    const phone = String(b.phone || ''), code = String(b.code || '');
    const vs = all("SELECT * FROM cash_vouchers WHERE phone=? AND status='active' AND expires_at>?", phone, now());
    if (!vs.length) throw new ApiError(404, 'voucher_not_found', 'No cash is waiting for this number');
    if (vs.some((v) => v.attempts >= 5)) throw new ApiError(423, 'locked', 'Too many wrong codes. Contact your bank.');
    const v = vs.find((x) => safeEq(x.code_hash, sha256(`${x.id}:${code}`)));
    if (!v) { run("UPDATE cash_vouchers SET attempts=attempts+1 WHERE phone=? AND status='active'", phone); throw new ApiError(401, 'wrong_code', 'Wrong code'); }
    tx(() => {
      if (!run("UPDATE cash_vouchers SET status='collected' WHERE id=? AND status='active'", v.id).changes) throw new ApiError(409, 'already_collected', 'Already collected');
      ledger.post('cash_collect', [{ account: 'sys:cash_escrow', kind: 'system', amount: -v.amount }, { account: A.out, kind: 'system', amount: v.amount }], { ref: v.id, memo: 'Cash collected' });
    });
    notify(v.merchant_id, 'transfer', 'Cash collected', `R ${(v.amount / 100).toFixed(2)} was collected by ${v.phone}`);
    return { dispense: v.amount };
  }
  const runCash = (at = new Date()) => { let n = 0; for (const v of all("SELECT * FROM cash_vouchers WHERE status='active' AND expires_at<=?", at.toISOString())) if (refundCash(v, 'expired')) n++; return { expired: n }; };

  /* international payments with a locked 60 second exchange rate */
  const PURPOSES = ['Family support', 'Education', 'Travel', 'Business payment', 'Goods and services', 'Gift'];
  function fxQuote(m, b = {}) {
    const currency = oneOf(b.currency, 'currency', Object.keys(config.fx.rates));
    const foreign = num(b.foreignAmount, 'foreignAmount', { min: 100, max: 1e10 });
    const rate = config.fx.rates[currency] * (1 + config.fx.markupPct), zar = Math.ceil(foreign * rate), id = rid('fxq');
    if (zar > config.fx.maxPerPayment) throw new ApiError(400, 'invalid_foreignAmount', 'That is above the limit for a single payment');
    run('INSERT INTO fx_quotes(id,merchant_id,currency,rate,foreign_amount,zar,fee,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, m.id, currency, rate, foreign, zar, config.fx.fee, new Date(Date.now() + 60e3).toISOString(), now());
    return { id, currency, rate, foreign_amount: foreign, zar, fee: config.fx.fee, total: zar + config.fx.fee, expires_at: get('SELECT expires_at e FROM fx_quotes WHERE id=?', id).e };
  }
  async function sendInternational(m, b = {}) {
    const from = core.getAccount(m.id, b.fromAccountId), be = b.beneficiary || {};
    const ben = { name: text(be.name, 'beneficiary.name', { max: 80 }), country: text(be.country, 'beneficiary.country', { max: 2 }), swift: text(be.swift, 'beneficiary.swift', { max: 11 }).toUpperCase(), account: text(be.account, 'beneficiary.account', { max: 34 }).replace(/\s/g, '') };
    if (!/^[A-Z]{2}$/.test(ben.country)) throw new ApiError(400, 'invalid_country', 'country must be a 2 letter code');
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(ben.swift)) throw new ApiError(400, 'invalid_swift', 'That SWIFT/BIC code is not valid');
    if (!/^[A-Za-z0-9]{8,34}$/.test(ben.account)) throw new ApiError(400, 'invalid_account', 'Enter the IBAN or account number without spaces or dashes');
    const purpose = oneOf(b.purpose, 'purpose', PURPOSES), id = rid('intl');
    const q = get('SELECT * FROM fx_quotes WHERE id=? AND merchant_id=?', String(b.quoteId), m.id);
    if (!q) throw notFound('quote');
    if (!run('UPDATE fx_quotes SET used=1 WHERE id=? AND used=0 AND expires_at>?', q.id, now()).changes) throw new ApiError(409, 'quote_expired', 'This rate has expired or was already used. Get a new quote.');
    const lines = [{ account: A.bank(from.id), merchant: m.id, kind: 'bank', amount: -(q.zar + q.fee), floor: 0 }, { account: 'sys:fx', kind: 'system', amount: q.zar }, { account: A.fees, kind: 'system', amount: q.fee }];
    try {
      tx(() => {
        ledger.post('international', lines, { ref: id, memo: `${q.currency} payment to ${ben.name}` });
        run("INSERT INTO international_payments(id,merchant_id,from_account,beneficiary,currency,foreign_amount,zar_amount,fee,rate,purpose,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'processing',?)", id, m.id, from.id, JSON.stringify(ben), q.currency, q.foreign_amount, q.zar, q.fee, q.rate, purpose, now());
      });
    } catch (e) { run('UPDATE fx_quotes SET used=0 WHERE id=?', q.id); throw e; }
    try {
      const r = await rails.sendInternational({ id, beneficiary: ben, currency: q.currency, amount: q.foreign_amount, purpose });
      run('UPDATE international_payments SET status=?,rail_ref=? WHERE id=?', r.status === 'completed' ? 'completed' : 'processing', r.railRef || null, id);
    } catch {
      tx(() => { ledger.post('international_reversal', ledger.reverse(lines), { ref: id }); run("UPDATE international_payments SET status='failed' WHERE id=?", id); });
      throw new ApiError(502, 'rail_error', 'The payment could not be sent. Your money was returned.');
    }
    return { ...get('SELECT * FROM international_payments WHERE id=?', id), beneficiary: ben };
  }
  const listInternational = (m) => ({ data: all('SELECT * FROM international_payments WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id).map((r) => ({ ...r, beneficiary: JSON.parse(r.beneficiary) })) });

  return { payshap, qrCreate, parseQr, qrPay, createRtp, listRtp, approveRtp, declineRtp: (m, id) => closeRtp(m, id, 'payer_merchant', 'declined'), cancelRtp: (m, id) => closeRtp(m, id, 'requester_merchant', 'cancelled'),
    receiveInbound, cashSend, listCash, cashCancel, cashCollect, runCash, fxQuote, sendInternational, listInternational, PURPOSES };
};
