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
import { createOwnerFinance } from "../services/ownerFinance.js";
import { createDriverTargets } from "../services/driverTargets.js";
import { saDay } from "./common.js";
import { createOwnerTeam, type OwnerTeam, type TeamRole } from "../services/ownerTeam.js";

/**
 * The owner's in-app Notifications through the REAL portal router with real tokens: the money, servicing and driver-payment alerts must appear for the people whose role may see them and no one else. The dates are worked out from today, because the portal runs on the real clock.
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

const dayPlus = (n: number) => saDay(new Date(Date.now() + n * 86_400_000));
const DUE_IN_2 = Number(dayPlus(2).slice(8, 10));
const money = async () => { const f = createOwnerFinance(db); ok(await f.addFinance(U.O1, { vehicleId: V.v1, lender: "WesBank", originalCents: 45000000, balanceCents: 30000000, balanceOn: dayPlus(-30), instalmentCents: 900000, dueDay: DUE_IN_2, startDate: "2024-01-20" })); };
const fine = async (n = 1) => { for (let i = 0; i < n; i++) ok(await createOwnerFinance(db).addCost(U.O1, { vehicleId: V.v1, category: "fine", amountCents: 20000, incurredOn: dayPlus(-3), clientRef: `fine-${i}` })); };
const service = async () => { ok(await createOwnerFinance(db).addMaintenance(U.O1, { vehicleId: V.v1, kind: "service", servicedOn: dayPlus(-200), nextDueOn: dayPlus(-10), odometerKm: 1000 })); };
const arrears = async () => { ok(await createDriverTargets(db).setTarget(U.O1, U.O1, { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: dayPlus(-6), driverId: U.D1 })); };
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const notes = async (tk: string) => { const r = await call(tk, "GET", "/notifications"); expect(r.status).toBe(200); return r.body as { notifications: { key: string; kind: string; title: string; body: string; read: boolean; at: string }[]; unread: number }; };
const alertsOf = (n: { notifications: any[] }) => n.notifications.filter((x) => x.kind === "alert");
const text = (n: { notifications: any[] }) => JSON.stringify(alertsOf(n).map((x) => x.body));

describe("alerts in the notifications", () => {
  it("shows nothing when nothing needs attention", async () => { const n = await notes(OWNER()); expect(alertsOf(n)).toEqual([]); });
  it("shows the owner an instalment coming up, unpaid fines, an overdue service and a driver behind, each with a plain heading", async () => {
    await money(); await fine(); await service(); await arrears(); const n = await notes(OWNER()), a = alertsOf(n); const byTitle = Object.fromEntries(a.map((x) => [x.title, x]));
    expect(Object.keys(byTitle).sort()).toEqual(["A driver's payments need attention", "An instalment has not been recorded", "An instalment is coming up", "Fines are unpaid", "Servicing needs attention"].sort()); expect(a).toHaveLength(6);                  // the driver has two (no payment recorded, and what is owed) and last month's instalment was never recorded expect(byTitle["An instalment is coming up"].body).toContain("instalment to WesBank is due in 2 days"); expect(byTitle["Fines are unpaid"].body).toContain("1 fine is unpaid"); expect(byTitle["Servicing needs attention"].body).toMatch(/CA 111-111/); expect(byTitle["A driver's payments need attention"].body).toMatch(/CA 111-111.*owed by the driver/);
    for (const x of a) { expect(x.kind).toBe("alert"); expect(x.read).toBe(false); expect(x.at).toBe(`${dayPlus(0)}T00:00:00.000Z`); expect(x.key).toMatch(/^alert-[A-Za-z0-9:_-]+-[0-9a-f]{8}$/); expect(x.key.length).toBeLessThanOrEqual(200); } expect(n.unread).toBe(a.length);
  });
  it("gives each role only the alerts it may see: a fleet manager no loan or money figures, an accountant and a co-owner everything", async () => {
    await money(); await fine(); await service(); await arrears();
    const fm = await notes(T("fleet_manager")); expect([...new Set(alertsOf(fm).map((x) => x.title))].sort()).toEqual(["A driver's payments need attention", "Fines are unpaid", "Servicing needs attention"]); expect(alertsOf(fm)).toHaveLength(4); expect(text(fm)).not.toContain("WesBank"); expect(text(fm)).not.toContain("instalment");
    for (const role of ["co_owner", "accountant"] as const) { const a = alertsOf(await notes(T(role))); expect([...new Set(a.map((x) => x.title))].sort(), role).toEqual(["A driver's payments need attention", "An instalment has not been recorded", "An instalment is coming up", "Fines are unpaid", "Servicing needs attention"]); expect(a, role).toHaveLength(6); }
  });
  it("keeps one owner's alerts from another's", async () => { await money(); await fine(); await service(); await arrears(); expect(alertsOf(await notes(tok(U.O2, "ona")))).toEqual([]); });
  it("remembers what has been read, and shows it as new again when the situation changes", async () => {
    await fine(); const n1 = await notes(OWNER()), a1 = alertsOf(n1)[0]; expect(a1.body).toContain("1 fine is unpaid"); expect((await call(OWNER(), "POST", "/notifications/read", { keys: [a1.key] })).status).toBe(200);
    const n2 = await notes(OWNER()); expect(alertsOf(n2)[0].read).toBe(true); expect(n2.unread).toBe(n1.unread - 1); expect((await notes(OWNER())).notifications.find((x) => x.key === a1.key)!.read).toBe(true);
    await fine(2); const n3 = await notes(OWNER()), a3 = alertsOf(n3).find((x) => x.title === "Fines are unpaid")!; expect(a3.body).toContain("2 fines are unpaid"); expect(a3.key).not.toBe(a1.key); expect(a3.read).toBe(false);                  // a second fine changes the wording, so it is new again
  });
  it("is the same as the dashboard and the text messages, so the three never disagree", async () => {
    await money(); await fine(); await service(); await arrears(); const { gatherAttention } = await import("../services/ownerAttention.js"); const texts = (await gatherAttention(db, () => new Date(), U.O1, ["finance", "service", "arrears"], dayPlus(0))).map((x) => x.message).sort();
    expect(alertsOf(await notes(OWNER())).map((x) => x.body).sort()).toEqual(texts);
  });
  it("keeps the expiry reminders it always had, alongside", async () => { await db.query(`UPDATE vehicles SET disc_expiry = $2 WHERE id = $1`, [V.v1, dayPlus(5)]); await fine(); const n = await notes(OWNER()); expect(n.notifications.some((x) => x.kind === "disc")).toBe(true); expect(alertsOf(n)).toHaveLength(1); });
});
