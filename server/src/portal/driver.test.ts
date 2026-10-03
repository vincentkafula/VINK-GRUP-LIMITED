import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { newDb } from "pg-mem";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createDriverRouter, cleanProfile, expiryReminders, saPeriods, type Db } from "./driverRoutes.js";
import { seedDriverDemo } from "./driverDemoSeed.js";

const NOW = new Date("2026-10-07T10:00:00Z");          // a Wednesday, 12:00 in South Africa
const D1 = "11111111-1111-1111-1111-111111111111", D2 = "22222222-2222-2222-2222-222222222222";

function freshDb(): Db {
  const mem = newDb();
  mem.public.none(`
    CREATE TABLE users (id UUID PRIMARY KEY, username TEXT, name TEXT, email TEXT, role TEXT);
    CREATE TABLE vehicles (id UUID PRIMARY KEY, owner_id UUID, registration TEXT UNIQUE NOT NULL, make TEXT, model TEXT, year INTEGER, colour TEXT, seats INTEGER, disc_expiry DATE, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE terminals (id UUID PRIMARY KEY, serial TEXT UNIQUE NOT NULL, api_key_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', assigned_driver TEXT, registered_by TEXT, last_seen_at TIMESTAMPTZ, registered_at TIMESTAMPTZ NOT NULL DEFAULT now(), driver_id UUID, vehicle_id UUID);
    CREATE TABLE vehicle_routes (id UUID PRIMARY KEY, terminal_id UUID NOT NULL, name TEXT NOT NULL, tolerance_meters NUMERIC(8,2) NOT NULL DEFAULT 200, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE route_waypoints (id UUID PRIMARY KEY, route_id UUID NOT NULL, sequence INTEGER NOT NULL, lat NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL);
    CREATE TABLE terminal_taps (id UUID PRIMARY KEY, terminal_id UUID NOT NULL, masked_pan TEXT, scheme TEXT, amount NUMERIC(12,2) NOT NULL, currency TEXT NOT NULL DEFAULT 'ZAR', status TEXT NOT NULL DEFAULT 'received', received_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE vehicle_positions (id UUID PRIMARY KEY, terminal_id UUID NOT NULL, lat NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE route_violations (id UUID PRIMARY KEY, terminal_id UUID NOT NULL, route_id UUID NOT NULL, position_id UUID NOT NULL, distance_from_route_m NUMERIC(10,2) NOT NULL, fine_amount NUMERIC(10,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE driver_ledger (id UUID PRIMARY KEY, driver_id UUID NOT NULL, amount NUMERIC(10,2) NOT NULL, balance_after NUMERIC(10,2) NOT NULL, reference_id UUID, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE driver_profiles (user_id UUID PRIMARY KEY, phone TEXT, licence_number TEXT, licence_code TEXT, licence_expiry DATE, pdp_number TEXT, pdp_expiry DATE, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE notification_reads (user_id UUID NOT NULL, key TEXT NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, key));
    INSERT INTO users VALUES ('${D1}','driver1','Dee One','d1@x.test','driver'), ('${D2}','driver2','Dee Two','d2@x.test','driver');
  `);
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Db;
}

const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", T2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", V1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
async function populate(db: Db) {
  await db.query(`INSERT INTO vehicles (id, registration, make, model, year, colour, seats, disc_expiry) VALUES ($1,'AB 12 CD GP','Toyota','Quantum',2021,'White',15,'2026-11-01')`, [V1]);
  await db.query(`INSERT INTO terminals (id, serial, api_key_hash, driver_id, vehicle_id) VALUES ($1,'T-1','x',$2,$3), ($4,'T-2','x',$5,NULL)`, [T1, D1, V1, T2, D2]);
  const tap = (n: number, term: string, amount: number, status: string, at: string) =>
    db.query(`INSERT INTO terminal_taps (id, terminal_id, masked_pan, scheme, amount, status, received_at) VALUES ($1,$2,'**** **** **** 4242','visa',$3,$4,$5)`, [`cccccccc-cccc-cccc-cccc-${String(n).padStart(12, "0")}`, term, amount, status, at]);
  await tap(1, T1, 20, "confirmed", "2026-10-07T08:00:00Z");     // today
  await tap(2, T1, 30, "confirmed", "2026-10-06T08:00:00Z");     // earlier this week
  await tap(3, T1, 40, "confirmed", "2026-10-02T08:00:00Z");     // earlier this month, before this week
  await tap(4, T1, 99, "declined",  "2026-10-07T07:00:00Z");     // declined: never counted
  await tap(5, T2, 500, "confirmed", "2026-10-07T08:00:00Z");    // the OTHER driver's fare
  await db.query(`INSERT INTO vehicle_routes (id, terminal_id, name) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01',$1,'Soweto - CBD')`, [T1]);
  await db.query(`INSERT INTO route_waypoints (id, route_id, sequence, lat, lng) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01','dddddddd-dddd-dddd-dddd-dddddddddd01',1,-26.2,28.0)`);
  await db.query(`INSERT INTO vehicle_positions (id, terminal_id, lat, lng) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffff01',$1,-26.3,27.9)`, [T1]);
  await db.query(`INSERT INTO route_violations (id, terminal_id, route_id, position_id, distance_from_route_m, fine_amount, created_at) VALUES ('99999999-9999-9999-9999-999999999901',$1,'dddddddd-dddd-dddd-dddd-dddddddddd01','ffffffff-ffff-ffff-ffff-ffffffffff01',640,50,'2026-10-05T10:00:00Z')`, [T1]);
  await db.query(`INSERT INTO driver_ledger (id, driver_id, amount, balance_after, reference_id, description, created_at) VALUES ('88888888-8888-8888-8888-888888888801',$1,-50,-50,'99999999-9999-9999-9999-999999999901','Off-route fine','2026-10-05T10:00:00Z')`, [D1]);
}

describe("pure helpers", () => {
  it("saPeriods gives the start of today, Monday and the month in South African time", () => {
    const p = saPeriods(NOW);
    expect(p.day.toISOString()).toBe("2026-10-06T22:00:00.000Z");      // 00:00 on Wed 7 Oct in UTC+2
    expect(p.week.toISOString()).toBe("2026-10-04T22:00:00.000Z");     // Monday 5 Oct
    expect(p.month.toISOString()).toBe("2026-09-30T22:00:00.000Z");    // 1 Oct
  });

  it("a fare just after midnight in South Africa counts as the new day even though it is still the old day in UTC", () => {
    expect(saPeriods(new Date("2026-10-07T22:30:00Z")).day.toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });

  it("cleanProfile accepts good values and empties, and rejects bad ones", () => {
    expect(cleanProfile({ phone: "+27 82 123 4567", licence_number: "AB1234567", licence_expiry: "2027-03-31" })).toMatchObject({ value: { phone: "+27 82 123 4567", licence_expiry: "2027-03-31", pdp_number: null } });
    for (const bad of [{ phone: "<script>" }, { licence_expiry: "31/03/2027" }, { licence_expiry: "2027-02-30" }, { licence_number: "x".repeat(40) }, { pdp_expiry: 5 }])
      expect(cleanProfile(bad)).toHaveProperty("error");
  });

  it("expiryReminders flags only documents that are expired or inside the window", () => {
    const r = expiryReminders([
      { key: "licence", kind: "licence", label: "Licence", date: "2026-10-01" },      // expired
      { key: "pdp", kind: "pdp", label: "PDP", date: "2026-11-20" },                  // 44 days
      { key: "disc", kind: "disc", label: "Disc", date: "2027-06-01" },               // far away
      { key: "x", kind: "disc", label: "None", date: null },
    ], NOW);
    expect(r.map((x) => x.kind)).toEqual(["licence", "pdp"]);
    expect(r[0].title).toMatch(/expired/); expect(r[1].title).toMatch(/44 days/);
  });
});

describe("driver API (real queries on in-memory Postgres)", () => {
  let server: Server, url = "", db: Db, as = D1;
  beforeEach(async () => {
    db = freshDb(); await populate(db); as = D1;
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: as, username: "d", role: "driver" }; next(); });
    app.use("/driver", createDriverRouter(db, () => NOW));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/driver`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const get = async (p: string) => (await fetch(url + p)).json() as Promise<any>;

  it("profile: empty at first, saved on PUT, validated, and only for the signed-in driver", async () => {
    expect((await get("/profile")).user.name).toBe("Dee One");
    expect((await get("/profile")).profile.licenceNumber).toBeNull();
    const put = (b: unknown) => fetch(url + "/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    expect((await put({ phone: "0821234567", licence_number: "AB1234567", licence_code: "EC", licence_expiry: "2027-03-31" })).status).toBe(200);
    expect((await get("/profile")).profile).toMatchObject({ phone: "0821234567", licenceNumber: "AB1234567", licenceExpiry: "2027-03-31" });
    expect((await put({ licence_expiry: "tomorrow" })).status).toBe(400);
    as = D2;
    expect((await get("/profile")).profile.licenceNumber).toBeNull();     // driver 2 sees none of driver 1's details
  });

  it("vehicle and routes: only mine", async () => {
    const v = await get("/vehicle");
    expect(v.vehicles).toHaveLength(1);
    expect(v.vehicles[0]).toMatchObject({ registration: "AB 12 CD GP", make: "Toyota", seats: 15, discExpiry: "2026-11-01", terminalSerial: "T-1" });
    expect((await get("/routes")).routes[0]).toMatchObject({ name: "Soweto - CBD", waypoints: 1 });
    as = D2;
    expect((await get("/routes")).routes).toEqual([]);
  });

  it("trips: mine only, newest first, and never include card details", async () => {
    const t = await get("/trips");
    expect(t.trips.map((x: any) => x.amount)).toEqual([20, 99, 30, 40]);
    expect(JSON.stringify(t)).not.toMatch(/4242|masked|pan/i);
    as = D2;
    expect((await get("/trips")).trips.map((x: any) => x.amount)).toEqual([500]);
  });

  it("earnings: confirmed fares per period, declined ones never counted, plus fines and balance", async () => {
    const e = await get("/earnings");
    expect(e.faresCollected.today).toEqual({ count: 1, total: 20 });
    expect(e.faresCollected.week).toEqual({ count: 2, total: 50 });
    expect(e.faresCollected.month).toEqual({ count: 3, total: 90 });
    expect(e.fineBalance).toBe(-50);
    expect(e.fines[0]).toMatchObject({ amount: -50, distanceFromRouteMeters: 640, route: "Soweto - CBD" });
    as = D2;
    const other = await get("/earnings");
    expect(other.faresCollected.month.total).toBe(500); expect(other.fines).toEqual([]); expect(other.fineBalance).toBe(0);
  });

  it("notifications: from real events, with read state", async () => {
    await db.query(`INSERT INTO driver_profiles (user_id, licence_expiry) VALUES ($1,'2026-10-20')`, [D1]);
    const n = await get("/notifications");
    const kinds = n.notifications.map((x: any) => x.kind).sort();
    expect(kinds).toEqual(["disc", "fine", "licence"]);
    expect(n.unread).toBe(3);
    const fine = n.notifications.find((x: any) => x.kind === "fine");
    await fetch(url + "/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: [fine.key] }) });
    const after = await get("/notifications");
    expect(after.unread).toBe(2);
    expect(after.notifications.find((x: any) => x.kind === "fine").read).toBe(true);
    as = D2;
    expect((await get("/notifications")).notifications).toEqual([]);
  });
});

describe("demo data for the test driver", () => {
  const ENV = { SEED_ENABLED: "true", SEED_DRIVER_EMAIL: "d1@x.test" } as unknown as NodeJS.ProcessEnv;
  it("creates a vehicle, terminal, route, fares and a fine, and is idempotent", async () => {
    const db = freshDb();
    await seedDriverDemo(db, ENV, () => {}, NOW); await seedDriverDemo(db, ENV, () => {}, NOW);
    const count = async (t: string) => Number((await db.query(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
    expect(await count("vehicles")).toBe(1); expect(await count("terminals")).toBe(1); expect(await count("vehicle_routes")).toBe(1);
    expect(await count("route_waypoints")).toBe(4); expect(await count("terminal_taps")).toBe(12); expect(await count("driver_ledger")).toBe(1);
  });
  it("does nothing in production unless SEED_ENABLED=true, and does nothing for an unknown driver", async () => {
    const db = freshDb();
    await seedDriverDemo(db, { NODE_ENV: "production", SEED_DRIVER_EMAIL: "d1@x.test" } as unknown as NodeJS.ProcessEnv, () => {}, NOW);
    await seedDriverDemo(db, { SEED_ENABLED: "true", SEED_DRIVER_EMAIL: "nobody@x.test" } as unknown as NodeJS.ProcessEnv, () => {}, NOW);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM terminals`)).rows[0].n)).toBe(0);
  });
});
