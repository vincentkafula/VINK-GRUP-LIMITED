// Demo data only. Backdates some payments so the charts have history. Never run against production.
const { A } = require('./ledger');

const NAMES = ['Thandi M.', 'Kagiso Traders', 'Lerato D.', 'Bongani N.', 'Nomsa K.', 'Sipho Z.', 'Zanele P.', 'Ayanda F.', 'Palesa R.', 'Mpho T.'];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

async function seed(mn) {
  const s = mn.services;
  const m = s.createMerchant('Altegic', { id: 'mer_demo' });
  const cur = s.listAccounts(m)[0];

  // online sales across last month and this month
  const today = new Date();
  for (let i = 0; i < 44; i++) {
    const name = NAMES[rnd(0, NAMES.length - 1)];
    const p = await s.createPayment(m, {
      amount: rnd(9000, 160000), method: 'card', reference: `INV-${1000 + i}`,
      customer: { name, email: name.toLowerCase().replace(/[^a-z]/g, '') + '@example.com' },
    });
    const thisMonth = i % 5 !== 0;
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (thisMonth ? 0 : 1), thisMonth ? rnd(1, Math.max(1, today.getUTCDate())) : rnd(1, 28), rnd(7, 19), rnd(0, 59)));
    const stamp = (d > today ? today : d).toISOString();
    mn.db.prepare('UPDATE payments SET created_at=?,settled_at=? WHERE id=?').run(stamp, stamp, p.id);
  }

  // card machines and today's in-person sales
  const dev = ['Counter 1', 'Counter 2'].map((n) => s.createDevice(m, { name: n }));
  mn.db.prepare('INSERT INTO devices(id,merchant_id,name,created_at) VALUES(?,?,?,?)').run('dev_van', m.id, 'Delivery van', new Date().toISOString());
  for (const d of dev) for (let i = 0; i < rnd(5, 9); i++) await s.createPayment(m, { channel: 'pos', deviceId: d.id, amount: rnd(2500, 60000), method: i % 4 ? 'card' : 'qr' });
  await s.createPayment(m, { channel: 'pos', deviceId: dev[0].id, amount: 42000, paymentToken: 'tok_decline' });

  // banking
  mn.db.transaction(() => mn.ledger.post('deposit', [
    { account: A.in, amount: -3000000, kind: 'system' },
    { account: A.bank(cur.id), merchant: m.id, kind: 'bank', amount: 3000000 },
  ], { memo: 'Opening deposit' })).immediate();
  const sav = s.createBankAccount(m.id, { name: 'Savings pocket', kind: 'savings' });
  const bal = s.balance(m);
  await s.requestPayout(m, { amount: Math.floor(bal.available / 2), destination: { type: 'bank_account', accountId: cur.id } });
  await s.transfer(m, { type: 'own', fromAccountId: cur.id, toAccountId: sav.id, amount: 850000, reference: 'Savings' });
  const ben = s.createBeneficiary(m, { name: 'Kagiso Supplies', bank: 'FNB', accountNumber: '62012345678', branchCode: '250655' });
  const bill = s.createBeneficiary(m, { name: 'City Power', bank: 'Standard Bank', accountNumber: '1029384756', branchCode: '051001' });
  await s.transfer(m, { type: 'beneficiary', fromAccountId: cur.id, beneficiaryId: ben.id, amount: 420000, reference: 'Stock order' });
  await s.transfer(m, { type: 'beneficiary', fromAccountId: cur.id, beneficiaryId: bill.id, amount: 185000, reference: 'Electricity' });
  s.issueCard(m, { accountId: cur.id, limit: 1200000 });

  // catalogue, staff and itemised card machine sales
  const drinks = mn.catalog.createCategory(m, { name: 'Drinks' }), food = mn.catalog.createCategory(m, { name: 'Food' });
  const flat = mn.catalog.createProduct(m, { name: 'Flat white', price: 3200, categoryId: drinks.id });
  const muffin = mn.catalog.createProduct(m, { name: 'Blueberry muffin', price: 2800, categoryId: food.id });
  mn.catalog.createProduct(m, { name: 'Filter coffee', price: 2400, categoryId: drinks.id });
  const cashier = mn.catalog.createStaff(m, { name: 'Zanele', role: 'cashier', pin: '2468' });
  for (let i = 0; i < 4; i++) await s.createPayment(m, { channel: 'pos', deviceId: dev[0].id, staffId: cashier.id, items: [{ productId: flat.id, qty: rnd(1, 3) }, { productId: muffin.id, qty: rnd(1, 2) }] });

  // subscriptions, saved cards, payout schedule, payment button, scheduled payment
  const c1 = mn.online.saveCard(m, { customerEmail: 'thandi@example.com', token: 'tok_demo_1', brand: 'Visa', last4: '4242', expiry: '08/28' });
  const c2 = mn.online.saveCard(m, { customerEmail: 'sipho@example.com', token: 'tok_demo_2', brand: 'Mastercard', last4: '5100', expiry: '11/27' });
  mn.online.createSubscription(m, { savedCardId: c1.id, amount: 29900, interval: 'monthly', customerName: 'Thandi M.', startDate: new Date(Date.now() + 9 * 864e5).toISOString() });
  mn.online.createSubscription(m, { savedCardId: c2.id, amount: 9900, interval: 'weekly', customerName: 'Sipho Z.', startDate: new Date(Date.now() + 3 * 864e5).toISOString() });
  mn.online.createSchedule(m, { frequency: 'weekly', day: 5, minAmount: 50000, destination: { type: 'bank_account', accountId: cur.id } });
  mn.online.createButton(m, { label: 'Book a consultation', amount: 45000 });
  s.createRequest(m, { amount: 125000, description: 'Deposit for order 1042', customerEmail: 'nomsa@example.com' });
  s.createRequest(m, { amount: 38000, description: 'Invoice INV-1031' });
  mn.banking.createScheduled(m, { fromAccountId: cur.id, beneficiaryId: bill.id, amount: 185000, frequency: 'monthly', startDate: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), reference: 'Electricity' });
  mn.banking.createGoal(m, { name: 'New card machines', target: 2000000, autoAmount: 250000, autoFrequency: 'monthly', autoFromAccountId: cur.id });
  const tax = mn.banking.createGoal(m, { name: 'Tax pot', target: 5000000, lockUntil: new Date(Date.now() + 90 * 864e5).toISOString() });
  mn.banking.deposit(m, tax.id, { fromAccountId: cur.id, amount: 500000 });
  await mn.banking.buy(m, { productId: 'airtime', recipient: '0821234567', amount: 10000, accountId: cur.id });
  await mn.banking.buy(m, { productId: 'electricity', recipient: '12345678901', amount: 50000, accountId: cur.id });
  await mn.banking.buy(m, { productId: 'data-1gb', recipient: '0831112222', accountId: cur.id }, 'pos');
  mn.banking.createMandate({ accountNumber: cur.number, creditor: 'Fitness First', reference: 'Membership', amount: 69900, frequency: 'monthly' });
  const gym = mn.banking.createMandate({ accountNumber: cur.number, creditor: 'Insure Co', reference: 'Policy 88123', amount: 145000, frequency: 'monthly' });
  mn.banking.setDebit(m, gym.id, 'approve'); mn.banking.collectDebit(gym.id);

  // cards, rewards, requests, support, disputes and an application waiting for review
  const vc = mn.cards.order(m, { accountId: cur.id, kind: 'virtual', limit: 500000, dailyLimit: 100000 }); mn.cards.activate(m, vc.id);
  mn.cards.authorize(m, { cardId: vc.id, amount: 24900, channel: 'online', descriptor: 'Cloud hosting' });
  mn.cards.authorize(m, { cardId: vc.id, amount: 8900, channel: 'online', descriptor: 'Office supplies' });
  mn.extras.createTicket(m, { category: 'payments', subject: 'Question about my last payout', message: 'Could you confirm when my last payout reached the bank?' });
  const sale = (await s.listPayments(m, { channel: 'online', status: 'paid', limit: 1 })).data[0];
  if (sale) mn.admin.openDispute({ paymentId: sale.id, amount: Math.min(sale.amount, 30000), reason: 'Customer does not recognise the charge' });
  mn.admin.apply({ businessName: 'Sunrise Bakery', ownerName: 'Palesa Radebe', idNumber: '8001015009087', email: 'palesa@sunrise.example', phone: '0821230000' });
  mn.banking.accrueInterest(new Date(Date.now() + 32 * 864e5));
  const ca = mn.credit.apply(m, { product: 'credit_line', requested: 2000000, accountId: cur.id });
  mn.credit.adminDecide(ca.id, { decision: 'approve', offeredLimit: 1500000 });
  mn.insurance.buy(m, { product: 'funeral', cover: 2000000, accountId: cur.id, beneficiary: 'My family' });
  mn.account.addDocumentFile(m, { type: 'company_registration', filename: 'cipc-certificate.pdf', contentBase64: Buffer.concat([Buffer.from('%PDF-1.4\n% demo document\n'), Buffer.alloc(64, 32)]).toString('base64') });

  // demo: a burst of declined cards from one customer, which the fraud rules flag for review
  for (let i = 0; i < 5; i++) await s.createPayment(m, { amount: 15900, paymentToken: 'tok_decline', customer: { name: 'Test Buyer', email: 'testing@example.com' }, reference: 'Card test ' + (i + 1) });

  // account details
  mn.account.updateProfile(m, { business: { legal_name: 'Altegic (Pty) Ltd', trading_name: 'Altegic', industry: 'Retail and services', phone: '+27 21 555 0100' }, personal: { name: 'Siyasanga Mahlulo', email: 'siya@altegic.example' } });
  mn.account.createUbo(m, { name: 'Siyasanga Mahlulo', ownershipPct: 70, nationality: 'South African' });
  mn.account.addDocument(m, { type: 'id_document', filename: 'id-siyasanga.pdf' });
  mn.account.addDocument(m, { type: 'proof_of_address', filename: 'utility-bill.pdf' });
  mn.account.inviteUser(m, { name: 'Lerato Dlamini', email: 'lerato@altegic.example', role: 'finance' });
  return m;
}
module.exports = { seed };
