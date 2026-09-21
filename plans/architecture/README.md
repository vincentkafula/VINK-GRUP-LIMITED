# Phase 2: Architecture and Contracts

Per the strict phase workflow, this is a design phase — no running code
changes here, only the documents Phase 3 builds against.

Read in this order:

1. **[01-ledger-design.md](./01-ledger-design.md)** — the core deliverable.
   Everything else in this folder exists to support this one decision:
   how the platform gets a real, persistent, double-entry ledger where
   today there's an in-memory object. Start here.
2. **[02-c4-diagrams.md](./02-c4-diagrams.md)** — system context, containers,
   and a component-level zoom into the ledger-relevant slice of the
   backend specifically (not all 42 routes).
3. **[03-migration-plan.md](./03-migration-plan.md)** — how to get from
   today's in-memory store to the design in (1) without a big-bang
   rewrite. Four stages, each independently revertible.
4. **[04-openapi-ledger.yaml](./04-openapi-ledger.yaml)** — OpenAPI 3.1
   contract for the new endpoints. Scoped to the ledger surface only —
   the existing 42-route API is stable and undocumented here on purpose.
5. **[05-threat-model.md](./05-threat-model.md)** — STRIDE analysis of the
   payment/ledger surface, with each mitigation marked as existing,
   shipped in Phase 1, or a Phase 3 build item. Ends with a priority
   ranking — read the summary at the bottom first if you're short on
   time.

## Relationship to the Phase 0 audit and Phase 1 fixes

This phase exists because of one finding from Phase 0: `bankAccounts.ts`
and `bankCards.ts` have zero database calls between them — every balance
lives in a mutable in-memory object that resets on every deploy. Phase 1
fixed what was safe to fix without this design work (rate limiting,
idempotency on the one payment endpoint that already touches real
Postgres, a stack of real bugs ESLint surfaced). This phase designs the
fix for the bigger gap Phase 1 explicitly didn't attempt. Phase 3
implements it.
