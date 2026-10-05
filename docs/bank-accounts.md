# Bank accounts on the dashboards

Every Driver, Marshal, Association, Investor and Owner dashboard is linked to ONE bank account held in the Banking module (VINK).
The account number, balance and transactions are read live from the Banking module each time; the dashboard database stores only the link.

## Rules (enforced on the server at linking, editing and seeding; mirrored in the form)

| Role | Allowed account type | Message when refused |
|---|---|---|
| Driver | Personal | Drivers must use a Personal account. |
| Marshal | Personal | Marshals must use a Personal account. |
| Association | Business | Associations must use a Business account. |
| Investor | Personal or Business | (both allowed) |
| Owner | Personal or Business | (both allowed) |

A rejected request is HTTP 422 with code `account_type_not_allowed` and nothing is created in the Banking module.
The rules live in `server/src/portal/bankRules.ts`; a frontend test keeps `src/app/components/portal/bankRules.ts` identical.

## Business accounts
Business name (2-120 characters) and registration number in the South African company format `YYYY/NNNNNN/NN` (for example `2015/123456/07`).
A Business link starts as **pending review**; an administrator approves or rejects it (with a reason) at `/admin/bank-links`.
Editing an approved Business account's details sends it back for review. A Personal account is verified automatically (the account is the user's own).

## Who sees what
* A user sees and changes only their own link (every query is keyed on the signed-in user).
* Administrators (`owner`, `superadmin` staff accounts) see every link at `/admin/bank-links` (API: `GET /api/admin/bank-links`).
* Account numbers are shown in full to their owner and to administrators; the audit log and server logs only ever contain the last four digits.

## Security
* Transport: HTTPS everywhere (Railway edge, `api.vink.co.za`).
* Storage: business name and registration number are encrypted by the application (AES-256-GCM, per-value nonce) with `DATA_ENCRYPTION_KEY`
  before being written to Postgres; in production nothing sensitive is stored without the key. Postgres and the VINK volume are Railway volumes.
* Audit: `bank.link.create`, `bank.link.update`, `bank.link.remove`, `bank.admin.list`, `bank.admin.approve`, `bank.admin.reject` in `audit_log`,
  with masked identifiers and (for updates) the before/after holder type and status.
* The dashboards' write endpoints are rate limited.

## Payment channels
The Online Payment and In-Person Payment channel accounts are NOT created or changed by this feature. They are read from the
`PAYMENT_CHANNEL_ACCOUNTS` setting and shown on the dashboards that use them: Driver (in-person), Investor (in-person), Owner and Association
(in-person and online). Marshals have none. If a channel is not configured the dashboard says so instead of inventing a number.

## Test accounts
With `SEED_ENABLED=true` the five test logins are linked to verified Banking-module accounts (driver, marshal, investor personal;
owner "Test Owner (Pty) Ltd" and association "Test Association NPC" business).
