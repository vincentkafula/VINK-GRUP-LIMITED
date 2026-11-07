/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createGovernance, type Governance } from "./governance.js";
import { createCompliance, addMonths, type Compliance } from "./compliance.js";

/** Governance and discipline. Association A has active owner members O1 and O2; B is a stranger with O3. Fixed clock: Monday 2 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, g: Governance, comp: Compliance;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); g = createGovernance(db, () => NOW); comp = createCompliance(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
});
const meeting = (o: any = {}) => g.addMeeting(U.A, U.A, { kind: "executive", heldOn: plus(-10), title: "October exco", venue: "Rank office", agenda: "Rank repairs", ...o });
const bearer = async (name: string, office = "Committee", termEnd: string | null = plus(300), assoc = U.A) => String(ok<any>(await comp.addOfficeBearer(assoc, assoc, { name, office, ...(termEnd ? { termEnd } : {}) })).id);
const flagIds = async () => (await g.summary(U.A, TODAY)).flags.map((f) => f.id);

describe("meetings, minutes and attendance", () => {
  it("records a meeting of a known kind with a real date and a title, and lists them newest first with an upcoming marker", async () => {
    for (const bad of [{ kind: "party" }, { heldOn: "soon" }, { heldOn: "2026-02-30" }, { title: "" }, { venue: "x".repeat(200) }, { agenda: "x".repeat(4000) }]) expect(await meeting(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await meeting({ heldOn: plus(-40), title: "September exco" })); ok(await meeting({ heldOn: plus(20), title: "November general", kind: "general" })); expect((await g.meetings(U.A)).map((m) => [m.title, m.upcoming])).toEqual([["November general", true], ["September exco", false]]);
    expect((await g.meetings(U.A, { year: 2025 }))).toEqual([]); expect(await g.meetings(U.B)).toEqual([]);
  });
  it("takes minutes after the meeting, and an adoption date only on or after it, not in the future, and only once there are minutes", async () => {
    const m = ok<any>(await meeting({ heldOn: plus(-20) })); expect(await g.saveMinutes(U.A, U.A, m.id, { adoptedOn: plus(-5) })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Write the minutes") });
    ok(await g.saveMinutes(U.A, U.A, m.id, { minutes: "1. Apologies. 2. Rank repairs approved." })); for (const bad of [plus(-21), plus(1), "soon"]) expect(await g.saveMinutes(U.A, U.A, m.id, { adoptedOn: bad }), bad).toMatchObject({ ok: false, status: 400 });
    ok(await g.saveMinutes(U.A, U.A, m.id, { adoptedOn: plus(-20) })); expect((await g.meetings(U.A))[0]).toMatchObject({ minutes: "1. Apologies. 2. Rank repairs approved.", minutesAdoptedOn: plus(-20) });                       // adopting does not lose the minutes
    ok(await g.saveMinutes(U.A, U.A, m.id, { minutes: "Corrected minutes." })); expect((await g.meetings(U.A))[0]).toMatchObject({ minutes: "Corrected minutes.", minutesAdoptedOn: plus(-20) }); expect(await g.saveMinutes(U.B, U.B, m.id, { minutes: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await g.saveMinutes(U.A, U.A, m.id, { minutes: "x".repeat(21000) })).toMatchObject({ ok: false, status: 400 });
  });
  it("replaces a meeting's attendance list: members by their own record, guests by name, no one twice, only valid statuses, and counts what it saved", async () => {
    const m = ok<any>(await meeting());
    expect(ok<any>(await g.setAttendance(U.A, U.A, m.id, [{ name: "Olu Owner", memberId: U.O1, status: "present" }, { name: "Ona Owner", memberId: U.O2, status: "apology" }, { name: "Guest speaker", status: "present" }, { name: "Absent Abe", status: "absent" }]))).toEqual({ present: 2, apologies: 1, absent: 1 });
    expect(ok<any>(await g.setAttendance(U.A, U.A, m.id, [{ name: "Olu Owner", memberId: U.O1, status: "present" }]))).toEqual({ present: 1, apologies: 0, absent: 0 }); expect((await g.meetings(U.A))[0].attendance).toEqual([{ name: "Olu Owner", memberId: U.O1, status: "present" }]);
    for (const bad of [[{ name: "", status: "present" }], [{ name: "X", status: "late" }], [{ name: "Otto", memberId: U.O3, status: "present" }], "all of them", Array.from({ length: 501 }, (_, i) => ({ name: `P${i}`, status: "present" }))]) expect(await g.setAttendance(U.A, U.A, m.id, bad as any), JSON.stringify(bad).slice(0, 60)).toMatchObject({ ok: false, status: expect.any(Number) });
    expect(await g.setAttendance(U.A, U.A, m.id, [{ name: "Olu Owner", status: "present" }, { name: "  olu owner ", status: "absent" }])).toMatchObject({ ok: false, status: 409 }); expect((await g.meetings(U.A))[0].attendance).toHaveLength(1);                   // a refused list changes nothing
    expect(await g.setAttendance(U.B, U.B, m.id, [])).toMatchObject({ ok: false, status: 404 });
  });
});

describe("resolutions", () => {
  it("numbers resolutions by the year of their meeting, 2026/01, 2026/02, separately for each association, and starting again each year", async () => {
    const m25 = ok<any>(await meeting({ heldOn: "2025-06-01" })); expect(ok<any>(await g.addResolution(U.A, U.A, { text: "Approve the budget", meetingId: m25.id })).number).toBe("2025/01"); expect(ok<any>(await g.addResolution(U.A, U.A, { text: "Elect a treasurer" })).number).toBe("2026/01");
    expect(ok<any>(await g.addResolution(U.A, U.A, { text: "Repair the lights" })).number).toBe("2026/02"); expect(ok<any>(await g.addResolution(U.A, U.A, { text: "Approve the audit", meetingId: m25.id })).number).toBe("2025/02"); expect(ok<any>(await g.addResolution(U.B, U.B, { text: "Other" })).number).toBe("2026/01");
    for (let i = 0; i < 9; i++) ok(await g.addResolution(U.A, U.A, { text: `R${i}` })); expect((await g.resolutions(U.A)).map((r) => r.number)[0]).toBe("2026/11"); expect((await g.resolutions(U.A)).filter((r) => r.number.startsWith("2026")).length).toBe(11);                    // the numbers keep counting past 9
  });
  it("validates a resolution, links it to a meeting of the association only, and marks it open, done or cancelled", async () => {
    const m = ok<any>(await meeting()); for (const [bad, st] of [[{ text: "" }, 400], [{ text: "x".repeat(1100) }, 400], [{ dueOn: "soon" }, 400], [{ actionOwner: "x".repeat(200) }, 400], [{ meetingId: id(99) }, 404]] as const) expect(await g.addResolution(U.A, U.A, Object.assign({ text: "Do it" }, bad)), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    const mb = ok<any>(await g.addMeeting(U.B, U.B, { kind: "agm", heldOn: plus(-5), title: "B's AGM" })); expect(await g.addResolution(U.A, U.A, { text: "Do it", meetingId: mb.id })).toMatchObject({ ok: false, status: 404 });
    const r = ok<any>(await g.addResolution(U.A, U.A, { text: "Paint the rank", meetingId: m.id, actionOwner: "Sipho", dueOn: plus(5) })); expect((await g.resolutions(U.A))[0]).toMatchObject({ meeting: "October exco", actionOwner: "Sipho", status: "open", overdue: false });
    ok(await g.setResolutionStatus(U.A, U.A, r.id, "done")); expect((await g.resolutions(U.A))[0].status).toBe("done"); expect(await g.setResolutionStatus(U.A, U.A, r.id, "finished")).toMatchObject({ ok: false, status: 400 }); expect(await g.setResolutionStatus(U.B, U.B, r.id, "open")).toMatchObject({ ok: false, status: 404 });
  });
  it("calls a resolution overdue the day after its due date while it is open, and not once done or cancelled", async () => {
    const a = ok<any>(await g.addResolution(U.A, U.A, { text: "A", dueOn: TODAY })), b = ok<any>(await g.addResolution(U.A, U.A, { text: "B", dueOn: plus(-1) })); const od = async () => (await g.resolutions(U.A, TODAY)).filter((r) => r.overdue).map((r) => r.text);
    expect(await od()).toEqual(["B"]); expect(await flagIds()).toContain(`gov:resolution:${b.id}`); expect(await flagIds()).not.toContain(`gov:resolution:${a.id}`); ok(await g.setResolutionStatus(U.A, U.A, b.id, "cancelled")); expect(await od()).toEqual([]); expect((await g.resolutions(U.A, plus(1))).filter((r) => r.overdue).map((r) => r.text)).toEqual(["A"]);
  });
});

describe("elections and declarations of interest", () => {
  it("records an election with a real past date, and a next election that is after it, newest first", async () => {
    for (const bad of [{ heldOn: plus(1) }, { heldOn: "soon" }, { notes: "x".repeat(2000) }, { nextDueOn: plus(-400) }, { nextDueOn: "never" }]) expect(await g.recordElection(U.A, U.A, { heldOn: plus(-400), ...bad }), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await g.recordElection(U.A, U.A, { heldOn: plus(-800), results: "Chair: Thabo" })); ok(await g.recordElection(U.A, U.A, { heldOn: plus(-400), nextDueOn: plus(300), notes: "Held at the AGM" })); expect((await g.elections(U.A)).map((e) => [e.heldOn, e.nextDueOn])).toEqual([[plus(-400), plus(300)], [plus(-800), null]]); expect(await g.elections(U.B)).toEqual([]);
  });
  it("takes a declaration of interests from an office bearer, with 'none' as a declaration too, validated, and not for another association's bearer", async () => {
    const t = await bearer("Thabo Mokoena", "Chairperson"), other = await bearer("Outsider", "Chair", plus(100), U.B);
    for (const [bad, why] of [[{ officeBearerId: other }, /office bearers/], [{ officeBearerId: "nope" }, /office bearers/], [{ declaredOn: plus(1) }, /not in the future/], [{ declaredOn: "soon" }, /date/], [{ none: false, interest: "" }, /what the interest is/], [{ none: true, interest: "Owns a garage" }, /not both/], [{ interest: "x".repeat(600), none: false }, /too long/]] as const)
      expect(await g.declare(U.A, U.A, Object.assign({ officeBearerId: t, declaredOn: TODAY, none: true }, bad)), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    ok(await g.declare(U.A, U.A, { officeBearerId: t, declaredOn: plus(-30), none: false, interest: "Owns the garage that services the vehicles" })); ok(await g.declare(U.A, U.A, { officeBearerId: t, declaredOn: plus(-2), none: true })); expect((await g.declarations(U.A)).map((d) => [d.name, d.none, d.interest])).toEqual([["Thabo Mokoena", true, null], ["Thabo Mokoena", false, "Owns the garage that services the vehicles"]]);
  });
});

describe("disciplinary cases", () => {
  const open = (o: any = {}) => g.openCase(U.A, U.A, { subjectKind: "member", subjectId: U.O1, complaint: "Charged R15 000 to join the rank", charge: "Clause 14.2 of the code of conduct", openedOn: plus(-30), ...o });
  it("opens a case about a member (named from their record), or about someone else by name, validated", async () => {
    for (const [bad, st] of [[{ subjectKind: "boss" }, 400], [{ subjectId: U.O3 }, 400], [{ subjectId: null, subjectName: "" }, 400], [{ complaint: "" }, 400], [{ openedOn: plus(1) }, 400], [{ openedOn: "soon" }, 400], [{ charge: "x".repeat(400) }, 400]] as const) expect(await open(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await open()); ok(await open({ subjectKind: "driver", subjectId: null, subjectName: "Dan Driver", charge: null })); expect((await g.cases(U.A, TODAY)).map((c) => [c.subjectName, c.status, c.daysOpen])).toEqual([["Dan Driver", "open", 30], ["Olu Owner", "open", 30]]);                  // opened the same day: the one recorded last comes first expect(await g.cases(U.B, TODAY)).toEqual([]);
  });
  it("goes from open to a hearing, an outcome with a sanction when upheld, and closed, each step needing the one before it", async () => {
    const c = ok<any>(await open());
    expect(await g.updateCase(U.A, U.A, c.id, { outcome: "upheld", decidedOn: plus(-5), sanction: "Fine" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Set the hearing") }); expect(await g.updateCase(U.A, U.A, c.id, { close: true })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Record an outcome") });
    expect(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-31) })).toMatchObject({ ok: false, status: 400 }); expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-10) })).status).toBe("hearing_set");
    for (const [bad, st] of [[{ outcome: "guilty", decidedOn: plus(-5) }, 400], [{ outcome: "upheld", decidedOn: plus(-5) }, 400], [{ outcome: "not_upheld", decidedOn: plus(-5), sanction: "Fine" }, 400], [{ outcome: "upheld", decidedOn: plus(1), sanction: "Fine" }, 400], [{ outcome: "upheld", decidedOn: plus(-40), sanction: "Fine" }, 400], [{ outcome: "upheld", sanction: "Fine" }, 400]] as const) expect(await g.updateCase(U.A, U.A, c.id, bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { outcome: "upheld", decidedOn: plus(-5), sanction: "Fined R2 000 and suspended for a month" })).status).toBe("decided"); expect(await g.updateCase(U.A, U.A, c.id, { outcome: "not_upheld", decidedOn: plus(-4) })).toMatchObject({ ok: false, status: 409 }); expect(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-3) })).toMatchObject({ ok: false, status: 409 });
    expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { close: true })).status).toBe("closed"); expect(await g.updateCase(U.A, U.A, c.id, { charge: "changed" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("closed") }); expect((await g.cases(U.A, TODAY))[0]).toMatchObject({ status: "closed", outcome: "upheld", daysOpen: 30 });
  });
  it("lets a case be withdrawn without a hearing, but nothing to appeal; and handles an appeal that must be decided before the case closes", async () => {
    const w = ok<any>(await open()); expect(ok<any>(await g.updateCase(U.A, U.A, w.id, { outcome: "withdrawn", decidedOn: plus(-2) })).status).toBe("decided"); expect(await g.updateCase(U.A, U.A, w.id, { appealLodgedOn: plus(-1) })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("nothing to appeal") });
    const c = ok<any>(await open()); expect(await g.updateCase(U.A, U.A, c.id, { appealLodgedOn: plus(-1) })).toMatchObject({ ok: false, status: 409 }); ok(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-12) })); ok(await g.updateCase(U.A, U.A, c.id, { outcome: "upheld", decidedOn: plus(-10), sanction: "Warning" }));
    expect(await g.updateCase(U.A, U.A, c.id, { appealLodgedOn: plus(-11) })).toMatchObject({ ok: false, status: 400 }); expect(await g.updateCase(U.A, U.A, c.id, { appealOutcome: "overturned" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("No appeal") }); expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { appealLodgedOn: plus(-3) })).status).toBe("appealed");
    expect(await g.updateCase(U.A, U.A, c.id, { appealLodgedOn: plus(-2) })).toMatchObject({ ok: false, status: 409 }); expect(await g.updateCase(U.A, U.A, c.id, { close: true })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("An appeal is still open") });
    expect(await g.updateCase(U.A, U.A, c.id, { appealOutcome: "dismissed" })).toMatchObject({ ok: false, status: 400 }); ok(await g.updateCase(U.A, U.A, c.id, { appealOutcome: "varied" })); expect(await g.updateCase(U.A, U.A, c.id, { appealOutcome: "upheld" })).toMatchObject({ ok: false, status: 409 }); expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { close: true })).status).toBe("closed");
    expect(await g.updateCase(U.A, U.A, c.id, {})).toMatchObject({ ok: false, status: 409 }); expect(await g.updateCase(U.B, U.B, c.id, { charge: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await g.updateCase(U.A, U.A, id(99), { charge: "x" })).toMatchObject({ ok: false, status: 404 });
  });
  it("can decide, appeal and close in one go, and refuses to change nothing", async () => {
    const c = ok<any>(await open()); ok(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-12), charge: "Clause 3" })); expect((await g.cases(U.A, TODAY))[0].charge).toBe("Clause 3"); expect(await g.updateCase(U.A, U.A, c.id, {})).toMatchObject({ ok: false, status: 400 });
    expect(ok<any>(await g.updateCase(U.A, U.A, c.id, { outcome: "not_upheld", decidedOn: plus(-9), close: true })).status).toBe("closed"); expect((await q(`SELECT summary FROM register_changes WHERE entity = 'discipline' ORDER BY changed_at DESC LIMIT 1`))[0].summary).toContain("outcome not upheld on");
  });
});

describe("the overview", () => {
  it("asks for the election cycle when neither it nor an election is recorded, and says none is on record once the cycle is set", async () => {
    expect(await flagIds()).toContain("gov:election:unset"); ok(await comp.saveRegistration(U.A, U.A, { electionIntervalMonths: 36 })); const f = (await g.summary(U.A, TODAY)).flags.find((x) => x.id === "gov:election:none")!; expect(f).toMatchObject({ severity: "high" }); expect(f.message).toContain("every 36 months"); expect(await flagIds()).not.toContain("gov:election:unset");
    for (const bad of [0, 121, 1.5, "yearly"]) expect(await comp.saveRegistration(U.A, U.A, { electionIntervalMonths: bad as any }), String(bad)).toMatchObject({ ok: false, status: 400 }); ok(await comp.saveRegistration(U.A, U.A, { electionIntervalMonths: null }));
  });
  it("flags an election as overdue the day after it was due (by the cycle, or the date the last election set), and soon within 90 days", async () => {
    ok(await comp.saveRegistration(U.A, U.A, { electionIntervalMonths: 36 })); const last = addMonths(TODAY, -36); ok(await g.recordElection(U.A, U.A, { heldOn: last }));
    expect(await flagIds()).not.toContain("gov:election:overdue"); expect(await flagIds()).toContain("gov:election:soon"); await db.query(`UPDATE elections SET held_on = $1`, [addMonths(TODAY, -36 - 1)]); const f = (await g.summary(U.A, TODAY)).flags.find((x) => x.id === "gov:election:overdue")!; expect(f).toMatchObject({ severity: "high", dueOn: addMonths(TODAY, -1) }); expect(f.message).toContain("has not been held");
    await db.query(`UPDATE elections SET held_on = $1`, [addMonths(TODAY, -12)]); expect(await flagIds()).not.toContain("gov:election:overdue"); expect(await flagIds()).not.toContain("gov:election:soon"); await db.query(`UPDATE elections SET next_due_on = $1`, [plus(-1)]); expect(await flagIds()).toContain("gov:election:overdue");            // the date the last election set wins when it is sooner
    await db.query(`UPDATE elections SET next_due_on = $1`, [plus(90)]); expect(await flagIds()).toContain("gov:election:soon"); await db.query(`UPDATE elections SET next_due_on = $1`, [plus(91)]); expect(await flagIds()).not.toContain("gov:election:soon");
  });
  it("flags no AGM in the last 12 months (400 days), minutes not adopted after 60 days, and ignores a meeting that is yet to happen", async () => {
    expect(await flagIds()).toContain("gov:agm"); ok(await g.addMeeting(U.A, U.A, { kind: "agm", heldOn: plus(-401), title: "Old AGM" })); expect(await flagIds()).toContain("gov:agm"); ok(await g.addMeeting(U.A, U.A, { kind: "agm", heldOn: plus(20), title: "Next AGM" })); expect(await flagIds()).toContain("gov:agm");
    const a = ok<any>(await g.addMeeting(U.A, U.A, { kind: "agm", heldOn: plus(-400), title: "Recent AGM" })); expect(await flagIds()).not.toContain("gov:agm");
    const m = ok<any>(await meeting({ heldOn: plus(-60) })); expect(await flagIds()).not.toContain(`gov:minutes:${m.id}`); await db.query(`UPDATE meetings SET held_on = $2 WHERE id = $1`, [m.id, plus(-61)]); expect(await flagIds()).toContain(`gov:minutes:${m.id}`);
    ok(await g.saveMinutes(U.A, U.A, m.id, { minutes: "x", adoptedOn: plus(-30) })); expect(await flagIds()).not.toContain(`gov:minutes:${m.id}`); expect(await flagIds()).toContain(`gov:minutes:${a.id}`);
  });
  it("flags an office bearer with no declaration of interests in the last 365 days, but not one whose term has ended", async () => {
    const t = await bearer("Thabo Mokoena", "Chairperson"), old = await bearer("Retired Chair", "Chair", plus(-5)); expect(await flagIds()).toContain(`gov:interest:${t}`); expect(await flagIds()).not.toContain(`gov:interest:${old}`);
    ok(await g.declare(U.A, U.A, { officeBearerId: t, declaredOn: plus(-365), none: true })); expect(await flagIds()).not.toContain(`gov:interest:${t}`); await db.query(`UPDATE interest_declarations SET declared_on = $1`, [plus(-366)]); expect(await flagIds()).toContain(`gov:interest:${t}`);
  });
  it("flags a disciplinary case open longer than the limit (medium, then high past double), and a hearing date passed with no outcome", async () => {
    ok(await comp.saveRegistration(U.A, U.A, { disciplineLimitDays: 90 })); for (const bad of [6, 731, 90.5, "long"]) expect(await comp.saveRegistration(U.A, U.A, { disciplineLimitDays: bad as any }), String(bad)).toMatchObject({ ok: false, status: 400 });
    const c = ok<any>(await g.openCase(U.A, U.A, { subjectKind: "member", subjectId: U.O1, complaint: "Complaint", openedOn: plus(-90) })); expect(await flagIds()).not.toContain(`gov:case:${c.id}`);
    for (const [days, sev] of [[91, "medium"], [180, "medium"], [181, "high"]] as const) { await db.query(`UPDATE disciplinary_cases SET opened_on = $1`, [plus(-days)]); const f = (await g.summary(U.A, TODAY)).flags.find((x) => x.id === `gov:case:${c.id}`)!; expect(f.severity, String(days)).toBe(sev); }
    ok(await g.updateCase(U.A, U.A, c.id, { hearingOn: plus(-1) })); expect(await flagIds()).toContain(`gov:hearing:${c.id}`); await db.query(`UPDATE disciplinary_cases SET hearing_on = $1`, [TODAY]); expect(await flagIds()).not.toContain(`gov:hearing:${c.id}`);
    await db.query(`UPDATE disciplinary_cases SET hearing_on = $1`, [plus(-1)]); ok(await g.updateCase(U.A, U.A, c.id, { outcome: "not_upheld", decidedOn: plus(-1) })); expect(await flagIds()).not.toContain(`gov:hearing:${c.id}`); ok(await g.updateCase(U.A, U.A, c.id, { close: true })); expect(await flagIds()).not.toContain(`gov:case:${c.id}`);
  });
  it("reports the figures: meetings held this year, upcoming meetings, average attendance, open and overdue resolutions, the election dates and open cases", async () => {
    const m1 = ok<any>(await meeting({ heldOn: "2026-03-01", title: "March" })), m2 = ok<any>(await meeting({ heldOn: "2026-06-01", title: "June" })); ok(await meeting({ heldOn: "2025-12-01", title: "Last year" })); ok(await meeting({ heldOn: plus(10), title: "Next" }));
    ok(await g.setAttendance(U.A, U.A, m1.id, [{ name: "A", status: "present" }, { name: "B", status: "present" }, { name: "C", status: "absent" }, { name: "D", status: "apology" }])); ok(await g.setAttendance(U.A, U.A, m2.id, [{ name: "A", status: "present" }, { name: "B", status: "absent" }]));
    ok(await g.addResolution(U.A, U.A, { text: "One", dueOn: plus(-3) })); const done = ok<any>(await g.addResolution(U.A, U.A, { text: "Two" })); ok(await g.setResolutionStatus(U.A, U.A, done.id, "done")); ok(await g.addResolution(U.A, U.A, { text: "Three" })); ok(await g.recordElection(U.A, U.A, { heldOn: "2025-05-01", nextDueOn: "2027-05-01" })); ok(await g.openCase(U.A, U.A, { subjectKind: "other", subjectName: "Someone", complaint: "x", openedOn: plus(-5) }));
    expect((await g.summary(U.A, TODAY)).measures).toEqual({ meetingsThisYear: 2, upcomingMeetings: 1, averageAttendancePercent: 50, openResolutions: 2, overdueResolutions: 1, lastElectionOn: "2025-05-01", nextElectionDue: "2027-05-01", openCases: 1 }); expect((await g.summary(U.B, TODAY)).measures).toMatchObject({ meetingsThisYear: 0, averageAttendancePercent: null, openCases: 0, lastElectionOn: null });
  });
});
