const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS merchants(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
  webhook_url TEXT, webhook_secret TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys(
  hash TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id),
  label TEXT, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);

-- Double-entry ledger. Every journal's entries sum to zero. Balances are SUM(entries.amount).
CREATE TABLE IF NOT EXISTS ledger_accounts(
  id TEXT PRIMARY KEY, merchant_id TEXT, kind TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'ZAR');
CREATE TABLE IF NOT EXISTS journals(
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, memo TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT, journal_id TEXT NOT NULL REFERENCES journals(id),
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id), amount INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_entries_account ON entries(account_id, id);

CREATE TABLE IF NOT EXISTS payments(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, channel TEXT NOT NULL, method TEXT,
  amount INTEGER NOT NULL, fee INTEGER NOT NULL DEFAULT 0, refunded INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR', status TEXT NOT NULL, failure_reason TEXT,
  reference TEXT, customer_name TEXT, customer_email TEXT,
  gateway TEXT, gateway_ref TEXT, device_id TEXT, created_at TEXT NOT NULL, settled_at TEXT);
CREATE INDEX IF NOT EXISTS ix_pay_merchant ON payments(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS ix_pay_gateway ON payments(gateway, gateway_ref);

CREATE TABLE IF NOT EXISTS payment_requests(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL,
  description TEXT, customer_email TEXT, status TEXT NOT NULL, payment_id TEXT,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS payouts(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, gross INTEGER NOT NULL, fee INTEGER NOT NULL,
  net INTEGER NOT NULL, status TEXT NOT NULL, destination_type TEXT NOT NULL, destination_ref TEXT,
  rail_ref TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS devices(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  last_seen TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS bank_accounts(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS beneficiaries(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, bank TEXT NOT NULL,
  account_number TEXT NOT NULL, branch_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transfers(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, from_account TEXT NOT NULL, kind TEXT NOT NULL,
  to_ref TEXT, amount INTEGER NOT NULL, reference TEXT, status TEXT NOT NULL, rail_ref TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cards(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, brand TEXT NOT NULL,
  last4 TEXT NOT NULL, spend_limit INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS idempotency(
  key TEXT NOT NULL, merchant_id TEXT NOT NULL, sig TEXT NOT NULL, status_code INTEGER, response TEXT,
  created_at TEXT NOT NULL, PRIMARY KEY(key, merchant_id));
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL,
  created_at TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0);
`;
const EXTRA = `CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited', created_at TEXT NOT NULL, UNIQUE(merchant_id,email));
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, merchant_id TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, status INTEGER, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_audit ON audit_log(merchant_id,id);
CREATE TABLE IF NOT EXISTS ubos(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, id_number TEXT, ownership_pct INTEGER NOT NULL,
  nationality TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, type TEXT NOT NULL, filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
  read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_notif ON notifications(merchant_id,created_at);

CREATE TABLE IF NOT EXISTS saved_cards(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, customer_email TEXT NOT NULL, gateway TEXT NOT NULL, token TEXT NOT NULL,
  brand TEXT NOT NULL, last4 TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, customer_name TEXT, customer_email TEXT NOT NULL, saved_card_id TEXT NOT NULL,
  amount INTEGER NOT NULL, interval TEXT NOT NULL, next_charge_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  failures INTEGER NOT NULL DEFAULT 0, last_payment_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payout_schedules(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, frequency TEXT NOT NULL, day INTEGER, min_amount INTEGER NOT NULL,
  destination_type TEXT NOT NULL, destination_ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  last_run_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_buttons(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, label TEXT NOT NULL, amount INTEGER,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL, price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', failed INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS scheduled_payments(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, from_account TEXT NOT NULL, beneficiary_id TEXT NOT NULL, amount INTEGER NOT NULL,
  reference TEXT, frequency TEXT NOT NULL, next_run_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  failures INTEGER NOT NULL DEFAULT 0, last_result TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS savings_goals(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, target INTEGER NOT NULL, lock_until TEXT,
  auto_amount INTEGER, auto_frequency TEXT, auto_from TEXT, next_auto_at TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bill_purchases(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, product TEXT NOT NULL, category TEXT NOT NULL,
  recipient TEXT NOT NULL, amount INTEGER NOT NULL, token TEXT, reference TEXT, status TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'bank', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS debit_orders(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, creditor TEXT NOT NULL, reference TEXT,
  amount INTEGER NOT NULL, frequency TEXT NOT NULL, status TEXT NOT NULL, debicheck INTEGER NOT NULL DEFAULT 1,
  disputed INTEGER NOT NULL DEFAULT 0, last_collected_at TEXT, last_result TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_keys(hash TEXT PRIMARY KEY, label TEXT, hint TEXT, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications(
  id TEXT PRIMARY KEY, business_name TEXT NOT NULL, owner_name TEXT NOT NULL, id_number TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  status TEXT NOT NULL DEFAULT 'submitted', merchant_id TEXT, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fraud_flags(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, payment_id TEXT, rule TEXT NOT NULL, detail TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS disputes(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, payment_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'open',
  evidence TEXT, outcome TEXT, created_at TEXT NOT NULL, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS emails(id TEXT PRIMARY KEY, merchant_id TEXT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS statement_stamps(id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, hash TEXT NOT NULL, period TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rtp(
  id TEXT PRIMARY KEY, requester_merchant TEXT NOT NULL, requester_account TEXT NOT NULL, payer_merchant TEXT NOT NULL, payer_account TEXT NOT NULL,
  amount INTEGER NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inbound_credits(
  rail_ref TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, sender TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cash_vouchers(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, from_account TEXT NOT NULL, phone TEXT NOT NULL, amount INTEGER NOT NULL, code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fx_quotes(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, currency TEXT NOT NULL, rate REAL NOT NULL, foreign_amount INTEGER NOT NULL, zar INTEGER NOT NULL,
  fee INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS international_payments(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, from_account TEXT NOT NULL, beneficiary TEXT NOT NULL, currency TEXT NOT NULL, foreign_amount INTEGER NOT NULL,
  zar_amount INTEGER NOT NULL, fee INTEGER NOT NULL, rate REAL NOT NULL, purpose TEXT NOT NULL, status TEXT NOT NULL, rail_ref TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS card_transactions(
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, merchant_id TEXT NOT NULL, amount INTEGER NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
  reason TEXT, descriptor TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY AUTOINCREMENT, merchant_id TEXT NOT NULL, memo TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_tickets(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicle_renewals(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, plate TEXT NOT NULL, amount INTEGER NOT NULL, delivery TEXT, status TEXT NOT NULL,
  reference TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS buyer_links(
  merchant_id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT, expires_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, verified_at TEXT);

CREATE TABLE IF NOT EXISTS credit_applications(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, product TEXT NOT NULL, requested INTEGER NOT NULL, term_months INTEGER, account_id TEXT,
  status TEXT NOT NULL, offered_limit INTEGER, apr REAL, reason TEXT, expires_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_facilities(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, application_id TEXT, product TEXT NOT NULL, limit_amount INTEGER NOT NULL, apr REAL NOT NULL,
  term_months INTEGER, instalment INTEGER, autopay_account TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', last_interest TEXT, next_due TEXT,
  missed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS policies(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, account_id TEXT NOT NULL, product TEXT NOT NULL, cover INTEGER NOT NULL, premium INTEGER NOT NULL,
  beneficiary TEXT, status TEXT NOT NULL DEFAULT 'active', waiting_until TEXT NOT NULL, next_due TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS claims(
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, policy_id TEXT NOT NULL, cause TEXT NOT NULL, description TEXT, amount INTEGER NOT NULL,
  status TEXT NOT NULL, paid INTEGER, reason TEXT, created_at TEXT NOT NULL, decided_at TEXT);
`;

// Tables whose rows are tagged with the payments mode ('sandbox' | 'live') they were created in.
const MODE_TABLES = ['authorisations', 'journals', 'payments', 'payouts', 'transfers', 'card_transactions', 'bill_purchases', 'international_payments', 'inbound_credits', 'cash_vouchers'];

function openDb({ db, dbPath = ':memory:', mode = 'sandbox' } = {}) {
  const conn = db || new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  conn.exec(EXTRA);

  // A database belongs to ONE mode for its whole life, so sandbox and live data can never mix. Opening it in the
  // other mode is refused rather than quietly writing into it.
  const bound = conn.prepare("SELECT value FROM kv WHERE key='payments_mode'").get();
  if (bound && bound.value !== mode) {
    throw new Error(`This Manshya database was created in ${bound.value} mode and cannot be opened in ${mode} mode. Use a separate database file for each mode.`);
  }
  if (!bound) conn.prepare("INSERT INTO kv(key,value) VALUES('payments_mode',?)").run(mode);
  const addCol = (t, c, def) => {
    if (!conn.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c)) conn.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
  };
  addCol('merchants', 'settings', "TEXT NOT NULL DEFAULT '{}'");
  addCol('merchants', 'profile', "TEXT NOT NULL DEFAULT '{}'");
  addCol('api_keys', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  addCol('api_keys', 'hint', 'TEXT');
  addCol('payments', 'staff_id', 'TEXT');
  addCol('payments', 'items', 'TEXT');
  addCol('transfers', 'category', 'TEXT');
  addCol('merchants', 'status', "TEXT NOT NULL DEFAULT 'active'");
  addCol('payouts', 'requested_by', 'TEXT');
  addCol('saved_cards', 'agreed_version', 'TEXT');
  addCol('saved_cards', 'agreed_at', 'TEXT');
  addCol('savings_goals', 'last_interest', 'TEXT');
  addCol('cards', 'kind', "TEXT NOT NULL DEFAULT 'debit'");
  addCol('cards', 'tap', 'INTEGER NOT NULL DEFAULT 1');
  addCol('cards', 'intl', 'INTEGER NOT NULL DEFAULT 0');
  addCol('cards', 'online', 'INTEGER NOT NULL DEFAULT 1');
  addCol('cards', 'wallets', "TEXT NOT NULL DEFAULT ''");
  addCol('cards', 'daily_limit', 'INTEGER NOT NULL DEFAULT 500000');
  addCol('cards', 'replaced_by', 'TEXT');
  addCol('cards', 'blocked_reason', 'TEXT');
  // Link to the card issuer-processor's own card id, and a record of every authorisation it asked us to decide (idempotency).
  addCol('cards', 'provider', 'TEXT');
  addCol('cards', 'provider_card_id', 'TEXT');
  conn.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_provider ON cards(provider, provider_card_id) WHERE provider_card_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS authorisations(
      provider TEXT NOT NULL, authorisation_id TEXT NOT NULL, card_tx_id TEXT, approved INTEGER NOT NULL, reason TEXT, amount INTEGER, created_at TEXT NOT NULL,
      PRIMARY KEY(provider, authorisation_id));`);
  addCol('documents', 'storage_key', 'TEXT');
  addCol('admin_keys', 'role', "TEXT NOT NULL DEFAULT 'superadmin'");
  addCol('applications', 'identity_status', "TEXT NOT NULL DEFAULT 'unchecked'");
  // Tag every money record with the mode. A trigger fills the column on insert (so no insert statement can forget),
  // and rows from before this existed are backfilled with the database's mode.
  for (const t of MODE_TABLES) {
    addCol(t, 'mode', 'TEXT');
    conn.exec(`CREATE TRIGGER IF NOT EXISTS tag_mode_${t} AFTER INSERT ON ${t} WHEN NEW.mode IS NULL
      BEGIN UPDATE ${t} SET mode = (SELECT value FROM kv WHERE key='payments_mode') WHERE rowid = NEW.rowid; END`);
    conn.prepare(`UPDATE ${t} SET mode = ? WHERE mode IS NULL`).run(mode);
  }
  return conn;
}
module.exports = { openDb };
