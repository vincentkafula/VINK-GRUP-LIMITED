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

/**
 * The association's email digest through the real routers and the gate: the main login only, with a recording stand-in for the mail. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "", mailName = "resend", sentMail: { to: string; subject: string; text: string }[] = [], failMail = false;
const MAIL: any = { get name() { return mailName; }, async send(m: any) { if (failMail) throw new Error("provider down"); sentMail.push(m); } };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  mailName = "resend"; sentMail = []; failMail = false; db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW, MAIL)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b), B = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);


const OWN = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, U.A, "association", b), OTH = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, U.B, "association", b), AS = (who: string, m: string, p: string, b?: unknown) => call(m, `/association${p}`, who, "association", b);
async function login(role: string, o: any = {}) { const r = await OWN("POST", "/delegates", { name: `${role} person`, email: `${role}@langa.test`, username: `${role}1`, role, ...o }); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body as { id: string; username: string; temporaryPassword: string }; }

const D = { enabled: true, frequency: "weekly", weekday: 3, recipients: ["chair@langa.test", "sec@langa.test"] };

describe("the digest settings", () => {
  it("start off, say whether email is set up, and keep what the main login chooses", async () => {
    const a = await OWN("GET", "/digest"); expect(a.status).toBe(200); expect(a.body).toMatchObject({ success: true, emailAvailable: true, settings: { enabled: false, frequency: "weekly", recipients: [], when: "every Monday" }, history: [] });
    const p = await OWN("PUT", "/digest", D); expect(p.status).toBe(200); expect(p.body.settings).toMatchObject({ enabled: true, weekday: 3, recipients: ["chair@langa.test", "sec@langa.test"], when: "every Wednesday" }); expect((await OWN("GET", "/digest")).body.settings.enabled).toBe(true);
    mailName = "unconfigured"; expect((await OWN("GET", "/digest")).body.emailAvailable).toBe(false);
  });
  it("shows the reason for each mistake and keeps nothing", async () => { for (const [bad, why] of [[{ frequency: "daily" }, /weekly or monthly/], [{ recipients: ["nope"] }, /not a valid email/], [{ recipients: [] }, /at least one email/], [{ weekday: 9 }, /day of the week/]] as const) { const r = await OWN("PUT", "/digest", { ...D, ...bad }); expect(r.status, JSON.stringify(bad)).toBe(400); expect(r.body.error).toMatch(why); } expect((await OWN("GET", "/digest")).body.settings.enabled).toBe(false); });
  it("records that it was changed, how often, and how many addresses: never the addresses", async () => { await OWN("PUT", "/digest", D); await OWN("POST", "/digest/test"); const a = await q(`SELECT action, details FROM audit_log WHERE action LIKE 'digest.%' ORDER BY created_at`); expect(a.map((r) => r.action)).toEqual(["digest.save", "digest.test"]); const all = a.map((r) => (typeof r.details === "string" ? r.details : JSON.stringify(r.details))).join(" "); expect(all).toMatch(/"recipients":\s*2/); expect(all).not.toMatch(/@langa\.test|chair|sec@/); });
  it("keeps one association's digest from another's", async () => { await OWN("PUT", "/digest", D); expect((await OTH("GET", "/digest")).body.settings.recipients).toEqual([]); await OTH("PUT", "/digest", { ...D, recipients: ["b@other.test"] }); expect((await OWN("GET", "/digest")).body.settings.recipients).toEqual(["chair@langa.test", "sec@langa.test"]); expect((await OTH("GET", "/digest")).body.settings.recipients).toEqual(["b@other.test"]); });
});

describe("the preview and the test send", () => {
  it("shows what it would say today, for this association only, and sends nothing", async () => { const r = await OWN("GET", "/digest/preview"); expect(r.status).toBe(200); expect(r.body.subject).toContain("Langa Taxi Association"); expect(r.body.text).toContain("Open the dashboard:"); expect(typeof r.body.needsAttention).toBe("number"); expect(r.body.html).toBeUndefined(); expect(sentMail).toEqual([]); expect((await OTH("GET", "/digest/preview")).body.subject).toContain("Other Association"); });
  it("sends a test to the chosen addresses, three a day at most, and says why when it cannot", async () => {
    expect((await OWN("POST", "/digest/test")).status).toBe(409); await OWN("PUT", "/digest", D); const r = await OWN("POST", "/digest/test"); expect(r.status).toBe(200); expect(r.body).toMatchObject({ sent: 2, failed: 0 }); expect(sentMail.map((m) => m.to)).toEqual(["chair@langa.test", "sec@langa.test"]); expect(sentMail[0].subject).toContain("Langa Taxi Association");
    await OWN("POST", "/digest/test"); await OWN("POST", "/digest/test"); const fourth = await OWN("POST", "/digest/test"); expect(fourth.status).toBe(429); expect(fourth.body.error).toContain("test emails today");
  });
  it("says when email is not set up or the send fails, never repeating the provider's message", async () => { await OWN("PUT", "/digest", D); mailName = "unconfigured"; const a = await OWN("POST", "/digest/test"); expect(a.status).toBe(503); expect(a.body.error).toContain("Email is not set up"); mailName = "resend"; failMail = true; const b = await OWN("POST", "/digest/test"); expect(b.status).toBe(502); expect(JSON.stringify(b.body)).not.toContain("provider down"); });
  it("lists what was sent, newest first, in the association's own record", async () => { await OWN("PUT", "/digest", D); await OWN("POST", "/digest/test"); const h = (await OWN("GET", "/digest")).body.history; expect(h).toHaveLength(1); expect(h[0]).toMatchObject({ status: "test", recipients: 2 }); expect((await OTH("GET", "/digest")).body.history).toEqual([]); });
});

describe("who may reach it", () => {
  it("is refused to every named office bearer, for every part of it, and nothing is sent", async () => {
    const roles = ["chairperson", "secretary", "treasurer", "viewer"]; await OWN("PUT", "/digest", D);
    for (const role of roles) { const d = await login(role, { username: `d${role}`, email: `d${role}@langa.test` }); for (const [m, p, b] of [["GET", "/digest"], ["PUT", "/digest", D], ["GET", "/digest/preview"], ["POST", "/digest/test"]] as const) { const r = await AS(d.id, m, p, b); expect(r.status, `${role} ${m} ${p}`).toBe(403); } }
    expect(sentMail).toEqual([]); expect((await OWN("GET", "/digest")).body.settings.recipients).toHaveLength(2);
  });
});
