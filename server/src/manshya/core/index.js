const { openDb } = require('./db');
const { buildLedger, A } = require('./ledger');
const { buildEmitter } = require('./webhooks');
const buildServices = require('./services');
const buildRouter = require('./routes');
const buildAccount = require('./account');
const buildOnline = require('./online');
const buildCatalog = require('./catalog');
const buildBanking = require('./banking');
const buildRoutes2 = require('./routes2');
const buildRoutes3 = require('./routes3');
const buildAdmin = require('./admin');
const buildStatements = require('./statements');
const buildPayments2 = require('./payments2');
const buildCards = require('./cards');
const buildExtras = require('./extras');
const buildCredit = require('./credit');
const buildInsurance = require('./insurance');
const { localDisk } = require('./storage');
const os = require('os');
const path = require('path');
const { rid, now } = require('./util');
const { mockGateway, mockRails, mockBills, mockMailer, mockVehicle, mockIdentity } = require('./gateways');
const { sha256 } = require('./util');

const DEFAULTS = {
  mode: 'test',                       // 'test' | 'live' (only changes the API key prefix)
  defaultGateway: 'mock',
  fees: {                             // fee = round(amount * pct) + fixed (cents)
    online: { pct: 0.029, fixed: 100 },
    pos: { pct: 0.025, fixed: 0 },
  },
  payoutFee: 850,                     // R8.50
  reservePct: 0.10,                   // share of net sales held back for unverified merchants
  reservePctVerified: 0,
  bank: { perTransferLimit: 50000000, dailyExternalLimit: 5000000 }, // R500,000 and R50,000
  allowInsecureWebhooks: false,
  payoutApprovalThreshold: 5000000,   // payouts above R50,000 requested by a finance user wait for an admin
  chargebackFee: 15000,               // R150 per lost dispute
  fraud: { largeAmount: 5000000, velocity: 5, declineSpike: 5, windowMinutes: 10 },
  bankName: 'Manshya Finance', branchCode: '000001', swift: 'MNSHZAJJ',
  payshapLimit: 300000,               // R3,000 per instant payment (set to your rail's limit)
  cash: { maxAmount: 300000, expiresHours: 72 },
  fx: { rates: { USD: 18.2, EUR: 19.8, GBP: 23.1 }, markupPct: 0.015, fee: 15000, maxPerPayment: 100000000 },
  savings: { flexibleApr: 0.05, fixedApr: 0.075 },
  rewards: { Airtime: 0.02, Data: 0.02, SMS: 0.02, Electricity: 0.005, Water: 0.005, card: 0.005 },
  cardAgreementVersion: '2026-01',
  credit: {
    salesShare: 0.3, minOffer: 500000,
    products: [
      { id: 'credit_line', name: 'Business credit line', apr: 0.21, min: 500000, max: 5000000, revolving: true },
      { id: 'term_loan', name: 'Business term loan', apr: 0.18, min: 1000000, max: 5000000, terms: [6, 12, 24] },
    ],
  },
  insurance: {
    minPremium: 3500,
    products: [
      { id: 'funeral', name: 'Funeral cover', covers: [1000000, 2000000, 3000000, 5000000], rate: 0.0035, waitingDays: 180, summary: 'A payout to your family. Natural causes are covered after a 6 month waiting period, accidents straight away.' },
      { id: 'life', name: 'Life cover', covers: [10000000, 25000000, 50000000], rate: 0.0012, waitingDays: 90, summary: 'A lump sum for your dependants. Natural causes are covered after 3 months.' },
      { id: 'business', name: 'Business contents cover', covers: [5000000, 10000000, 25000000], rate: 0.0015, waitingDays: 0, summary: 'Stock and equipment against theft and damage, from day one.' },
    ],
  },
};

/**
 * createManshya(options) -> { router, services, db, ledger, authenticate }
 *  options.db / options.dbPath     an existing better-sqlite3 handle, or a file path (default: in-memory)
 *  options.authenticate(req)       async (req) => ({ merchantId }) | null. Plug in your existing auth.
 *                                  Default: `Authorization: Bearer mk_...` API keys.
 *  options.adminAuthenticate(req)  async (req) => ({ actor, role }) | null for /admin routes. Tried first; `mka_...` admin keys still work as a fallback.
 *  options.paymentsMode              'sandbox' | 'live' (default derived from config.mode). Recorded on every money row; a database is bound to one mode.
 *  options.gateways                { name: adapter }  (see src/gateways.js for the contract)
 *  options.rails                   bank rail adapter ({ send })
 *  options.config                  overrides for DEFAULTS
 */
function createManshya(options = {}) {
  const config = {
    ...DEFAULTS, ...options.config,
    fees: { ...DEFAULTS.fees, ...(options.config || {}).fees },
    bank: { ...DEFAULTS.bank, ...(options.config || {}).bank },
  };
  const db = openDb({ ...options, mode: options.paymentsMode || (config.mode === 'live' ? 'live' : 'sandbox') });
  const ledger = buildLedger(db);
  const baseEmit = buildEmitter(db);
  const mailer = options.mailer || mockMailer();
  // Email bodies are only kept in test mode (they can contain one-time codes).
  const mail = (mid, to, subject, body, attachments) => {
    try { db.prepare('INSERT INTO emails(id,merchant_id,to_addr,subject,body,created_at) VALUES(?,?,?,?,?,?)').run(rid('mail'), mid, to, subject, config.mode === 'test' ? body : '[not stored]', now()); } catch {}
    Promise.resolve(mailer.send({ to, subject, text: body, attachments })).catch(() => {});
  };
  const hooks = {};
  let account;                                   // built after the core services; used for in-app notifications
  const R = (c) => 'R ' + (c / 100).toFixed(2);
  const NOTE = {
    'payment.paid': ['payment_paid', 'Payment received', (d) => `${R(d.amount)} from ${(d.customer && d.customer.name) || d.reference || 'a customer'}`],
    'payment.failed': ['payment_failed', 'Payment failed', (d) => `${R(d.amount)} was declined`],
    'payout.created': ['payout', 'Payout sent', (d) => `${R(d.net)} is on its way`],
    'payout.failed': ['payout', 'Payout failed', () => 'The money was returned to your balance'],
    'transfer.failed': ['transfer', 'Transfer failed', () => 'The money was returned to your account'],
    'subscription.failed': ['payment_failed', 'Subscription charge failed', (d) => `Attempt ${d.failures}`],
    'debit_order.disputed': ['transfer', 'Debit order disputed', () => 'We have logged your dispute'],
    'payout.pending_approval': ['payout', 'Payout waiting for approval', (d) => `${R(d.net)} needs an admin to approve it`],
    'transfer.received': ['transfer', 'Money received', (d) => R(d.amount)],
  };
  const emit = (merchantId, type, data) => {
    const id = baseEmit(merchantId, type, data);
    const n = NOTE[type];
    try {
      if (n && account) {
        const s = account.getSettings({ id: merchantId });
        if (s.notifications[n[0]] !== false) {
          account.notify(merchantId, type, n[1], n[2](data));
          const to = services.profileEmail({ id: merchantId });
          if (s.notifications.email && to) mail(merchantId, to, n[1], n[2](data));
        }
      }
    } catch {}
    return id;
  };
  const gateways = { mock: mockGateway(), ...options.gateways };
  for (const [k, g] of Object.entries(gateways)) g.name = g.name || k;
  const rails = options.rails || mockRails();
  const services = buildServices({ db, ledger, gateways, rails, config, emit, hooks });

  const dir = options.storageDir || (options.dbPath && options.dbPath !== ':memory:' ? path.join(path.dirname(path.resolve(options.dbPath)), 'uploads') : path.join(os.tmpdir(), 'manshya-uploads'));
  const storage = options.storage || localDisk(dir);
  account = buildAccount({ db, core: services, config, storage });
  const online = buildOnline({ db, core: services, emit, config });
  const catalog = buildCatalog({ db });
  const rewardsRef = { earn: (...a) => extras.earn(...a) };           // cards and banking earn cashback through extras (built below)
  const banking = buildBanking({ db, ledger, core: services, bills: options.bills || mockBills(), emit, config, notify: account.notify, rewards: rewardsRef });
  const cards = buildCards({ db, ledger, config, rewards: rewardsRef, notify: account.notify });
  const extras = buildExtras({ db, ledger, core: services, cards, vehicle: options.vehicle || mockVehicle(), config, mail, notify: account.notify });
  const admin = buildAdmin({ db, ledger, core: services, account, config, mail, emit, identity: options.identity || mockIdentity() });
  const credit = buildCredit({ db, ledger, core: services, config, notify: account.notify, emit });
  const insurance = buildInsurance({ db, ledger, core: services, config, notify: account.notify, emit });
  // Back-office sign-in can be supplied by the host app (e.g. staff JWTs) instead of admin API keys.
  if (options.adminAuthenticate) { const keyAuth = admin.authenticate; admin.authenticate = async (req) => (await options.adminAuthenticate(req)) || keyAuth(req); }
  hooks.payment = admin.onPayment;
  const statements = buildStatements({ db, core: services, config, online, mail });
  const p2 = buildPayments2({ db, ledger, core: services, rails, config, emit, notify: account.notify });
  const routes3 = buildRoutes3({ admin, statements, p2, cards, extras, banking, credit, insurance, account, rails, config, core: services });
  const routes2 = buildRoutes2({ core: services, account, online, catalog, banking, config });

  // Run this on a timer (every minute is fine): subscriptions, payout schedules, scheduled payments, auto-savings.
  const runDue = async (at = new Date()) => ({ subscriptions: await online.runSubscriptions(at), payout_schedules: await online.runPayoutSchedules(at), scheduled_payments: await banking.runScheduled(at), savings: banking.runSavings(at), interest: banking.accrueInterest(at), cash: p2.runCash(at), credit: credit.runDue(at), premiums: insurance.runPremiums(at) });
  const startScheduler = (ms = 60000) => { const t = setInterval(() => runDue().catch((e) => console.error('scheduler', e.message)), ms); t.unref(); return () => clearInterval(t); };

  const byKey = async (req) => {
    const m = /^Bearer (mk_(?:test|live)_[A-Za-z0-9_-]{20,})$/.exec(req.get('authorization') || '');
    if (!m) return null;
    const row = db.prepare('SELECT merchant_id,role,hint FROM api_keys WHERE hash=? AND revoked=0').get(sha256(m[1]));
    return row ? { merchantId: row.merchant_id, role: row.role, actor: 'key:…' + row.hint } : null;
  };
  const authenticate = options.authenticate || byKey;
  const router = buildRouter({ db, services, gateways, config, authenticate, routes2, routes3 });
  return { router, services, account, online, catalog, banking, admin, statements, payments2: p2, cards, extras, credit, insurance, mail, runDue, startScheduler, db, ledger, config, gateways, A, close: () => db.close() };
}
module.exports = { createManshya, DEFAULTS };
