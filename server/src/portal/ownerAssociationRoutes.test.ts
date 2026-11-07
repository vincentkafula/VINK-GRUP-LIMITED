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
import { createDelegates } from "../services/delegates.js";

/**
 * The owner's association API, and the association's claims queue, through the real routers (with the gate the portal puts in front of the association), as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02", L = { a: id(30), b: id(31), c: id(32), d: id(33) };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "";
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
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}


const MY = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/my-association${p}`, who, "vehicle_owner", b);
const O1 = (m: string, p: string, b?: unknown) => MY(U.O1, m, p, b), O2 = (m: string, p: string, b?: unknown) => MY(U.O2, m, p, b), O3 = (m: string, p: string, b?: unknown) => MY(U.O3, m, p, b);
const AS = (m: string, p: string, b?: unknown, who = U.A) => call(m, `/association${p}`, who, "association", b), BS = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, U.B, "association", b);
beforeEach(async () => { await db.query(`INSERT INTO levies (id, association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,'Annual levy','600.00',$4),($5,$2,$3,'Rank fee','100.00',$6),($7,$2,$8,'Annual levy','300.00',$4),($9,$10,$11,'Other levy','50.00',$4)`, [L.a, U.A, U.O1, plus(-120), L.b, plus(10), L.c, U.O2, L.d, U.B, U.O3]); });

describe("the owner's association, through the owner routes", () => {
  it("shows the owner their associations, membership, what is owed and the routes, and nobody else's", async () => {
    await db.query(`INSERT INTO association_registration (association_id, status, registration_number, province) VALUES ($1,'registered','WC/ASSOC/0042','Western Cape')`, [U.A]); await db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, valid_from, valid_until, condition_route) VALUES ($1,'L1','2024-01-01',$2,'Langa to Bellville')`, [V.v1, plus(200)]);
    const p = (await O1("GET", "")).body; expect(p).toMatchObject({ success: true, associations: [{ associationId: U.A, name: expect.any(String), status: "active", registrationNumber: "WC/ASSOC/0042", province: "Western Cape", routes: ["Langa to Bellville"], ledger: { chargedCents: 70000, owedCents: 70000, overdueCents: 60000, daysOverdue: 120 } }] });
    expect((await O3("GET", "")).body.associations.map((a: any) => a.associationId)).toEqual([U.B]); expect(JSON.stringify(p)).not.toContain(U.O2);
  });
  it("gives the statement and receipts only for an association the owner is in, and the owner's own receipt PDF only", async () => {
    const r1 = (await AS("POST", "/finance/receipts", { memberId: U.O1, levyId: L.a, amountCents: 20000, method: "eft", receivedOn: plus(-5) })).body.id, r2 = (await AS("POST", "/finance/receipts", { memberId: U.O2, levyId: L.c, amountCents: 10000, method: "cash", receivedOn: plus(-5) })).body.id;
    const s = await O1("GET", `/${U.A}/statement`); expect(s.status).toBe(200); expect(s.body.openLevies.map((l: any) => [l.title, l.remainingCents])).toEqual([["Annual levy", 40000], ["Rank fee", 10000]]); expect((await O1("GET", `/${U.B}/statement`)).status).toBe(404); expect((await O1("GET", "/nope/statement")).status).toBe(400); expect((await O3("GET", `/${U.A}/statement`)).status).toBe(404);
    expect((await O1("GET", `/${U.A}/receipts`)).body.receipts.map((r: any) => [r.number, r.amountCents])).toEqual([["R-000001", 20000]]); const pdf = await fetch(`${url}/owner/my-association/${U.A}/receipts/${r1}.pdf`, { headers: { "x-test-user": `${U.O1}:vehicle_owner` } }); expect(pdf.status).toBe(200); expect(pdf.headers.get("content-type")).toBe("application/pdf"); expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(500);
    for (const [who, rid] of [[U.O1, r2], [U.O2, r1], [U.O3, r1]] as const) expect((await fetch(`${url}/owner/my-association/${U.A}/receipts/${rid}.pdf`, { headers: { "x-test-user": `${who}:vehicle_owner` } })).status, `${who} ${rid}`).toBe(404); expect((await fetch(`${url}/owner/my-association/${U.A}/receipts/nope.pdf`, { headers: { "x-test-user": `${U.O1}:vehicle_owner` } })).status).toBe(400);
  });
  it("records an 'I have paid' claim, retries it safely, refuses a bad one, and lets the owner withdraw it", async () => {
    for (const [bad, st] of [[{ associationId: U.B }, 404], [{ amountCents: 0 }, 400], [{ method: "barter" }, 400], [{ paidOn: plus(1) }, 400], [{ levyId: L.c }, 404], [{ amountCents: 70001, levyId: L.a }, 409]] as const) expect((await O1("POST", "/claims", Object.assign({ associationId: U.A, levyId: L.a, amountCents: 20000, paidOn: plus(-1), method: "eft" }, bad))).status, JSON.stringify(bad)).toBe(st);
    const a = await O1("POST", "/claims", { associationId: U.A, levyId: L.a, amountCents: 20000, paidOn: plus(-1), method: "eft", reference: "EFT 1", clientRef: "p-1" }); expect(a.status).toBe(201); const b = await O1("POST", "/claims", { associationId: U.A, levyId: L.a, amountCents: 20000, paidOn: plus(-1), method: "eft", clientRef: "p-1" }); expect(b.status).toBe(200); expect(b.body).toMatchObject({ duplicate: true, id: a.body.id });
    expect((await O1("GET", "/claims")).body.claims).toEqual([expect.objectContaining({ status: "claimed", amountCents: 20000, association: expect.any(String) })]); expect((await O2("GET", "/claims")).body.claims).toEqual([]); expect((await O2("POST", `/claims/${a.body.id}/withdraw`)).status).toBe(404); expect((await O1("POST", `/claims/${a.body.id}/withdraw`)).status).toBe(200); expect((await O1("POST", `/claims/${a.body.id}/withdraw`)).status).toBe(409); expect((await O1("POST", "/claims/nope/withdraw")).status).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.dues.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.dues.claim", "owner.dues.withdraw"]);
  });
});

describe("the association's queue of payments to confirm", () => {
  const claim = async (o: any = {}) => (await O1("POST", "/claims", { associationId: U.A, levyId: L.a, amountCents: 20000, paidOn: plus(-1), method: "eft", reference: "EFT 8841", ...o })).body.id as string;
  it("lists them for the association, confirming one issues the receipt and shows on the owner's statement, and cannot be done twice", async () => {
    const c = await claim(); await O2("POST", "/claims", { associationId: U.A, amountCents: 5000, paidOn: plus(-1), method: "cash" }); const l = (await AS("GET", "/finance/claims")).body.claims; expect(l.map((x: any) => [x.member, x.levy, x.amountCents])).toEqual([["Olu Owner", "Annual levy", 20000], ["Ona Owner", null, 5000]]); expect((await BS("GET", "/finance/claims")).body.claims).toEqual([]);
    const ok = await AS("POST", `/finance/claims/${c}/confirm`, { note: "Seen on the statement" }); expect(ok.status).toBe(200); expect(ok.body).toMatchObject({ number: 1 }); expect((await AS("POST", `/finance/claims/${c}/confirm`, {})).status).toBe(409); const s = (await O1("GET", `/${U.A}/statement`)).body; expect(s.openLevies.find((x: any) => x.id === L.a).remainingCents).toBe(40000); expect(s.claims[0]).toMatchObject({ status: "confirmed", receiptId: ok.body.receiptId }); expect((await O1("GET", `/${U.A}/receipts`)).body.receipts).toHaveLength(1);
    expect((await q(`SELECT action FROM audit_log WHERE action = 'finance.claim.confirm'`)).length).toBe(1);
  });
  it("rejects with a reason, and the owner sees the reason", async () => {
    const c = await claim(); expect((await AS("POST", `/finance/claims/${c}/reject`, {})).status).toBe(400); expect((await AS("POST", `/finance/claims/${c}/reject`, { reason: "Nothing on the statement" })).status).toBe(200); expect((await O1("GET", "/claims")).body.claims[0]).toMatchObject({ status: "rejected", decisionNote: "Nothing on the statement" }); expect((await AS("POST", `/finance/claims/${c}/confirm`, {})).status).toBe(409);
  });
  it("lets an association decide only its own members' claims, and refuses a bad id", async () => {
    const c = await claim(); expect((await BS("POST", `/finance/claims/${c}/confirm`, {})).status).toBe(404); expect((await BS("POST", `/finance/claims/${c}/reject`, { reason: "no" })).status).toBe(404); expect((await AS("POST", "/finance/claims/nope/confirm", {})).status).toBe(400); expect((await AS("POST", "/finance/claims/nope/reject", {})).status).toBe(400);
  });
  it("lets a treasurer deal with them and keeps a secretary out, because it belongs to finance", async () => {
    const c = await claim(); const dels = createDelegates(db, () => NOW); const tre = ok<any>(await dels.create(U.A, U.A, { name: "Sipho", email: "s@x.test", username: "sipho", role: "treasurer" })), sec = ok<any>(await dels.create(U.A, U.A, { name: "Lerato", email: "l@x.test", username: "lerato", role: "secretary" }));
    expect((await AS("GET", "/finance/claims", undefined, sec.id)).status).toBe(403); expect((await AS("POST", `/finance/claims/${c}/confirm`, {}, sec.id)).status).toBe(403); expect((await AS("GET", "/finance/claims", undefined, tre.id)).body.claims).toHaveLength(1); const r = await AS("POST", `/finance/claims/${c}/confirm`, {}, tre.id); expect(r.status).toBe(200);
    expect((await q(`SELECT actor_id FROM audit_log WHERE action = 'finance.claim.confirm'`))[0].actor_id).toBe(tre.id);                  // recorded in the treasurer's own name
  });
});
function ok<T>(r: any): T { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; }
