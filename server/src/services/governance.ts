import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, addMonths, daysBetween, flagSort, type Flag } from "./compliance.js";

/**
 * ASSOCIATION GOVERNANCE AND DISCIPLINE (docs/ASSOCIATION_COMPLIANCE.md, module 8). The Gauteng commission found that powerful taxi bosses prevented elections and that associations were "a law unto themselves": this is how an association shows
 * it meets, decides, holds elections on time, declares interests and disciplines fairly.
 *   meetings and attendance, minutes (and when they were adopted)      resolutions, numbered and tracked to an action and a date
 *   elections against the cycle the constitution sets                  declarations of interest by office bearers ("none" is a declaration too)
 *   disciplinary cases: complaint, charge under the code of conduct, hearing, outcome, sanction, appeal, and how long they have been open
 * It records what the association says happened and flags what looks wrong. It decides nothing, and it never says a person is guilty: a case's outcome is what the association's hearing decided.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const KINDS = ["agm", "executive", "general", "special", "other"] as const, ATTEND = ["present", "apology", "absent"] as const, SUBJECTS = ["member", "driver", "marshal", "other"] as const, OUTCOMES = ["upheld", "not_upheld", "withdrawn"] as const, APPEALS = ["upheld", "overturned", "varied"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
export const KIND_TEXT: Record<string, string> = { agm: "Annual general meeting", executive: "Executive committee", general: "General meeting", special: "Special meeting", other: "Meeting" };

export function createGovernance(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now());
  const log = async (assoc: string, entity: string, entityId: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,$2,$3,$4,$5)`, [assoc, entity, entityId, summary.slice(0, 300), by]); };
  const reg = async (assoc: string) => { const r = (await db.query(`SELECT election_interval_months, discipline_limit_days FROM association_registration WHERE association_id = $1`, [assoc])).rows[0]; return { electionIntervalMonths: r?.election_interval_months === null || r?.election_interval_months === undefined ? null : Number(r.election_interval_months), disciplineLimitDays: Number(r?.discipline_limit_days ?? 90) }; };
  const ownMeeting = async (assoc: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM meetings WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] ?? null : null);
  const isMember = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active'`, [assoc, id])).rows.length > 0;

  /* ───────────────────────── meetings, attendance and resolutions ───────────────────────── */
  async function addMeeting(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!KINDS.includes(b.kind as never)) return bad(400, "A meeting is an AGM, executive, general, special or other");
    if (!isDay(b.heldOn)) return bad(400, "Give the date of the meeting (YYYY-MM-DD)");
    const title = text(b.title, 120); if (!title) return bad(400, "Give the meeting a title");
    const venue = text(b.venue, 120), agenda = text(b.agenda, 3000); if (venue === false || agenda === false) return bad(400, "The venue or agenda is too long");
    const r = (await db.query(`INSERT INTO meetings (association_id, held_on, kind, title, venue, agenda) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [assoc, b.heldOn, b.kind, title, venue, agenda])).rows[0];
    await log(assoc, "meeting", String(r.id), `${KIND_TEXT[String(b.kind)]} "${title}" on ${b.heldOn}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  /** Minutes can be written and adopted later; the date they were adopted is what shows they were approved by a following meeting. */
  async function saveMinutes(assoc: string, by: string, id: string, b: { minutes?: unknown; adoptedOn?: unknown }): Promise<Res<{ id: string }>> {
    const m = await ownMeeting(assoc, id); if (!m) return bad(404, "Meeting not found");
    const minutes = text(b.minutes, 20000); if (minutes === false) return bad(400, "The minutes are too long"); if (b.adoptedOn !== undefined && b.adoptedOn !== null && b.adoptedOn !== "" && (!isDay(b.adoptedOn) || (b.adoptedOn as string) < dayOf(m.held_on)! || (b.adoptedOn as string) > today())) return bad(400, "Minutes are adopted on or after the meeting, and not in the future");
    if (b.adoptedOn && !(minutes ?? m.minutes)) return bad(400, "Write the minutes before saying they were adopted");
    await db.query(`UPDATE meetings SET minutes = $2, minutes_adopted_on = $3 WHERE id = $1`, [id, b.minutes === undefined ? m.minutes : minutes, b.adoptedOn === undefined ? m.minutes_adopted_on : b.adoptedOn || null]); await log(assoc, "meeting", id, `minutes of "${m.title}" ${b.adoptedOn ? `adopted on ${b.adoptedOn}` : "saved"}`, by); return { ok: true, value: { id } };
  }
  /** Replaces the attendance list for a meeting. A member is named by their own record; anyone else (a guest, an observer) by name. */
  async function setAttendance(assoc: string, by: string, id: string, list: unknown): Promise<Res<{ present: number; apologies: number; absent: number }>> {
    const m = await ownMeeting(assoc, id); if (!m) return bad(404, "Meeting not found");
    if (!Array.isArray(list) || list.length > 500) return bad(400, "Give the attendance list");
    const seen = new Set<string>(), rows: { name: string; memberId: string | null; status: string }[] = [];
    for (const x of list as Row[]) {
      const name = text(x?.name, 100); if (!name) return bad(400, "Every person needs a name"); if (!ATTEND.includes(x.status as never)) return bad(400, "Attendance is present, apology or absent");
      if (x.memberId !== undefined && x.memberId !== null && !(await isMember(assoc, x.memberId))) return bad(400, "Link only your own members"); const key = name.toLowerCase(); if (seen.has(key)) return bad(409, `${name} is listed twice`); seen.add(key); rows.push({ name, memberId: (x.memberId as string | null) ?? null, status: String(x.status) });
    }
    await db.query(`DELETE FROM meeting_attendance WHERE meeting_id = $1`, [id]); for (const r of rows) await db.query(`INSERT INTO meeting_attendance (meeting_id, name, member_id, status) VALUES ($1,$2,$3,$4)`, [id, r.name, r.memberId, r.status]);
    const c = (s: string) => rows.filter((r) => r.status === s).length; await log(assoc, "meeting", id, `attendance for "${m.title}": ${c("present")} present, ${c("apology")} apologies, ${c("absent")} absent`, by); return { ok: true, value: { present: c("present"), apologies: c("apology"), absent: c("absent") } };
  }
  const meetingOf = (m: Row, att: Row[]) => ({ id: String(m.id), heldOn: dayOf(m.held_on)!, kind: String(m.kind), title: String(m.title), venue: (m.venue as string | null) ?? null, agenda: (m.agenda as string | null) ?? null, minutes: (m.minutes as string | null) ?? null, minutesAdoptedOn: dayOf(m.minutes_adopted_on), upcoming: dayOf(m.held_on)! > today(), attendance: att.filter((a) => String(a.meeting_id) === String(m.id)).map((a) => ({ name: String(a.name), memberId: (a.member_id as string | null) ?? null, status: String(a.status) })) });
  async function meetings(assoc: string, o: { year?: number } = {}) {
    const rows = (await db.query(`SELECT * FROM meetings WHERE association_id = $1 ORDER BY held_on DESC, created_at DESC LIMIT 300`, [assoc])).rows.filter((m) => !o.year || dayOf(m.held_on)!.startsWith(String(o.year))), att = (await db.query(`SELECT a.* FROM meeting_attendance a JOIN meetings m ON m.id = a.meeting_id WHERE m.association_id = $1`, [assoc])).rows;
    return rows.map((m) => meetingOf(m, att));
  }
  async function addResolution(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; number: string }>> {
    const t = text(b.text, 1000); if (!t) return bad(400, "Write the resolution");
    let meeting: Row | null = null; if (b.meetingId !== undefined && b.meetingId !== null && b.meetingId !== "") { meeting = await ownMeeting(assoc, b.meetingId); if (!meeting) return bad(404, "That meeting was not found"); }
    const owner = text(b.actionOwner, 100); if (owner === false) return bad(400, "The name is too long"); if (b.dueOn !== undefined && b.dueOn !== null && b.dueOn !== "" && !isDay(b.dueOn)) return bad(400, "Give the due date as YYYY-MM-DD");
    const year = meeting ? dayOf(meeting.held_on)!.slice(0, 4) : today().slice(0, 4);
    for (let attempt = 0; attempt < 5; attempt++) {
      const n = (await db.query(`SELECT number FROM resolutions WHERE association_id = $1`, [assoc])).rows.map((r) => String(r.number)).filter((x) => x.startsWith(`${year}/`)).reduce((a, x) => Math.max(a, Number(x.slice(5)) || 0), 0) + 1, number = `${year}/${String(n).padStart(2, "0")}`;
      try { const r = (await db.query(`INSERT INTO resolutions (association_id, meeting_id, number, text, action_owner, due_on) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [assoc, meeting?.id ?? null, number, t, owner, b.dueOn || null])).rows[0]; await log(assoc, "resolution", String(r.id), `resolution ${number}: ${t.slice(0, 80)}`, by); return { ok: true, value: { id: String(r.id), number } }; }
      catch (e) { if (!/unique|duplicate/i.test(e instanceof Error ? e.message : "") || attempt === 4) throw e; }
    }
    return bad(409, "Could not number the resolution: try again");
  }
  async function setResolutionStatus(assoc: string, by: string, id: string, status: unknown): Promise<Res<{ id: string }>> {
    if (!["open", "done", "cancelled"].includes(String(status))) return bad(400, "A resolution is open, done or cancelled");
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`UPDATE resolutions SET status = $3 WHERE id = $1 AND association_id = $2 RETURNING number`, [id, assoc, status])).rows[0] : null; if (!r) return bad(404, "Resolution not found");
    await log(assoc, "resolution", id, `resolution ${r.number} marked ${status}`, by); return { ok: true, value: { id } };
  }
  async function resolutions(assoc: string, onDay = today()) {
    const ms = new Map((await db.query(`SELECT id, title, held_on FROM meetings WHERE association_id = $1`, [assoc])).rows.map((m) => [String(m.id), m]));
    return (await db.query(`SELECT * FROM resolutions WHERE association_id = $1 ORDER BY number DESC LIMIT 500`, [assoc])).rows.map((r) => ({ id: String(r.id), number: String(r.number), text: String(r.text), meeting: r.meeting_id ? String(ms.get(String(r.meeting_id))?.title ?? "") || null : null, actionOwner: (r.action_owner as string | null) ?? null, dueOn: dayOf(r.due_on), status: String(r.status), overdue: r.status === "open" && !!r.due_on && dayOf(r.due_on)! < onDay }));
  }

  /* ───────────────────────── elections and declarations of interest ───────────────────────── */
  async function recordElection(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!isDay(b.heldOn) || (b.heldOn as string) > today()) return bad(400, "Give the date the election was held (not in the future)");
    const notes = text(b.notes, 1000), results = text(b.results, 2000); if (notes === false || results === false) return bad(400, "The notes or results are too long");
    if (b.nextDueOn !== undefined && b.nextDueOn !== null && b.nextDueOn !== "" && (!isDay(b.nextDueOn) || (b.nextDueOn as string) <= (b.heldOn as string))) return bad(400, "The next election is due after this one");
    const r = (await db.query(`INSERT INTO elections (association_id, held_on, notes, results, next_due_on) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [assoc, b.heldOn, notes, results, b.nextDueOn || null])).rows[0]; await log(assoc, "election", String(r.id), `election held on ${b.heldOn}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function elections(assoc: string) { return (await db.query(`SELECT * FROM elections WHERE association_id = $1 ORDER BY held_on DESC`, [assoc])).rows.map((e) => ({ id: String(e.id), heldOn: dayOf(e.held_on)!, notes: (e.notes as string | null) ?? null, results: (e.results as string | null) ?? null, nextDueOn: dayOf(e.next_due_on) })); }
  /** An office bearer's declaration of interests. Declaring none is a declaration. */
  async function declare(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const ob = typeof b.officeBearerId === "string" && UUID.test(b.officeBearerId) ? (await db.query(`SELECT * FROM office_bearers WHERE id = $1 AND association_id = $2`, [b.officeBearerId, assoc])).rows[0] : null; if (!ob) return bad(400, "Choose one of your office bearers");
    if (!isDay(b.declaredOn) || (b.declaredOn as string) > today()) return bad(400, "Give the date of the declaration (not in the future)"); const none = b.none === true, interest = text(b.interest, 500); if (interest === false) return bad(400, "The declaration is too long");
    if (!none && !interest) return bad(400, "Say what the interest is, or declare that there is none"); if (none && interest) return bad(400, "Either declare no interest or describe one, not both");
    const r = (await db.query(`INSERT INTO interest_declarations (association_id, office_bearer_id, declared_on, none, interest) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [assoc, ob.id, b.declaredOn, none, interest])).rows[0]; await log(assoc, "declaration", String(r.id), `${ob.name} (${ob.office}) declared ${none ? "no interest" : "an interest"} on ${b.declaredOn}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function declarations(assoc: string) { return (await db.query(`SELECT d.*, o.name, o.office FROM interest_declarations d JOIN office_bearers o ON o.id = d.office_bearer_id WHERE d.association_id = $1 ORDER BY d.declared_on DESC`, [assoc])).rows.map((d) => ({ id: String(d.id), officeBearerId: String(d.office_bearer_id), name: String(d.name), office: String(d.office), declaredOn: dayOf(d.declared_on)!, none: !!d.none, interest: (d.interest as string | null) ?? null })); }

  /* ───────────────────────── disciplinary cases ───────────────────────── */
  const caseOf = (c: Row, onDay: string) => { const closed = dayOf(c.closed_on), opened = dayOf(c.opened_on)!, status = closed ? "closed" : c.appeal_lodged_on && !c.appeal_outcome ? "appealed" : c.outcome ? "decided" : c.hearing_on ? "hearing_set" : "open"; return { id: String(c.id), subjectKind: String(c.subject_kind), subjectId: (c.subject_id as string | null) ?? null, subjectName: String(c.subject_name), complaint: String(c.complaint), charge: (c.charge as string | null) ?? null, openedOn: opened, hearingOn: dayOf(c.hearing_on), outcome: (c.outcome as string | null) ?? null, sanction: (c.sanction as string | null) ?? null, decidedOn: dayOf(c.decided_on), appealLodgedOn: dayOf(c.appeal_lodged_on), appealOutcome: (c.appeal_outcome as string | null) ?? null, closedOn: closed, status, daysOpen: daysBetween(opened, closed ?? onDay) }; };
  async function openCase(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!SUBJECTS.includes(b.subjectKind as never)) return bad(400, "The case is about a member, a driver, a marshal or someone else");
    let name = text(b.subjectName, 100); let subjectId: string | null = null;
    if (b.subjectId !== undefined && b.subjectId !== null && b.subjectId !== "") { if (!(await isMember(assoc, b.subjectId))) return bad(400, "Link only your own members"); subjectId = String(b.subjectId); name = name || String((await db.query(`SELECT name FROM users WHERE id = $1`, [subjectId])).rows[0]?.name ?? ""); }
    if (!name) return bad(400, "Say who the case is about"); const complaint = text(b.complaint, 2000), charge = text(b.charge, 300); if (!complaint) return bad(400, "Record the complaint"); if (charge === false) return bad(400, "The charge is too long");
    if (!isDay(b.openedOn) || (b.openedOn as string) > today()) return bad(400, "Give the date the case was opened (not in the future)");
    const r = (await db.query(`INSERT INTO disciplinary_cases (association_id, subject_kind, subject_id, subject_name, complaint, charge, opened_on) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [assoc, b.subjectKind, subjectId, name, complaint, charge, b.openedOn])).rows[0]; await log(assoc, "discipline", String(r.id), `case opened about ${name}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  const ownCase = async (assoc: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM disciplinary_cases WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] ?? null : null);
  /** Moves a case along: set the charge and hearing, record the outcome, record an appeal and its outcome, close it. Each step needs the one before it; a closed case is closed. */
  async function updateCase(assoc: string, by: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string; status: string }>> {
    const c = await ownCase(assoc, id); if (!c) return bad(404, "Case not found"); if (c.closed_on) return bad(409, "That case is closed");
    const sets: string[] = [], args: unknown[] = [id]; const set = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); }; const steps: string[] = [];
    if (b.charge !== undefined) { const ch = text(b.charge, 300); if (ch === false) return bad(400, "The charge is too long"); set("charge", ch); steps.push("charge set"); }
    if (b.hearingOn !== undefined) { if (b.hearingOn !== null && b.hearingOn !== "" && (!isDay(b.hearingOn) || (b.hearingOn as string) < dayOf(c.opened_on)!)) return bad(400, "The hearing is on or after the day the case was opened"); if (c.outcome) return bad(409, "The hearing has already been decided"); set("hearing_on", b.hearingOn || null); steps.push(`hearing set for ${b.hearingOn || "(none)"}`); }
    if (b.outcome !== undefined) {
      if (c.outcome) return bad(409, "An outcome is already recorded"); if (!OUTCOMES.includes(b.outcome as never)) return bad(400, "The outcome is upheld, not upheld or withdrawn"); if (!c.hearing_on && b.outcome !== "withdrawn") return bad(409, "Set the hearing before recording an outcome");
      if (!isDay(b.decidedOn) || (b.decidedOn as string) > today() || (b.decidedOn as string) < dayOf(c.opened_on)!) return bad(400, "Give the date of the decision (after the case was opened, not in the future)");
      const sanction = text(b.sanction, 500); if (sanction === false) return bad(400, "The sanction is too long"); if (b.outcome === "upheld" && !sanction) return bad(400, "Record the sanction that was imposed"); if (b.outcome !== "upheld" && sanction) return bad(400, "A sanction can only follow an outcome that was upheld");
      set("outcome", b.outcome); set("sanction", sanction); set("decided_on", b.decidedOn); steps.push(`outcome ${String(b.outcome).replace("_", " ")} on ${b.decidedOn}`);
    }
    if (b.appealLodgedOn !== undefined) { if (!c.outcome || c.outcome === "withdrawn") return bad(409, "There is nothing to appeal yet"); if (c.appeal_lodged_on) return bad(409, "An appeal is already lodged"); if (!isDay(b.appealLodgedOn) || (b.appealLodgedOn as string) < dayOf(c.decided_on)! || (b.appealLodgedOn as string) > today()) return bad(400, "An appeal is lodged after the decision, not in the future"); set("appeal_lodged_on", b.appealLodgedOn); steps.push(`appeal lodged on ${b.appealLodgedOn}`); }
    if (b.appealOutcome !== undefined) { if (!c.appeal_lodged_on && b.appealLodgedOn === undefined) return bad(409, "No appeal has been lodged"); if (c.appeal_outcome) return bad(409, "The appeal already has an outcome"); if (!APPEALS.includes(b.appealOutcome as never)) return bad(400, "The appeal outcome is upheld, overturned or varied"); set("appeal_outcome", b.appealOutcome); steps.push(`appeal ${b.appealOutcome}`); }
    if (b.close === true) { const effOutcome = b.outcome ?? c.outcome; if (!effOutcome) return bad(409, "Record an outcome before closing the case"); if ((c.appeal_lodged_on || b.appealLodgedOn) && !(c.appeal_outcome || b.appealOutcome)) return bad(409, "An appeal is still open: record its outcome before closing"); set("closed_on", today()); steps.push("closed"); }
    if (!sets.length) return bad(400, "Nothing to change");
    await db.query(`UPDATE disciplinary_cases SET ${sets.join(", ")} WHERE id = $1`, args); await log(assoc, "discipline", id, `case about ${c.subject_name}: ${steps.join("; ")}`, by);
    return { ok: true, value: { id, status: caseOf((await ownCase(assoc, id))!, today()).status } };
  }
  async function cases(assoc: string, onDay = today()) { return (await db.query(`SELECT * FROM disciplinary_cases WHERE association_id = $1 ORDER BY opened_on DESC, created_at DESC LIMIT 500`, [assoc])).rows.map((c) => caseOf(c, onDay)); }

  /* ───────────────────────── the overview ───────────────────────── */
  async function summary(assoc: string, onDay = today()) {
    const r = await reg(assoc), ms = await meetings(assoc), rs = await resolutions(assoc, onDay), els = await elections(assoc), decl = await declarations(assoc), cs = await cases(assoc, onDay), flags: Flag[] = [];
    const lastEl = els[0]?.heldOn ?? null, nextDue = els.find((e) => e.nextDueOn)?.nextDueOn ?? null, cycleDue = lastEl && r.electionIntervalMonths ? addMonths(lastEl, r.electionIntervalMonths) : null, due = nextDue && cycleDue ? (nextDue < cycleDue ? nextDue : cycleDue) : nextDue ?? cycleDue;
    if (r.electionIntervalMonths === null && !els.length) flags.push({ id: "gov:election:unset", category: "governance", severity: "low", message: "How often the constitution requires elections is not recorded, and no election is on record", subject: "Elections", dueOn: null });
    else if (!els.length) flags.push({ id: "gov:election:none", category: "governance", severity: "high", message: `No election is on record (the constitution requires one every ${r.electionIntervalMonths} months)`, subject: "Elections", dueOn: null });
    else if (due && due < onDay) flags.push({ id: "gov:election:overdue", category: "governance", severity: "high", message: `An election was due on ${due} and has not been held (the last was on ${lastEl})`, subject: "Elections", dueOn: due });
    else if (due && daysBetween(onDay, due) <= 90) flags.push({ id: "gov:election:soon", category: "governance", severity: "low", message: `The next election is due on ${due}`, subject: "Elections", dueOn: due });
    const yearAgo = new Date(Date.parse(`${onDay}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10); if (!ms.some((m) => m.kind === "agm" && m.heldOn >= yearAgo && !m.upcoming)) flags.push({ id: "gov:agm", category: "governance", severity: "medium", message: "No annual general meeting is recorded in the last 12 months", subject: "Meetings", dueOn: null });
    for (const m of ms.filter((x) => !x.upcoming && !x.minutesAdoptedOn && daysBetween(x.heldOn, onDay) > 60)) flags.push({ id: `gov:minutes:${m.id}`, category: "governance", severity: "low", message: `The minutes of "${m.title}" (${m.heldOn}) have not been adopted`, subject: m.title, dueOn: null });
    for (const x of rs.filter((y) => y.overdue)) flags.push({ id: `gov:resolution:${x.id}`, category: "governance", severity: "medium", message: `Resolution ${x.number} was due on ${x.dueOn}${x.actionOwner ? ` (${x.actionOwner})` : ""} and is still open`, subject: x.number, dueOn: x.dueOn });
    const bearers = (await db.query(`SELECT id, name, office, term_end FROM office_bearers WHERE association_id = $1`, [assoc])).rows.filter((o) => !o.term_end || dayOf(o.term_end)! >= onDay), yr = new Date(Date.parse(`${onDay}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    for (const o of bearers) if (!decl.some((d) => d.officeBearerId === String(o.id) && d.declaredOn >= yr)) flags.push({ id: `gov:interest:${o.id}`, category: "governance", severity: "medium", message: `${o.name} (${o.office}) has no declaration of interests in the last 12 months`, subject: String(o.name), dueOn: null });
    for (const c of cs.filter((x) => x.status !== "closed")) {
      if (c.daysOpen > r.disciplineLimitDays) flags.push({ id: `gov:case:${c.id}`, category: "discipline", severity: c.daysOpen > r.disciplineLimitDays * 2 ? "high" : "medium", message: `The case about ${c.subjectName} has been open ${c.daysOpen} days (the limit set is ${r.disciplineLimitDays})`, subject: c.subjectName, dueOn: null });
      if (c.hearingOn && c.hearingOn < onDay && !c.outcome) flags.push({ id: `gov:hearing:${c.id}`, category: "discipline", severity: "medium", message: `The hearing about ${c.subjectName} was set for ${c.hearingOn} and no outcome is recorded`, subject: c.subjectName, dueOn: c.hearingOn });
    }
    const thisYear = onDay.slice(0, 4), held = ms.filter((m) => !m.upcoming && m.heldOn.startsWith(thisYear)), withAtt = held.filter((m) => m.attendance.length), rate = withAtt.length ? Math.round((withAtt.reduce((a, m) => a + m.attendance.filter((x) => x.status === "present").length / m.attendance.length, 0) / withAtt.length) * 1000) / 10 : null;
    return { today: onDay, settings: r, measures: { meetingsThisYear: held.length, upcomingMeetings: ms.filter((m) => m.upcoming).length, averageAttendancePercent: rate, openResolutions: rs.filter((x) => x.status === "open").length, overdueResolutions: rs.filter((x) => x.overdue).length, lastElectionOn: lastEl, nextElectionDue: due, openCases: cs.filter((c) => c.status !== "closed").length }, flags: flags.sort(flagSort) };
  }
  return { addMeeting, saveMinutes, setAttendance, meetings, addResolution, setResolutionStatus, resolutions, recordElection, elections, declare, declarations, openCase, updateCase, cases, summary, log };
}
export type Governance = ReturnType<typeof createGovernance>;
