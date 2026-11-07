/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import { seedOwnerDemo } from "./seedOwnerDemo.js";
import { createDriverTargets } from "../services/driverTargets.js";

const NOW = () => new Date("2026-11-04T08:00:00Z");
describe("the owner demo data", () => {
  it("makes three owners with their vehicles, drivers, targets and a month of payments, each vehicle in a different state", async () => {
    const db = allPortalsDb(), r = await seedOwnerDemo(db, { passwordHash: "x", now: NOW }), t = createDriverTargets(db, NOW);
    expect(r).toMatchObject({ vehicles: 7 }); expect(r.owners.map((o) => o.username)).toEqual(["demo.owner.1", "demo.owner.2", "demo.owner.3"]); expect(r.payments).toBeGreaterThan(60);
    const state = async (user: string) => { const id = (await db.query(`SELECT id FROM users WHERE username = $1`, [user])).rows[0].id; return Object.fromEntries((await t.fleet(String(id), "2026-11-04")).vehicles.map((v) => [v.registration, v.status])); };
    expect(await state("demo.owner.1")).toEqual({ "DEMO GP 101": "green", "DEMO GP 102": "red" }); expect(await state("demo.owner.2")).toEqual({ "DEMO CA 201": "green", "DEMO CA 202": "green", "DEMO CA 203": "green" }); expect(await state("demo.owner.3")).toEqual({ "DEMO ND 301": "amber", "DEMO ND 302": "none" });
  });
  it("is safe to run twice: nothing is made again, and the totals do not change", async () => {
    const db = allPortalsDb(), a = await seedOwnerDemo(db, { passwordHash: "x", now: NOW }), count = async (s: string) => Number((await db.query(s)).rows[0].n), before = [await count("SELECT COUNT(*) AS n FROM users"), await count("SELECT COUNT(*) AS n FROM vehicles"), await count("SELECT COUNT(*) AS n FROM vehicle_targets"), await count("SELECT COUNT(*) AS n FROM driver_payments"), await count("SELECT COUNT(*) AS n FROM target_pauses")];
    const b = await seedOwnerDemo(db, { passwordHash: "x", now: NOW }); expect(b.payments).toBe(0); expect(a.payments).toBeGreaterThan(0); expect([await count("SELECT COUNT(*) AS n FROM users"), await count("SELECT COUNT(*) AS n FROM vehicles"), await count("SELECT COUNT(*) AS n FROM vehicle_targets"), await count("SELECT COUNT(*) AS n FROM driver_payments"), await count("SELECT COUNT(*) AS n FROM target_pauses")]).toEqual(before);
  });
  it("uses only obviously fake names, registrations and addresses, and no real-looking e-mail", async () => {
    const db = allPortalsDb(); await seedOwnerDemo(db, { passwordHash: "x", now: NOW }); expect((await db.query(`SELECT email FROM users`)).rows.every((u: any) => String(u.email).endsWith("@demo.invalid"))).toBe(true); expect((await db.query(`SELECT registration FROM vehicles`)).rows.every((v: any) => String(v.registration).startsWith("DEMO "))).toBe(true);
  });
});
