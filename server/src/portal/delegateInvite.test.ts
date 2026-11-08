/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { delegateGate } from "./delegateGate.js";
import bcrypt from "bcryptjs";
import { configureInvitations } from "../services/invitations.js";

/**
 * Emailed invitations to an association's named office-bearer logins, through the real routers and the gate, with a stand-in for the authentication flows. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "";
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => { configureInvitations(null); return new Promise<void>((ok) => server.close(() => ok())); });
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b), B = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);


const OWN = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, U.A, "association", b), OTH = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, U.B, "association", b), AS = (who: string, m: string, p: string, b?: unknown) => call(m, `/association${p}`, who, "association", b);
async function login(role: string, o: any = {}) { const r = await OWN("POST", "/delegates", { name: `${role} person`, email: `${role}@langa.test`, username: `${role}1`, role, ...o }); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body as { id: string; username: string; temporaryPassword: string }; }

let sentTo: { id: string; by: string; what: string }[], failInvite: boolean;
const FLOWS = { async invite(userId: string, o: { by: string; what: string }) { if (failInvite) throw new Error("provider down"); sentTo.push({ id: userId, ...o }); } } as any;
const NEW = { name: "Sipho Dube", email: "sipho@langa.test", username: "sipho", role: "treasurer" };
beforeEach(() => { sentTo = []; failInvite = false; configureInvitations({ flows: FLOWS, mailName: "resend" }); });
const users = async () => Number((await q(`SELECT COUNT(*) AS n FROM users`))[0].n);

describe("giving an office bearer a login with an invitation", () => {
  it("makes the login, emails the invitation in the association's name, and hands back NO password", async () => {
    const r = await OWN("POST", "/delegates", { ...NEW, invite: true }); expect(r.status).toBe(201); expect(r.body).toEqual({ success: true, id: expect.any(String), username: "sipho", invited: true }); expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    expect(sentTo).toEqual([{ id: r.body.id, by: "Langa Taxi Association", what: "help run Langa Taxi Association" }]); expect((await OWN("GET", "/delegates")).body.delegates.map((d: any) => d.username)).toContain("sipho");
  });
  it("still gives a one-time password when no invitation is asked for", async () => { const r = await OWN("POST", "/delegates", NEW); expect(r.status).toBe(201); expect(r.body.temporaryPassword.length).toBeGreaterThanOrEqual(15); expect(r.body.invited).toBeUndefined(); expect(sentTo).toEqual([]); });
  it("says it cannot, and makes nobody, when email is not set up or invitations are not switched on", async () => {
    const before = await users(); configureInvitations({ flows: FLOWS, mailName: "unconfigured" }); const a = await OWN("POST", "/delegates", { ...NEW, invite: true }); expect(a.status).toBe(503); expect(a.body.error).toContain("Email is not set up yet"); configureInvitations(null); expect((await OWN("POST", "/delegates", { ...NEW, invite: true })).status).toBe(503); expect(await users()).toBe(before); expect(sentTo).toEqual([]);
  });
  it("takes the new login back, and says so on the record, when the email cannot be sent, so the same username can be tried again", async () => {
    const before = await users(); failInvite = true; const r = await OWN("POST", "/delegates", { ...NEW, invite: true }); expect(r.status).toBe(502); expect(await users()).toBe(before); expect((await OWN("GET", "/delegates")).body.delegates.map((d: any) => d.username)).not.toContain("sipho");
    expect((await q(`SELECT summary FROM register_changes WHERE summary LIKE '%taken back before it was used%'`)).length).toBe(1); failInvite = false; expect((await OWN("POST", "/delegates", { ...NEW, invite: true })).status).toBe(201);
  });
  it("refuses a bad request before anything is made or sent", async () => { const before = await users(); for (const bad of [{ email: "nope" }, { username: "ab" }, { role: "king" }]) expect((await OWN("POST", "/delegates", { ...NEW, invite: true, ...bad })).status).toBe(400); expect(await users()).toBe(before); expect(sentTo).toEqual([]); });
});

describe("sending an invitation again", () => {
  it("emails a new link to one of the association's own people, records it, and refuses another association's, a bad id and every office bearer", async () => {
    const d = await login("viewer"); expect((await OWN("POST", `/delegates/${d.id}/invite`)).status).toBe(200); expect(sentTo).toEqual([{ id: d.id, by: "Langa Taxi Association", what: "help run Langa Taxi Association" }]); expect((await q(`SELECT action FROM audit_log WHERE action = 'delegate.invite'`)).length).toBe(1);
    expect((await OTH("POST", `/delegates/${d.id}/invite`)).status).toBe(404); expect((await OWN("POST", "/delegates/nope/invite")).status).toBe(400); for (const role of ["chairperson", "secretary", "treasurer", "viewer"]) { const p = await login(role === "viewer" ? "viewer" : role, { username: `x${role}`, email: `x${role}@langa.test` }).catch(() => null); const who = p?.id ?? d.id; expect((await AS(who, "POST", `/delegates/${d.id}/invite`)).status, role).toBe(403); } expect(sentTo).toHaveLength(1);
  });
  it("sends at most five a day to the same person, and says when the email fails", async () => { const d = await login("secretary"); for (let i = 0; i < 5; i++) expect((await OWN("POST", `/delegates/${d.id}/invite`)).status).toBe(200); expect((await OWN("POST", `/delegates/${d.id}/invite`)).status).toBe(429); const e = await login("treasurer"); failInvite = true; expect((await OWN("POST", `/delegates/${e.id}/invite`)).status).toBe(502); });
  it("says whether invitations are available, so the screen can offer them", async () => { expect((await OWN("GET", "/delegates")).body.invitationsAvailable).toBe(true); configureInvitations({ flows: FLOWS, mailName: "unconfigured" }); expect((await OWN("GET", "/delegates")).body.invitationsAvailable).toBe(false); configureInvitations(null); expect((await OWN("GET", "/delegates")).body.invitationsAvailable).toBe(false); });
  it("does not take back a login that has been used", async () => { const d = await login("chairperson"); await db.query(`UPDATE users SET last_login = now() WHERE id = $1`, [d.id]); const { createDelegates } = await import("../services/delegates.js"); expect(await createDelegates(db).discard(U.A, U.A, d.id)).toMatchObject({ ok: false, status: 409 }); expect(await createDelegates(db).discard(U.B, U.B, d.id)).toMatchObject({ ok: false, status: 404 }); });
});
