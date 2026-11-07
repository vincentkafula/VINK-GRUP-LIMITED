# Owner Dashboard: deepening it for how taxi owners actually work

This is the design for extending the existing Owner Dashboard. It records what the code already does, what is missing, the data model, the order of work, the assumptions made, and what needs legal or regulatory confirmation. It is updated as each slice is built.

## 1. What already exists (read from the code, not assumed)

**Stack.** React (Vite) front end in `src/app/components/portal`; Node and Express back end in `server/src`; PostgreSQL, with the schema in `server/src/db/schema.sql` (idempotent, additive: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and a hand-kept in-memory mirror in `server/src/portal/testDb.ts` for fast tests; every new table or column goes in both. Tests run in memory by default and on a real PostgreSQL when `TEST_PG_URL` is set. Money is integer cents everywhere in the new code.

**Owner screens** (`OwnerDashboard.tsx`, `OwnerExtras.tsx`): Overview, Vehicles, Drivers, Routes and map, Reports, Financials, Documents, Notifications, Driver pay (agreements), Payments and trips, Requests and links, VINK Tokens, Bank account.

**Owner API** (`portal/ownerRoutes.ts`, mounted at `/api/portal/owner`): vehicles (list, add, edit, assign driver), drivers (list, add, remove), devices, earnings, reports, map, trend, statements (+CSV), documents, notifications.

**Data that already exists and is reused, not duplicated**
- `vehicles` (owner, registration, make, model, year, seats, disc expiry, driver).
- `owner_drivers` (an owner's drivers, with a request and accept flow).
- `driver_agreements` (owner and driver, mode weekly cash basis, monthly salary or per trip, amount, pay day, start and end, status, **consent text and version**) and `payment_items` (weekly cash payments from driver to owner, with **arrears**: a payer's account never goes below zero, so what cannot be paid stays as arrears until a later cycle).
- `moneyEngine.ts`: turns confirmed taps into balances and trips, schedules weekly and monthly agreement payments, posts every movement exactly once to the Banking ledger (`LedgerPort`).
- `compliance_documents` (owner, vehicle, kind, reference, expiry): **details only, no file is stored**.
- `memberships`, `levies` (what an association charges a member), and, from the association work, `receipts`, `fee_schedule`, `member_register`, `owner_business` (business type, tax number, employer registrations).
- `vehicle_compliance` and `operating_licences` (the association's view of each member vehicle, with a seven-year cap enforced when a licence is entered).
- `driver_profiles` (the driver's own licence and PrDP expiry), `driver_register`, `driver_ledger` (fines), `route_violations`.
- Named logins with roles exist for **associations** (`association_delegates`, a gate in front of the association routes); **none for owners yet**.
- A virus-scan helper (`fileScan.ts`) exists; there is **no general-purpose secure file store** for owner documents.

**Payments.** There is no third-party payment provider (Ozow, Stitch, Peach, PayShap) integrated. Money moves through the platform's own Banking ledger and the owner's verified Banking account. The platform's rule, confirmed with the business and written into `revenueSplitService.ts`, is that **a driver's pay is a fixed amount privately agreed between driver and owner, never a percentage the platform computes**.

## 2. What is missing against the brief

| Brief | Today | Gap |
| --- | --- | --- |
| Daily or weekly payment target per vehicle and driver | Weekly cash agreement only, collected by the platform | A target the owner sets per vehicle (daily or weekly, with working days), including **cash handed over outside the platform** |
| Reconciliation: shortfall, arrears carried forward, surplus | Arrears exist only on platform items | A reconciliation of what was **expected** against what was **received** from any source |
| Splitting rules per vehicle | None | Earmarks: owner share, association levy, finance instalment, maintenance |
| Driver payment history | Per agreement item | A history per vehicle and driver |
| Association profile, ledger and payments, letter of recommendation | Association side only (member register, member ledger); owner sees little | An owner view, owner payment of dues with a receipt, document storage |
| Licence and compliance centre | Details-only documents; association view | Per-vehicle centre with province-aware rules, reminders at 90, 60, 30 and 7 days, traffic lights, file storage |
| Vehicle finance, P&L, maintenance, fines, exports | Earnings and statements | Finance tracker, costs, per-vehicle P&L, accountant-ready exports |
| Individual or company; roles | Owner is a user; company details are recorded by the association | Owner-held business record; **roles for an owner's team** |
| Notifications by SMS or WhatsApp, planner, audit trail | In-app notifications; alerts service (email, SMS) | Owner-side events and a planner |

## 3. Principles for the build

1. **Reuse before adding.** One source of truth per fact: vehicle compliance and licences are the same records the association sees; the owner edits their own vehicles, the association reads them.
2. **The platform does not hold funds in this layer.** Targets, reconciliation and splits are **bookkeeping**: they record and earmark, they do not move money. Money moves only through the existing ledger and the owner's own account.
3. **Never rewrite history.** Payments and adjustments are not deleted: a mistake is voided with a reason. A split rule applies to payments made after it; earlier payments keep the allocation they had.
4. **Integer cents, idempotent writes.** Every capture that can be retried (offline sync, a double tap) carries a client reference, and a second send changes nothing.
5. **Do not invent regulatory facts.** Licence validity by province, reminder lead times and any rule that varies are **configuration with a flag for verification**, not code.
6. **Say what is on record.** Screens and reports state what has been entered and say when something is missing.

## 4. Build order

1. **Slice A: owner and driver money (P1).** Vehicle targets (daily or weekly, working days, pauses for days off the road), recording payments (including offline), reconciliation with arrears carried forward and surplus, per-vehicle split earmarks, payment history, waivers. *Service, routes, screens, tests.*
2. **Slice B: association relationship (P1).** Owner's association profile and ledger (from the association's records), payment of dues with a receipt, letter of recommendation and membership documents.
3. **Slice C: licence and compliance centre (P1).** Province rules as configuration, owner-editable vehicle compliance, reminders, traffic lights, file storage with scanning.
4. **Slice D: capital and profitability (P2).** Vehicle finance tracker, costs, maintenance log and reminders, fines, per-vehicle and fleet P&L, exports (PDF and CSV).
5. **Slice E: structure and roles (P2).** Owner business record; roles for an owner's team (co-owner, fleet manager, driver, and the association's own roles' views), using the same fail-closed gate pattern as the association's named logins.
6. **Slice F: growth and risk (P3).** Planner, notifications (in-app first, SMS and WhatsApp through the existing alert service), audit trail for owner changes.

## 5. Assumptions made (non-blocking; change any of them)

- A target is **bookkeeping the owner sets**; it does not change the platform's agreement or collection. The two are linked by an optional agreement reference.
- **Daily targets accrue on working days** (default Monday to Saturday; the owner can choose any days) and on **no days a vehicle is paused** (breakdown, service, accident). A weekly target is due once a week on a chosen day.
- **Arrears are carried forward until paid or waived**; surplus is carried forward as credit. A waiver records who, when and why.
- **Split rules are percentages (basis points) that must total 100%**, applied to each payment received after the rule is set, with the cents rounded so the parts always sum exactly to the payment. They are earmarks only.
- Payments that came **through the platform** are not yet merged into reconciliation (slice A records owner-captured payments); merging them is a listed follow-up, because a platform payment is tied to an agreement rather than a vehicle.
- Files are stored **outside the database** with a malware scan, a size limit and a type allow-list (decided in slice C).
- Provincial licence validity (the brief says 5 years in Gauteng and the Western Cape and 7 elsewhere) is **configuration, flagged for verification**, and replaces the fixed seven-year limit the association module currently applies.

## 6. Needs legal, regulatory or provider confirmation

- **Operating licence validity by province** (5 or 7 years) and what happens on transfer: verify with each Provincial Regulatory Entity before relying on the configured values.
- **Payment of association dues through the platform**: whether and how this is permitted under the platform's existing Banking arrangement, or whether a licensed payment provider is needed. The brief says not to hold or custody funds; today there is no external provider.
- **Driver agreements and employment status**: a daily target paid by a driver to an owner is often treated as an employment or independent-contractor arrangement; the labour-law position needs advice. The system records what the parties agreed and does not say what the law makes of it.
- **POPIA**: owner and driver personal information, consent records, data export and deletion; documents with ID numbers; retention periods.
- **Tax and lender reports**: the exports show what is recorded; they are not tax advice or a statement an accountant or lender will accept without review.

## 7. Rolling back

Each slice's tables are additive. To remove a slice, drop its tables in reverse order of creation (listed under the slice) and its columns; nothing else depends on them.
