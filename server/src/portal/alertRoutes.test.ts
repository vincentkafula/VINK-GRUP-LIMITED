import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createCommission, type Commission } from "../services/commission.js";
import { configureAlerts, type SmsSender } from "../services/alerts.js";
import { createLetterCheckRouter } from "../routes/letterCheck.js";
import type { EmailMessage, EmailSender } from "../auth/email.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The commission and payslip API through the real routers, as each role: the association runs the rules and the pay run, a marshal sees only their own earnings and payslips, a driver only their own fees and
 * place in line. Association A has rank R1 (marshals M1, M2) and rank R2; association B is a stranger. Fixed clock: Monday 2 Nov 2026, so the last finished week is 26 Oct to 1 Nov.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), M1: id(3), M2: id(4), D1: id(5), D2: id(6), O1: id(7), MB: id(8) };
const R1 = id(100), R2 = id(101), RB = id(102), V1 = id(110), V2 = id(111), VB = id(112);
const NOW = new Date("2026-11-02T08:00:00Z");
let db: Db, c: Commission, server: Server, url = "", n = 5000;
const at = (day: string, h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`);
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb(); c = createCommission(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"], [U.MB, "Bea Marshal", "marshal"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO terminals (id, serial) VALUES ($1,'T-900')`, [id(900)]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa'),($3,$2,'Bellville'),($4,$5,'Elsewhere')`, [R1, U.A, R2, RB, U.B]);
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2),($1,$3),($4,$5)`, [R1, U.M1, U.M2, RB, U.MB]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3),($4,$2,'CA 222-222',$5),($6,$2,'CB 999-999',NULL)`, [V1, U.O1, U.D1, V2, U.D2, VB]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/marshal", createMarshalRouter(db, () => NOW)); app.use("/driver", createDriverRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
const as = (who: string, role: string) => ({ "x-test-user": `${who}:${role}`, "Content-Type": "application/json" });
const A = (m: string, path: string, body?: unknown) => call(m, `/association${path}`, as(U.A, "association"), body);
const M = (m: string, path: string, body?: unknown, who = U.M1) => call(m, `/marshal${path}`, as(who, "marshal"), body);
const D = (m: string, path: string, body?: unknown, who = U.D1) => call(m, `/driver${path}`, as(who, "driver"), body);
async function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const r = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, disposition: r.headers.get("content-disposition") ?? "", body: type.includes("json") ? ((await r.json()) as any) : Buffer.from(await r.arrayBuffer()) };
}
/** commission on at 40%, then departures for a marshal (calculated as the marshal's own are) */
async function live() { expect((await A("POST", "/commission/rates", { scope: "default", rateBp: 4000, effectiveFrom: "2026-01-01" })).status).toBe(201); expect((await A("PUT", "/commission/settings", { mode: "commission" })).status).toBe(200); }
async function trips(list: [string, number][], o: { marshal?: string; rank?: string; vehicle?: string; driver?: string } = {}): Promise<string[]> {
  const out: string[] = [];
  for (const [day, count] of list) for (let i = 0; i < count; i++) {
    const d = String((await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id(n++), o.rank ?? R1, o.vehicle ?? V1, o.driver ?? U.D1, o.marshal ?? U.M1, at(day, 5 + Math.floor(i / 12), (i % 12) * 5)])).rows[0].id);
    await c.recordDeparture(d); out.push(d);
  }
  return out;
}

const png = "data:image/png;base64,iVBORw0KGgo=";

class FakeEmail implements EmailSender { readonly name = "fake"; sent: EmailMessage[] = []; failing = false; async send(m: EmailMessage) { if (this.failing) throw new Error("mail down"); this.sent.push(m); } }
class FakeSms implements SmsSender { readonly name = "fake"; sent: { to: string; text: string }[] = []; async send(to: string, text: string) { this.sent.push({ to, text }); } }
let email: FakeEmail, sms: FakeSms;
const until = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); expect(f()).toBe(true); };
beforeEach(() => { email = new FakeEmail(); sms = new FakeSms(); configureAlerts({ email, sms }); });
afterEach(() => configureAlerts(null));

describe("the panic button and safety alerts, through the routes", () => {
  it("answers the marshal at once, then emails and texts the association with the location, and shows the association the panic with a map link", async () => {
    await A("PUT", "/commission/settings", { alertEmail: "ops@langa.example", alertPhone: "+27 82 123 4567" });
    const r = await M("POST", "/incidents", { rankId: R1, type: "panic", latitude: -33.9249, longitude: 18.4241, accuracyM: 20, clientRef: "panic-ref-0001" }); expect(r.status).toBe(201); expect(r.body).toMatchObject({ success: true, replayed: false });
    await until(() => email.sent.length === 1 && sms.sent.length === 1); expect(email.sent[0]).toMatchObject({ to: "ops@langa.example", subject: "PANIC: Mo Marshal at Langa" }); expect(sms.sent[0].to).toBe("+27821234567"); expect(sms.sent[0].text).toContain("https://maps.google.com/?q=-33.9249,18.4241");
    const a = (await A("GET", "/incidents")).body; expect(a.incidents[0]).toMatchObject({ type: "panic", panic: true, location: { mapUrl: "https://maps.google.com/?q=-33.9249,18.4241", accuracyM: 20 }, alert: { email: true, sms: true, delivered: true, error: null } });
    expect((await M("POST", "/incidents", { rankId: R1, type: "panic", clientRef: "panic-ref-0001" })).body.replayed).toBe(true); await new Promise((r2) => setTimeout(r2, 80)); expect(email.sent).toHaveLength(1);        // a resend from the phone does not raise a second alarm
    expect((await M("POST", "/incidents", { rankId: R1, type: "panic", latitude: 200, longitude: 0 })).status).toBe(400); expect((await M("GET", "/incidents")).body.incidents[0]).toMatchObject({ panic: true, alert: null });
  });
  it("still answers the marshal when the email service is down, keeps the failure on the report where the association can see it, and delivers when asked again", async () => {
    email.failing = true; const r = await M("POST", "/incidents", { rankId: R1, type: "robbery", note: "Hijacking" }); expect(r.status).toBe(201);
    let a: any; for (let i = 0; i < 100; i++) { a = (await A("GET", "/incidents")).body.incidents[0]; if (a.alert.error) break; await new Promise((r2) => setTimeout(r2, 20)); }
    expect(a.alert).toMatchObject({ delivered: false, error: "email: mail down" }); email.failing = false; const again = await A("POST", `/incidents/${a.id}/resend`, {}); expect(again.body).toMatchObject({ success: true, email: "sent" }); expect(email.sent).toHaveLength(1);
    expect((await A("GET", "/incidents")).body.incidents[0].alert.delivered).toBe(true); expect((await call("POST", `/association/incidents/${a.id}/resend`, as(U.B, "association"), {})).status).toBe(404); expect((await A("POST", "/incidents/nope/resend", {})).status).toBe(400);
  });
});

describe("PAYE, the tax tables and the settings, through the routes", () => {
  it("shows the shipped SARS table, takes next year's with its source, and refuses an overlap, a mistake or a missing source", async () => {
    const t = (await A("GET", "/commission/tax-tables")).body.tables; expect(t).toHaveLength(1); expect(t[0]).toMatchObject({ taxYear: "2026/27", primaryRebateCents: 1782000, uifCeilingMonthlyCents: 1771200 });
    const next = { taxYear: "2027/28", effectiveFrom: "2027-03-01", effectiveTo: "2028-02-29", brackets: [{ upToCents: 25000000, rateBp: 1800 }, { upToCents: 40000000, rateBp: 2600 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: 1800000, uifCeilingMonthlyCents: 1800000, source: "SARS Budget 2027" };
    expect((await A("POST", "/commission/tax-tables", next)).status).toBe(201); expect((await A("GET", "/commission/tax-tables")).body.tables.map((x: any) => x.taxYear)).toEqual(["2027/28", "2026/27"]);
    expect((await A("POST", "/commission/tax-tables", next)).status).toBe(409); expect((await A("POST", "/commission/tax-tables", { ...next, taxYear: "2028/29", effectiveFrom: "2028-03-01", effectiveTo: "2029-02-28", source: "" })).status).toBe(400); expect((await A("POST", "/commission/tax-tables", { ...next, taxYear: "2029/30", brackets: [] })).status).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action = 'tax.table'`)).length).toBe(1);
  });
  it("works PAYE through a real pay run for an employee, shows it on the marshal's payslip with the estimate wording, and not for an independent marshal", async () => {
    await live(); await A("PUT", "/commission/settings", { uifApplies: true, payeEnabled: true, alertEmail: "ops@langa.example" }); expect((await A("GET", "/commission/settings")).body.settings).toMatchObject({ payeEnabled: true, uifApplies: true, alertEmail: "ops@langa.example", alertPhone: null });
    await A("POST", "/adjustments", { marshalId: U.M1, kind: "bonus", label: "Festive", totalCents: 200000 }); await A("POST", "/adjustments", { marshalId: U.M2, kind: "bonus", label: "Festive", totalCents: 200000 });
    expect((await A("PUT", `/commission/marshals/${U.M1}`, { class: "employee", uifApplies: true })).status).toBe(200); await A("POST", "/payruns", {}); const list = (await A("GET", "/payruns")).body.payslips; const mo = list.find((s: any) => s.marshal === "Mo Marshal"), mia = list.find((s: any) => s.marshal === "Mia Marshal");
    await A("POST", `/payslips/${mo.id}/issue`, { method: "bank" }); await A("POST", `/payslips/${mia.id}/issue`, { method: "bank" });
    const v = (await M("GET", `/payslips/${mo.id}`)).body.payslip; expect(v.lines.filter((l: any) => l.side === "deduction").map((l: any) => [l.kind, l.amountCents])).toEqual([["uif", 2000], ["paye", 1371]]); expect(v.note).toContain("PAYE is an estimate");
    const w = (await M("GET", `/payslips/${mia.id}`, undefined, U.M2)).body.payslip; expect(w.lines.some((l: any) => l.kind === "paye")).toBe(false); expect(w.note).toContain("no PAYE has been calculated");
  });
});

describe("automatic cash-out, the work record, and consent, through the routes", () => {
  it("lets a marshal choose automatic cash-out within the limits, and the daily job then pays only those who chose it", async () => {
    expect((await M("GET", "/auto-cash-out")).body).toEqual({ success: true, enabled: false, minCents: 5000 }); expect((await M("PUT", "/auto-cash-out", { enabled: true, minCents: 500 })).status).toBe(400); expect((await M("PUT", "/auto-cash-out", { enabled: "yes" })).status).toBe(400);
    expect((await M("PUT", "/auto-cash-out", { enabled: true, minCents: 1000 })).body).toEqual({ success: true, enabled: true, minCents: 1000 }); expect((await M("GET", "/auto-cash-out")).body).toMatchObject({ enabled: true, minCents: 1000 }); expect((await M("GET", "/auto-cash-out", undefined, U.M2)).body.enabled).toBe(false);
  });
  it("gives the marshal their work record as a PDF, and shows the association earnings only with the marshal's consent, taking them back when it is withdrawn", async () => {
    await live(); await trips([["2026-10-27", 2]]); await A("POST", "/payruns", {}); const slip = (await A("GET", "/payruns")).body.payslips[0]; await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" });
    const pdf = await M("GET", "/work-record.pdf"); expect(pdf.type).toContain("application/pdf"); expect(pdf.disposition).toContain("work-record.pdf"); expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await A("GET", `/work-record/${U.M1}`)).body.record).toMatchObject({ earningsHidden: true, earningsByMonth: [], totalTrips: 2 });
    await M("PUT", "/consents/payroll_records", { granted: true }); const w = (await A("GET", `/work-record/${U.M1}`)).body.record; expect(w.earningsHidden).toBe(false); expect(w.earningsByMonth).toHaveLength(1);
    await M("PUT", "/consents/payroll_records", { granted: false }); expect((await A("GET", `/work-record/${U.M1}`)).body.record).toMatchObject({ earningsHidden: true, earningsByMonth: [] }); expect((await M("GET", "/work-record")).body.record.earningsByMonth).toHaveLength(1);
  });
});

describe("the public page for checking a proof-of-income letter", () => {
  let checkUrl = "", checkServer: Server;
  beforeEach(async () => { const app2 = express(); app2.use("/api/verify/income-letter", createLetterCheckRouter(db, () => NOW)); await new Promise<void>((ok) => { checkServer = app2.listen(0, "127.0.0.1", ok); }); checkUrl = `http://127.0.0.1:${(checkServer.address() as AddressInfo).port}/api/verify/income-letter`; });
  afterEach(() => new Promise<void>((ok) => checkServer.close(() => ok())));
  async function letter() { await live(); await trips([["2026-10-27", 3]]); await A("POST", "/payruns", {}); const s = (await A("GET", "/payruns")).body.payslips[0]; await A("POST", `/payslips/${s.id}/issue`, { method: "bank" }); await M("PUT", "/consents/income_letter", { granted: true }); return (await M("POST", "/income-letters", { months: 3 })).body.letter; }
  const get = async (qs: string, accept?: string) => { const r = await fetch(`${checkUrl}${qs}`, accept ? { headers: { accept } } : undefined); return { status: r.status, type: r.headers.get("content-type") ?? "", headers: r.headers, text: await r.text() }; };
  it("shows a form with no scripts, never cached, and tells a browser nothing it should not", async () => {
    const r = await get(""); expect(r.status).toBe(200); expect(r.type).toContain("text/html"); expect(r.text).toContain("Check a proof-of-income letter"); expect(r.text).not.toMatch(/<script/i); expect(r.headers.get("cache-control")).toBe("no-store"); expect(r.headers.get("content-security-policy")).toContain("default-src 'none'"); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it("confirms a genuine letter with the period, issue date and a masked name, and no amount of money", async () => {
    const l = await letter(); const r = await get(`?number=${encodeURIComponent(l.number)}&code=${l.verificationCode}`); expect(r.text).toContain("Genuine."); expect(r.text).toContain("Mo M."); expect(r.text).toContain(l.from); expect(r.text).not.toMatch(/R\s?\d|2400|earned|net pay/i); expect(r.text).not.toContain("Mo Marshal");
    const j = await get(`?number=${encodeURIComponent(l.number)}&code=${l.verificationCode}&format=json`); expect(JSON.parse(j.text)).toEqual({ success: true, valid: true, name: "Mo M.", number: l.number, issuedAt: l.issuedAt, from: l.from, to: l.to, intact: true }); expect((await get(`?number=${encodeURIComponent(l.number)}&code=${l.verificationCode}`, "application/json")).type).toContain("application/json");
  });
  it("says a wrong or made-up letter is not recognised, and warns when the payslips behind a genuine letter have changed", async () => {
    const l = await letter(); expect((await get(`?number=${encodeURIComponent(l.number)}&code=000000000000`)).text).toContain("Not recognised."); expect((await get("?number=IL-nope&code=AAAAAAAAAAAA&format=json")).text).toBe(JSON.stringify({ success: true, valid: false }));
    await db.query(`UPDATE payslips SET net_cents = 1`); expect((await get(`?number=${encodeURIComponent(l.number)}&code=${l.verificationCode}`)).text).toContain("should not be relied on"); expect((await get("?format=json")).status).toBe(400);
  });
  it("escapes whatever is typed into the page, so it cannot be used to put markup in front of someone else", async () => {
    const r = await get(`?number=${encodeURIComponent('"><img src=x onerror=alert(1)>')}&code=${encodeURIComponent("<b>x</b>")}`); expect(r.text).not.toContain("<img src=x"); expect(r.text).not.toContain("<b>x</b>"); expect(r.text).toContain("&lt;img src=x onerror=alert(1)&gt;"); expect(r.text).toContain("Not recognised.");
  });
  it("slows anyone guessing: more than 20 checks a minute from one address are refused", async () => {
    let last = 200; for (let i = 0; i < 22; i++) last = (await get(`?number=IL-x${i}&code=AAAAAAAAAAAA&format=json`)).status; expect(last).toBe(429); expect((await get("")).text).toContain("Too many checks");
  });
});
