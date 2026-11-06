/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createFinance, type Finance } from "./finance.js";
import { createCompliance, type Compliance } from "./compliance.js";

/** The association's books. Association A has active owner members O1 and O2 and office bearers; association B is a stranger with O3. Fixed clock: Monday 2 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), X: id(6) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, f: Finance, comp: Compliance;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const R = (rand: number) => Math.round(rand * 100);

beforeEach(async () => {
  db = allPortalsDb(); f = createFinance(db, () => NOW); comp = createCompliance(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.X, "Not A Member", "vehicle_owner"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
});
const fee = (o: any = {}) => f.addFee(U.A, U.A, { kind: "membership", name: "Annual membership", amountCents: R(600), effectiveFrom: "2026-01-01", ...o });
const bearer = async (name: string, termEnd: string | null = plus(300), assoc = U.A) => String(ok<any>(await comp.addOfficeBearer(assoc, assoc, { name, office: "Committee", ...(termEnd ? { termEnd } : {}) })).id);
async function levy(member: string, title: string, rand: number, due: string, paid = false) { const r = (await db.query(`INSERT INTO levies (association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [U.A, member, title, rand.toFixed(2), due])).rows[0]; if (paid) await db.query(`UPDATE levies SET paid_at = now() WHERE id = $1`, [r.id]); return String(r.id); }
const receipt = (o: any = {}) => f.recordReceipt(U.A, U.A, { memberId: U.O1, amountCents: R(100), method: "eft", receivedOn: TODAY, category: "levy", ...o });

describe("settings and the fee schedule", () => {
  it("starts with a R5 000 approval threshold, takes a new one validated, and logs the change", async () => {
    expect(await f.settings(U.A)).toEqual({ approvalThresholdCents: 500000 }); expect(ok<any>(await f.saveSettings(U.A, U.A, { approvalThresholdCents: R(2000) }))).toEqual({ approvalThresholdCents: 200000 }); expect(await f.settings(U.B)).toEqual({ approvalThresholdCents: 500000 });
    for (const bad of [-1, 1.5, "lots", 1e12]) expect(await f.saveSettings(U.A, U.A, { approvalThresholdCents: bad as any }), String(bad)).toMatchObject({ ok: false, status: 400 }); expect((await q(`SELECT summary FROM register_changes WHERE entity = 'finance_settings'`))[0].summary).toContain("R2000.00 or more need two approvers");
  });
  it("records approved fees, validated, flags a joining or membership fee above the province's cap (and only those), and can switch one off", async () => {
    for (const bad of [{ kind: "tax" }, { name: "" }, { amountCents: 0 }, { amountCents: 1.5 }, { effectiveFrom: "soon" }, { approvedBy: "x".repeat(200) }]) expect(await fee(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await comp.saveRegistration(U.A, U.A, { feeCapCents: R(10_000) })); const a = ok<any>(await fee({ kind: "joining", name: "Joining fee", amountCents: R(12_000), approvedBy: "Resolution 4 of 2026" })), b = ok<any>(await fee({ kind: "levy", name: "Rank repairs", amountCents: R(50_000) }));
    expect(a.overCap).toBe(true); expect(b.overCap).toBe(false); expect((await f.fees(U.A)).map((x) => [x.name, x.overCap, x.approvedBy])).toEqual([["Joining fee", true, "Resolution 4 of 2026"], ["Rank repairs", false, null]]); expect((await q(`SELECT summary FROM register_changes WHERE entity = 'fee'`)).some((r) => r.summary.includes("ABOVE THE CAP"))).toBe(true);
    ok(await f.setFeeActive(U.A, U.A, a.id, false)); expect((await f.fees(U.A)).find((x) => x.name === "Joining fee")!.active).toBe(false); expect(await f.setFeeActive(U.B, U.B, a.id, true)).toMatchObject({ ok: false, status: 404 }); expect(await f.fees(U.B)).toEqual([]);
  });
});

describe("charging members from the schedule", () => {
  it("charges every member, or only those chosen, at the fee's amount with a due date (30 days by default), and logs it", async () => {
    const a = ok<any>(await fee()); expect(ok<any>(await f.charge(U.A, U.A, { feeId: a.id, all: true }))).toEqual({ created: 2, skipped: 0 });
    expect((await q(`SELECT title, amount, due_date FROM levies ORDER BY member_id`)).map((l) => [l.title, Number(l.amount), new Date(l.due_date).toISOString().slice(0, 10)])).toEqual([["Annual membership", 600, plus(30)], ["Annual membership", 600, plus(30)]]);
    expect(ok<any>(await f.charge(U.A, U.A, { feeId: a.id, memberIds: [U.O1], dueOn: plus(10) }))).toEqual({ created: 1, skipped: 0 }); expect((await q(`SELECT summary FROM register_changes WHERE entity = 'charge'`)).map((r) => r.summary)).toContain('charged "Annual membership" R600.00 to 1 member');
  });
  it("refuses a fee that is not on the schedule, is switched off, has not started, is above the cap, or goes to someone who is not a member", async () => {
    const a = ok<any>(await fee()); const future = ok<any>(await fee({ name: "Next year", effectiveFrom: plus(40) }));
    expect(await f.charge(U.A, U.A, { feeId: id(99), all: true })).toMatchObject({ ok: false, status: 404 }); expect(await f.charge(U.B, U.B, { feeId: a.id, all: true })).toMatchObject({ ok: false, status: 404 }); expect(await f.charge(U.A, U.A, { feeId: future.id, all: true })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining(`from ${plus(40)}`) });
    expect(await f.charge(U.A, U.A, { feeId: a.id, memberIds: [U.O3] })).toMatchObject({ ok: false, status: 400 }); expect(await f.charge(U.A, U.A, { feeId: a.id, memberIds: [U.X] })).toMatchObject({ ok: false, status: 400 }); expect(await f.charge(U.A, U.A, { feeId: a.id, memberIds: [] })).toMatchObject({ ok: false, status: 400 }); expect(await f.charge(U.A, U.A, { feeId: a.id })).toMatchObject({ ok: false, status: 400 });
    expect(await f.charge(U.A, U.A, { feeId: a.id, all: true, dueOn: plus(-1) })).toMatchObject({ ok: false, status: 400 }); ok(await f.setFeeActive(U.A, U.A, a.id, false)); expect(await f.charge(U.A, U.A, { feeId: a.id, all: true })).toMatchObject({ ok: false, status: 409 }); ok(await f.setFeeActive(U.A, U.A, a.id, true));
    ok(await comp.saveRegistration(U.A, U.A, { feeCapCents: R(500) })); expect(await f.charge(U.A, U.A, { feeId: a.id, all: true })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("above the limit of R500.00") }); expect((await q(`SELECT COUNT(*) AS n FROM levies`))[0].n).toBe(0);
    const levyFee = ok<any>(await fee({ kind: "levy", name: "Rank repairs", amountCents: R(900) })); expect(ok<any>(await f.charge(U.A, U.A, { feeId: levyFee.id, all: true })).created).toBe(2);                                          // the cap is for joining and membership fees only
  });
  it("charges a joining fee only once to each member", async () => {
    const j = ok<any>(await fee({ kind: "joining", name: "Joining fee", amountCents: R(1000) })); expect(ok<any>(await f.charge(U.A, U.A, { feeId: j.id, memberIds: [U.O1] }))).toEqual({ created: 1, skipped: 0 }); expect(ok<any>(await f.charge(U.A, U.A, { feeId: j.id, all: true }))).toEqual({ created: 1, skipped: 1 });
  });
});

describe("numbered receipts", () => {
  it("numbers receipts 1, 2, 3 in an unbroken sequence per association, each association with its own", async () => {
    expect([ok<any>(await receipt()).number, ok<any>(await receipt()).number, ok<any>(await receipt({ memberId: U.O2 })).number]).toEqual([1, 2, 3]); expect(ok<any>(await f.recordReceipt(U.B, U.B, { memberId: U.O3, amountCents: 500, method: "cash", receivedOn: TODAY, category: "other" })).number).toBe(1);
    expect((await f.receipts(U.A)).map((r) => r.number)).toEqual([3, 2, 1]); expect((await f.receipts(U.B)).map((r) => r.number)).toEqual([1]);
  });
  it("validates every field: the amount, the method, the date, what it is for, and who paid", async () => {
    for (const [bad, why] of [[{ amountCents: 0 }, /cents/], [{ amountCents: 1.5 }, /cents/], [{ method: "barter" }, /how it was paid/], [{ receivedOn: plus(1) }, /not in the future/], [{ receivedOn: "soon" }, /date/], [{ category: "tax" }, /what it is for/], [{ memberId: U.O3 }, /your members/], [{ memberId: null }, /Say who paid/], [{ note: "x".repeat(300) }, /too long/]] as const)
      expect(await receipt(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(ok<any>(await receipt({ memberId: null, payerName: "Visiting operator", category: "other" })).number).toBe(1); expect((await f.receipts(U.A))[0].member).toBe("Visiting operator");                       // a non-member can pay, by name
  });
  it("marks a levy paid only when its receipts add up, takes part payments, refuses more than is owed, and refuses a levy that is paid", async () => {
    const l = await levy(U.O1, "Annual membership", 600, plus(10)); expect(ok<any>(await receipt({ levyId: l, amountCents: R(250) })).number).toBe(1); expect((await q(`SELECT paid_at FROM levies WHERE id = $1`, [l]))[0].paid_at).toBeNull();
    expect(await receipt({ levyId: l, amountCents: R(400) })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("R350.00") }); ok(await receipt({ levyId: l, amountCents: R(350) })); expect((await q(`SELECT paid_at FROM levies WHERE id = $1`, [l]))[0].paid_at).not.toBeNull();
    expect(await receipt({ levyId: l, amountCents: 100 })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already paid") }); expect(await receipt({ levyId: l, memberId: U.O2, amountCents: 100 })).toMatchObject({ ok: false, status: 404 }); expect(await receipt({ levyId: l, memberId: null, payerName: "x" })).toMatchObject({ ok: false, status: 400 });
  });
  it("takes the receipt's category from the fee on the schedule when it is for a levy", async () => {
    ok(await fee({ kind: "joining", name: "Joining fee", amountCents: R(1000) })); const l = await levy(U.O1, "Joining fee", 1000, plus(5)); ok(await receipt({ levyId: l, amountCents: R(1000), category: undefined })); expect((await f.receipts(U.A))[0].category).toBe("joining");
  });
  it("never deletes a receipt: voiding keeps its number, needs a reason, makes the levy unpaid again, and cannot be done twice or for another association", async () => {
    const l = await levy(U.O1, "Annual membership", 600, plus(10)); const r = ok<any>(await receipt({ levyId: l, amountCents: R(600) })); const r2 = ok<any>(await receipt({ memberId: U.O2 }));
    expect(await f.voidReceipt(U.A, U.A, r.id, "  ")).toMatchObject({ ok: false, status: 400 }); expect(await f.voidReceipt(U.B, U.B, r.id, "mistake")).toMatchObject({ ok: false, status: 404 }); ok(await f.voidReceipt(U.A, U.A, r.id, "Wrong member")); expect(await f.voidReceipt(U.A, U.A, r.id, "again")).toMatchObject({ ok: false, status: 409 });
    expect((await q(`SELECT paid_at FROM levies WHERE id = $1`, [l]))[0].paid_at).toBeNull(); expect((await f.receipts(U.A)).find((x) => x.id === r.id)).toMatchObject({ number: 1, voided: true, voidReason: "Wrong member" }); expect(ok<any>(await receipt()).number).toBe(3);        // 1 is voided, 2 exists, the next is 3: nothing is reused
    expect(r2.number).toBe(2); expect((await q(`SELECT COUNT(*) AS n FROM receipts`))[0].n).toBe(3);
  });
});

describe("the member ledger", () => {
  it("shows what each member was charged, has paid, owes and has overdue, counting a levy marked paid with no receipt as paid but saying so", async () => {
    const a = await levy(U.O1, "Annual membership", 600, plus(-120)), b = await levy(U.O1, "Rank repairs", 500, plus(20)), c = await levy(U.O1, "Old levy", 200, plus(-300), true);
    ok(await receipt({ levyId: a, amountCents: R(100) })); ok(await receipt({ levyId: b, amountCents: R(500) })); ok(await receipt({ amountCents: R(50) }));                                    // 50 is not against any levy
    const m = (await f.memberLedger(U.A, TODAY)).find((x) => x.name === "Olu Owner")!; expect(m).toEqual({ memberId: U.O1, name: "Olu Owner", chargedCents: R(1300), paidCents: R(800), paidWithoutReceiptCents: R(200), unallocatedCents: R(50), owedCents: R(500), balanceCents: R(450), overdueCents: R(500), oldestOverdueOn: plus(-120), daysOverdue: 120 });
    expect((await f.memberLedger(U.A, TODAY)).find((x) => x.name === "Ona Owner")).toMatchObject({ chargedCents: 0, owedCents: 0, daysOverdue: 0, oldestOverdueOn: null }); expect((await f.memberLedger(U.B, TODAY)).map((x) => x.name)).toEqual(["Otto Owner"]);
  });
  it("gives a member a statement in date order with a running balance, voided receipts shown but not counted, and a note about payments with no receipt", async () => {
    const a = await levy(U.O1, "Annual membership", 600, plus(-60)); const r1 = ok<any>(await receipt({ levyId: a, amountCents: R(200), receivedOn: plus(-30) })), r2 = ok<any>(await receipt({ levyId: a, amountCents: R(100), receivedOn: plus(-10) })); ok(await f.voidReceipt(U.A, U.A, r2.id, "Bounced")); await levy(U.O1, "Old", 50, plus(-90), true);
    const s = ok<any>(await f.memberStatement(U.A, U.O1)); expect(s.member).toBe("Olu Owner"); expect(s.lines.map((l: any) => [l.kind, l.ref, l.amountCents, l.balanceCents])).toEqual([["charge", "", R(50), R(50)], ["charge", "", R(600), R(650)], ["receipt", "R-000001", R(200), R(450)], ["void", "R-000002", R(100), R(450)]]);
    expect(s.owedCents).toBe(R(400)); expect(s.openLevies).toEqual([{ id: a, title: "Annual membership", remainingCents: R(400), dueOn: plus(-60) }]);               // only what is still owed, oldest first
     expect(s.note).toContain("marked paid without a receipt"); expect(r1.number).toBe(1); expect(await f.memberStatement(U.A, U.O3)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("expenses and their approval", () => {
  const exp = (o: any = {}) => f.addExpense(U.A, U.A, { incurredOn: TODAY, category: "Rank maintenance", payee: "Lights & Co", amountCents: R(800), requestedBy: "Thabo Mokoena", description: "Repairs", ...o });
  it("needs one approval below the threshold and two different office bearers at or above it, and is approved only when it has enough", async () => {
    const t = await bearer("Thabo Mokoena"), s = await bearer("Sipho Dube"), l = await bearer("Lerato Nel");
    const small = ok<any>(await exp()), big = ok<any>(await exp({ amountCents: R(5000) })), edge = ok<any>(await exp({ amountCents: R(5000) - 1 })); expect([small.requiredApprovals, big.requiredApprovals, edge.requiredApprovals]).toEqual([1, 2, 1]);
    expect(ok<any>(await f.approveExpense(U.A, U.A, small.id, s))).toEqual({ status: "approved", approvals: 1 }); expect(ok<any>(await f.approveExpense(U.A, U.A, big.id, s))).toEqual({ status: "pending", approvals: 1 }); expect(await f.approveExpense(U.A, U.A, big.id, s)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already approved") });
    expect(ok<any>(await f.approveExpense(U.A, U.A, big.id, l))).toEqual({ status: "approved", approvals: 2 }); expect((await f.expenses(U.A, "approved")).map((e) => e.amountCents).sort()).toEqual([R(800), R(5000)].sort()); expect((await f.expenses(U.A)).find((e) => e.id === big.id)!.approvals.map((a) => a.name).sort()).toEqual(["Lerato Nel", "Sipho Dube"]); void t;
  });
  it("refuses to let anyone approve what they asked for, an office bearer whose term ended, someone who is not an office bearer, or an expense already decided", async () => {
    const t = await bearer("Thabo Mokoena"), old = await bearer("Retired Chair", plus(-5)), other = await bearer("Outsider", plus(100), U.B), e = ok<any>(await exp());
    expect(await f.approveExpense(U.A, U.A, e.id, t)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("approve what they asked for") }); expect(await f.approveExpense(U.A, U.A, e.id, "  thabo ".trim() ? t : t)).toMatchObject({ ok: false });
    expect(await f.approveExpense(U.A, U.A, e.id, old)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("term as Committee ended") }); expect(await f.approveExpense(U.A, U.A, e.id, other)).toMatchObject({ ok: false, status: 400 }); expect(await f.approveExpense(U.A, U.A, e.id, "nope")).toMatchObject({ ok: false, status: 400 }); expect(await f.approveExpense(U.B, U.B, e.id, other)).toMatchObject({ ok: false, status: 404 });
    const s = await bearer("Sipho Dube"); ok(await f.approveExpense(U.A, U.A, e.id, s)); expect(await f.approveExpense(U.A, U.A, e.id, await bearer("Lerato Nel"))).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already approved") });
  });
  it("matches the person who asked regardless of capital letters or spaces, and counts a rejection as a decision that needs a reason", async () => {
    const t = await bearer("Thabo Mokoena"), e = ok<any>(await exp({ requestedBy: "  THABO mokoena " })); expect(await f.approveExpense(U.A, U.A, e.id, t)).toMatchObject({ ok: false, status: 400 });
    expect(await f.rejectExpense(U.A, U.A, e.id, "")).toMatchObject({ ok: false, status: 400 }); ok(await f.rejectExpense(U.A, U.A, e.id, "No quote supplied")); expect(await f.rejectExpense(U.A, U.A, e.id, "again")).toMatchObject({ ok: false, status: 409 }); expect(await f.approveExpense(U.A, U.A, e.id, await bearer("Sipho Dube"))).toMatchObject({ ok: false, status: 409 });
    expect((await f.expenses(U.A, "rejected"))[0]).toMatchObject({ status: "rejected", rejectedReason: "No quote supplied" }); expect(await f.rejectExpense(U.B, U.B, e.id, "x")).toMatchObject({ ok: false, status: 404 });
  });
  it("validates an expense: a real past date, a category, a payee, who asked, an amount in cents", async () => {
    for (const bad of [{ incurredOn: plus(1) }, { incurredOn: "soon" }, { category: "" }, { payee: "" }, { requestedBy: "" }, { amountCents: 0 }, { amountCents: 10.5 }, { description: "x".repeat(400) }]) expect(await exp(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await f.saveSettings(U.A, U.A, { approvalThresholdCents: 100 })); expect(ok<any>(await exp({ amountCents: 100 })).requiredApprovals).toBe(2);                                                         // the association's own threshold applies
  });
});

describe("cash and banking", () => {
  it("compares cash received (not voided) with cash banked, working out the oldest cash not yet banked by covering the oldest first", async () => {
    ok(await receipt({ method: "cash", amountCents: R(300), receivedOn: plus(-50) })); ok(await receipt({ method: "cash", amountCents: R(200), receivedOn: plus(-20) })); ok(await receipt({ method: "eft", amountCents: R(999), receivedOn: plus(-5) })); const v = ok<any>(await receipt({ method: "cash", amountCents: R(100), receivedOn: plus(-1) })); ok(await f.voidReceipt(U.A, U.A, v.id, "Error"));
    expect(await f.cash(U.A, TODAY)).toEqual({ cashReceivedCents: R(500), bankedCents: 0, onHandCents: R(500), unbankedCents: R(500), oldestUnbankedOn: plus(-50), oldestUnbankedDays: 50, overBankedCents: 0 });
    ok(await f.addDeposit(U.A, U.A, { depositedOn: plus(-40), amountCents: R(300), reference: "DEP-1" })); expect(await f.cash(U.A, TODAY)).toMatchObject({ onHandCents: R(200), unbankedCents: R(200), oldestUnbankedOn: plus(-20), oldestUnbankedDays: 20 });
    ok(await f.addDeposit(U.A, U.A, { depositedOn: plus(-3), amountCents: R(250) })); expect(await f.cash(U.A, TODAY)).toMatchObject({ onHandCents: -R(50), unbankedCents: 0, oldestUnbankedOn: null, overBankedCents: R(50) });
  });
  it("records deposits, validated, and lists them newest first, scoped to the association", async () => {
    for (const bad of [{ depositedOn: plus(1) }, { depositedOn: "soon" }, { amountCents: 0 }, { reference: "x".repeat(200) }]) expect(await f.addDeposit(U.A, U.A, { depositedOn: TODAY, amountCents: 100, ...bad }), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await f.addDeposit(U.A, U.A, { depositedOn: plus(-9), amountCents: 500, reference: "A" })); ok(await f.addDeposit(U.A, U.A, { depositedOn: plus(-2), amountCents: 700 })); expect((await f.deposits(U.A)).map((d) => d.amountCents)).toEqual([700, 500]); expect(await f.deposits(U.B)).toEqual([]);
  });
});

describe("budgets and statements", () => {
  it("states income and expenses for a month and a year, counting only receipts that are not voided and expenses that are approved, with the budget alongside", async () => {
    const s = await bearer("Sipho Dube"); ok(await receipt({ category: "membership", amountCents: R(600), receivedOn: "2026-10-05" })); ok(await receipt({ category: "levy", amountCents: R(400), receivedOn: "2026-10-20" })); ok(await receipt({ category: "membership", amountCents: R(600), receivedOn: "2026-09-10" }));
    const v = ok<any>(await receipt({ category: "fine", amountCents: R(999), receivedOn: "2026-10-21" })); ok(await f.voidReceipt(U.A, U.A, v.id, "Error"));
    const e1 = ok<any>(await f.addExpense(U.A, U.A, { incurredOn: "2026-10-12", category: "Rank maintenance", payee: "Lights & Co", amountCents: R(300), requestedBy: "Thabo" })); ok(await f.approveExpense(U.A, U.A, e1.id, s)); ok(await f.addExpense(U.A, U.A, { incurredOn: "2026-10-15", category: "Rank maintenance", payee: "Pending Ltd", amountCents: R(700), requestedBy: "Thabo" }));
    const oct = ok<any>(await f.statement(U.A, { month: "2026-10" })); expect(oct).toEqual({ period: "2026-10", income: [{ category: "levy", amountCents: R(400) }, { category: "membership", amountCents: R(600) }], expenses: [{ category: "Rank maintenance", amountCents: R(300) }], incomeCents: R(1000), expensesCents: R(300), netCents: R(700) });
    ok(await f.setBudget(U.A, U.A, { year: 2026, category: "Rank maintenance", amountCents: R(1000) })); ok(await f.setBudget(U.A, U.A, { year: 2026, category: "membership", amountCents: R(2000) })); const yr = ok<any>(await f.statement(U.A, { year: 2026 }));
    expect(yr).toMatchObject({ period: "2026", incomeCents: R(1600), expensesCents: R(300), netCents: R(1300) }); expect(yr.months.find((m: any) => m.month === "2026-09")).toMatchObject({ incomeCents: R(600), expensesCents: 0 }); expect(yr.months.find((m: any) => m.month === "2026-10")).toMatchObject({ incomeCents: R(1000), expensesCents: R(300), netCents: R(700) });
    expect(yr.budget).toEqual([{ category: "levy", budgetCents: null, actualCents: R(400), varianceCents: null }, { category: "membership", budgetCents: R(2000), actualCents: R(1200), varianceCents: -R(800) }, { category: "Rank maintenance", budgetCents: R(1000), actualCents: R(300), varianceCents: -R(700) }]);
  });
  it("validates what it is asked for, scopes to the association, and keeps one budget per year and category", async () => {
    expect(await f.statement(U.A, {})).toMatchObject({ ok: false, status: 400 }); expect(await f.statement(U.A, { month: "October" })).toMatchObject({ ok: false, status: 400 }); ok(await receipt({ category: "levy", amountCents: R(10), receivedOn: "2026-10-05" })); expect(ok<any>(await f.statement(U.B, { month: "2026-10" })).incomeCents).toBe(0);
    for (const bad of [{ year: 1999 }, { year: 2026.5 }, { category: "" }, { amountCents: -1 }, { amountCents: 1.5 }]) expect(await f.setBudget(U.A, U.A, { year: 2026, category: "Fuel", amountCents: 100, ...bad } as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await f.setBudget(U.A, U.A, { year: 2026, category: "Fuel", amountCents: 100 })); ok(await f.setBudget(U.A, U.A, { year: 2026, category: "Fuel", amountCents: 250 })); expect(await f.budgets(U.A, 2026)).toEqual([{ category: "Fuel", amountCents: 250 }]); expect(await f.budgets(U.B, 2026)).toEqual([]);
  });
});

describe("the overview and what it flags", () => {
  const ids = async () => (await f.summary(U.A, TODAY)).flags.map((x) => x.id);
  it("flags a fee above the cap, payments marked paid with no receipt, and says nothing when the books are clean", async () => {
    expect(await ids()).toEqual([]); ok(await comp.saveRegistration(U.A, U.A, { feeCapCents: R(10_000) })); const j = ok<any>(await fee({ kind: "joining", name: "Joining fee", amountCents: R(12_000) })); await levy(U.O1, "Old levy", 100, plus(-5), true);
    const s = await f.summary(U.A, TODAY); expect(s.flags.map((x) => [x.id.split(":")[1], x.severity])).toEqual([["cap", "high"], ["noreceipt", "medium"]]); expect(s.flags[1].message).toContain("1 member has levies marked paid with no receipt (R100.00)"); ok(await f.setFeeActive(U.A, U.A, j.id, false)); expect(await ids()).toEqual(["fin:noreceipt", "fin:noschedule"]);                  // charges exist but nothing is on the schedule now
    ok(await fee({ kind: "levy", name: "Rank repairs", amountCents: R(900) })); expect(await ids()).toEqual(["fin:noreceipt"]);
  });
  it("flags an expense waiting 14 days, a member 90 days overdue, unbanked cash after 30 and 60 days, more banked than received, and three voids in a month", async () => {
    const e = ok<any>(await f.addExpense(U.A, U.A, { incurredOn: TODAY, category: "Fuel", payee: "Garage", amountCents: R(100), requestedBy: "X" })); await db.query(`UPDATE expenses SET created_at = $2 WHERE id = $1`, [e.id, new Date(`${plus(-13)}T08:00:00Z`)]); expect(await ids()).not.toContain(`fin:pending:${e.id}`);
    await db.query(`UPDATE expenses SET created_at = $2 WHERE id = $1`, [e.id, new Date(`${plus(-14)}T08:00:00Z`)]); expect(await ids()).toContain(`fin:pending:${e.id}`);
    await levy(U.O1, "Annual", 600, plus(-90)); expect(await ids()).not.toContain("fin:overdue"); await db.query(`UPDATE levies SET due_date = $1`, [plus(-91)]); expect(await ids()).toContain("fin:overdue");
    ok(await receipt({ method: "cash", amountCents: R(100), receivedOn: plus(-30) })); expect(await ids()).not.toContain("fin:cash"); await db.query(`UPDATE receipts SET received_on = $1`, [plus(-31)]); let c = (await f.summary(U.A, TODAY)).flags.find((x) => x.id === "fin:cash")!; expect(c.severity).toBe("medium"); expect(c.message).toContain("R100.00 of cash has not been banked, the oldest from");
    await db.query(`UPDATE receipts SET received_on = $1`, [plus(-60)]); expect((await f.summary(U.A, TODAY)).flags.find((x) => x.id === "fin:cash")!.severity).toBe("medium");                      // exactly 60 days is still medium
    await db.query(`UPDATE receipts SET received_on = $1`, [plus(-61)]); c = (await f.summary(U.A, TODAY)).flags.find((x) => x.id === "fin:cash")!; expect(c.severity).toBe("high"); ok(await f.addDeposit(U.A, U.A, { depositedOn: plus(-2), amountCents: R(150) })); expect(await ids()).toContain("fin:overbanked"); expect(await ids()).not.toContain("fin:cash");
    for (let i = 0; i < 3; i++) { const r = ok<any>(await receipt({ amountCents: 100 })); ok(await f.voidReceipt(U.A, U.A, r.id, "Error")); } expect(await ids()).toContain("fin:voids");
  });
  it("flags charges or payments made with no approved fee schedule, and reports the month's figures and what members owe", async () => {
    ok(await receipt({ amountCents: R(400), category: "levy", receivedOn: "2026-11-01" })); await levy(U.O1, "Annual", 600, plus(-10)); expect(await ids()).toContain("fin:noschedule");
    const s = await f.summary(U.A, TODAY); expect(s.measures).toEqual({ collectedThisMonthCents: R(400), expensesThisMonthCents: 0, netThisMonthCents: R(400), owedByMembersCents: R(600), overdueCents: R(600), membersOverdue: 1, pendingExpenses: 0 }); ok(await fee()); expect(await ids()).not.toContain("fin:noschedule");
  });
});
