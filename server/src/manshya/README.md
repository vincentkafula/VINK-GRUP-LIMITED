# Manshya payments and banking (server module)

A pluggable payments and banking backend: online payments, in-person (card machine) payments and business banking share one double-entry ledger. It runs inside this Express server, mounted at `/api/manshya`, and is used by the React screens in `src/app/components/manshya/`.

**Status:** a working, tested core with mock payment gateway and bank rail adapters. It does not move real money until you plug in licensed providers (see "Before going live").

## Who can use it

Sign-in is the app's normal login (`POST /api/auth/login` returns a JWT). The module reads that JWT and only decides who gets in (`access.ts`):

| Area | Who | Anyone else |
|---|---|---|
| `/api/manshya/*` (dashboard API) | accounts with role **`customer`** | staff roles get `403 customer_only`, signed-out requests get `401` |
| `/api/manshya/admin/*` (back office) | roles **`owner`** and **`superadmin`** | customers get `403 staff_only`; `mka_...` admin API keys still work |
| `/api/manshya/public/*`, `/health`, gateway webhooks | anyone (rate limited; webhooks are signature-checked) | |

Each customer gets their own merchant account, created the first time they open the dashboard and keyed by their user id, so customers can never see each other's data. The frontend routes a customer to `/manshya` after sign-in, and the dashboard shows a "customer sign-in required" screen to anyone else; the server enforces the same rule regardless of the screen.

`Authorization: Bearer mk_...` API keys (created under Settings, Developer settings) also work for server-to-server calls.

## Run it

```bash
cd server && npm install && npm run dev      # http://localhost:3001 (Postgres optional: without DATABASE_URL the app uses in-memory staff/customer accounts)
npm run test:manshya                         # the 12 core tests (ledger balance, payments, banking, back office, credit, insurance)
npm test                                     # access rules and the rest of the server tests
```

| Variable | Default | |
|---|---|---|
| `MANSHYA_DB_PATH` | `./data/manshya.db` | SQLite file (and `uploads/` beside it for KYC documents). Use `:memory:` for throwaway runs. On Railway put it on a Volume. |
| `PAYMENTS_MODE` | `sandbox` | `sandbox` or `live`. Live is refused at startup unless every condition in `payments/config.ts` holds (see `docs/payments/GO_LIVE_CHECKLIST.md`). Every journal and payment row records its mode, and a database file only opens in the mode it was created in. |
| `ISSUING_PROVIDER` / `ACQUIRING_PROVIDER` | `mock` | See `docs/payments/PROVIDERS.md`. |

The module is plain CommonJS under `core/` (`allowJs`); `mount.ts` wires it to the app's JWT login and `access.ts` holds the access rules.

**Database:** SQLite through better-sqlite3 (one writer). For several servers, port `core/db.js` and the prepared statements to Postgres. The ledger logic does not change.

**Body parsing:** gateway webhooks need the raw body to check signatures, and document uploads allow 3 MB, so the router is mounted before the global `express.json()` in `index.ts`. Keep it there.

## API (amounts are integer cents, currency ZAR)

| Area | Endpoints |
|---|---|
| Payments | `POST /payments` · `GET /payments` · `GET /payments/:id` · `POST /payments/:id/refund` |
| Payment requests | `POST/GET /payment-requests` · `POST /payment-requests/:id/cancel` · public: `GET/POST /public/payment-requests/:token[/pay]` |
| Balance and payouts | `GET /balance` · `POST/GET /payouts` |
| In-person | `POST/GET /pos/devices` · `POST /pos/devices/:id/heartbeat` · `POST /pos/sales` |
| Banking | `GET/POST /bank/accounts` · `GET /bank/accounts/:id/statement` · `GET/POST /bank/beneficiaries` · `POST/GET /bank/transfers` · `GET/POST /bank/cards` · `PATCH /bank/cards/:id` |
| Dashboards | `GET /dashboard/online?month=YYYY-MM` · `/dashboard/pos` · `/dashboard/bank` |
| Webhooks | `PUT/DELETE /webhook` (outbound, signed) · `POST /gateways/:name/webhook` (inbound) |

### Phase 2 endpoints

| Area | Endpoints |
|---|---|
| History and reports | `GET /transactions` (search, filters, `?format=csv`) · `GET /reports/fees` · `GET /reports/reconciliation` (both accept `from`, `to`, `?format=csv`) |
| Saved cards and subscriptions | `POST/GET/DELETE /saved-cards` · `POST/GET/PATCH /subscriptions` |
| Payouts | `POST/GET/PATCH/DELETE /payout-schedules` |
| Payment buttons | `POST/GET/DELETE /payment-buttons` · public: `GET/POST /public/buttons/:token[/pay]` |
| Settings and account | `GET/PUT /settings` · `GET/PUT /account/profile` · `/account/ubos` · `/account/documents` · `/account/users` · `/account/api-keys` · `GET /account/activity` · `GET /notifications` |
| In-person | `/pos/categories` · `/pos/products` · `/pos/staff` (+ `POST /pos/staff/:id/verify-pin`) · `POST /pos/prepaid` · itemised sales: `POST /pos/sales` with `items` and `staffId` |
| Banking | `PATCH /bank/accounts/:id` (rename) · `PATCH/DELETE /bank/beneficiaries/:id` · `GET /bank/beneficiaries/:id/history` · `/bank/scheduled-payments` · `/bank/savings-goals` (+ `/deposit`, `/withdraw`) · `GET /bills/catalogue` · `POST /bills/purchase` · `GET /bills/purchases` · `/bank/debit-orders` (+ `/approve`, `/decline`, `/stop`, `/dispute`) · `GET /bank/insights` |

**Roles.** API keys (or your `authenticate` hook) carry a role: `viewer` (read only), `finance` (can move money), `admin` (settings, users, keys, account), `owner`. Every write is recorded in the activity log with who, which route and the result, but never the request body.

**Scheduler.** Subscriptions, payout schedules, scheduled payments and auto-savings run from `manshya.runDue()`. `manshya.startScheduler(60000)` calls it every minute. Each item is claimed atomically, so two servers cannot charge or pay the same cycle twice.

**Sandbox.** With `config.mode = 'test'` the router also exposes `POST /bank/debit-orders/simulate` and `/:id/simulate-collect`, which stand in for a creditor's bank.

### Phase 3 endpoints

| Area | Endpoints |
|---|---|
| Back office (admin key `mka_...`) | `/admin/overview` · `/admin/merchants` (+ `POST /:id/status` to suspend or reinstate) · `/admin/applications` (+ `POST /:id/decide`) · `/admin/kyc` · `POST /admin/documents/:id/review` · `/admin/transactions` · `/admin/fraud-flags` · `/admin/disputes` (+ open, resolve) · `/admin/support` · `/admin/audit` |
| Public | `POST /public/onboarding/apply` · `GET /public/statements/verify` · `POST /rails/inbound` (signed credit notification from your bank rail) · `POST /rails/cash/collect` (ATM or retailer network) |
| Payouts | `POST /payouts/:id/approve` and `/reject` for payouts waiting on an admin |
| Statements | `GET /bank/accounts/:id/statement.pdf` (electronically stamped) · `.csv` · `POST .../statement/email` · `GET .../share` |
| Payments | `POST /bank/payshap` · `POST /bank/qr`, `/bank/qr/parse`, `/bank/qr/pay` · `/bank/requests` (+ approve, decline, cancel) · `/bank/cash` · `POST /bank/fx/quote` · `/bank/international` |
| Cards | `/bank/cards` (+ `/activate`, `/block`, `/wallets`, `GET /transactions`) · sandbox `POST /bank/cards/:id/authorize` |
| Other | `/rewards` · `/support/*` (tickets, FAQs, branches and ATMs, report fraud) · `/buyer/*` (verified-email buyer account) · `/vehicle/*` · `/disputes` |

**Pages.** The React screens live in `src/app/components/manshya/` (frontend): `ManshyaDashboard` (customers, `/manshya`), `ManshyaAdmin` (staff back office, `/manshya-admin`) and `ManshyaPay` (public hosted checkout, `/pay?r=TOKEN` for a payment request or `/pay?b=TOKEN` for a payment button).

**Adapters** you replace for production: `gateways` (card and EFT gateway), `rails` (`send`, `sendInternational`, `verifyInbound`), `bills` (prepaid and bill providers), `vehicle` (licensing), `mailer` (email). Cards need an issuer processor that calls `cards.authorize()` from its authorisation webhook.

**Safeguards worth knowing.** Fraud rules only raise flags for a person to review, they never block a payment. A merchant's negative balance after a lost dispute means they owe the platform. The buyer account only shows records matching an email the user has verified with a code. Cash codes and card tokens are shown once. Email bodies are only stored in test mode.

Money-moving POSTs accept an `Idempotency-Key` header. Errors look like `{ "error": { "code": "insufficient_funds", "message": "..." } }`.

## How money is tracked

Every movement is one journal whose lines sum to zero, so the ledger can never create or lose money. Balances are sums of entries, never stored counters.

- **Payment of R100:** clearing −100.00, merchant available +net, merchant retained +reserve, fees +fee. Online fee is 2.9% + R1, in-person 2.5%, and unverified merchants hold back 10% until verified.
- **Refund:** reserves the money in the ledger first, then calls the gateway, and reverses the entry if the gateway refuses.
- **Payout:** available minus the R8.50 fee goes to a Manshya account or an external beneficiary.
- **Transfers:** between your accounts, to another Manshya account number, or to a saved beneficiary, with a daily limit for payments to other banks.
- Overdrafts are blocked by a floor check inside the same database transaction (`BEGIN IMMEDIATE`).

## Gateway adapter

```js
{
  async createCharge({ paymentId, amount, currency, method, channel, reference, customer, paymentToken })
      // -> { gatewayRef, status: 'paid' | 'pending' | 'failed', reason?, redirectUrl? }
  async refund({ gatewayRef, amount, currency })       // throw to refuse
  verifyWebhook(rawBody, headers)                       // -> { gatewayRef, status, amount? }, throw if the signature is bad
}
```
Card details must never reach this server. Use the provider's hosted fields or tokens. `src/gateways.js` has a working mock to copy, including signature checking. A bank rail adapter only needs `send({ amount, beneficiary, reference })`.

## Outbound webhooks

`payment.paid`, `payment.failed`, `payment.refunded`, `payout.created`, `payout.failed`, `transfer.created`, `transfer.failed`. Each request carries `X-Manshya-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>`. Verify it and reject old timestamps. Failed deliveries retry up to 5 times with backoff.

## Before going live

- **Licensing:** holding customer funds and offering accounts needs a regulated partner (a sponsor bank or licensed payment provider). In South Africa that means registration with the relevant regulators, plus FICA/KYC on merchants. Take legal advice before launch.
- **Card issuing:** `bank/cards` only stores card state (freeze, limit). Real cards need an issuer-processor integration.
- **PCI DSS:** keep card data off your servers (tokens or hosted fields only).
- **Verification:** merchants start unverified. Flip `merchants.verified` after KYC so the reserve is released.
- **Scale and recovery:** move to Postgres for multiple servers. Webhook retries are in memory, so re-send undelivered rows from `events` after a restart. Run reconciliation between `sys:clearing` and your gateway settlement reports daily.
- **Hardening:** serve over HTTPS only, set `NODE_ENV=production`, add an admin role for KYC and limit changes, and alert on failed journals and rail errors.
- **Time zones:** day boundaries in dashboards use UTC. Add a merchant time zone if you need South African local days.

### Phase 4 endpoints

| Area | Endpoints |
|---|---|
| Credit | `GET /credit/products` · `POST /credit/apply` · `GET /credit/applications` · `POST /credit/applications/:id/accept` or `/decline` · `GET /credit/facilities` · `GET /credit/facilities/:id` (statement) · `POST /credit/facilities/:id/draw` or `/repay` |
| Insurance | `GET /insurance/products` · `POST /insurance/quote` · `POST/GET /insurance/policies` (+ `/cancel`) · `POST/GET /insurance/claims` |
| Documents and reconciliation | `POST /account/documents/upload` (PDF, PNG or JPEG up to 2 MB) · `POST /reports/reconciliation/import` (paste a gateway settlement CSV) |
| Back office | `GET /admin/documents/:id/file` · `GET /admin/credit` · `POST /admin/credit/applications/:id/decide` · `GET /admin/claims` · `POST /admin/claims/:id/decide` · `POST /admin/keys` |

**Credit.** Offers are up to 30% of the last 90 days of sales for verified businesses with enough history. A credit line is drawn and repaid as needed. A term loan is paid out once and repaid by automatic monthly instalments. Interest is added monthly on what is owed. A missed instalment is retried the next day and reported.

**Insurance.** Funeral, life and business contents cover. Premiums are collected monthly and three misses in a row lapse the cover. Natural-cause claims wait out the waiting period. Claims are decided by the back office and paid into the policy's account. The underwriter is your partner: premiums and claims move through `sys:premiums` and `sys:claims_pool` so you can settle with them.

**Back-office roles.** `superadmin` does everything, `compliance` handles KYC, suspensions, fraud, disputes, credit and claims, and `support` answers customers. Create keys with `admin.issueAdminKey(label, role)`.

**More adapters.** `storage` (file uploads: local disk by default, replace with S3 or similar) and `identity` (ID, name and selfie check at onboarding: the mock verifies everyone except names containing "refer"). Existing databases are upgraded automatically on start.

## What is built, and what is not

Everything on your requirements list is built, except the items below, which cannot be built inside this codebase. "Sandbox" means it works end to end against a mock provider you replace.

| Needs a real provider or partner | What is here |
|---|---|
| Card gateway, EFT, bank rails | Adapter contracts and working sandbox versions, signed webhooks, reconciliation against a settlement file |
| Card issuing | Card lifecycle and an `authorize()` that enforces status, limits and switches. Your issuer processor calls it |
| DebiCheck, PayShap, SWIFT | Sandbox flows with the rail adapter calls in place |
| Other schemes' QR codes (SnapScan, Zapper, Capitec Pay) | Manshya QR codes both ways. Other schemes need those partners |
| Identity bureau and selfie matching | `identity` adapter and referral handling |
| Credit bureau, underwriter, licensing authority, bill and prepaid provider | Adapters or rules with sandbox versions |

| Not built, on purpose | Why |
|---|---|
| Passwords, two-factor, biometric login | Sign-in is the app's own login (`/api/auth/login`). The module only decides who gets in (see "Who can use it") |
| Lottery tickets | Gambling is regulated and needs its own licence |
| Share investing | Needs a licensed broker |
| In-app calling and WhatsApp chat | The support page links to a phone call, WhatsApp and email |
