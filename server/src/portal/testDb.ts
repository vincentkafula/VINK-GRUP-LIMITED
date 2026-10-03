import { randomUUID } from "node:crypto";
import { newDb, DataType } from "pg-mem";
import type { Db } from "./driverRoutes.js";

/** In-memory Postgres (pg-mem) with the tables the transport portals use, mirroring db/schema.sql. For tests only. */
export function allPortalsDb(): Db {
  const mem = newDb();
  mem.public.registerFunction({ name: "gen_random_uuid", returns: DataType.uuid, implementation: () => randomUUID(), impure: true });
  mem.public.none(`
    CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT, name TEXT, email TEXT, role TEXT);
    CREATE TABLE vehicles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID, registration TEXT UNIQUE NOT NULL, make TEXT, model TEXT, year INTEGER, colour TEXT, seats INTEGER, disc_expiry DATE, driver_id UUID, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE terminals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), serial TEXT UNIQUE NOT NULL, api_key_hash TEXT NOT NULL DEFAULT 'x', status TEXT NOT NULL DEFAULT 'active', assigned_driver TEXT, registered_by TEXT, last_seen_at TIMESTAMPTZ, registered_at TIMESTAMPTZ NOT NULL DEFAULT now(), driver_id UUID, vehicle_id UUID, owner_id UUID, investor_id UUID, association_id UUID);
    CREATE TABLE vehicle_routes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), terminal_id UUID NOT NULL, association_id UUID, name TEXT NOT NULL, tolerance_meters NUMERIC(8,2) NOT NULL DEFAULT 200, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE route_waypoints (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), route_id UUID NOT NULL, sequence INTEGER NOT NULL, lat NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL);
    CREATE TABLE terminal_taps (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), terminal_id UUID NOT NULL, masked_pan TEXT, scheme TEXT, amount NUMERIC(12,2) NOT NULL, currency TEXT NOT NULL DEFAULT 'ZAR', status TEXT NOT NULL DEFAULT 'received', vink_fee_device NUMERIC(10,2), vink_fee_card NUMERIC(10,2), owner_settlement NUMERIC(10,2), investor_share NUMERIC(10,2), received_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE vehicle_positions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), terminal_id UUID NOT NULL, lat NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE route_violations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), terminal_id UUID NOT NULL, route_id UUID NOT NULL, position_id UUID NOT NULL, distance_from_route_m NUMERIC(10,2) NOT NULL, fine_amount NUMERIC(10,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE driver_ledger (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), driver_id UUID NOT NULL, amount NUMERIC(10,2) NOT NULL, balance_after NUMERIC(10,2) NOT NULL, reference_id UUID, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE driver_profiles (user_id UUID PRIMARY KEY, phone TEXT, licence_number TEXT, licence_code TEXT, licence_expiry DATE, pdp_number TEXT, pdp_expiry DATE, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE notification_reads (user_id UUID NOT NULL, key TEXT NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, key));
    CREATE TABLE memberships (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), association_id UUID NOT NULL, member_id UUID NOT NULL, member_role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), responded_at TIMESTAMPTZ, UNIQUE (association_id, member_id));
    CREATE TABLE owner_drivers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL, driver_id UUID NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), responded_at TIMESTAMPTZ, UNIQUE (owner_id, driver_id));
    CREATE TABLE ranks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), association_id UUID NOT NULL, name TEXT NOT NULL, location TEXT, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (association_id, name));
    CREATE TABLE rank_marshals (rank_id UUID NOT NULL, marshal_id UUID NOT NULL, PRIMARY KEY (rank_id, marshal_id));
    CREATE TABLE rank_queue (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rank_id UUID NOT NULL, vehicle_id UUID NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), left_at TIMESTAMPTZ);
    CREATE TABLE departures (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rank_id UUID NOT NULL, vehicle_id UUID NOT NULL, driver_id UUID, marshal_id UUID NOT NULL, passengers INTEGER, note TEXT, departed_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE levies (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), association_id UUID NOT NULL, member_id UUID NOT NULL, title TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, due_date DATE, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE compliance_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL, vehicle_id UUID, kind TEXT NOT NULL, reference TEXT, expires_on DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE personal_profiles (user_id UUID PRIMARY KEY, phone TEXT, home_area TEXT, favourite_route TEXT, emergency_contact_name TEXT, emergency_contact_phone TEXT, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor_id UUID, actor_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE association_ledger (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), association_id UUID NOT NULL, amount NUMERIC(10,2) NOT NULL, balance_after NUMERIC(10,2) NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE device_faults (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), terminal_id UUID NOT NULL, fault_code TEXT NOT NULL, resolved BOOLEAN NOT NULL DEFAULT false, reported_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE support_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  `);
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Db;
}
