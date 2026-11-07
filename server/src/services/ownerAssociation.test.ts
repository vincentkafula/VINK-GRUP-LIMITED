/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerAssociation, type OwnerAssociation } from "./ownerAssociation.js";
import { createFinance } from "./finance.js";

/**
 * The owner's association. Association A has owners O1 and O2 as active members (and O3 as removed); association B has O3, and O1 has asked to join B.
 * O1 has a R600 levy (due long ago) and a R100 levy; O2 has a R300 levy. The clock is Monday 2 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5) }, V = { v1: id(20), v2: id(21), v3: id(22) }, L = { a: id(30), b: id(31), c: id(32), d: id(33) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, oa: OwnerAssociation;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (d: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); oa = createOwnerAssociation(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Bellville Taxi Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by, responded_at) VALUES ($1,$2,'vehicle_owner','active','member','2025-03-10T08:00:00Z'),($1,$3,'vehicle_owner','active','member','2026-01-05T08:00:00Z'),($1,$4,'vehicle_owner','removed','member','2025-01-01T08:00:00Z'),($5,$4,'vehicle_owner','active','association','2024-06-01T08:00:00Z'),($5,$2,'vehicle_owner','pending','member',NULL)`, [U.A, U.O1, U.O2, U.O3, U.B]);
  await db.query(`INSERT INTO association_registration (association_id, status, registration_number, province) VALUES ($1,'full','WC/ASSOC/0042','Western Cape')`, [U.A]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2]);
  await db.query(`INSERT INTO levies (id, association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,'Annual levy','600.00',$4),($5,$2,$3,'Rank fee','100.00',$6),($7,$2,$8,'Annual levy','300.00',$4),($9,$10,$11,'Other levy','50.00',$4)`, [L.a, U.A, U.O1, plus(-120), L.b, plus(10), L.c, U.O2, L.d, U.B, U.O3]);
});
const bank = (reg: string, route: string | null, until: string) => db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, valid_from, valid_until, condition_route) VALUES ((SELECT id FROM vehicles WHERE registration = $1),$2,'2024-01-01',$3,$4)`, [reg, `LIC-${reg}-${until}`, until, route]);
const fin = () => createFinance(db, () => NOW);
const receipt = async (member: string, levy: string | null, cents: number, o: any = {}) => ok<any>(await fin().recordReceipt(U.A, U.A, { memberId: member, ...(levy ? { levyId: levy } : { category: "other" }), amountCents: cents, method: "eft", receivedOn: plus(-5), ...o }));

describe("the profile", () => {
  it("shows each association the owner belongs to or has asked to join, with their status, number, standing and what they owe, and no other owner's", async () => {
    await db.query(`INSERT INTO member_register (association_id, member_id, card_number, standing, standing_reason) VALUES ($1,$2,'MC-0042','suspended','Unpaid levies')`, [U.A, U.O1]); await receipt(U.O1, L.a, R(200));
    const p = await oa.profile(U.O1); expect(p.associations.map((a) => [a.name, a.status, a.requestedBy])).toEqual([["Bellville Taxi Association", "pending", "member"], ["Langa Taxi Association", "active", "member"]]);
    const a = p.associations.find((x) => x.name === "Langa Taxi Association")!; expect(a).toMatchObject({ associationId: U.A, joinedOn: "2025-03-10", registrationNumber: "WC/ASSOC/0042", province: "Western Cape", membershipNumber: "MC-0042", standing: "suspended", standingReason: "Unpaid levies", pendingClaims: 0 });
    expect(a.ledger).toEqual({ chargedCents: 70000, paidCents: 20000, owedCents: 50000, overdueCents: 40000, daysOverdue: 120, unallocatedCents: 0 }); const b = p.associations.find((x) => x.name === "Bellville Taxi Association")!; expect(b).toMatchObject({ status: "pending", joinedOn: null, ledger: null, routes: [], membershipNumber: null, standing: "active", standingReason: null });
    expect(JSON.stringify(p)).not.toContain("Ona Owner"); expect((await oa.profile(U.O2)).associations.map((x) => x.name)).toEqual(["Langa Taxi Association"]);
  });
  it("does not show an association the owner was removed from or declined, and shows nothing to someone with no membership", async () => {
    expect((await oa.profile(U.O3)).associations.map((x) => x.name)).toEqual(["Bellville Taxi Association"]); await db.query(`UPDATE memberships SET status = 'declined' WHERE member_id = $1 AND association_id = $2`, [U.O1, U.B]); expect((await oa.profile(U.O1)).associations.map((x) => x.name)).toEqual(["Langa Taxi Association"]); expect(await oa.profile(id(99))).toEqual({ associations: [], documents: [] });
  });
  it("shows the routes on the owner's valid licences, once each, and not an expired licence, a licence with no route, or another owner's", async () => {
    await bank("CA 111-111", "Langa to Bellville", plus(300)); await bank("CA 222-222", "Langa to Bellville", plus(100)); await bank("CA 222-222", "Langa to Cape Town", plus(-5)); await bank("CA 222-222", null, plus(200)); await bank("CA 333-333", "Ona's secret route", plus(200));
    expect((await oa.profile(U.O1)).associations.find((a) => a.name === "Langa Taxi Association")!.routes).toEqual(["Langa to Bellville"]); expect(JSON.stringify(await oa.profile(U.O1))).not.toContain("secret"); expect((await oa.profile(U.O2)).associations[0].routes).toEqual(["Ona's secret route"]);
  });
  it("lists the owner's membership documents (not vehicle documents or other kinds), with expiry", async () => {
    await db.query(`INSERT INTO compliance_documents (owner_id, vehicle_id, kind, reference, expires_on) VALUES ($1,NULL,'letter_of_recommendation','LOR-2025-17',NULL),($1,NULL,'membership_certificate','MC-9','2027-03-01'),($1,$2,'letter_of_recommendation','vehicle-one',NULL),($1,NULL,'insurance','POL-1','2027-01-01'),($3,NULL,'letter_of_recommendation','OTHERS',NULL)`, [U.O1, V.v1, U.O2]);
    const d = (await oa.profile(U.O1)).documents; expect(d.map((x) => [x.kind, x.reference, x.expiresOn]).sort()).toEqual([["letter_of_recommendation", "LOR-2025-17", null], ["membership_certificate", "MC-9", "2027-03-01"]]);
  });
  it("counts the payments waiting for the association to confirm", async () => { ok(await oa.claim(U.O1, { associationId: U.A, amountCents: R(100), paidOn: plus(-1), method: "eft" })); expect((await oa.profile(U.O1)).associations.find((a) => a.associationId === U.A)!.pendingClaims).toBe(1); expect((await oa.profile(U.O2)).associations[0].pendingClaims).toBe(0); });
});
function R(rand: number) { return Math.round(rand * 100); }

describe("the statement and receipts", () => {
  it("shows the owner's own charges and receipts with a running balance, what is still open, and their claims, and refuses an association they are not in", async () => {
    await receipt(U.O1, L.a, R(200)); ok(await oa.claim(U.O1, { associationId: U.A, levyId: L.b, amountCents: R(100), paidOn: plus(-1), method: "cash" })); const s = ok<any>(await oa.statement(U.O1, U.A));
    expect(s.member).toBe("Olu Owner"); expect(s.lines.map((l: any) => [l.kind, l.description, l.amountCents, l.balanceCents])).toEqual([["charge", "Annual levy", 60000, 60000], ["receipt", expect.any(String), 20000, 40000], ["charge", "Rank fee", 10000, 50000]]); expect(s.openLevies.map((l: any) => [l.title, l.remainingCents])).toEqual([["Annual levy", 40000], ["Rank fee", 10000]]); expect(s.claims.map((c: any) => [c.amountCents, c.status])).toEqual([[10000, "claimed"]]);
    expect(await oa.statement(U.O1, U.B)).toMatchObject({ ok: false, status: 404 }); expect(await oa.statement(U.O3, U.A)).toMatchObject({ ok: false, status: 404 }); expect(await oa.statement(U.O1, "nope")).toMatchObject({ ok: false, status: 404 }); expect(JSON.stringify(s)).not.toContain("Ona");
  });
  it("lists the association's numbered receipts to this owner only, with a voided one saying so, and gives the PDF only for one's own receipt", async () => {
    const mine = await receipt(U.O1, L.a, R(200)), second = await receipt(U.O1, L.b, R(50)), others = await receipt(U.O2, L.c, R(100)); ok(await fin().voidReceipt(U.A, U.A, second.id, "Entered twice"));
    const r = ok<any>(await oa.receipts(U.O1, U.A)).receipts; expect(r.map((x: any) => [x.number, x.amountCents, x.voided, x.voidReason])).toEqual([["R-000002", 5000, true, "Entered twice"], ["R-000001", 20000, false, null]]); expect(JSON.stringify(r)).not.toContain(others.id); expect(await oa.receipts(U.O1, U.B)).toMatchObject({ ok: false, status: 404 });
    const pdf = ok<Buffer>(await oa.receiptPdf(U.O1, U.A, mine.id)); expect(pdf.subarray(0, 4).toString()).toBe("%PDF"); expect(await oa.receiptPdf(U.O1, U.A, others.id)).toMatchObject({ ok: false, status: 404 }); expect(await oa.receiptPdf(U.O2, U.A, mine.id)).toMatchObject({ ok: false, status: 404 }); expect(await oa.receiptPdf(U.O1, U.A, "nope")).toMatchObject({ ok: false, status: 404 }); expect(await oa.receiptPdf(U.O3, U.A, mine.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("telling the association you have paid", () => {
  const claim = (o: any = {}) => oa.claim(U.O1, { associationId: U.A, levyId: L.a, amountCents: R(200), paidOn: plus(-1), method: "eft", reference: "EFT 8841", ...o });
  it("records a claim against one of the owner's open charges, or against none, validated", async () => {
    ok(await claim()); ok(await claim({ levyId: undefined, amountCents: R(50), note: "Paid ahead" })); expect((await oa.claims(U.O1)).map((c) => [c.association, c.amountCents, c.status, c.levyId, c.reference])).toEqual([["Langa Taxi Association", 5000, "claimed", null, "EFT 8841"], ["Langa Taxi Association", 20000, "claimed", L.a, "EFT 8841"]]); expect(await oa.claims(U.O2)).toEqual([]);
    for (const [bad, st] of [[{ associationId: U.B }, 404], [{ associationId: "nope" }, 404], [{ levyId: L.c }, 404], [{ levyId: L.d }, 404], [{ levyId: "nope" }, 404], [{ amountCents: 0 }, 400], [{ amountCents: 1.5 }, 400], [{ amountCents: 10_000_001 }, 400], [{ method: "barter" }, 400], [{ paidOn: plus(1) }, 400], [{ paidOn: "soon" }, 400], [{ paidOn: plus(-401) }, 400], [{ reference: "x".repeat(70) }, 400], [{ note: "x".repeat(300) }, 400], [{ clientRef: "x".repeat(80) }, 400]] as const) expect(await claim(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
  });
  it("will not claim more than is still owed on a charge, counting what is already waiting to be confirmed, nor against a charge already paid", async () => {
    ok(await claim({ amountCents: R(500) })); expect(await claim({ amountCents: R(101) })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("R100.00, with R500.00 already waiting") }); ok(await claim({ amountCents: R(100) })); expect(await claim({ amountCents: 1 })).toMatchObject({ ok: false, status: 409 });
    await receipt(U.O1, L.b, R(100)); expect(await claim({ levyId: L.b, amountCents: 100 })).toMatchObject({ ok: false, status: 404, error: expect.stringContaining("not one of your open charges") });
  });
  it("is safe to retry: the same client reference returns the first claim and records nothing more, per owner", async () => {
    const a = ok<any>(await claim({ clientRef: "phone-1" })), b = ok<any>(await claim({ clientRef: "phone-1", amountCents: R(999) })); expect([a.duplicate, b.duplicate, b.id]).toEqual([false, true, a.id]); expect((await q(`SELECT COUNT(*) AS n FROM dues_claims`))[0].n).toBe(1); expect(ok<any>(await oa.claim(U.O2, { associationId: U.A, amountCents: 100, paidOn: plus(-1), method: "cash", clientRef: "phone-1" })).duplicate).toBe(false);
  });
  it("limits how many payments can wait at once, and counts only the ones still waiting", async () => {
    const ids: string[] = []; for (let i = 0; i < 20; i++) ids.push(ok<any>(await claim({ levyId: undefined, amountCents: 100 })).id); expect(await claim({ levyId: undefined, amountCents: 100 })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("many payments waiting") }); ok(await oa.withdraw(U.O1, ids[0])); ok(await claim({ levyId: undefined, amountCents: 100 }));
  });
  it("lets the owner withdraw one that is still waiting, once, and only their own", async () => {
    const c = ok<any>(await claim()); expect(await oa.withdraw(U.O2, c.id)).toMatchObject({ ok: false, status: 404 }); expect(await oa.withdraw(U.O1, "nope")).toMatchObject({ ok: false, status: 404 }); ok(await oa.withdraw(U.O1, c.id)); expect(await oa.withdraw(U.O1, c.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been withdrawn") }); expect((await oa.claims(U.O1))[0].status).toBe("withdrawn"); ok(await claim({ amountCents: R(600) }));                  // a withdrawn claim no longer counts against the charge
  });
});

describe("the association confirming or rejecting", () => {
  it("lists what is waiting, with who, what for and how, for this association only", async () => {
    ok(await oa.claim(U.O1, { associationId: U.A, levyId: L.a, amountCents: R(200), paidOn: plus(-1), method: "eft", reference: "EFT 8841" })); ok(await oa.claim(U.O2, { associationId: U.A, amountCents: R(50), paidOn: plus(-2), method: "cash" })); await db.query(`INSERT INTO dues_claims (owner_id, association_id, amount_cents, paid_on, method) VALUES ($1,$2,100,$3,'eft')`, [U.O3, U.B, plus(-1)]);
    expect((await oa.pending(U.A)).map((c) => [c.member, c.levy, c.amountCents, c.method, c.reference])).toEqual([["Olu Owner", "Annual levy", 20000, "eft", "EFT 8841"], ["Ona Owner", null, 5000, "cash", null]]); expect((await oa.pending(U.B)).map((c) => c.member)).toEqual(["Otto Owner"]);
  });
  it("confirming issues the numbered receipt against the charge, reduces what is owed, marks the claim, and cannot be done twice", async () => {
    const c = ok<any>(await oa.claim(U.O1, { associationId: U.A, levyId: L.a, amountCents: R(200), paidOn: plus(-1), method: "eft", reference: "EFT 8841" })); const r = ok<any>(await oa.confirm(U.A, U.A, c.id, { note: "Seen on the statement" })); expect(r).toMatchObject({ id: c.id, number: 1 });
    const st = ok<any>(await oa.statement(U.O1, U.A)); expect(st.openLevies.find((l: any) => l.id === L.a).remainingCents).toBe(40000); expect(st.claims[0]).toMatchObject({ status: "confirmed", receiptId: r.receiptId, decisionNote: "Seen on the statement" }); const rows = ok<any>(await oa.receipts(U.O1, U.A)).receipts; expect(rows).toEqual([expect.objectContaining({ number: "R-000001", amountCents: 20000, method: "eft", receivedOn: plus(-1) })]);
    const note = (await q(`SELECT note FROM receipts`))[0].note; expect(note).toContain("Confirmed from the member's own report (reference EFT 8841): Seen on the statement"); expect(await oa.confirm(U.A, U.A, c.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been confirmed") }); expect((await oa.pending(U.A))).toEqual([]);
  });
  it("confirms a claim made against no charge as an 'other' receipt for the member", async () => {
    const c = ok<any>(await oa.claim(U.O2, { associationId: U.A, amountCents: R(75), paidOn: plus(-1), method: "cash" })); ok(await oa.confirm(U.A, U.A, c.id)); const r = (await q(`SELECT category, method, member_id, levy_id, amount_cents FROM receipts`))[0]; expect(r).toMatchObject({ category: "other", method: "cash", member_id: U.O2, levy_id: null, amount_cents: 7500 }); expect((await oa.profile(U.O2)).associations[0].ledger!.unallocatedCents).toBe(7500);
  });
  it("changes nothing when the receipt cannot be issued (say the charge was settled in the meantime), and says why", async () => {
    const c = ok<any>(await oa.claim(U.O1, { associationId: U.A, levyId: L.b, amountCents: R(100), paidOn: plus(-1), method: "eft" })); await receipt(U.O1, L.b, R(100)); const r = await oa.confirm(U.A, U.A, c.id); expect(r).toMatchObject({ ok: false, status: 409 }); expect((await q(`SELECT status, receipt_id FROM dues_claims`))[0]).toEqual({ status: "claimed", receipt_id: null }); expect((await q(`SELECT COUNT(*) AS n FROM receipts`))[0].n).toBe(1);
  });
  it("rejects with a reason, once, and a rejected claim frees the charge to be claimed again", async () => {
    const c = ok<any>(await oa.claim(U.O1, { associationId: U.A, levyId: L.b, amountCents: R(100), paidOn: plus(-1), method: "eft" })); expect(await oa.reject(U.A, U.A, c.id, "")).toMatchObject({ ok: false, status: 400 }); ok(await oa.reject(U.A, U.A, c.id, "Nothing on the statement")); expect(await oa.reject(U.A, U.A, c.id, "again")).toMatchObject({ ok: false, status: 409 }); expect(await oa.confirm(U.A, U.A, c.id)).toMatchObject({ ok: false, status: 409 });
    expect((await oa.claims(U.O1))[0]).toMatchObject({ status: "rejected", decisionNote: "Nothing on the statement" }); expect((await q(`SELECT COUNT(*) AS n FROM receipts`))[0].n).toBe(0); ok(await oa.claim(U.O1, { associationId: U.A, levyId: L.b, amountCents: R(100), paidOn: plus(-1), method: "eft" }));
  });
  it("lets an association decide only its own members' claims", async () => {
    const c = ok<any>(await oa.claim(U.O1, { associationId: U.A, amountCents: R(10), paidOn: plus(-1), method: "eft" })); expect(await oa.confirm(U.B, U.B, c.id)).toMatchObject({ ok: false, status: 404 }); expect(await oa.reject(U.B, U.B, c.id, "no")).toMatchObject({ ok: false, status: 404 }); expect(await oa.confirm(U.A, U.A, "nope")).toMatchObject({ ok: false, status: 404 }); expect(await oa.confirm(U.A, U.A, c.id, { note: "x".repeat(300) })).toMatchObject({ ok: false, status: 400 });
  });
});
