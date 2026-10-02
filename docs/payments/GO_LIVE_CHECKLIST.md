# Go-live checklist (payments)

Nothing here is done by default. The server refuses `PAYMENTS_MODE=live` until the configuration gate in
`server/src/payments/config.ts` passes, and `PAYMENTS_LIVE_APPROVED_BY` must name the person who signed this off.

Tick every box, in order. A "No" on any legal/regulatory line means **do not go live**.

## 1. Legal and regulatory (not code)
- [ ] Licence/authorisation to hold customer funds and offer accounts in each market (e.g. South Africa: registration as a payment service provider / bank partnership under SARB/PASA rules; Zambia: Bank of Zambia authorisation). Get legal advice per country.
- [ ] A sponsoring bank or licensed partner agreement is signed (Manshya itself does not hold a licence).
- [ ] FICA/KYC obligations for customers and merchants implemented with a real identity provider (the current identity check is a mock).
- [ ] AML: sanctions/PEP screening and transaction monitoring in place; suspicious-transaction reporting process named.
- [ ] POPIA (and GDPR if EU customers): lawful basis, privacy notice, retention and deletion policy, information officer registered.
- [ ] Terms, fee schedule, dispute and refund policy published.

## 2. Providers
- [ ] **Issuing (cards we issue):** Paymentology contract signed, **production** KYB approved, programme/BIN approved by the scheme through them.
- [ ] Paymentology adapter implemented against their documentation and passing `providers/contract.test.ts` plus their own certification tests (see `PROVIDERS.md`).
- [ ] **Acquiring (taking card payments):** a PSP chosen, contract and KYB done, adapter built (none exists yet: `ACQUIRING_PROVIDER` has only `mock`, which live mode rejects).
- [ ] 3-D Secure 2 working end to end in the provider's sandbox, then certified for production.
- [ ] Bank rail (EFT/RTC/PayShap) adapter replaces the mock (`rails`), with the sponsor bank's own test cycle completed.

## 3. PCI DSS
- [ ] Card entry happens only in the provider's hosted fields or hosted page, so card data never touches our servers (target SAQ A).
- [ ] The relevant SAQ is completed and signed; attestation of compliance on file.
- [ ] Quarterly external vulnerability scans (ASV) set up if the SAQ requires them.
- [ ] Confirm nothing logs PAN/CVV (search logs and error reports).

## 4. Security
- [ ] All seeded/dev passwords rotated; no `SEED_PASSWORD_*` variables left set; `JWT_SECRET` is a random 64-hex value.
- [ ] MFA (TOTP) enforced for staff and for the back office.
- [ ] Independent penetration test done; critical and high findings fixed and retested.
- [ ] `npm audit` clean of critical/high issues; dependency, SAST and secret scanning running in CI.
- [ ] Secrets are in the secret manager, not in the repo; sandbox and live credentials are separate variables (`SANDBOX_*` / `LIVE_*`).
- [ ] CSP, HSTS and security headers verified in production.

## 5. Platform
- [ ] Manshya data moved off SQLite to Postgres (or SQLite on a backed-up volume accepted explicitly as a limit), with automated backups and a tested restore.
- [ ] A separate **live** database. A database is bound to one mode and refuses to open in the other.
- [ ] Live webhook endpoints registered with each provider (https, signature verified, replay protection on); live webhook secrets set.
- [ ] Persistent webhook retry queue (current retries are in memory).
- [ ] Daily reconciliation against provider/bank settlement files running, with an alert on any discrepancy.
- [ ] Monitoring and alerting: failed journals, rail errors, webhook failures, error rate, latency.
- [ ] Fraud rules tuned on sandbox/pilot traffic; manual review queue staffed.
- [ ] Rate limits and load/concurrency tests (double spend, duplicate requests) passed.

## 6. Operations
- [ ] Incident response runbook written and rehearsed (who is paged, how to freeze payouts, how to contact the provider/bank).
- [ ] Rollback plan: how to switch back to sandbox/maintenance, and how to reverse a bad deploy.
- [ ] Customer support process for disputes, chargebacks and lost cards.
- [ ] A staged pilot with a small group and hard transaction limits before general launch.

## 7. Switching on
Set, on the **live** service only:

```env
NODE_ENV=production
PAYMENTS_MODE=live
PAYMENTS_LIVE_ENABLED=I_UNDERSTAND_THIS_MOVES_REAL_MONEY
PAYMENTS_LIVE_APPROVED_BY=<name>
ISSUING_PROVIDER=paymentology
ACQUIRING_PROVIDER=<real provider>
LIVE_PAYMENTOLOGY_BASE_URL=https://...
LIVE_PAYMENTOLOGY_API_KEY=...
LIVE_PAYMENTOLOGY_WEBHOOK_SECRET=...
MANSHYA_DB_PATH=/data/manshya-live.db
```

The server prints every missing item at once and does not start until they are all resolved.
