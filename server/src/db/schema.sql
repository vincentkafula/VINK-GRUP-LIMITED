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
