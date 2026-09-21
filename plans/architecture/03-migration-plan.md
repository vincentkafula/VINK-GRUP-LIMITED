# Migration Plan — In-Memory Banking Store → Real Ledger

**Status:** Phase 2 design document. This is the plan Phase 3 (Backend
Completion) executes. Written to satisfy the brief's explicit constraint:
*"Migration plan from current state to target, with no big-bang rewrite."*

## Why not big-bang

`bankAccounts.ts`, `bankCards.ts`, and every component that renders their
data (`BankingDashboard.tsx`, `GlobalBankingDashboard.tsx`,
`FinancialReportsViewer.tsx`, and others) currently work — end to end,
demo-quality but functionally complete UI flows exist. Ripping out the
in-memory store and swapping in the new ledger in one PR means every one
of those flows breaks simultaneously with no way to test them
incrementally, and no way to ship anything in between. The plan below
keeps both paths working side by side until the new one is proven, then
retires the old one.

## Stage 1 — Additive: ledger tables exist, nothing reads from them yet

- Add `accounts`, `ledger_transactions`, `ledger_entries`,
  `account_balances`, `idempotency_keys` to `schema.sql`, following the
  existing `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF
  NOT EXISTS` pattern already used throughout that file — safe to run
  against a database that already has 52 tables, adds nothing that
  breaks anything else.
- Build the Ledger Service (`server/src/services/ledgerService.ts`) —
  the sole writer, per the C4 component diagram. Unit-tested in
  isolation (this is exactly the "add tests around existing behavior
  before refactoring" instruction, applied to new code instead: get the
  ledger's own correctness proven before anything depends on it).
- **Nothing in the app calls this yet.** Zero behavior change. This
  stage is mergeable and deployable with no risk, because nothing reads
  or depends on the new tables.

## Stage 2 — Shadow writes: both stores updated, in-memory still authoritative

- `bankAccounts.ts` and `bankPayments.ts` are modified to write to
  *both* the in-memory store (still the source of truth the UI reads
  from) and the new ledger tables (via the Ledger Service), for every
  new transaction going forward.
- A one-time backfill job seeds `accounts`/`ledger_entries` from the
  *current* in-memory state, so the ledger's balances match the
  in-memory ones at the moment of cutover, not from zero.
- Add a reconciliation check (cron or manual admin-panel button):
  compare in-memory balance vs. `SUM(ledger_entries.amount_cents)` for
  every account, alert on mismatch. This is the safety net that proves
  the ledger is tracking reality correctly *before* anything depends on
  it being correct.
- Run this stage for a real observation period (days, not minutes) —
  the whole point is catching a bug in the shadow-write logic while the
  in-memory store is still the fallback truth.

## Stage 3 — Cutover: ledger becomes authoritative, one route at a time

- Switch `bankAccounts.ts`'s *read* path to query `account_balances`
  instead of the in-memory object. Do this per-route, not all at once —
  `GET /accounts` first (lowest risk, read-only), then transfers, then
  card payments, in order of increasing blast radius.
- The in-memory store keeps receiving writes throughout this stage
  (cheap to keep both paths in sync for a while longer) but is no
  longer *read* from anywhere.
- Terminal taps: extend `terminalRouter.ts`'s `/tap` handler (Phase 1
  already added idempotency here) to also call the Ledger Service,
  posting the settled amounts as a `ledger_transactions` row. This is
  the point where AFC revenue and personal/business banking share one
  ledger instead of two disconnected systems.

## Stage 4 — Retire

- Once every route reads from and writes to the ledger exclusively,
  delete the in-memory banking store and its shadow-write code.
- This is the only stage that removes code — and by this point it's
  provably dead, not a guess.

## What doesn't move

- `driver_ledger` and `association_ledger` (AFC-specific, already
  Postgres-backed) are **not** migrated into the new generic ledger —
  they're kept as-is and *connected* to it (a tap posts into both its
  existing specific table and the new general ledger), per the ERD in
  `01-ledger-design.md`. Collapsing them into one schema is a much
  larger, separate refactor with its own risk, not bundled into fixing
  the "no ledger exists" gap.
- Marketplace (`mkt_*` tables) is unaffected — it already has its own
  real Postgres persistence and isn't part of the gap this migration
  addresses.

## Rollback

Each stage is independently revertible without data loss, because the
in-memory store remains the fallback truth through Stage 3:

- **Stage 1** rollback: drop the new tables. Nothing referenced them.
- **Stage 2** rollback: stop the shadow writes. In-memory store is
  still authoritative and untouched.
- **Stage 3** rollback: flip the read path back to in-memory per route
  (same granularity as the cutover itself). The ledger keeps receiving
  writes in the background, so no data is lost by reverting — the
  reconciliation job from Stage 2 catches any drift that accumulated
  while reads were pointed at the ledger.
- **Stage 4** has no rollback (it's a deletion) — which is exactly why
  it's the last stage and only happens once every prior stage has run
  clean for a real observation period.
