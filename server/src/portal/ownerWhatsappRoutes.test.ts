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
import { configureOwnerWhatsapp } from "../services/ownerWhatsapp.js";
import { createOwnerTeam, type OwnerTeam, type TeamRole } from "../services/ownerTeam.js";

/**
 * The owner's WhatsApp alerts through the REAL portal router with real tokens: the owner's own login only, consent required, and nothing about the number or the messages kept in the record. The WhatsApp client is a stand-in.
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
afterEach(() => { configureOwnerWhatsapp(null); return new Promise<void>((ok) => server.close(() => ok())); });

let wa: { to: string; name: string; params: string[] }[] = [], failWa = false;
const WA: any = { async sendTemplate(to: string, name: string, _l: string, params: string[] = []) { if (failWa) return { ok: false, error: "secret provider detail" }; wa.push({ to, name, params }); return { ok: true, id: "wamid.1" }; }, async sendText() { return { ok: true, id: "x" }; }, async markRead() { /* nothing */ } };
const CFG: any = { phoneNumberId: "1", token: "t", verifyToken: "v", appSecret: "s", number: "27600000000", reopenTemplate: "", reopenLanguage: "en", graphVersion: "v21.0" };
const on = (env: any = { WHATSAPP_ALERT_TEMPLATE: "vink_owner_alert" }) => configureOwnerWhatsapp({ wa: WA, config: CFG, env });
const confirm = async (owner = U.O1, phone = "+27821234567") => { await db.query(`DELETE FROM owner_sms WHERE owner_id = $1`, [owner]); await db.query(`INSERT INTO owner_sms (owner_id, phone, verified_at, enabled, kinds) VALUES ($1,$2,now(),false,'[]')`, [owner, phone]); };
const SET = { enabled: true, kinds: ["finance", "service"], consent: true };
beforeEach(() => { wa = []; failWa = false; on(); });

describe("who may reach it", () => {
  it("is for the owner's own login only: every team role is refused every part of it, and nothing is changed or sent", async () => {
    await confirm(); expect((await call(OWNER(), "PUT", "/whatsapp/settings", SET)).status).toBe(200);
    for (const role of ["co_owner", "fleet_manager", "accountant"] as const) for (const [m, p, b] of [["GET", "/whatsapp"], ["PUT", "/whatsapp/settings", { ...SET, enabled: false }], ["POST", "/whatsapp/test"], ["DELETE", "/whatsapp"]] as const) { const r = await call(T(role), m, p, b); expect(r.status, `${role} ${m} ${p}`).toBe(403); expect(r.body.error).toBe("That is for the owner's own login only"); }
    expect((await call(OWNER(), "GET", "/whatsapp")).body).toMatchObject({ enabled: true }); expect(wa).toEqual([]);
  });
});

describe("the settings", () => {
  it("say it is available, that no number is confirmed yet, and what can be chosen", async () => { const r = await call(OWNER(), "GET", "/whatsapp"); expect(r.status).toBe(200); expect(r.body).toMatchObject({ success: true, available: true, reason: null, numberConfirmed: false, number: null, enabled: false, consentOn: null, kinds: [] }); expect(r.body.kindList.map((k: any) => k.key)).toEqual(["finance", "service", "compliance", "arrears"]); });
  it("say when WhatsApp or the template is not set up, and refuse to switch on, without breaking anything else", async () => { await confirm(); on({}); const a = await call(OWNER(), "GET", "/whatsapp"); expect(a.body).toMatchObject({ available: false }); expect(a.body.reason).toContain("template has not been approved"); const b = await call(OWNER(), "PUT", "/whatsapp/settings", SET); expect(b.status).toBe(503); configureOwnerWhatsapp(null); expect((await call(OWNER(), "GET", "/whatsapp")).body.reason).toBe("WhatsApp is not set up on this server yet"); expect((await call(OWNER(), "PUT", "/whatsapp/settings", { enabled: false, kinds: [] })).status).toBe(200); });
  it("need the number to be confirmed under Text alerts, the owner's agreement and a kind, each with its reason", async () => {
    let r = await call(OWNER(), "PUT", "/whatsapp/settings", SET); expect(r.status).toBe(409); expect(r.body.error).toContain("Confirm your mobile number under Text alerts first"); await confirm();
    r = await call(OWNER(), "PUT", "/whatsapp/settings", { ...SET, consent: undefined }); expect(r.status).toBe(400); expect(r.body.error).toContain("Tick the box"); r = await call(OWNER(), "PUT", "/whatsapp/settings", { ...SET, kinds: [] }); expect(r.status).toBe(400); expect(r.body.error).toContain("at least one kind"); r = await call(OWNER(), "PUT", "/whatsapp/settings", { ...SET, kinds: ["weather"] }); expect(r.status).toBe(400);
    r = await call(OWNER(), "PUT", "/whatsapp/settings", SET); expect(r.status).toBe(200); expect(r.body).toMatchObject({ enabled: true, kinds: ["finance", "service"], numberConfirmed: true }); expect(r.body.number).toMatch(/4567$/); expect(r.body.consentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(JSON.stringify(r.body)).not.toContain("+27821234567");
  });
  it("keep one owner's choices from another's", async () => { await confirm(); await confirm(U.O2, "+27839998888"); await call(OWNER(), "PUT", "/whatsapp/settings", SET); const other = tok(U.O2, "ona"); expect((await call(other, "GET", "/whatsapp")).body).toMatchObject({ enabled: false, kinds: [], consentOn: null }); await call(other, "PUT", "/whatsapp/settings", { ...SET, kinds: ["arrears"] }); expect((await call(OWNER(), "GET", "/whatsapp")).body.kinds).toEqual(["finance", "service"]); expect((await call(other, "GET", "/whatsapp")).body.kinds).toEqual(["arrears"]); });
  it("are withdrawn by deleting them, which forgets the agreement too", async () => { await confirm(); await call(OWNER(), "PUT", "/whatsapp/settings", SET); expect((await call(OWNER(), "DELETE", "/whatsapp")).body).toMatchObject({ removed: true }); expect((await call(OWNER(), "GET", "/whatsapp")).body).toMatchObject({ enabled: false, consentOn: null, kinds: [] }); });
});

describe("the test message", () => {
  it("is sent to the confirmed number with the real template, and limited to three a day", async () => {
    await confirm(); await call(OWNER(), "PUT", "/whatsapp/settings", SET); const r = await call(OWNER(), "POST", "/whatsapp/test"); expect(r.status).toBe(200); expect(wa).toEqual([{ to: "27821234567", name: "vink_owner_alert", params: ["this is only a test", "Nothing needs you. This is a test of your VINK WhatsApp alerts."] }]);
    await call(OWNER(), "POST", "/whatsapp/test"); await call(OWNER(), "POST", "/whatsapp/test"); const fourth = await call(OWNER(), "POST", "/whatsapp/test"); expect(fourth.status).toBe(429); expect(fourth.body.error).toContain("test messages today");
  });
  it("says why when it cannot be sent, never repeating the provider's words", async () => { let r = await call(OWNER(), "POST", "/whatsapp/test"); expect(r.status).toBe(409); await confirm(); await call(OWNER(), "PUT", "/whatsapp/settings", SET); failWa = true; r = await call(OWNER(), "POST", "/whatsapp/test"); expect(r.status).toBe(502); expect(JSON.stringify(r.body)).not.toContain("secret provider detail"); });
});

describe("what is recorded", () => {
  it("is that it was changed or tested, and how many kinds: never the number, never a message", async () => {
    await confirm(); await call(OWNER(), "PUT", "/whatsapp/settings", SET); await call(OWNER(), "POST", "/whatsapp/test"); await call(OWNER(), "DELETE", "/whatsapp"); const a = await q(`SELECT action, details FROM audit_log WHERE action LIKE 'owner.whatsapp.%' ORDER BY created_at`); expect(a.map((r) => r.action)).toEqual(["owner.whatsapp.settings", "owner.whatsapp.test", "owner.whatsapp.remove"]);
    const all = a.map((r) => (typeof r.details === "string" ? r.details : JSON.stringify(r.details))).join(" "); expect(all).toMatch(/"kinds":\s*2/); expect(all).not.toMatch(/\+?27821234567|0821234567|test of your VINK|WesBank/);
  });
  it("stays out of the activity log the owner reads, like the text alert settings", async () => { await confirm(); await call(OWNER(), "PUT", "/whatsapp/settings", SET); const log = (await call(OWNER(), "GET", "/audit")).body.entries; expect(JSON.stringify(log)).not.toMatch(/whatsapp/i); });
});
