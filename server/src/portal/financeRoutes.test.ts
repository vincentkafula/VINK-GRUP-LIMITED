/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";

/**
 * The finance API through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
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
  app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b);
const F = (m: string, p: string, b?: unknown) => call(m, `/association/finance${p}`, U.A, "association", b), G = (m: string, p: string, b?: unknown) => call(m, `/association/finance${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);

describe("fees, charges and receipts, through the routes", () => {
  it("records a fee, refuses one above the cap when charging, charges members, and keeps another association out of it", async () => {
    await C("PUT", "/registration", { feeCapCents: R(500) }); expect((await F("PUT", "/settings", { approvalThresholdCents: R(2000) })).body).toMatchObject({ success: true, approvalThresholdCents: 200000 }); expect((await F("PUT", "/settings", { approvalThresholdCents: -1 })).status).toBe(400);
    const a = await F("POST", "/fees", { kind: "membership", name: "Annual membership", amountCents: R(600), effectiveFrom: "2026-01-01", approvedBy: "Resolution 4" }); expect(a.status).toBe(201); expect(a.body.overCap).toBe(true); const b = await F("POST", "/fees", { kind: "levy", name: "Rank repairs", amountCents: R(900), effectiveFrom: "2026-01-01" });
    expect((await F("POST", "/charges", { feeId: a.body.id, all: true })).status).toBe(400); expect((await F("POST", "/charges", { feeId: b.body.id, all: true })).body).toMatchObject({ success: true, created: 2, skipped: 0 }); expect((await F("GET", "/fees")).body.fees.map((x: any) => [x.name, x.overCap])).toEqual([["Rank repairs", false], ["Annual membership", true]]);                  // listed by kind: levies, then membership
    expect((await G("GET", "/fees")).body.fees).toEqual([]); expect((await G("POST", "/charges", { feeId: b.body.id, all: true })).status).toBe(404); expect((await F("POST", `/fees/${b.body.id}/active`, { active: false })).status).toBe(200); expect((await F("POST", `/fees/${b.body.id}/active`, { active: "no" })).status).toBe(400); expect((await F("POST", "/fees/nope/active", {})).status).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action IN ('finance.fee','finance.charge','finance.settings') ORDER BY created_at`)).map((r) => r.action)).toEqual(["finance.settings", "finance.fee", "finance.fee", "finance.charge"]);
  });
  it("numbers receipts, pays a levy only when the receipts add up, voids with a reason, and serves a printable receipt that says when it is void", async () => {
    const fee = (await F("POST", "/fees", { kind: "levy", name: "Rank repairs", amountCents: R(600), effectiveFrom: "2026-01-01" })).body; await F("POST", "/charges", { feeId: fee.id, memberIds: [U.O1] }); const levyId = (await q(`SELECT id FROM levies LIMIT 1`))[0].id;
    const r1 = await F("POST", "/receipts", { memberId: U.O1, levyId, amountCents: R(250), method: "cash", receivedOn: "2026-11-01" }); expect(r1.status).toBe(201); expect(r1.body.number).toBe(1); expect((await F("POST", "/receipts", { memberId: U.O1, levyId, amountCents: R(400), method: "cash", receivedOn: "2026-11-01" })).status).toBe(409);
    const r2 = await F("POST", "/receipts", { memberId: U.O1, levyId, amountCents: R(350), method: "eft", receivedOn: "2026-11-02" }); expect(r2.body.number).toBe(2); expect((await q(`SELECT paid_at FROM levies WHERE id = $1`, [levyId]))[0].paid_at).not.toBeNull();
    expect((await F("POST", "/receipts", { memberId: U.O3, amountCents: 100, method: "cash", receivedOn: TODAY, category: "other" })).status).toBe(400); expect((await F("POST", "/receipts", { memberId: U.O1, amountCents: 100, method: "barter", receivedOn: TODAY, category: "other" })).status).toBe(400);
    const pdf = await raw(`/association/finance/receipts/${r2.body.id}.pdf`, U.A); expect(pdf.type).toContain("application/pdf"); expect(pdf.buf.subarray(0, 5).toString()).toBe("%PDF-"); const text = pdfText(pdf.buf); for (const t of ["Langa Taxi Association", "Receipt R-000002", "R350.00", "Olu Owner", "eft"]) expect(text).toContain(t); expect(text).not.toContain("VOID");
    expect((await F("POST", `/receipts/${r2.body.id}/void`, { reason: "" })).status).toBe(400); expect((await F("POST", `/receipts/${r2.body.id}/void`, { reason: "Wrong member" })).status).toBe(200); expect((await F("POST", `/receipts/${r2.body.id}/void`, { reason: "again" })).status).toBe(409);
    expect((await q(`SELECT paid_at FROM levies WHERE id = $1`, [levyId]))[0].paid_at).toBeNull(); const voided = pdfText((await raw(`/association/finance/receipts/${r2.body.id}.pdf`, U.A)).buf); expect(voided).toContain("VOID"); expect(voided).toContain("Wrong member");
    expect((await raw(`/association/finance/receipts/${r2.body.id}.pdf`, U.B)).status).toBe(404); expect((await raw("/association/finance/receipts/nope.pdf", U.A)).status).toBe(400); expect((await G("POST", `/receipts/${r1.body.id}/void`, { reason: "x" })).status).toBe(404); expect((await F("GET", "/receipts")).body.receipts.map((r: any) => [r.number, r.voided])).toEqual([[2, true], [1, false]]);
    expect((await F("GET", "/receipts?from=2026-11-02")).body.receipts.map((r: any) => r.number)).toEqual([2]); expect((await F("GET", `/receipts?memberId=${U.O2}`)).body.receipts).toEqual([]); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'finance.receipt%' ORDER BY created_at`)).map((r) => r.action)).toContain("finance.receipt.void");
  });
  it("shows each member's account and a statement for one, and refuses another association's member", async () => {
    const fee = (await F("POST", "/fees", { kind: "levy", name: "Rank repairs", amountCents: R(600), effectiveFrom: "2026-01-01" })).body; await F("POST", "/charges", { feeId: fee.id, all: true, dueOn: plus(5) }); await F("POST", "/receipts", { memberId: U.O1, amountCents: R(100), method: "cash", receivedOn: TODAY, category: "levy" });
    const m = (await F("GET", "/members")).body.members; expect(m.map((x: any) => [x.name, x.chargedCents, x.owedCents, x.unallocatedCents])).toEqual([["Olu Owner", R(600), R(600), R(100)], ["Ona Owner", R(600), R(600), 0]]);
    const s = (await F("GET", `/members/${U.O1}/statement`)).body; expect(s).toMatchObject({ success: true, member: "Olu Owner", owedCents: R(600) }); expect(s.lines.map((l: any) => [l.kind, l.amountCents])).toEqual([["receipt", R(100)], ["charge", R(600)]]); expect((await F("GET", `/members/${U.O3}/statement`)).status).toBe(404); expect((await F("GET", "/members/nope/statement")).status).toBe(400);
  });
});

describe("expenses, banking, budgets and statements, through the routes", () => {
  it("takes two different office bearers to approve a large expense, and none to approve one's own request", async () => {
    const t = (await C("POST", "/office-bearers", { name: "Thabo Mokoena", office: "Chairperson" })).body.id, s = (await C("POST", "/office-bearers", { name: "Sipho Dube", office: "Treasurer" })).body.id, l = (await C("POST", "/office-bearers", { name: "Lerato Nel", office: "Secretary" })).body.id;
    const e = await F("POST", "/expenses", { incurredOn: TODAY, category: "Rank maintenance", payee: "Lights & Co", amountCents: R(8000), requestedBy: "Thabo Mokoena", description: "New lights" }); expect(e.status).toBe(201); expect(e.body.requiredApprovals).toBe(2);
    expect((await F("POST", `/expenses/${e.body.id}/approve`, { officeBearerId: t })).status).toBe(400); expect((await F("POST", `/expenses/${e.body.id}/approve`, { officeBearerId: s })).body).toMatchObject({ success: true, status: "pending", approvals: 1 }); expect((await F("POST", `/expenses/${e.body.id}/approve`, { officeBearerId: s })).status).toBe(409);
    expect((await F("POST", `/expenses/${e.body.id}/approve`, { officeBearerId: l })).body).toMatchObject({ status: "approved", approvals: 2 }); expect((await F("GET", "/expenses?status=approved")).body.expenses).toHaveLength(1); expect((await F("POST", `/expenses/${e.body.id}/reject`, { reason: "late" })).status).toBe(409);
    const e2 = await F("POST", "/expenses", { incurredOn: TODAY, category: "Fuel", payee: "Garage", amountCents: R(100), requestedBy: "Sipho Dube" }); expect((await F("POST", `/expenses/${e2.body.id}/reject`, { reason: "" })).status).toBe(400); expect((await F("POST", `/expenses/${e2.body.id}/reject`, { reason: "No quote" })).status).toBe(200); expect((await G("POST", `/expenses/${e2.body.id}/reject`, { reason: "x" })).status).toBe(404); expect((await F("POST", "/expenses/nope/approve", {})).status).toBe(400);
  });
  it("tracks cash against banking and flags cash left unbanked", async () => {
    await F("POST", "/receipts", { memberId: U.O1, amountCents: R(300), method: "cash", receivedOn: plus(-45), category: "levy" }); expect((await F("GET", "/cash")).body).toMatchObject({ onHandCents: R(300), unbankedCents: R(300), oldestUnbankedDays: 45 }); expect((await F("GET", "/summary")).body.flags.some((f: any) => f.id === "fin:cash" && f.severity === "medium")).toBe(true);
    expect((await F("POST", "/deposits", { depositedOn: plus(1), amountCents: 100 })).status).toBe(400); expect((await F("POST", "/deposits", { depositedOn: plus(-1), amountCents: R(300), reference: "DEP-9" })).status).toBe(201); expect((await F("GET", "/cash")).body).toMatchObject({ onHandCents: 0, unbankedCents: 0, oldestUnbankedOn: null });
    expect((await F("GET", "/deposits")).body.deposits).toEqual([expect.objectContaining({ amountCents: R(300), reference: "DEP-9" })]); expect((await G("GET", "/deposits")).body.deposits).toEqual([]); expect((await F("GET", "/summary")).body.flags.some((f: any) => f.id === "fin:cash")).toBe(false);
  });
  it("sets a budget, states a month and a year with the budget alongside, and exports the statement as CSV", async () => {
    await F("POST", "/receipts", { memberId: U.O1, amountCents: R(600), method: "eft", receivedOn: "2026-10-05", category: "membership" }); expect((await F("PUT", "/budgets", { year: 2026, category: "membership", amountCents: R(2000) })).status).toBe(200); expect((await F("PUT", "/budgets", { year: 1800, category: "x", amountCents: 1 })).status).toBe(400); expect((await F("GET", "/budgets?year=2026")).body).toEqual({ success: true, year: 2026, budgets: [{ category: "membership", amountCents: R(2000) }] });
    expect((await F("GET", "/statement?month=2026-10")).body).toMatchObject({ period: "2026-10", incomeCents: R(600), expensesCents: 0, netCents: R(600) }); const y = (await F("GET", "/statement?year=2026")).body; expect(y.budget).toEqual([{ category: "membership", budgetCents: R(2000), actualCents: R(600), varianceCents: -R(1400) }]); expect((await F("GET", "/statement")).status).toBe(400); expect((await F("GET", "/statement?month=October")).status).toBe(400);
    const csv = await raw("/association/finance/statement.csv?month=2026-10", U.A); expect(csv.type).toContain("text/csv"); expect(csv.disposition).toContain("income-statement-2026-10.csv"); const text = csv.buf.toString("utf8"); expect(text).toContain("Income,membership,600.00"); expect(text).toContain("Net,Income less expenses,600.00"); expect((await raw("/association/finance/statement.csv", U.A)).status).toBe(400);
    expect((await G("GET", "/statement?month=2026-10")).body.incomeCents).toBe(0);
  });
  it("gives the overview as of today or a day asked for", async () => {
    const s = (await F("GET", "/summary")).body; expect(s).toMatchObject({ today: TODAY, settings: { approvalThresholdCents: 500000 }, measures: { pendingExpenses: 0 } }); expect((await F("GET", "/summary?on=2026-12-25")).body.today).toBe("2026-12-25"); expect((await F("GET", "/summary?on=garbage")).body.today).toBe(TODAY);
  });
});
