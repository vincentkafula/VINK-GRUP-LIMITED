# Association compliance dashboard

The association dashboard helps an association prove it is legitimate, keep its members, vehicles and drivers compliant, and run routes and money in the open. This file says what is built against the 13 modules in the
specification, how the rules work, and what is not built. It is built in slices; each is tested on a real PostgreSQL before it is pushed.

## What is built and what is not

| # | Module | State |
| --- | --- | --- |
| 1 | Association registration | **Built** (slice 1): status, number, registrar, certificate and renewal dates, member count against the minimum, constitution and code with versions, office bearers with terms, evidence held, members' signed acceptance |
| 2 | Member (owner) register | Partial: approvals and levies exist; membership class, card number, standing, dual-membership and non-member operators are **not built** |
| 3 | Vehicle register | **Built** (slice 1): VIN, roadworthy, insurance, tracker and camera, signage, recapitalisation, state (active, off the road, replaced), replacement tracking |
| 4 | Driver register | **Built** (slice 1): ID, permit and licence, employer and vehicle, employment status and contract, pay basis, UIF and COIDA, training, suspension; optional rule blocking a driver without a valid permit |
| 5 | Operating licence tracker | **Built** (slice 1): per vehicle; valid, expired, application lodged, none; applications tracked separately; alerts at 180, 90 and 30 days; the headline share trended monthly |
| 6 | Routes and ranks | Partial: ranks and routes exist; saturation, licence reconciliation, queue rotation record and regulator notices are **not built** |
| 7 | Finance and levies | **Built** (slice 2): approved fee schedule with the province's cap check, numbered receipts (never deleted, printable), member accounts and statements, expenses with named-office-bearer approval, cash against banking, budgets, monthly and annual statements with CSV |
| 8 | Governance and discipline | **Not built**: meetings, resolutions, elections, declarations of interest, disciplinary cases |
| 9 | Safety and conflict | Partial: marshals' safety reports exist; accidents, inter-association disputes, repeat-incident flags are **not built** |
| 10 | Tax and labour formalisation | Partial: driver UIF and COIDA are recorded and flagged; owner business and tax status are **not built** |
| 11 | Digital fleet and payments | Later: the VINK card and rank-device data exist to link to |
| 12 | Reports and regulator export | **Not built** (statements exist) |
| 13 | Alerts, users and audit trail | Partial: expiry alerts, flags, change history and the audit log are built; named office-bearer users and scheduled digests are **not built** |

## How it works

- **The licence follows the vehicle and its owner, not the association.** It is stored per vehicle (`operating_licences`), separately from membership (`memberships`), because membership is voluntary under the NLTA.
- **A vehicle counts as licensed only if a licence on file covers today** (first and last day included). A licence lasts at most seven years: a longer one is refused when entered, and flagged if found in older data.
- **An application is not a licence.** A vehicle with only an application lodged is counted, and shown, as unlicensed until the licence itself is recorded. Granting an application does not itself license the vehicle.
- **The system never decides** that a vehicle is licensed, or what the association's registration status is. It reports what has been entered, counts a missing record as missing, and shows no percentage (rather than 0%) when there is nothing to measure.
- **Alerts** are computed from the registers: licences, roadworthy certificates, insurance, permits, licences of drivers, office-bearer terms and registration renewal at 180, 90 and 30 days and when past. A flag is high (act now), medium (soon) or low.
- **Flags**: no licence; application only; expired or expiring licence; missing, expired or expiring roadworthy or insurance; a replaced vehicle whose replacement has no licence; a driver with no valid permit (high if assigned to a vehicle); an expired driver's licence;
  a driver with no employing owner; a suspended driver still assigned; an employed driver not registered for UIF or COIDA; membership under the minimum; registration conditional for too long (the limit is the association's setting, 12 months by default); the
  constitution changed since it was last lodged; renewal due; no certificate, constitution or code recorded; members who have not signed the current constitution; office-bearer terms ended or ending.
- **Block a driver without a valid permit** is an association setting, off by default. When on, an owner of that association cannot put a driver on a vehicle if the driver has no permit on record, an expired permit, or is suspended.
- **A monthly picture** of how many vehicles and drivers are legal is kept (taken every few hours, overwriting the current month), so the trend can be shown.
- **Change history**: every change to a register is recorded with who, when, and what it was and became. A driver's ID number is never written to it, and is returned masked in lists.
- **Who sees what**: every route is scoped to the signed-in association (no route takes an association id), and an association sees only vehicles of its own active owner members and its own drivers.

## Finance (module 7)

- **The association's own books, in the open.** These record what the association says happened and move no money; the VINK wallet ledger and fines (the "VINK money" menu) are separate and untouched.
- **Fee schedule.** Members can only be charged a fee that is on it. A joining or membership fee above the province's cap (entered under Registration; it differs by province and is never assumed) is flagged when added and **refused when charging**; the cap does not apply to levies or fines.
  A joining fee is charged to a member once.
- **Receipts** are numbered in an unbroken sequence per association (R-000001, R-000002, …) and are **never deleted**. A mistake is **voided with a reason** and keeps its number, and the next receipt takes the next number. A voided receipt's PDF says VOID across it. A payment against a levy cannot be more than is
  owed on it; a levy becomes paid only when its receipts add up, and unpaid again if a receipt is voided. A levy marked paid with **no receipt** (cash payments recorded before receipts existed) is counted as paid and **flagged**.
- **Member accounts**: what each member was charged, has paid (by receipt, or marked paid with none), owes, and how much is overdue and for how long; and a statement with a running balance to hand them.
- **Expenses** are recorded, then **approved by named office bearers** (from the Registration screen): one approver below the association's threshold, **two different people at or above it** (R5 000 by default; the association sets it). Nobody can approve what they asked for themselves, an office bearer whose term has ended cannot approve,
  and the same person cannot approve twice. The association's single login records the approvals; it cannot prove the named person was the one who gave them, so this is an attestation, not authentication (see the decision on named users below).
- **Banking**: cash received against deposits made, taking deposits to cover the oldest cash first so the age of the oldest unbanked cash is known; flagged after 30 days (medium) and 60 (high), and when more has been banked than cash receipts recorded.
- **Statements**: income (receipts not void) and expenses (approved only), by month and by year with the budget alongside, as CSV. **Flags**: a fee above the cap; payments with no receipt; an expense waiting 14 days; a member more than 90 days overdue; unbanked cash; voided receipts (three or more in a month); charges with no approved schedule.
- **Not built in this module**: sending a receipt or statement to a member by email or WhatsApp, matching bank statement lines automatically, and reconciling the ledger against cashless fare data (module 11).

## Decisions only the association can make

- **Evidence files.** The registers record each document, where it is kept and its dates, but do not store the files. Storing the signed constitution and certificate would need a storage decision (the database is small).
- **Named office-bearer users.** The dashboard has one login per association. The safety, disciplinary and finance modules hold allegations about identifiable people, so they should be restricted to named office bearers; that needs several users per association with roles.
- **Province-specific limits.** Fee caps, how long registration may stay conditional and the required minimum membership differ by province and are entered by the association, not assumed.

## Testing

`cd server && npx vitest run src/services/compliance.test.ts src/portal/complianceRoutes.test.ts src/services/finance.test.ts src/portal/financeRoutes.test.ts`. Run against a real PostgreSQL by setting `TEST_PG_URL` (see docs/MARSHAL_COMMISSION.md).
