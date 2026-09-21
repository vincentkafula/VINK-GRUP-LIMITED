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


-- Percentage-based fee, unlike terminal_taps' flat R1.00 -- vink_fee_amount
-- and merchant_settlement are both stored explicitly at the moment of
-- the transaction (not just the rate), same discipline terminal_taps'
-- own comment explains: a later change to VINK_FEE_PCT shouldn't
-- retroactively change historical records.

-- MDM history for retail terminals, mirroring device_status_reports /
-- device_faults exactly -- deliberately separate tables rather than
-- reusing the taxi ones directly, since retail_terminals and terminals
-- are different tables with different FKs.


-- ── Till/POS System: Products, Sales, Line Items ──────────────────────────────
-- A genuinely separate, broader system from retail_terminals above
-- (which is card-payment-acceptance only) -- a till handles the full
-- checkout flow: a product catalog, a sale that can contain multiple
-- items, and a payment that's either cash (no VINK fee, the full
-- amount is the merchant's) or card (2.5% VINK fee, same
-- retailRevenueSplitService.ts calculation already proven for retail
-- POS, reused here rather than reimplemented). Connects to the same
-- real banking system the same way every other role in this schema
-- does: merchant_id references retail_merchants, which already
-- references the real users(id) banking account.


-- vink_fee_amount and merchant_settlement are 0/full-amount for cash,
-- and the real 2.5%-derived split for card -- stored explicitly either
-- way at the moment of the sale, same discipline every other
-- transaction table in this schema already uses (a later fee-policy
-- change shouldn't retroactively alter historical records).


-- MDM history for till terminals, mirroring retail_device_status_reports
-- / retail_device_faults exactly, same reasoning: a status heartbeat
-- and a fault report are different event types, kept as their own
-- tables per device fleet rather than one shared table across three
-- different terminal types with different FKs.


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


