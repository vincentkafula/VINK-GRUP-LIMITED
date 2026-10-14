# VINK banking and payments: gap report

Written 14 October 2026 after reading the code in `server/src` (auth, portal, `manshya/core`, payments) and the dashboards in `src/app/components`. It says what is real, what is a stand-in, and what only you can supply. Update it as stages land.

## 1. What already works (real code, tested)

| Area | State |
|---|---|
| Double-entry ledger | Real. Every movement posts balanced journals; tests assert the books balance after payments, refunds, payouts and transfers. Sandbox and live data are bound to separate databases. |
| Accounts, transfers, bills, savings, scheduled payments, debit orders, interest | Real, in `core/banking.js`, `core/payments2.js`. |
| Payments (create, refund, fees, retained reserve, payouts, settlement matching) | Real. Card data never reaches VINK: only tokens (`tok_*`); hosted fields exist for the sandbox. |
| Idempotency keys on money-moving routes | Real (`idempotency` table, request signature check). |
| Statements (PDF/CSV), invoices, subscriptions, payment requests | Real. |
| Cards (issue, freeze, limits, spend) | Real against a mock issuer; Visa/Paymentology adapters exist and are switched by `PAYMENTS_MODE`. |
| Auth | Real: bcrypt, JWT access + rotating refresh cookies, email verification, password reset, RBAC sections, rate limits on auth routes. |
| Audit log, field encryption (AES-256-GCM), ops go-live gate | Real. |

## 2. Gaps closed in Stage 1 (this change)

| Gap | Now |
|---|---|
| No lockout on repeated wrong passwords (only an IP rate limit) | Account locks for 15 minutes after 5 failures in a row (password or second-factor code). A reset or a correct sign-in clears the count. |
| No second factor for staff | TOTP (RFC 6238, works with Google/Microsoft Authenticator, Authy). Set-up, confirm, 10 one-time recovery codes (stored hashed), turn-off needs password + code. Secret stored encrypted. `AUTH_REQUIRE_STAFF_MFA=true` flags staff without it (`mfaEnrollRequired`) and stops them turning it off. |
| Webhook retries lived in memory (lost on restart, no dead-letter) | Retries are stored in the database with back-off (30 s doubling to 1 h), run by the scheduler, claimed so two workers never double-send, 8 attempts then a dead letter, with `GET /events` and `POST /events/:id/replay`. |
| Forgot-password form rejected valid addresses containing the letter "s" | Fixed. |

## 3. Gaps still open

### Needs code (I can build these without outside accounts)
1. About 11 older dashboards still show static sample data instead of the portal/VINK endpoints. Each needs rewiring to a real endpoint or retiring.
2. Notification centre for staff and customers (in-app exists; email exists; SMS has no provider).
3. Reconciliation automation: settlement matching exists; a scheduled daily run with exceptions queue and CSV export does not.
4. Admin/ops screens for locked accounts, MFA reset by a second staff member, and failed/dead webhooks.
5. Integration and end-to-end tests that drive a payment from checkout to payout across the dashboards.

### Needs something only you can supply (I will not invent these)
| Item | Why | Who |
|---|---|---|
| Acquiring partner / PSP account (live merchant IDs, API keys, webhook secret) | Real card acceptance. Today the only gateway is the mock. | You, with a PSP |
| Card issuing BIN sponsor and programme (Visa/Paymentology credentials) | Real cards. | You, with a sponsor bank |
| Sponsor bank or payment-service-provider agreement; PASA registration; FSP licence or an exemption, as your legal adviser decides | You cannot hold customer funds or issue accounts without it. | You and counsel |
| FICA/KYC provider account (ID verification, liveness, sanctions/PEP screening) | Today KYC is a mock and the selfie is only stored with the application. | You choose a provider |
| SMS provider account (OTP and alerts) | Today the OTP returns a demo code. | You choose a provider |
| `DATA_ENCRYPTION_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, provider keys in Railway | Secrets are entered by you in Railway only. | You |
| PCI DSS: stay out of scope by using only hosted fields from the PSP (SAQ A); get the PSP's attestation | Required before live cards. | You and the PSP |
| POPIA: information officer, privacy notice review (selfie and ID photo are special personal information), data-processing agreements with providers | Legal duties. | You and counsel |

## 4. Go-live blockers, in order
1. Legal basis (licence or sponsor-bank arrangement) and the PSP/BIN-sponsor contracts.
2. Live provider keys in Railway; `PAYMENTS_MODE=live` only after the ops go-live gate passes.
3. KYC and SMS providers connected.
4. Staff MFA on (`AUTH_REQUIRE_STAFF_MFA=true`) and every staff account enrolled.
5. External penetration test and PCI attestation from the PSP.

## 5. Stage 2 (14 October 2026): sample-data dashboards

| Finding | Action |
|---|---|
| On any network failure the app silently switched to "demo mode": invented balances and a fake `superadmin` sign-in, on the live site. | Demo data is now off unless the build is a development build or has `VITE_ALLOW_DEMO=true`. A failed request shows an error. A leftover demo flag in a browser is cleared. |
| `/api/global` (open to anyone, no sign-in): a simulator of cards, KYC, AML and transfers with invented partner banks and a personal name; plus its dashboard. | Removed (server routes, store, types; client dashboard and API). |
| Phone-app screens showed a fixed balance and reported "Sent successfully" with no money moving. | Every phone app now carries "Preview with sample data. No money moves here" with a Sign in button; the send button no longer reports a transfer. |
| Seven dashboards with no API calls and no way to open them (AFC Management, Card Network, Management Hub), or only from a role switcher in the bank panel (Driver, Owner, Taxi Association, Investor). | Deleted; the role switcher opens the real portals (`/portal/driver`, `owner`, `association`, `investor`). |

Still open: the phone-app previews (Banking, Business, Corporate, Mobile) are static designs, not connected to accounts. Connecting them to the signed-in VINK dashboard endpoints is the next rewiring job; Revenue/AFC levy and the NOC/MVNO panels read from their own APIs and need a data-source review.
