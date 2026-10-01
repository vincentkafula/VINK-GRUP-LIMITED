const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createManshya } = require('../core');
const { validSaId } = require('../core/util');

async function boot() {
  const mn = createManshya();
  const app = express();
  app.use('/api', mn.router);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const mk = (prefix, key) => async (method, path, body, headers = {}) => {
    const r = await fetch(base + prefix + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, ...headers } });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, ct, body: ct.includes('json') ? await r.json() : ct.includes('text') ? await r.text() : Buffer.from(await r.arrayBuffer()) };
  };
  const merchant = mn.services.createMerchant('Test Co', { verified: true });
  const key = mn.services.issueApiKey(merchant.id);
  return { mn, server, base, merchant, call: mk('', key), as: mk, adm: (k) => mk('/admin', k || mn.admin.issueAdminKey('root')) };
}
const ledgerOk = (mn) => {
  assert.equal(mn.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM entries').get().s, 0);
  assert.equal(mn.db.prepare('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').get().n, 0);
};
const sales = async (call, n = 4, amount = 1000000) => { for (let i = 0; i < n; i++) await call('POST', '/payments', { amount, customer: { email: `c${i}@x.co` }, reference: 'S' + i }); };
const acctOf = async (call) => (await call('GET', '/bank/accounts')).body.data[0];
const bal = async (call) => (await acctOf(call)).balance;
const monthsLater = (n) => new Date(Date.now() + n * 31 * 864e5);

test('credit: offers from trading history, credit line, term loan, interest and instalments', async () => {
  const { mn, server, merchant, call, adm } = await boot();
  try {
    const acct = await acctOf(call);
    assert.equal((await call('GET', '/credit/products')).body.data.length, 2);
    assert.equal((await call('POST', '/credit/apply', { product: 'credit_line', requested: 1000, accountId: acct.id })).status, 400);

    // no trading history yet: declined with a reason
    const none = (await call('POST', '/credit/apply', { product: 'credit_line', requested: 1000000, accountId: acct.id })).body;
    assert.equal(none.status, 'declined'); assert.match(none.reason, /trading history/);
    // an unverified business is told to verify first
    const unv = mn.services.createMerchant('Unverified'), uk = mn.services.issueApiKey(unv.id);
    const uc = (m, p, b) => fetch(`http://127.0.0.1:${server.address().port}/api${p}`, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + uk }, body: JSON.stringify(b) }).then((r) => r.json());
    const ua = (await uc('GET', '/bank/accounts')).data[0];
    assert.match((await uc('POST', '/credit/apply', { product: 'credit_line', requested: 1000000, accountId: ua.id })).reason, /Verify/);

    // R400,000 of sales in 90 days: 30% is R120,000, so the cap is the product maximum
    await sales(call, 40, 1000000);
    const offer = (await call('POST', '/credit/apply', { product: 'credit_line', requested: 2000000, accountId: acct.id })).body;
    assert.equal(offer.status, 'offered'); assert.equal(offer.offered_limit, 2000000);
    assert.equal((await call('POST', '/credit/apply', { product: 'credit_line', requested: 2000000, accountId: acct.id })).status, 409);   // one open offer at a time
    const fac = (await call('POST', `/credit/applications/${offer.id}/accept`)).body;
    assert.deepEqual([fac.limit, fac.owed, fac.available], [2000000, 0, 2000000]);
    assert.equal((await call('POST', `/credit/applications/${offer.id}/accept`)).status, 404);

    // draw and repay
    const b0 = await bal(call);
    assert.equal((await call('POST', `/credit/facilities/${fac.id}/draw`, { accountId: acct.id, amount: 500000 })).body.owed, 500000);
    assert.equal(await bal(call), b0 + 500000);
    assert.equal((await call('POST', `/credit/facilities/${fac.id}/draw`, { accountId: acct.id, amount: 1600000 })).body.error.code, 'over_limit');
    assert.equal((await call('POST', `/credit/facilities/${fac.id}/repay`, { accountId: acct.id, amount: 600000 })).body.error.code, 'overpayment');
    assert.equal((await call('POST', `/credit/facilities/${fac.id}/repay`, { accountId: acct.id, amount: 100000 })).body.owed, 400000);
    // interest is added once a month
    assert.deepEqual(mn.credit.runDue(monthsLater(1)).interest, 1);
    assert.equal((await call('GET', `/credit/facilities/${fac.id}`)).body.facility.owed, 400000 + Math.floor((400000 * 0.21) / 12));
    assert.equal(mn.credit.runDue(monthsLater(1)).interest, 0);

    // term loan: paid out at once, instalments collected automatically, missed ones retried and reported
    const loanOffer = (await call('POST', '/credit/apply', { product: 'term_loan', requested: 1200000, termMonths: 6, accountId: acct.id })).body;
    assert.equal((await call('POST', '/credit/apply', { product: 'term_loan', requested: 1200000, termMonths: 7, accountId: acct.id })).status, 400);
    const b1 = await bal(call);
    const loan = (await call('POST', `/credit/applications/${loanOffer.id}/accept`)).body;
    assert.equal(await bal(call), b1 + 1200000);
    assert.equal(loan.owed, 1200000);
    assert.equal(loan.instalment, mn.credit.pmt(1200000, 0.18, 6));
    assert.equal((await call('POST', `/credit/facilities/${loan.id}/draw`, { accountId: acct.id, amount: 100 })).body.error.code, 'not_revolving');
    const d1 = new Date(Date.now() + 32 * 864e5);
    const r1 = mn.credit.runDue(d1);
    assert.equal(r1.paid, 1);
    assert.ok((await call('GET', `/credit/facilities/${loan.id}`)).body.facility.owed < 1200000);
    // drain the account so the next instalment fails
    const rest = await bal(call);
    await call('POST', '/bank/accounts', { name: 'Other', kind: 'savings' });
    const other = (await call('GET', '/bank/accounts')).body.data[1];
    await call('POST', '/bank/transfers', { type: 'own', fromAccountId: acct.id, toAccountId: other.id, amount: rest });
    const r2 = mn.credit.runDue(new Date(Date.now() + 64 * 864e5));
    assert.equal(r2.missed, 1);
    assert.equal((await call('GET', `/credit/facilities/${loan.id}`)).body.facility.missed, 1);
    assert.ok((await call('GET', '/notifications')).body.data.some((n) => n.title === 'Loan instalment missed'));
    // paying the rest off closes the loan
    await call('POST', '/bank/transfers', { type: 'own', fromAccountId: other.id, toAccountId: acct.id, amount: rest });
    const owing = (await call('GET', `/credit/facilities/${loan.id}`)).body.facility.owed;
    const repaid = await call('POST', `/credit/facilities/${loan.id}/repay`, { accountId: acct.id });
    assert.equal(repaid.body.status, 'closed'); assert.equal(repaid.body.owed, 0);

    // you cannot borrow into someone else's account
    assert.equal((await call('POST', '/credit/apply', { product: 'term_loan', requested: 1000000, termMonths: 12, accountId: ua.id })).status, 404);
    // back office can approve an application the system declined
    const adminApp = (await call('POST', '/credit/apply', { product: 'term_loan', requested: 1000000, termMonths: 12, accountId: acct.id })).body;
    mn.db.prepare("UPDATE credit_applications SET status='declined',offered_limit=NULL WHERE id=?").run(adminApp.id);
    assert.equal((await adm()('POST', `/credit/applications/${adminApp.id}/decide`, { decision: 'approve', offeredLimit: 800000 })).body.offered_limit, 800000);
    assert.equal((await call('GET', '/credit/applications')).body.data.find((x) => x.id === adminApp.id).status, 'offered');
    assert.equal((await adm()('GET', '/credit')).body.facilities.length, 2);
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('insurance: quotes, premiums, lapsing and claims', async () => {
  const { mn, server, call, adm } = await boot();
  try {
    await sales(call, 2, 500000);
    const acct = await acctOf(call);
    await call('POST', '/payouts', { destination: { type: 'bank_account', accountId: acct.id } });
    assert.equal((await call('GET', '/insurance/products')).body.data.length, 3);
    const q = (await call('POST', '/insurance/quote', { product: 'funeral', cover: 2000000 })).body;
    assert.equal(q.premium, 7000);
    assert.equal((await call('POST', '/insurance/quote', { product: 'funeral', cover: 1234 })).status, 400);
    const b0 = await bal(call);
    const pol = (await call('POST', '/insurance/policies', { product: 'funeral', cover: 2000000, accountId: acct.id, beneficiary: 'Nomsa M.' })).body;
    assert.equal(await bal(call), b0 - 7000);

    // claims: natural causes wait, accidents do not
    assert.equal((await call('POST', '/insurance/claims', { policyId: pol.id, cause: 'natural', description: 'Test', amount: 2000000 })).body.status, 'rejected');
    assert.equal((await call('POST', '/insurance/claims', { policyId: pol.id, cause: 'accident', description: 'Car accident', amount: 99999999 })).status, 400);
    const cl = (await call('POST', '/insurance/claims', { policyId: pol.id, cause: 'accident', description: 'Car accident', amount: 1500000 })).body;
    assert.equal(cl.status, 'submitted');
    const b1 = await bal(call);
    assert.equal((await adm()('GET', '/claims?status=submitted')).body.data.length, 1);
    assert.equal((await adm()('POST', `/claims/${cl.id}/decide`, { decision: 'approve', amount: 1400000 })).body.paid, 1400000);
    assert.equal(await bal(call), b1 + 1400000);
    assert.equal((await adm()('POST', `/claims/${cl.id}/decide`, { decision: 'approve' })).status, 404);
    const cl2 = (await call('POST', '/insurance/claims', { policyId: pol.id, cause: 'accident', description: 'Second', amount: 100000 })).body;
    assert.equal((await adm()('POST', `/claims/${cl2.id}/decide`, { decision: 'decline', reason: 'Not covered' })).body.status, 'declined');

    // premiums collected monthly; three misses lapse the cover
    assert.deepEqual(mn.insurance.runPremiums(monthsLater(1)), { paid: 1, failed: 0 });
    assert.deepEqual(mn.insurance.runPremiums(monthsLater(1)), { paid: 0, failed: 0 });
    const rest = await bal(call);
    await call('POST', '/bank/accounts', { name: 'Pocket', kind: 'savings' });
    const pocket = (await call('GET', '/bank/accounts')).body.data[1];
    await call('POST', '/bank/transfers', { type: 'own', fromAccountId: acct.id, toAccountId: pocket.id, amount: rest });
    for (let i = 0; i < 3; i++) mn.insurance.runPremiums(new Date(Date.now() + (62 + i * 4) * 864e5 + 1));
    assert.equal((await call('GET', '/insurance/policies')).body.data[0].status, 'lapsed');
    assert.equal((await call('POST', '/insurance/claims', { policyId: pol.id, cause: 'accident', description: 'x', amount: 100000 })).status, 404);   // lapsed cover cannot claim
    assert.equal((await call('POST', `/insurance/policies/${pol.id}/cancel`)).body.status, 'cancelled');
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});

test('uploads, settlement import, back-office roles and the identity check', async () => {
  const { mn, server, base, merchant, call, as, adm } = await boot();
  try {
    // document uploads: type is decided by the file's bytes, not its name
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 65)]).toString('base64');
    const up = (b) => call('POST', '/account/documents/upload', b);
    const doc = (await up({ type: 'id_document', filename: '../../etc/passwd.pdf', contentBase64: pdf })).body;
    assert.equal(doc.filename, 'passwd.pdf');
    assert.equal((await up({ type: 'id_document', filename: 'x.pdf', contentBase64: Buffer.from('<script>alert(1)</script>').toString('base64') })).status, 400);
    assert.equal((await up({ type: 'id_document', filename: 'big.pdf', contentBase64: Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(2.2 * 1024 * 1024)]).toString('base64') })).status, 400);
    assert.equal((await up({ type: 'selfie', filename: 'x.pdf', contentBase64: pdf })).status, 400);
    const root = adm();
    const file = await root('GET', `/documents/${doc.id}/file`);
    assert.equal(file.ct, 'application/pdf'); assert.equal(file.body.subarray(0, 4).toString(), '%PDF');
    assert.equal((await root('GET', '/documents/doc_nope/file')).status, 404);
    // a 1 MB JSON body is rejected on every other route
    assert.equal((await call('POST', '/payments', { amount: 100, reference: 'x'.repeat(200000) })).status, 413);

    // settlement import
    await call('POST', '/payments', { amount: 12550, reference: 'A' });
    await call('POST', '/payments', { amount: 30000, reference: 'B' });
    await call('POST', '/payments', { amount: 9900, reference: 'C' });
    const refs = mn.db.prepare('SELECT reference r, gateway_ref g FROM payments ORDER BY reference').all().reduce((o, x) => ({ ...o, [x.r]: x.g }), {});
    const today = new Date().toISOString().slice(0, 10);
    const csv = `gateway_ref,amount,date\n${refs.A},125.50,${today}\n${refs.B},299.00,${today}\nGHOST-1,50.00,${today}\n`;
    const rec = (await call('POST', '/reports/reconciliation/import', { csv })).body;
    assert.deepEqual([rec.summary.matched, rec.summary.amount_mismatch, rec.summary.not_in_our_records, rec.summary.missing_from_file], [1, 1, 1, 1]);
    assert.equal(rec.amount_mismatch[0].our_amount, 30000);
    assert.equal(rec.missing_from_file[0].gateway_ref, refs.C);
    assert.equal((await call('POST', '/reports/reconciliation/import', { csv: 'foo,bar\n1,2' })).status, 400);
    assert.equal((await call('POST', '/reports/reconciliation/import', { csv: 'gateway_ref,amount\nX,abc' })).status, 400);

    // back-office roles
    const comp = adm(mn.admin.issueAdminKey('risk', 'compliance')), sup = adm(mn.admin.issueAdminKey('help', 'support'));
    assert.equal((await sup('GET', '/overview')).status, 200);
    assert.equal((await sup('POST', `/merchants/${merchant.id}/status`, { status: 'suspended' })).status, 403);
    assert.equal((await comp('POST', `/merchants/${merchant.id}/status`, { status: 'suspended', reason: 't' })).status, 200);
    await comp('POST', `/merchants/${merchant.id}/status`, { status: 'active', reason: 't' });
    const t = (await call('POST', '/support/tickets', { subject: 'Hi', message: 'Hello' })).body;
    assert.equal((await comp('POST', `/support/${t.id}/reply`, { message: 'x' })).status, 403);
    assert.equal((await sup('POST', `/support/${t.id}/reply`, { message: 'Hello back' })).status, 200);
    assert.equal((await comp('POST', '/keys', { label: 'x', role: 'support' })).status, 403);
    assert.equal((await root('POST', '/keys', { label: 'new', role: 'support' })).status, 201);
    assert.equal((await root('POST', '/keys', { label: 'new', role: 'god' })).status, 400);

    // identity check at onboarding: a referred check must be reviewed before approval
    const idn = (() => { for (let d = 0; d < 10; d++) if (validSaId('800101500908' + d)) return '800101500908' + d; })();
    const apply = (n, email) => fetch(base + '/public/onboarding/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessName: 'B', ownerName: n, idNumber: idn, email }) }).then((r) => r.json());
    const ok = await apply('Ayanda F', 'ok@x.co'), ref = await apply('Please REFER me', 'ref@x.co');
    const apps = (await root('GET', '/applications')).body.data;
    assert.equal(apps.find((a) => a.id === ok.id).identity_status, 'verified');
    assert.equal(apps.find((a) => a.id === ref.id).identity_status, 'refer');
    assert.equal((await comp('POST', `/applications/${ref.id}/decide`, { decision: 'approve' })).status, 409);
    assert.equal((await comp('POST', `/applications/${ref.id}/decide`, { decision: 'approve', override: true })).body.status, 'approved');
    ledgerOk(mn);
  } finally { server.close(); mn.close(); }
});
