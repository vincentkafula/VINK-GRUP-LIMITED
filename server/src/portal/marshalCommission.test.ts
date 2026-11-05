import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createCommission, sessionClosedHook, type Commission } from "../services/commission.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The marshal's queue and departures with commission switched on: every queue change is logged with who and when; a vehicle that leaves out of order, or is taken out of the line, needs a reason once the
 * association has commission on; and each departure calculates the marshal's commission without ever being able to stop the departure.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), M1: id(3), M2: id(4), D1: id(5), O1: id(6) };
const R1 = id(100), V1 = id(110), V2 = id(111), V3 = id(112);
let db: Db, c: Commission, server: Server, url = "", as = U.M1;
const clock = new Date("2026-11-02T08:00:00Z");
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb(); c = createCommission(db, () => clock); as = U.M1;
  for (const [i, n, r] of [[U.A, "Association A", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, n.replace(/ /g, "").toLowerCase(), n, `${i}@x.test`, r]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa rank')`, [R1, U.A]); await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [R1, U.M1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3),($4,$2,'CA 222-222',NULL),($5,$2,'CA 333-333',NULL)`, [V1, U.O1, U.D1, V2, V3]);
  await db.query(`INSERT INTO memberships (member_id, association_id, status, member_role, requested_by) VALUES ($1,$2,'active','vehicle_owner','owner')`, [U.O1, U.A]);
  const app = express(); app.use(express.json()); app.use((req, _r, next) => { (req as any).user = { userId: as, username: "marshal", role: "marshal" }; next(); }); app.use("/marshal", createMarshalRouter(db, () => clock));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };
const join = async (v: string) => { const r = await call("POST", `/marshal/ranks/${R1}/queue`, { vehicleId: v }); expect(r.status).toBe(201); await new Promise((ok) => setTimeout(ok, 5)); return r.body.id as string; };
const live = async (mode: "shadow" | "commission" = "commission") => { expect((await c.addRate(U.A, U.A, { scope: "default", rateBp: 4000, effectiveFrom: "2026-01-01" })).ok).toBe(true); expect((await c.updateSettings(U.A, { mode })).ok).toBe(true); };
const events = () => q(`SELECT action, reason_code, position_before, marshal_id, vehicle_id FROM queue_events ORDER BY created_at, id`);

describe("the queue record", () => {
  it("logs every change with who made it, whatever the association's setting: joining, leaving in order, and being taken out", async () => {
    const a = await join(V1), b = await join(V2), cq = await join(V3);
    expect((await call("POST", `/marshal/ranks/${R1}/depart`, {})).status).toBe(201);                                                      // V1, first in line
    expect((await call("POST", `/marshal/ranks/${R1}/queue/${cq}/remove`, {})).status).toBe(200);                                         // V3 taken out (no reason needed: commission is off)
    expect(await events()).toEqual([{ action: "join", reason_code: null, position_before: 1, marshal_id: U.M1, vehicle_id: V1 }, { action: "join", reason_code: null, position_before: 2, marshal_id: U.M1, vehicle_id: V2 }, { action: "join", reason_code: null, position_before: 3, marshal_id: U.M1, vehicle_id: V3 },
      { action: "depart", reason_code: null, position_before: 1, marshal_id: U.M1, vehicle_id: V1 }, { action: "remove", reason_code: null, position_before: 2, marshal_id: U.M1, vehicle_id: V3 }]); expect(a && b).toBeTruthy();
  });
  it("lists the reasons a marshal can choose", async () => {
    const r = await call("GET", "/marshal/reason-codes"); expect(r.status).toBe(200); expect(r.body.reasons).toEqual(expect.arrayContaining([{ code: "breakdown", label: "Breakdown" }, { code: "emergency", label: "Emergency" }, { code: "priority_route", label: "Priority route" }]));
    expect(r.body.reasons.map((x: any) => x.code)).not.toContain("goodwill");                                                           // fee reasons are not queue reasons
  });
  it("never stops a marshal working if the log fails", async () => {
    await db.query(`DROP TABLE queue_events`); await join(V1); expect((await call("POST", `/marshal/ranks/${R1}/depart`, {})).status).toBe(201);
  });
});

describe("leaving out of order needs a reason once commission is on", () => {
  it("is free, as today, while commission is off", async () => {
    await join(V1); const second = await join(V2); expect((await call("POST", `/marshal/ranks/${R1}/depart`, { queueId: second })).status).toBe(201);
    expect((await events()).at(-1)).toMatchObject({ action: "override", reason_code: null, position_before: 2 });            // out of order, nothing asked, but the log still says it was an override
  });
  for (const mode of ["shadow", "commission"] as const) it(`is refused without a reason in ${mode} mode, with a bad reason, and goes through and is recorded with a good one`, async () => {
    await live(mode); await join(V1); const second = await join(V2);
    expect(await call("POST", `/marshal/ranks/${R1}/depart`, { queueId: second })).toMatchObject({ status: 400, body: { success: false, code: "reason_required" } });
    expect(await call("POST", `/marshal/ranks/${R1}/depart`, { queueId: second, reasonCode: "goodwill" })).toMatchObject({ status: 400, body: { error: "Choose a reason from the list" } });
    expect(await q(`SELECT * FROM departures`)).toEqual([]);                                                                            // nothing left
    expect((await call("POST", `/marshal/ranks/${R1}/depart`, { queueId: second, reasonCode: "breakdown" })).status).toBe(201);
    expect((await events()).at(-1)).toEqual({ action: "override", reason_code: "breakdown", position_before: 2, marshal_id: U.M1, vehicle_id: V2 });
  });
  it("needs no reason for the vehicle first in line, even when it is named, and records a given reason as an override", async () => {
    await live(); const first = await join(V1); await join(V2);
    expect((await call("POST", `/marshal/ranks/${R1}/depart`, { queueId: first })).status).toBe(201); expect((await events()).at(-1)).toMatchObject({ action: "depart", position_before: 1, reason_code: null });
    expect((await call("POST", `/marshal/ranks/${R1}/depart`, { reasonCode: "emergency" })).status).toBe(201); expect((await events()).at(-1)).toMatchObject({ action: "override", reason_code: "emergency" });
  });
  it("needs a reason to take a vehicle out of the queue, and records it", async () => {
    await live(); const a = await join(V1);
    expect(await call("POST", `/marshal/ranks/${R1}/queue/${a}/remove`, {})).toMatchObject({ status: 400, body: { code: "reason_required" } }); expect(await call("POST", `/marshal/ranks/${R1}/queue/${a}/remove`, { reasonCode: "nope" })).toMatchObject({ status: 400 });
    expect((await call("POST", `/marshal/ranks/${R1}/queue/${a}/remove`, { reasonCode: "left_voluntarily" })).status).toBe(200); expect((await events()).at(-1)).toEqual({ action: "remove", reason_code: "left_voluntarily", position_before: 1, marshal_id: U.M1, vehicle_id: V1 });
  });
});

describe("the commission for each departure", () => {
  it("is calculated when the marshal departs a vehicle: R20 at 40% is R8.00 for the marshal who loaded it", async () => {
    await live(); await join(V1); expect((await call("POST", `/marshal/ranks/${R1}/depart`, {})).status).toBe(201);
    expect(await q(`SELECT marshal_id, rank_id, vehicle_id, driver_id, fee_cents, rate_bp, commission_cents, mode FROM trip_commissions`)).toEqual([{ marshal_id: U.M1, rank_id: R1, vehicle_id: V1, driver_id: U.D1, fee_cents: 2000, rate_bp: 4000, commission_cents: 800, mode: "live" }]);
    expect(await q(`SELECT kind, payer_id, payee_id, amount_cents FROM payment_items`)).toEqual([{ kind: "trip_fee", payer_id: U.D1, payee_id: U.A, amount_cents: 2000 }]);
  });
  it("is not calculated when commission is off, so today's departures are untouched", async () => {
    await join(V1); expect((await call("POST", `/marshal/ranks/${R1}/depart`, {})).status).toBe(201); expect(await q(`SELECT * FROM trip_commissions`)).toEqual([]); expect(await q(`SELECT * FROM payment_items`)).toEqual([]);
  });
  it("can never stop a departure: if the calculation fails the vehicle still leaves, and the catch-up calculates it later", async () => {
    await live(); await join(V1); await db.query(`DROP TABLE trip_commissions`); expect((await call("POST", `/marshal/ranks/${R1}/depart`, {})).status).toBe(201); expect((await q(`SELECT * FROM departures`)).length).toBe(1);
  });
  it("catches up on departures that were missed, once each", async () => {
    await join(V1); await call("POST", `/marshal/ranks/${R1}/depart`, {}); await live("shadow"); expect(await c.backfill(U.A, "2026-11-01")).toEqual({ recorded: 1, skipped: 0 }); expect(await c.backfill(U.A, "2026-11-01")).toEqual({ recorded: 0, skipped: 0 });
  });
});

describe("when a rank device's session closes", () => {
  const sess = async () => { const d = await q(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [R1, V1, U.D1, U.M1, clock]); await db.query(`INSERT INTO loading_sessions (id, terminal_id, rank_id, vehicle_id, marshal_id, status, departure_id) VALUES ($1,$2,$3,$4,$5,'closed',$6)`, [id(800), id(900), R1, V1, U.M1, d[0].id]); };
  it("makes the trip and then the commission, each whatever the other does, and passes a failure of the trip on", async () => {
    await live(); await sess(); const order: string[] = [];
    await sessionClosedHook(c, async () => { order.push("trip"); })(id(800)); expect(order).toEqual(["trip"]); expect((await q(`SELECT commission_cents FROM trip_commissions`))).toEqual([{ commission_cents: 800 }]);
    await db.query(`DELETE FROM trip_commissions`); await db.query(`DELETE FROM trip_fees`); await expect(sessionClosedHook(c, async () => { throw new Error("trip service down"); })(id(800))).rejects.toThrow("trip service down");
    expect((await q(`SELECT commission_cents FROM trip_commissions`)).length).toBe(1);                                                    // the commission was still calculated
  });
  it("never lets a failure of the commission undo the close", async () => {
    await live(); await sess(); await db.query(`DROP TABLE trip_commissions`); await expect(sessionClosedHook(c)(id(800))).resolves.toBeUndefined();
  });
});
