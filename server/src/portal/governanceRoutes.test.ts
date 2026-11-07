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
 * The governance API through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
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
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b), B = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.B, "association", b);
const GV = (m: string, p: string, b?: unknown) => call(m, `/association/governance${p}`, U.A, "association", b), GB = (m: string, p: string, b?: unknown) => call(m, `/association/governance${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);

describe("meetings, minutes, attendance and resolutions, through the routes", () => {
  it("records a meeting, takes minutes and attendance, and keeps another association out", async () => {
    expect((await GV("POST", "/meetings", { kind: "party", heldOn: plus(-5), title: "x" })).status).toBe(400); const m = await GV("POST", "/meetings", { kind: "executive", heldOn: plus(-10), title: "October exco", venue: "Rank office" }); expect(m.status).toBe(201);
    expect((await GV("PUT", `/meetings/${m.body.id}/minutes`, { adoptedOn: plus(-5) })).status).toBe(400); expect((await GV("PUT", `/meetings/${m.body.id}/minutes`, { minutes: "1. Rank repairs approved." })).status).toBe(200); expect((await GV("PUT", `/meetings/${m.body.id}/minutes`, { adoptedOn: plus(-3) })).status).toBe(200);
    expect((await GV("PUT", `/meetings/${m.body.id}/attendance`, { attendance: [{ name: "Olu Owner", memberId: U.O1, status: "present" }, { name: "Guest", status: "apology" }] })).body).toMatchObject({ success: true, present: 1, apologies: 1, absent: 0 }); expect((await GV("PUT", `/meetings/${m.body.id}/attendance`, { attendance: [{ name: "X", status: "late" }] })).status).toBe(400); expect((await GV("PUT", `/meetings/${m.body.id}/attendance`, {})).status).toBe(400);
    const list = (await GV("GET", "/meetings")).body.meetings; expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ title: "October exco", minutesAdoptedOn: plus(-3), attendance: [expect.objectContaining({ name: "Olu Owner" }), expect.objectContaining({ name: "Guest" })] });
    expect((await GB("GET", "/meetings")).body.meetings).toEqual([]); expect((await GB("PUT", `/meetings/${m.body.id}/minutes`, { minutes: "x" })).status).toBe(404); expect((await GV("PUT", "/meetings/nope/minutes", {})).status).toBe(400); expect((await GV("GET", "/meetings?year=1999")).body.meetings).toHaveLength(1);
  });
  it("numbers resolutions, marks them done, and refuses another association's", async () => {
    const r1 = await GV("POST", "/resolutions", { text: "Paint the rank", actionOwner: "Sipho", dueOn: plus(-1) }); expect(r1.status).toBe(201); expect(r1.body.number).toBe("2026/01"); expect((await GV("POST", "/resolutions", { text: "" })).status).toBe(400); expect((await GV("POST", "/resolutions", { text: "Second" })).body.number).toBe("2026/02");
    expect((await GV("GET", "/resolutions")).body.resolutions.map((r: any) => [r.number, r.overdue])).toEqual([["2026/02", false], ["2026/01", true]]); expect((await GV("POST", `/resolutions/${r1.body.id}/status`, { status: "finished" })).status).toBe(400); expect((await GB("POST", `/resolutions/${r1.body.id}/status`, { status: "done" })).status).toBe(404); expect((await GV("POST", `/resolutions/${r1.body.id}/status`, { status: "done" })).status).toBe(200);
    expect((await GV("GET", "/resolutions")).body.resolutions.find((r: any) => r.number === "2026/01")).toMatchObject({ status: "done", overdue: false });
  });
  it("records elections and declarations of interest", async () => {
    expect((await GV("POST", "/elections", { heldOn: plus(1) })).status).toBe(400); expect((await GV("POST", "/elections", { heldOn: plus(-400), results: "Chair: Thabo", nextDueOn: plus(300) })).status).toBe(201); expect((await GV("GET", "/elections")).body.elections).toEqual([expect.objectContaining({ heldOn: plus(-400), nextDueOn: plus(300) })]); expect((await q(`SELECT action FROM audit_log WHERE action = 'governance.election'`)).length).toBe(1);
    const ob = (await C("POST", "/office-bearers", { name: "Thabo Mokoena", office: "Chairperson" })).body.id; expect((await GV("POST", "/declarations", { officeBearerId: ob, declaredOn: TODAY })).status).toBe(400); expect((await GV("POST", "/declarations", { officeBearerId: ob, declaredOn: TODAY, none: true })).status).toBe(201); expect((await GV("POST", "/declarations", { officeBearerId: "nope", declaredOn: TODAY, none: true })).status).toBe(400);
    expect((await GV("GET", "/declarations")).body.declarations).toEqual([expect.objectContaining({ name: "Thabo Mokoena", none: true })]); expect((await GB("GET", "/declarations")).body.declarations).toEqual([]);
  });
});

describe("disciplinary cases, through the routes", () => {
  it("takes a case from complaint to hearing to an upheld outcome with a sanction to an appeal and closed, refusing each step out of order", async () => {
    const c = await GV("POST", "/cases", { subjectKind: "member", subjectId: U.O1, complaint: "Charged R15 000 to join the rank", charge: "Clause 14.2", openedOn: plus(-30) }); expect(c.status).toBe(201); expect((await GV("POST", "/cases", { subjectKind: "member", subjectId: U.O3, complaint: "x", openedOn: plus(-1) })).status).toBe(400);
    expect((await GV("PUT", `/cases/${c.body.id}`, { outcome: "upheld", decidedOn: plus(-5), sanction: "Fine" })).status).toBe(409); expect((await GV("PUT", `/cases/${c.body.id}`, { hearingOn: plus(-10) })).body).toMatchObject({ success: true, status: "hearing_set" });
    expect((await GV("PUT", `/cases/${c.body.id}`, { outcome: "upheld", decidedOn: plus(-5) })).status).toBe(400); expect((await GV("PUT", `/cases/${c.body.id}`, { outcome: "upheld", decidedOn: plus(-5), sanction: "Fined R2 000" })).body.status).toBe("decided");
    expect((await GV("PUT", `/cases/${c.body.id}`, { appealLodgedOn: plus(-3) })).body.status).toBe("appealed"); expect((await GV("PUT", `/cases/${c.body.id}`, { close: true })).status).toBe(409); expect((await GV("PUT", `/cases/${c.body.id}`, { appealOutcome: "varied" })).status).toBe(200); expect((await GV("PUT", `/cases/${c.body.id}`, { close: true })).body.status).toBe("closed");
    expect((await GV("PUT", `/cases/${c.body.id}`, { charge: "changed" })).status).toBe(409); expect((await GV("GET", "/cases")).body.cases[0]).toMatchObject({ subjectName: "Olu Owner", status: "closed", outcome: "upheld", sanction: "Fined R2 000", appealOutcome: "varied" });
    expect((await GB("GET", "/cases")).body.cases).toEqual([]); expect((await GB("PUT", `/cases/${c.body.id}`, { charge: "x" })).status).toBe(404); expect((await GV("PUT", "/cases/nope", {})).status).toBe(400); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'governance.case%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["governance.case.open", ...Array(5).fill("governance.case.update")]);
  });
});

describe("the overview, and the one list of what needs attention", () => {
  it("flags governance gaps in the governance overview, and settings (the election cycle, how long a case may stay open) come from the registration", async () => {
    let s = (await GV("GET", "/summary")).body; expect(s.flags.map((f: any) => f.id)).toEqual(expect.arrayContaining(["gov:election:unset", "gov:agm"])); expect(s.settings).toEqual({ electionIntervalMonths: null, disciplineLimitDays: 90 });
    expect((await C("PUT", "/registration", { electionIntervalMonths: 36, disciplineLimitDays: 60 })).status).toBe(200); expect((await C("PUT", "/registration", { disciplineLimitDays: 3 })).status).toBe(400); s = (await GV("GET", "/summary")).body; expect(s.settings).toEqual({ electionIntervalMonths: 36, disciplineLimitDays: 60 }); expect(s.flags.map((f: any) => f.id)).toContain("gov:election:none");
    await GV("POST", "/cases", { subjectKind: "other", subjectName: "Someone", complaint: "x", openedOn: plus(-61) }); expect((await GV("GET", "/summary")).body.flags.some((f: any) => f.id.startsWith("gov:case:"))).toBe(true); expect((await GV("GET", `/summary?on=${plus(400)}`)).body.today).toBe(plus(400)); expect((await GB("GET", "/summary")).body.measures.openCases).toBe(0);
  });
  it("shows governance and finance flags in the compliance overview alongside the registers, in one list ordered by seriousness", async () => {
    await call("PUT", "/association/finance/settings", U.A, "association", { approvalThresholdCents: 100 }); await call("POST", "/association/finance/receipts", U.A, "association", { memberId: U.O1, amountCents: 5000, method: "cash", receivedOn: plus(-70), category: "levy" });
    const s = (await C("GET", "/summary")).body; const ids = s.flags.map((f: any) => f.id); expect(ids).toEqual(expect.arrayContaining(["gov:agm", "gov:election:unset", "fin:cash"])); expect(ids).toContain("reg:none"); const order = { high: 0, medium: 1, low: 2 } as any; expect(s.flags.map((f: any) => order[f.severity])).toEqual([...s.flags.map((f: any) => order[f.severity])].sort((a: number, b: number) => a - b));
    expect(s.flagCounts).toEqual({ high: s.flags.filter((f: any) => f.severity === "high").length, medium: s.flags.filter((f: any) => f.severity === "medium").length, low: s.flags.filter((f: any) => f.severity === "low").length }); expect(new Set(s.flags.map((f: any) => f.category))).toEqual(expect.objectContaining({}));
    expect((await B("GET", "/summary")).status).toBe(200);
  });
});
