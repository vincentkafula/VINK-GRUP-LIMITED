/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createPortalRouter } from "../routes/portal.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { createOwnerTeam, type OwnerTeam, type TeamRole } from "../services/ownerTeam.js";

/**
 * The fleet expansion planner through the REAL portal router with real tokens: who may use it, that it works from the owner's own recorded figures, and that it records nothing.
 * Owner O1 has vehicle v1 and driver D1; owner O2 has v2. The team: a co-owner, a fleet manager and an accountant (all O1's).
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), D1: id(3) }, V = { v1: id(20), v2: id(21) };
let db: Db, server: Server, url = "", team: OwnerTeam, ids: Record<TeamRole, string>;
const tok = (userId: string, username: string) => jwt.sign({ userId, username, role: "vehicle_owner" }, JWT_SECRET, { expiresIn: "1h" });
const call = async (token: string, method: string, path: string, body?: unknown) => { const r = await fetch(`${url}/api/portal/owner${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const T = (role: TeamRole) => tok(ids[role], role);
const OWNER = () => tok(U.O1, "olu");

beforeEach(async () => {
  db = allPortalsDb(); team = createOwnerTeam(db);
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, i === U.O1 ? "olu" : nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats, driver_id) VALUES ($1,$2,'CA 111-111','Toyota',15,$3),($4,$5,'CA 222-222','Toyota',15,NULL)`, [V.v1, U.O1, U.D1, V.v2, U.O2]);
  ids = {} as any; for (const role of ["co_owner", "fleet_manager", "accountant"] as const) ids[role] = (await team.create(U.O1, { name: `${role} person`, email: `${role}@x.test`, username: role.replace("_", "-"), role }) as any).value.id;
  for (const role of ["co_owner", "fleet_manager", "accountant"] as const) await db.query(`UPDATE users SET username = $2 WHERE id = $1`, [ids[role], role]);
  const app = express(); app.use(express.json()); app.use("/api/portal", createPortalRouter(db, null, {}));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

const plan = (token: string, params: Record<string, string | number>) => call(token, "GET", `/finance/planner?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}`);
const BASE = { priceCents: 30000000, depositCents: 5000000, upfrontCostsCents: 1000000, ratePercent: 12, termMonths: 60 };
const history = async () => { for (const m of ["05", "06", "07", "08", "09", "10"]) { await db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method) VALUES ($1,$2,1000000,$3,'cash')`, [U.O1, V.v1, `2026-${m}-10`]); await db.query(`INSERT INTO vehicle_costs (owner_id, vehicle_id, category, amount_cents, incurred_on) VALUES ($1,$2,'fuel',300000,$3)`, [U.O1, V.v1, `2026-${m}-05`]); } };

describe("who may use the planner", () => {
  it("lets the owner, a co-owner and the accountant, and not the fleet manager", async () => {
    for (const [who, tk] of [["owner", OWNER()], ["co_owner", T("co_owner")], ["accountant", T("accountant")]] as const) { const r = await plan(tk, { ...BASE, expectedIncomeCents: 1000000 }); expect(r.status, who).toBe(200); expect(r.body.success).toBe(true); }
    const f = await plan(T("fleet_manager"), { ...BASE, expectedIncomeCents: 1000000 }); expect(f.status).toBe(403); expect(f.body.error).toBe("The fleet manager role does not have access to that");
  });
});

describe("what it works out, through the real routes", () => {
  it("uses the owner's own recorded history and the rate they give, and shows its working", async () => {
    await history(); const r = await plan(OWNER(), BASE); expect(r.status).toBe(200); expect(r.body.history).toMatchObject({ months: 6, from: "2026-05", to: "2026-10", vehicles: 1, perVehicleIncomeCents: 1000000, perVehicleCostCents: 300000 }); expect(r.body.loan).toMatchObject({ amountCents: 25000000, instalmentCents: 556112, totalInterestCents: 8366720 }); expect(r.body.monthly).toMatchObject({ incomeFrom: "history", netCents: 143888, coverage: 1.26 }); expect(r.body.verdict.colour).toBe("amber"); expect(r.body.notes.join(" ")).toContain("not financial advice");
  });
  it("gives each owner their own history: another owner with none must say what to expect", async () => { await history(); const other = tok(U.O2, "ona"); const r = await plan(other, BASE); expect(r.status).toBe(400); expect(r.body.error).toContain("there is not enough recorded history"); expect((await plan(other, { ...BASE, expectedIncomeCents: 900000 })).body.history.fleetIncomeCents).toBe(0); });
  it("takes a cash purchase with no rate or term, and refuses anything that is not valid with a message that says which", async () => {
    expect((await plan(OWNER(), { priceCents: 20000000, depositCents: 20000000, expectedIncomeCents: 900000, expectedCostsCents: 200000 })).body.loan.instalmentCents).toBe(0);
    for (const [bad, why] of [[{ priceCents: "abc" }, /price/], [{ priceCents: 0 }, /price/], [{ depositCents: 99999999999 }, /deposit/], [{ ratePercent: "x" }, /interest rate/], [{ ratePercent: 61 }, /interest rate/], [{ termMonths: 0 }, /months/], [{ termMonths: 121 }, /months/], [{ lookbackMonths: 5 }, /3, 6 or 12/], [{ expectedIncomeCents: -1 }, /income you expect/]] as const) { const r = await plan(OWNER(), { ...BASE, expectedIncomeCents: 1000000, ...bad }); expect(r.status, JSON.stringify(bad)).toBe(400); expect(r.body.error, JSON.stringify(bad)).toMatch(why); }
    expect((await call(OWNER(), "GET", "/finance/planner")).status).toBe(400);
  });
  it("records nothing and cannot be used to change anything", async () => {
    await history(); const before = (await q(`SELECT (SELECT COUNT(*) FROM audit_log) AS a, (SELECT COUNT(*) FROM vehicle_finance) AS f, (SELECT COUNT(*) FROM vehicle_costs) AS c`))[0]; await plan(OWNER(), BASE); await plan(T("accountant"), BASE); expect((await q(`SELECT (SELECT COUNT(*) FROM audit_log) AS a, (SELECT COUNT(*) FROM vehicle_finance) AS f, (SELECT COUNT(*) FROM vehicle_costs) AS c`))[0]).toEqual(before);
    const w = await call(T("accountant"), "POST", "/finance/planner", {}); expect(w.status).toBe(403); expect(w.body.error).toBe("The accountant role can look at that but not change it"); expect((await call(OWNER(), "POST", "/finance/planner", {})).status).toBe(404);
  });
});

describe("saved plans, through the real routes", () => {
  const savePlan = (tk: string, name: string, o: Record<string, unknown> = {}) => call(tk, "POST", "/finance/plans", { name, ...BASE, ...o });
  it("lets the owner and a co-owner save and delete, the accountant only look, and the fleet manager do neither", async () => {
    await history(); const a = await savePlan(OWNER(), "Hiace"); expect(a.status).toBe(201); expect((await savePlan(T("co_owner"), "Quantum", { depositCents: 6000000 })).status).toBe(201);
    for (const [who, tk] of [["owner", OWNER()], ["co_owner", T("co_owner")], ["accountant", T("accountant")]] as const) { const r = await call(tk, "GET", "/finance/plans"); expect(r.status, who).toBe(200); expect(r.body.plans.map((x: any) => x.name).sort(), who).toEqual(["Hiace", "Quantum"]); }
    const w = await savePlan(T("accountant"), "Nope"); expect(w.status).toBe(403); expect(w.body.error).toBe("The accountant role can look at that but not change it"); expect((await call(T("accountant"), "DELETE", `/finance/plans/${a.body.id}`)).status).toBe(403);
    for (const m of ["GET", "POST", "DELETE"]) { const f = await call(T("fleet_manager"), m, m === "DELETE" ? `/finance/plans/${a.body.id}` : "/finance/plans", m === "POST" ? { name: "x", ...BASE } : undefined); expect(f.status, m).toBe(403); expect(f.body.error).toBe("The fleet manager role does not have access to that"); }
    expect((await call(T("co_owner"), "DELETE", `/finance/plans/${a.body.id}`)).status).toBe(200); expect((await call(OWNER(), "GET", "/finance/plans")).body.plans.map((x: any) => x.name)).toEqual(["Quantum"]);
  });
  it("shows each plan's answer from the owner's own records, and each owner only their own plans", async () => {
    await history(); await savePlan(OWNER(), "Hiace"); const r = (await call(OWNER(), "GET", "/finance/plans")).body.plans[0]; expect(r).toMatchObject({ name: "Hiace", problem: null, result: { instalmentCents: 556112, netCents: 143888, paybackMonths: 42, verdict: { colour: "amber" } } }); const other = tok(U.O2, "ona"); expect((await call(other, "GET", "/finance/plans")).body.plans).toEqual([]); expect((await call(other, "DELETE", `/finance/plans/${r.id}`)).status).toBe(404); expect((await call(OWNER(), "GET", "/finance/plans")).body.plans).toHaveLength(1);
  });
  it("shows the server's reason for each mistake, and keeps nothing", async () => {
    await history(); for (const [bad, st, why] of [[{ name: "" }, 400, /name/], [{ name: "x".repeat(61) }, 400, /name/], [{ priceCents: 0 }, 400, /price/], [{ ratePercent: undefined }, 400, /interest rate/]] as const) { const r = await savePlan(OWNER(), "ok", bad as any); expect(r.status, JSON.stringify(bad)).toBe(st); expect(r.body.error).toMatch(why); }
    expect((await call(OWNER(), "GET", "/finance/plans")).body.plans).toEqual([]); await savePlan(OWNER(), "Same"); expect((await savePlan(OWNER(), "SAME")).status).toBe(409); expect((await call(OWNER(), "DELETE", "/finance/plans/nope")).status).toBe(400);
  });
  it("records a save and a delete under the person who did it, and the activity log says so in words", async () => {
    await history(); const a = await savePlan(T("co_owner"), "Hiace 2027"); await call(OWNER(), "DELETE", `/finance/plans/${a.body.id}`); const log = (await call(OWNER(), "GET", "/audit?group=money")).body.entries.map((e: any) => [e.actor, e.text]); expect(log).toEqual([["Olu Owner", "Deleted a vehicle plan"], ["co_owner person", 'Saved the vehicle plan "Hiace 2027"']]);
  });
});

