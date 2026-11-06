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
`GET /payslips/:id` (and `.pdf`), `POST /payslips/:id/issue`, `POST /payslips/:id/payment`, `GET|POST /adjustments`, `POST /adjustments/:id/cancel`, `GET /disputes`, `POST /disputes/:id/respond`, `GET /access-log`.

Marshal (`/api/portal/marshal`): `GET /earnings`, `GET /earnings/day/:date`, `GET /payslips`, `GET /payslips/:id` (and `.pdf`), `GET|POST /disputes`, `GET /money-check`, `GET|PUT /profile`, `PUT /consents/:purpose`,
`GET /queue-events`, `GET /reason-codes`; the existing `POST /ranks/:id/depart` and `/queue/:queueId/remove` take a `reasonCode`.

Driver (`/api/portal/driver`): `GET /queue-position`, `GET /fees`, `GET|POST /disputes` (a query about a trip they drove).

## Queries (disputes)

A marshal can query any line of an issued payslip or a trip they handled; a driver can query a trip they drove. It goes to the association and is tracked (open, under review, upheld, rejected). Upholding needs a reason the person
sees. A driver's upheld query waives an unpaid fee and reverses that trip's commission (a fee already paid is flagged as needing a refund, which is not built). A marshal's upheld query can carry a credit that appears on their
next payslip as its own line.

## Testing

`cd server && npx vitest run src/services/commission.test.ts src/services/payslips.test.ts src/portal/commissionRoutes.test.ts src/portal/marshalCommission.test.ts src/services/moneyEngine.test.ts` runs them on the in-memory
database. Against a real PostgreSQL (recommended before switching an association on), set `TEST_PG_URL` and run the same files except `moneyEngine.test.ts` (it pins the clock, which a real database cannot follow, and skips itself),
with `--testTimeout 90000`. The worked example (120 trips, R20, 40%, advance R100 and fee R50, net R810) is a test in `payslips.test.ts`.

## Not built yet

- **Phase two of the plan**: proof-of-income letters, shifts and hours, incident reports and the rank risk map, grievances, the benefits panel and verified work record, the KPI dashboard with PDF export, the cash-share estimate
  and pattern flags, and the isiXhosa, isiZulu and Afrikaans screens (the choice is saved; the screens are English).
- **Offline capture** on the marshal's own phone (the database already has client references for it).
- **Revised payslip versions** (a correction today is a reversal or credit on the next payslip), **refunds of fees already paid**, and a **daily cash-out** of accrued commission. Marshals are paid per pay period, not per trip.
- **Consent is recorded but not yet enforced** anywhere.
- The driver has no screen to query a trip (the API exists), and trip fee rules by **route** have no screen (the API supports them).

## Decisions made by default (all adjustable settings)

A weekly payslip; commission payable when the fee is recorded; a 50% cap on deductions; tiers off; a waived fee reverses the commission unless the association absorbs it; UIF off. What UIF applies to, and whether a marshal is
an employee or independent, has legal consequences: take advice before switching UIF on or describing a payslip as proof of employment.
