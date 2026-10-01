const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createManshya } = require('../core');

async function boot() {
  const mn = createManshya();
  const app = express();
  app.use('/api', mn.router);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const merchant = mn.services.createMerchant('Test Co');
  const mk = (key) => async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, ...headers } });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, ct, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  const key = mn.services.issueApiKey(merchant.id);
  return { mn, server, base, merchant, call: mk(key), as: mk };
}
const fund = async (call, amount = 500000) => {
  for (let i = 0; i < 3; i++) await call('POST', '/payments', { amount, method: 'card', customer: { name: 'Buyer ' + i, email: `b${i}@x.co` }, reference: 'F' + i });
  const acct = (await call('GET', '/bank/accounts')).body.data[0];
  await call('POST', '/payouts', { destination: { type: 'bank_account', accountId: acct.id } });
  return acct;
};
const ledgerOk = (mn) => {
  assert.equal(mn.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM entries').get().s, 0);
  assert.equal(mn.db.prepare('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').get().n, 0);
};

test('online: unified history, reports, saved cards, subscriptions, schedules, settings, buttons', async () => {
  const { mn, server, call, base } = await boot();
  try {
    await call('POST', '/payments', { amount: 10000, customer: { name: '=HYPERLINK("x")', email: 'a@x.co' }, reference: 'INV-A' });
    await call('POST', '/payments', { amount: 25000, customer: { name: 'Lerato', email: 'l@x.co' }, reference: 'INV-B' });
    const all = (await call('GET', '/transactions')).body;
    assert.equal(all.data.length, 2);
    assert.equal((await call('GET', '/transactions?q=lerato')).body.data.length, 1);
    assert.equal((await call('GET', '/transactions?type=payout')).body.data.length, 0);
    assert.equal((await call('GET', '/transactions?type=nope')).status, 400);
    const csv = await call('GET', '/transactions?format=csv');
    assert.ok(csv.ct.includes('text/csv'));
    assert.ok(csv.body.includes("'=HYPERLINK"), 'csv must neutralise formulas');

    const fees = (await call('GET', '/reports/fees')).body;
    assert.equal(fees.totals.transactions, 2);
    assert.equal(fees.totals.processing_fees, 390 + Math.round(25000 * 0.029) + 100);
    const rec = (await call('GET', '/reports/reconciliation')).body;
    assert.equal(rec.summary.difference, 0); assert.equal(rec.summary.unmatched, 0); assert.equal(rec.ledger_ok, true);

    // saved cards and subscriptions
    const card = (await call('POST', '/saved-cards', { customerEmail: 'S@X.co', token: 'tok_visa', brand: 'Visa', last4: '4242', expiry: '08/28' })).body;
    assert.equal(card.customer_email, 's@x.co');
    assert.equal((await call('POST', '/saved-cards', { customerEmail: 's@x.co', token: 't', brand: 'Visa', last4: '42', expiry: '08/28' })).status, 400);
    const sub = (await call('POST', '/subscriptions', { savedCardId: card.id, amount: 5000, interval: 'monthly', customerName: 'Sam' })).body;
    const t0 = new Date(Date.now() + 1000);
    assert.deepEqual(await mn.online.runSubscriptions(t0), { charged: 1, failed: 0 });
    assert.deepEqual(await mn.online.runSubscriptions(t0), { charged: 0, failed: 0 });     // same cycle is never charged twice
    const after = (await call('GET', '/subscriptions')).body.data[0];
    assert.ok(after.next_charge_at > sub.next_charge_at);
    const bad = (await call('POST', '/saved-cards', { customerEmail: 'd@x.co', token: 'tok_decline', brand: 'Visa', last4: '0002', expiry: '01/30' })).body;
    const badSub = (await call('POST', '/subscriptions', { savedCardId: bad.id, amount: 4000, interval: 'weekly' })).body;
    for (let i = 1; i <= 3; i++) await mn.online.runSubscriptions(new Date(Date.now() + i * 2 * 864e5));
    assert.equal((await call('GET', '/subscriptions?status=past_due')).body.data[0].id, badSub.id);
    await call('DELETE', '/saved-cards/' + card.id);
    assert.equal((await call('GET', '/subscriptions?status=cancelled')).body.data.length, 1);

    // payout schedule runs once a day
    const acct = (await call('GET', '/bank/accounts')).body.data[0];
    const sch = await call('POST', '/payout-schedules', { frequency: 'daily', minAmount: 1000, destination: { type: 'bank_account', accountId: acct.id } });
    assert.equal(sch.status, 201);
    assert.equal((await mn.online.runPayoutSchedules(new Date())).paid, 1);
    assert.equal((await mn.online.runPayoutSchedules(new Date())).paid, 0);
    assert.equal((await call('PATCH', '/payout-schedules/' + sch.body.id, { status: 'paused' })).body.status, 'paused');

    // settings take real effect
    assert.equal((await call('PUT', '/settings', { payment_methods: { qr: false } })).status, 200);
    assert.equal((await call('POST', '/payments', { amount: 5000, method: 'qr' })).body.error.code, 'method_disabled');
    assert.equal((await call('PUT', '/settings', { payment_methods: { card: false, eft: false } })).status, 400);
    assert.equal((await call('PUT', '/settings', { display: { theme: 'neon' } })).status, 400);
    assert.equal((await call('PUT', '/settings', { nonsense: { a: 1 } })).status, 400);

    // payment buttons: a fixed price cannot be overridden by the buyer
    const btn = (await call('POST', '/payment-buttons', { label: 'Coffee', amount: 4500 })).body;
    const paid = await fetch(`${base}/public/buttons/${btn.token}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 1, method: 'card', email: 'z@x.co' }) });
    assert.equal((await paid.json()).payment.amount, 4500);

    // payment request search and history
    const rq = (await call('POST', '/payment-requests', { amount: 9900, description: 'Deposit for order 77' })).body;
    assert.equal((await call('GET', '/payment-requests?q=order%2077')).body.data.length, 1);
    await call('POST', `/payment-requests/${rq.id}/cancel`);
    assert.equal((await call('GET', '/payment-requests?history=1')).body.data.length, 1);
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('account: roles, users, keys, UBOs, profile, documents, audit log and notifications', async () => {
  const { mn, server, call, as, merchant } = await boot();
  try {
    const viewer = as((await call('POST', '/account/api-keys', { label: 'auditor', role: 'viewer' })).body.key);
    assert.equal((await viewer('GET', '/balance')).status, 200);
    assert.equal((await viewer('POST', '/payments', { amount: 5000 })).status, 403);
    assert.equal((await viewer('GET', '/account/users')).status, 403);
    assert.equal((await viewer('POST', '/account/api-keys', { label: 'x', role: 'admin' })).status, 403);
    assert.equal((await call('POST', '/account/api-keys', { label: 'x', role: 'owner' })).status, 400);
    const keys = (await call('GET', '/account/api-keys')).body.data;
    assert.equal(keys.length, 2);
    await call('DELETE', '/account/api-keys/' + keys.find((k) => k.label === 'auditor').id);
    assert.equal((await viewer('GET', '/balance')).status, 401);

    const u = (await call('POST', '/account/users', { name: 'Finance Fred', email: 'Fred@Test.co', role: 'finance' })).body;
    assert.equal(u.email, 'fred@test.co');
    assert.equal((await call('POST', '/account/users', { name: 'Dup', email: 'fred@test.co', role: 'viewer' })).status, 409);
    assert.equal((await call('PATCH', '/account/users/' + u.id, { role: 'viewer' })).body.role, 'viewer');
    assert.equal((await call('POST', '/account/users', { name: 'Boss', email: 'b@test.co', role: 'owner' })).status, 400);

    assert.equal((await call('POST', '/account/ubos', { name: 'Siya M', idNumber: '9001015800087', ownershipPct: 60, nationality: 'South African' })).status, 201);
    assert.equal((await call('POST', '/account/ubos', { name: 'Other', ownershipPct: 50 })).status, 409);
    assert.equal((await call('POST', '/account/ubos', { name: 'Bad', idNumber: '123', ownershipPct: 5 })).status, 400);
    assert.equal((await call('PUT', '/account/profile', { business: { vat_number: '123' } })).status, 400);
    assert.equal((await call('PUT', '/account/profile', { business: { legal_name: 'Altegic (Pty) Ltd', vat_number: '4123456789' }, personal: { name: 'Siyasanga' } })).body.business.legal_name, 'Altegic (Pty) Ltd');
    assert.equal((await call('PUT', '/account/profile', { business: { evil: 'x' } })).status, 400);

    // documents: approving all required types verifies the merchant (back office action)
    const ids = [];
    for (const type of ['id_document', 'proof_of_address', 'company_registration', 'bank_letter']) ids.push((await call('POST', '/account/documents', { type, filename: type + '.pdf' })).body.id);
    assert.equal(mn.db.prepare('SELECT verified FROM merchants WHERE id=?').get(merchant.id).verified, 0);
    for (const id of ids) mn.account.reviewDocument(id, 'approved');
    assert.equal(mn.db.prepare('SELECT verified FROM merchants WHERE id=?').get(merchant.id).verified, 1);

    // notifications and audit trail
    await call('POST', '/payments', { amount: 12000, customer: { name: 'Thandi' } });
    await call('POST', '/payments', { amount: 3000, paymentToken: 'tok_decline' });
    const n = (await call('GET', '/notifications')).body;
    assert.ok(n.unread >= 2);
    assert.ok(n.data.some((x) => x.title === 'Payment received'));
    await call('POST', '/notifications/read');
    assert.equal((await call('GET', '/notifications')).body.unread, 0);
    await call('PUT', '/settings', { notifications: { payment_paid: false } });
    await call('POST', '/payments', { amount: 2000 });
    assert.equal((await call('GET', '/notifications')).body.unread, 0);
    const act = (await call('GET', '/account/activity')).body.data;
    assert.ok(act.some((a) => a.action === 'POST /api/payments' && a.actor.startsWith('key:')));
    assert.ok(!JSON.stringify(act).includes('tok_decline'));
  } finally { server.close(); mn.close(); }
});

test('point of sale: catalogue, staff PINs and itemised sales', async () => {
  const { mn, server, call } = await boot();
  try {
    const cat = (await call('POST', '/pos/categories', { name: 'Drinks' })).body;
    const prod = (await call('POST', '/pos/products', { name: 'Flat white', price: 2500, categoryId: cat.id })).body;
    assert.equal((await call('POST', '/pos/products', { name: 'Bad', price: 10, categoryId: 'cat_nope' })).status, 404);
    const staff = (await call('POST', '/pos/staff', { name: 'Zanele', role: 'cashier', pin: '1234' })).body;
    assert.equal((await call('POST', '/pos/staff', { name: 'Bad', pin: '12' })).status, 400);
    assert.ok(!JSON.stringify((await call('GET', '/pos/staff')).body).includes('pin'));
    const dev = (await call('POST', '/pos/devices', { name: 'Counter' })).body;

    const sale = (await call('POST', '/pos/sales', { deviceId: dev.id, amount: 1, staffId: staff.id, items: [{ productId: prod.id, qty: 3 }] })).body;
    assert.equal(sale.amount, 7500);                       // priced from the catalogue, not the client
    assert.equal(sale.staff_id, staff.id);
    assert.equal(sale.items[0].qty, 3);
    assert.equal((await call('POST', '/pos/sales', { deviceId: dev.id, items: [{ productId: 'prd_nope' }] })).status, 404);
    await call('DELETE', '/pos/products/' + prod.id);
    assert.equal((await call('POST', '/pos/sales', { deviceId: dev.id, items: [{ productId: prod.id }] })).status, 404);

    assert.equal((await call('POST', `/pos/staff/${staff.id}/verify-pin`, { pin: '1234' })).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', `/pos/staff/${staff.id}/verify-pin`, { pin: '0000' })).status, 401);
    assert.equal((await call('POST', `/pos/staff/${staff.id}/verify-pin`, { pin: '1234' })).status, 423);   // locked, even with the right PIN
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('banking: beneficiaries, scheduled payments, savings, bills, debit orders, insights', async () => {
  const { mn, server, call, as } = await boot();
  try {
    const acct = await fund(call);
    const bal0 = (await call('GET', '/bank/accounts')).body.data[0].balance;
    assert.ok(bal0 > 100000);
    assert.equal((await call('PATCH', '/bank/accounts/' + acct.id, { name: 'Trading account' })).body.name, 'Trading account');

    const ben = (await call('POST', '/bank/beneficiaries', { name: 'Kagiso', bank: 'FNB', accountNumber: '62012345678', branchCode: '250655' })).body;
    assert.equal((await call('PATCH', '/bank/beneficiaries/' + ben.id, { name: 'Kagiso Supplies' })).body.name, 'Kagiso Supplies');
    assert.equal((await call('PATCH', '/bank/beneficiaries/' + ben.id, { accountNumber: 'abc' })).status, 400);
    await call('POST', '/bank/transfers', { type: 'beneficiary', fromAccountId: acct.id, beneficiaryId: ben.id, amount: 1000, reference: 'Stock' });
    assert.equal((await call('GET', `/bank/beneficiaries/${ben.id}/history`)).body.data.length, 1);

    // scheduled and recurring payments
    const today = new Date().toISOString().slice(0, 10), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    assert.equal((await call('POST', '/bank/scheduled-payments', { fromAccountId: acct.id, beneficiaryId: ben.id, amount: 500, frequency: 'once', startDate: yesterday })).status, 400);
    const once = (await call('POST', '/bank/scheduled-payments', { fromAccountId: acct.id, beneficiaryId: ben.id, amount: 2000, frequency: 'once', startDate: today, reference: 'Rent' })).body;
    const monthly = (await call('POST', '/bank/scheduled-payments', { fromAccountId: acct.id, beneficiaryId: ben.id, amount: 3000, frequency: 'monthly', startDate: today })).body;
    const t = new Date(Date.now() + 1000);
    assert.deepEqual(await mn.banking.runScheduled(t), { paid: 2, failed: 0 });
    assert.deepEqual(await mn.banking.runScheduled(t), { paid: 0, failed: 0 });
    const list = (await call('GET', '/bank/scheduled-payments')).body.data;
    assert.equal(list.find((x) => x.id === once.id).status, 'completed');
    assert.ok(list.find((x) => x.id === monthly.id).next_run_at > monthly.next_run_at);
    await call('DELETE', '/bank/scheduled-payments/' + monthly.id);
    const big = (await call('POST', '/bank/scheduled-payments', { fromAccountId: acct.id, beneficiaryId: ben.id, amount: 40000000, frequency: 'once', startDate: today })).body;
    for (let i = 1; i <= 3; i++) await mn.banking.runScheduled(new Date(Date.now() + i * 2 * 864e5));
    assert.equal(mn.db.prepare('SELECT COUNT(*) n FROM scheduled_payments WHERE id=? AND failures>=1').get(big.id).n, 1);

    // savings: flexible, fixed-term and automatic
    const flex = (await call('POST', '/bank/savings-goals', { name: 'Holiday', target: 100000 })).body;
    await call('POST', `/bank/savings-goals/${flex.id}/deposit`, { fromAccountId: acct.id, amount: 10000 });
    await call('POST', `/bank/savings-goals/${flex.id}/withdraw`, { toAccountId: acct.id, amount: 4000 });
    assert.equal((await call('GET', '/bank/savings-goals')).body.data[0].saved, 6000);
    assert.equal((await call('POST', `/bank/savings-goals/${flex.id}/deposit`, { fromAccountId: acct.id, amount: 999999999 })).status, 409);
    assert.equal((await call('DELETE', '/bank/savings-goals/' + flex.id)).status, 409);
    const fixed = (await call('POST', '/bank/savings-goals', { name: 'Tax pot', target: 500000, lockUntil: new Date(Date.now() + 30 * 864e5).toISOString() })).body;
    await call('POST', `/bank/savings-goals/${fixed.id}/deposit`, { fromAccountId: acct.id, amount: 20000 });
    assert.equal((await call('POST', `/bank/savings-goals/${fixed.id}/withdraw`, { toAccountId: acct.id, amount: 100 })).body.error.code, 'locked');
    const auto = (await call('POST', '/bank/savings-goals', { name: 'Auto', target: 90000, autoAmount: 5000, autoFrequency: 'weekly', autoFromAccountId: acct.id })).body;
    assert.deepEqual(mn.banking.runSavings(new Date(Date.now() + 8 * 864e5)), { saved: 1, skipped: 0 });
    assert.equal((await call('GET', '/bank/savings-goals')).body.data.find((g) => g.id === auto.id).saved, 5000);

    // prepaid and bills
    assert.ok((await call('GET', '/bills/catalogue')).body.data.length >= 8);
    const air = await call('POST', '/bills/purchase', { productId: 'airtime', recipient: '0821234567', amount: 5000, accountId: acct.id });
    assert.equal(air.body.status, 'completed');
    const el = (await call('POST', '/bills/purchase', { productId: 'electricity', recipient: '12345678901', amount: 10000, accountId: acct.id })).body;
    assert.match(el.token, /^\d{4}( \d{4}){4}$/);
    assert.equal((await call('POST', '/bills/purchase', { productId: 'airtime', recipient: '123', amount: 5000, accountId: acct.id })).status, 400);
    assert.equal((await call('POST', '/bills/purchase', { productId: 'airtime', recipient: '0821234567', amount: 50, accountId: acct.id })).status, 400);
    assert.equal((await call('POST', '/bills/purchase', { productId: 'municipal', recipient: 'ACC-1234', amount: 4000000, accountId: acct.id })).status, 409);
    assert.equal((await call('GET', '/bills/purchases?category=Electricity')).body.data.length, 1);
    assert.equal((await call('POST', '/pos/prepaid', { productId: 'data-1gb', recipient: '0821234567', accountId: acct.id })).body.source, 'pos');

    // debit orders (DebiCheck): approve before anything is collected
    const d = (await call('POST', '/bank/debit-orders/simulate', { accountId: acct.id, creditor: 'Gym Co', amount: 45000, frequency: 'monthly', reference: 'Membership' })).body;
    assert.equal(d.status, 'pending_approval');
    assert.equal((await call('POST', `/bank/debit-orders/${d.id}/simulate-collect`)).status, 409);
    assert.equal((await call('POST', `/bank/debit-orders/${d.id}/approve`)).body.status, 'active');
    const before = (await call('GET', '/bank/accounts')).body.data[0].balance;
    await call('POST', `/bank/debit-orders/${d.id}/simulate-collect`);
    assert.equal((await call('GET', '/bank/accounts')).body.data[0].balance, before - 45000);
    assert.equal((await call('POST', `/bank/debit-orders/${d.id}/dispute`)).body.disputed, 1);
    assert.equal((await call('POST', `/bank/debit-orders/${d.id}/stop`)).body.status, 'stopped');
    assert.equal((await call('POST', `/bank/debit-orders/${d.id}/approve`)).status, 409);
    const d2 = (await call('POST', '/bank/debit-orders/simulate', { accountId: acct.id, creditor: 'Insurer', amount: 900000000 })).body;
    await call('POST', `/bank/debit-orders/${d2.id}/approve`);
    assert.equal((await call('POST', `/bank/debit-orders/${d2.id}/simulate-collect`)).status, 409);
    assert.equal(mn.db.prepare('SELECT last_result r FROM debit_orders WHERE id=?').get(d2.id).r, 'unpaid');

    // money management
    const sav = (await call('POST', '/bank/accounts', { name: 'Savings', kind: 'savings' })).body;
    await call('POST', '/bank/transfers', { type: 'own', fromAccountId: acct.id, toAccountId: sav.id, amount: 7000 });
    const ins = (await call('GET', '/bank/insights')).body;
    assert.equal(ins.net, ins.money_in - ins.money_out);
    const cats = ins.spending.map((s) => s.category);
    for (const c of ['Airtime', 'Electricity', 'Debit orders', 'Savings']) assert.ok(cats.includes(c), c);
    assert.ok(!cats.includes('Own transfer'));                 // moving money between your own accounts is not spending
    assert.ok(ins.income.some((i) => i.category === 'Sales payouts'));

    // another merchant can't touch any of it
    const other = mn.services.createMerchant('Other');
    const o = as(mn.services.issueApiKey(other.id));
    assert.equal((await o('POST', `/bank/savings-goals/${flex.id}/deposit`, { fromAccountId: acct.id, amount: 100 })).status, 404);
    assert.equal((await o('GET', '/bank/savings-goals')).body.data.length, 0);
    assert.equal((await o('POST', `/bank/debit-orders/${d.id}/approve`)).status, 404);
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});
