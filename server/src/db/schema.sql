-- ═══════════════════════════════════════════════════════════════════════════
-- VINK backend — Postgres schema (phase 1: auth + marketplace)
--
-- Plain Postgres (Railway), no Supabase-specific features (no auth schema,
-- no RLS policies, no auth.uid()) — this runs on any standard Postgres 14+.
--
-- Scope note: this covers the auth and marketplace domains only, which are
-- the two modules actually migrated off in-memory storage so far. Banking,
-- AFC, vehicles, levy system, financial reports, global banking and the
-- MVNO simulator still run on their original in-memory stores — extending
-- this schema to cover them is future work, tracked separately.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ── Auth ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  last_login     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Account/Loan Applications (Personal, Business, Corporate) ─────────────
-- Shared schema across all three tiers, matching the confirmed design:
-- common fields as real columns, tier-specific fields in tier_data JSONB
-- rather than a wide table with mostly-null columns per tier. Corporate's
-- extra compliance fields (UBOs, authorized signatories, etc.) never touch
-- Personal's row shape and vice versa.
CREATE TABLE IF NOT EXISTS applications (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number        TEXT UNIQUE NOT NULL,
  tier                    TEXT NOT NULL CHECK (tier IN ('personal','business','corporate')),
  account_type_requested  TEXT,
  currency                TEXT NOT NULL DEFAULT 'ZAR',
  applicant_user_id       TEXT,                    -- nullable: an applicant may not have a VINK login yet
  applicant_name          TEXT NOT NULL,
  applicant_email         TEXT,
  applicant_phone         TEXT,
  status                  TEXT NOT NULL DEFAULT 'submitted'
                            CHECK (status IN ('submitted','under_review','approved','declined','more_info_requested')),
  status_reason           TEXT,                    -- the reason behind the CURRENT status, mirrors the latest history row
  tier_data               JSONB NOT NULL DEFAULT '{}', -- tier-specific fields; see kind-specific notes in kycVerification-style service comments
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_tier ON applications(tier);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(applicant_user_id);

-- Confirmed requirement (2026-08-22): an account number is generated
-- immediately on submission, not held back until approval. If the
-- application is later approved, this same number becomes the real,
-- permanent account number -- no regeneration. If rejected,
-- rejected_at records when that happened, and the number is cleared
-- (set NULL) 14 days after rejection -- see sweepExpiredAccountNumbers()
-- in applicationsRouter.ts for the real logic, and its own comment for
-- why this is computed on read as well as swept by that function,
-- rather than relying solely on a scheduled job actually running.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS account_number TEXT UNIQUE;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Real audit trail — every status change, not just the current snapshot.
-- reason is NOT NULL: a status change without a stated reason is exactly
-- the kind of silent, unaccountable action this table exists to prevent.
CREATE TABLE IF NOT EXISTS application_status_history (
  id                TEXT PRIMARY KEY,
  application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status       TEXT,                          -- NULL for the initial 'submitted' row
  to_status         TEXT NOT NULL,
  reason            TEXT NOT NULL,
  changed_by        TEXT,                           -- reviewer's user id; NULL for the system-generated initial submission row
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_history_application ON application_status_history(application_id);

-- ─── Job Applications ───────────────────────────────────────────────────────
-- Unlike ID/compliance documents, documents here ARE meant to be retained
-- — HR needs to actually read the CV/certificates later, there's no
-- regulatory reason to avoid storage the way there is for ID documents.
-- Core fields are real columns for filtering/search; the full structured
-- payload (education history, work experience, requirement confirmations,
-- declarations) lives in `details` JSONB, matching the tier_data pattern
-- already used for account applications — this form's fields are too
-- specific to this one flow to justify dozens of mostly-empty columns.
-- Documents are a JSONB array of {type, filename, mimeType, data (base64)}
-- rather than separate columns per document, since which documents apply
-- varies (CV/ID/certificates are required, proof of residence and "other"
-- are optional) and a fixed column set would force nulls either way.
CREATE TABLE IF NOT EXISTS job_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number  TEXT UNIQUE NOT NULL,
  department        TEXT NOT NULL,   -- one of the 11 management sections, e.g. 'Bank Management'
  position          TEXT NOT NULL,   -- e.g. 'Head of Bank Management'
  applicant_name    TEXT NOT NULL,
  applicant_email   TEXT NOT NULL,
  applicant_phone   TEXT,
  details           JSONB NOT NULL DEFAULT '{}',
  documents         JSONB NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted','under_review','interview','offered','rejected','withdrawn')),
  status_reason     TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_apps_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_apps_department ON job_applications(department);
-- Tracks whether approval actually granted real section access (via
-- section_permissions, the same RBAC table the "apply to manage a
-- section" flow uses) — not just that the status says "offered". Added
-- via ALTER rather than only in the CREATE TABLE above, since this
-- table may already exist on a live database from before this feature —
-- CREATE TABLE IF NOT EXISTS is a no-op against an existing table, the
-- same lesson already learned twice this session for other tables.
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS role_granted_at TIMESTAMPTZ;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS role_granted_user_id UUID;

CREATE TABLE IF NOT EXISTS job_application_status_history (
  id                  TEXT PRIMARY KEY,
  job_application_id  UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  reason              TEXT NOT NULL,
  changed_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_app_history ON job_application_status_history(job_application_id);


-- ─── RBAC: Section Manager application/approval workflow ───────────────────
CREATE TABLE IF NOT EXISTS section_applications (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section         TEXT NOT NULL,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_section_apps_status ON section_applications(status);
CREATE INDEX IF NOT EXISTS idx_section_apps_user ON section_applications(user_id);

CREATE TABLE IF NOT EXISTS section_permissions (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,
  position    TEXT,        -- the specific role within the section, e.g. 'Reporter / Journalist' for News Management -- null for grants made outside the job-application flow (the original RBAC "apply to manage a section" system, which doesn't have sub-roles)
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section)
);
ALTER TABLE section_permissions ADD COLUMN IF NOT EXISTS position TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Editorial workflow: content-creator roles (Reporter, Section Editor, etc.)
-- submit pending_review, only editorial leadership (General Manager,
-- Editor-in-Chief, Managing Editor) can move something to published.
-- Existing seeded articles all default to 'published' so the public
-- news viewer's existing behavior (which only ever queries published
-- content) doesn't change for anything already in the table.

-- Hero image: stored the same way job application documents are (base64
-- in the row, no object storage configured yet) -- reasonable at current
-- volume, real object storage (S3/GCS/Cloudinary) is the natural next
-- step if this needs to scale to a lot of large images.

-- Scheduling: 'scheduled' joins the existing status values. A background
-- job (see startScheduledPublishJob in news.ts) flips scheduled articles
-- to 'published' once scheduled_at arrives.

-- SEO / discovery metadata, and tracking whether views should be counted
-- (kept simple -- a real analytics pipeline is out of scope here).


-- ─── Fraud & Risk Basics (M1 5.1.4) ─────────────────────────────────────────
-- Rule-based, flag-only -- never auto-blocks. Every flag lands in front of a
-- human reviewer via the /api/fraud-risk endpoints, same discipline as
-- application_status_history: a decision (dismiss/confirm) requires a
-- reason, and the flag itself is never silently deleted, only marked
-- resolved, so the review trail survives.
CREATE TABLE IF NOT EXISTS fraud_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('velocity_applications','velocity_payments','duplicate_phone','duplicate_email','duplicate_card')),
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  subject_type    TEXT NOT NULL CHECK (subject_type IN ('user','application','order')),
  subject_id      TEXT NOT NULL,          -- id of the user/application/order that triggered the flag
  related_ids     JSONB NOT NULL DEFAULT '[]', -- the other applications/orders/users this flag ties together (e.g. the accounts sharing one phone number)
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','dismissed')),
  resolution_note TEXT,                   -- required before status can leave 'open', enforced at the route layer
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_subject ON fraud_flags(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_type ON fraud_flags(type);

-- Card-fingerprint duplicate detection (Section 5.1.4 / glossary definition:
-- "a non-reversible identifier derived from a card's details ... without
-- storing or exposing the underlying card number"). Populated from
-- whatever stable, non-reversible identifier the processor's own response
-- provides (e.g. a token or last-4 + expiry hash) -- never the card number
-- itself. NULL until a processor response actually supplies one; duplicate
-- detection simply skips transactions where this is NULL rather than
-- treating NULL as a match.

-- ─── AFC Terminal Registration & Tap Ingestion ──────────────────────────────
-- A "terminal" is a physical device (P18Q bus validator or equivalent)
-- authorized to submit tap events. Deliberately NOT authenticated with a
-- user JWT -- the caller is a device, not a logged-in person, so it gets
-- its own credential (api_key_hash), the same reasoning any processor
-- webhook callback uses instead of requireAuth. api_key itself is never
-- stored -- only its hash, same as password_hash on users -- issued once
-- at registration time and shown to the operator exactly once.
CREATE TABLE IF NOT EXISTS terminals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial          TEXT UNIQUE NOT NULL,
  model           TEXT NOT NULL DEFAULT 'P18Q Bus Validator',
  api_key_hash    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','revoked')),
  assigned_driver TEXT,                    -- free-text label for now (driver name/id); not a FK, since there's no drivers table yet in this schema
  registered_by   TEXT,                    -- username of the admin who provisioned it
  last_seen_at    TIMESTAMPTZ,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Real ownership-chain references, added for multi-party revenue
-- splitting (2026-08-18): who actually gets paid for taps on this
-- specific device. All nullable -- a terminal can be registered
-- before these are assigned, and the split calculation treats an
-- unassigned party as "nothing withheld for them" rather than
-- failing the whole tap. driver_id is separate from the older
-- assigned_driver text field above (kept as-is for backward
-- compatibility with existing code) since the split logic needs a
-- real users.id to credit, not a free-text label.
--
-- Confirmed real production bug (2026-08-22): these were originally
-- added directly inside the CREATE TABLE statement above rather than
-- as their own ALTER TABLE, which silently does nothing on a database
-- where terminals already existed from before this feature shipped --
-- CREATE TABLE IF NOT EXISTS skips the whole statement, columns
-- included, when the table is already there. This broke the live
-- migration outright (a later CREATE INDEX referencing investor_id
-- failed with "column does not exist"), confirmed by replaying every
-- historical version of this file against a real test database in
-- sequence and reproducing the exact same failure. Moved to a proper,
-- idempotent ALTER TABLE here, the same pattern already used correctly
-- for applications.account_number/rejected_at.
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS investor_id UUID REFERENCES users(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES users(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS association_id UUID REFERENCES users(id); -- not used in the per-tap split itself (association fees are a separate flat monthly charge, not a per-tap cut) -- stored here for reporting/filtering by association's fleet
CREATE INDEX IF NOT EXISTS idx_terminals_status ON terminals(status);
CREATE INDEX IF NOT EXISTS idx_terminals_investor ON terminals(investor_id);
CREATE INDEX IF NOT EXISTS idx_terminals_owner ON terminals(owner_id);

-- One row per tap event the terminal reports. Card data here is
-- deliberately narrow -- masked_pan (never a full PAN), scheme (from the
-- EMV AID, e.g. "visa"/"mastercard"), and emv_cryptogram_ref, which is
-- whatever OPAQUE reference the certified EMV kernel itself returns (a
-- token, not the raw cryptographic Application Cryptogram) -- once a real
-- kernel is integrated. The route layer enforces this at the boundary:
-- see terminalRouter.ts's PAN-shape rejection check.
CREATE TABLE IF NOT EXISTS terminal_taps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id         UUID NOT NULL REFERENCES terminals(id),
  masked_pan          TEXT,                -- e.g. "**** **** **** 4242" -- last 4 digits only, never more
  scheme              TEXT,                -- 'visa' | 'mastercard' | 'other', from the EMV AID the kernel selected
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'ZAR',
  cardholder_verification TEXT,            -- 'contactless_no_cvm' | 'pin' | 'signature' -- whatever the kernel reports
  emv_cryptogram_ref  TEXT,                -- opaque token/reference only -- never the raw AC
  status              TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','confirmed','declined')),
  error_message       TEXT,
  -- Multi-party revenue split (2026-08-18, corrected same day after
  -- an initial wrong version used percentage splits for all three
  -- parties). VINK's flat fee is two named halves (R0.50 "device
  -- side" + R0.50 "card side"). The driver's pay is a fixed amount
  -- privately agreed between driver and owner -- deliberately NOT a
  -- column here, since VINK's system doesn't calculate or touch it at
  -- all. The investor's only per-tap income is 10% of VINK's own fee
  -- (R0.10/tap, not 10% of the fare) -- their monthly device rental
  -- from the owner is a separate, non-per-tap billing relationship
  -- also not represented here. The owner receives everything left
  -- after VINK's fee alone (never fee-plus-investor-share -- the
  -- investor's cut comes out of VINK's own fee, not on top of it).
  -- Nullable: a tap can be recorded even if the terminal has no
  -- investor/owner assigned yet, in which case these are null rather
  -- than the tap failing outright.
  vink_fee_device     NUMERIC(10,2),
  vink_fee_card       NUMERIC(10,2),
  owner_settlement    NUMERIC(10,2),
  investor_share      NUMERIC(10,2),
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_terminal_taps_terminal ON terminal_taps(terminal_id);
CREATE INDEX IF NOT EXISTS idx_terminal_taps_status ON terminal_taps(status);

-- Idempotency: the physical card reader generates one key per tap event
-- (client-side, once) and resends the same key on any retry (network
-- timeout, no response received, etc.). Unique per terminal rather than
-- globally -- two different terminals independently generating the same
-- key is not a real collision, only a retry from the same device is.
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_taps_idempotency ON terminal_taps(terminal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── Ledger (Phase 3, Stage 1 of plans/architecture/03-migration-plan.md) ─────
-- Design: plans/architecture/01-ledger-design.md. This is the additive
-- stage only -- these tables exist and are unit-tested in isolation via
-- ledgerService.ts, but nothing in the running app reads from or writes
-- to them yet. bankAccounts.ts/bankCards.ts still serve all live traffic
-- from the in-memory store, unchanged. Zero behavior change from adding
-- this migration.
--
-- Money is integer minor units (BIGINT cents), never a float or a
-- NUMERIC with implied decimal handling in application code -- this is
-- the fix for the Phase 0 finding that the in-memory store computes
-- balances as floating-point Rand amounts.

CREATE TABLE IF NOT EXISTS accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  account_number      TEXT NOT NULL UNIQUE,
  iban                TEXT UNIQUE,
  account_type        TEXT NOT NULL CHECK (account_type IN ('current','savings','business','wallet','treasury')),
  currency            TEXT NOT NULL CHECK (currency IN ('ZAR','USD','EUR','GBP','NGN','KES')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed','pending_kyc')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     TEXT NOT NULL,
  transaction_type    TEXT NOT NULL CHECK (transaction_type IN ('p2p_transfer','card_payment','afc_settlement','fee','refund','adjustment')),
  status              TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  initiated_by        UUID REFERENCES users(id),
  reference           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at           TIMESTAMPTZ
);
-- Idempotency-Key is a required header on every ledger-writing endpoint
-- (per 04-openapi-ledger.yaml) -- globally unique, unlike terminal_taps'
-- per-terminal scoping, since a transaction isn't tied to one device.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transactions_idempotency ON ledger_transactions(idempotency_key);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID NOT NULL REFERENCES ledger_transactions(id),
  account_id          UUID NOT NULL REFERENCES accounts(id),
  amount_cents        BIGINT NOT NULL CHECK (amount_cents != 0), -- positive = credit, negative = debit; never zero, a no-op entry is a bug
  currency            TEXT NOT NULL CHECK (currency IN ('ZAR','USD','EUR','GBP','NGN','KES')),
  sequence_no         BIGINT NOT NULL, -- monotonic per account, assigned by the Ledger Service, used for cached-balance replay
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
-- Enforces "ledger_entries has exactly one writer" (02-c4-diagrams.md) at
-- the database level, not just as an application convention -- belt and
-- suspenders alongside ledgerService.ts being the only module that ever
-- runs an INSERT here. See ledgerAppUser below for the REVOKE that makes
-- this a hard guarantee once the app connects as a role other than the
-- Postgres superuser (documented, not yet wired into deploy -- see
-- ledgerService.ts's own header comment).
-- REVOKE UPDATE, DELETE ON ledger_entries FROM <app_role>;

CREATE TABLE IF NOT EXISTS account_balances (
  account_id          UUID PRIMARY KEY REFERENCES accounts(id),
  balance_cents        BIGINT NOT NULL DEFAULT 0,
  available_cents      BIGINT NOT NULL DEFAULT 0,
  pending_cents         BIGINT NOT NULL DEFAULT 0,
  last_entry_at        TIMESTAMPTZ,
  last_entry_seq        BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key                  TEXT PRIMARY KEY,
  scope                TEXT NOT NULL, -- e.g. 'p2p_transfer' -- namespaces keys so two different endpoints can't collide on a coincidentally-reused client-generated value
  resulted_in_transaction_id UUID REFERENCES ledger_transactions(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GPS Route Assignment, Geofence Violations, Driver Fine Ledger ────────────
-- Confirmed model (2026-08-18): an association defines a route as an
-- ordered set of waypoints (a path, not a single circular zone -- this
-- is deliberately a different, new concept from the older, simpler
-- vehicleDb.geofences mock circular-zone data used elsewhere in this
-- codebase, since a taxi route is a path with a tolerance buffer, not
-- a single point-radius zone). A vehicle reporting a GPS position more
-- than tolerance_meters from the nearest point on its assigned route's
-- path is a violation, and each violation deducts a fixed R50 from the
-- driver's ledger -- a genuinely new concept, since regular per-tap
-- driver pay is deliberately never tracked in this system (see
-- terminal_taps' own comment above). Fines needed their own ledger to
-- have any real balance to deduct from at all.

-- The path itself -- an ordered sequence of lat/lng points. sequence
-- determines the order the points are joined into a path; the
-- geofence tolerance is checked against distance to the nearest
-- segment of this path, not just to the individual points.

-- One row per GPS position report from a device. Deliberately
-- separate from terminal_taps -- a position report and a card tap are
-- different event types from the same physical device, same reasoning
-- terminal_taps' own comment gives for keeping a tap event and a
-- payment submission as two different things.

-- One row per confirmed off-route violation -- fine_amount is stored
-- at the moment of the violation (currently always R50, but stored
-- explicitly rather than recalculated later, same discipline as
-- terminal_taps' own persisted revenue split) so a future change to
-- the fine amount doesn't retroactively change historical records.
-- The corresponding driver_ledger entry (if the fine was successfully
-- posted) is found via driver_ledger.reference_id = route_violations.id
-- -- no back-reference column needed here, which also avoids a
-- circular foreign key between these two tables.

-- A genuinely new concept: regular per-tap driver pay is deliberately
CREATE TABLE IF NOT EXISTS vehicle_routes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id       UUID NOT NULL REFERENCES terminals(id),
  association_id    UUID REFERENCES users(id), -- who defined this route; nullable since a route could be created by an admin on an association's behalf
  name              TEXT NOT NULL,
  tolerance_meters  NUMERIC(8,2) NOT NULL DEFAULT 200, -- how far off the path is still considered on-route
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_routes_terminal ON vehicle_routes(terminal_id);

-- The path itself -- an ordered sequence of lat/lng points. sequence
-- determines the order the points are joined into a path; the
-- geofence tolerance is checked against distance to the nearest
-- segment of this path, not just to the individual points.
CREATE TABLE IF NOT EXISTS route_waypoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    UUID NOT NULL REFERENCES vehicle_routes(id) ON DELETE CASCADE,
  sequence    INTEGER NOT NULL,
  lat         NUMERIC(9,6) NOT NULL,
  lng         NUMERIC(9,6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_waypoints_route ON route_waypoints(route_id, sequence);

-- One row per GPS position report from a device. Deliberately
-- separate from terminal_taps -- a position report and a card tap are
-- different event types from the same physical device, same reasoning
-- terminal_taps' own comment gives for keeping a tap event and a
-- payment submission as two different things.
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id   UUID NOT NULL REFERENCES terminals(id),
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_terminal ON vehicle_positions(terminal_id, recorded_at DESC);

-- One row per confirmed off-route violation -- fine_amount is stored
-- at the moment of the violation (currently always R50, but stored
-- explicitly rather than recalculated later, same discipline as
-- terminal_taps' own persisted revenue split) so a future change to
-- the fine amount doesn't retroactively change historical records.
-- The corresponding driver_ledger entry (if the fine was successfully
-- posted) is found via driver_ledger.reference_id = route_violations.id
-- -- no back-reference column needed here, which also avoids a
-- circular foreign key between these two tables.
CREATE TABLE IF NOT EXISTS route_violations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id           UUID NOT NULL REFERENCES terminals(id),
  route_id              UUID NOT NULL REFERENCES vehicle_routes(id),
  position_id           UUID NOT NULL REFERENCES vehicle_positions(id),
  distance_from_route_m NUMERIC(10,2) NOT NULL,
  fine_amount           NUMERIC(10,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_violations_terminal ON route_violations(terminal_id);

-- never tracked anywhere in this system (it's a private, fixed
-- arrangement with the owner -- see terminal_taps' own comment), but
-- fines need an actual account to deduct from, so this ledger exists
-- specifically and only for that. balance_after is a running balance
-- computed and stored at insert time (not recalculated from history on
-- every read) so a driver's current fine balance is a fast, direct
-- lookup of their most recent ledger row.
CREATE TABLE IF NOT EXISTS driver_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES users(id),
  entry_type      TEXT NOT NULL DEFAULT 'fine' CHECK (entry_type IN ('fine')), -- deliberately only 'fine' for now -- this ledger exists solely for route violations, not a general driver account; widen this CHECK if a real second use case appears later
  amount          NUMERIC(10,2) NOT NULL, -- negative for a fine (a debit)
  balance_after   NUMERIC(10,2) NOT NULL,
  reference_id    UUID REFERENCES route_violations(id),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_ledger_driver ON driver_ledger(driver_id, created_at DESC);

-- The other half of a fine transfer (2026-08-18): the driver's ledger
-- goes down by the fine amount, the owning association's ledger goes
-- up by the same amount -- a real transfer, not a debit with no
-- destination. Which association is credited is determined by the
-- route the violation happened on (vehicle_routes.association_id),
-- not by any other relationship -- a route's association is the
-- single source of truth for where its fines go.
CREATE TABLE IF NOT EXISTS association_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  UUID NOT NULL REFERENCES users(id),
  entry_type      TEXT NOT NULL DEFAULT 'fine_credit' CHECK (entry_type IN ('fine_credit')), -- same discipline as driver_ledger -- narrow on purpose, widen if a real second use case appears
  amount          NUMERIC(10,2) NOT NULL, -- positive for a fine credit
  balance_after   NUMERIC(10,2) NOT NULL,
  reference_id    UUID REFERENCES route_violations(id),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_association_ledger_association ON association_ledger(association_id, created_at DESC);

-- ── MDM: Device Status, Fault Alarms, App Update Tracking ────────────────────
-- Applies across P18-L2C, P18-Q, and P10 device models without any
-- schema change needed for that -- terminals.model is already a
-- free-text field per device (default 'P18Q Bus Validator', but never
-- constrained to only that value), so a P10 or P18-L2C terminal is
-- just a terminals row with a different model string, using the exact
-- same MDM tables and endpoints as a P18Q.

-- Latest-status snapshot columns added directly to terminals, same
-- discipline as driver_ledger/association_ledger's own balance_after:
-- store the current value for fast lookup (an admin dashboard querying
-- "show me every terminal's current battery level" shouldn't need a
-- subquery per terminal), with the full history kept separately below
-- for trend analysis and fault detection over time.
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS battery_pct INTEGER;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- Full heartbeat history -- one row per check-in. Deliberately
-- separate from vehicle_positions (a status heartbeat and a GPS
-- position are different event types, same reasoning terminal_taps'
-- own comment gives for keeping taps and payments separate).
CREATE TABLE IF NOT EXISTS device_status_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id   UUID NOT NULL REFERENCES terminals(id),
  app_version   TEXT,
  battery_pct   INTEGER,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_status_reports_terminal ON device_status_reports(terminal_id, reported_at DESC);

-- Explicit fault reports from a device (e.g. "reader hardware error",
-- "GPS signal lost"). resolved/resolved_at let an admin acknowledge a
-- fault without deleting the historical record of it having happened.
CREATE TABLE IF NOT EXISTS device_faults (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id   UUID NOT NULL REFERENCES terminals(id),
  fault_code    TEXT NOT NULL,
  message       TEXT,
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_faults_terminal ON device_faults(terminal_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_faults_unresolved ON device_faults(resolved) WHERE resolved = false;

-- App version catalog for the update check-and-prompt flow. A device
-- checks its own current version against the newest active row here;
-- if newer, the app shows an update prompt with download_url (opening
-- Android's standard install flow, which still requires the operator
-- to tap-confirm -- see the honest note in the endpoint's own comment
-- about what "push" can and can't mean on stock Android without a full
-- Device Owner/Android Enterprise enrollment).
CREATE TABLE IF NOT EXISTS app_releases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL,
  download_url    TEXT NOT NULL,
  release_notes   TEXT,
  mandatory       BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_releases_active ON app_releases(active, created_at DESC);
-- 'product' distinguishes which app a release applies to (2026-08-18,
-- added when the retail POS app was built) -- reusing this same table
-- rather than duplicating it for a second app, since nothing else
-- about a release record is taxi- or retail-specific. Existing rows
-- default to 'taxi_terminal' so the original terminal-app's own
-- update-check behavior is unchanged by this addition.
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'taxi_terminal';


-- ── Retail POS: Merchants, Terminals, Transactions, MDM ──────────────────────
-- A genuinely separate system from the taxi AFC terminals above --
-- different hardware (vendor unconfirmed as of this writing, no real
-- SDK integrated yet -- see retail-pos-app's own honest placeholder
-- card-reading service), different ownership model (a merchant owns
-- their own device directly, no investor/owner/driver/association
-- rental chain), and a different fee model (2.5% of the transaction,
-- not a flat R1.00 + fixed shares). Connects to the same underlying
-- banking system the taxi model does, the same way: merchant.owner_id
-- references the same real users(id) table used everywhere else in
-- this schema, not a separate parallel account system.
CREATE TABLE IF NOT EXISTS retail_merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id), -- the real VINK banking-system account this merchant settles to
  business_name   TEXT NOT NULL,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retail_terminals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial            TEXT UNIQUE NOT NULL,
  model             TEXT NOT NULL DEFAULT 'Retail POS',
  api_key_hash      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','revoked')),
  merchant_id       UUID REFERENCES retail_merchants(id), -- nullable, same reasoning terminals.investor_id etc. use: a device can be registered before it's assigned
  app_version       TEXT,
  battery_pct       INTEGER,
  last_heartbeat_at TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ,
  registered_by     TEXT,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retail_terminals_status ON retail_terminals(status);
CREATE INDEX IF NOT EXISTS idx_retail_terminals_merchant ON retail_terminals(merchant_id);

-- Percentage-based fee, unlike terminal_taps' flat R1.00 -- vink_fee_amount
-- and merchant_settlement are both stored explicitly at the moment of
-- the transaction (not just the rate), same discipline terminal_taps'
-- own comment explains: a later change to VINK_FEE_PCT shouldn't
-- retroactively change historical records.
CREATE TABLE IF NOT EXISTS retail_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id           UUID NOT NULL REFERENCES retail_terminals(id),
  masked_pan            TEXT,
  scheme                TEXT,
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ZAR',
  cardholder_verification TEXT,
  emv_cryptogram_ref    TEXT,
  status                TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','confirmed','declined')),
  vink_fee_pct          NUMERIC(5,2) NOT NULL,
  vink_fee_amount       NUMERIC(10,2) NOT NULL,
  merchant_settlement   NUMERIC(10,2) NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retail_transactions_terminal ON retail_transactions(terminal_id);

-- MDM history for retail terminals, mirroring device_status_reports /
-- device_faults exactly -- deliberately separate tables rather than
-- reusing the taxi ones directly, since retail_terminals and terminals
-- are different tables with different FKs.
CREATE TABLE IF NOT EXISTS retail_device_status_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id   UUID NOT NULL REFERENCES retail_terminals(id),
  app_version   TEXT,
  battery_pct   INTEGER,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retail_device_status_reports_terminal ON retail_device_status_reports(terminal_id, reported_at DESC);

CREATE TABLE IF NOT EXISTS retail_device_faults (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id   UUID NOT NULL REFERENCES retail_terminals(id),
  fault_code    TEXT NOT NULL,
  message       TEXT,
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retail_device_faults_terminal ON retail_device_faults(terminal_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_retail_device_faults_unresolved ON retail_device_faults(resolved) WHERE resolved = false;

-- ── RICA (SIM Registration) Compliance ────────────────────────────────────────
-- South Africa's mandatory SIM registration law (RICA Act 70 of 2002,
-- ICASA oversight) -- confirmed via research before building this, not
-- assumed: applies to prepaid, contract, physical, and eSIM alike.
-- Requires proof of identity (SA ID/passport/refugee document) AND
-- proof of address dated within 3 months, with an affidavit accepted
-- specifically for informal-settlement residents who may not have a
-- utility bill in their name -- a real, confirmed exception, not an
-- afterthought. subscriber_ref links to the existing (currently
-- in-memory mock) subscriber record by IMSI/MSISDN rather than a
-- foreign key, since that store isn't in this database.

-- ── CPE Device Provisioning ────────────────────────────────────────────────
-- The real end-to-end router provisioning flow described in the
-- original MVNO conversation: a router is manufactured/flashed with a
-- unique serial before it ever ships, a customer later claims that
-- serial against their own (RICA-verified) account, and provisioning
-- then means creating the real Open5GS subscriber and pushing real
-- initial config via GenieACS -- reusing open5gsClient.ts and
-- genieAcsClient.ts rather than duplicating that logic.
--
-- genieacs_device_id starts null and is only populated once the
-- physical device has actually contacted a real ACS for the first
-- time (GenieACS assigns that ID itself, from the device's own
-- TR-069 Inform) -- this table can't invent that value in advance.

-- ── Restaurant Ordering -- connects to the till, not a parallel system ───────
-- Confirmed requirement: a restaurant must connect to the till, not
-- run its own separate product/menu system. Menu items ARE till
-- products (products.merchant_id already scopes them per-business,
-- so a restaurant is simply a merchant whose products happen to be
-- menu items) -- restaurant_order_items references products directly,
-- the same table till checkout already uses. The genuine restaurant-
-- specific addition is order lifecycle (a kitchen needs to track
-- received -> preparing -> ready -> served before payment happens,
-- which a simple till sale doesn't need) and physical tables.

-- An order precedes payment (the real restaurant pattern -- order
-- first, kitchen prepares, pay at the end), unlike till checkout where
-- payment happens at the point of sale. sale_id starts null and is set
-- once the order is actually paid via the till's existing POST
-- /api/till/sale flow -- this table doesn't duplicate payment logic,
-- it hands off to the till's own proven code for that.

-- References products directly -- this IS the till connection. A menu
-- item is a till product, full stop, not a separate concept with its
-- own table.

-- ── Ride-Hailing (migrated from a separate Supabase backend) ─────────────────
-- The full real API surface RideHailingSystem.tsx actually calls,
-- confirmed by reading every api() call and every currentTrip.* field
-- access in that file before designing this schema, not guessed at.
-- passenger_id/driver_id are deliberately TEXT, not a users(id) FK --
-- the current frontend hardcodes demo values ("pax-001", "drv-101")
-- with no real auth integration for this feature yet, same reasoning
-- terminals.assigned_driver stayed TEXT before a real driver identity
-- system existed for that flow.

-- ─── Authentication: refresh tokens, emailed tokens, verified email ───────────────────────────
-- Existing users are treated as already verified; only accounts created after this migration start unverified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;

-- Rotating refresh tokens. Only a hash is stored. A "family" is the chain of tokens issued from one sign-in, so presenting an
-- old (already-rotated) token can revoke the whole chain.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Single-use emailed tokens (verify address, reset password). Only a hash is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, purpose);

-- Incoming email received through Resend (see inbound/router.ts). resend_id makes repeated webhook deliveries harmless.
CREATE TABLE IF NOT EXISTS inbound_emails (
  id          UUID PRIMARY KEY,
  resend_id   TEXT NOT NULL UNIQUE,
  from_addr   TEXT NOT NULL,
  to_addrs    TEXT[] NOT NULL DEFAULT '{}',
  subject     TEXT NOT NULL DEFAULT '',
  text_body   TEXT,
  html_body   TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_received ON inbound_emails(received_at DESC);

-- ─── Transport accounts: vehicles, driver profiles, notification read-state ───────────────────────────────────────────────
-- A vehicle belongs to an owner (users.id with role vehicle_owner). A terminal is fitted to one vehicle; the driver reaches the
-- vehicle through terminals.driver_id -> terminals.vehicle_id.
CREATE TABLE IF NOT EXISTS vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID REFERENCES users(id),
  registration  TEXT UNIQUE NOT NULL,
  make          TEXT,
  model         TEXT,
  year          INTEGER,
  colour        TEXT,
  seats         INTEGER,
  disc_expiry   DATE,                      -- licence disc expiry; drives a reminder on the driver's dashboard
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);

-- What a driver tells us about themselves (entered by the driver; not verified by this system).
CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone           TEXT,
  licence_number  TEXT,
  licence_code    TEXT,
  licence_expiry  DATE,
  pdp_number      TEXT,                    -- professional driving permit
  pdp_expiry      DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications are derived from real events when read (new fines, expiring documents); only "has this one been read" is stored.
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ─── Transport accounts, part 2: links, ranks, queues, departures, levies, documents, personal profile, support ──────────────
-- Who belongs to which association. Either side can start it (requested_by); it only becomes 'active' when the OTHER side agrees.
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role     TEXT NOT NULL CHECK (member_role IN ('vehicle_owner','driver','marshal')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','removed')),
  requested_by    TEXT NOT NULL CHECK (requested_by IN ('association','member')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  UNIQUE (association_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_id, status);

-- Which drivers work for which owner. Same two-sided agreement.
CREATE TABLE IF NOT EXISTS owner_drivers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','removed')),
  requested_by  TEXT NOT NULL CHECK (requested_by IN ('owner','driver')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (owner_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_drivers_driver ON owner_drivers(driver_id, status);

-- The driver an owner has put on a vehicle (the driver also has to be one of the owner's active drivers).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS ranks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  location        TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (association_id, name)
);
-- A marshal works at one or more ranks, assigned by the association.
CREATE TABLE IF NOT EXISTS rank_marshals (
  rank_id     UUID NOT NULL REFERENCES ranks(id) ON DELETE CASCADE,
  marshal_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (rank_id, marshal_id)
);
-- The waiting line at a rank. A vehicle joins; it leaves by departing (logged in departures) or by being removed.
CREATE TABLE IF NOT EXISTS rank_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_id     UUID NOT NULL REFERENCES ranks(id) ON DELETE CASCADE,
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rank_queue_rank ON rank_queue(rank_id, left_at, joined_at);
CREATE TABLE IF NOT EXISTS departures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_id      UUID NOT NULL REFERENCES ranks(id) ON DELETE CASCADE,
  vehicle_id   UUID NOT NULL REFERENCES vehicles(id),
  driver_id    UUID REFERENCES users(id),
  marshal_id   UUID NOT NULL REFERENCES users(id),
  passengers   INTEGER,
  note         TEXT,
  departed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departures_rank ON departures(rank_id, departed_at DESC);

-- Levies are whatever the association decides to charge: the title, amount and due date are typed in by them (no defaults here).
CREATE TABLE IF NOT EXISTS levies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_levies_assoc ON levies(association_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_levies_member ON levies(member_id);

-- Compliance documents kept by an owner: the details and expiry date only (no file is stored).
CREATE TABLE IF NOT EXISTS compliance_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id  UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  reference   TEXT,
  expires_on  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_owner ON compliance_documents(owner_id);

CREATE TABLE IF NOT EXISTS personal_profiles (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                    TEXT,
  home_area                TEXT,
  favourite_route          TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_requests(user_id, created_at DESC);

-- A vehicle can be in only one waiting line at a time (the application also checks; this closes the race between two marshals).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_queue_one_active_per_vehicle ON rank_queue(vehicle_id) WHERE left_at IS NULL;

-- The per-tap revenue split columns were added inside the CREATE TABLE terminal_taps statement after the table already existed in
-- production, so CREATE TABLE IF NOT EXISTS never added them there ("column does not exist"). Added here as idempotent ALTERs,
-- the same fix the terminals ownership columns got above.
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS vink_fee_device NUMERIC(10,2);
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS vink_fee_card   NUMERIC(10,2);
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS owner_settlement NUMERIC(10,2);
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS investor_share   NUMERIC(10,2);

-- ─── Bank account links: each dashboard user is linked to a bank account held in the Banking module (VINK) ───────────────
-- Only the LINK lives here. The account number, balance and transactions are always read live from the Banking module, so there is a single
-- source of truth. Business details are encrypted by the application (AES-256-GCM, see portal/fieldCrypto.ts) before they are stored.
CREATE TABLE IF NOT EXISTS bank_account_links (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,   -- one linked account per user
  manshya_account_id       TEXT NOT NULL UNIQUE,                                           -- an account can belong to only one user
  holder_type              TEXT NOT NULL CHECK (holder_type IN ('personal','business')),
  business_name_enc        TEXT,
  registration_number_enc  TEXT,
  status                   TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified','pending_review','rejected')),
  reviewed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  review_note              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_links_status ON bank_account_links(status);

-- ─── Country configuration (South Africa, Zambia): versioned, approval-gated profiles ──────────────────────────────────────
-- One profile per country and version. Everything that differs between countries (currency, limits, fees, payouts, partner, corridors)
-- lives in the JSON config; code reads the ACTIVE profile and hard-codes nothing. A draft is edited by its creator, submitted, approved by
-- N DIFFERENT staff (never the creator), then activated; the previous active version is retired and kept for history.
CREATE TABLE IF NOT EXISTS country_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  TEXT NOT NULL CHECK (country_code IN ('ZA','ZM')),
  version       INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','pending_approval','approved','active','retired','rejected')),
  config        JSONB NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  activated_at  TIMESTAMPTZ,
  activated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (country_code, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_country_profiles_one_active ON country_profiles(country_code) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS config_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES country_profiles(id) ON DELETE CASCADE,
  approver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision     TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, approver_id)
);

-- Zambia's currency joins the ledger tables (the original CHECK did not allow ZMW). Idempotent: dropped and re-added with the longer list.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_currency_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_check CHECK (currency IN ('ZAR','USD','EUR','GBP','NGN','KES','ZMW'));
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_currency_check CHECK (currency IN ('ZAR','USD','EUR','GBP','NGN','KES','ZMW'));

-- ─── Money engine: trips, settlement of taps, driver-owner agreements, payment items ──────────────────────────────────────
-- (see docs/payments/ZA_ZM_CONFIGURATION_GUIDE.md section 5.5). All amounts are integers in minor units.
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS trip_id UUID;
ALTER TABLE terminal_taps ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- One row per tap that has been settled into balances (or is blocked and will be retried). The ledger posting itself is idempotent on 'tap:<id>'.
CREATE TABLE IF NOT EXISTS tap_settlements (
  tap_id        UUID PRIMARY KEY REFERENCES terminal_taps(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('settled','blocked')),
  reason        TEXT,
  destination   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at    TIMESTAMPTZ
);

-- The private agreement between an owner and a driver. The owner proposes; the driver accepts (and consents to the automatic transfers).
CREATE TABLE IF NOT EXISTS driver_agreements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('cash_basis_weekly','monthly_salary','per_trip_amount')),
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  currency        TEXT NOT NULL DEFAULT 'ZAR',
  pay_day         SMALLINT,                      -- weekly: 1 (Monday) to 7 (Sunday); monthly: 1 to 28; per trip: not used
  start_date      DATE NOT NULL,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','declined','ended','cancelled')),
  proposed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  consent_version TEXT,
  consent_text    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_one_open ON driver_agreements(owner_id, driver_id) WHERE status IN ('proposed','active');
CREATE INDEX IF NOT EXISTS idx_agreements_driver ON driver_agreements(driver_id, status);

-- A trip is N confirmed taps (16) on one vehicle's terminal.
CREATE TABLE IF NOT EXISTS trips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id    UUID NOT NULL REFERENCES terminals(id),
  trip_no        BIGINT NOT NULL,
  vehicle_id     UUID,
  driver_id      UUID,
  owner_id       UUID,
  marshal_id     UUID,
  departure_id   UUID,
  taps           INTEGER NOT NULL,
  fare_cents     BIGINT NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'ZAR',
  first_tap_at   TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ NOT NULL,
  needs_review   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (terminal_id, trip_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_departure ON trips(departure_id) WHERE departure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id, completed_at DESC);

-- Every transfer between two users that the rules create (marshal fee, per-trip pay, weekly cash-basis amount, monthly salary).
-- 'ref' makes each one happen exactly once: it is also the idempotency reference of the ledger posting.
CREATE TABLE IF NOT EXISTS payment_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('marshal_fee','per_trip_pay','weekly_cash_payment','monthly_salary')),
  payer_id         UUID NOT NULL REFERENCES users(id),
  payee_id         UUID NOT NULL REFERENCES users(id),
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  remaining_cents  BIGINT NOT NULL CHECK (remaining_cents >= 0),
  currency         TEXT NOT NULL DEFAULT 'ZAR',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waiting','arrears','paid','failed','waived','needs_review')),
  ref              TEXT NOT NULL UNIQUE,
  trip_id          UUID,
  agreement_id     UUID,
  due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_items_open ON payment_items(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_payment_items_payer ON payment_items(payer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_items_payee ON payment_items(payee_id, created_at DESC);

-- What the association sets itself (the marshal fee per completed trip). Missing row = the country profile's default.
CREATE TABLE IF NOT EXISTS association_settings (
  association_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marshal_fee_cents  BIGINT CHECK (marshal_fee_cents >= 0),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Pooled bank accounts customers pay into (set by staff on the admin page; the bank accounts already exist) ───────────────
CREATE TABLE IF NOT EXISTS pooled_accounts (
  pool            TEXT NOT NULL CHECK (pool IN ('in_person','online')),
  currency        TEXT NOT NULL CHECK (currency IN ('ZAR','ZMW')),
  account_number  TEXT NOT NULL,
  holder          TEXT NOT NULL,
  bank            TEXT NOT NULL,
  account_type    TEXT NOT NULL CHECK (account_type IN ('Personal','Business')),
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool, currency)
);

-- ─── Virtual accounts: one payment reference per user, currency and pool ────────────────────────────────────────────────
-- Customers pay into a pooled bank account (the "in-person" or "online" channel account) quoting their own reference. A bank credit that quotes the
-- reference is matched to the user and credited to their platform account exactly once (bank_ref is the idempotency key). Anything that does not match
-- is kept as 'unmatched' for staff to resolve; nothing is guessed.
CREATE TABLE IF NOT EXISTS virtual_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency    TEXT NOT NULL CHECK (currency IN ('ZAR','ZMW')),
  pool        TEXT NOT NULL CHECK (pool IN ('in_person','online')),
  reference   TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency, pool)
);
CREATE TABLE IF NOT EXISTS pool_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_ref      TEXT NOT NULL UNIQUE,
  reference     TEXT NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL CHECK (currency IN ('ZAR','ZMW')),
  status        TEXT NOT NULL CHECK (status IN ('credited','unmatched','awaiting_clearing','reversed')),
  clearing      TEXT NOT NULL DEFAULT 'cleared' CHECK (clearing IN ('cleared','pending','bounced')),   -- 'pending': the bank reported the payment but it has not cleared yet
  instant       BOOLEAN NOT NULL DEFAULT false,                                                         -- credited before it cleared, from the instant-credit reserve
  reason        TEXT,
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pool_credits_status ON pool_credits(status, received_at DESC);

-- ─── Cross-border transfers (ZA <-> ZM) ─────────────────────────────────────────────────────────────────────────────────
-- A transfer is quoted at a rate staff have set (there is no FX feed), then confirmed within the quote's short life. Posting is two journals (one per
-- currency) with fixed references, so confirming again after a failure completes it instead of repeating it.
CREATE TABLE IF NOT EXISTS fx_rates (
  pair      TEXT PRIMARY KEY,                         -- e.g. ZAR-ZMW: how many ZMW for one ZAR
  rate      NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  set_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at    TIMESTAMPTZ NOT NULL DEFAULT now(),         -- when the rate was stored here
  source    TEXT NOT NULL DEFAULT 'manual',               -- 'manual' or the provider's name
  source_at TIMESTAMPTZ,                                  -- the provider's own timestamp for the rate
  auto      BOOLEAN NOT NULL DEFAULT false                -- true: fetched automatically
);
CREATE TABLE IF NOT EXISTS cross_border_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id        UUID NOT NULL REFERENCES users(id),
  recipient_id     UUID NOT NULL REFERENCES users(id),
  corridor         TEXT NOT NULL,
  send_cents       BIGINT NOT NULL CHECK (send_cents > 0),
  send_currency    TEXT NOT NULL,
  fee_cents        BIGINT NOT NULL CHECK (fee_cents >= 0),
  rate             NUMERIC(18,8) NOT NULL,
  receive_cents    BIGINT NOT NULL CHECK (receive_cents >= 0),
  receive_currency TEXT NOT NULL,
  rate_source      TEXT,
  status           TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted','posting','completed','expired','failed')),
  reason           TEXT,
  quote_expires_at TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_xb_sender ON cross_border_transfers(sender_id, created_at DESC);

-- ─── VINK tokens: the closed-loop points system ───────────────────────────────────────────────────────────────────────────────────────────────
-- Money received into the pooled bank account is held there and issued as tokens (1 token = 1 unit of the currency, kept in cents) to the payer's
-- wallet, matched by the payment reference (virtual_accounts). A passenger who taps pays in tokens: tokens move between wallets on the ledger and
-- NOTHING moves in the bank. Tokens leave the system only through the engine: to the holder's VINK bank account, or as a cash-out paid from the pool.
CREATE TABLE IF NOT EXISTS token_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency    TEXT NOT NULL CHECK (currency IN ('ZAR','ZMW')),
  role        TEXT NOT NULL CHECK (role IN ('passenger','driver','owner','marshal','association','investor')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  kyc_tier    TEXT NOT NULL DEFAULT 'basic' CHECK (kyc_tier IN ('basic','standard','full','business')),   -- set by staff once the holder's identity checks are done; decides the limits
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);
ALTER TABLE token_wallets ADD COLUMN IF NOT EXISTS kyc_tier TEXT NOT NULL DEFAULT 'basic';
-- A closed-loop VINK card is identified by its chip's UID. Only a hash is stored, with the last four characters to show the holder which card it is.
CREATE TABLE IF NOT EXISTS token_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id   UUID NOT NULL REFERENCES token_wallets(id) ON DELETE CASCADE,
  card_hash   TEXT NOT NULL UNIQUE,
  last4       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','lost')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The fare for each route an association runs (for example CATA's Langa routes). The device sends the route; the server decides the amount.
CREATE TABLE IF NOT EXISTS token_routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  fare_cents      BIGINT NOT NULL CHECK (fare_cents > 0),
  currency        TEXT NOT NULL DEFAULT 'ZAR',
  effective_from  DATE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (association_id, name)
);
-- Programme settings. The device fee (paid to the investor who sponsored the device) is per completed trip and still being negotiated, so it is a setting.
CREATE TABLE IF NOT EXISTS token_settings (
  scope            TEXT PRIMARY KEY,
  device_fee_cents BIGINT NOT NULL DEFAULT 100 CHECK (device_fee_cents >= 0),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- What the token service did for a holder, shown on their statement (top-ups come from pool_credits).
CREATE TABLE IF NOT EXISTS token_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL,
  counterparty  TEXT,
  ref           TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref, kind)
);
CREATE INDEX IF NOT EXISTS idx_token_events_user ON token_events(user_id, created_at DESC);
-- The holder's own DEBIT cards that money can be paid to. Only a provider token and what is safe to show are kept, never the card number.
-- A cash-out or refund is paid to a verified debit card of the holder, automatically, and to nothing else: not to a bank account, and not by hand.
CREATE TABLE IF NOT EXISTS token_payout_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand            TEXT NOT NULL CHECK (brand IN ('visa','mastercard')),
  last4            TEXT NOT NULL,
  expiry           TEXT NOT NULL,
  funding          TEXT NOT NULL DEFAULT 'debit',
  cardholder_name  TEXT NOT NULL,
  provider         TEXT NOT NULL,
  token            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified','needs_review','rejected','removed')),   -- needs_review: the name on the card does not match the account holder's
  review_note      TEXT,
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
-- Cash-outs and refunds: tokens move to a holding account, then the money is pushed to the holder's debit card by the system (never by hand).
-- requested = waiting for the (next) attempt, processing = sent to the card service and waiting for its answer, paid = on the card, rejected = the tokens went back.
CREATE TABLE IF NOT EXISTS token_cashouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  currency      TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  reason        TEXT NOT NULL DEFAULT 'cash_out' CHECK (reason IN ('cash_out','refund')),
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','paid','rejected')),
  card_id       UUID REFERENCES token_payout_cards(id),
  provider      TEXT,
  provider_ref  TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  attempted_at  TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  ref           TEXT NOT NULL UNIQUE,
  note          TEXT,
  requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_token_cashouts_open ON token_cashouts(status, requested_at);

-- ─── The VINK debit card: a Visa or Mastercard issued to a token holder, spending their TOKENS ──────────────────────────────────────────────────
-- The card is a virtual debit card issued through the issuing provider (the bundled sandbox issuer for now). When it is used the processor asks us to approve or
-- decline the purchase (/api/payments/issuer/authorisation); we approve only if the wallet holds the amount (and any ATM fee), and take the tokens at once. The amount
-- waits in the card settlement account until the sponsor bank settles with the card scheme. Only the provider's card id, brand, last4 and expiry are kept.
CREATE TABLE IF NOT EXISTS token_issued_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency          TEXT NOT NULL,
  provider          TEXT NOT NULL,
  provider_card_id  TEXT NOT NULL UNIQUE,
  brand             TEXT NOT NULL,
  last4             TEXT NOT NULL,
  expiry            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','blocked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS token_card_spend (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           UUID NOT NULL REFERENCES token_issued_cards(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  currency          TEXT NOT NULL,
  provider          TEXT NOT NULL,
  authorisation_id  TEXT NOT NULL,
  amount_cents      BIGINT NOT NULL,
  fee_cents         BIGINT NOT NULL DEFAULT 0,
  settled_at        TIMESTAMPTZ,                               -- when the sponsor bank's settlement file confirmed this purchase
  reversed_cents    BIGINT NOT NULL DEFAULT 0,                 -- how much of the amount has been returned by a reversal or refund (a partial one leaves the purchase approved)
  channel           TEXT NOT NULL,
  merchant          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('approved','declined','reversed')),
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, authorisation_id)
);
CREATE INDEX IF NOT EXISTS idx_token_card_spend_user ON token_card_spend(user_id, created_at DESC);

-- What the monitor has already told people, so a restart or a repeat check never sends the same alert twice.
CREATE TABLE IF NOT EXISTS ops_alert_state (
  code        TEXT PRIMARY KEY,
  severity    TEXT NOT NULL,
  message     TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  first_seen  TIMESTAMPTZ NOT NULL,
  last_sent   TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- The go-live gate: manual items a named person has confirmed, with where the evidence is.
CREATE TABLE IF NOT EXISTS go_live_checks (
  key               TEXT PRIMARY KEY,
  confirmed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by_name TEXT NOT NULL,
  confirmed_at      TIMESTAMPTZ NOT NULL,
  note              TEXT NOT NULL
);

-- Sponsor-bank settlement files and their lines, matched to token_card_spend (see services/schemeSettlement.ts).
CREATE TABLE IF NOT EXISTS card_settlement_files (
  id          UUID PRIMARY KEY,
  provider    TEXT NOT NULL,
  filename    TEXT NOT NULL,
  sha256      TEXT NOT NULL UNIQUE,
  line_count  INTEGER NOT NULL,
  matched     INTEGER,
  exceptions  INTEGER,
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS card_settlement_lines (
  id               UUID PRIMARY KEY,
  file_id          UUID NOT NULL REFERENCES card_settlement_files(id),
  provider         TEXT NOT NULL,
  authorisation_id TEXT NOT NULL,
  line_type        TEXT NOT NULL CHECK (line_type IN ('purchase','refund')),
  amount_cents     BIGINT NOT NULL,
  currency         TEXT NOT NULL,
  settled_on       DATE NOT NULL,
  reference        TEXT NOT NULL DEFAULT '',
  result           TEXT NOT NULL,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_note    TEXT,
  UNIQUE (provider, authorisation_id, line_type, reference)
);
CREATE INDEX IF NOT EXISTS idx_card_settlement_open ON card_settlement_lines(result) WHERE resolved_at IS NULL;

-- Visa or Mastercard debit cards come as virtual or physical. A physical card is ordered with a delivery address, sent to the holder, and only works once the holder
-- activates it (by confirming the last four digits printed on the card). Delivery details live apart from the card so they are shown to staff who dispatch it only.
ALTER TABLE token_issued_cards ADD COLUMN IF NOT EXISTS form TEXT NOT NULL DEFAULT 'virtual';
ALTER TABLE token_issued_cards ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS token_card_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       UUID NOT NULL UNIQUE REFERENCES token_issued_cards(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name_on_card  TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT NOT NULL,
  province      TEXT,
  postal_code   TEXT NOT NULL,
  country       TEXT NOT NULL,
  phone         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','shipped','activated')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  shipped_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  shipped_at    TIMESTAMPTZ,
  ship_note     TEXT,
  activated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_orders_open ON token_card_orders(status) WHERE status <> 'activated';
