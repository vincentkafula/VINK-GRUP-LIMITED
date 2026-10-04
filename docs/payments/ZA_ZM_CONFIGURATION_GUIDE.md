# Configuration guide: transport payments and banking platform (South Africa and Zambia)

Version 1.0 · prepared for the platform owner · **technical guidance, not legal advice** (every item marked ⚖ needs a lawyer or the regulator to confirm)

---

# 0. One-page summary

**What this is.** A step-by-step specification for configuring the platform that already exists so that it runs one shared codebase with **separate configuration per country**: South Africa (ZAR, Bank Zero, SARB/PASA) and Zambia (ZMW, partner bank to be confirmed, Bank of Zambia).

**What the platform already has** (checked in the code): a double-entry ledger with idempotency and balance floors; virtual account numbers; fee, payout, reserve and limit settings; card controls (freeze, tap/online/international switches, limits); a sandbox/live switch that refuses to go live without sign-off; Visa sandbox adapters and a Paymentology issuer placeholder; AFC terminals with fare splits; encrypted fields, audit log and role-based dashboards.

**What it does not have yet** (these are the real work): one *Transactional Account* mirrored in the ledger; deposit confirmation from a real bank; automatic reconciliation against the bank balance; per-country configuration (currency, fees, limits, KYC tiers, partner bank are hard-coded for ZAR today; the Postgres `accounts` table does not even allow ZMW); an AFC no-PIN limit and offline/transit handling; a fee engine by transaction type, user type and country; automatic payout rules with failure handling; an instant-credit risk engine; inter-bank and cross-border transfers; regulator reporting.

**The ten decisions that matter most**

| # | Decision | Recommendation |
|---|---|---|
| 1 | Who legally holds customers' money | Use the **bank as the regulated holder** (banking-as-a-service, customers' balances as sub-accounts under the bank's licence) in both countries. Do **not** hold stored value yourself until you hold the licence ⚖ |
| 2 | "Nobody can withdraw manually" | Achievable as **no unilateral manual withdrawal**: API-only mandate, whitelisted beneficiaries, dual control, trustee oversight. A literal "nobody" is not allowed by banks or regulators (insolvency, court orders) ⚖ |
| 3 | Instant credit before settlement | Allow only for payments the **paying bank confirms in real time**, within per-tier limits, funded by a **platform risk reserve** you hold separately. Everything else credits on settlement |
| 4 | Card issuing | One BIN sponsor/processor per country, Mastercard and Visa under the sponsor's scheme membership. Confirm that Bank Zero (SA) and the Zambian bank can sponsor BINs, or you need a sponsor bank in addition |
| 5 | AFC no-PIN limit | SA: below R40 (your rule). Zambia: start at **ZMW 50 per tap and ZMW 150 per card per day**, raise only after scheme and Bank of Zambia confirmation ⚖ |
| 6 | Configuration model | One `country_profile` per country (JSON, versioned, approval-gated). Nothing financial is hard-coded |
| 7 | Reconciliation | Three-way (ledger ↔ bank ↔ card processor), real-time matching plus a daily close, with exception queues and a hard stop if control totals break |
| 8 | Cross-border | **Do not launch** ZAR↔ZMW transfers in version 1. Each country is a closed ledger; add the corridor later through an authorised dealer / licensed provider ⚖ |
| 9 | Driver pay | The platform does not calculate driver pay today (it is a private arrangement with the owner). If "automatic payouts" must include drivers, the owner must enter the rule; the platform only executes it |
| 10 | Data | Separate databases (or schemas) per country; no personal data leaves the country without a legal basis ⚖ |

**Biggest risks:** licensing of the pooled account; crediting before settlement; no-PIN taps and offline transit liability; reconciliation breaks; the cross-border corridor. Section 13 lists them with who must confirm each.

**What I need from you:** the answers in Appendix D (tech facts I assumed, partner bank details, volumes, who is your regulatory counsel).

---

# Assumptions (state before proceeding)

You asked me to fill in missing build details and to say what I assumed. From the repository and the deployment:

| Item | What I used | Confirm? |
|---|---|---|
| Tech stack | React 18 + Vite front end; Node 22, Express 4, TypeScript back end; PostgreSQL (platform data, users, terminals, taps, audit) | yes |
| Ledger / core banking | "Manshya" core: double-entry ledger in SQLite (`journals`, `entries`, per-merchant `available` / `retained` / bank accounts, idempotency keys, balance floors). A Postgres ledger (`accounts`, `ledger_entries`, `account_balances`) is the planned migration target | **Which is the system of record going forward?** See Appendix D |
| Card processor / issuer | Provider adapters: mock issuer, Visa DPS and PAV (sandbox only), Paymentology (BIN sponsor / issuer-processor, API not yet integrated) | yes |
| Hosting | Railway (Dockerfile builds), Postgres with a volume, one volume for the Manshya database, custom domain `api.vink.co.za`, Resend for email | yes |
| Banking partner SA | Bank Zero, fee schedule not yet agreed | open |
| Banking partner ZM | not chosen | open |
| Volumes | unknown; sized for pilot (thousands of taps a day), not national scale | open |

Every number in the examples below is **illustrative** and marked as such. The fee, limit and rate values are inputs you will set after negotiating with the banks; the guide gives you the structure and sensible starting points.

---

# Current build versus required behaviour

| Requirement | Today in the code | Gap |
|---|---|---|
| One pooled Transactional Account per country | Not modelled. Each customer ("merchant") has its own ledger accounts; there is no mirror of a real bank account | Add `sys:bank_pool:<country>` mirror account and the mapping in section 3 |
| Virtual account numbers | 10-digit random numbers per customer account | Add a country prefix, check digit, and a real mapping to the bank's pooled account (section 3) |
| Instant availability | A simulated `inbound_credits` table | Real deposit-confirmation flow and risk controls (sections 7, 8) |
| Cards (Mastercard / Visa) | Controls and limits per card exist; issuing is mock; Visa adapters sandbox only | BIN sponsor integration per country (section 6) |
| AFC no-PIN limit, offline | Taps are recorded and split; **no no-PIN limit setting or offline logic found** | Add both (sections 6, 8) |
| Fees | Percentage + fixed for `online` and `pos`, payout fee, reserve percentage, in code defaults; AFC flat fee and investor share fixed in code | Fee engine by type / user / country (section 4) |
| Payouts | Payout schedules, approval threshold, manual approve/reject by staff | Rule-based splits, no manual release, failure handling (sections 2, 5) |
| Transfers | Internal transfers; simulated bank rail | Real rails per country (sections 7, 10) |
| Currency | ZAR everywhere; Postgres `accounts.currency` allows ZAR, USD, EUR, GBP, NGN, KES, **not ZMW** | Migration + per-country profile |
| KYC | Verified flag, documents, owners (UBOs); unverified merchants have part of sales held back | Tiered KYC with limits (section 1, 11) |
| Reconciliation | None | Section 9 |
| Safety switch | `PAYMENTS_MODE` sandbox/live with a checklist and named approver | Keep; extend per country (section 12) |

---

# 1. Per-country configuration checklist

Create one record per country. It is the only place these values live; code reads it. Changes are versioned, effective-dated and need two approvers (section 2).

| Group | Setting | South Africa | Zambia | Decided by | Status |
|---|---|---|---|---|---|
| Identity | `country_code`, `currency`, `currency_minor_units` | ZA, ZAR, 2 | ZM, ZMW, 2 | you | ready |
| Identity | `timezone`, `business_day_cutoff` | Africa/Johannesburg (UTC+2), 17:00 | Africa/Lusaka (UTC+2), 17:00 | you + bank | confirm cut-offs |
| Partner | `partner_bank`, `bank_account_ref`, `swift/bic`, `branch_code` | Bank Zero, to confirm | to be confirmed | contract | open |
| Partner | `bank_integration` (API, webhooks, file, credentials ref) | per Bank Zero API | per partner bank | bank | open |
| Partner | `card_sponsor` / `processor` | Bank Zero or sponsor bank + Paymentology | sponsor bank + Paymentology (or local processor) | contract | open |
| Regulator | `regulator`, `licence_ref`, `reporting_calendar` | SARB / PASA, FIC | Bank of Zambia, FIC | counsel | ⚖ |
| Limits | `tier_limits` (per KYC tier: balance, daily in/out, per transaction) | table in 11.2 | table in 11.2 | counsel + bank | ⚖ |
| Limits | `afc_no_pin_limit`, `afc_daily_cumulative_no_pin` | < R40, R120 / day | ZMW 50, ZMW 150 / day | you + scheme | ⚖ Zambia |
| Limits | `atm_daily`, `pos_daily`, `online_daily` | see 6.4 | see 6.4 | bank | open |
| Limits | `instant_credit_limits` per tier | section 8 | section 8 | risk | open |
| Fees | `fee_schedule_id` (active version) | section 4 | section 4 | commercial | open |
| Payouts | `payout_rules`, `payout_schedule`, `min_payout`, `retry_policy` | section 5 | section 5 | you | open |
| KYC | `kyc_tiers`, accepted ID documents, business documents, sanctions lists | ID / passport; CIPC for business | NRC / passport; PACRA for business | counsel | ⚖ |
| KYC | business registration number format | `YYYY/NNNNNN/NN` (CIPC) | PACRA format to confirm | counsel | open |
| Cards | `products`, `bin_ranges`, `3ds`, `pin_rules`, `offline_auth` | section 6 | section 6 | processor | open |
| Cross-border | `corridors_enabled` | none in v1 | none in v1 | counsel | ⚖ |
| Data | `data_residency`, `retention_years`, `dpo_contact` | POPIA | Data Protection Act | counsel | ⚖ |
| Operations | `reconciliation_times`, `exception_sla`, `on_call` | section 9 | section 9 | ops | open |
| Switch | `mode` sandbox / live, `live_approved_by`, `approved_at` | per country, independent | per country, independent | you | keep |

**Rule:** a country cannot be set `live` until every row above is `ready` and the go-live checklist (section 12) is signed. Separate sign-off per country; going live in one never enables the other.

---

# 2. Transactional Account setup

## 2.1 Structure

* **One operating account per country**, named *Transactional Account*, held with the registered partner bank. Customer funds are held **for** the customers, never mixed with the company's own money.
* **Separate accounts** (also with the bank): *Fee Revenue*, *Platform Operating*, *Risk Reserve* (funds the instant-credit exposure, section 8), and a *Settlement/Suspense* account for unmatched money. Only *Fee Revenue* belongs to the company.
* **Legal wrapper** ⚖: preferably the bank holds the pooled funds under its licence and your platform is the program manager (BaaS). If you hold the pool yourself you may need your own e-money / payment-system licence and a trust or safeguarding account (Bank of Zambia and SARB have published positions on who may issue e-money; confirm current rules). Use an independent trustee or the bank's own safeguarding structure where required.
* **Interest** earned on the pool: decide in writing who keeps it (customers, platform, or a community fund) ⚖.

## 2.2 "No one can withdraw manually" (what is actually achievable)

A literal "nobody, including the owner" cannot be promised: banks must be able to act on court orders, insolvency and fraud freezes. The achievable, auditable version is **no unilateral or manual withdrawal**:

| Control | Setting |
|---|---|
| Bank mandate | The Transactional Account has **no human transacting signatories**. Humans may only view and download statements |
| Access path | The platform instructs payments only through the bank's API with a **service credential** held in a hardware security module / secrets vault. No person can read it |
| Beneficiary whitelist | The bank accepts payments only to **pre-registered beneficiaries**: customers' own verified accounts, the platform's *Fee Revenue* account, and the scheme / processor settlement accounts. Adding one needs dual approval **plus a 24-48 hour cooling-off** |
| Rule-bound outflows | The platform only sends the five permitted kinds: customer withdrawal, card settlement, customer-initiated transfer, automatic payout, automatic fee sweep. Each carries the ledger transaction id and is rejected by the platform if it has no matching ledger entry |
| Caps | Daily and per-transaction caps set **at the bank** (not only in code) and a velocity alert to three people |
| Dual control | Any change to rules, fees, limits, beneficiaries or keys needs **two different approvers** (maker-checker) from different roles; nobody approves their own change |
| Break-glass | A documented emergency procedure needing the trustee/compliance officer **and** a director, time-boxed, fully logged, reported to the board and the bank within 24 hours |
| Independent oversight | A trustee, auditor or the bank's compliance team receives the daily reconciliation report and any rule change notice |
| Logging | Every instruction, approval and rejection is written to an append-only audit log (who, when, before/after, request id), copied to storage the application cannot edit |

## 2.3 Roles

| Role | Can | Cannot |
|---|---|---|
| Platform administrator | Configure non-financial settings; view all accounts | Move money; approve their own change |
| Finance approver | Approve fee and payout rule changes (second approver) | Create the change they approve |
| Compliance officer | Approve KYC exceptions, sanctions hits, whitelist changes; run break-glass with a director | Edit ledger entries |
| Operations | Work exception queues (section 9); retry failed payouts | Approve limits; see full card numbers |
| Auditor / trustee | Read-only everything, including raw audit log | Anything else |
| Platform service | The only identity that calls the bank API; no human has it | Act outside whitelisted rule types |

The existing dashboards already restrict each user to their own data and log sensitive actions; the staff roles above are an extension of the current `owner` / `superadmin` split and the admin screens.

---

# 3. Virtual account mapping

## 3.1 Account number format
`CC` country digit + `T` account type + 7 serial digits + 1 Luhn check digit (10 digits, matches what customers already see). Example (illustrative): ZA personal `1 1 0000123 4`. Rules: random-looking serial from a counter you control (not sequential from the user id), never reused, Luhn validated on entry, **unique per country**. Optional: a visible `branch_code` per country.

## 3.2 Mapping to the Transactional Account
* Every customer account is a **ledger record only**. In the bank, there is one pooled account.
* Incoming payments are matched to a customer in this order: (1) the bank's reference field carrying the 10-digit number, (2) a dedicated deposit reference the bank's virtual-account feature returns, (3) otherwise the payment goes to the **Suspense** ledger account and the *unmatched deposits* queue (section 9).
* On match the ledger posts one transaction (double entry): debit `sys:bank_pool:<CC>` (asset: money at the bank), credit `cust:<id>:available` (liability to the customer). **The two always sum to zero.**

## 3.3 Ledger accounts (chart)

| Account | Type | Meaning |
|---|---|---|
| `sys:bank_pool:<CC>` | asset | what the platform believes is in the Transactional Account |
| `sys:bank_suspense:<CC>` | liability | received but unmatched money |
| `cust:<id>:available` | liability | spendable balance |
| `cust:<id>:pending` | liability | provisionally credited, not yet confirmed (section 8) |
| `cust:<id>:held` | liability | card authorisations in flight, reserve holds |
| `sys:fees:<CC>` | revenue | earned fees, swept to *Fee Revenue* account |
| `sys:risk_reserve:<CC>` | asset | platform-funded cover for instant credit |
| `sys:payout_clearing:<CC>` | liability | payouts instructed, not yet confirmed by the bank |
| `sys:card_settlement:<CC>` | asset / liability | owed to / by the card scheme or processor |

**Invariants checked every minute:** total of `cust:*` liabilities + suspense + clearing = `sys:bank_pool` ± in-flight items; no customer `available` < 0 (except under the negative-balance policy in section 8); every ledger transaction has a unique idempotency key.

## 3.4 Balance checks on every transaction
1. Take an exclusive lock on the customer's account (the current ledger already uses single-writer transactions).
2. `available >= amount + fee` else decline with a reason code.
3. Post amount and fee in one atomic journal; the response to the caller is sent **only after commit**.
4. Replays with the same idempotency key return the original result.

---

# 4. Fee engine configuration

## 4.1 Schema (stored as versioned JSON; amounts in minor units)

```json
{
  "fee_schedule": {
    "id": "ZA-2026-01", "country": "ZA", "currency": "ZAR",
    "effective_from": "2026-11-01", "status": "approved", "approved_by": ["fin1", "comp1"],
    "rules": [
      { "id": "afc_tap", "applies_to": { "txn": "afc_tap", "payer_type": "*", "payee_type": "*" },
        "calc": { "type": "flat", "amount": 100 },
        "split_to": [ { "account": "sys:fees", "part": 100 } ], "min": 100, "max": 100 },
      { "id": "pos_card", "applies_to": { "txn": "card_pos" },
        "calc": { "type": "percent_plus_flat", "pct": 0.025, "flat": 0 }, "min": 0, "max": null },
      { "id": "online_card", "applies_to": { "txn": "card_online" },
        "calc": { "type": "percent_plus_flat", "pct": 0.029, "flat": 100 } },
      { "id": "atm_withdrawal", "applies_to": { "txn": "atm" },
        "calc": { "type": "flat", "amount": 1000 } },
      { "id": "eft_out", "applies_to": { "txn": "transfer_out", "rail": "eft" },
        "calc": { "type": "tiered", "tiers": [ { "up_to": 50000, "flat": 500 }, { "up_to": null, "flat": 850 } ] } },
      { "id": "payout", "applies_to": { "txn": "payout" }, "calc": { "type": "flat", "amount": 850 } },
      { "id": "deposit_in", "applies_to": { "txn": "deposit" }, "calc": { "type": "flat", "amount": 0 } }
    ],
    "overrides": [
      { "when": { "payer_tier": "basic", "txn": "afc_tap" }, "calc": { "type": "flat", "amount": 100 }, "note": "low-income users keep the lowest fee" },
      { "when": { "association_id": "*", "txn": "payout" }, "waive": true }
    ],
    "rounding": "half_up_to_minor_unit", "tax": { "vat_inclusive": true, "vat_rate_ref": "ZA-VAT" }
  }
}
```

## 4.2 Dimensions every rule can use
Transaction type · user type (passenger, driver, owner, investor, association, marshal, public) · KYC tier · channel (online, in-person, AFC, ATM) · rail (EFT, instant, card scheme, mobile money) · amount band · time of day · country. **Who pays** (payer, payee, platform absorbs) is a field on each rule, so a fee can be charged to the merchant side, to the payer, or split.

## 4.3 Example starting values (illustrative: replace after negotiation)

| Transaction | South Africa (ZAR) | Zambia (ZMW) | Notes |
|---|---|---|---|
| AFC tap, per tap | R1.00 flat (matches today) | ZMW 1.00 flat | the cheapest line: protect it for low-income users |
| POS card payment | 2.5% | 2.5% | merchant pays |
| Online card payment | 2.9% + R1.00 | 2.9% + ZMW 1.00 | merchant pays |
| ATM withdrawal | R10.00 | ZMW 10.00 | partner bank/ATM owner fees pass through, shown separately |
| Transfer to another bank | R5.00 up to R500; R8.50 above | ZMW 5.00 / 8.50 | cost is the rail's price plus margin |
| Deposit from a recognised bank | free | free | encourages deposits to the pool |
| Payout to bank account | R8.50 | ZMW 8.50 | waivable for associations |
| Card issue / replacement | R0 virtual, R50 physical | ZMW 0 / 50 | |
| Dormancy / monthly fee | none | none | avoid for low-income users |

## 4.4 Controls
* Fees are **versioned and effective-dated**; a transaction always records the fee version it used, so history never changes.
* A new schedule needs maker-checker approval and a 7-day notice to affected customers where the law requires ⚖.
* **Fee sweep:** a scheduled, rule-based internal job moves only *earned* fees from the pool to *Fee Revenue* after the day's reconciliation closes. The amount must equal `sys:fees` for the closed day exactly.
* A "fee simulator" screen in the admin area shows the fee for any sample transaction before a schedule is approved.

---

# 5. Payout rules configuration

## 5.1 Rule schema

```json
{
  "payout_rules": [
    { "id": "afc_fare_split", "trigger": { "event": "afc_tap.confirmed" },
      "split": [
        { "party": "platform_fee",   "basis": "fee_schedule" },
        { "party": "investor",       "basis": "pct_of_platform_fee", "value": 0.10 },
        { "party": "association_levy","basis": "per_member_levy_rule", "value": "levy-rule-id", "optional": true },
        { "party": "vehicle_owner",  "basis": "remainder" }
      ],
      "settle": { "mode": "daily", "cutoff": "17:00", "min_payout": 5000, "currency": "ZAR" } },
    { "id": "owner_to_driver", "trigger": { "event": "owner.payout.executed" },
      "split": [ { "party": "driver", "basis": "fixed_amount_set_by_owner", "per": "week" } ],
      "note": "driver pay is the owner's private agreement; the platform only executes the amount the owner sets" }
  ]
}
```

## 5.2 Parties and how each is paid

| Party | Basis | Frequency | Source of the rule |
|---|---|---|---|
| Platform fee | fee schedule | at tap, swept daily | company |
| Investor | % of the platform fee (today 10%) | daily or weekly | investor agreement |
| Association | levies and fines credited | monthly (levies), per event (fines) | association's own levy rules |
| Marshal | fixed fee per departure or per shift, set by the association | weekly | association |
| Vehicle owner | remainder after fees and splits | daily | system |
| Driver | fixed amount the owner sets (not calculated by the platform) | weekly | owner |

## 5.3 Scheduling
Daily run after the bank cut-off and **after the day's reconciliation closes**; weekly run on a fixed day; a payout below `min_payout` rolls over. Every run has a **run id** and is idempotent: re-running the same run id never pays twice.

## 5.4 Failure handling

| Failure | Action |
|---|---|
| Bank rejects (invalid account) | mark `failed_permanent`, return funds to the party's ledger balance, notify them, require a corrected account |
| Network / bank unavailable | retry with backoff 1 min, 5 min, 30 min, 2 h, then next run; max 5 attempts, then queue for operations |
| Timeout with unknown result | **never retry blindly**: query the bank by the idempotency key; only resend if the bank confirms it did not process |
| Partial run failure | other items continue; failed items are individually tracked; the run closes as `completed_with_exceptions` |
| Insufficient funds in pool | halt the whole run, page on-call (this is a reconciliation break, not a normal failure) |
| Refund / reversal after payout | create a negative entry against the party's next payout; if no next payout, open a recovery item (section 8) |

All amounts in a run are written to `sys:payout_clearing` first and move to the party's bank only after the bank confirms.

---

# 6. Card programme configuration

## 6.1 Set-up per country
* **BIN sponsor and processor** (Paymentology is the planned processor; the sponsor must be a scheme member in each country) ⚖: confirm whether Bank Zero can act as sponsor/issuer in South Africa, and which bank can in Zambia. If not, you need a sponsor bank in addition to the account-holding bank.
* One **BIN range per country and scheme**, one or more **card products** per range.

| Product | Form | Scheme | Use | Notes |
|---|---|---|---|---|
| Virtual debit | virtual | Mastercard / Visa | online, wallet, instant issue | default for every customer |
| Physical debit | physical | Mastercard / Visa | ATM, POS, tap, AFC | chip + contactless, PIN |
| Transit card (optional) | physical, low-cost | one scheme | AFC taps only | for customers without a bank card |

## 6.2 Authentication

| Channel | Method |
|---|---|
| Online | 3D Secure 2 (challenge by OTP/app); decline if the 3DS result is missing |
| In person (POS, ATM) | chip and PIN; contactless above the no-PIN limit asks for PIN |
| AFC tap | **no PIN** below the configured limit, otherwise decline (never silently fall back to online) |

## 6.3 AFC no-PIN and offline authorisation

| Setting | South Africa | Zambia (recommended start) |
|---|---|---|
| `afc_no_pin_per_tap` | below R40 (your rule) | ZMW 50 ⚖ |
| `afc_no_pin_daily_cumulative` | R120 | ZMW 150 |
| `afc_consecutive_no_pin_taps` | 5, then require PIN or online check | 5 |
| `offline_allowed` | yes, with floor limit = per-tap limit | yes, same |
| `offline_daily_total_per_card` | R200 | ZMW 250 |
| `denylist_refresh` | every 15 minutes while online | same |

How offline works: the terminal accepts a tap under the floor limit without contacting the host, stores it, and uploads the batch on reconnection. The platform then authorises the stored taps against the ledger. **Risk:** a stored tap can find an empty balance. Controls: floor limit, cumulative cap, a denylist of frozen cards pushed to terminals, and a loss policy (who absorbs offline shortfalls: platform risk reserve, with a monthly cap). Confirm scheme transit rules and the liability allocation with the processor ⚖.

## 6.4 Limits (examples, per customer tier)

| Limit | Basic | Standard | Full |
|---|---|---|---|
| ATM per day | R1,000 / ZMW 1,000 | R3,000 / ZMW 3,000 | R10,000 / ZMW 10,000 |
| POS per day | R2,000 / ZMW 2,000 | R10,000 / ZMW 10,000 | R30,000 / ZMW 30,000 |
| Online per day | R1,000 / ZMW 1,000 | R5,000 / ZMW 5,000 | R20,000 / ZMW 20,000 |
| Cards per customer | 1 virtual + 1 physical | 2 + 2 | 5 + 3 |

All limits are per-country settings. The card controls already in the code (freeze, tap, online and international switches, daily limits) are the customer-facing part; the **tier limits are the new part**.

## 6.5 Other settings
International transactions off by default; ATM and POS enabled by country; merchant category blocks (gambling, adult) configurable; velocity rules (section 8); expiry 3 years; PIN retry 3, then lock for 24 hours; PAN never stored by the platform (the processor tokenises: this keeps PCI scope small, section 11).

---

# 7. Bank integration configuration

## 7.1 South Africa: Bank Zero ⚖
Things to obtain in writing before any build: whether Bank Zero offers a **partner / BaaS programme**, the API specification (account creation, sub-accounts or virtual accounts, payment initiation, statement and webhook events), sandbox access, whether it will **sponsor a BIN**, the real-time payment rails supported (EFT, PayShap), settlement times, fees (the schedule you will negotiate), and who is the accountable institution under FICA for the customers.

## 7.2 Zambia: partner bank (to be confirmed)
Equivalent questions, plus: connection to the national payment systems, availability of an **API** (many Zambian banks offer file-based or limited APIs), mobile-money interoperability (MTN/Airtel are how most people move money), and Bank of Zambia approval requirements for the arrangement ⚖. Until a bank is chosen, build against an **adapter interface** (section 7.5) with a mock, so nothing depends on the choice.

## 7.3 Deposit confirmation message (canonical form the platform accepts)

```json
{
  "event": "deposit.confirmed",
  "event_id": "evt_01H...", "occurred_at": "2026-10-04T10:15:03Z",
  "country": "ZA", "bank_ref": "BZ-8873321", "rail": "instant",
  "amount": 15000, "currency": "ZAR",
  "payer": { "bank": "FNB", "account_masked": "••••1234", "name": "A Passenger" },
  "beneficiary_ref": "1100001234",
  "settlement": { "status": "confirmed_by_paying_bank", "expected_settlement": "2026-10-04" },
  "signature": "hmac-sha256=..."
}
```
The platform credits the customer only when `status` is `confirmed_by_paying_bank` (real-time irrevocable rails) or when the bank says `settled`. Other statuses create a `pending` credit (section 8).

## 7.4 Webhook and API settings

| Setting | Value |
|---|---|
| Transport | TLS 1.2+ only; mutual TLS or signed requests (HMAC, timestamp within 5 minutes, replay guard: the platform already does this for provider webhooks) |
| Idempotency | every outbound instruction carries a stable idempotency key (the ledger transaction id); every inbound event is deduplicated on `event_id` |
| Timeouts | connect 3 s, read 10 s; never treat a timeout as failure (query status, section 5.4) |
| Retries | exponential backoff with jitter, max 8 over 24 hours; dead-letter queue after that |
| Ordering | events may arrive out of order; apply by `occurred_at` and sequence per account |
| Polling | a statement poll every 5 minutes as a backstop for missed webhooks |
| Secrets | in a vault, rotated every 90 days; separate per country and per environment (the platform already separates sandbox and live credentials) |
| Health | circuit breaker per bank: when open, deposits queue as `pending` and outflows pause with a customer message |

## 7.5 Adapter contract (so a country is only configuration plus one adapter)
`createAccountRef`, `initiatePayment(idempotencyKey, beneficiary, amount, ref)`, `getPaymentStatus(idempotencyKey)`, `getStatement(from, to)`, `parseDepositEvent(raw)`, `verifySignature(raw)`. The existing provider-adapter pattern (mock, Visa, Paymentology) is the model; add `bank/ZA-bankzero`, `bank/ZM-partner`, `bank/mock`.

---

# 8. Instant-credit risk controls

**Principle:** "instant" means the customer can spend a payment that the **paying bank has confirmed**, before the money settles. The platform carries the settlement risk, so it must be bounded and funded.

## 8.1 Which deposits may be credited instantly

| Source | Instant? | Why |
|---|---|---|
| Real-time push payment confirmed by the paying bank (instant EFT / PayShap-type, mobile money) | yes, within tier limits | irrevocable or near-irrevocable |
| Standard EFT / interbank credit not yet settled | only within a smaller "provisional" limit, and only for customers past the probation period | can fail or be recalled |
| Card top-up | no (chargeback risk) unless 3DS passed and within a small limit | chargebacks arrive weeks later |
| Cash deposit at an agent | after the agent's confirmation, within agent float | agent risk |

## 8.2 Limits (illustrative, per tier and country)

| Tier | Instant credit per deposit | Instant credit per day | Outstanding provisional balance (max) |
|---|---|---|---|
| Basic (low KYC) | R500 / ZMW 500 | R1,500 / ZMW 1,500 | R1,500 / ZMW 1,500 |
| Standard | R3,000 / ZMW 3,000 | R10,000 / ZMW 10,000 | R10,000 / ZMW 10,000 |
| Full | R20,000 / ZMW 20,000 | R50,000 / ZMW 50,000 | R50,000 / ZMW 50,000 |
| New customer (first 7 days) | halve all limits | | |

## 8.3 Checks before crediting
Velocity (number and value of deposits in 10 minutes, 24 hours); first deposit from a new payer; payer name vs account holder name (soft match); device and location changes; account age; sanctions screening hit; unusual pattern (deposit then immediate full withdrawal); platform-wide exposure cap = `risk_reserve` balance × a ratio you set (for example never more than 3× the reserve).

## 8.4 If a confirmed payment later fails (reversal handling)
1. The ledger posts a **reversal**, never an edit: debit `cust:available` (and `pending` first), credit `sys:bank_pool` or `sys:bank_suspense`.
2. If the customer has already spent it, the balance goes negative: **recovery waterfall**: (a) their remaining balance and incoming credits, (b) the `risk_reserve` absorbs the loss and a recovery item is opened, (c) collections / customer contact, (d) write-off after N days with compliance approval.
3. The customer's instant-credit limit drops to zero until the item is cleared; repeated cases trigger review.
4. Every reversal is reported in the daily exceptions list and the monthly risk report.
5. **Sizing the reserve:** `reserve ≥ (expected provisional exposure) × (observed failure rate) × safety factor`. Start with a fixed amount and review monthly; keep it in its own bank account.

---

# 9. Reconciliation setup

## 9.1 Three-way
Ledger ↔ bank (pooled account statement) ↔ card processor / scheme settlement.

| Level | When | What |
|---|---|---|
| Real time | every event | each bank event matched to a ledger transaction by reference / idempotency key; unmatched go to the queue within one minute |
| Intraday | hourly | ledger `sys:bank_pool` vs bank available balance from the API; alert if the difference exceeds a threshold |
| Daily close | after the bank cut-off | full statement vs ledger; produces a signed reconciliation report; **fee sweep and payouts only run if the day reconciles** |
| Card settlement | per scheme file | processor settlement file vs `sys:card_settlement` |
| Monthly | month end | independent review by the trustee/auditor; interest, fees and write-offs |

## 9.2 Matching rules
Exact (reference + amount + date); then (amount + counterparty + date window ±1 day); then manual. A bank item can match one ledger item or a **group** (batched payouts). Tolerance for rounding is zero for money (no fuzzy amounts).

## 9.3 Exception queues

| Queue | Meaning | SLA | Resolver |
|---|---|---|---|
| Unmatched deposit | money at the bank, no customer | 1 business day | operations, compliance if suspicious |
| Unmatched ledger | ledger says paid, bank has no record | same day | operations + bank |
| Amount mismatch | same reference, different amount | same day | operations |
| Duplicate | same bank event twice | auto-resolve, review weekly | system |
| Failed payout | bank rejected | next run | operations |
| Provisional overdue | not settled after N days | 1 day | risk |
| Negative balance | recovery item | per policy | collections |

## 9.4 Hard stops
If the daily difference is not zero (or explained by items in a queue within an approved tolerance of 0), **block payouts and fee sweeps**, page on-call, and notify the compliance officer and trustee. The platform already refuses to start in live mode without sign-off; extend the same principle: the day does not close until it reconciles.

---

# 10. Cross-border and inter-bank transfers

## 10.1 Inter-bank within a country

| | South Africa | Zambia |
|---|---|---|
| Rails | EFT (batch, next day), instant payments where the partner supports them | national interbank and retail switch rails, mobile-money transfers ⚖ confirm which the partner supports |
| Limits (start) | R5,000 per transfer / R25,000 per day for Standard; Full higher | ZMW equivalents |
| Verification | beneficiary account validation before first use (the platform already has an account-validation adapter pattern) | same |
| Cooling-off | 24 h before a new beneficiary receives more than the Basic limit | same |
| Failure | rejected: funds return; unknown: query by idempotency key | same |

## 10.2 Between the two countries (ZAR ↔ ZMW)
**Recommendation: not in version 1.** It brings exchange control, authorised-dealer requirements, FX risk and reporting in both countries ⚖. Keep two closed ledgers. If you add it later:

| Item | Setting |
|---|---|
| Provider | an authorised dealer bank or licensed money-transfer operator (not the pooled account itself) |
| Currency conversion | quote with a short expiry (60 seconds, as the platform's FX quote does today), rate source and margin configured per corridor, both legs shown to the customer before confirmation |
| Limits | per transaction, per month, per customer, set from the exchange-control rules ⚖ |
| Compliance | purpose-of-payment code, sanctions screening on both ends, enhanced due diligence above a threshold, the "travel rule" information with the payment, regulatory reporting in both countries |
| Accounting | an FX position account; settle net via the dealer daily; reconcile both pooled accounts separately |

---

# 11. Security and compliance configuration

## 11.1 PCI DSS
Keep the platform **out of card-data scope**: the processor/issuer tokenises and holds PANs; the platform stores only tokens, last four digits, and expiry. Hosted fields or the processor's secure pages for entering card numbers; no PAN in logs (the platform already redacts card numbers). Complete the appropriate PCI self-assessment (SAQ type depends on how card data is handled) and the processor's compliance requirements; annual penetration test; quarterly vulnerability scans.

## 11.2 KYC / AML ⚖ (tiers are illustrative; counsel decides the real thresholds)

| Tier | Evidence | Balance cap | Daily in / out | Typical use |
|---|---|---|---|---|
| Basic | phone number verified, name, ID number | low | low | transit card, small wallet |
| Standard | ID document (ID / passport; Zambia NRC / passport) + selfie liveness + address | medium | medium | everyday use |
| Full | proof of address, source of funds, enhanced checks | high | high | owners, associations, investors |
| Business | registration documents (CIPC / PACRA), directors and beneficial owners, business account details | per business | per business | associations, owner companies |

* Ongoing: transaction monitoring rules (structuring, rapid in-out, high-risk countries), PEP and sanctions screening at onboarding and daily rescreen, case management with a named compliance officer.
* Reporting: suspicious-transaction and threshold reports to the Financial Intelligence Centre in each country, in the formats and times they set ⚖.
* Record keeping: keep KYC and transaction records for the legally required period (commonly five years or more; confirm per country) ⚖.

## 11.3 Data protection ⚖
South Africa: POPIA. Zambia: Data Protection Act and cyber-security laws. Both require a lawful basis, purpose limitation, security safeguards, breach notification and data-subject rights. Configure per country: where data is stored (country databases; no cross-border copy without a legal basis), retention and deletion schedules, consent text, an information officer / data protection officer contact, a breach runbook (who is told within what time), and processor agreements with every provider (bank, processor, email, hosting).

## 11.4 Technical controls (some already in place)
Encrypted transport everywhere; field-level encryption for sensitive values (in place for business details; extend to ID numbers and addresses); keys in a vault with rotation; secrets separated per environment and country; maker-checker on every financial setting; append-only audit log with masked identifiers (in place); role-based access with per-user data scoping (in place); rate limits and lockouts (in place); signed webhooks with replay protection (in place); backups with tested restores, encrypted; disaster-recovery targets (recovery time 4 hours, data loss 15 minutes); security monitoring and an incident runbook; supplier risk review.

## 11.5 Regulatory reporting calendar (to complete with counsel) ⚖

| Report | Regulator | Frequency |
|---|---|---|
| Payment-system / e-money statistics | SARB-PASA / Bank of Zambia | as required |
| Safeguarding / trust balance confirmation | bank / regulator | as required |
| Suspicious and threshold transactions | Financial Intelligence Centre | within the legal deadline |
| Data-protection incident notices | Information Regulator / Zambian authority | per law |
| Audited financial statements | regulators | annual |

---

# 12. Testing and go-live plan

## 12.1 Scenario matrix (run in sandbox per country, then in a controlled live pilot)

| # | Flow | Expected result | Check |
|---|---|---|---|
| 1 | Deposit, real-time confirmed | credited instantly; spendable at once | ledger, pool mirror, notification |
| 2 | Deposit, unsettled EFT | provisional credit within limits | pending balance, reserve exposure |
| 3 | Deposit to wrong / unknown number | goes to suspense queue | queue entry, no customer credit |
| 4 | Duplicate bank event | ignored | one ledger entry |
| 5 | AFC tap under limit, online | approved, fare split, fee taken | splits sum to the fare |
| 6 | AFC tap over limit | declined (asks PIN) | reason code |
| 7 | AFC tap offline then upload | authorised later; shortfall handling | offline loss policy |
| 8 | Frozen card tap | declined; denylist reached terminal | within refresh time |
| 9 | ATM withdrawal | approved within limits; fee shown | balance, limit counters |
| 10 | POS chip and PIN | approved; wrong PIN 3 times locks | counters |
| 11 | Online with 3DS success / fail / timeout | approved / declined / declined | no authorisation without 3DS result |
| 12 | Transfer to another bank | instruction sent once; success and failure paths | idempotency, return of funds |
| 13 | Fee sweep | moves exactly the closed day's earned fees | equals `sys:fees` |
| 14 | Payouts: daily, weekly, below minimum | paid once; small ones roll over | run id, clearing account |
| 15 | Payout failure variants (rejected, timeout, partial) | per section 5.4 | no double payment |
| 16 | Failed confirmed payment later | reversal, negative balance policy | recovery item, limits drop |
| 17 | Reconciliation break (inject a difference) | payouts and sweep blocked; alert | hard stop works |
| 18 | Manual withdrawal attempt by an admin | impossible; logged | no UI/API path, bank also refuses |
| 19 | Fee schedule change | needs two approvers; old transactions keep old fee | version recorded |
| 20 | Country isolation | a ZAR action cannot touch ZMW data | separate stores |

## 12.2 UAT steps
Prepare test partners (bank sandbox, processor sandbox) → seed test customers across all tiers and roles → run the matrix with business owners → compliance walkthrough (KYC, reports, audit trail) → security test (penetration test report, secrets review) → disaster-recovery exercise (restore from backup, bank outage drill) → sign-off sheet.

## 12.3 Launch checklist per country

| ☐ | Item |
|---|---|
| ☐ | Licence / regulator position confirmed in writing ⚖ |
| ☐ | Partner bank contract and fee schedule signed; account structure opened (section 2.1) |
| ☐ | Mandate: no human transacting signatories; whitelist loaded; caps set at the bank |
| ☐ | Card sponsor and processor contracts; BIN ranges live; scheme certification passed |
| ☐ | Country profile complete and approved by two people; every setting `ready` |
| ☐ | Reconciliation running for two weeks in shadow mode with zero unexplained differences |
| ☐ | Risk reserve funded; instant-credit limits set |
| ☐ | PCI attestation, penetration test, backup restore test done |
| ☐ | KYC, sanctions, and regulatory reporting procedures live; compliance officer named |
| ☐ | Customer terms, fee disclosure, privacy notice reviewed by counsel |
| ☐ | Support, fraud and incident runbooks; on-call rota |
| ☐ | Pilot: limited customers and terminals, low limits, daily review for 4 weeks |
| ☐ | Go-live approval recorded (the platform's `PAYMENTS_LIVE_APPROVED_BY` mechanism, per country) |
| ☐ | Rollback plan: switch the country back to sandbox / pause outflows, communicate |

---

# 13. Gaps, ambiguities and legal risks

| # | Issue | Why it matters | Confirm with |
|---|---|---|---|
| 1 | **Pooled customer money = stored value.** Holding and ledgering customers' balances is normally a regulated activity (e-money / payment system), and in South Africa e-money has been restricted to banks | operating without the right authorisation is unlawful; the bank's licence may be the only compliant way | counsel, SARB/PASA, Bank of Zambia, the partner banks ⚖ |
| 2 | **"Nobody can withdraw manually"** is contradictory with banks' legal duties (court orders, insolvency, fraud) | a literal promise cannot be kept; a misleading customer statement is itself a risk | counsel, the bank |
| 3 | **Instant credit before settlement** makes the platform the lender of the gap; failed or recalled payments become your loss | needs reserve capital; may be treated as credit provision ⚖ | counsel, risk, the bank |
| 4 | **Who is the accountable institution for KYC** (the bank or the platform) | decides who must verify, report and retain records | the bank, FIC guidance ⚖ |
| 5 | **Fees swept from the pool to the company** | only earned, disclosed fees may leave; auditors will test it | counsel, auditor |
| 6 | **Interest on the pool** | undecided ownership | you, counsel |
| 7 | **No-PIN taps and offline transit** | scheme rules, liability for offline shortfalls, and country limits; the SA "below R40" and the Zambian value need scheme/processor confirmation | scheme / processor, Bank of Zambia ⚖ |
| 8 | **Bank Zero capabilities** (BaaS, BIN sponsorship, virtual accounts, API) unknown to me | the whole design assumes them; if missing, a different structure is needed | Bank Zero |
| 9 | **Zambian bank, rails and API** undecided | cannot size integration work | you |
| 10 | **Cross-border ZAR↔ZMW** | exchange control and licensing in both countries | counsel, authorised dealer ⚖ |
| 11 | **"Automatic payouts" to drivers and marshals** | current rule: the platform does not calculate driver pay; employment, tax and withholding obligations may apply | you, counsel, tax adviser |
| 12 | **One platform, two countries, shared data** | data-protection and possibly licensing rules differ; separate legal entities may be needed | counsel ⚖ |
| 13 | **System of record** | the SQLite ledger suits a pilot; a national-scale pooled ledger should be on Postgres with replication; choose before building the pool mirror | you, engineering |
| 14 | **Schema gap** | Postgres `accounts` does not accept ZMW; the ledger's fee, limit and bank details are hard-coded | engineering (small, scheduled) |
| 15 | **Customer disclosure** | balances are not bank deposits unless the bank says so; deposit-insurance status must be stated correctly | counsel ⚖ |

---

# Appendix A. Country profile (full example, illustrative values)

```json
{
  "country": "ZM", "version": 3, "status": "draft", "effective_from": null,
  "currency": { "code": "ZMW", "minor_units": 2 },
  "partner": { "bank": "TBC", "account_ref": null, "integration": "adapter:bank/ZM-partner", "sandbox_ref": null },
  "regulator": { "name": "Bank of Zambia", "licence_ref": null, "fic": "Financial Intelligence Centre" },
  "kyc": { "tiers": ["basic", "standard", "full", "business"], "id_documents": ["NRC", "passport"], "business_registry": "PACRA" },
  "limits": {
    "afc_no_pin": { "per_tap": 5000, "daily_cumulative": 15000, "consecutive_taps": 5 },
    "offline": { "allowed": true, "floor": 5000, "daily_total": 25000 },
    "tiers": { "basic": { "balance": 150000, "daily_in": 150000, "daily_out": 100000 } }
  },
  "instant_credit": { "enabled": false, "tiers": {}, "reserve_ratio_max": 3 },
  "fees": { "schedule_id": "ZM-2026-01" },
  "payouts": { "cutoff": "17:00", "min_payout": 5000, "retry": [60, 300, 1800, 7200] },
  "cards": { "products": ["virtual_debit", "physical_debit"], "schemes": ["mastercard", "visa"], "international": false },
  "cross_border": { "corridors": [] },
  "data": { "residency": "ZM", "retention_years": 5 },
  "mode": "sandbox", "live_approved_by": null
}
```
(Amounts in minor units: 5000 = ZMW 50.00.)

# Appendix B. How to add a country
1. Insert a `country_profile` (draft). 2. Add the currency to every table that restricts currencies. 3. Write or select the bank adapter. 4. Load fee, payout and limit schedules and get them approved. 5. Run the scenario matrix in sandbox. 6. Shadow-reconcile. 7. Sign the checklist and switch `mode` to live for that country only.

# Appendix C. Audit events to record (minimum)
Configuration change (before/after, approvers) · fee or limit change · whitelist change · key rotation · break-glass use · every outbound bank instruction and its result · every manual queue resolution · KYC decision · limit override · reconciliation close · reversal · negative-balance write-off · export of customer data.

# Appendix D. What I need from you

1. **System of record:** is the Manshya (SQLite) ledger the one to build on, or should the pooled account be built on the Postgres ledger?
2. **Bank Zero:** have they confirmed BaaS / virtual accounts, BIN sponsorship, the API and sandbox, and the rails you can use?
3. **Zambia:** which bank, which rails, and any early conversation with the Bank of Zambia?
4. **Licensing position:** do you already have a legal opinion on who may hold the pooled funds in each country, and who your counsel is?
5. **Volumes:** expected customers, taps per day and average fare in each country for the first year.
6. **Fee ambitions:** target margin per tap and the lowest fee you want for low-income users.
7. **Instant credit:** how much risk reserve can you fund?
8. **Drivers and marshals:** should automatic payouts include them, and who sets their amounts?
9. **Cross-border:** is ZAR↔ZMW transfer needed at launch, or can it wait?
10. **Names:** compliance officer, trustee (if any), and the two people who will act as approvers.
