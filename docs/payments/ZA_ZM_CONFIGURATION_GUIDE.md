# Configuration guide: transport payments and banking platform (South Africa and Zambia)

Version 1.1 · updated with your confirmed decisions · prepared for the platform owner · **technical guidance, not legal advice** (every item marked ⚖ needs a lawyer or the regulator to confirm)

---

# 0. One-page summary

**What this is.** A step-by-step specification for configuring the platform that already exists so that it runs one shared codebase with **separate configuration per country**: South Africa (ZAR, Bank Zero, SARB/PASA) and Zambia (ZMW, Absa Bank Zambia, Bank of Zambia).

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
| 8 | Cross-border (needed at launch) | Treat it as a separate, gated regulated corridor: ZAR ⇄ ZMW through an **authorised dealer service** (Absa, which operates in both countries) or regional bank settlement, Full-KYC customers only, low limits, quote-locked FX, and **written confirmation from counsel, the dealer and both regulators before go-live**. Section 10.2 |
| 9 | Driver and marshal pay (now automatic) | The platform **executes** association-set amounts. "16 taps" and "R20 per vehicle" can be read several ways, so I have not configured them: choose in section 5.5. The old rule that driver pay is private must be formally replaced |
| 10 | Data | Separate databases (or schemas) per country; no personal data leaves the country without a legal basis ⚖ |


### Decisions you have confirmed (v1.1) and what they change

| Decision | Effect on the design |
|---|---|
| Zambian bank: **Absa Bank Zambia** | Section 7.2 is now specific; Absa also operates in South Africa, which can help the cross-border corridor (and creates a concentration risk, see section 13) |
| **Drivers and marshals are paid automatically**, as well as owners, associations and investors | The platform now **executes** driver and marshal pay. Today it deliberately does not calculate driver pay (a private arrangement with the owner). That rule must be replaced formally (section 5.5) |
| **Cross-border transfers are needed at launch** (ZA and ZM) | This is now the largest regulatory item in the project. Section 10.2 is rewritten as a launch design; both countries' regulators and an authorised dealer must confirm **before** go-live |
| Legal counsel in both countries (names to follow) | Every ⚖ item has an owner; the counsel question list is in Appendix D.5 |
| Risk reserve **R40 (ZA) and K40 (ZM)** | Needs your confirmation: as written it supports almost no instant credit (section 8.6) |
| Payout amounts: driver "based on 16 taps"; marshal **R20 per vehicle**; amounts set by the association (Zambia in kwacha) | Ambiguous; I show the readings and the configuration for each (section 5.5). Please choose |

**Biggest risks:** licensing of the pooled account; crediting before settlement; no-PIN taps and offline transit liability; reconciliation breaks; the cross-border corridor. Section 13 lists them with who must confirm each.

**What I need from you:** five confirmations (Appendix D.3: the risk-reserve figure, the meaning of "16 taps" and "R20 per vehicle", funding of those payouts, and the cross-border limits), plus the bank and lawyer information in Appendix D.4 and D.5, the commercial inputs in D.6 and the names in D.7.

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
| Banking partner ZM | **Absa Bank Zambia** (confirmed) | capabilities and fees open |
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
| Partner | `partner_bank`, `bank_account_ref`, `swift/bic`, `branch_code` | Bank Zero, to confirm | **Absa Bank Zambia**, to confirm | contract | open |
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
| Cross-border | `corridors_enabled` | ZA→ZM, gated until section 10.2.7 is complete | ZM→ZA, gated | counsel + dealer + regulators | ⚖ launch blocker |
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
      "note": "superseded by the association-set driver rule in section 5.5" }
  ]
}
```

## 5.2 Parties and how each is paid

| Party | Basis | Frequency | Source of the rule |
|---|---|---|---|
| Platform fee | fee schedule | at tap, swept daily | company |
| Investor | % of the platform fee (today 10%) | daily or weekly | investor agreement |
| Association | levies and fines credited | monthly (levies), per event (fines) | association's own levy rules |
| Marshal | association-set amount, **R20 per vehicle** in South Africa (kwacha amount in Zambia): reading to confirm in 5.5 | weekly | association |
| Vehicle owner | remainder after fees and splits | daily | system |
| Driver | association-set amount **based on 16 taps**: reading to confirm in 5.5 | daily | association |

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


## 5.5 Driver and marshal payouts (your rules as stated, and what I need you to confirm)

**Recorded:** the taxi association sets the amounts. Driver pay is "based on 16 taps". The marshal is paid R20 per vehicle; in Zambia the association sets the kwacha amount.

**Why I am asking:** each phrase can mean different amounts of money, so I have configured nothing yet. The platform supports all of these readings through one rule format; you choose.

| Rule | Reading A | Reading B | Reading C |
|---|---|---|---|
| Driver "based on 16 taps" | a **fixed amount** (set by the association) is paid each time the vehicle completes **16 confirmed taps** (one "trip") | the driver is paid the **fare value of 16 taps** per day (a daily wage), the rest goes to the owner | the first 16 taps of the day cover the owner's costs, and the driver's share starts from tap 17 |
| Marshal "R20 per vehicle" | R20 for each **departure the marshal logs** at the rank (this data already exists: the `departures` table) | R20 for each **vehicle served at the rank per day**, however many departures | R20 per vehicle **registered** with the rank per month |

**Where the money comes from (decide):** the safe default is the **vehicle owner's remainder** for driver pay (the owner receives what is left after fees, so driver pay is taken from it) and the **association** for marshal pay (from its levies and fines credited). This needs the owner's and the association's **written consent to automatic deduction** ⚖ and must never make a balance negative. If the association or the owner has too little money on a payout day, the payout waits (it is not paid from anyone else's money).

### Configuration (works for every reading; set `unit` and `amount_type` after you choose)

```json
{
  "payout_rules": [
    { "id": "driver_tap_pay", "party": "driver", "set_by": "association",
      "trigger": { "event": "afc_tap.confirmed", "group_by": "vehicle" },
      "unit": { "type": "every_n_taps", "n": 16 },
      "amount_type": "fixed",            // or "fare_value_of_unit" for Reading B
      "amount": null,                    // set by the association, in the country's currency
      "funded_from": "owner.remainder", "daily_cap": null,
      "dedupe": "tap_id", "settle": { "mode": "daily", "cutoff": "17:00" } },
    { "id": "marshal_per_vehicle", "party": "marshal", "set_by": "association",
      "trigger": { "event": "marshal.departure.logged" },
      "unit": { "type": "per_event" },
      "amount_type": "fixed",
      "amount": { "ZA": 2000, "ZM": null },   // R20.00 = 2000 cents; Zambia amount set by the association
      "funded_from": "association.balance", "daily_cap_per_marshal": null,
      "dedupe": "departure_id", "settle": { "mode": "weekly", "day": "friday" } }
  ]
}
```

### Controls these rules need
* **Association sets the amounts** in its dashboard; every change is dual-approved (maker-checker), versioned, effective-dated, and each payout records the rule version it used.
* **Idempotent per source event:** one tap or one departure can never be paid twice (`dedupe`). A marshal's departure that is later deleted or corrected reverses its payout.
* **Anti-fraud:** departures logged without matching taps, or taps counted twice, go to a review queue; caps per marshal per day; the same vehicle cannot be logged twice within a few minutes.
* **Visibility:** each driver and marshal sees a statement of what was earned and paid (their dashboard already shows records; a payout statement is added). The statement is a summary, not a payslip.
* **Employment and tax** ⚖: paying drivers and marshals by rule may create wage, withholding and record-keeping duties. Your tax adviser must say whether they are employees, contractors or fare-sharers in each country.

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


## 7.2 Zambia: Absa Bank Zambia (confirmed partner) ⚖

**What to obtain from Absa Zambia in writing before building** (the full request list is Appendix D.4):

| Topic | What I need to know |
|---|---|
| Account structure | Will Absa hold the Transactional Account under its licence with **sub-accounts or virtual accounts** per customer, or only a single pooled account? |
| API | Is there an API (or host-to-host / file) for account creation, payment initiation, balance, statements and **real-time deposit notifications**? Is there a sandbox? |
| Rails | Which domestic rails (real-time gross settlement, retail switch, mobile-money interoperability) and what are their cut-offs, limits and costs? |
| Cards | Can Absa Zambia **sponsor a BIN** (Mastercard and Visa) or must another sponsor be used with Paymentology? |
| Cross-border | Can Absa Zambia and Absa South Africa run the **ZMW⇄ZAR corridor** (dealer service), and through which channel (the bank's own network or the SADC regional settlement system)? |
| Regulator | Which approvals does Absa need from the Bank of Zambia for this arrangement, and what will Absa give us as written proof? |
| KYC | Who is responsible for customer verification: Absa, the platform on Absa's behalf, or both? |
| Fees | Account, per-payment, card, FX and cross-border fees (these feed the fee engine in section 4). |

**Note:** Absa is on both sides of the corridor (Zambia and South Africa) while Bank Zero holds the South African pool. That is convenient for settlement but means two different banks must cooperate on one transfer; agree the settlement path with all three parties before any build.

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


## 8.6 The risk reserve you stated (R40 and K40): please confirm

The platform will **enforce** `maximum provisional exposure ≤ reserve × reserve_ratio` (default ratio 3). Here is what the figures support:

| Reserve in the country's own account | Maximum unsettled instant credit it supports (ratio 3) | What this means |
|---|---|---|
| **R40 / K40** (as you wrote) | **R120 / K120** | Less than one deposit in the smallest tier (R500). Instant credit of anything not already confirmed in real time would be effectively **off**. |
| R4,000 / K4,000 | R12,000 / K12,000 | A handful of small provisional deposits |
| R40,000 / K40,000 | R120,000 / K120,000 | A realistic pilot for the Basic and Standard tiers in section 8.2 |
| R400,000 / K400,000 | R1.2 million / K1.2 million | A scale in which the Full tier can be used |

**I think R40 may be a slip** (it is also your tap limit, R40). If you meant R40,000 and K40,000, say so. Until you confirm, the configuration I recommend is: instant credit **only** for payments the paying bank has confirmed in real time (irrevocable push payments); **no** provisional credit for unsettled EFT, card top-ups or cash; and the reserve figure stored per country so the exposure rule cannot be bypassed. The reserve must be a separate bank account and must not be spent on operating costs.

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


## 10.2 Between South Africa and Zambia (ZAR ⇄ ZMW): launch design ⚖

You have confirmed this is needed at launch. It is possible, but it is a **regulated activity in both countries**, so it is a separate, gated workstream: nothing is switched on until the dealer and both regulators have confirmed in writing.

### 10.2.1 How the money moves (options)

| Model | How it works | Pros | Cons | My view |
|---|---|---|---|---|
| **A. Authorised-dealer service from the partner banks (recommended)** | The customer sends from the SA ledger; the platform instructs a licensed bank dealer (Absa, since it operates in both countries) to convert ZAR and pay ZMW into the Zambian pool; the platform **never converts currency itself** | the bank carries exchange-control reporting and FX; lowest legal burden on you | depends on Absa offering it to a customer like you; the Bank Zero leg needs a separate settlement path | start here |
| B. Regional bank-to-bank settlement (SADC regional payment system) | participant banks settle cross-border payments in the region, in ZAR | regulated, built for the region | access is through participant banks, not directly; cut-offs and scheme rules | ask Absa whether they offer it as a service |
| C. Your own FX / money-transfer licence | you hold the permissions | full control | a long licensing process in both countries | not for launch |

### 10.2.2 Ledger and settlement
* The two countries stay **closed ledgers**. A transfer is two linked transactions: in the sender's country debit the customer and credit `sys:corridor_out_clearing:<CC>`; in the receiver's country debit `sys:corridor_in_clearing:<CC>` and credit the customer. Each side's clearing account is settled through the dealer and **reconciled separately** (section 9).
* **Pre-funding or net settlement** (agree with the dealer): either each country's corridor account is topped up in advance, or the dealer nets both directions daily. Pre-funding is safer; net settlement ties up less cash. Set `corridor.settlement` per country.
* The platform holds **no FX position** in Model A: the dealer's quote is passed through. If you ever pre-fund in the other currency, add `sys:fx_position` with a hard exposure limit.

### 10.2.3 Corridor configuration

```json
{
  "corridors": [
    { "id": "ZA-ZM", "from": "ZA", "to": "ZM", "enabled": false, "model": "authorised_dealer",
      "dealer": { "name": "Absa", "adapter": "fx/absa", "quote_ttl_seconds": 60 },
      "kyc_tier_required": "full", "business_tier_allowed": true,
      "limits": { "per_transaction": 500000, "per_day": 1000000, "per_month": 3000000, "currency": "ZAR" },
      "fx": { "rate_source": "dealer_quote", "margin_pct": 0.01, "fee_flat": 5000, "show_both_legs": true },
      "purpose_codes_required": true, "source_of_funds_above": 1000000,
      "screening": ["sanctions_sender", "sanctions_beneficiary"], "cutoff": "15:00", "weekend": "queue",
      "reporting": ["dealer_balance_of_payments", "fic_threshold", "bank_of_zambia_if_required"],
      "settlement": { "mode": "net_daily", "cover_account": "sys:corridor_cover:ZA" } },
    { "id": "ZM-ZA", "from": "ZM", "to": "ZA", "enabled": false, "model": "authorised_dealer",
      "limits": { "per_transaction": null, "per_day": null, "per_month": null, "currency": "ZMW" } }
  ]
}
```
(Amounts in minor units; limits above are illustrative starting values, R5,000 per transfer, R10,000 per day, R30,000 per month, to be aligned with the exchange-control rules ⚖.)

### 10.2.4 Customer flow and FX
1. Customer must be **Full KYC** (section 11.2); passengers on the Basic tier cannot use the corridor.
2. They enter amount, beneficiary (validated), and **purpose of payment**.
3. The platform requests a **dealer quote valid for 60 seconds**: rate, the margin, the fee, the amount received in ZMW. Both currencies and every charge are shown before confirmation.
4. On confirm, the ledger debits the customer and the fee **once**, the instruction goes to the dealer with an idempotency key, and the status is shown as *sent → converted → delivered*.
5. Quote expired → a new quote is required; the rate is never "honoured later".

### 10.2.5 Compliance for the corridor ⚖
* **South Africa:** cross-border payments are controlled through the South African Reserve Bank's exchange-control framework and carried out by authorised dealers, who also do the balance-of-payments reporting; individuals and businesses have allowances and supporting-document rules. Counsel and the dealer must say what applies to your customers and to the platform as originator.
* **Zambia:** confirm with the Bank of Zambia and Absa what applies to incoming and outgoing transfers and reporting.
* **Both:** sanctions screening of sender and beneficiary on every transfer; enhanced due diligence above a threshold; the sender and beneficiary information must travel with the payment (the "travel rule"); suspicious and threshold reporting to the Financial Intelligence Centre in each country; records for the legal retention period.
* **Not allowed:** structuring (many small transfers to avoid limits): add a rule that aggregates per sender and per beneficiary over 24 hours and 30 days.

### 10.2.6 Failure and reversal
| Situation | Handling |
|---|---|
| Rejected before conversion (sanctions, invalid beneficiary) | reverse the customer debit in full, including the fee |
| Failed after conversion | the dealer returns the money at **its** rate; policy decides who bears any difference (recommend: the platform bears the difference up to a cap, shown in the terms) ⚖ |
| Unknown result | query the dealer by idempotency key; never resend blindly |
| Weekend or cut-off miss | status "queued", with an estimated delivery time shown |
| Beneficiary account closed or returned | funds return to the sender's ledger, notice sent |

### 10.2.7 What you must obtain before launch (all in writing)
1. A **legal opinion in both countries** that the corridor structure is permitted for your platform and customers ⚖.
2. A **contract with the authorised dealer** (Absa or another) covering FX quotes, settlement, reporting, and the sender-originator model.
3. Written position from the **South African Reserve Bank** (through the dealer or counsel) and the **Bank of Zambia**.
4. Agreement of the **settlement path** between Bank Zero, Absa South Africa and Absa Zambia.
5. Limits and purpose codes approved by compliance in both countries.
6. A tested **reconciliation** of corridor clearing accounts in both countries (section 9).

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
| 21 | Cross-border ZAR→ZMW, success | quote shown, confirmed, delivered; both clearing accounts settle | ledgers, dealer confirmation |
| 22 | Cross-border with expired quote | new quote required; nothing sent | no stale rate honoured |
| 23 | Cross-border above limit / Basic-tier customer | declined with reason | limits, tier check |
| 24 | Cross-border sanctions hit (sender or beneficiary) | blocked; compliance case opened; funds not moved | screening log |
| 25 | Cross-border failed after conversion | refund at the dealer's rate; cap policy applied | difference recorded |
| 26 | Cross-border reconciliation, both sides | each country's clearing account matches its dealer statement | reconciliation report |
| 27 | Driver payout from taps (your chosen reading) | paid once per qualifying taps; owner's remainder reduced | dedupe, ledger |
| 28 | Marshal payout per vehicle departure | R20 (ZM: the association's amount) per logged departure, once | dedupe, weekly run |
| 29 | Payout when the funding balance is too low | payout waits, nobody else's money used | queue, notification |

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
| ☐ | **Cross-border:** written legal opinion in both countries, dealer contract, regulator positions, and settlement path agreed ⚖ (nothing goes live without these) |
| ☐ | **Absa Zambia:** account structure, API access, card sponsorship answer, and Bank of Zambia confirmation received in writing |
| ☐ | **Payout rules:** association amounts entered, owner and association deduction consents signed, reading of "16 taps" and "per vehicle" recorded |

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
| 9 | **Absa Zambia capabilities and rails** (virtual accounts, card sponsorship, API, cross-border) unconfirmed | the design assumes them; the answers decide the structure | Absa Zambia (request list in D.4) |
| 10 | **Cross-border ZAR↔ZMW** is now a launch requirement | exchange control and licensing in both countries; see item 17 | counsel in both countries, authorised dealer ⚖ |
| 11 | **Automatic payouts to drivers and marshals** (confirmed) | the platform now executes wage-like payments; see items 19 and 20 | you, counsel, tax adviser |
| 12 | **One platform, two countries, shared data** | data-protection and possibly licensing rules differ; separate legal entities may be needed | counsel ⚖ |
| 13 | **System of record** | the SQLite ledger suits a pilot; a national-scale pooled ledger should be on Postgres with replication; choose before building the pool mirror | you, engineering |
| 14 | **Schema gap** | Postgres `accounts` does not accept ZMW; the ledger's fee, limit and bank details are hard-coded | engineering (small, scheduled) |
| 15 | **Customer disclosure** | balances are not bank deposits unless the bank says so; deposit-insurance status must be stated correctly | counsel ⚖ |
| 16 | **Risk reserve stated as R40 / K40** | supports almost no instant credit; if it is a typo the sizing changes completely | you (section 8.6) |
| 17 | **Cross-border is a launch requirement** | highest regulatory exposure: exchange control in South Africa, Bank of Zambia rules, authorised-dealer dependency, FX, sanctions | counsel in both countries, Absa, SARB / Bank of Zambia ⚖ |
| 18 | **One bank group on both sides** (Absa) with a different South African pool bank (Bank Zero) | settlement across three institutions; concentration if Absa stops the service | the banks |
| 19 | **Automatic driver and marshal pay replaces the "driver pay is private" rule** | the platform now executes wages-like payments; deduction consent, tax and employment status | counsel, tax adviser ⚖ |
| 20 | **"16 taps" and "R20 per vehicle" are ambiguous** | wrong reading = wrong money paid out | you (section 5.5) |

---

# Appendix A. Country profile (full example, illustrative values)

```json
{
  "country": "ZM", "version": 3, "status": "draft", "effective_from": null,
  "currency": { "code": "ZMW", "minor_units": 2 },
  "partner": { "bank": "Absa Bank Zambia", "account_ref": null, "integration": "adapter:bank/ZM-partner", "sandbox_ref": null },
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
  "cross_border": { "corridors": ["ZM-ZA"], "enabled": false, "note": "gated, see section 10.2.7" },
  "data": { "residency": "ZM", "retention_years": 5 },
  "mode": "sandbox", "live_approved_by": null
}
```
(Amounts in minor units: 5000 = ZMW 50.00.)

# Appendix B. How to add a country
1. Insert a `country_profile` (draft). 2. Add the currency to every table that restricts currencies. 3. Write or select the bank adapter. 4. Load fee, payout and limit schedules and get them approved. 5. Run the scenario matrix in sandbox. 6. Shadow-reconcile. 7. Sign the checklist and switch `mode` to live for that country only.

# Appendix C. Audit events to record (minimum)
Configuration change (before/after, approvers) · fee or limit change · whitelist change · key rotation · break-glass use · every outbound bank instruction and its result · every manual queue resolution · KYC decision · limit override · reconciliation close · reversal · negative-balance write-off · export of customer data.

# Appendix D. Decisions, recommendation, and what I need from you

## D.1 Decisions recorded
| Item | Decision |
|---|---|
| Zambian bank | Absa Bank Zambia |
| Automatic payouts | owners, associations, investors **and drivers and marshals** |
| Cross-border transfers | needed at launch, South Africa and Zambia |
| Legal counsel | one firm in each country (names to be added) |
| Risk reserve | stated as R40 / K40: **to confirm** (section 8.6) |
| Payout amounts | association sets them; driver "based on 16 taps", marshal R20 per vehicle: **to confirm** (section 5.5) |

## D.2 Ledger choice: my recommendation (Postgres as the system of record)

You left this open, so here is a recommendation and the reasons.

**Build the pooled account, virtual accounts and country ledgers on the Postgres ledger, and keep the Manshya (SQLite) core as the product layer on top of it** (with a nightly mirror and reconciliation while you migrate).

| Reason | Detail |
|---|---|
| Scale and concurrency | the Manshya database is one SQLite file on one volume with a single writer; a pooled account serving taps from many terminals in two countries needs row-level locking and parallel writers |
| Resilience | Postgres supports replication, point-in-time recovery and tested restores; a single SQLite file on one volume is a single point of failure for money |
| Data residency | separate databases or schemas per country are straightforward in Postgres (section 11.3) |
| Reconciliation and reporting | the three-way reconciliation, exception queues and regulator reports are SQL workloads; they need joins, indexes and long retention |
| Guard rails already designed | the repository already has a Postgres ledger design with a single writer service, idempotency keys, cached balances and a `REVOKE` plan so nothing else can write entries |
| Fewer moving parts later | one ledger is easier to audit than two |

**Cost and risk:** the Manshya core's features (cards, banking, payouts, statements) are built on SQLite today, so migration is real work; and the Postgres ledger's older shadow-write tests were not fully green when I last ran them, so it must be hardened first. **Suggested order:** (1) harden the Postgres ledger and add the pool mirror and `ZMW`; (2) move **new** flows (deposits, AFC, payouts, corridor) to it; (3) keep Manshya running with a mirror and daily reconciliation; (4) migrate Manshya's own ledger behind the same interface, then retire SQLite for money.

## D.3 Please confirm these five things now
1. **Risk reserve:** is it **R40 and K40**, or **R40,000 and K40,000** (or another figure)?
2. **Driver pay:** which reading of "based on 16 taps" (A, B or C in section 5.5), what is paid (a fixed amount or the fare value), and is it per vehicle per day or per trip?
3. **Marshal pay:** is R20 paid per **departure the marshal logs**, per vehicle served per day, or something else? Who funds it: the association or the owner?
4. **Funding:** may driver pay be deducted from the owner's remainder, and marshal pay from the association's balance (with written consent)?
5. **Cross-border limits:** are my illustrative limits (R5,000 per transfer, R10,000 per day, R30,000 per month for Full-KYC customers) acceptable as a starting point?

## D.4 Information I need from the banks (what you must obtain, in writing)

**Bank Zero (South Africa): please obtain**
| ☐ | Item |
|---|---|
| ☐ | Does Bank Zero offer a partner / banking-as-a-service programme? Under whose licence are customer balances held? |
| ☐ | **Virtual accounts or sub-accounts** per customer: yes or no, how created, how many, cost |
| ☐ | **BIN sponsorship**: can Bank Zero sponsor Mastercard and Visa BINs? If not, which sponsor do they accept? |
| ☐ | **API**: specification, authentication, sandbox access, real-time **deposit notifications** (webhook or polling) |
| ☐ | Supported **payment rails** (EFT, instant payments) with cut-offs, limits and costs |
| ☐ | Who is the **accountable institution** for FICA verification of customers |
| ☐ | Mandate options: **no human transacting signatories**, beneficiary whitelist, bank-side caps, dual approval |
| ☐ | Cross-border: do they offer it, or is another bank needed for that leg? |
| ☐ | Full **fee schedule** to enter into the fee engine |

**Absa Bank Zambia: please obtain** (same list as above, plus)
| ☐ | Domestic **rails** and **mobile-money interoperability**, cut-offs, limits |
| ☐ | **Virtual-account** support and card **sponsorship** answer |
| ☐ | **Cross-border** service with Absa South Africa (and whether through a regional settlement scheme) |
| ☐ | Bank of Zambia approvals they need for this arrangement, and whether **early contact** with the Bank of Zambia has been made (you left this blank; if there has been none, I recommend a request this month) |

## D.5 Questions for your lawyers (one firm in each country)
1. Who may hold and ledger customers' pooled funds in this country (the bank under its licence, a licensed e-money issuer, or the platform with a trust account)? What licence or registration does the platform need?
2. Is the "no unilateral manual withdrawal" structure (API-only mandate, whitelist, dual control, trustee) acceptable to the regulator and the bank?
3. Is instant credit of bank-confirmed payments before settlement permitted, and does it count as credit provision?
4. Customer-facing disclosures: are balances deposits, is any deposit protection available, and what must the terms say?
5. KYC and AML: which tiers and limits are permitted; who is accountable; reporting duties and deadlines.
6. Data protection: processing, storage and any cross-border transfer of personal data between the two countries.
7. Cross-border: permitted structure, allowances and documentary requirements, reporting, and whether the platform needs its own permission as originator.
8. Paying drivers and marshals by rule: employment or contractor status, withholding and tax, consent for automatic deduction.
9. Contractual terms: liability for offline no-PIN taps, chargebacks, and fraud between the platform, banks and processor.

## D.6 Commercial inputs (please fill in)
| Input | South Africa | Zambia |
|---|---|---|
| Expected customers in year 1 | | |
| Taps per day (pilot / month 6 / month 12) | | |
| Average fare | | |
| Target margin per tap | | |
| Lowest fee you want low-income users to pay | | |
| Risk reserve you can fund | (confirm, see D.3) | (confirm, see D.3) |
| Cross-border transfers expected per month and average size | | |

## D.7 Governance (please fill in)
| Role | Name |
|---|---|
| Compliance officer | |
| Approver 1 (maker-checker) | |
| Approver 2 (maker-checker) | |
| Trustee or independent overseer (if used) | |
| Legal counsel, South Africa | |
| Legal counsel, Zambia | |
