# Association compliance dashboard

The association dashboard helps an association prove it is legitimate, keep its members, vehicles and drivers compliant, and run routes and money in the open. This file says what is built against the 13 modules in the
specification, how the rules work, and what is not built. It is built in slices; each is tested on a real PostgreSQL before it is pushed.

## What is built and what is not

| # | Module | State |
| --- | --- | --- |
| 1 | Association registration | **Built** (slice 1): status, number, registrar, certificate and renewal dates, member count against the minimum, constitution and code with versions, office bearers with terms, evidence held, members' signed acceptance |
| 2 | Member (owner) register | **Built** (slice 6): legal name or company, ID or company number (validated, masked), contact, join date, membership card, standing (active, suspended, terminated, with a reason), another-association membership with consent, linked vehicles and fees owed, disciplinary history as counts, and a separate register of non-member operators |
| 3 | Vehicle register | **Built** (slice 1): VIN, roadworthy, insurance, tracker and camera, signage, recapitalisation, state (active, off the road, replaced), replacement tracking |
| 4 | Driver register | **Built** (slice 1): ID, permit and licence, employer and vehicle, employment status and contract, pay basis, UIF and COIDA, training, suspension; optional rule blocking a driver without a valid permit |
| 5 | Operating licence tracker | **Built** (slice 1): per vehicle; valid, expired, application lodged, none; applications tracked separately; alerts at 180, 90 and 30 days; the headline share trended monthly |
| 6 | Routes and ranks | **Built** (slice 5): saturation per route against the licences held, vehicles running a route their licence does not cover, non-member operators listed separately, and queue-skipping per rank; regulator notices are recorded under safety |
| 7 | Finance and levies | **Built** (slice 2): approved fee schedule with the province's cap check, numbered receipts (never deleted, printable), member accounts and statements, expenses with named-office-bearer approval, cash against banking, budgets, monthly and annual statements with CSV |
| 8 | Governance and discipline | **Built** (slice 3): meetings with attendance and minutes (and when adopted), numbered resolutions tracked to an action and date, elections against the constitution's cycle, declarations of interest by office bearers, disciplinary cases from complaint to outcome and appeal |
| 9 | Safety and conflict | **Built** (slice 5): accidents, passenger complaints, disputes with other associations (with escalation to SANTACO or the National Taxi Alliance), police matters and regulator notices, with repeat-incident, open-dispute and route-spike flags, and a counts-only report |
| 10 | Tax and labour formalisation | **Built** (slice 6): each owner's business type and registration, SARS tax reference (masked), filing status as reported, employer registrations (UIF, COIDA, SDL), beside the drivers they employ; tracks and reports only |
| 11 | Digital fleet and payments | Later: the VINK card and rank-device data exist to link to |
| 12 | Reports and regulator export | **Built** (slice 4): registration, licence, finance and governance packs as stamped PDFs; member, vehicle and driver lists as CSV; monthly, quarterly and annual emailing with a record of every send |
| 13 | Alerts, users and audit trail | **Built** (slice 7): expiry alerts and flags, the change history and audit log, and **named office-bearer logins with roles** that restrict the sensitive modules; scheduled digests are **not built** |

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

## Governance and discipline (module 8)

- **Meetings** record the kind (AGM, executive, general, special), date, venue and agenda; **attendance** names each member by their own record and guests by name (present, apology or absent, nobody twice); **minutes** are written, and the **date they were adopted** at a following meeting is recorded separately (it cannot be before the meeting, in the future, or before there are minutes).
- **Resolutions** are numbered by the year of their meeting (2026/01, 2026/02, …, starting again each year), carry who acts and by when, and are **overdue the day after their due date** while open.
- **Elections** are compared with the cycle the constitution sets (entered under Registration): flagged when none is on record, **overdue the day after it was due** (by the cycle, or by the date the last election set if that is sooner), and coming up within 90 days. An **AGM** not recorded in the last 12 months is flagged, as are minutes not adopted after 60 days.
- **Declarations of interest**: each office bearer declares once a year, and "no interest" is a declaration too. An office bearer (whose term has not ended) with no declaration in the last 365 days is flagged.
- **Disciplinary cases** follow a fixed order: complaint and charge under the code of conduct, hearing date, outcome (upheld, not upheld, withdrawn), **a sanction (required only if upheld)**, an appeal and its outcome, then closed. An outcome needs a hearing set first (a withdrawal does not); there is nothing to appeal on a withdrawn case; a case cannot be
  closed without an outcome, or while an appeal is open; and **a closed case cannot be changed**. A case open longer than the limit the association sets (90 days by default) is flagged medium, high past double that, and a hearing date that has passed with no outcome is flagged.
- **The system never says anyone is guilty.** A case's outcome is what the association's own hearing decided. Cases hold allegations about identifiable people: today they are visible to whoever holds the association's login (see the decision on named users below).
- **One list.** The compliance overview now carries the finance and governance flags with the registers' flags, ordered by seriousness, so there is a single place to see what needs attention.
- **Not built in this module**: a member-facing grievance log beyond the marshals' (it exists for marshals), notice and agenda mailing, voting records, and quorum rules.

## Reports (module 12)

- **Packs (PDF):** the **registration pack** (status, number, registrar, dates, constitution and code versions, office bearers, evidence held, members, vehicles), the **licence compliance report** (every vehicle's licence, roadworthy and insurance, every driver's permit, what is expiring), the **finance statement** (income and
  expenses for a month or a year with the budget, cash and banking, what members owe), and the **governance report** (meetings and attendance, resolutions, elections, and disciplinary cases as **counts only: nobody is named and no allegation is described**).
- **Stamped.** Every page says which association it is for, the day it was generated, that it was generated by VINK from the association's own records, and the page number.
- **It states what is on record.** A report says "Not recorded" for what is missing and "No data" instead of a percentage when nothing can be measured. It never says an association is compliant: it shows the figures and the flags, and the emails say it is not a finding of compliance.
- **Lists (CSV)** for members and auditors: members (with when they joined), vehicles, and drivers (ID numbers masked).
- **Sent automatically.** The association chooses who gets which report: for example monthly to the executive, quarterly to the regional body (January, April, July, October), and annually to the registrar (in a month of its choosing), from a day of the month between 1 and 28. Each is sent **once per period**, as a PDF
  attachment. A finance report sent monthly covers the month that has just ended; quarterly, the year so far (in January, the year that has just ended); annually, the year that has just ended. Every other report is a picture as at the day it is sent.
- **Failures are recorded, not hidden.** A send that fails is recorded with its reason, the period stays unsent, and it is tried again at the next run (not within six hours). In production without email configured the report is recorded as failed, never as sent. "Send now" sends one on request without using up the period.
- **Not built in this module**: reports in other languages and a WhatsApp delivery.

## Routes and ranks (module 6)

- **Saturation** is the number of vehicles that actually **operated** on a route in the last 30 days (a loading session on that route that was not cancelled), divided by the number of **your members' vehicles that hold a valid licence naming that route**. Above 1 the route is **over-supplied** (high); from 0.85 it is **nearly full** (medium).
  A route that vehicles operated on, when none of your members' licences is recorded as naming it, is flagged high, with a hint to record the route on each licence or check the names match.
- **The licence is the legal authority, not your route list.** Your route list is internal. A member's vehicle that operated on a route with **no valid licence** (an application lodged counts as none) is flagged high; one whose valid licence names a **different route** is flagged medium; one whose licence names no route at all
  is listed for checking rather than accused. A licence's route is matched to a route **by its words** (the same words in any capitals, or one phrase inside the other, at least four characters), so the licences that name a route you do not have, and those with no route, are listed for you to check.
- **Non-member operators**: vehicles from outside the association that operated on its routes are listed with their owner and trips, separately from members, because membership is voluntary.
- **Queue fairness**: each departure is checked against the rank queue. It is a **skip** if a vehicle that joined earlier, and had not left, was still waiting. A departure out of order that was **formally approved with a reason code is a recorded exception, not a skip**, and is counted separately. The skips are counted and the
  vehicles named; a rank is flagged medium from 10% and high from 25% of its departures, but only judged once at least ten departures have been checked.
- **Regulator notices** (closures and restrictions under section 91 of the NLTA) are recorded as safety events, with the route and the date they apply until, and are flagged high while in force.
- **Not built in this module**: reconciling routes against GPS positions (module 11), and a rotation schedule for who goes first.

## Safety and conflict (module 9)

- **Events**: accidents (with injuries and deaths), passenger complaints, **disputes with other associations** (which must name the other association), police matters (with the case number) and regulator notices. A vehicle or driver can only be linked if they are the association's own.
- **Escalation**: a dispute can be recorded as taken to **SANTACO, the National Taxi Alliance or another body** for mediation, with the date and the mediator. An event is **resolved** with a date and how; a resolved event cannot be changed.
- **Flags** (they describe the record, not anyone's fault): a **vehicle or driver with three or more accidents or passenger complaints in the last 12 months** (medium; five or more is high); a **dispute open more than 30 days** (medium; more than 60 high), saying whether it has been escalated; a **police matter open more than 90 days**; a
  **regulator notice in force** (through its last day); and a **spike on a route**: at least three incidents in the last 30 days that are more than double the 30 days before.
- **The safety and conflict summary** is a fifth report pack: counts for the last 12 months, what is open, and the regulator notices in force. **It names no driver, vehicle, other association or incident.**
- **Privacy.** These events name identifiable people. Today the association has one login, so anyone who holds it can see them; the guide's decision on named office-bearer users applies here above all.

## The member register and formalisation (modules 2 and 10)

- **Who is a member.** Membership is voluntary under the NLTA, so the register shows exactly who is: each owner member's legal name (or company), **type** (individual, company, close corporation, partnership, trust), **ID or company number** (a real South African ID for an individual, a registration number otherwise), phone, **membership card number** (one card to one member, whatever the capitals),
  and **standing**. **Suspending or terminating a member needs a reason**, and the reason is cleared when they are active again. Terminating a member's standing is a record, separate from removing them in the Approvals screen.
- **Another association.** Some constitutions forbid dual membership without consent: a member recorded as also belonging to another association is **flagged until consent is recorded**, and consent is forgotten if that other membership is cleared or changed.
- **A suspended or terminated member whose vehicles still ran trips on your routes in the last 30 days is flagged high.** A member with no ID or company number on record is flagged low.
- **Disciplinary history is shown as counts (open and closed), never described.**
- **Non-member operators** are kept in a separate register (name, vehicle, route, phone, when noted, when they stopped). **A vehicle that belongs to a member cannot be entered**, a vehicle is listed once while it is active, and the vehicles from outside the association seen on your routes in the last 30 days that are not yet in the
  register are listed (with a button to add them) and flagged low.
- **Formalisation tracks and reports only.** Per owner: business type and registration number, SARS tax reference (**ten digits**, shown masked), whether registered for tax, **tax filing status as the owner has reported it**, whether registered with UIF, COIDA and the Skills Development Levy as an employer, and when it was last checked.
  **Filing tax and registering as an employer are each owner's own duty, and nothing here is tax or labour advice.** An owner with drivers on record who is not recorded as an employer with UIF or COIDA is flagged medium; SDL is flagged low, with the note that it applies only to employers above a payroll threshold; a reported overdue filing is flagged medium;
  drivers paid in cash with no contract are flagged low.
- **Progress** is shown as exact shares: owners with a business recorded, owners registered for tax, employers with UIF and COIDA, and **drivers formally employed** (recorded as employed, with a contract on file, registered for UIF and registered for COIDA).
- **Privacy.** ID numbers and tax numbers are returned masked and are **never written to the change history or the audit record**. A phone number is shown to the association but is not written to them either.
- **Exports (CSV):** the member list, the non-member operators, and the formalisation list (tax numbers masked).

## Named office-bearer logins (module 13)

- **Why.** An association had one login, so anyone who held it could see disciplinary cases, safety events, member identities and finance approvals. Now the association gives each office bearer **their own login with a role**, and the modules that name people are restricted to the roles that need them.
- **Roles.** **Chairperson**: everything about the association except its bank and payroll. **Secretary**: the registers, members, governance, **discipline, safety**, routes and reports; not finance. **Treasurer**: **finance**, and the registers, routes and reports to read; not discipline, safety or member identities.
  **Viewer**: the overview, registers, routes and reports, read only. The association's own login keeps everything and is **the only one that manages the logins**; the **bank, payments to marshals and the logins themselves stay with the main login whatever role is given**.
- **Fail closed.** A delegate can use only a path that is explicitly mapped to a module their role allows (reading needs read access, anything else needs write access). **Anything not listed, including anything added later and the bank, money, tokens and payroll routes, is refused**, and the check runs
  **before** those routers see the request. A login that is switched off is refused at once, even though it still holds a token.
- **Seeing less in the overview.** The overview's flags and the change history are filtered by role too, so a treasurer does not read a disciplinary or safety flag that names a driver, and the logins are never shown in a delegate's history. The member, formalisation and driver exports need the module that holds them.
- **In their own name.** Everything a delegate changes is recorded in the change history and the audit log under **their** name, not the association's.
- **Approvals as yourself.** A delegate linked to their office-bearer record approves expenses **as themselves**, whatever they send, and the approval is marked **signed in**. An approval recorded by the shared login is an **attestation**; the association can switch on "approvals must be made by the office bearer
  signed in to their own account", after which the shared login can no longer record one. A delegate who is not linked to an office bearer cannot approve.
- **Passwords.** A login is created with a password that meets the password policy, **shown once** to the association and never stored in the clear or written to any record; the person should change it when they first sign in. A reset makes a new one. Delegates use the same sign-in as everyone else, including two-step sign-in if it is switched on.
- **Emailed invitation: built.** When email is set up, the association can email a new office bearer a link to choose their own password instead of handing over a one-time password (see docs/OWNER_DASHBOARD.md, section 4l). **Not built**: scheduled digests by email, and per-person permissions beyond the four roles.

## Decisions only the association can make

- **Evidence files.** The registers record each document, where it is kept and its dates, but do not store the files. Storing the signed constitution and certificate would need a storage decision (the database is small).
- **Named office-bearer users** are now built (below). What remains for the association to decide is who gets which role, and whether to require approvals to be made by the signed-in office bearer.
- **Province-specific limits.** Fee caps, how long registration may stay conditional and the required minimum membership differ by province and are entered by the association, not assumed.

## Testing

`cd server && npx vitest run src/services/compliance.test.ts src/portal/complianceRoutes.test.ts src/services/finance.test.ts src/portal/financeRoutes.test.ts src/services/governance.test.ts src/portal/governanceRoutes.test.ts src/services/reports.test.ts src/portal/reportsRoutes.test.ts src/services/safety.test.ts src/services/routeControl.test.ts src/portal/safetyRoutes.test.ts src/services/memberRegister.test.ts src/portal/memberRegisterRoutes.test.ts src/services/delegates.test.ts src/portal/delegatesRoutes.test.ts src/portal/portalGate.test.ts`. Run against a real PostgreSQL by setting `TEST_PG_URL` (see docs/MARSHAL_COMMISSION.md).
