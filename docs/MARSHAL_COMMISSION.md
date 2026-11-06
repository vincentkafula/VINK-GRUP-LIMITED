# Marshal commission and payslips

Taxi marshals manage the queue at a rank and, until now, were paid the marshal fee (R20 by default) directly by the driver on each trip, with no record of their work, no payslip and no proof of income.
This module turns the fee into the **association's trip fee**, pays the marshal a **percentage of it** (the commission), records every trip and every queue decision, and gives the marshal a payslip they can
read, query, share and keep. The design is in the planning document "Marshal Dashboard upgrade: commission, payslip and protection"; this file describes what is built.

**Nothing changes for any association until it opts in.** Commission is `off` for every association by default.

## The rule

```
commission = trip fee x commission rate          (R20 x 40% = R8.00, to the nearest cent, half up)
```

- A **completed trip** is a departure the marshal loaded in the queue and marked departed (a `departures` row, which a rank-device session also makes when it closes). A vehicle that was loaded but did not depart has no
  departure, so it earns nothing. A trip that was cancelled, aborted or returned counts only if an admin approves it with a reason code (the commission is earned, the driver is not charged).
- The **trip fee** and the **commission rate** are configuration, each with an effective-from date, and are **never edited**: a new rule with a later date supersedes. The most specific rule in force on the trip's day wins:
  fee by route, then rank, then association, then the association's old marshal-fee setting, then R20; rate by marshal, then rank, then the association default. A trip keeps the rule it was calculated with.
- Optional **tiers**: from the trip after the marshal's Nth in the week, a higher rate applies; never backdated; restarts each Monday; a marshal's own rate is not overridden.
- Each departure is calculated **once** (one trip fee and one commission per departure, enforced by unique keys), so a retry, a resend or a second path never counts it twice, and a crash half-way is finished by calling it again.
- Every calculation is a row that is never edited: a correction is a **reversal** (a negative row at the next sequence number). `trip_commissions` is the audit trail: trip, vehicle, driver, rank, marshal, fee, rule and rate applied, tier, result, engine version.

## Modes

| Mode | What happens |
| --- | --- |
| `off` (default) | Today's behaviour. The marshal fee goes to the marshal. None of this runs. |
| `shadow` | Every departure is calculated and recorded, but **no money moves**, so the figures can be compared with today's payments for a few weeks. Past trips can be calculated with "Calculate past trips". |
| `commission` (live) | The driver pays the trip fee to the **association** (a `trip_fee` payment item, collected and retried by the money engine), and the marshal's share accrues for the payslip. The old marshal fee is no longer also charged for rank trips. A trip with no marshal (an owner's own device) still carries the fee, accruing to the association. |

Switching on needs a default commission rate to exist. **Recommended rollout:** set the fee and rate, switch one association to `shadow`, calculate the last few weeks, compare with what marshals were paid, then switch that association
to `commission` at the start of a pay period.

## Payslips

A payslip is computed from the frozen commission records, never from anything typed in:

```
gross commission = sum of the trips' commission, less any reversal
net pay          = gross commission + other earnings - deductions
```

- **Pay period**: weekly, fortnightly (counted from the association's Monday anchor) or monthly. A period can be prepared once it has finished. Preparing makes **drafts** the admin can review and recompute; nothing is locked or paid.
- **Issuing** recomputes the figures and refuses if they have changed since the draft, stamps the trips and the adjustments as used (so no trip is paid twice), and arranges the payment: `wallet` creates a `marshal_commission`
  payment item from the association to the marshal's linked VINK account (retried by the money engine until the association's account can pay it); `bank` or `cash` waits for the admin to record the payment with a reference.
- A trip recorded **late** appears on the next payslip as a late trip; a **reversal** of a trip already paid appears on the next payslip as its own line. A reversal bigger than the period's commission carries forward as a deduction.
- **Other earnings**: bonus, incentive, allowance, an upheld query's credit. **Deductions** (advance or loan repayment, shortfall or penalty, association fee, stokvel contribution) each need a **reason** and carry a **reference**, and may
  be taken in instalments. Deductions never take more than the association's **cap** of a payslip (50% by default); what the cap leaves out carries to the next payslip and the line says so. **UIF** is taken only from marshals
  classed as employees at an association that has switched it on, outside the cap.
- **When commission becomes payable**: `recorded` (default: a driver paying late never affects the marshal) or `paid` (only once the driver has paid the fee; the payslip shows what is held back).
- The payslip shows year to date, a day-by-day breakdown (and the trips behind each day), the fees drivers still owe, and a footer: generated from system trip records, not a tax document, no PAYE calculated.
  It is available as a small PDF and as a WhatsApp or email share of its figures.

## Queue record and reasons

Every queue change (join, depart, remove) is logged in `queue_events` with who made it and when. A vehicle that leaves **out of order**, or is **taken out of the line**, needs a **reason code** once the association has commission
on (or in shadow), and an out-of-order departure is always logged as an override. The reason list is fixed (`reason_codes`), so deviations are comparable. A driver sees their own place in the queue.

## Who sees what

| Role | Sees |
| --- | --- |
| Marshal | Only their own earnings, trips, issued payslips (never a draft), queries, money check, and queue changes. Chooses their language and gives or withdraws consent. |
| Driver | Only their own place in the queue and the trip fees on their own trips. Never what a marshal earns. |
| Association | Its own rules, settings, trips, pay runs, payslips, adjustments, queries and the access log. Nothing of another association. |

Every read of a payslip or its PDF is recorded in `access_log` (who, what, when), and the association can see who has looked at a marshal's records. A marshal's identity on a payslip is a number, not an ID document.

## API

Association (`/api/portal/association`): `GET|PUT /commission/settings`, `GET /commission/rules`, `POST /commission/fee-rules`, `/commission/rates`, `/commission/tiers`, `POST /commission/backfill`, `GET /commission/trips`,
`POST /commission/trips/:departureId/waive`, `POST /commission/exceptions`, `GET /commission/reconciliation`, `GET /commission/marshals`, `PUT /commission/marshals/:id`, `GET|POST /payruns`, `POST /payslips/draft`,
`GET /payslips/:id` (and `.pdf`), `POST /payslips/:id/issue`, `POST /payslips/:id/revise`, `POST /commission/trips/:id/refund`, `GET /shifts`, `POST /shifts/detect`, `POST /shifts/:id/decide`, `GET /incidents` (and `/:id/photo`, `POST /:id/ack`), `GET /risk-map`, `GET /grievances`, `POST /grievances/:id/respond`, `GET /welfare-insights`, `GET|PUT /benefits`, `GET /work-record/:marshalId`, `POST /income-letters/verify`, `GET /kpis` (and `.csv`, `.pdf`), `GET /patterns`, `POST /payslips/:id/payment`, `GET|POST /adjustments`, `POST /adjustments/:id/cancel`, `GET /disputes`, `POST /disputes/:id/respond`, `GET /access-log`.

Marshal (`/api/portal/marshal`): `GET /earnings`, `GET /earnings/day/:date`, `GET /payslips`, `GET /payslips/:id` (and `.pdf`), `GET|POST /disputes`, `GET /money-check`, `GET|PUT /profile`, `PUT /consents/:purpose`,
`GET /queue-events`, `GET /reason-codes`, `GET|POST /cash-out`, `GET|POST /shifts`, `PUT /shifts/:id`, `GET|POST /incidents`, `GET|POST /grievances`, `GET /benefits`, `GET /work-record`, `GET|POST /income-letters` (and `/:id`, `/:id.pdf`); the existing `POST /ranks/:id/depart` and `/queue/:queueId/remove` take a `reasonCode`.

Driver (`/api/portal/driver`): `GET /queue-position`, `GET /fees`, `GET /trip-fees`, `GET|POST /disputes` (a query about a trip they drove).

## Queries (disputes)

A marshal can query any line of an issued payslip or a trip they handled; a driver can query a trip they drove. It goes to the association and is tracked (open, under review, upheld, rejected). Upholding needs a reason the person
sees. A driver's upheld query waives an unpaid fee and reverses that trip's commission, or refunds a fee already paid. A marshal's upheld query can carry a credit that appears on their
next payslip as its own line.

## Refunds, revisions and drawing earned commission

- **Refund a paid fee.** A trip fee the driver has already paid is refunded by the association: a `trip_fee_refund` payment item pays the driver back through the money engine (retried until the association's account can pay),
  the trip is marked refunded, and the marshal's commission for it reverses unless the association absorbs it. An upheld driver query on a paid fee does this automatically. A fee not yet paid is waived instead.
- **Revise a payslip.** An issued payslip that has **not been paid** can be revised with a reason: its payment is cancelled, its trips and adjustments are released, and the old payslip stays on record marked *revised*.
  Preparing the period again makes a new version (number ending `-R1`, `-R2`) that supersedes it. A payslip already paid is corrected by a reversal or credit on the next one.
- **Cash-out.** Off until the association switches it on (Commission settings). A marshal may draw up to the association's share (50% by default) of commission already earned on trips **whose fee has been paid**, less anything already
  drawn. It is paid at once (a `marshal_commission` payment item) and comes back off their next payslip, outside the deduction cap. It is not a loan and carries no interest. Money requests are never queued offline.

## Marshal care

- **Shifts and hours.** A marshal's shifts are found from their own queue and departure records (a gap longer than the association's setting ends a shift), **proposed** for the marshal to correct (a reason is needed for changed
  times) and for the association to approve. A marshal can add a shift that was not found. A shift over the agreed length, a long shift with no break noted, and a week over the agreed hours are **flagged**, never blamed.
- **Safety.** A one-tap report from a rank (threat, fight, robbery, overcrowding, injury, other) with an optional note and a small photo (about 100 KB). The association sees who reported, acknowledges and closes it, and reads a **risk
  picture by rank**: reports, a score weighted by seriousness (robbery 5; threat, fight, injury 3; overcrowding, other 1), and when in the day (night is 21:00 to 05:00 South African time). It supports the case for security at a rank.
  The association is told by seeing new reports on its Safety screen; it is not yet pushed by email or SMS.
- **My voice.** A marshal raises a complaint or request (pay, hours, safety, queue, conditions, benefits, other), sees it tracked to an answer, and the association answers it. The association also sees anonymised insight: counts by
  theme and how long answers take, never names in the summary.
- **Cover and benefits.** The association records whether each marshal is registered for UIF, injury cover, a savings scheme or funeral cover. What a marshal has paid in is **read from their issued payslips**, never typed.
- **Work record.** Tenure, ranks worked, trips handled and earnings by month, from the system's own records, and what is still needed for the profile to count as **verified** (a start date, consent to keep payroll records, an issued payslip).
- **Proof-of-income letter.** A letter summarising the last 3 or 6 months of issued payslips (never drafts or revised ones), **only with the marshal's consent**, as a small PDF. It carries a number and a verification code; the association can
  confirm a letter someone presents (it confirms the letter is genuine and from one of its marshals, without showing figures, and says if the payslips behind it have since changed). It says it is generated from system records and is **not
  a certificate of employment**.
- **Overview and patterns.** The association's overview: fares on rank devices, trips, share paid by tap, commission issued and paid, payslips, queries, incidents, average shift, and verified profiles, filterable by rank and marshal, as CSV and PDF.
  Cash share is an **estimate** (passengers a marshal counted at departure against fares tapped). A rank whose cash share this week is 12 or more points above its own four-week average, over at least 30 passengers in each window, is flagged
  as **a change at a rank to look into, not a finding about anyone**.

## PAYE, UIF and tax tables

- **PAYE is an estimate**, worked from a tax table held as **data with its source** (`tax_tables`), never from numbers in the code, because SARS changes them every March. The 2026/27 table (1 March 2026 to 28 February 2027: seven brackets from 18% to 45%, primary rebate
  R17 820, tax-free threshold R99 000) ships with the system and was checked against published SARS worked examples. The association adds each new year's table on the Commission screen, with the source of the figures.
- It uses the SARS periodic (annualisation) method for regular pay, applies **only to marshals classed as employees**, only when the association has switched PAYE on, and sits **outside the deduction cap**. UIF comes off first and is deductible.
- **If no table covers a payslip's dates, no PAYE is calculated** and the payslip says so; it never uses another year's table. **Age rebates** (2026/27: secondary R9 765 from age 65, tertiary R3 249 from age 75, by age at the end of the tax year) apply when the association has recorded the marshal's **date of birth**, which is the association's record, is never printed on a payslip, and cannot be
  changed by the marshal; with no date of birth only the primary rebate is applied, so PAYE is never under-stated. Medical credits and retirement deductions are not included; the association reconciles its own returns (EMP201, IRP5) and should take advice. UIF is 1% of earnings up to the monthly ceiling (R17 712, so R177.12 a month), scaled to the pay period.

## Emergencies and safety alerts

- **Every safety report is emailed** to the association (its alert email, or its account email). A **panic report** (the "I need help now" button, on every marshal screen, with a 5-second countdown to cancel an accidental press) also carries the phone's **location** and is
  **sent by SMS** to the association's alert phone. With no signal the alarm is kept on the phone and sent the moment there is signal. The marshal is answered first; the association is told afterwards, so a slow mail server never delays them.
- Delivery is tracked **per channel**: a failure shows on the report to the association (with a "send again" button) and is retried every minute, up to 6 times within a day, without re-sending a channel that already went.
- Email uses the existing Resend sender. **SMS uses Twilio** when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` are set (otherwise it fails loudly in the log and the report stays on screen). The Twilio adapter follows Twilio's published API and was tested against a stand-in, not a live account.
- The button says it is not a substitute for calling the police (10111 or 112).

## Automatic cash-out, consent and public letter check

- A marshal can opt in to being **paid each evening** (from 17:00 South African time) what is safely available, once it reaches a minimum they set. It pays at most once a day, and if the payment cannot be arranged the deduction is undone and the day is not used up.
- The association sees a marshal's **earnings** only while the marshal consents to payroll records; without it, tenure and trips only. Withdrawing takes effect at once.
- A **public page** (`/api/verify/income-letter`) lets a bank or landlord holding a letter check its number and code with no sign-in: it says whether it is genuine, the period and issue date, and a masked name, never a figure. It is rate limited. Set `PUBLIC_API_URL` and letters print where to check them.
- The marshal can download their **work record** as a PDF.

## Offline and languages

- **Offline capture on the phone.** A queue change (join, depart, remove), a shift, a safety report, an emergency alert, a complaint and a query made with no signal are kept on the phone and sent when it returns. Each carries a reference the server remembers, so a change sent twice happens once.
  Only a failure to reach the server queues a change; a change the server refuses when finally sent goes to a "could not be sent" list the marshal sees. Requests for money are not queued.
- **Languages.** The marshal screens and menus can be shown in **Afrikaans, isiZulu and isiXhosa**. Afrikaans is complete for those screens. **isiZulu and isiXhosa are a first draft and must be checked by first-language speakers before they are relied on**: where a word was uncertain it was left in English
  (for example "Deductions"). Only complete, standalone texts are translated; a sentence built from pieces and numbers stays in English rather than becoming broken grammar. English is the key, so an untranslated text always shows in English.

## Testing

`cd server && npx vitest run src/services/commission.test.ts src/services/payslips.test.ts src/services/marshalCare.test.ts src/portal/commissionRoutes.test.ts src/portal/careRoutes.test.ts src/portal/marshalCommission.test.ts src/services/moneyEngine.test.ts` runs them on the in-memory
database. Against a real PostgreSQL (recommended before switching an association on), set `TEST_PG_URL` and run the same files except `moneyEngine.test.ts` (it pins the clock, which a real database cannot follow, and skips itself),
with `--testTimeout 90000`. The worked example (120 trips, R20, 40%, advance R100 and fee R50, net R810) is a test in `payslips.test.ts`.

## Not built yet

- **WhatsApp alerts** (they need pre-approved message templates) and a push notification inside the app.
- **PAYE medical credits and retirement deductions**, and year-end reconciliation: take advice.
- **Complete, reviewed isiZulu and isiXhosa.**
- **Consent gating** beyond the proof-of-income letter and the association's view of earnings.
- **Verifying the Twilio adapter against a live account**, and a live card-device test.

## Decisions made by default (all adjustable settings)

A weekly payslip; commission payable when the fee is recorded; a 50% cap on deductions; tiers off; a waived fee reverses the commission unless the association absorbs it; UIF off. What UIF applies to, and whether a marshal is
an employee or independent, has legal consequences: take advice before switching UIF on or describing a payslip as proof of employment.
