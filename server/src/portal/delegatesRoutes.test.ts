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
 * Named office-bearer users through the real routers, with the gate the portal puts in front of them, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
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

describe("managing the logins", () => {
  it("gives an office bearer their own login: a username, a role and a one-time password that really is their password, and lists them", async () => {
    const ob = (await OWN("POST", "/compliance/office-bearers", { name: "Thabo Mokoena", office: "Chairperson" })).body.id; const d = await login("chairperson", { name: "Thabo Mokoena", officeBearerId: ob });
    expect(d.temporaryPassword.length).toBeGreaterThanOrEqual(15); expect(await bcrypt.compare(d.temporaryPassword, (await q(`SELECT password_hash FROM users WHERE id = $1`, [d.id]))[0].password_hash)).toBe(true); expect((await q(`SELECT role, username FROM users WHERE id = $1`, [d.id]))[0]).toEqual({ role: "association", username: "chairperson1" });
    const list = (await OWN("GET", "/delegates")).body.delegates; expect(list).toEqual([expect.objectContaining({ id: d.id, name: "Thabo Mokoena", username: "chairperson1", role: "chairperson", officeBearer: "Thabo Mokoena (Chairperson)", disabled: false, lastLogin: null })]); expect(JSON.stringify(list)).not.toContain(d.temporaryPassword);
    expect(JSON.stringify(await q(`SELECT details FROM audit_log WHERE action = 'delegate.create'`))).not.toContain(d.temporaryPassword); expect(JSON.stringify(await q(`SELECT summary FROM register_changes`))).not.toContain(d.temporaryPassword); expect((await OTH("GET", "/delegates")).body.delegates).toEqual([]);
  });
  it("refuses a login that is not valid: a name, an address, a username, a role, an unknown office bearer, a taken username, or an office bearer who already has one", async () => {
    const ob = (await OWN("POST", "/compliance/office-bearers", { name: "Sipho Dube", office: "Treasurer" })).body.id; for (const bad of [{ name: "" }, { email: "nope" }, { username: "A B" }, { username: "ab" }, { role: "king" }, { officeBearerId: id(99) }]) expect((await OWN("POST", "/delegates", { name: "X", email: "x@y.test", username: "someone", role: "viewer", ...bad })).status, JSON.stringify(bad)).toBe(400);
    await login("treasurer", { officeBearerId: ob }); expect((await OWN("POST", "/delegates", { name: "Y", email: "y@y.test", username: "TREASURER1", role: "viewer" })).status).toBe(409); expect((await OWN("POST", "/delegates", { name: "Y", email: "y@y.test", username: "other", role: "treasurer", officeBearerId: ob })).status).toBe(409);
    const other = (await OTH("POST", "/compliance/office-bearers", { name: "B's person", office: "Chair" })).body.id; expect((await OWN("POST", "/delegates", { name: "Y", email: "y@y.test", username: "other", role: "viewer", officeBearerId: other })).status).toBe(400);
  });
  it("changes a role, switches a login off and on, and resets a password (a new one-time password), only for the association's own logins", async () => {
    const d = await login("viewer"); expect((await OWN("PUT", `/delegates/${d.id}/role`, { role: "king" })).status).toBe(400); expect((await OWN("PUT", `/delegates/${d.id}/role`, { role: "secretary" })).status).toBe(200); expect((await OWN("GET", "/delegates")).body.delegates[0].role).toBe("secretary");
    expect((await OTH("PUT", `/delegates/${d.id}/role`, { role: "viewer" })).status).toBe(404); expect((await OTH("POST", `/delegates/${d.id}/active`, { active: false })).status).toBe(404); expect((await OTH("POST", `/delegates/${d.id}/reset-password`)).status).toBe(404); expect((await OWN("POST", `/delegates/${d.id}/active`, { active: "no" })).status).toBe(400); expect((await OWN("PUT", "/delegates/nope/role", {})).status).toBe(400);
    expect((await OWN("POST", `/delegates/${d.id}/active`, { active: false })).status).toBe(200); expect((await OWN("GET", "/delegates")).body.delegates[0].disabled).toBe(true); expect((await OWN("POST", `/delegates/${d.id}/active`, { active: true })).status).toBe(200);
    const r = await OWN("POST", `/delegates/${d.id}/reset-password`); expect(r.status).toBe(200); expect(r.body.temporaryPassword).not.toBe(d.temporaryPassword); const hash = (await q(`SELECT password_hash FROM users WHERE id = $1`, [d.id]))[0].password_hash; expect(await bcrypt.compare(r.body.temporaryPassword, hash)).toBe(true); expect(await bcrypt.compare(d.temporaryPassword, hash)).toBe(false);
    expect((await q(`SELECT summary FROM register_changes WHERE entity = 'delegate' ORDER BY changed_at`)).map((x) => x.summary.replace(/^.*?(was|'s) /, "")).length).toBe(5); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'delegate.%' ORDER BY created_at`)).map((x) => x.action)).toEqual(["delegate.create", "delegate.role", "delegate.active", "delegate.active", "delegate.reset-password"]);
  });
  it("lets a delegate do none of it: the logins are for the association's own login alone", async () => {
    const chair = await login("chairperson"); for (const [m, p, b] of [["GET", "/delegates"], ["POST", "/delegates", { name: "X", email: "x@y.test", username: "someone", role: "viewer" }], ["PUT", `/delegates/${chair.id}/role`, { role: "viewer" }], ["POST", `/delegates/${chair.id}/reset-password`]] as const) expect((await AS(chair.id, m, p, b)).status, `${m} ${p}`).toBe(403);
  });
});

describe("what each role may do", () => {
  // The status only: a pack or an export is not JSON, and a GET has no body.
  const status = async (who: string, m: string, p: string, b?: unknown) => (await fetch(`${url}/association${p}`, { method: m, headers: { "x-test-user": `${who}:association`, "Content-Type": "application/json" }, body: m === "GET" || b === undefined ? undefined : JSON.stringify(b) })).status;
  it("lets a chairperson into every module of the association, but not the bank, money, payroll or anything that is not listed", async () => {
    const c = (await login("chairperson")).id; for (const p of ["/compliance/summary", "/finance/summary", "/governance/summary", "/governance/cases", "/safety/summary", "/route-control", "/member-register", "/formalisation", "/reports/packs", "/compliance/vehicles"]) expect(await status(c, "GET", p), p).toBe(200);
    expect(await status(c, "POST", "/governance/meetings", { kind: "agm", heldOn: plus(-3), title: "AGM" })).toBe(201); for (const p of ["/bank/accounts", "/money/summary", "/tokens/balance", "/commission/settings", "/payruns", "/delegates", "/anything-new"]) expect(await status(c, "GET", p), p).toBe(403);
  });
  it("lets a secretary into the registers, members, governance, discipline, safety and routes, reads reports, and keeps finance closed", async () => {
    const s = (await login("secretary")).id; for (const p of ["/compliance/summary", "/compliance/vehicles", "/member-register", "/governance/cases", "/safety/summary", "/route-control", "/reports/packs", "/governance/summary"]) expect(await status(s, "GET", p), p).toBe(200);
    expect(await status(s, "POST", "/governance/meetings", { kind: "executive", heldOn: plus(-3), title: "Exco" })).toBe(201); expect(await status(s, "POST", "/safety/events", { kind: "passenger_complaint", occurredOn: plus(-2), title: "Complaint" })).toBe(201); expect(await status(s, "PUT", "/compliance/registration", { registrar: "PRE" })).toBe(200);
    for (const [m, p] of [["GET", "/finance/summary"], ["POST", "/finance/receipts"], ["GET", "/finance/members"], ["GET", "/ledger"], ["PUT", "/route-control"]] as const) expect(await status(s, m, p, {}), `${m} ${p}`).toBe(403);
  });
  it("lets a treasurer into finance, and look at the registers and reports, but not discipline, safety or member identities, and not change the registers", async () => {
    const t = (await login("treasurer")).id; for (const p of ["/compliance/summary", "/finance/summary", "/finance/members", "/compliance/vehicles", "/compliance/drivers", "/route-control", "/reports/packs", "/reports/pack/finance.pdf", "/reports/csv/vehicles.csv", "/ledger"]) expect(await status(t, "GET", p), p).toBe(200);
    expect(await status(t, "POST", "/finance/fees", { kind: "levy", name: "Rank repairs", amountCents: 50000, effectiveFrom: "2026-01-01" })).toBe(201); expect(await status(t, "PUT", "/finance/settings", { approvalThresholdCents: 100000 })).toBe(200);
    for (const [m, p] of [["GET", "/governance/cases"], ["GET", "/safety/summary"], ["GET", "/member-register"], ["GET", "/formalisation"], ["GET", "/governance/summary"], ["GET", "/reports/csv/members.csv"], ["GET", "/reports/csv/formalisation.csv"], ["PUT", "/compliance/registration"], ["POST", "/compliance/office-bearers"], ["PUT", `/compliance/vehicles/${id(20)}`]] as const) expect(await status(t, m, p, {}), `${m} ${p}`).toBe(403);
  });
  it("lets a viewer look at the overview, the registers, routes and reports, and change nothing", async () => {
    const v = (await login("viewer")).id; for (const p of ["/compliance/summary", "/compliance/vehicles", "/route-control", "/reports/packs", "/reports/pack/licences.pdf", "/reports/csv/drivers.csv"]) expect(await status(v, "GET", p), p).toBe(200);
    for (const [m, p] of [["POST", "/governance/meetings"], ["PUT", "/compliance/registration"], ["POST", "/finance/receipts"], ["POST", "/reports/schedules"], ["GET", "/finance/summary"], ["GET", "/governance/cases"], ["GET", "/safety/summary"], ["GET", "/member-register"]] as const) expect(await status(v, m, p, {}), `${m} ${p}`).toBe(403);
  });
  it("tells the signed-in person what they may do, for the screens: the main login everything, a delegate their role's modules", async () => {
    expect((await OWN("GET", "/access")).body).toMatchObject({ kind: "owner", role: null, roleText: "Main login", modules: { finance: "rw", discipline: "rw", operations: "rw" } }); const t = await login("treasurer", { name: "Sipho Dube" }); const a = (await AS(t.id, "GET", "/access")).body;
    expect(a).toMatchObject({ kind: "delegate", name: "Sipho Dube", role: "treasurer", roleText: "Treasurer", modules: { finance: "rw", registers: "r", reports: "r", discipline: null, safety: null, members: null, governance: null } });
  });
});

describe("a login that is switched off", () => {
  it("is refused everywhere at once, even though it still holds a token, and works again when switched back on", async () => {
    const d = await login("secretary"); expect((await AS(d.id, "GET", "/compliance/summary")).status).toBe(200); await OWN("POST", `/delegates/${d.id}/active`, { active: false }); for (const p of ["/compliance/summary", "/access", "/member-register"]) { const r = await AS(d.id, "GET", p); expect(r.status, p).toBe(403); expect(r.body.error).toContain("switched off"); }
    await OWN("POST", `/delegates/${d.id}/active`, { active: true }); expect((await AS(d.id, "GET", "/compliance/summary")).status).toBe(200);
  });
});

describe("what a delegate changes is recorded in their own name", () => {
  it("writes the change history and the audit record under the delegate, not under the association", async () => {
    const d = await login("secretary", { name: "Lerato Nel" }); await AS(d.id, "PUT", "/compliance/registration", { registrar: "PRE Gauteng" }); await OWN("PUT", "/compliance/registration", { province: "Gauteng" });
    const ch = (await OWN("GET", "/compliance/changes?entity=registration")).body.changes; expect(ch.map((c: any) => [c.summary.split(":")[0], c.by]).sort()).toEqual([["province", "Langa Taxi Association"], ["registrar", "Lerato Nel"]].sort()); const a = await q(`SELECT actor_id, actor_name FROM audit_log WHERE action = 'compliance.registration' ORDER BY created_at`); expect(a.map((r) => [r.actor_id, r.actor_name])).toEqual([[d.id, "secretary1"], [U.A, "association"]]);
  });
  it("still scopes everything to the association the delegate acts for, and to no other", async () => {
    const d = await login("chairperson"); await AS(d.id, "POST", "/governance/meetings", { kind: "agm", heldOn: plus(-3), title: "Langa AGM" }); expect((await AS(d.id, "GET", "/governance/meetings")).body.meetings.map((m: any) => m.title)).toEqual(["Langa AGM"]); expect((await OTH("GET", "/governance/meetings")).body.meetings).toEqual([]);
  });
});

describe("what each role sees in the overview and the history", () => {
  async function seed() {
    await OWN("POST", "/governance/cases", { subjectKind: "member", subjectId: U.O1, complaint: "Secret complaint", openedOn: plus(-200) }); for (let i = 0; i < 3; i++) await OWN("POST", "/safety/events", { kind: "accident", occurredOn: plus(-5 - i), title: `Secret collision ${i}`, vehicleId: id(20) }); await OWN("PUT", `/member-register/${U.O1}`, { dualMemberOf: "Bellville TA" }); await OWN("PUT", "/finance/settings", { approvalThresholdCents: 100000 }); await db.query(`INSERT INTO levies (association_id, member_id, title, amount, due_date, paid_at) VALUES ($1,$2,'Old levy','100.00',$3, now())`, [U.A, U.O1, plus(-50)]);                  // paid with no receipt: a finance flag
  }
  const cats = (r: any) => [...new Set(r.body.flags.map((f: any) => f.category))].sort();
  it("hides the flags a role may not read: a treasurer sees no discipline, safety or member flags, while the main login and a chairperson see them all", async () => {
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','T',15)`, [id(20), U.O1]); await seed(); const t = await login("treasurer"), c = await login("chairperson"), s = await login("secretary"), v = await login("viewer");
    const all = cats(await OWN("GET", "/compliance/summary")); for (const x of ["discipline", "safety", "members", "governance", "registration"]) expect(all, x).toContain(x); expect(cats(await AS(c.id, "GET", "/compliance/summary"))).toEqual(all); expect(cats(await AS(s.id, "GET", "/compliance/summary"))).toEqual(all.filter((x) => x !== "finance"));                  // a secretary reads everything except finance
    for (const who of [t.id, v.id]) { const r = cats(await AS(who, "GET", "/compliance/summary")); for (const x of ["discipline", "safety", "members", "governance"]) expect(r, x).not.toContain(x); expect(r).toContain("registration"); const text = JSON.stringify((await AS(who, "GET", "/compliance/summary")).body); expect(text).not.toContain("Secret"); expect(text).not.toContain("The case about"); }
    expect(cats(await AS(t.id, "GET", "/compliance/summary"))).toContain("finance");
  });
  it("hides the history entries a role may not read, and never shows the logins to a delegate", async () => {
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','T',15)`, [id(20), U.O1]); await seed(); const t = await login("treasurer"), s = await login("secretary"); const ents = async (who?: string) => [...new Set((await (who ? AS(who, "GET", "/compliance/changes?limit=500") : OWN("GET", "/compliance/changes?limit=500"))).body.changes.map((c: any) => c.entity))].sort();
    const all = await ents(); for (const x of ["discipline", "safety", "member", "finance_settings", "delegate"]) expect(all, x).toContain(x); const tr = await ents(t.id); for (const x of ["discipline", "safety", "member", "delegate", "meeting"]) expect(tr, x).not.toContain(x); expect(tr).toContain("finance_settings");
    const se = await ents(s.id); expect(se).toContain("discipline"); expect(se).toContain("member"); expect(se).not.toContain("finance_settings"); expect(se).not.toContain("delegate");
  });
});

describe("approving an expense as yourself", () => {
  async function setup() {
    const bs = []; for (const [n, o] of [["Sipho Dube", "Treasurer"], ["Lerato Nel", "Secretary"], ["Thabo Mokoena", "Chairperson"]]) bs.push((await OWN("POST", "/compliance/office-bearers", { name: n, office: o })).body.id);
    const sipho = await login("treasurer", { name: "Sipho Dube", username: "sipho", officeBearerId: bs[0] }), lerato = await login("treasurer", { name: "Lerato Nel", username: "lerato", email: "l@langa.test", officeBearerId: bs[1] }); const unlinked = await login("treasurer", { name: "No Link", username: "nolink", email: "n@langa.test" });
    const e = (await OWN("POST", "/finance/expenses", { incurredOn: TODAY, category: "Rank maintenance", payee: "Lights", amountCents: 800000, requestedBy: "Thabo Mokoena" })).body.id; return { bs, sipho, lerato, unlinked, e };
  }
  it("records an approval by a signed-in office bearer as theirs, whatever bearer they name, and takes two different people above the threshold", async () => {
    const { bs, sipho, lerato, e } = await setup(); const r1 = await AS(sipho.id, "POST", `/finance/expenses/${e}/approve`, { officeBearerId: bs[1] }); expect(r1.body).toMatchObject({ success: true, status: "pending", approvals: 1 });
    expect((await AS(sipho.id, "POST", `/finance/expenses/${e}/approve`, {})).status).toBe(409); expect((await AS(lerato.id, "POST", `/finance/expenses/${e}/approve`, { officeBearerId: bs[2] })).body).toMatchObject({ status: "approved", approvals: 2 });
    expect((await OWN("GET", "/finance/expenses")).body.expenses[0].approvals.map((a: any) => [a.name, a.signedIn]).sort()).toEqual([["Lerato Nel", true], ["Sipho Dube", true]]);                  // named Sipho and Lerato, not the bearer each of them tried to name
    expect((await q(`SELECT actor_id FROM audit_log WHERE action = 'finance.expense.approve' ORDER BY created_at`)).map((r) => r.actor_id)).toEqual([sipho.id, lerato.id]);
  });
  it("refuses a delegate whose login is not linked to an office bearer, and an approval of one's own request", async () => {
    const { bs, unlinked } = await setup(); const own = (await OWN("POST", "/compliance/office-bearers", { name: "Own Request", office: "Committee" })).body.id; const asker = await login("treasurer", { name: "Own Request", username: "asker", email: "a@langa.test", officeBearerId: own });
    const e2 = (await OWN("POST", "/finance/expenses", { incurredOn: TODAY, category: "Fuel", payee: "Garage", amountCents: 10000, requestedBy: "Own Request" })).body.id;
    const r = await AS(unlinked.id, "POST", `/finance/expenses/${(await OWN("GET", "/finance/expenses")).body.expenses[0].id}/approve`, { officeBearerId: bs[0] }); expect(r.status).toBe(403); expect(r.body.error).toContain("not linked to an office bearer"); const s = await AS(asker.id, "POST", `/finance/expenses/${e2}/approve`, {}); expect(s.status).toBe(400); expect(s.body.error).toContain("approve what they asked for themselves");
  });
  it("refuses the association's own login once signed-in approvals are required, and lets the signed-in office bearer through", async () => {
    const { bs, sipho, e } = await setup(); expect((await OWN("PUT", "/finance/settings", { requireSignedInApprovals: true })).body.requireSignedInApprovals).toBe(true); const r = await OWN("POST", `/finance/expenses/${e}/approve`, { officeBearerId: bs[0] }); expect(r.status).toBe(403); expect(r.body.error).toContain("signed in to their own account");
    expect((await AS(sipho.id, "POST", `/finance/expenses/${e}/approve`, {})).status).toBe(200); expect((await OWN("GET", "/finance/settings")).body.requireSignedInApprovals).toBe(true); await OWN("PUT", "/finance/settings", { requireSignedInApprovals: false }); expect((await OWN("POST", `/finance/expenses/${e}/approve`, { officeBearerId: bs[1] })).status).toBe(200);
  });
});
