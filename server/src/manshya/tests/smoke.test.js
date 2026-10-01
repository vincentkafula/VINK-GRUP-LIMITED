const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { createManshya } = require('../core');

async function boot() {
  const mn = createManshya();
  const app = express();
  app.use('/api', mn.router);           // mounted with no global body parser, as documented
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const merchant = mn.services.createMerchant('Test Co');
  const key = mn.services.issueApiKey(merchant.id);
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, ...headers },
    });
    return { status: r.status, body: await r.json() };
  };
  return { mn, server, base, merchant, key, call };
}

test('payments, refunds, payouts, transfers and the ledger stay balanced', async () => {
  const { mn, server, merchant, call, base } = await boot();
  try {
    // auth
    assert.equal((await fetch(base + '/balance')).status, 401);

    // online payment: R100.00, fee 2.9% + R1 = 390, retained 10% of 9610 = 961, available 8649
    const pay = await call('POST', '/payments', { amount: 10000, method: 'card', customer: { name: 'Thandi', email: 'T@x.co' }, reference: 'INV-1' });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.status, 'paid');
    assert.equal(pay.body.fee, 390);
    let bal = (await call('GET', '/balance')).body;
    assert.deepEqual([bal.total, bal.retained, bal.available], [9610, 961, 8649]);

    // declined card
    const bad = await call('POST', '/payments', { amount: 5000, paymentToken: 'tok_decline' });
    assert.equal(bad.body.status, 'failed');

    // idempotency: the same key must not create a second payment
    const k = { 'idempotency-key': 'abc-1' };
    const a = await call('POST', '/payments', { amount: 2000 }, k);
    const b = await call('POST', '/payments', { amount: 2000 }, k);
    assert.equal(a.body.id, b.body.id);
    assert.equal((await call('POST', '/payments', { amount: 3000 }, k)).status, 422);

    // tenant isolation
    const other = mn.services.createMerchant('Other Co');
    const otherKey = mn.services.issueApiKey(other.id);
    const r = await fetch(base + '/payments/' + pay.body.id, { headers: { authorization: 'Bearer ' + otherKey } });
    assert.equal(r.status, 404);

    // partial refund
    const before = (await call('GET', '/balance')).body.available;
    const ref = await call('POST', `/payments/${pay.body.id}/refund`, { amount: 1000 });
    assert.equal(ref.body.status, 'partially_refunded');
    assert.equal((await call('GET', '/balance')).body.available, before - 1000);
    assert.equal((await call('POST', `/payments/${pay.body.id}/refund`, { amount: 999999 })).status, 400);

    // payout everything available into the bank account (R8.50 fee)
    const accts = (await call('GET', '/bank/accounts')).body.data;
    const avail = (await call('GET', '/balance')).body.available;
    const po = await call('POST', '/payouts', { destination: { type: 'bank_account', accountId: accts[0].id } });
    assert.equal(po.status, 201);
    assert.equal(po.body.net, avail - 850);
    assert.equal((await call('GET', '/balance')).body.available, 0);
    assert.equal((await call('GET', '/bank/accounts')).body.data[0].balance, avail - 850);

    // transfers: own account, overdraft, beneficiary, statement
    const sav = (await call('POST', '/bank/accounts', { name: 'Savings pocket', kind: 'savings' })).body;
    const t1 = await call('POST', '/bank/transfers', { type: 'own', fromAccountId: accts[0].id, toAccountId: sav.id, amount: 1000 });
    assert.equal(t1.body.status, 'completed');
    assert.equal((await call('GET', '/bank/accounts')).body.data[1].balance, 1000);
    const over = await call('POST', '/bank/transfers', { type: 'own', fromAccountId: sav.id, toAccountId: accts[0].id, amount: 999999 });
    assert.equal(over.status, 409);
    const ben = (await call('POST', '/bank/beneficiaries', { name: 'Kagiso Supplies', bank: 'FNB', accountNumber: '62012345678', branchCode: '250655' })).body;
    const t2 = await call('POST', '/bank/transfers', { type: 'beneficiary', fromAccountId: accts[0].id, beneficiaryId: ben.id, amount: 500, reference: 'Stock' });
    assert.equal(t2.body.status, 'completed');
    const st = (await call('GET', `/bank/accounts/${accts[0].id}/statement`)).body.data;
    assert.equal(st[0].balance, (await call('GET', '/bank/accounts')).body.data[0].balance);

    // dashboards respond
    assert.equal((await call('GET', '/dashboard/online')).body.stats.total_transactions, 2);
    assert.equal((await call('GET', '/dashboard/bank')).status, 200);

    // ledger invariant: every journal balances and the whole ledger sums to zero
    assert.equal(mn.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM entries').get().s, 0);
    assert.equal(mn.db.prepare('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').get().n, 0);
  } finally { server.close(); mn.close(); }
});

test('POS sales, payment requests and signed gateway webhooks', async () => {
  const { mn, server, base, call } = await boot();
  try {
    const dev = (await call('POST', '/pos/devices', { name: 'Counter 1' })).body;
    const sale = await call('POST', '/pos/sales', { amount: 28900, deviceId: dev.id });
    assert.equal(sale.body.fee, Math.round(28900 * 0.025));
    assert.equal((await call('GET', '/dashboard/pos')).body.devices[0].today_count, 1);
    assert.equal((await call('POST', '/pos/sales', { amount: 100, deviceId: 'dev_nope' })).status, 404);

    // payment request paid once, second attempt refused
    const rq = (await call('POST', '/payment-requests', { amount: 15000, description: 'Deposit' })).body;
    const first = await fetch(`${base}/public/payment-requests/${rq.token}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'card', name: 'Lerato' }) });
    assert.equal((await first.json()).status, 'paid');
    const second = await fetch(`${base}/public/payment-requests/${rq.token}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(second.status, 409);

    // EFT stays pending until the gateway calls back with a valid signature
    const eft = (await call('POST', '/payments', { amount: 20000, method: 'eft' })).body;
    assert.equal(eft.status, 'pending');
    assert.ok(eft.redirect_url);
    const gwRef = mn.db.prepare('SELECT gateway_ref g FROM payments WHERE id=?').get(eft.id).g;
    const raw = JSON.stringify({ gatewayRef: gwRef, status: 'paid', amount: 20000 });
    const hook = (sig, body = raw) => fetch(`${base}/gateways/mock/webhook`, { method: 'POST', body, headers: { 'x-mock-signature': sig } });
    assert.equal((await hook('deadbeef')).status, 401);
    const sig = crypto.createHmac('sha256', mn.gateways.mock.secret).update(raw).digest('hex');
    assert.equal((await hook(sig)).status, 200);
    assert.equal((await call('GET', '/payments/' + eft.id)).body.status, 'paid');
    await hook(sig);                                    // replay must not double-credit
    const gross = 15000 + 20000 + 28900;
    assert.equal(mn.db.prepare("SELECT COALESCE(SUM(amount),0) s FROM entries WHERE account_id='sys:clearing'").get().s, -gross);
  } finally { server.close(); mn.close(); }
});
