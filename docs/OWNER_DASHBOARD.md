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

## 4a. Slice A, built: owner and driver money

**What it does.** The owner sets what each vehicle's driver should pay (a daily amount on chosen working days, or a weekly amount on a chosen day), writes down what the driver actually pays (cash or otherwise, also with no signal), and sees at a glance who is paying on time, who is behind, and by how much. It records and earmarks; **it moves no money and does not touch the platform's agreement or collection**.

**Rules (all covered by tests)**
- A daily target builds up on the working days the vehicle was not off the road; a weekly target falls due on its due day, **pro rata** for days of that week not under the target or off the road. Whole cents, rounded half up.
- **Arrears carry forward** week to week until paid or waived; a **surplus carries forward as credit**. A payment made after a target ended still counts; one dated before it began does not.
- **Traffic light, always with words**: *Paying on time* (nothing owed), *Behind* (owes less than three days of the target), *Far behind* (three days or more). Flags: *low* below three days, *medium* from three days, *high* from seven days; plus *nothing paid for seven days while behind* and *nothing paid since the target started*.
- A payment is **never deleted**: a mistake is **voided with a reason** and stops counting. A waiver of part of a shortfall needs a reason and stays on the record.
- **Retries change nothing**: a payment carries a client reference, so an offline sync or a double tap records it once (per owner).
- **Split earmarks**: four shares (owner, association levy, finance instalment, maintenance) in basis points that must total 100%, applied to each payment from the rule's date. The parts **always add up to the exact cents** (largest-remainder rounding, and a zero share never receives a cent). Each payment keeps the earmarks it had when recorded, so a new rule never rewrites history.
- One open target per vehicle; a new one closes the old the day before, so the history is kept. A target can be linked to the owner's existing **driver agreement** (the formal record with consent) and carries free-text terms.

**API** (all under `/api/portal/owner/driver-pay`, owner role only, scoped to the signed-in owner by construction)

| Method and path | What it does |
| --- | --- |
| `GET /fleet` | each vehicle's light, target, what is owed, last payment; fleet totals; flags |
| `GET /vehicles/:id` | the reconciliation: totals, week by week, earmarks, pauses, flags |
| `GET /targets`, `POST /targets`, `POST /targets/:id/end` | targets |
| `PUT /vehicles/:id/split` | the split rule |
| `GET/POST /pauses`, `DELETE /pauses/:id` | days off the road (only a pause that has not started can be cancelled) |
| `GET /payments`, `POST /payments`, `POST /payments/:id/void` | payments, with `clientRef` for idempotency |
| `GET/POST /waivers` | waivers |

**Data (additive; rollback in `server/src/db/rollback/owner_dashboard_a.sql`)**: `vehicle_targets`, `target_pauses`, `driver_payments`, `driver_payment_allocations`, `vehicle_split_rules`, `target_waivers`. Every table is also in the test mirror (`portal/testDb.ts`).

**Screen**: *Driver targets* in the owner menu: a large "Record a payment" form (works offline: a payment captured with no signal is kept on the phone and sent once, with the same reference, when the signal returns; a refusal is shown, never retried), the fleet with lights, and a per-vehicle view with the target, week-by-week arrears, the split, days off the road, waivers and history.

**Demo data**: `cd server && DATABASE_URL=... DEMO_PASSWORD='a-long-passphrase' npm run seed:owner-demo` makes three owners (Gauteng, Western Cape, KwaZulu-Natal), six drivers, seven vehicles and four weeks of payments, one vehicle in each state. Safe to run twice; refuses production unless `ALLOW_DEMO_SEED=1`. Logins: `demo.owner.1` to `3`, `demo.driver.1` to `6`, with the password you supplied.

**Tests**: `cd server && npx vitest run src/services/driverTargets.test.ts src/portal/ownerDriverPayRoutes.test.ts src/db/seedOwnerDemo.test.ts`; `npx vitest run src/app/components/portal/OwnerDriverPay` from the project root. On a real PostgreSQL: set `TEST_PG_URL` as for the other suites.

**Known limits, to do next**
- Payments that came **through the platform** (weekly cash payments the money engine collects) are **not yet merged** into this reconciliation; they belong to an agreement, not to a vehicle, so merging needs a rule for a driver who drives more than one vehicle.
- The split is **earmarking only**. Reserve balances (what has been spent from the maintenance or finance earmark) arrive with slice D.
- A target ending mid-week does not bill the part of that week after it ends.
- Money recorded here is the owner's own record; nothing checks that the driver agrees with it.

## 4b. Slice B, built: the owner's association

**What it does.** The owner sees each association they belong to (or have asked to join): their membership status and join date, their **membership number** (the card number the association recorded), their **standing** (with the association's reason if suspended), the association's registration number and province, the **routes on their valid operating licences**, what they are charged, have paid, owe and what is overdue, their full statement with a running balance, and the association's **numbered receipts** (a downloadable PDF for each, only for receipts issued to them). It is built on the association's own records, so there is one source of truth.

**"I have paid".** The brief asks for payment of association fees through the platform. **No licensed payment provider is integrated, and the platform must not hold funds**, so this slice does not move money. Instead the owner **tells the association what they paid** (amount, date, how, reference, optionally against one of their open charges). The association checks its own bank statement and **confirms it, which issues the numbered receipt**, or **rejects it with a reason**. Nothing counts as paid until the association confirms. Paying through a provider, or through the platform's own Banking ledger, is a separate decision (below).

**Rules (all covered by tests)**
- An owner sees only **their own** account, and only for associations they are an **active** member of; a pending, declined or removed membership shows no ledger and no statement. Another owner's receipt cannot be read or downloaded.
- A claim against a charge **cannot exceed what is still owed on it, counting claims already waiting**; a claim against none is allowed (paying ahead). A rejected or withdrawn claim frees the charge to be claimed again. At most 20 claims may wait at once.
- A claim carries a **client reference**, so an offline retry records it once. The owner screen uses the same offline queue as driver payments.
- Confirming creates the receipt through the association's existing receipt rules (the charge must still be open and not over-paid); **if the receipt cannot be issued, nothing changes and the reason is returned**. A claim can be decided once. An association decides only its own members' claims.
- The queue belongs to the association's **finance** module: a treasurer or chairperson can confirm or reject; a secretary or viewer cannot (the same fail-closed gate as the rest of finance). Decisions are recorded in the deciding person's own name.

**API.** Owner (`/api/portal/owner`): `GET /my-association`, `GET /my-association/:aid/statement`, `GET /my-association/:aid/receipts`, `GET /my-association/:aid/receipts/:rid.pdf`, `GET/POST /my-association/claims`, `POST /my-association/claims/:id/withdraw`. Association (`/api/portal/association`): `GET /finance/claims`, `POST /finance/claims/:id/confirm`, `POST /finance/claims/:id/reject`.

**Data** (rollback `server/src/db/rollback/owner_dashboard_b.sql`): `dues_claims`.

**Screens.** Owner menu *My association*; the association's *Fees and receipts* screen gains *Payments to confirm*.

**Known limits, to do next**
- Letters of recommendation and membership certificates are shown from the owner's document **details**; **uploading the file** arrives with the secure file store in slice C.
- The association's vehicle compliance (licences per vehicle) is not shown here; slice C is the owner's compliance centre.
- No emailed or SMS notice when a claim is confirmed or rejected yet (slice F).

## 4d. Slice C2, built: the owner's documents

**What it does.** An owner attaches a photo or PDF of their letter of recommendation, membership certificate or card, roadworthy certificate, insurance, licence disc, operating licence or driver agreement, to a vehicle or to their membership. Files can be listed, downloaded and erased. It appears in the *Compliance centre* (per vehicle) and under *My association* (membership papers).

**Rules (all covered by tests)**
- **Only PDF, JPEG and PNG**, decided by the file's **actual first bytes**, never its name or what the sender claims; a file that says it is a PDF but is not one is refused. At most **5 MB** each.
- **Encrypted before it reaches the database** (AES-256-GCM, key `DATA_ENCRYPTION_KEY`, the same key as the platform's field encryption). **With no key in production nothing is stored**: there is no readable fallback. In development a key is derived so the app still runs. Any change to a stored file is detected when it is opened.
- **Scanned**: a file the scanner calls *infected* or *suspicious* is **refused and never stored**. The scan result is stored and shown honestly: *Checked by an antivirus* only when a real engine (ClamAV, `CLAMAV_HOST`; or VirusTotal, `VIRUSTOTAL_API_KEY`) said so, otherwise *Not checked by an antivirus*. Not checked is not the same as safe.
- **Private**: an owner reads only their own files. A file is sent as a **download only** (`attachment`, `nosniff`, `no-store`, a sandboxing content-security policy), never opened in the page. Every upload, download and delete is audited.
- **Erasable (POPIA)**: deleting a file **erases its bytes**; the record that it existed stays, marked deleted.
- **Limited**: 100 files and 100 MB per owner, 30 uploads an hour. The same file is stored once per owner (a repeat returns the first).
- **Made for a poor connection**: the file is sent as the raw request body (no 33% base64 overhead), and a big photo is **made smaller on the phone** first (longest side 1 600 pixels, JPEG). A file needs a connection to be sent; unlike payments it is **not** queued offline, because a photo is too large for the phone's offline storage.

**API** (`/api/portal/owner`): `GET /files` (what is stored, never contents, and the storage used), `POST /files?filename=&kind=&vehicleId=&documentId=` (the file as the body), `GET /files/:id` (download), `DELETE /files/:id`.

**Data** (rollback `server/src/db/rollback/owner_dashboard_c2.sql`, which **deletes every stored file**): `owner_files`. The encrypted file is kept as **base64 text** rather than `bytea`, so it behaves identically in PostgreSQL and in tests (about a third larger than raw bytes).

**To switch it on:** set `DATA_ENCRYPTION_KEY` (32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) on the server, and, for real virus scanning, `CLAMAV_HOST` (and `CLAMAV_PORT`). **Until the key is set, the screen says document storage is not switched on and offers no upload.** Keep a safe copy of the key: files cannot be opened without it.

**Known limits, to do next**
- Files are visible to the owner only. The association cannot yet see a member's letter of recommendation, and an owner's team (slice E) cannot yet see the owner's files.
- No automatic expiry or retention period for stored files (POPIA retention needs a decision).
- Without a real antivirus engine configured, only the built-in shape checks run.
- Rotating `DATA_ENCRYPTION_KEY` needs a re-encryption step that does not exist yet (the stored format carries a version byte to allow it).

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
- **Payment of association dues through the platform**: slice B records and confirms payments but moves no money. Whether and how dues may be **paid** through the platform (its own Banking ledger, or a licensed payment provider with signed webhooks, retries and a reconciliation job) needs a decision and legal confirmation first. The brief says not to hold or custody funds; today there is no external provider.
- **Driver agreements and employment status**: a daily target paid by a driver to an owner is often treated as an employment or independent-contractor arrangement; the labour-law position needs advice. The system records what the parties agreed and does not say what the law makes of it.
- **POPIA**: owner and driver personal information, consent records, data export and deletion; documents with ID numbers; retention periods.
- **Tax and lender reports**: the exports show what is recorded; they are not tax advice or a statement an accountant or lender will accept without review.

## 7. Rolling back

Each slice's tables are additive. To remove a slice, drop its tables in reverse order of creation (listed under the slice) and its columns; nothing else depends on them.
