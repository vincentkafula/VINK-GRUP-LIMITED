-- ═══════════════════════════════════════════════════════════════════════════════
-- VMS GROUP — PRODUCTION DATABASE SCHEMA
-- Migration: 001_initial_schema.sql
-- Description: Complete production schema for VMS banking, transport, and travel platform
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- for full-text search

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE kyc_status       AS ENUM ('not_started','pending','approved','rejected','expired');
CREATE TYPE aml_flag         AS ENUM ('clear','flagged','blocked','review');
CREATE TYPE account_tier     AS ENUM ('standard','premium','business','corporate');
CREATE TYPE app_status       AS ENUM ('pending','under_review','approved','declined','more_info_required','cancelled');
CREATE TYPE card_type        AS ENUM ('debit','virtual','business','sub_account','prepaid');
CREATE TYPE card_status      AS ENUM ('active','frozen','blocked','pending','expired');
CREATE TYPE card_network     AS ENUM ('visa','mastercard','unionpay');
CREATE TYPE currency_code    AS ENUM ('ZAR','USD','EUR','GBP','ZMW','CNY','AED','AUD','CAD');
CREATE TYPE txn_direction    AS ENUM ('credit','debit');
CREATE TYPE txn_status       AS ENUM ('completed','pending','declined','reversed','failed');
CREATE TYPE loan_status      AS ENUM ('draft','submitted','under_review','approved','active','settled','defaulted','rejected');
CREATE TYPE vehicle_status   AS ENUM ('active','inactive','maintenance','stolen','decommissioned');
CREATE TYPE driver_status    AS ENUM ('active','inactive','suspended','pending_docs');
CREATE TYPE trip_status      AS ENUM ('in_progress','completed','cancelled','disputed');
CREATE TYPE notification_type AS ENUM ('transaction','security','account','promotion','system','kyc','loan','travel');
CREATE TYPE booking_status   AS ENUM ('pending','confirmed','cancelled','completed','waitlisted');
CREATE TYPE visa_status      AS ENUM ('submitted','under_review','approved','rejected','additional_docs');
CREATE TYPE support_status   AS ENUM ('open','in_progress','resolved','closed','escalated');
CREATE TYPE support_priority AS ENUM ('low','normal','high','urgent','critical');

-- ─── PROFILES (extends Supabase auth.users) ─────────────────────────────────

CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  first_name          TEXT,
  last_name           TEXT,
  display_name        TEXT GENERATED ALWAYS AS (COALESCE(first_name || ' ' || last_name, email)) STORED,
  avatar_url          TEXT,
  id_number           TEXT,                    -- SA ID or passport
  date_of_birth       DATE,
  nationality         TEXT DEFAULT 'ZA',
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  province            TEXT,
  postal_code         TEXT,
  country             TEXT DEFAULT 'ZA',
  kyc_status          kyc_status DEFAULT 'not_started',
  aml_flag            aml_flag DEFAULT 'clear',
  account_tier        account_tier DEFAULT 'standard',
  popia_consent       BOOLEAN DEFAULT false,
  gdpr_consent        BOOLEAN DEFAULT false,
  marketing_consent   BOOLEAN DEFAULT false,
  two_factor_enabled  BOOLEAN DEFAULT false,
  language_pref       TEXT DEFAULT 'en',
  theme_pref          TEXT DEFAULT 'light',
  onboarding_complete BOOLEAN DEFAULT false,
  onboarding_step     INTEGER DEFAULT 0,
  referral_code       TEXT UNIQUE DEFAULT 'VMS-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  referred_by         TEXT,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BANK ACCOUNTS ───────────────────────────────────────────────────────────

CREATE TABLE bank_accounts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_number      TEXT UNIQUE NOT NULL DEFAULT 'VMS' || LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0'),
  account_type        TEXT NOT NULL,            -- 'everyday','student','premium','savings','business','corporate'
  account_name        TEXT NOT NULL,
  currency            currency_code DEFAULT 'ZAR',
  balance             DECIMAL(18,2) DEFAULT 0.00,
  available_balance   DECIMAL(18,2) DEFAULT 0.00,
  reserved_balance    DECIMAL(18,2) DEFAULT 0.00,
  overdraft_limit     DECIMAL(18,2) DEFAULT 0.00,
  status              TEXT DEFAULT 'active',    -- active, dormant, closed, frozen
  branch_code         TEXT DEFAULT '632005',    -- VMS default branch
  swift_code          TEXT DEFAULT 'VMSBZAJJ',
  interest_rate       DECIMAL(5,4) DEFAULT 0.0000,
  monthly_fee         DECIMAL(8,2) DEFAULT 0.00,
  is_primary          BOOLEAN DEFAULT false,
  opened_at           TIMESTAMPTZ DEFAULT NOW(),
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MULTI-CURRENCY WALLETS ───────────────────────────────────────────────────

CREATE TABLE currency_wallets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency            currency_code NOT NULL,
  balance             DECIMAL(18,4) DEFAULT 0.0000,
  reserved            DECIMAL(18,4) DEFAULT 0.0000,
  status              TEXT DEFAULT 'active',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id, currency)
);

-- ─── CARDS ────────────────────────────────────────────────────────────────────

CREATE TABLE cards (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id              UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_type               card_type NOT NULL,
  network                 card_network DEFAULT 'mastercard',
  masked_pan              TEXT NOT NULL,               -- •••• •••• •••• 4291
  last4                   CHAR(4) NOT NULL,
  expiry_month            CHAR(2) NOT NULL,
  expiry_year             CHAR(2) NOT NULL,
  name_on_card            TEXT NOT NULL,
  status                  card_status DEFAULT 'pending',
  currency                currency_code DEFAULT 'ZAR',
  daily_limit             DECIMAL(10,2) DEFAULT 5000.00,
  monthly_limit           DECIMAL(10,2) DEFAULT 50000.00,
  atm_limit               DECIMAL(10,2) DEFAULT 3000.00,
  spent_today             DECIMAL(10,2) DEFAULT 0.00,
  spent_this_month        DECIMAL(10,2) DEFAULT 0.00,
  atm_enabled             BOOLEAN DEFAULT true,
  online_enabled          BOOLEAN DEFAULT true,
  international_enabled   BOOLEAN DEFAULT false,
  contactless_enabled     BOOLEAN DEFAULT true,
  virtual_token           TEXT,                        -- tokenised PAN for Apple/Google Pay
  parent_card_id          UUID REFERENCES cards(id),
  delivery_address        TEXT,
  issued_at               TIMESTAMPTZ DEFAULT NOW(),
  activated_at            TIMESTAMPTZ,
  last_used_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES bank_accounts(id),
  card_id             UUID REFERENCES cards(id),
  direction           txn_direction NOT NULL,
  amount              DECIMAL(18,2) NOT NULL,
  currency            currency_code DEFAULT 'ZAR',
  billed_amount       DECIMAL(18,2),
  billed_currency     currency_code,
  fx_rate             DECIMAL(12,6),
  fx_fee              DECIMAL(10,2) DEFAULT 0.00,
  balance_after       DECIMAL(18,2),
  description         TEXT NOT NULL,
  merchant_name       TEXT,
  merchant_category   TEXT,
  merchant_country    TEXT,
  reference           TEXT,
  auth_code           TEXT,
  channel             TEXT,                            -- card_pos, card_online, atm, p2p, etc.
  status              txn_status DEFAULT 'completed',
  dispute_id          UUID,
  interchange_earned  DECIMAL(10,4) DEFAULT 0.0000,
  domestic_routing    BOOLEAN DEFAULT true,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ─── LOAN APPLICATIONS ────────────────────────────────────────────────────────

CREATE TABLE loan_applications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id),
  reference_number    TEXT UNIQUE NOT NULL,
  loan_type           TEXT NOT NULL,            -- personal, home, business, corporate
  product_name        TEXT NOT NULL,
  amount_requested    DECIMAL(18,2) NOT NULL,
  amount_approved     DECIMAL(18,2),
  term_months         INTEGER NOT NULL,
  interest_rate       DECIMAL(6,4),
  monthly_instalment  DECIMAL(12,2),
  purpose             TEXT,
  status              loan_status DEFAULT 'submitted',
  credit_score        INTEGER,
  dti_ratio           DECIMAL(5,2),             -- debt-to-income ratio
  collateral_type     TEXT,
  collateral_value    DECIMAL(18,2),
  form_data           JSONB DEFAULT '{}',
  documents           JSONB DEFAULT '[]',       -- [{key, filename, uploaded_at}]
  assigned_to         TEXT,
  review_notes        TEXT,
  disbursed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ACTIVE LOANS ─────────────────────────────────────────────────────────────

CREATE TABLE active_loans (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id            UUID REFERENCES loan_applications(id),
  account_id                UUID NOT NULL REFERENCES bank_accounts(id),
  profile_id                UUID NOT NULL REFERENCES profiles(id),
  principal                 DECIMAL(18,2) NOT NULL,
  outstanding_balance       DECIMAL(18,2) NOT NULL,
  monthly_instalment        DECIMAL(12,2) NOT NULL,
  interest_rate             DECIMAL(6,4) NOT NULL,
  term_months               INTEGER NOT NULL,
  months_remaining          INTEGER NOT NULL,
  next_payment_date         DATE NOT NULL,
  payments_made             INTEGER DEFAULT 0,
  payments_missed           INTEGER DEFAULT 0,
  total_interest_paid       DECIMAL(18,2) DEFAULT 0.00,
  total_principal_paid      DECIMAL(18,2) DEFAULT 0.00,
  status                    loan_status DEFAULT 'active',
  settled_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ─── APPLICATIONS (general — cards, accounts, SIM, insurance, investments) ───

CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID REFERENCES profiles(id),
  reference_number    TEXT UNIQUE NOT NULL,
  type                TEXT NOT NULL,            -- credit_card, account, sim, insurance, investment, rewards
  sub_type            TEXT,
  status              app_status DEFAULT 'pending',
  applicant_name      TEXT NOT NULL,
  applicant_email     TEXT NOT NULL,
  applicant_phone     TEXT,
  form_data           JSONB DEFAULT '{}',
  documents           JSONB DEFAULT '[]',
  assigned_to         TEXT,
  review_notes        TEXT,
  submitted_at        TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_applications_profile_id ON applications(profile_id);
CREATE INDEX idx_applications_status ON applications(status);

-- ─── KYC RECORDS ─────────────────────────────────────────────────────────────

CREATE TABLE kyc_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              kyc_status DEFAULT 'pending',
  tier                TEXT DEFAULT 'basic',     -- basic, enhanced, full
  document_type       TEXT,                     -- passport, national_id, drivers_licence
  document_number     TEXT,
  document_country    TEXT DEFAULT 'ZA',
  document_expiry     DATE,
  selfie_verified     BOOLEAN DEFAULT false,
  address_verified    BOOLEAN DEFAULT false,
  pep_screened        BOOLEAN DEFAULT false,
  sanctions_screened  BOOLEAN DEFAULT false,
  face_match_score    DECIMAL(5,2),
  submitted_at        TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT,
  expires_at          TIMESTAMPTZ,
  rejection_reason    TEXT,
  documents           JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                notification_type NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  action_url          TEXT,
  action_label        TEXT,
  icon                TEXT,                     -- emoji or icon name
  is_read             BOOLEAN DEFAULT false,
  is_archived         BOOLEAN DEFAULT false,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  read_at             TIMESTAMPTZ
);

CREATE INDEX idx_notifications_profile_id ON notifications(profile_id);
CREATE INDEX idx_notifications_is_read ON notifications(profile_id, is_read);

-- ─── AFC DEVICES ─────────────────────────────────────────────────────────────

CREATE TABLE afc_devices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_number       TEXT UNIQUE NOT NULL,
  imei                TEXT UNIQUE,
  vehicle_id          UUID,
  driver_id           UUID,
  owner_profile_id    UUID REFERENCES profiles(id),
  investor_profile_id UUID REFERENCES profiles(id),
  status              TEXT DEFAULT 'active',
  firmware_version    TEXT DEFAULT '3.2.1',
  monthly_rental_fee  DECIMAL(10,2) DEFAULT 250.00,
  last_ping_at        TIMESTAMPTZ,
  installed_at        TIMESTAMPTZ DEFAULT NOW(),
  decommissioned_at   TIMESTAMPTZ,
  location            JSONB,                    -- {lat, lng, address}
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VEHICLES ─────────────────────────────────────────────────────────────────

CREATE TABLE vehicles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_profile_id    UUID NOT NULL REFERENCES profiles(id),
  registration        TEXT UNIQUE NOT NULL,
  make                TEXT NOT NULL,
  model               TEXT NOT NULL,
  year                INTEGER NOT NULL,
  colour              TEXT,
  vin                 TEXT UNIQUE,
  engine_number       TEXT,
  vehicle_type        TEXT DEFAULT 'minibus',   -- minibus, sedan, suv, bus, truck
  passenger_capacity  INTEGER DEFAULT 15,
  status              vehicle_status DEFAULT 'active',
  afc_device_id       UUID REFERENCES afc_devices(id),
  current_driver_id   UUID,
  association_name    TEXT,
  route_name          TEXT,
  insurance_expiry    DATE,
  roadworthy_expiry   DATE,
  license_disc_expiry DATE,
  gps_tracking        BOOLEAN DEFAULT false,
  last_lat            DECIMAL(10,7),
  last_lng            DECIMAL(10,7),
  last_location_at    TIMESTAMPTZ,
  odometer_km         INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DRIVERS ─────────────────────────────────────────────────────────────────

CREATE TABLE drivers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_number           TEXT UNIQUE NOT NULL DEFAULT 'DRV-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0'),
  license_number          TEXT NOT NULL,
  license_type            TEXT DEFAULT 'C1',   -- B, C, C1, EB
  license_expiry          DATE,
  pdp_number              TEXT,                -- Professional Driving Permit
  pdp_expiry              DATE,
  status                  driver_status DEFAULT 'pending_docs',
  current_vehicle_id      UUID REFERENCES vehicles(id),
  association_name        TEXT,
  payment_model           TEXT DEFAULT 'target', -- salary, target
  daily_target            DECIMAL(10,2) DEFAULT 1200.00,
  monthly_target          DECIMAL(10,2) DEFAULT 26000.00,
  bank_account_id         UUID REFERENCES bank_accounts(id),
  rating                  DECIMAL(3,2) DEFAULT 0.00,
  total_trips             INTEGER DEFAULT 0,
  total_earnings          DECIMAL(18,2) DEFAULT 0.00,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AFC TAPS / TRIPS ─────────────────────────────────────────────────────────

CREATE TABLE afc_taps (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id           UUID NOT NULL REFERENCES afc_devices(id),
  driver_id           UUID REFERENCES drivers(id),
  vehicle_id          UUID REFERENCES vehicles(id),
  passenger_card      TEXT,                    -- masked PAN
  passenger_name      TEXT,                    -- from card name if available
  fare_amount         DECIMAL(10,2) NOT NULL,
  currency            currency_code DEFAULT 'ZAR',
  payment_method      TEXT DEFAULT 'card',     -- card, cash, wallet
  route_name          TEXT,
  auth_code           TEXT,
  processing_ms       INTEGER,                 -- sub-3000ms guarantee
  processing_path     TEXT,                    -- offline, online_fast, online_network
  status              TEXT DEFAULT 'approved', -- approved, declined, reversed
  -- Revenue split (auto-calculated)
  split_passenger     DECIMAL(8,2) DEFAULT 0.50,
  split_driver        DECIMAL(8,2) DEFAULT 0.50,
  split_vms           DECIMAL(8,2) DEFAULT 1.00,
  split_investor      DECIMAL(8,2) DEFAULT 0.10,
  split_association   DECIMAL(8,2) DEFAULT 0.00,
  split_marshall      DECIMAL(8,2) DEFAULT 0.00,
  trip_levy           DECIMAL(8,2) DEFAULT 0.00,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_afc_taps_driver_id ON afc_taps(driver_id);
CREATE INDEX idx_afc_taps_created_at ON afc_taps(created_at DESC);

-- ─── LEVY AGREEMENTS ─────────────────────────────────────────────────────────

CREATE TABLE levy_agreements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  association_name    TEXT NOT NULL,
  driver_id           UUID REFERENCES drivers(id),
  trip_levy_total     DECIMAL(8,2) DEFAULT 20.00,
  association_pct     DECIMAL(5,2) DEFAULT 70.00,
  marshall_pct        DECIMAL(5,2) DEFAULT 30.00,
  effective_from      DATE DEFAULT CURRENT_DATE,
  effective_to        DATE,
  status              TEXT DEFAULT 'active',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYSLIPS ─────────────────────────────────────────────────────────────────

CREATE TABLE payslips (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id               UUID NOT NULL REFERENCES drivers(id),
  profile_id              UUID NOT NULL REFERENCES profiles(id),
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  issue_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  period_type             TEXT DEFAULT 'monthly',
  -- Earnings
  fares_card              DECIMAL(12,2) DEFAULT 0.00,
  fares_cash              DECIMAL(12,2) DEFAULT 0.00,
  bonus                   DECIMAL(12,2) DEFAULT 0.00,
  total_gross             DECIMAL(12,2) DEFAULT 0.00,
  -- Deductions
  vehicle_rental          DECIMAL(12,2) DEFAULT 0.00,
  association_levy        DECIMAL(12,2) DEFAULT 0.00,
  insurance               DECIMAL(12,2) DEFAULT 0.00,
  paye                    DECIMAL(12,2) DEFAULT 0.00,
  uif                     DECIMAL(12,2) DEFAULT 0.00,
  other_deductions        DECIMAL(12,2) DEFAULT 0.00,
  total_deductions        DECIMAL(12,2) DEFAULT 0.00,
  net_pay                 DECIMAL(12,2) DEFAULT 0.00,
  trips_count             INTEGER DEFAULT 0,
  target_amount           DECIMAL(12,2),
  target_achieved         BOOLEAN,
  payment_model           TEXT DEFAULT 'target',
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CLUB TRAVEL ROUTES ───────────────────────────────────────────────────────

CREATE TABLE club_routes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                TEXT NOT NULL,            -- flight, bus
  origin              TEXT NOT NULL,
  destination         TEXT NOT NULL,
  origin_code         TEXT,
  destination_code    TEXT,
  operator_name       TEXT NOT NULL,
  departure_date      DATE NOT NULL,
  return_date         DATE,
  departure_time      TIME,
  return_time         TIME,
  duration_hours      DECIMAL(5,2),
  total_seats         INTEGER NOT NULL,
  seats_booked        INTEGER DEFAULT 0,
  member_price        DECIMAL(10,2) NOT NULL,
  retail_price        DECIMAL(10,2) NOT NULL,
  deposit_amount      DECIMAL(10,2) DEFAULT 0.00,
  currency            currency_code DEFAULT 'ZAR',
  status              TEXT DEFAULT 'open',      -- open, filling_fast, almost_full, full, closed
  includes            TEXT[],                   -- ['Checked baggage','Meals','Transfers']
  visa_required       BOOLEAN DEFAULT false,
  visa_countries      TEXT[],
  provider_paid       BOOLEAN DEFAULT false,
  description         TEXT,
  image_url           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CLUB BOOKINGS ────────────────────────────────────────────────────────────

CREATE TABLE club_bookings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id            UUID NOT NULL REFERENCES club_routes(id),
  profile_id          UUID REFERENCES profiles(id),
  reference_number    TEXT UNIQUE NOT NULL,
  passenger_name      TEXT NOT NULL,
  passenger_email     TEXT NOT NULL,
  passenger_phone     TEXT NOT NULL,
  id_passport         TEXT NOT NULL,
  seat_count          INTEGER NOT NULL DEFAULT 1,
  total_amount        DECIMAL(12,2) NOT NULL,
  currency            currency_code DEFAULT 'ZAR',
  payment_method      TEXT DEFAULT 'vink_wallet',
  status              booking_status DEFAULT 'confirmed',
  visa_required       BOOLEAN DEFAULT false,
  visa_status         visa_status,
  special_requests    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_club_bookings_route_id ON club_bookings(route_id);
CREATE INDEX idx_club_bookings_email ON club_bookings(passenger_email);

-- ─── VISA APPLICATIONS ────────────────────────────────────────────────────────

CREATE TABLE visa_applications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID REFERENCES club_bookings(id),
  profile_id          UUID REFERENCES profiles(id),
  reference_number    TEXT UNIQUE NOT NULL,
  destination_country TEXT NOT NULL,
  visa_type           TEXT NOT NULL,
  applicant_name      TEXT NOT NULL,
  applicant_email     TEXT NOT NULL,
  passport_number     TEXT NOT NULL,
  passport_expiry     DATE NOT NULL,
  travel_date         DATE NOT NULL,
  status              visa_status DEFAULT 'submitted',
  form_data           JSONB DEFAULT '{}',
  documents           JSONB DEFAULT '[]',
  review_notes        TEXT,
  submitted_at        TIMESTAMPTZ DEFAULT NOW(),
  decision_at         TIMESTAMPTZ
);

-- ─── FX RATES ─────────────────────────────────────────────────────────────────

CREATE TABLE fx_rates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency       currency_code NOT NULL,
  to_currency         currency_code NOT NULL,
  interbank_rate      DECIMAL(18,8) NOT NULL,
  customer_rate       DECIMAL(18,8) NOT NULL,
  spread_pct          DECIMAL(5,3) NOT NULL,
  source              TEXT DEFAULT 'internal',
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_currency, to_currency)
);

-- ─── CUSTOMER SUPPORT TICKETS ─────────────────────────────────────────────────

CREATE TABLE support_tickets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID REFERENCES profiles(id),
  ticket_number       TEXT UNIQUE NOT NULL DEFAULT 'TKT-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 7, '0'),
  subject             TEXT NOT NULL,
  description         TEXT NOT NULL,
  category            TEXT NOT NULL,            -- account, card, loan, technical, complaint, other
  priority            support_priority DEFAULT 'normal',
  status              support_status DEFAULT 'open',
  assigned_to         TEXT,
  first_response_at   TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SUPPORT MESSAGES ─────────────────────────────────────────────────────────

CREATE TABLE support_messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id           UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type         TEXT NOT NULL,            -- customer, agent, system
  sender_id           UUID,
  sender_name         TEXT NOT NULL,
  message             TEXT NOT NULL,
  attachments         JSONB DEFAULT '[]',
  is_internal         BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_support_messages_ticket_id ON support_messages(ticket_id);

-- ─── VINKPOINTS / REWARDS ─────────────────────────────────────────────────────

CREATE TABLE vinkpoints (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points_balance      INTEGER DEFAULT 0,
  points_lifetime     INTEGER DEFAULT 0,
  tier                TEXT DEFAULT 'bronze',   -- bronze, silver, gold, platinum
  tier_progress_pct   DECIMAL(5,2) DEFAULT 0.00,
  next_tier           TEXT DEFAULT 'silver',
  points_to_next_tier INTEGER DEFAULT 500,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id)
);

CREATE TABLE vinkpoints_transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id),
  points              INTEGER NOT NULL,
  type                TEXT NOT NULL,            -- earn, redeem, expire, bonus, referral
  description         TEXT NOT NULL,
  reference_id        UUID,                     -- linked transaction/booking
  balance_after       INTEGER NOT NULL,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PUSH NOTIFICATION SUBSCRIPTIONS ─────────────────────────────────────────

CREATE TABLE push_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint            TEXT NOT NULL,
  p256dh              TEXT NOT NULL,
  auth_key            TEXT NOT NULL,
  device_type         TEXT DEFAULT 'web',       -- web, ios, android
  device_name         TEXT,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id, endpoint)
);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID REFERENCES profiles(id),
  action              TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           UUID,
  old_values          JSONB,
  new_values          JSONB,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_profile_id ON audit_log(profile_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ─── INVESTOR PORTFOLIOS ─────────────────────────────────────────────────────

CREATE TABLE investor_portfolios (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id            UUID NOT NULL REFERENCES profiles(id),
  device_count          INTEGER DEFAULT 0,
  total_invested        DECIMAL(18,2) DEFAULT 0.00,
  total_earned          DECIMAL(18,2) DEFAULT 0.00,
  monthly_rental_income DECIMAL(12,2) DEFAULT 0.00,
  per_tap_income_30d    DECIMAL(12,2) DEFAULT 0.00,
  total_taps_30d        INTEGER DEFAULT 0,
  portfolio_value       DECIMAL(18,2) DEFAULT 0.00,
  roi_pct               DECIMAL(6,2) DEFAULT 0.00,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_loans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE afc_taps               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips               ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vinkpoints             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vinkpoints_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_portfolios    ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "profiles_own"    ON profiles    FOR ALL USING (auth.uid() = id);
CREATE POLICY "accounts_own"    ON bank_accounts FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "wallets_own"     ON currency_wallets FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "cards_own"       ON cards       FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "txns_own"        ON transactions FOR SELECT USING (
  auth.uid() = (SELECT profile_id FROM bank_accounts WHERE id = account_id)
);
CREATE POLICY "loans_own"       ON loan_applications FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "active_loans_own" ON active_loans FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "apps_own"        ON applications FOR ALL USING (auth.uid() = profile_id OR profile_id IS NULL);
CREATE POLICY "kyc_own"         ON kyc_records  FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "notifs_own"      ON notifications FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "drivers_own"     ON drivers      FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "payslips_own"    ON payslips     FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "bookings_own"    ON club_bookings FOR ALL USING (auth.uid() = profile_id OR profile_id IS NULL);
CREATE POLICY "visa_own"        ON visa_applications FOR ALL USING (auth.uid() = profile_id OR profile_id IS NULL);
CREATE POLICY "tickets_own"     ON support_tickets FOR ALL USING (auth.uid() = profile_id OR profile_id IS NULL);
CREATE POLICY "msgs_own"        ON support_messages FOR ALL USING (
  ticket_id IN (SELECT id FROM support_tickets WHERE profile_id = auth.uid())
);
CREATE POLICY "points_own"      ON vinkpoints   FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "points_txns_own" ON vinkpoints_transactions FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "push_own"        ON push_subscriptions FOR ALL USING (auth.uid() = profile_id);
CREATE POLICY "investor_own"    ON investor_portfolios FOR ALL USING (auth.uid() = profile_id);

-- Club routes and FX rates are publicly readable
CREATE POLICY "routes_read"   ON club_routes  FOR SELECT USING (true);
CREATE POLICY "fx_rates_read" ON fx_rates     FOR SELECT USING (true);

-- ─── FUNCTIONS & TRIGGERS ─────────────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at         BEFORE UPDATE ON profiles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bank_accounts_updated_at    BEFORE UPDATE ON bank_accounts     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cards_updated_at            BEFORE UPDATE ON cards             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_loan_apps_updated_at        BEFORE UPDATE ON loan_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_applications_updated_at     BEFORE UPDATE ON applications      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_club_routes_updated_at      BEFORE UPDATE ON club_routes       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_club_bookings_updated_at    BEFORE UPDATE ON club_bookings     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_support_tickets_updated_at  BEFORE UPDATE ON support_tickets   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vinkpoints_updated_at       BEFORE UPDATE ON vinkpoints        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated_at         BEFORE UPDATE ON vehicles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_drivers_updated_at          BEFORE UPDATE ON drivers           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  -- Create initial VinkPoints record
  INSERT INTO vinkpoints (profile_id) VALUES (NEW.id) ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update club route seat count when booking added
CREATE OR REPLACE FUNCTION update_route_seats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE club_routes SET seats_booked = seats_booked + NEW.seat_count WHERE id = NEW.route_id;
    -- Update status based on fill
    UPDATE club_routes SET status =
      CASE
        WHEN (seats_booked::FLOAT / total_seats) >= 1.0    THEN 'full'
        WHEN (seats_booked::FLOAT / total_seats) >= 0.9    THEN 'almost_full'
        WHEN (seats_booked::FLOAT / total_seats) >= 0.7    THEN 'filling_fast'
        ELSE 'open'
      END
    WHERE id = NEW.route_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_route_seats
  AFTER INSERT ON club_bookings
  FOR EACH ROW EXECUTE FUNCTION update_route_seats();

-- Auto-create notification on transaction
CREATE OR REPLACE FUNCTION notify_on_transaction()
RETURNS TRIGGER AS $$
DECLARE v_profile_id UUID;
BEGIN
  SELECT profile_id INTO v_profile_id FROM bank_accounts WHERE id = NEW.account_id;
  IF v_profile_id IS NOT NULL THEN
    INSERT INTO notifications (profile_id, type, title, body, icon, metadata)
    VALUES (
      v_profile_id,
      'transaction',
      CASE WHEN NEW.direction = 'credit' THEN 'Money Received' ELSE 'Payment Made' END,
      CASE WHEN NEW.direction = 'credit'
        THEN 'R' || TO_CHAR(NEW.amount, 'FM999,999,990.00') || ' credited to your account'
        ELSE 'R' || TO_CHAR(NEW.amount, 'FM999,999,990.00') || ' — ' || COALESCE(NEW.description, 'Payment')
      END,
      CASE WHEN NEW.direction = 'credit' THEN '💸' ELSE '💳' END,
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount, 'direction', NEW.direction)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION notify_on_transaction();

-- ─── ENABLE REALTIME ─────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE club_routes;
ALTER PUBLICATION supabase_realtime ADD TABLE afc_taps;

-- ─── SEED: FX RATES ──────────────────────────────────────────────────────────

INSERT INTO fx_rates (from_currency, to_currency, interbank_rate, customer_rate, spread_pct) VALUES
  ('ZAR','USD',0.054500,0.054000,0.920),
  ('ZAR','EUR',0.050200,0.049700,0.996),
  ('ZAR','GBP',0.043100,0.042600,1.160),
  ('ZAR','CNY',0.395000,0.391000,1.013),
  ('ZAR','ZMW',1.482000,1.467300,0.992),
  ('ZAR','AED',0.200100,0.198100,1.000),
  ('USD','ZAR',18.350000,18.170000,0.980),
  ('USD','EUR',0.921000,0.911800,0.999),
  ('USD','GBP',0.791000,0.783100,0.999),
  ('USD','CNY',7.248000,7.175200,1.005),
  ('EUR','USD',1.086000,1.075100,1.005),
  ('EUR','ZAR',19.930000,19.730000,1.004),
  ('GBP','ZAR',23.200000,22.968000,1.000),
  ('CNY','ZAR',2.532000,2.506600,1.003),
  ('AED','ZAR',4.997000,4.947000,1.001)
ON CONFLICT (from_currency, to_currency) DO NOTHING;

-- ─── SEED: CLUB ROUTES ────────────────────────────────────────────────────────

INSERT INTO club_routes (type, origin, destination, origin_code, destination_code, operator_name, departure_date, return_date, departure_time, total_seats, seats_booked, member_price, retail_price, status, visa_required, includes, description) VALUES
  ('flight','Cape Town','New York','CPT','JFK','Emirates / codeshare','2026-07-15','2026-09-15','10:30',40,14,18500.00,27000.00,'filling_fast',true,'{"Return flight","23kg checked baggage","Meals included","Airport transfers"}','VMS Club deal — Cape Town to New York return. Pre-negotiated group rate with Emirates. Book your seat now and pay only R3,000 deposit.'),
  ('flight','Cape Town','London','CPT','LHR','British Airways','2026-07-20','2026-08-30','08:15',35,8,14800.00,22000.00,'open',true,'{"Return flight","23kg baggage","Meals","City transfer"}','Direct group booking on British Airways. Secure your seat with just R2,500 deposit.'),
  ('flight','Cape Town','Dubai','CPT','DXB','Emirates','2026-08-01','2026-08-21','22:45',50,22,9200.00,14500.00,'filling_fast',false,'{"Return flight","30kg baggage","Meals","Hotel transfers"}','Emirates group deal — Cape Town to Dubai return. No visa required for SA passport holders.'),
  ('bus','Cape Town','Pretoria','CPT','PRY','Intercape / VMS Charter','2026-07-15','2026-09-15','07:00',55,31,890.00,1400.00,'filling_fast',false,'{"Luxury coach","Onboard refreshments","WiFi","USB charging","1 luggage"}','VMS charter luxury coach. Departs Cape Town (Bellville terminal) 07:00, arrives Pretoria 22:00.'),
  ('bus','Cape Town','Johannesburg','CPT','JHB','Greyhound / VMS','2026-07-15','2026-09-15','06:30',60,19,750.00,1200.00,'open',false,'{"Luxury coach","Refreshments","WiFi","USB charging"}','Cape Town to Johannesburg (Park Station). Departs 06:30, arrives 20:30.'),
  ('bus','Cape Town','Durban','CPT','DUR','VMS Luxury Coach','2026-07-20','2026-09-01','05:00',50,12,1050.00,1600.00,'open',false,'{"Luxury coach","Meals","WiFi","USB charging","Blanket pillow"}','Cape Town to Durban along the Garden Route. Scenic 18-hour journey with meal stops.')
ON CONFLICT DO NOTHING;
