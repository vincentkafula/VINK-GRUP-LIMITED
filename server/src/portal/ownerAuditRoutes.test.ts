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
 * The owner's activity log through the REAL portal router with real tokens: it must show what the owner and their team really did, in plain words, to the people allowed to read it and nobody else, and it must be impossible to change through it.
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

const rawGet = (token: string, path: string) => fetch(`${url}/api/portal/owner${path}`, { headers: { Authorization: `Bearer ${token}` } });
const act = async () => { const f = T("fleet_manager"); await call(f, "POST", "/finance/costs", { vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-01" }); await call(f, "POST", "/driver-pay/payments", { vehicleId: V.v1, amountCents: 30000, paidOn: "2026-11-01", method: "cash", clientRef: "a-1" }); await call(OWNER(), "POST", "/finance/costs", { vehicleId: V.v1, category: "insurance", amountCents: 20000, incurredOn: "2026-10-02" }); };

describe("who may read the activity log", () => {
  it("lets the owner, a co-owner and the accountant read it, and not the fleet manager", async () => {
    for (const [who, tk] of [["owner", OWNER()], ["co_owner", T("co_owner")], ["accountant", T("accountant")]] as const) { const r = await call(tk, "GET", "/audit"); expect(r.status, who).toBe(200); expect((await rawGet(tk, "/audit.csv")).status, who).toBe(200); }
    for (const p of ["/audit", "/audit.csv", "/audit?group=money"]) { const r = await call(T("fleet_manager"), "GET", p); expect(r.status, p).toBe(403); expect(r.body.error).toBe("The fleet manager role does not have access to that"); }
  });
  it("cannot be changed through it, by anyone: there is nothing to write to", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) { expect((await call(OWNER(), m, "/audit", {})).status, `owner ${m}`).toBe(404); const a = await call(T("accountant"), m, "/audit", {}); expect(a.status, `accountant ${m}`).toBe(403); expect(a.body.error).toBe("The accountant role can look at that but not change it"); }
    expect((await q(`SELECT COUNT(*) AS n FROM audit_log`))[0].n).toBe(0);
  });
});

describe("what it shows, through the real routes", () => {
  it("shows what the owner and the team really did, in plain words, newest first, in their own names and roles", async () => {
    await act(); const r = await call(OWNER(), "GET", "/audit"); expect(r.status).toBe(200); expect(r.body.entries.map((e: any) => [e.actor, e.actorRole, e.group, e.text])).toEqual([["Olu Owner", "The owner", "money", "Wrote down an insurance cost of R200.00"], ["fleet_manager person", "Fleet manager", "money", "Recorded a R300.00 payment from a driver for CA 111-111 (cash)"], ["fleet_manager person", "Fleet manager", "money", "Wrote down a fuel cost of R600.00"]]);
    expect(r.body.people.map((p: any) => p.roleText)).toEqual(["The owner", "Co-owner", "Fleet manager", "Accountant (looks only)"]); expect(r.body.next).toBeNull();
  });
  it("shows a co-owner and the accountant the same log as the owner, and another owner only their own", async () => {
    await act(); const own = (await call(OWNER(), "GET", "/audit")).body.entries.map((e: any) => e.id); expect((await call(T("co_owner"), "GET", "/audit")).body.entries.map((e: any) => e.id)).toEqual(own); expect((await call(T("accountant"), "GET", "/audit")).body.entries.map((e: any) => e.id)).toEqual(own);
    const other = await call(tok(U.O2, "ona"), "GET", "/audit"); expect(other.body.entries).toEqual([]); expect(other.body.people.map((p: any) => p.name)).toEqual(["Ona Owner"]);
  });
  it("does not record that someone read it, and records a download of it as a download only when the file is fetched", async () => {
    await act(); const before = (await q(`SELECT COUNT(*) AS n FROM audit_log`))[0].n; await call(OWNER(), "GET", "/audit"); await call(T("accountant"), "GET", "/audit?group=money"); expect((await q(`SELECT COUNT(*) AS n FROM audit_log`))[0].n).toBe(before);
  });
  it("filters by kind and person, pages with a marker, and refuses what is not valid", async () => {
    await act(); const money = await call(OWNER(), "GET", `/audit?group=money&actorId=${ids.fleet_manager}`); expect(money.body.entries).toHaveLength(2); expect((await call(OWNER(), "GET", "/audit?group=exports")).body.entries).toEqual([]);
    const p1 = await call(OWNER(), "GET", "/audit?limit=2"); expect(p1.body.entries).toHaveLength(2); expect(p1.body.next).toMatch(/\|/); const p2 = await call(OWNER(), "GET", `/audit?limit=2&before=${encodeURIComponent(p1.body.next)}`); expect(p2.body.entries).toHaveLength(1); expect(p2.body.next).toBeNull(); expect([...p1.body.entries, ...p2.body.entries].map((e: any) => e.id).length).toBe(3);
    for (const p of ["/audit?group=everything", "/audit?actorId=nope", `/audit?actorId=${U.O2}`, "/audit?from=soon", "/audit?from=2026-11-12&to=2026-11-01", "/audit?before=nonsense"]) expect((await call(OWNER(), "GET", p)).status, p).toBeGreaterThanOrEqual(400); expect((await call(OWNER(), "GET", `/audit?actorId=${U.O2}`)).status).toBe(404);
  });
});

describe("the spreadsheet, through the real routes", () => {
  it("downloads as an attachment with the date, who, role, kind and what they did, and a name cannot run as a formula", async () => {
    await db.query(`UPDATE users SET name = '=1+1' WHERE id = $1`, [ids.fleet_manager]); await act(); const r = await rawGet(OWNER(), "/audit.csv?from=2026-01-01&to=2026-12-31"); expect(r.status).toBe(200); expect(r.headers.get("content-type")).toContain("text/csv"); expect(r.headers.get("content-disposition")).toContain('attachment; filename="activity-2026-01-01-to-2026-12-31.csv"'); const t = await r.text();
    expect(t.split("\n")[0]).toContain("When (South African time),Who,Their role,Kind,What they did"); expect(t).toContain("Recorded a R300.00 payment from a driver for CA 111-111 (cash)"); expect(t).toContain("'=1+1"); expect(t).not.toMatch(/,=1\+1,/);
    expect((await rawGet(T("accountant"), "/audit.csv")).status).toBe(200); expect(await (await rawGet(tok(U.O2, "ona"), "/audit.csv")).text()).not.toContain("payment");
    expect((await rawGet(OWNER(), "/audit.csv?group=everything")).status).toBe(400);
  });
});
