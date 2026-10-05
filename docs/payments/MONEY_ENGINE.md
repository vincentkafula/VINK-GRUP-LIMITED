# Money engine: how it works and how to run it

What the platform does with money once a tap, a bank credit or an agreement exists. Amounts are whole minor units (cents). Every ledger posting has a fixed reference, so it happens exactly once however often it is retried.

## Settings (Railway variables)

| Variable | Meaning |
|---|---|
| `CONFIG_APPROVALS_REQUIRED` | Approvals a configuration change needs from people other than its creator. Default 2. |
| `MONEY_ENGINE` | `off` stops the 30-second cycle (settlement, trips, agreements, payments). |
| `BANK_WEBHOOK_SECRET` | Switches on the bank's signed credit feed (`POST /api/webhooks/bank-credits`). Without it the endpoint answers 503. |
| `PAYMENT_CHANNEL_ACCOUNTS` | The pooled bank accounts customers pay into (in-person, online). Shown to users; never created here. |
| `FX_PROVIDER_KEY` / `FX_AUTO` | Optional ExchangeRate-API key; `FX_AUTO=off` stops the automatic rate fetching. |
| `PAYMENTS_MODE` | `sandbox` confirms taps automatically (if the profile allows). Live taps wait for a real authorisation. |

## The country profile (`/admin/config`)

One versioned profile per country: fees, AFC split, no-PIN limits, trip size, marshal fee, payout rules, KYC-tier limits, instant credit, cross-border corridors. A change is a draft, then submitted, approved by others, then activated. Nothing is live until activated; going live needs the confirmation phrase.

Switches that are **off** in the baseline, so nothing changes until staff turn them on in an approved version:

- `limits.enforce`: apply the tier limits to payments out to other banks, card and cash-machine payments, and deposits.
- `instantCredit.enabled`: credit a not-yet-cleared deposit from the reserve.
- `corridors[].enabled`: open a cross-border route.

## What happens to a tap

1. Confirmed tap: the platform keeps its fee, the investor gets their share of that fee, the rest goes to the owner side (or the driver on cash basis).
2. 16 confirmed taps make a trip (fewer carry over). The driver pays the marshal fee to the marshal who logged the departure, or to the association when none was logged.
3. Agreements: weekly cash basis (driver pays owner), monthly salary (owner pays driver), per-trip amount (owner pays driver). The driver must accept first. A payer's account never goes below zero: marshal fees and per-trip pay wait; weekly and monthly amounts are paid as far as the balance allows and the rest stays as arrears.

## Currencies

Rand lives in the users' Banking accounts and the normal system accounts. Kwacha has its own wallet per user and its own clearing, fee, external-in, reserve and cross-border accounts. A journal never mixes currencies.

## Paying money in (virtual accounts)

Each user has one reference per currency and pool (`VKR…` rand, `VKK…` kwacha, with a check digit). A customer pays into the pooled bank account quoting it. A bank credit is matched to the user and credited once (the bank's own reference is the key). A credit that does not match (bad or missing reference, wrong currency, no verified account) is **held**, never guessed. Staff match it on `/admin/config`.

Staff can record a bank line by hand, or the bank can send it automatically:

```
POST /api/webhooks/bank-credits
x-timestamp: <unix seconds>
x-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with BANK_WEBHOOK_SECRET>
{ "bankRef": "...", "event": "received|pending|cleared|returned", "reference": "VKR...", "amountCents": 12500, "currency": "ZAR" }
```

A message older than 5 minutes, or with a bad signature, is refused. The real bank's format will differ: `server/src/routes/bankFeed.ts` is the one place to adapt.

## Instant credit

Off by default. When on, a payment the bank reports as not yet cleared is credited at once from a reserve the platform funds, within the per-deposit limit, the reserve minimum and the outstanding-to-reserve ratio. When the bank clears it the reserve is repaid; when the bank returns it, the money is taken back only if the customer still has it. If they have spent it, it is flagged for staff and the platform bears the loss until they decide.

## Cross-border (ZA to ZM and back)

Closed by default. Exchange rates are fetched automatically every hour while a route is open (and at start), from two free daily-reference sources: ExchangeRate-API open access (primary; no key, attribution shown on the quote) and currency-api by fawazahmed0 (cross-check). With `FX_PROVIDER_KEY` set, ExchangeRate-API's keyed endpoint is used instead. `FX_AUTO=off` turns the fetching off.

Safety rules: if the two sources differ by more than 5%, nothing changes; a new rate more than 15% from the one in use is not applied automatically; a rate staff set by hand is kept for 24 hours; a quote refuses an automatic rate fetched over 3 hours ago or whose source data is over 36 hours old (a hand-set rate must be under an hour old). These are daily reference rates, not dealing rates, so keep the corridor margin wide enough to cover a day of movement. Staff can refresh or override on `/admin/config`.

A user gets a quote (fee, rate after margin, 60-second life), then confirms. Confirmation posts two journals, one per currency. If it stops between them the transfer stays "posting" and confirming again finishes it.

## Reconciliation (`/admin/config`)

Read-only checks: every settled tap and credited bank line has its ledger posting; held taps and unmatched bank credits are listed; payments waiting over a day; trips needing review; cross-border transfers stuck half-posted.

## Still manual

- Bank statement lines, until the bank's feed is connected.
- Zambia stays a draft until the Absa details exist.
