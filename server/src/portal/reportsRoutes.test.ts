/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import type { EmailMessage, EmailSender } from "../auth/email.js";

/**
 * The reports API through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "", sent: EmailMessage[] = [], mailFails = false;
const mailer: EmailSender = { name: "test", async send(m) { if (mailFails) throw new Error("Mailbox unavailable"); sent.push(m); } };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  sent = []; mailFails = false; db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", createAssociationRouter(db, () => NOW, mailer)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b);
const RP = (m: string, p: string, b?: unknown) => call(m, `/association/reports${p}`, U.A, "association", b), RB = (m: string, p: string, b?: unknown) => call(m, `/association/reports${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);

describe("packs and exports, through the routes", () => {
  it("offers the four packs and the three exports", async () => { const r = (await RP("GET", "/packs")).body; expect(r.packs.map((p: any) => p.id)).toEqual(["registration", "licences", "finance", "governance"]); expect(r.csv).toEqual(["members", "vehicles", "drivers"]); });
  it("downloads each pack as a PDF stamped with the association and the day, and records the download", async () => {
    for (const [pack, text] of [["registration", "Registration pack"], ["licences", "Licence compliance report"], ["finance", "Finance statement"], ["governance", "Governance report"]] as const) {
      const r = await raw(`/association/reports/pack/${pack}.pdf`, U.A); expect(r.status, pack).toBe(200); expect(r.type).toContain("application/pdf"); expect(r.disposition).toContain(`${pack}-`); expect(r.buf.subarray(0, 5).toString()).toBe("%PDF-"); const t = pdfText(r.buf); expect(t).toContain(text); expect(t).toContain("Langa Taxi Association"); expect(t).toContain("Generated by VINK on 2026-11-02");
    }
    expect((await q(`SELECT details FROM audit_log WHERE action = 'reports.download' ORDER BY created_at`)).length).toBe(4);
  });
  it("takes a month or a year for the finance statement, says what it covers, and refuses a pack that does not exist", async () => {
    await call("POST", "/association/finance/receipts", U.A, "association", { memberId: U.O1, amountCents: 60000, method: "eft", receivedOn: "2026-10-05", category: "membership" });
    const m = await raw("/association/reports/pack/finance.pdf?period=2026-10", U.A); expect(m.disposition).toContain("finance-2026-10.pdf"); expect(pdfText(m.buf).replace(/\s/g, " ")).toContain("R600,00"); expect(pdfText((await raw("/association/reports/pack/finance.pdf?period=nonsense", U.A)).buf)).toContain("Income statement, 2026");
    expect((await raw("/association/reports/pack/tax.pdf", U.A)).status).toBe(404); expect(pdfText((await raw("/association/reports/pack/registration.pdf", U.B)).buf)).toContain("Other Association"); expect(pdfText((await raw("/association/reports/pack/registration.pdf", U.B)).buf)).not.toContain("Olu Owner");
  });
  it("exports members, vehicles and drivers as CSV for the association only, and refuses anything else", async () => {
    await db.query(`INSERT INTO vehicles (owner_id, registration, make, seats) VALUES ($1,'CA 111-111','Toyota, Quantum',15)`, [U.O1]);
    const m = await raw("/association/reports/csv/members.csv", U.A); expect(m.type).toContain("text/csv"); expect(m.disposition).toContain("members-2026-11-02.csv"); expect(m.buf.toString("utf8")).toContain(`Olu Owner,${U.O1}@x.test`); expect(m.buf.toString("utf8")).not.toContain("Otto Owner");
    const v = (await raw("/association/reports/csv/vehicles.csv", U.A)).buf.toString("utf8"); expect(v).toContain("CA 111-111"); expect(v).toContain('"Toyota, Quantum"' ); expect((await raw("/association/reports/csv/drivers.csv", U.A)).status).toBe(200); expect((await raw("/association/reports/csv/secrets.csv", U.A)).status).toBe(404); expect((await raw("/association/reports/csv/vehicles.csv", U.B)).buf.toString("utf8")).not.toContain("CA 111-111");
    expect((await q(`SELECT action FROM audit_log WHERE action = 'reports.export'`)).length).toBe(3);
  });
});

describe("schedules and sending, through the routes", () => {
  const add = (o: any = {}) => RP("POST", "/schedules", { pack: "licences", frequency: "monthly", recipientLabel: "Executive", recipientEmail: "exco@langa.test", ...o });
  it("adds, lists, switches off and removes a schedule, validated, scoped to the association", async () => {
    for (const bad of [{ pack: "tax" }, { recipientEmail: "nope" }, { dayOfMonth: 40 }, { frequency: "daily" }]) expect((await add(bad)).status, JSON.stringify(bad)).toBe(400);
    const s = await add(); expect(s.status).toBe(201); expect((await add()).status).toBe(409); const list = (await RP("GET", "/schedules")).body; expect(list.emailConfigured).toBe(true); expect(list.schedules).toEqual([expect.objectContaining({ pack: "licences", frequency: "monthly", recipientLabel: "Executive", recipientEmail: "exco@langa.test", active: true, lastPeriod: null })]);
    expect((await RB("GET", "/schedules")).body.schedules).toEqual([]); expect((await RB("POST", `/schedules/${s.body.id}/active`, { active: false })).status).toBe(404); expect((await RP("POST", `/schedules/${s.body.id}/active`, { active: "no" })).status).toBe(400); expect((await RP("POST", "/schedules/nope/active", { active: true })).status).toBe(400);
    expect((await RP("POST", `/schedules/${s.body.id}/active`, { active: false })).status).toBe(200); expect((await RP("GET", "/schedules")).body.schedules[0].active).toBe(false); expect((await RB("DELETE", `/schedules/${s.body.id}`)).status).toBe(404); expect((await RP("DELETE", `/schedules/${s.body.id}`)).status).toBe(200); expect((await RP("DELETE", `/schedules/${s.body.id}`)).status).toBe(404);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'reports.schedule%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["reports.schedule.add", "reports.schedule.remove"]);
  });
  it("sends a report by email on request as a PDF, records it, and reports a failure with its reason", async () => {
    const s = (await add({ pack: "governance" })).body; expect((await RP("POST", `/schedules/${s.id}/send`)).status).toBe(200); expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject({ to: "exco@langa.test", subject: "Langa Taxi Association: Governance report (as at 2026-11-02)" }); expect(sent[0].attachments![0]).toMatchObject({ filename: "governance-2026-11-02.pdf", contentType: "application/pdf" }); expect(pdfText(sent[0].attachments![0].content)).toContain("Governance report");
    mailFails = true; const f = await RP("POST", `/schedules/${s.id}/send`); expect(f.status).toBe(502); expect(f.body.error).toContain("Mailbox unavailable"); expect((await RB("POST", `/schedules/${s.id}/send`)).status).toBe(404); expect((await RP("POST", "/schedules/nope/send")).status).toBe(400);
    const runs = (await RP("GET", "/runs")).body.runs; expect(runs.map((r: any) => [r.pack, r.recipient, r.ok, r.error]).sort((a: any[], b: any[]) => Number(a[2]) - Number(b[2]))).toEqual([["governance", "exco@langa.test", false, "Mailbox unavailable"], ["governance", "exco@langa.test", true, null]]);                  // both happened at the same frozen instant expect((await RB("GET", "/runs")).body.runs).toEqual([]); expect((await RP("GET", "/schedules")).body.schedules[0].lastError).toBe("Mailbox unavailable");
  });
});
