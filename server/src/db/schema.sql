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

-- ── Marketplace ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mkt_categories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  icon          TEXT,
  parent_id     TEXT REFERENCES mkt_categories(id),
  featured      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS mkt_sellers (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  store_name      TEXT NOT NULL,
  store_slug      TEXT UNIQUE NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  email           TEXT,
  phone           TEXT,
  country         TEXT DEFAULT 'ZA',
  status          TEXT NOT NULL DEFAULT 'active',
  kyc_verified    BOOLEAN NOT NULL DEFAULT false,
  tax_id          TEXT,
  total_sales     INTEGER NOT NULL DEFAULT 0,
  total_revenue   NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_rating      NUMERIC(2,1) NOT NULL DEFAULT 0,
  review_count    INTEGER NOT NULL DEFAULT 0,
  commission_pct  NUMERIC(4,1) NOT NULL DEFAULT 8,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Structured data from the seller application wizard (steps 1-8: seller
  -- type, personal info, KYC identity fields, address, business info, tax
  -- info). Document *uploads* referenced in the wizard are NOT stored here
  -- or anywhere else — this demo doesn't have a secure document storage /
  -- licensed KYC pipeline, so only the structured text fields persist.
  application_data JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE mkt_sellers ADD COLUMN IF NOT EXISTS application_data JSONB NOT NULL DEFAULT '{}';

-- ─── Seller KYC verification (provider-agnostic result ledger) ─────────────
-- Deliberately stores ONLY the verification outcome, never document
-- content or a pointer to a locally-stored copy of one. document_types_
-- submitted records WHICH kinds of documents were sent (e.g. 'id_front',
-- 'selfie') for audit purposes — not the documents themselves. This is the
-- POPIA-relevant design decision: raw ID/selfie/proof-of-address images
-- pass through this backend in memory only (see kycRouter.ts, multer
-- memory storage) on their way to whichever licensed provider is
-- configured, and are never written to this database or disk. If a future
-- provider explicitly requires VINK to retain a copy, that needs its own
-- deliberate, encrypted-at-rest column added at that point — not assumed
-- or built defensively now for a requirement that may not exist.
CREATE TABLE IF NOT EXISTS seller_kyc_verifications (
  id                        TEXT PRIMARY KEY,
  seller_id                 TEXT NOT NULL REFERENCES mkt_sellers(id) ON DELETE CASCADE,
  provider                  TEXT,                          -- null until a real provider is configured
  provider_ref              TEXT,                           -- the provider's own verification/job ID
  status                    TEXT NOT NULL DEFAULT 'not_submitted', -- not_submitted | submitted | verified | rejected
  document_types_submitted  TEXT[] NOT NULL DEFAULT '{}',
  rejection_reason          TEXT,
  submitted_at              TIMESTAMPTZ,
  verified_at               TIMESTAMPTZ,
  webhook_received_at       TIMESTAMPTZ,                    -- idempotency marker, same pattern as vinkpay_transactions
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_seller ON seller_kyc_verifications(seller_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_provider_ref ON seller_kyc_verifications(provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- Same CREATE TABLE IF NOT EXISTS no-op issue as vinkpay_transactions below
-- (this table's own comment already notes they share the same pattern) --
-- explicit ALTER needed for this to actually land on a database where this
-- table already existed before webhook_received_at was added.
ALTER TABLE seller_kyc_verifications ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;

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
-- Unlike seller_kyc_verifications, documents here ARE meant to be retained
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


CREATE TABLE IF NOT EXISTS mkt_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           TEXT NOT NULL REFERENCES mkt_sellers(id),
  category_id         TEXT NOT NULL REFERENCES mkt_categories(id),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  short_description   TEXT,
  description         TEXT,
  price               NUMERIC(12,2) NOT NULL,
  compare_at_price    NUMERIC(12,2),
  currency            TEXT NOT NULL DEFAULT 'ZAR',
  images              JSONB NOT NULL DEFAULT '[]',
  emoji               TEXT,
  status              TEXT NOT NULL DEFAULT 'active', -- active | pending_review | inactive
  stock               INTEGER NOT NULL DEFAULT 0,
  sku                 TEXT,
  brand               TEXT,
  tags                JSONB NOT NULL DEFAULT '[]',
  attributes          JSONB NOT NULL DEFAULT '{}',
  variants            JSONB NOT NULL DEFAULT '[]',
  avg_rating          NUMERIC(2,1) NOT NULL DEFAULT 0,
  review_count        INTEGER NOT NULL DEFAULT 0,
  total_sold          INTEGER NOT NULL DEFAULT 0,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  is_flash_deal       BOOLEAN NOT NULL DEFAULT false,
  flash_deal_ends_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_products_category ON mkt_products(category_id);
CREATE INDEX IF NOT EXISTS idx_mkt_products_seller   ON mkt_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_products_status    ON mkt_products(status);

CREATE TABLE IF NOT EXISTS mkt_coupons (
  code               TEXT PRIMARY KEY,
  type               TEXT NOT NULL, -- percentage | fixed_amount | free_shipping
  value              NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount_amount NUMERIC(10,2),
  active             BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS mkt_carts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT UNIQUE NOT NULL,
  items            JSONB NOT NULL DEFAULT '[]',
  coupon_code      TEXT REFERENCES mkt_coupons(code),
  coupon_discount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping         NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax              NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        TEXT UNIQUE NOT NULL,
  user_id             TEXT NOT NULL,
  customer_name       TEXT,
  customer_email      TEXT,
  items               JSONB NOT NULL DEFAULT '[]',
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'ZAR',
  status              TEXT NOT NULL DEFAULT 'pending',
  payment_status      TEXT NOT NULL DEFAULT 'pending',
  payment_method      TEXT,
  shipping_address    JSONB,
  shipping_status     TEXT NOT NULL DEFAULT 'not_shipped',
  tracking_number     TEXT,
  carrier             TEXT,
  estimated_delivery  TIMESTAMPTZ,
  coupon_code         TEXT,
  notes               TEXT,
  placed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  shipped_at          TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mkt_orders_user   ON mkt_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_orders_status ON mkt_orders(status);

-- The table above may already exist on a live database from before VinkPay
-- existed, with payment_status defaulting to 'paid' — CREATE TABLE IF NOT
-- EXISTS is a no-op against an existing table, so that unsafe default needs
-- fixing explicitly. Safe to run on every boot: ALTER COLUMN SET DEFAULT is
-- idempotent, and this only changes the default for future inserts — it
-- deliberately does not touch the payment_status of orders already placed.
--
-- Explicit state machine (replaces the earlier 'pending'/'paid'/'failed'):
-- pending_payment -> payment_confirmed | payment_failed. payment_confirmed
-- is only ever set by the verified webhook handler or the reconciliation
-- job calling verifyTransaction — never by the order-submission endpoint.
ALTER TABLE mkt_orders ALTER COLUMN payment_status SET DEFAULT 'pending_payment';

-- ─── VinkPay: processor-agnostic payment ledger ─────────────────────────────
-- Every attempt VinkPay makes to charge an order, regardless of which
-- underlying processor (Visa, Mastercard, or a future one) actually handled
-- it. This is the real audit trail — mkt_orders.payment_status reflects the
-- current state, this table records every attempt that led there.
CREATE TABLE IF NOT EXISTS vinkpay_transactions (
  id              TEXT PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES mkt_orders(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  processor       TEXT NOT NULL,          -- 'visa' | 'mastercard'
  payment_method  TEXT NOT NULL,          -- 'card' | 'bank_transfer'
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'ZAR',
  status          TEXT NOT NULL,          -- 'submitted' | 'confirmed' | 'failed'
  processor_ref   TEXT,                   -- the processor's own transaction/reference ID — VinkPay's stable internal id is `id` above, which stays constant across a future processor migration even though processor_ref would not
  error_message   TEXT,
  webhook_received_at TIMESTAMPTZ,        -- set only once, by the first webhook delivery — the idempotency marker
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vinkpay_order ON vinkpay_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_vinkpay_status ON vinkpay_transactions(status);
-- Same issue as job_applications above: CREATE TABLE IF NOT EXISTS is a
-- no-op against a table that already existed in production before this
-- column was added to the definition -- webhook_received_at needs its own
-- explicit ALTER to actually land on an already-deployed database, not
-- just a freshly-created one. This is the real cause of the production
-- error "column t.webhook_received_at does not exist" in the
-- reconciliation job (vinkPay.ts) once this table already existed live.
ALTER TABLE vinkpay_transactions ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;
-- One processor_ref should only ever correspond to one VinkPay transaction
-- row — this constraint is the actual backstop for webhook idempotency,
-- not just the application-level check before it. NULLs (a submission that
-- never got a processor_ref back at all) are allowed to repeat, since
-- Postgres treats NULLs as distinct in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vinkpay_processor_ref ON vinkpay_transactions(processor, processor_ref) WHERE processor_ref IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS news_articles (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  category        TEXT NOT NULL,
  author          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  body            TEXT NOT NULL,
  tags            JSONB NOT NULL DEFAULT '[]',
  hero_gradient   TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#0B5C2E,#128A43)',
  emoji           TEXT NOT NULL DEFAULT '📰',
  read_minutes    INTEGER NOT NULL DEFAULT 4,
  featured        BOOLEAN NOT NULL DEFAULT false,
  breaking        BOOLEAN NOT NULL DEFAULT false,
  views           INTEGER NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
-- Editorial workflow: content-creator roles (Reporter, Section Editor, etc.)
-- submit pending_review, only editorial leadership (General Manager,
-- Editor-in-Chief, Managing Editor) can move something to published.
-- Existing seeded articles all default to 'published' so the public
-- news viewer's existing behavior (which only ever queries published
-- content) doesn't change for anything already in the table.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_news_status ON news_articles(status);

-- Hero image: stored the same way job application documents are (base64
-- in the row, no object storage configured yet) -- reasonable at current
-- volume, real object storage (S3/GCS/Cloudinary) is the natural next
-- step if this needs to scale to a lot of large images.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS hero_image_data TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS hero_image_mime_type TEXT;

-- Scheduling: 'scheduled' joins the existing status values. A background
-- job (see startScheduledPublishJob in news.ts) flips scheduled articles
-- to 'published' once scheduled_at arrives.
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_news_scheduled ON news_articles(scheduled_at) WHERE status = 'scheduled';

-- SEO / discovery metadata, and tracking whether views should be counted
-- (kept simple -- a real analytics pipeline is out of scope here).
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS meta_description TEXT;

CREATE TABLE IF NOT EXISTS mkt_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES mkt_products(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL,
  order_id            TEXT,
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title               TEXT,
  body                TEXT,
  verified_purchase   BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'approved',
  helpful             INTEGER NOT NULL DEFAULT 0,
  images              JSONB NOT NULL DEFAULT '[]',
  reviewer_name       TEXT DEFAULT 'Verified Buyer',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_product ON mkt_reviews(product_id);

CREATE TABLE IF NOT EXISTS mkt_wishlist_items (
  user_id      TEXT NOT NULL,
  product_id   UUID NOT NULL REFERENCES mkt_products(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS mkt_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  label         TEXT DEFAULT 'Home',
  first_name    TEXT,
  last_name     TEXT,
  line1         TEXT,
  line2         TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'ZA',
  phone         TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mkt_addresses_user ON mkt_addresses(user_id);

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
ALTER TABLE vinkpay_transactions ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_vinkpay_card_fingerprint ON vinkpay_transactions(card_fingerprint) WHERE card_fingerprint IS NOT NULL;

-- ─── AFC Terminal Registration & Tap Ingestion ──────────────────────────────
-- A "terminal" is a physical device (P18Q bus validator or equivalent)
-- authorized to submit tap events. Deliberately NOT authenticated with a
-- user JWT -- the caller is a device, not a logged-in person, so it gets
-- its own credential (api_key_hash), same reasoning as vinkpayWebhook.ts
-- not using requireAuth for processor callbacks. api_key itself is never
-- stored -- only its hash, same as password_hash on users -- issued once
-- at registration time and shown to the operator exactly once.
CREATE TABLE IF NOT EXISTS terminals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial          TEXT UNIQUE NOT NULL,
  model           TEXT NOT NULL DEFAULT 'P18Q Bus Validator',
  api_key_hash    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','revoked')),
  assigned_driver TEXT,                    -- free-text label for now (driver name/id); not a FK, since there's no drivers table yet in this schema
  -- Real ownership-chain references, added for multi-party revenue
  -- splitting (2026-08-18): who actually gets paid for taps on this
  -- specific device. All nullable -- a terminal can be registered
  -- before these are assigned, and the split calculation treats an
  -- unassigned party as "nothing withheld for them" rather than
  -- failing the whole tap. driver_id is separate from the older
  -- assigned_driver text field above (kept as-is for backward
  -- compatibility with existing code) since the split logic needs a
  -- real users.id to credit, not a free-text label.
  investor_id     UUID REFERENCES users(id),
  owner_id        UUID REFERENCES users(id),
  driver_id       UUID REFERENCES users(id),
  association_id  UUID REFERENCES users(id), -- not used in the per-tap split itself (association fees are a separate flat monthly charge, not a per-tap cut) -- stored here for reporting/filtering by association's fleet
  registered_by   TEXT,                    -- username of the admin who provisioned it
  last_seen_at    TIMESTAMPTZ,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  vinkpay_transaction_id TEXT REFERENCES vinkpay_transactions(id), -- set once this tap is submitted into the existing VinkPay settlement flow
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

-- A genuinely new concept: regular per-tap driver pay is deliberately
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

