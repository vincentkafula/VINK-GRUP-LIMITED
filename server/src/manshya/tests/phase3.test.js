const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { createManshya } = require('../core');
const { validSaId } = require('../core/util');

const makeId = (p12) => { for (let d = 0; d < 10; d++) if (validSaId(p12 + d)) return p12 + d; };
async function boot() {
  const mn = createManshya();
  const app = express();
  app.use('/api', mn.router);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const mk = (prefix, key) => async (method, path, body, headers = {}) => {
    const r = await fetch(base + prefix + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, ...headers } });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, ct, body: ct.includes('json') ? await r.json() : ct.includes('pdf') ? Buffer.from(await r.arrayBuffer()) : await r.text() };
  };
  const merchant = mn.services.createMerchant('Test Co'), key = mn.services.issueApiKey(merchant.id);
  const other = mn.services.createMerchant('Other Co');
  return { mn, server, base, merchant, other, call: mk('', key), as: mk, otherCall: mk('', mn.services.issueApiKey(other.id)), adm: mk('/admin', mn.admin.issueAdminKey('ops')), key };
}
const ledgerOk = (mn) => {
  assert.equal(mn.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM entries').get().s, 0);
  assert.equal(mn.db.prepare('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').get().n, 0);
};
const fund = async (call, amount = 500000, n = 3) => {
  for (let i = 0; i < n; i++) await call('POST', '/payments', { amount, customer: { name: 'B' + i, email: `b${i}@x.co` }, reference: 'F' + i });
  const acct = (await call('GET', '/bank/accounts')).body.data[0];
  await call('POST', '/payouts', { destination: { type: 'bank_account', accountId: acct.id } });
  return acct;
};
const bal = async (call, i = 0) => (await call('GET', '/bank/accounts')).body.data[i].balance;

test('back office: onboarding, KYC, suspension, fraud flags, disputes, payout approval', async () => {
  const { mn, server, base, merchant, call, as, adm, key } = await boot();
  try {
    assert.equal((await fetch(base + '/admin/overview')).status, 401);
    assert.equal((await as('', 'bad')('GET', '/admin/overview')).status, 401);

    // onboarding: a person decides
    const id = makeId('800101500908'), apply = (b) => fetch(base + '/public/onboarding/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    assert.equal((await apply({ businessName: 'New Biz', ownerName: 'Ayanda F', idNumber: '1234567890123', email: 'a@new.co' })).status, 400);
    assert.equal((await apply({ businessName: 'New Biz', ownerName: 'Ayanda F', idNumber: id, email: 'a@new.co' })).status, 201);
    assert.equal((await apply({ businessName: 'New Biz', ownerName: 'Ayanda F', idNumber: id, email: 'A@new.co' })).status, 409);
    const app1 = (await adm('GET', '/applications?status=submitted')).body.data[0];
    const ok = (await adm('POST', `/applications/${app1.id}/decide`, { decision: 'approve' })).body;
    assert.equal(ok.status, 'approved');
    assert.equal((await as('', ok.api_key)('GET', '/me')).body.name, 'New Biz');
    assert.equal((await adm('POST', `/applications/${app1.id}/decide`, { decision: 'approve' })).status, 404);
    assert.ok(mn.db.prepare("SELECT 1 FROM emails WHERE to_addr='a@new.co' AND subject LIKE 'We received%'").get());

    // KYC queue
    for (const type of ['id_document', 'proof_of_address', 'company_registration', 'bank_letter']) await call('POST', '/account/documents', { type, filename: type + '.pdf' });
    const q = (await adm('GET', '/kyc')).body.data.filter((d) => d.merchant_id === merchant.id);
    assert.equal(q.length, 4);
    for (const d of q) await adm('POST', `/documents/${d.id}/review`, { status: 'approved' });
    assert.equal((await adm('GET', '/merchants/' + merchant.id)).body.verified, true);

    // fraud rules (monitor only)
    const big = (await call('POST', '/payments', { amount: 6000000, customer: { name: 'Whale', email: 'w@x.co' } })).body;
    assert.equal(big.status, 'paid');
    for (let i = 0; i < 5; i++) await call('POST', '/payments', { amount: 2000, paymentToken: 'tok_decline', customer: { email: 'v@x.co' } });
    const rules = (await adm('GET', '/fraud-flags?status=open')).body.data.map((f) => f.rule);
    for (const r of ['large_amount', 'velocity', 'decline_spike']) assert.ok(rules.includes(r), r);
    const flag = (await adm('GET', '/fraud-flags?status=open')).body.data[0];
    assert.equal((await adm('POST', `/fraud-flags/${flag.id}/resolve`, { outcome: 'confirmed' })).body.status, 'confirmed');
    assert.ok((await adm('GET', '/transactions?flagged=1')).body.data.length >= 1);
    assert.ok((await adm('GET', '/transactions?flagged=0')).body.data.length > (await adm('GET', '/transactions?flagged=1')).body.data.length);   // flagged=0 means everything
    assert.ok((await adm('GET', '/overview')).body.queue.fraud_flags >= 1);

    // disputes: funds are held, then released or charged back
    const before = (await call('GET', '/balance')).body.available;
    const d1 = (await adm('POST', '/disputes', { paymentId: big.id, amount: 100000, reason: 'Not recognised' })).body;
    assert.equal((await call('GET', '/balance')).body.available, before - 100000);
    assert.equal((await call('POST', `/disputes/${d1.id}/evidence`, { evidence: 'Signed delivery note attached' })).status, 200);
    assert.equal((await adm('POST', `/disputes/${d1.id}/resolve`, { outcome: 'merchant' })).body.status, 'won');
    assert.equal((await call('GET', '/balance')).body.available, before);
    const d2 = (await adm('POST', '/disputes', { paymentId: big.id, amount: 100000 })).body;
    await adm('POST', `/disputes/${d2.id}/resolve`, { outcome: 'customer' });
    assert.equal((await call('GET', '/balance')).body.available, before - 100000 - 15000);
    const pay = (await call('GET', '/payments/' + big.id)).body;
    assert.equal(pay.refunded, 100000);
    assert.equal((await adm('POST', `/disputes/${d2.id}/resolve`, { outcome: 'customer' })).status, 404);
    assert.equal((await adm('POST', '/disputes', { paymentId: big.id, amount: 99999999 })).status, 400);
    assert.equal((await call('GET', '/disputes')).body.data.length, 2);

    // payout approval: a finance user cannot send a large payout alone
    const fin = as('', (await call('POST', '/account/api-keys', { label: 'fin', role: 'finance' })).body.key);
    const acct = (await call('GET', '/bank/accounts')).body.data[0];
    const dest = { type: 'bank_account', accountId: acct.id };
    const avail = (await call('GET', '/balance')).body.available;
    assert.ok(avail > 5100000);
    const pend = (await fin('POST', '/payouts', { amount: 5100000, destination: dest })).body;
    assert.equal(pend.status, 'pending_approval');
    assert.equal((await call('GET', '/balance')).body.available, avail);                    // nothing moved yet
    assert.equal((await fin('POST', `/payouts/${pend.id}/approve`)).status, 403);
    assert.equal((await call('POST', `/payouts/${pend.id}/approve`)).body.status, 'completed');
    assert.equal((await call('GET', '/balance')).body.available, avail - 5100000);
    assert.equal((await call('POST', `/payouts/${pend.id}/approve`)).status, 404);
    const pend2 = (await fin('POST', '/payouts', { amount: 5100000, destination: dest })).body;
    assert.equal((await call('POST', `/payouts/${pend2.id}/reject`)).body.status, 'rejected');
    assert.equal((await fin('POST', '/payouts', { amount: 100000, destination: dest })).body.status, 'completed');   // small ones go straight through

    // suspension blocks the API and can be undone
    assert.equal((await adm('POST', `/merchants/${merchant.id}/status`, { status: 'suspended', reason: 'Chargebacks' })).body.status, 'suspended');
    assert.equal((await call('GET', '/balance')).body.error.code, 'account_suspended');
    await adm('POST', `/merchants/${merchant.id}/status`, { status: 'active' });
    assert.equal((await call('GET', '/balance')).status, 200);
    assert.ok((await adm('GET', '/audit')).body.data.some((a) => a.action.startsWith('suspend merchant')));
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('payments: instant, QR, customer requests, inbound credits, cash, international', async () => {
  const { mn, server, base, call, otherCall, merchant, other } = await boot();
  try {
    const acct = await fund(call), sav = (await call('POST', '/bank/accounts', { name: 'Pocket', kind: 'savings' })).body;
    const oacct = (await otherCall('GET', '/bank/accounts')).body.data[0];

    // PayShap-style instant payment
    assert.equal((await call('POST', '/bank/payshap', { fromAccountId: acct.id, shapId: '12', amount: 1000 })).status, 400);
    assert.equal((await call('POST', '/bank/payshap', { fromAccountId: acct.id, shapId: '0821234567', amount: 999999 })).status, 400);
    const ps = await call('POST', '/bank/payshap', { fromAccountId: acct.id, shapId: '0821234567', amount: 25000, reference: 'Lunch' });
    assert.equal(ps.body.status, 'completed');

    // QR: receive and scan-to-pay. A fixed amount cannot be overridden and a tampered code is refused.
    const qr = (await call('POST', '/bank/qr', { accountId: sav.id, amount: 5000, reference: 'Table 4' })).body;
    assert.ok(qr.svg.startsWith('<svg') || qr.svg.includes('<svg'));
    assert.equal((await call('POST', '/bank/qr/parse', { payload: qr.payload })).body.amount, 5000);
    assert.equal((await call('POST', '/bank/qr/parse', { payload: qr.payload.replace('|5000|', '|1|') })).status, 400);
    assert.equal((await call('POST', '/bank/qr/pay', { payload: qr.payload, fromAccountId: acct.id, amount: 1 })).status, 201);
    assert.equal(await bal(call, 1), 5000);
    const open = (await call('POST', '/bank/qr', { accountId: sav.id })).body;
    assert.equal((await call('POST', '/bank/qr/pay', { payload: open.payload, fromAccountId: acct.id })).status, 400);          // amount needed
    assert.equal((await call('POST', '/bank/qr/pay', { payload: open.payload, fromAccountId: acct.id, amount: 2000 })).status, 201);

    // requests between customers
    assert.equal((await call('POST', '/bank/requests', { fromAccountId: acct.id, payerAccountNumber: sav.number, amount: 1000 })).status, 400);
    const rq = (await otherCall('POST', '/bank/requests', { fromAccountId: oacct.id, payerAccountNumber: acct.number, amount: 30000, note: 'Share of the bill' })).body;
    const inc = (await call('GET', '/bank/requests')).body.incoming[0];
    assert.equal(inc.from, 'Other Co');
    assert.equal((await otherCall('POST', `/bank/requests/${rq.id}/approve`, { fromAccountId: oacct.id })).status, 404);       // only the payer can approve
    assert.equal((await call('POST', `/bank/requests/${rq.id}/approve`, { fromAccountId: acct.id })).body.status, 'paid');
    assert.equal(await bal(otherCall), 30000);
    assert.equal((await call('POST', `/bank/requests/${rq.id}/approve`, { fromAccountId: acct.id })).status, 409);
    const rq2 = (await otherCall('POST', '/bank/requests', { fromAccountId: oacct.id, payerAccountNumber: acct.number, amount: 1000 })).body;
    assert.equal((await call('POST', `/bank/requests/${rq2.id}/decline`)).body.status, 'declined');

    // money arriving from other banks: signed, matched by account number, never credited twice
    const post = (evt, sig) => { const raw = JSON.stringify(evt); return fetch(base + '/rails/inbound', { method: 'POST', body: raw, headers: { 'x-rail-signature': sig === undefined ? crypto.createHmac('sha256', 'dev-rail-secret').update(raw).digest('hex') : sig } }); };
    const b0 = await bal(call);
    const evt = { railRef: 'IN-1', accountNumber: acct.number, amount: 100000, sender: 'Thabo Ltd', reference: 'INV 77' };
    assert.equal((await post(evt, 'nope')).status, 401);
    assert.deepEqual(await (await post(evt)).json(), { matched: true, duplicate: false });
    assert.deepEqual(await (await post(evt)).json(), { matched: true, duplicate: true });
    assert.equal(await bal(call), b0 + 100000);
    assert.deepEqual(await (await post({ ...evt, railRef: 'IN-2', accountNumber: '0000000000' })).json(), { matched: false });
    await post({ railRef: 'IN-3', accountNumber: acct.number, amount: 10000, currency: 'USD', sender: 'Acme Inc' });
    assert.equal(await bal(call), b0 + 100000 + Math.floor(10000 * 18.2 * 0.985));

    // cash send and collect
    const cash = (await call('POST', '/bank/cash', { fromAccountId: acct.id, phone: '0831112222', amount: 20000 })).body;
    assert.match(cash.code, /^\d{8}$/);
    const collect = (phone, code) => fetch(base + '/rails/cash/collect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code }) });
    for (let i = 0; i < 5; i++) assert.equal((await collect('0831112222', '00000000')).status, 401);
    assert.equal((await collect('0831112222', cash.code)).status, 423);                  // locked after five wrong codes
    const cash2 = (await call('POST', '/bank/cash', { fromAccountId: acct.id, phone: '0844445555', amount: 15000 })).body;
    assert.equal((await (await collect('0844445555', cash2.code)).json()).dispense, 15000);
    assert.equal((await collect('0844445555', cash2.code)).status, 404);
    const before = await bal(call);
    await call('POST', `/bank/cash/${cash.id}/cancel`);
    assert.equal(await bal(call), before + 20000);
    const cash3 = (await call('POST', '/bank/cash', { fromAccountId: acct.id, phone: '0855556666', amount: 10000 })).body;
    assert.deepEqual(mn.payments2.runCash(new Date(Date.now() + 73 * 36e5)), { expired: 1 });
    assert.equal(mn.db.prepare('SELECT status FROM cash_vouchers WHERE id=?').get(cash3.id).status, 'expired');
    assert.equal(mn.ledger.balance('sys:cash_escrow'), 0);

    // international payments with a locked rate
    const benef = { name: 'Jane Smith', country: 'GB', swift: 'ABCDGB2L', account: 'GB29NWBK60161331926819' };
    const quote = (await call('POST', '/bank/fx/quote', { currency: 'USD', foreignAmount: 10000 })).body;
    assert.equal(quote.zar, Math.ceil(10000 * 18.2 * 1.015));
    assert.equal((await call('POST', '/bank/international', { quoteId: quote.id, fromAccountId: acct.id, beneficiary: { ...benef, swift: 'bad' }, purpose: 'Gift' })).status, 400);
    const b1 = await bal(call);
    const pay = await call('POST', '/bank/international', { quoteId: quote.id, fromAccountId: acct.id, beneficiary: benef, purpose: 'Family support' });
    assert.equal(pay.status, 201);
    assert.equal(await bal(call), b1 - quote.zar - quote.fee);
    assert.equal((await call('POST', '/bank/international', { quoteId: quote.id, fromAccountId: acct.id, beneficiary: benef, purpose: 'Gift' })).status, 409);   // single use
    const q2 = (await call('POST', '/bank/fx/quote', { currency: 'EUR', foreignAmount: 5000 })).body;
    mn.db.prepare("UPDATE fx_quotes SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(q2.id);
    assert.equal((await call('POST', '/bank/international', { quoteId: q2.id, fromAccountId: acct.id, beneficiary: benef, purpose: 'Gift' })).body.error.code, 'quote_expired');
    assert.equal((await call('POST', '/bank/fx/quote', { currency: 'USD', foreignAmount: 90000000 })).status, 400);   // above the single-payment limit
    const q3 = (await call('POST', '/bank/fx/quote', { currency: 'USD', foreignAmount: 5000000 })).body;     // allowed, but more than the balance
    assert.equal((await call('POST', '/bank/international', { quoteId: q3.id, fromAccountId: acct.id, beneficiary: benef, purpose: 'Gift' })).status, 409);
    assert.equal((await call('POST', '/bank/fx/quote', { currency: 'XXX', foreignAmount: 100 })).status, 400);
    assert.equal((await call('GET', '/bank/international')).body.data.length, 1);
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('statements, cards, rewards, interest, support, buyer account and vehicle renewal', async () => {
  const { mn, server, base, merchant, other, call, otherCall, adm } = await boot();
  try {
    const acct = await fund(call);

    // statements: CSV, stamped PDF, verification, email, shareable details
    const csv = await call('GET', `/bank/accounts/${acct.id}/statement.csv`);
    assert.ok(csv.ct.includes('text/csv')); assert.ok(csv.body.split('\n').length >= 2);
    const pdf = await call('GET', `/bank/accounts/${acct.id}/statement.pdf`);
    assert.ok(pdf.ct.includes('pdf')); assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    const stamp = mn.db.prepare('SELECT * FROM statement_stamps ORDER BY created_at DESC').get();
    const secret = mn.db.prepare("SELECT value FROM kv WHERE key='stamp_secret'").get().value;
    const sig = crypto.createHmac('sha256', secret).update(`${stamp.id}.${stamp.hash}`).digest('hex').slice(0, 32);
    assert.equal((await (await fetch(`${base}/public/statements/verify?id=${stamp.id}&sig=${sig}`)).json()).valid, true);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    assert.equal((await (await fetch(`${base}/public/statements/verify?id=${stamp.id}&sig=${tampered}`)).json()).valid, false);
    assert.equal((await (await fetch(`${base}/public/statements/verify?id=${stamp.id}&sig=bad`)).json()).valid, false);
    assert.equal((await call('POST', `/bank/accounts/${acct.id}/statement/email`, { to: 'nope' })).status, 400);
    assert.equal((await call('POST', `/bank/accounts/${acct.id}/statement/email`, { to: 'me@x.co' })).body.sent, true);
    assert.ok(mn.db.prepare("SELECT 1 FROM emails WHERE to_addr='me@x.co' AND subject LIKE '%statement%'").get());
    assert.equal((await call('GET', `/bank/accounts/${acct.id}/share`)).body.fields.number, acct.number);

    // cards: lifecycle and controls that really decide authorisations
    const auth = (id, b) => call('POST', `/bank/cards/${id}/authorize`, b);
    const card = (await call('POST', '/bank/cards', { accountId: acct.id, kind: 'virtual', limit: 100000, dailyLimit: 10000 })).body;
    assert.equal(card.status, 'inactive');
    assert.equal((await auth(card.id, { amount: 1000, channel: 'online' })).body.reason, 'card_inactive');
    assert.equal((await call('POST', `/bank/cards/${card.id}/activate`)).body.status, 'active');
    assert.equal((await call('POST', `/bank/cards/${card.id}/activate`)).status, 409);
    assert.equal((await auth(card.id, { amount: 3000, channel: 'online' })).body.approved, true);
    assert.equal((await auth(card.id, { amount: 1000, channel: 'international' })).body.reason, 'international_disabled');
    await call('PATCH', `/bank/cards/${card.id}`, { international: true });
    assert.equal((await auth(card.id, { amount: 1000, channel: 'international' })).body.approved, true);
    await call('PATCH', `/bank/cards/${card.id}`, { tap: false });
    assert.equal((await auth(card.id, { amount: 1000, channel: 'tap' })).body.reason, 'tap_disabled');
    assert.equal((await auth(card.id, { amount: 9000, channel: 'online' })).body.reason, 'daily_limit');
    await call('PATCH', `/bank/cards/${card.id}`, { status: 'frozen' });
    assert.equal((await auth(card.id, { amount: 100, channel: 'online' })).body.reason, 'card_frozen');
    await call('PATCH', `/bank/cards/${card.id}`, { status: 'active', online: false });
    assert.equal((await auth(card.id, { amount: 100, channel: 'online' })).body.reason, 'online_disabled');
    assert.equal((await call('PATCH', `/bank/cards/${card.id}`, { tap: 'yes' })).status, 400);
    assert.equal((await call('POST', `/bank/cards/${card.id}/wallets`, { wallet: 'apple' })).body.wallets[0], 'apple');
    assert.equal((await call('POST', `/bank/cards/${card.id}/wallets`, { wallet: 'bitpay' })).status, 400);
    const poor = (await call('POST', '/bank/cards', { accountId: acct.id, limit: 1e9, dailyLimit: 1e9 })).body;
    await call('POST', `/bank/cards/${poor.id}/activate`);
    await call('PATCH', `/bank/cards/${poor.id}`, { online: true });
    assert.equal((await auth(poor.id, { amount: 900000000, channel: 'online' })).body.reason, 'insufficient_funds');
    const blk = (await call('POST', `/bank/cards/${card.id}/block`, { reason: 'stolen' })).body;
    assert.equal(blk.blocked.status, 'blocked'); assert.equal(blk.replacement.status, 'inactive');
    assert.equal((await call('PATCH', `/bank/cards/${card.id}`, { status: 'active' })).status, 409);
    assert.equal((await call('POST', `/bank/cards/${blk.replacement.id}/wallets`, { wallet: 'google' })).status, 409);       // needs activating first
    assert.ok((await call('GET', `/bank/cards/transactions?cardId=${card.id}`)).body.data.length >= 6);

    // rewards: cashback on bills and card spend, redeemable
    await call('POST', '/bills/purchase', { productId: 'airtime', recipient: '0821234567', amount: 10000, accountId: acct.id });
    const rw = (await call('GET', '/rewards')).body;
    assert.equal(rw.balance, 200 + Math.floor(3000 * 0.005) + Math.floor(1000 * 0.005));
    const bb = await bal(call);
    assert.equal((await call('POST', '/rewards/redeem', { accountId: acct.id })).body.redeemed, rw.balance);
    assert.equal(await bal(call), bb + rw.balance);
    assert.equal((await call('POST', '/rewards/redeem', { accountId: acct.id })).status, 409);

    // savings interest, once a month
    const goal = (await call('POST', '/bank/savings-goals', { name: 'Reserve', target: 1000000 })).body;
    await call('POST', `/bank/savings-goals/${goal.id}/deposit`, { fromAccountId: acct.id, amount: 120000 });
    assert.deepEqual(mn.banking.accrueInterest(new Date()), { paid: 1 });
    assert.deepEqual(mn.banking.accrueInterest(new Date()), { paid: 0 });
    assert.equal((await call('GET', '/bank/savings-goals')).body.data.find((g) => g.id === goal.id).saved, 120000 + 500);

    // support
    const t = (await call('POST', '/support/tickets', { category: 'payments', subject: 'Missing payout', message: 'Where is it?' })).body;
    assert.equal((await call('POST', `/support/tickets/${t.id}/messages`, { message: 'Still waiting' })).body.messages.length, 2);
    assert.equal((await adm('POST', `/support/${t.id}/reply`, { message: 'Looking into it' })).body.status, 'answered');
    assert.equal((await call('GET', `/support/tickets/${t.id}`)).body.messages[2].author, 'support');
    assert.equal((await otherCall('GET', `/support/tickets/${t.id}`)).status, 404);
    const spare = (await call('POST', '/bank/cards', { accountId: acct.id })).body;
    const fr = (await call('POST', '/support/report-fraud', { kind: 'lost_card', cardId: spare.id, details: 'Left it at a restaurant' })).body;
    assert.equal(fr.card.blocked.status, 'blocked');
    assert.ok((await call('GET', '/support/faqs?q=stolen')).body.faqs.length >= 1);
    const near = (await call('GET', '/support/locations?lat=-33.92&lng=18.42')).body.data;
    assert.ok(near[0].distance_km < 5 && near[0].distance_km <= near[1].distance_km);

    // buyer account: only after the email is verified, and only the buyer's own records
    await call('PUT', '/account/profile', { personal: { email: 'Buyer@Example.com' } });
    assert.equal((await call('GET', '/buyer/purchases')).body.error.code, 'verify_email');
    assert.equal((await call('POST', '/buyer/verify/start')).body.sent, true);
    const code = /\b(\d{6})\b/.exec(mn.db.prepare("SELECT body FROM emails WHERE subject LIKE '%verification%' ORDER BY created_at DESC").get().body)[1];
    assert.equal((await call('POST', '/buyer/verify/confirm', { code: '000000' })).status, 401);
    assert.equal((await call('POST', '/buyer/verify/confirm', { code })).body.verified, true);
    await otherCall('POST', '/payments', { amount: 12000, customer: { email: 'buyer@example.com' }, reference: 'Shoes' });
    await otherCall('POST', '/payments', { amount: 9000, customer: { email: 'someone-else@example.com' }, reference: 'Not mine' });
    const mine = (await call('GET', '/buyer/purchases')).body.data;
    assert.equal(mine.length, 1); assert.equal(mine[0].merchant, 'Other Co');
    const sc = (await otherCall('POST', '/saved-cards', { customerEmail: 'buyer@example.com', token: 'tok_x', brand: 'Visa', last4: '1111', expiry: '01/30', agreed: true })).body;
    const sub = (await otherCall('POST', '/subscriptions', { savedCardId: sc.id, amount: 5000, interval: 'monthly' })).body;
    const other2 = (await otherCall('POST', '/saved-cards', { customerEmail: 'zed@example.com', token: 'tok_z', brand: 'Visa', last4: '2222', expiry: '01/30' })).body;
    const sub2 = (await otherCall('POST', '/subscriptions', { savedCardId: other2.id, amount: 5000, interval: 'monthly' })).body;
    assert.equal((await call('GET', '/buyer/subscriptions')).body.data.length, 1);
    assert.equal((await call('PATCH', `/buyer/subscriptions/${sub.id}`, { status: 'paused' })).body.status, 'paused');
    assert.equal((await call('PATCH', `/buyer/subscriptions/${sub2.id}`, { status: 'paused' })).status, 404);
    assert.equal((await call('GET', '/buyer/cards')).body.data[0].agreed_version, '2026-01');
    assert.equal((await call('DELETE', `/buyer/cards/${other2.id}`)).status, 404);
    await call('DELETE', `/buyer/cards/${sc.id}`);
    assert.equal(mn.db.prepare('SELECT status FROM subscriptions WHERE id=?').get(sub.id).status, 'cancelled');
    await call('PUT', '/account/profile', { personal: { email: 'changed@example.com' } });
    assert.equal((await call('GET', '/buyer/purchases')).body.error.code, 'verify_email');          // a changed email must be verified again

    // vehicle licence renewal
    assert.equal((await call('POST', '/vehicle/lookup', { plate: '!!' })).status, 400);
    const info = (await call('POST', '/vehicle/lookup', { plate: 'cy 12345' })).body;
    const b2 = await bal(call);
    const ren = (await call('POST', '/vehicle/renew', { plate: 'CY 12345', accountId: acct.id, delivery: { address: '1 Long Street, Cape Town' } })).body;
    assert.equal(ren.status, 'dispatched');
    assert.equal(await bal(call), b2 - info.fee - info.delivery_fee);
    assert.equal((await call('GET', '/vehicle/renewals')).body.data.length, 1);
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});
