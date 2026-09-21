# Target Architecture — C4 Diagrams

**Status:** Phase 2 design document, describing the target state referenced
throughout this `plans/architecture/` set. Current state differs in the
ways called out in `03-migration-plan.md` — most importantly, no ledger
database exists yet.

## Level 1: System Context

Who and what talks to this platform, at the coarsest level.

```mermaid
C4Context
    title MANSHYA (Vink Group) — System Context

    Person(passenger, "Passenger/Customer", "Personal banking customer, taxi commuter")
    Person(driver, "Driver", "Taxi driver using AFC device, has a Driver Wallet")
    Person(owner, "Vehicle/Association Owner", "Owns AFC devices, receives settlement")
    Person(investor, "Investor", "Holds a stake, receives revenue share")
    Person(staff, "Staff (admin/compliance/treasury)", "Internal operations via Management Panel")

    System(platform, "MANSHYA Platform", "Digital banking + AFC payments for the minibus-taxi industry")

    System_Ext(visa, "Visa Developer Platform", "Card issuing/network — not yet configured, sandbox scaffolding only")
    System_Ext(mastercard, "Mastercard Open Banking", "Card issuing/network — not yet configured, sandbox scaffolding only")
    System_Ext(cardProcessor, "Card acquiring processor", "TBD — no processor credentials configured yet (Phase 0 finding)")
    System_Ext(fic, "Financial Intelligence Centre (FIC)", "South African regulator — suspicious transaction reporting, once licensed")
    System_Ext(deka, "Deka EMV SDK", "Native card-reader chip, embedded in P18Q terminal hardware")

    Rel(passenger, platform, "Banks, pays, views statements", "HTTPS/App")
    Rel(driver, platform, "Taps cards, views earnings", "P18Q terminal + App")
    Rel(owner, platform, "Views settlement, manages fleet", "HTTPS/App")
    Rel(investor, platform, "Views portfolio, revenue share", "HTTPS/App")
    Rel(staff, platform, "Reviews applications, compliance, reconciliation", "HTTPS — Management Panel")

    Rel(platform, visa, "Card issuing (planned)", "REST/TLS")
    Rel(platform, mastercard, "Card issuing (planned)", "REST/TLS")
    Rel(platform, cardProcessor, "Settlement (planned, no provider chosen yet)", "TBD")
    Rel(platform, fic, "STR filing (planned, pending FSP/NCRCP licensing)", "TBD")
    Rel(platform, deka, "EMV tap authorization", "Native SDK, on-device")
```

## Level 2: Containers

```mermaid
C4Container
    title MANSHYA Platform — Containers

    Person(user, "User", "Passenger, driver, owner, investor, or staff")

    Container_Boundary(mobile, "Client Applications") {
        Container(webApp, "Web/Mobile App", "React 18 + TypeScript + Vite, wrapped via Capacitor", "Customer + business + corporate banking UI, admin Management Panel")
        Container(terminalApp, "Terminal App", "Capacitor + native Android plugin", "P18Q card-reader firmware bridge — tap authorization on-device")
        Container(tillApp, "Till App", "Capacitor, separate build", "Retail POS")
        Container(retailApp, "Retail POS App", "Capacitor, separate build", "Merchant-facing retail terminal")
    }

    Container(api, "Backend API", "Node.js + Express + TypeScript", "REST API — auth, RBAC, ledger, terminal, KYC, marketplace, AFC")
    ContainerDb(postgres, "Postgres", "Postgres 16", "Persistent store — 52+ tables today; ledger_transactions/ledger_entries/accounts are the Phase 2/3 additions")
    Container(inMemory, "In-memory store", "Plain JS objects (server/src/data/*)", "Current home of banking/vehicle/levy/financial-report data — target: eliminated, migrated into Postgres per 03-migration-plan.md")

    System_Ext(visa, "Visa/Mastercard", "Card issuing (not yet configured)")
    System_Ext(deka, "Deka EMV SDK", "On-device card reader")

    Rel(user, webApp, "Uses", "HTTPS")
    Rel(user, terminalApp, "Taps card at", "NFC")

    Rel(webApp, api, "Calls", "REST/JSON, JWT bearer")
    Rel(terminalApp, api, "Submits taps", "REST/JSON, terminal API key")
    Rel(terminalApp, deka, "Reads card", "Native SDK")
    Rel(tillApp, api, "Submits sales", "REST/JSON")
    Rel(retailApp, api, "Submits transactions", "REST/JSON")

    Rel(api, postgres, "Reads/writes", "SQL, pg pool")
    Rel(api, inMemory, "Reads/writes (current state — being migrated out)", "In-process")
    Rel(api, visa, "Card issuing calls (planned)", "REST/TLS")
```

## Level 3: Component — Backend API (ledger-relevant slice only)

Full component-level detail for all 42 route files isn't useful here — this
zooms in on the piece Phase 2/3 actually changes: the money-moving path.

```mermaid
C4Component
    title Backend API — Ledger & Payments Components (target state)

    Container_Boundary(api, "Backend API") {
        Component(authMw, "Auth Middleware", "JWT verify + RBAC", "Existing — server/src/middleware/auth.ts")
        Component(rateLimitMw, "Rate Limiters", "express-rate-limit", "Existing (general) + Phase 1 addition (auth-specific)")
        Component(accountsRoute, "Accounts Route", "Express router", "NEW — replaces in-memory bankAccounts.ts")
        Component(ledgerService, "Ledger Service", "TS module", "NEW — the only code path allowed to INSERT into ledger_entries")
        Component(terminalRoute, "Terminal Route", "Express router", "Existing, Phase 1 idempotency added — extended in Phase 3 to post into ledger_entries via Ledger Service")
        Component(revenueSplit, "Revenue Split Service", "TS module", "Existing — server/src/services/revenueSplitService.ts, unchanged")
        Component(idempotency, "Idempotency Check", "Shared middleware", "NEW — generalizes the Phase 1 terminal_taps pattern to all money-moving routes")
    }

    ComponentDb(ledgerTables, "ledger_transactions / ledger_entries / accounts / account_balances", "Postgres", "NEW tables, per 01-ledger-design.md")
    ComponentDb(existingTaps, "terminal_taps", "Postgres", "Existing table, kept")

    Rel(accountsRoute, authMw, "Protected by")
    Rel(accountsRoute, idempotency, "Checked by")
    Rel(accountsRoute, ledgerService, "Calls for any balance-affecting action")
    Rel(ledgerService, ledgerTables, "Sole writer to")

    Rel(terminalRoute, rateLimitMw, "Protected by")
    Rel(terminalRoute, revenueSplit, "Calculates split via")
    Rel(terminalRoute, existingTaps, "Writes to (unchanged)")
    Rel(terminalRoute, ledgerService, "NEW: also posts a ledger_transaction for the settled amounts")
```

The key architectural rule this enforces: **`ledger_entries` has exactly
one writer** (the Ledger Service). No route handler ever runs a raw
`INSERT INTO ledger_entries` itself — every money movement, whether it
comes from a P2P transfer, a card payment, or an AFC tap settlement, goes
through the same module. That's what makes the double-entry invariant
(every transaction's entries sum to zero) actually enforceable in code
rather than just a convention people remember to follow.
