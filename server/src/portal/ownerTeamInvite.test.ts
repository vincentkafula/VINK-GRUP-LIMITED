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
import { configureInvitations } from "../services/invitations.js";

/**
 * Inviting an owner's team by email through the REAL portal router with real tokens: the owner can give a login with an emailed invitation instead of a password, and nothing is left behind if the email cannot be sent.
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
afterEach(() => { configureInvitations(null); return new Promise<void>((ok) => server.close(() => ok())); });

let sentTo: { id: string; by: string; what: string }[], failInvite: boolean;
const FLOWS = { async invite(userId: string, o: { by: string; what: string }) { if (failInvite) throw new Error("provider down"); sentTo.push({ id: userId, ...o }); } } as any;
const NEW = { name: "Sipho Dube", email: "sipho@x.test", username: "sipho", role: "fleet_manager" };
beforeEach(() => { sentTo = []; failInvite = false; configureInvitations({ flows: FLOWS, mailName: "resend" }); });
const users = async () => Number((await q(`SELECT COUNT(*) AS n FROM users`))[0].n);

describe("giving a login with an invitation", () => {
  it("makes the login, emails the invitation naming the owner and the business, and hands back NO password", async () => {
    const r = await call(OWNER(), "POST", "/team", { ...NEW, invite: true }); expect(r.status).toBe(201); expect(r.body).toEqual({ success: true, id: expect.any(String), username: "sipho", invited: true }); expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    expect(sentTo).toEqual([{ id: r.body.id, by: "Olu Owner", what: "help run Olu Owner's business" }]); expect((await call(OWNER(), "GET", "/team")).body.team.map((x: any) => x.username)).toContain("sipho");
    const u = (await q(`SELECT password_hash FROM users WHERE id = $1`, [r.body.id]))[0]; expect(u.password_hash).toBeTruthy();                  // an unusable random password: nobody knows it
  });
  it("names the business the owner trades as, when they have recorded one", async () => { await call(OWNER(), "PUT", "/finance/business", { kind: "company", tradingName: "Langa Taxi Services" }); await call(OWNER(), "POST", "/team", { ...NEW, invite: true }); expect(sentTo[0].what).toBe("help run Langa Taxi Services"); });
  it("still gives a one-time password when no invitation is asked for", async () => { const r = await call(OWNER(), "POST", "/team", NEW); expect(r.status).toBe(201); expect(r.body.temporaryPassword.length).toBeGreaterThanOrEqual(15); expect(r.body.invited).toBeUndefined(); expect(sentTo).toEqual([]); });
  it("says it cannot, and makes nobody, when email is not set up or invitations are not switched on", async () => {
    const before = await users(); configureInvitations({ flows: FLOWS, mailName: "unconfigured" }); const a = await call(OWNER(), "POST", "/team", { ...NEW, invite: true }); expect(a.status).toBe(503); expect(a.body.error).toContain("Email is not set up yet"); configureInvitations(null); expect((await call(OWNER(), "POST", "/team", { ...NEW, invite: true })).status).toBe(503); expect(await users()).toBe(before); expect(sentTo).toEqual([]);
  });
  it("takes the new login back, so the same username can be tried again, when the email cannot be sent", async () => {
    const before = await users(); failInvite = true; const r = await call(OWNER(), "POST", "/team", { ...NEW, invite: true }); expect(r.status).toBe(502); expect(r.body.error).toContain("could not be emailed"); expect(await users()).toBe(before); expect((await call(OWNER(), "GET", "/team")).body.team.map((x: any) => x.username)).not.toContain("sipho");
    failInvite = false; expect((await call(OWNER(), "POST", "/team", { ...NEW, invite: true })).status).toBe(201); expect(sentTo).toHaveLength(1);
  });
  it("refuses a bad request before anything is made or sent, with the reason", async () => { const before = await users(); for (const [bad, why] of [[{ email: "nope" }, /email/], [{ username: "ab" }, /username/], [{ role: "king" }, /co-owner/]] as const) { const r = await call(OWNER(), "POST", "/team", { ...NEW, invite: true, ...bad }); expect(r.status).toBe(400); expect(r.body.error).toMatch(why); } expect(await users()).toBe(before); expect(sentTo).toEqual([]); });
  it("does not take back a login that someone has already signed in with", async () => { const t = createOwnerTeam(db), made = await t.create(U.O1, { ...NEW, username: "used", email: "used@x.test" }) as any; await db.query(`UPDATE users SET last_login = now() WHERE id = $1`, [made.value.id]); expect(await t.discard(U.O1, made.value.id)).toMatchObject({ ok: false, status: 409 }); expect((await t.list(U.O1)).map((x) => x.username)).toContain("used"); expect(await t.discard(U.O2, made.value.id)).toMatchObject({ ok: false, status: 404 }); });
});

describe("sending an invitation again", () => {
  it("emails a new link to one of the owner's own people, and records it", async () => { const r = await call(OWNER(), "POST", `/team/${ids.accountant}/invite`); expect(r.status).toBe(200); expect(sentTo).toEqual([{ id: ids.accountant, by: "Olu Owner", what: "help run Olu Owner's business" }]); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'team.invite'`)).length).toBe(1); });
  it("refuses another owner's person, a bad id, and every team role, and sends nothing", async () => {
    expect((await call(tok(U.O2, "ona"), "POST", `/team/${ids.accountant}/invite`)).status).toBe(404); expect((await call(OWNER(), "POST", "/team/nope/invite")).status).toBe(400); for (const role of ["co_owner", "fleet_manager", "accountant"] as const) expect((await call(T(role), "POST", `/team/${ids.accountant}/invite`)).status, role).toBe(403); expect(sentTo).toEqual([]);
  });
  it("sends at most five a day to the same person, and says when the email fails", async () => { for (let i = 0; i < 5; i++) expect((await call(OWNER(), "POST", `/team/${ids.accountant}/invite`)).status).toBe(200); expect((await call(OWNER(), "POST", `/team/${ids.accountant}/invite`)).status).toBe(429); expect((await call(OWNER(), "POST", `/team/${ids.co_owner}/invite`)).status).toBe(200); failInvite = true; expect((await call(OWNER(), "POST", `/team/${ids.fleet_manager}/invite`)).status).toBe(502); });
  it("says what is available, so the screen can offer it", async () => { expect((await call(OWNER(), "GET", "/team")).body.invitationsAvailable).toBe(true); configureInvitations({ flows: FLOWS, mailName: "unconfigured" }); expect((await call(OWNER(), "GET", "/team")).body.invitationsAvailable).toBe(false); configureInvitations(null); expect((await call(OWNER(), "GET", "/team")).body.invitationsAvailable).toBe(false); });
});

describe("what the activity log says", () => {
  it("says a login was given with an invitation, and that one was sent again, never showing a link", async () => { const r = await call(OWNER(), "POST", "/team", { ...NEW, invite: true }); await call(OWNER(), "POST", `/team/${r.body.id}/invite`); const log = (await call(OWNER(), "GET", "/audit?group=team")).body.entries.map((e: any) => e.text); expect(log).toEqual(["Emailed an invitation to Sipho Dube", "Gave a new login to sipho as fleet manager and emailed them an invitation"]); expect(JSON.stringify(await q(`SELECT details FROM audit_log`))).not.toMatch(/token|reset-password|http/); });
});
