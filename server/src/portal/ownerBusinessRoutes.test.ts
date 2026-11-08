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
 * The owner's business record through the REAL portal router with real tokens: who may read and change it, what the activity log says about it (never the values), and that it heads the accountant's PDF.
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

const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const rawGet = (token: string, path: string) => fetch(`${url}/api/portal/owner${path}`, { headers: { Authorization: `Bearer ${token}` } });
const BIZ = { kind: "company", tradingName: "Langa Taxi Services", registeredName: "Langa Taxi Services (Pty) Ltd", registrationNumber: "2019/123456/07", vatNumber: "4123456789", phone: "082 123 4567", email: "Accounts@Langa.test", address: "12 Main Road, Langa" };

describe("who may read and change it", () => {
  it("lets the owner and a co-owner read and change it, the accountant only read it, and the fleet manager neither", async () => {
    expect((await call(OWNER(), "GET", "/finance/business")).body).toEqual({ success: true, business: null }); expect((await call(OWNER(), "PUT", "/finance/business", BIZ)).status).toBe(200); expect((await call(T("co_owner"), "PUT", "/finance/business", { ...BIZ, tradingName: "Langa Taxis" })).status).toBe(200);
    for (const [who, tk] of [["owner", OWNER()], ["co_owner", T("co_owner")], ["accountant", T("accountant")]] as const) { const r = await call(tk, "GET", "/finance/business"); expect(r.status, who).toBe(200); expect(r.body.business.tradingName, who).toBe("Langa Taxis"); }
    const a = await call(T("accountant"), "PUT", "/finance/business", BIZ); expect(a.status).toBe(403); expect(a.body.error).toBe("The accountant role can look at that but not change it"); expect((await call(T("accountant"), "DELETE", "/finance/business")).status).toBe(403);
    for (const m of ["GET", "PUT", "DELETE"]) { const f = await call(T("fleet_manager"), m, "/finance/business", m === "PUT" ? BIZ : undefined); expect(f.status, m).toBe(403); expect(f.body.error).toBe("The fleet manager role does not have access to that"); }
    expect((await call(OWNER(), "GET", "/finance/business")).body.business.tradingName).toBe("Langa Taxis");
  });
  it("keeps one owner's record from another's", async () => { await call(OWNER(), "PUT", "/finance/business", BIZ); const other = tok(U.O2, "ona"); expect((await call(other, "GET", "/finance/business")).body.business).toBeNull(); await call(other, "PUT", "/finance/business", { kind: "individual", tradingName: "Ona Minibus" }); expect((await call(OWNER(), "GET", "/finance/business")).body.business.tradingName).toBe("Langa Taxi Services"); expect((await call(other, "GET", "/finance/business")).body.business.tradingName).toBe("Ona Minibus"); });
  it("shows the server's reason when it is refused, and saves nothing", async () => { for (const [bad, why] of [[{ kind: "charity" }, /how you trade/], [{ tradingName: "" }, /name you trade under/], [{ vatNumber: "123" }, /ten digits/], [{ email: "x" }, /valid email/]] as const) { const r = await call(OWNER(), "PUT", "/finance/business", { ...BIZ, ...bad }); expect(r.status, JSON.stringify(bad)).toBe(400); expect(r.body.error).toMatch(why); } expect((await call(OWNER(), "GET", "/finance/business")).body.business).toBeNull(); });
});

describe("what is recorded, and what the activity log says", () => {
  it("records each save and delete under the person who did it, and the log names the fields, never the values", async () => {
    await call(T("co_owner"), "PUT", "/finance/business", BIZ); await call(T("co_owner"), "PUT", "/finance/business", { ...BIZ, vatNumber: "4999999999", tradingName: "Langa Taxis" }); await call(OWNER(), "DELETE", "/finance/business");
    const a = await q(`SELECT action, actor_id, details FROM audit_log WHERE action LIKE 'owner.business.%' ORDER BY created_at`); expect(a.map((r) => [r.action, r.actor_id])).toEqual([["owner.business.save", ids.co_owner], ["owner.business.save", ids.co_owner], ["owner.business.remove", U.O1]]); const all = JSON.stringify(a); for (const v of ["4999999999", "4123456789", "Langa Taxi", "2019/123456", "082 123", "12 Main"]) expect(all).not.toContain(v);
    const log = (await call(OWNER(), "GET", "/audit")).body.entries.map((e: any) => [e.actor, e.text]); expect(log).toEqual([["Olu Owner", "Deleted the business details"], ["co_owner person", "Saved the business details: changed the trading name, the VAT number"], ["co_owner person", "Saved the business details: changed how you trade, the trading name, the registered name, the registration number, the VAT number, the phone number, the email address, the address"]]);
    expect((await call(OWNER(), "GET", "/audit?group=documents")).body.entries).toHaveLength(3);
  });
});

describe("the accountant's PDF", () => {
  it("is headed with the business: the name it trades under, how, and the numbers, and says whose records they are", async () => {
    await call(OWNER(), "PUT", "/finance/business", BIZ); const r = await rawGet(OWNER(), "/finance/export/profit.pdf"); expect(r.status).toBe(200); const t = pdfText(Buffer.from(await r.arrayBuffer()));
    for (const s of ["The business", "Langa Taxi Services", "A company", "Langa Taxi Services (Pty) Ltd", "2019/123456/07", "4123456789", "12 Main Road, Langa", "+27821234567", "accounts@langa.test", "from Langa Taxi Services's own records"]) expect(t, s).toContain(s);
  });
  it("falls back to the owner's name when there is no record, and shows another owner nothing of it", async () => {
    let t = pdfText(Buffer.from(await (await rawGet(OWNER(), "/finance/export/profit.pdf")).arrayBuffer())); expect(t).toContain("Olu Owner"); expect(t).not.toContain("The business"); await call(OWNER(), "PUT", "/finance/business", BIZ); t = pdfText(Buffer.from(await (await rawGet(tok(U.O2, "ona"), "/finance/export/profit.pdf")).arrayBuffer())); expect(t).toContain("Ona Owner"); expect(t).not.toContain("Langa Taxi Services");
  });
});
