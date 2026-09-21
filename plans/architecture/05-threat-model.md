# Threat Model — Payment & Ledger Surface (STRIDE)

**Status:** Phase 2 design document. Scoped to the highest-stakes area —
money movement — rather than the whole platform, per the same reasoning
as the OpenAPI contract: the 42-route existing surface has its own
per-route considerations, but the ledger design is new and untested, so
it gets the thorough treatment here.

Each row states the threat, where it applies, the mitigation, and — since
the brief asks for mitigations "mapped to code," not just described —
whether that mitigation exists today, is a Phase 1 fix already shipped,
or is a Phase 3 build item against the Phase 2 design in this folder.

## Spoofing

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| Attacker impersonates a terminal device to submit fraudulent taps | `POST /api/terminal/tap` | Per-terminal API key, checked in `authenticateTerminal()` before any tap is accepted | Existing |
| Attacker impersonates a user to move their money | Any ledger-writing endpoint | JWT bearer auth via `requireAuth` middleware; `accountId` in requests is never trusted from the client for authorization — always checked against the authenticated user's owned accounts server-side | Existing pattern (`requireAuth`) + Phase 3 build item (ledger routes must apply it consistently, not assume) |
| Attacker replays a captured admin session token | Management Panel, all admin routes | 8-hour JWT expiry limits the window; **gap** — no refresh-token rotation, so a captured token is valid for its full remaining life with no way to invalidate it short of changing `JWT_SECRET` (which invalidates *everyone's* session) | Identified in Phase 0 audit, not yet fixed — flagged as a Phase 3 item, not resolved by the ledger work itself |

## Tampering

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| A bug or malicious actor directly edits a balance instead of going through the ledger | `account_balances` table | This table is a **cache**, not the source of truth — even if it's tampered with or drifts, `SUM(ledger_entries.amount_cents)` is always recoverable as ground truth. The reconciliation job in Stage 2 of the migration plan exists specifically to catch this. | Phase 2 design decision (see 01-ledger-design.md); reconciliation job is a Phase 3 build item |
| A ledger entry is edited or deleted after posting | `ledger_entries` | Table is append-only by design — no `UPDATE`/`DELETE` code path exists in the Ledger Service, and a database-level `REVOKE UPDATE, DELETE` grant on this table for the application's DB role is the enforcement backstop (belt-and-suspenders: app code shouldn't do it, and the DB user literally can't) | Phase 3 build item — the REVOKE grant specifically should be added to `schema.sql`'s setup alongside the table creation |
| A double-processed retry moves money twice | Any money-moving endpoint | Idempotency key required, unique-constrained per scope, race condition handled via catching the unique-violation and returning the winning row | Shipped in Phase 1 for `terminal_taps`; OpenAPI contract makes it *required* (not optional) for the new ledger endpoints — a stricter bar than the Phase 1 terminal implementation, intentionally, since Phase 1 was retrofitting an existing endpoint and Phase 3 is building new ones from scratch |
| Request body tampered in transit | All endpoints | TLS (Railway terminates HTTPS) | Existing (infrastructure-level, not app code) |

## Repudiation

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| Staff member makes a balance-affecting admin action and later denies it | Management Panel admin actions | `audit_log` table exists in schema | **Gap identified in Phase 0**: referenced in exactly one route file — most admin actions aren't actually logged to it. Phase 3 item: every ledger-affecting admin action (manual adjustment, account freeze, reversal) must write to `audit_log` as part of the same DB transaction as the action itself, not a best-effort side call that can silently fail |
| A customer disputes a transaction that genuinely happened | Any ledger transaction | `ledger_entries` is immutable and timestamped; `ledger_transactions.reference` links back to the originating request | Phase 2 design — the append-only property itself is the primary defense here, no separate mechanism needed |

## Information Disclosure

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| Raw card numbers (PAN) stored or logged | `terminal_taps`, card-related tables | `containsUnmaskedPan()` defensively rejects any request field that looks like an unmasked PAN before it's ever written to the DB; schema only ever stores `masked_pan` (last 4 digits) | Existing, verified in Phase 0 audit |
| Credentials committed to source control | Whole repo | — | **Critical gap identified in Phase 0, still unresolved**: `DEV_CREDENTIALS.md` contains real plaintext admin/superadmin passwords, committed to a public GitHub repo. Explicitly not fixed in Phase 1 pending your go-ahead (rotating affects live access). This is the single highest-priority item in this entire threat model — everything else here is defense against hypothetical future attackers; this one is an active, present exposure. |
| One user's account data returned in a response meant for another user | `GET /accounts/{accountId}/*` | Ownership check against the authenticated JWT's user id, not the path parameter, before returning data — same-response-for-not-found-and-not-owned pattern in the OpenAPI contract so existence isn't leaked either | Phase 3 build item, specified in the contract's `NotFound` response description |
| Secrets in environment variable examples accidentally committed with real values | `.env` files | `.env.example` files contain only placeholders; real `.env` files are gitignored | Existing — verified during Phase 0 audit, `.gitignore` correctly excludes `.env` |

## Denial of Service

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| Credential-guessing / brute-force login | `/api/auth/login`, `/register`, `/change-password` | 10 requests per 15 minutes per IP | **Shipped in Phase 1** |
| General API flooding | All `/api` routes | 300 requests/minute per IP | Existing |
| A single terminal spams taps to overload the ledger | `/api/terminal/tap` | Falls under the general rate limit; **gap** — no per-terminal limit distinct from per-IP (multiple terminals could share a NAT'd IP in a taxi rank and hit the shared limit, or one compromised terminal could stay under the per-IP limit while still meaningfully spamming) | Not addressed — flagged as a Phase 3 consideration, not blocking since the idempotency key already prevents any *duplicate* tap from double-processing even under flood conditions |

## Elevation of Privilege

| Threat | Surface | Mitigation | Status |
|---|---|---|---|
| A regular user calls an admin-only ledger endpoint | Admin/staff routes | RBAC via `section_permissions`/`section_applications` tables, checked per-route | Existing pattern, extended to new ledger routes in Phase 3 |
| MFA bypass — sensitive action performed without step-up auth | High-risk actions (large transfers, admin adjustments) | `mfaEnabled` field exists on the user record | **Gap identified in Phase 0, unresolved**: no verification endpoint exists behind this field at all — it's decorative. Not a Phase 1 or Phase 2 item (it's new functionality, not a fix to existing code) — explicitly deferred to Phase 3 |
| A staff member with legitimate access makes an unauthorized large transfer alone | Admin ledger adjustments | Maker-checker (four-eyes approval) for sensitive admin operations, per the brief's requirement | **Not yet implemented** — `section_permissions` grants access but doesn't yet enforce dual-approval for specific high-risk actions. Phase 3 build item: a `pending_approvals` table + workflow, gating ledger-affecting admin actions above a configurable threshold |

## Summary: what this table says to prioritize

Ranked by actual risk, not by STRIDE category order:

1. **`DEV_CREDENTIALS.md`** — active exposure, not hypothetical. Needs your explicit go-ahead to rotate (Phase 1 held off on this deliberately).
2. **Audit logging gap** — makes every other mitigation in this table harder to verify after the fact, since most admin actions currently leave no trail.
3. **Maker-checker / MFA** — both genuinely unbuilt, both explicitly required by the brief, both Phase 3 scope.
4. **JWT refresh rotation** — real gap, lower urgency than the above three since it requires an already-compromised token to matter.
