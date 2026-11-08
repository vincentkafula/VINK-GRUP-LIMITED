/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import type { SmsSender } from "../services/alerts.js";
import { delegateGate } from "./delegateGate.js";
import { createDelegates } from "../services/delegates.js";

/**
 * The owner's text alerts through the real owner router, with a stand-in SMS sender that records what it was asked to send, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02", L = { a: id(30), b: id(31), c: id(32), d: id(33) };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "", smsName = "twilio", smsFail = false; const sentSms: { to: string; text: string }[] = [];
const SMS: SmsSender = { get name() { return smsName; }, async send(to, text) { if (smsFail) throw new Error("gateway down"); sentSms.push({ to, text }); } };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($1,$3,'active','owner'),($4,$5,'active','owner')`, [U.O1, U.D2, U.D3, U.O3, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CB 444-444','Toyota',15)`, [V.v1, U.O1, V.v2, V.v4, U.O3]);
  await db.query(`INSERT INTO driver_profiles (user_id, licence_code, licence_expiry, pdp_number, pdp_expiry) VALUES ($1,'EC1',$3,'PDP-2',$3),($2,'EC1',$3,'PDP-3',$4)`, [U.D2, U.D3, plus(400), plus(-10)]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW, undefined, undefined, { sms: SMS }));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}

const S = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/sms${p}`, who, "vehicle_owner", b);
const S1 = (m: string, p: string, b?: unknown) => S(U.O1, m, p, b), S3 = (m: string, p: string, b?: unknown) => S(U.O3, m, p, b);
const lastCode = () => { const m = sentSms.at(-1)!.text.match(/code is (\d{6})/); expect(m).not.toBeNull(); return m![1]; };
beforeEach(() => { sentSms.length = 0; smsName = "twilio"; smsFail = false; });

describe("setting up text alerts, through the owner routes", () => {
  it("goes from nothing, to a number, to a code, to confirmed, to switched on, to a test message, and shows only the end of the number", async () => {
    expect((await S1("GET", "")).body).toMatchObject({ success: true, available: true, phone: null, verified: false, enabled: false, kinds: [] }); expect((await S1("GET", "")).body.kindList.map((k: any) => k.key)).toEqual(["finance", "service", "compliance", "arrears"]);
    const p = await S1("POST", "/phone", { phone: "082 123 4567" }); expect(p.status).toBe(200); expect(p.body.phone).toBe("+27 ••••• 4567"); expect(JSON.stringify(p.body)).not.toContain("8212"); expect(sentSms[0].to).toBe("+27821234567");
    expect((await S1("POST", "/verify", { code: "000000" === lastCode() ? "111111" : "000000" })).status).toBe(400); expect((await S1("POST", "/verify", { code: lastCode() })).body).toMatchObject({ success: true, verified: true });
    expect((await S1("PUT", "/settings", { enabled: true, kinds: ["finance", "service"] })).body).toMatchObject({ success: true, enabled: true, kinds: ["finance", "service"] }); expect((await S1("POST", "/test")).status).toBe(200); expect(sentSms.at(-1)!.text).toBe("VINK: this is a test. Your text alerts are working.");
    expect((await S1("GET", "")).body).toMatchObject({ phone: "+27 ••••• 4567", verified: true, enabled: true, kinds: ["finance", "service"] }); expect(JSON.stringify((await S1("GET", "")).body)).not.toContain("821234567");
  });
  it("shows the server's reason for each mistake: a bad number, a bad code, switching on before confirming, a bad choice, no SMS service, a failed send", async () => {
    expect((await S1("POST", "/phone", { phone: "hello" })).status).toBe(400); expect((await S1("POST", "/phone", {})).status).toBe(400); expect((await S1("POST", "/verify", { code: "123456" })).status).toBe(404); expect((await S1("PUT", "/settings", { enabled: true, kinds: ["finance"] })).status).toBe(409); expect((await S1("POST", "/test")).status).toBe(409);
    await S1("POST", "/phone", { phone: "0821234567" }); await S1("POST", "/verify", { code: lastCode() }); expect((await S1("PUT", "/settings", { enabled: true, kinds: ["marketing"] })).status).toBe(400); expect((await S1("PUT", "/settings", { enabled: true, kinds: [] })).body.error).toBe("Choose at least one kind of alert to switch on");
    smsName = "unconfigured"; const u = await S1("POST", "/phone", { phone: "0821234567" }); expect(u.status).toBe(503); expect(u.body.error).toContain("not switched on yet"); expect((await S1("GET", "")).body.available).toBe(false);
    smsName = "twilio"; smsFail = true; expect((await S1("POST", "/phone", { phone: "0821234567" })).status).toBe(502);
  });
  it("deletes the number and every choice, and does not touch another owner's", async () => {
    await S1("POST", "/phone", { phone: "0821234567" }); await S1("POST", "/verify", { code: lastCode() }); await S3("POST", "/phone", { phone: "0839998888" }); await S3("POST", "/verify", { code: lastCode() }); expect((await S1("DELETE", "")).body).toMatchObject({ success: true, removed: true }); expect((await S1("GET", "")).body).toMatchObject({ phone: null, verified: false }); expect((await S3("GET", "")).body).toMatchObject({ phone: "+27 ••••• 8888", verified: true }); expect((await S1("DELETE", "")).body.removed).toBe(false);
  });
  it("keeps the number and the code out of the audit record, and records each step", async () => {
    await S1("POST", "/phone", { phone: "0821234567" }); const code = lastCode(); await S1("POST", "/verify", { code }); await S1("PUT", "/settings", { enabled: true, kinds: ["compliance"] }); await S1("POST", "/test"); await S1("DELETE", "");
    const a = await q(`SELECT action, target, details FROM audit_log WHERE action LIKE 'sms.%' ORDER BY created_at`); expect(a.map((r) => r.action)).toEqual(["sms.phone", "sms.verify", "sms.settings", "sms.test", "sms.remove"]); const all = JSON.stringify(a); expect(all).not.toContain("821234567"); expect(all).not.toContain("+27"); expect(all).not.toContain(code); expect(typeof a[2].details === "string" ? JSON.parse(a[2].details) : a[2].details).toEqual({ enabled: true, kinds: ["compliance"] });
    expect(JSON.stringify(await q(`SELECT * FROM owner_sms_log`))).not.toContain("+2782");
  });
});
