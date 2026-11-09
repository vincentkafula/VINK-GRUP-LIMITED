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
 * An owner's team through the REAL portal router with real tokens: the gate must run before the bank, money and token routers, each role must reach exactly what it should, and what a team member changes must be recorded in their own name.
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

describe("the gate in the real owner portal", () => {
  it("lets the owner's own login through to everything, including the team, and to the bank and money routers (which answer for themselves)", async () => {
    expect((await call(OWNER(), "GET", "/driver-pay/fleet")).status).toBe(200); expect((await call(OWNER(), "GET", "/team")).status).toBe(200); const bank = await call(OWNER(), "GET", "/bank/accounts"); expect(bank.status).not.toBe(403); expect(bank.status).toBe(503); expect((await call(OWNER(), "GET", "/money/summary")).status).not.toBe(403); expect((await call(OWNER(), "GET", "/access")).body).toMatchObject({ kind: "owner", roleText: "The owner" });
  });
  it("refuses every team role the bank, money, tokens, payments, requests, links, agreements, the team and anything not mapped, before those routers see the request", async () => {
    for (const role of ["fleet_manager", "accountant"] as const) for (const p of ["/bank/accounts", "/bank", "/money/summary", "/money", "/tokens/balance", "/tokens"]) { const r = await call(T(role), "GET", p); expect(r.status, `${role} ${p}`).toBe(403); expect(r.body.success).toBe(false); }
    for (const role of ["co_owner", "fleet_manager", "accountant"] as const) for (const p of ["/payments", "/requests", "/links", "/agreements", "/team", "/sms", "/sms/phone", "/something-new"]) { const r = await call(T(role), "GET", p); expect(r.status, `${role} ${p}`).toBe(403); expect(r.body.success).toBe(false); }
    for (const role of ["co_owner", "fleet_manager", "accountant"] as const) for (const m of ["POST", "PUT", "DELETE"]) for (const p of ["/bank/accounts", "/bank/link", "/money/pay", "/money/agreements/1/accept", "/money/cross-border/1/confirm", "/tokens/send", "/tokens/transfer", "/tokens/cash-out", "/team", "/sms/phone", "/sms/verify", "/sms/settings", "/sms"]) expect((await call(T(role), m, p, {})).status, `${role} ${m} ${p}`).toBe(403);
    expect((await call(T("co_owner"), "PUT", "/bank/link", {})).body.error).toBe("The co-owner role can look at that but not change it"); expect((await call(T("co_owner"), "POST", "/tokens/transfer", {})).body.error).toBe("The co-owner role can look at that but not change it"); expect((await call(T("fleet_manager"), "PUT", "/bank/link", {})).body.error).toBe("The fleet manager role does not have access to that");
  });
  it("shows a team member the owner's own business, not another owner's", async () => {
    for (const role of ["co_owner", "fleet_manager", "accountant"] as const) { if (role === "accountant") continue; const r = await call(T(role), "GET", "/driver-pay/fleet"); expect(r.status, role).toBe(200); expect(r.body.vehicles.map((v: any) => v.registration), role).toEqual(["CA 111-111"]); }
    expect((await call(tok(U.O2, "ona"), "GET", "/driver-pay/fleet")).body.vehicles.map((v: any) => v.registration)).toEqual(["CA 222-222"]);
  });
  it("tells each person what they may do, for the screens", async () => {
    expect((await call(T("co_owner"), "GET", "/access")).body).toMatchObject({ kind: "team", role: "co_owner", roleText: "Co-owner", modules: { finance: "rw", fleet: "rw", earnings: "rw" } }); expect((await call(T("fleet_manager"), "GET", "/access")).body).toMatchObject({ kind: "team", name: "fleet_manager person", modules: { fleet: "rw", costs: "rw", finance: null, earnings: null, association: null } }); expect((await call(T("accountant"), "GET", "/access")).body).toMatchObject({ kind: "team", modules: { finance: "r", earnings: "r", fleet: null, files: null, compliance: null } });
  });
  it("refuses everything for a login that has been switched off, even with a token it already holds, and works again when switched back on", async () => {
    expect((await call(T("fleet_manager"), "GET", "/driver-pay/fleet")).status).toBe(200); expect((await call(OWNER(), "POST", `/team/${ids.fleet_manager}/active`, { active: false })).status).toBe(200); for (const p of ["/driver-pay/fleet", "/access", "/bank/accounts", "/finance/costs"]) { const r = await call(T("fleet_manager"), "GET", p); expect(r.status, p).toBe(403); expect(r.body.error).toContain("switched off"); }
    expect((await call(OWNER(), "POST", `/team/${ids.fleet_manager}/active`, { active: true })).status).toBe(200); expect((await call(T("fleet_manager"), "GET", "/driver-pay/fleet")).status).toBe(200);
  });
});

describe("what each role reaches, through the real routes", () => {
  it("lets a fleet manager run the vehicles, drivers, what drivers pay, costs and servicing, but not profit, loans, takings or the association", async () => {
    const f = T("fleet_manager"); for (const p of ["/driver-pay/fleet", "/vehicles", "/drivers", "/finance/costs", "/finance/maintenance", "/finance/maintenance/status", "/compliance-centre", "/files", "/notifications"]) expect((await call(f, "GET", p)).status, p).toBe(200);
    expect((await call(f, "POST", "/finance/costs", { vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-01" })).status).toBe(201); expect((await call(f, "POST", "/driver-pay/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-10-01" })).status).toBe(201);
    for (const p of ["/finance/profit", "/finance/loans", "/finance/overview", "/finance/export/profit.csv", "/earnings", "/statements", "/reports", "/trend", "/my-association"]) expect((await call(f, "GET", p)).status, p).toBe(403); expect((await call(f, "POST", "/finance/loans", { vehicleId: V.v1 })).status).toBe(403); expect((await call(f, "POST", "/my-association/claims", {})).status).toBe(403);
  });
  it("lets an accountant look at profit, loans, costs, takings, what drivers pay and the association's statements and download the exports, but change nothing", async () => {
    const a = T("accountant"); for (const p of ["/finance/overview", "/finance/profit", "/finance/loans", "/finance/costs", "/finance/maintenance", "/driver-pay/fleet", "/earnings", "/statements", "/my-association", "/notifications"]) expect((await call(a, "GET", p)).status, p).toBe(200);
    expect((await fetch(`${url}/api/portal/owner/finance/export/profit.csv`, { headers: { Authorization: `Bearer ${a}` } })).status).toBe(200); expect((await fetch(`${url}/api/portal/owner/finance/export/profit.pdf`, { headers: { Authorization: `Bearer ${a}` } })).status).toBe(200);
    for (const p of ["/finance/costs", "/finance/loans", "/driver-pay/payments", "/driver-pay/targets", "/my-association/claims", "/finance/maintenance"]) { const r = await call(a, "POST", p, {}); expect(r.status, `POST ${p}`).toBe(403); expect(r.body.error, `POST ${p}`).toBe("The accountant role can look at that but not change it"); }
    const v = await call(a, "POST", "/vehicles", {}); expect(v.status).toBe(403); expect(v.body.error).toBe("The accountant role does not have access to that");                  // not even a place to look
    for (const p of ["/vehicles", "/drivers", "/files", "/compliance-centre", "/documents"]) expect((await call(a, "GET", p)).status, p).toBe(403); expect((await call(a, "POST", "/notifications/read", { keys: [] })).status).not.toBe(403);
  });
  it("lets a co-owner do everything about the business, and LOOK at the bank, tokens and payments, but not the team", async () => {
    const c = T("co_owner"); for (const p of ["/finance/profit", "/finance/loans", "/earnings", "/my-association", "/vehicles", "/files", "/compliance-centre", "/driver-pay/fleet"]) expect((await call(c, "GET", p)).status, p).toBe(200); expect((await call(c, "POST", "/finance/costs", { category: "fuel", amountCents: 1000, incurredOn: "2026-10-01" })).status).toBe(201);
    expect((await call(c, "GET", "/team")).status).toBe(403); for (const p of ["/bank/accounts", "/bank", "/tokens", "/money/summary"]) expect((await call(c, "GET", p)).status, p).not.toBe(403);                  // the gate lets a co-owner's look through: those routers answer for themselves (503 here, with no bank connected)
    expect((await call(c, "PUT", "/bank/link", {})).status).toBe(403);
  });
});

describe("what a team member changes is recorded in their own name", () => {
  it("records a payment, a target and an audit entry under the team member, not the owner, and the data belongs to the owner", async () => {
    const f = T("fleet_manager"), p = await call(f, "POST", "/driver-pay/payments", { vehicleId: V.v1, amountCents: 30000, paidOn: "2026-11-01", method: "cash", clientRef: "t-1" }); expect(p.status).toBe(201); await call(f, "POST", "/finance/costs", { vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-01" });
    expect((await q(`SELECT owner_id, recorded_by FROM driver_payments`))[0]).toEqual({ owner_id: U.O1, recorded_by: ids.fleet_manager }); const a = await q(`SELECT actor_id, actor_name FROM audit_log WHERE action IN ('owner.payment.record','owner.cost.add') ORDER BY created_at`); expect(a.map((r) => [r.actor_id, r.actor_name])).toEqual([[ids.fleet_manager, "fleet_manager"], [ids.fleet_manager, "fleet_manager"]]); expect((await q(`SELECT owner_id FROM vehicle_costs`))[0].owner_id).toBe(U.O1);
    await call(OWNER(), "POST", "/finance/costs", { vehicleId: V.v1, category: "insurance", amountCents: 1, incurredOn: "2026-10-02" }); expect((await q(`SELECT actor_id FROM audit_log WHERE action = 'owner.cost.add' ORDER BY created_at`)).map((r) => r.actor_id)).toEqual([ids.fleet_manager, U.O1]);
  });
});

describe("managing the team, as the owner", () => {
  it("creates a login with a one-time password that is not kept in any record, changes a role, resets a password, and refuses another owner's team", async () => {
    const r = await call(OWNER(), "POST", "/team", { name: "New Person", email: "new@x.test", username: "newperson", role: "accountant" }); expect(r.status).toBe(201); expect(r.body.temporaryPassword.length).toBeGreaterThanOrEqual(15); expect(JSON.stringify(await q(`SELECT details FROM audit_log WHERE action LIKE 'team.%'`))).not.toContain(r.body.temporaryPassword);
    expect((await call(OWNER(), "PUT", `/team/${r.body.id}/role`, { role: "king" })).status).toBe(400); expect((await call(OWNER(), "PUT", `/team/${r.body.id}/role`, { role: "co_owner" })).status).toBe(200); const reset = await call(OWNER(), "POST", `/team/${r.body.id}/reset-password`); expect(reset.status).toBe(200); expect(reset.body.temporaryPassword).not.toBe(r.body.temporaryPassword);
    const other = tok(U.O2, "ona"); expect((await call(other, "PUT", `/team/${r.body.id}/role`, { role: "accountant" })).status).toBe(404); expect((await call(other, "POST", `/team/${r.body.id}/active`, { active: false })).status).toBe(404); expect((await call(other, "GET", "/team")).body.team).toEqual([]); expect((await call(OWNER(), "GET", "/team")).body.team.map((x: any) => x.username).sort()).toEqual(["accountant", "co_owner", "fleet_manager", "newperson"]);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'team.%' ORDER BY created_at`)).map((x) => x.action)).toEqual(["team.create", "team.role", "team.reset-password"]);
  }, 60_000);
  it("cannot be done by a team member at all, whatever their role", async () => { for (const role of ["co_owner", "fleet_manager", "accountant"] as const) for (const [m, p, b] of [["GET", "/team"], ["POST", "/team", { name: "X", email: "x@x.test", username: "xperson", role: "co_owner" }], ["PUT", `/team/${ids.accountant}/role`, { role: "co_owner" }], ["POST", `/team/${ids.accountant}/reset-password`]] as const) expect((await call(T(role), m, p, b)).status, `${role} ${m} ${p}`).toBe(403); });
});
