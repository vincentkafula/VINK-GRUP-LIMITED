import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import type { Db } from "../portal/common.js";
import { saDay, saDayStart } from "../portal/common.js";
import type { Commission } from "./commission.js";
import { addDays, rand } from "./payslips.js";

/**
 * MARSHAL CARE (docs/MARSHAL_COMMISSION.md): the parts of the plan that protect and recognise the marshal beyond their pay.
 *   shifts      found from the marshal's own activity, corrected by them, approved by the association; a long shift or a week over the agreed limit is flagged, never blamed
 *   incidents   a one-tap safety report from a rank, and the association's risk picture built from them
 *   grievances  complaints and requests tracked to an answer, with anonymised insight for the association
 *   benefits    whether a marshal is covered (UIF, injury cover, savings or funeral scheme); what they have contributed is read from their payslips
 *   work record tenure, ranks worked, trips handled and earnings history, from the system's own records
 *   income letter  a summary of the last 3 or 6 months of issued payslips for a bank or landlord, checkable against the association, with the marshal's consent
 *   KPIs and patterns  the association's overview, and changes in cash share at a rank (a change is flagged, never a person)
 * Every query is scoped to who is asking. Nothing here says anything about a marshal that the records do not.
 */
type Row = Record<string, unknown>;
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
const DAY = /^\d{4}-\d{2}-\d{2}$/, UUID = /^[0-9a-f-]{36}$/i;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const mins = (a: unknown, b: unknown) => Math.max(0, Math.round((new Date(b as string).getTime() - new Date(a as string).getTime()) / 60000));
const clientRef = (v: unknown): string | null | undefined => (v === undefined || v === null || v === "" ? null : typeof v === "string" && /^[A-Za-z0-9._-]{8,80}$/.test(v) ? v : undefined);

export const INCIDENT_TYPES = ["threat", "fight", "robbery", "overcrowding", "injury", "other"] as const;
const WEIGHT: Record<string, number> = { robbery: 5, threat: 3, fight: 3, injury: 3, overcrowding: 1, other: 1 };
export const GRIEVANCE_CATEGORIES = ["pay", "safety", "hours", "queue", "conditions", "benefits", "other"] as const;
export const BENEFIT_KINDS = ["uif", "injury_cover", "savings", "funeral"] as const;
const PERIODS = [["night", 21, 5], ["morning", 5, 12], ["afternoon", 12, 17], ["evening", 17, 21]] as const;
const periodOf = (d: Date): string => { const h = (d.getUTCHours() + 2) % 24; return h >= 21 || h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };

export function createMarshalCare(db: Db, commission: Commission, now: () => Date = () => new Date()) {
  const worksAt = async (marshalId: string, rankId: unknown): Promise<Row | null> => (typeof rankId === "string" && UUID.test(rankId) ? (await db.query(`SELECT r.id, r.association_id, r.name FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 AND r.id = $2`, [marshalId, rankId])).rows[0] ?? null : null);
  const worksFor = async (assoc: string, marshalId: unknown) => typeof marshalId === "string" && UUID.test(marshalId) && (await db.query(`SELECT 1 AS x FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 AND r.association_id = $2`, [marshalId, assoc])).rows.length > 0;
  const firstAssociation = async (marshalId: string) => String((await db.query(`SELECT r.association_id FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 ORDER BY r.created_at LIMIT 1`, [marshalId])).rows[0]?.association_id ?? "") || null;

  /* ───────────────────────── shifts and hours ───────────────────────── */
  /**
   * Finds shifts from a marshal's own activity (queue changes and departures at a rank): a gap longer than the association's setting ends a shift. Each is PROPOSED for the marshal to correct and the association to
   * approve. A period already covered by a shift (found or recorded by hand) is left alone, so running it again changes nothing.
   */
  async function detectShifts(scope: { associationId?: string; marshalId?: string }, from: string, to: string): Promise<number> {
    const a = saDayStart(from), b = saDayStart(addDays(to, 1));
    const events = [
      ...(await db.query(`SELECT e.marshal_id, e.rank_id, e.created_at AS at, r.association_id FROM queue_events e JOIN ranks r ON r.id = e.rank_id WHERE e.created_at >= $1 AND e.created_at < $2`, [a, b])).rows,
      ...(await db.query(`SELECT d.marshal_id, d.rank_id, d.departed_at AS at, r.association_id FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE d.departed_at >= $1 AND d.departed_at < $2`, [a, b])).rows,
    ].filter((e) => (!scope.associationId || String(e.association_id) === scope.associationId) && (!scope.marshalId || String(e.marshal_id) === scope.marshalId));
    const by = new Map<string, { assoc: string; marshal: string; rank: string; times: number[] }>();
    for (const e of events) { const k = `${e.marshal_id}|${e.rank_id}`, x = by.get(k) ?? { assoc: String(e.association_id), marshal: String(e.marshal_id), rank: String(e.rank_id), times: [] }; x.times.push(new Date(e.at as string).getTime()); by.set(k, x); }
    let made = 0;
    for (const x of by.values()) {
      const gap = (await commission.settings(x.assoc)).shiftGapMinutes * 60_000, ts = x.times.sort((p, q) => p - q);
      const clusters: [number, number][] = []; for (const t of ts) { const last = clusters.at(-1); if (last && t - last[1] <= gap) last[1] = t; else clusters.push([t, t]); }
      const have = (await db.query(`SELECT started_at, ended_at FROM shifts WHERE marshal_id = $1 AND rank_id = $2`, [x.marshal, x.rank])).rows;
      for (const [s, e] of clusters) {
        if (have.some((h) => new Date(h.started_at as string).getTime() <= e && (h.ended_at ? new Date(h.ended_at as string).getTime() >= s : true))) continue;
        const ins = await db.query(`INSERT INTO shifts (association_id, marshal_id, rank_id, started_at, ended_at, source, status) VALUES ($1,$2,$3,$4,$5,'auto','proposed') ON CONFLICT (marshal_id, rank_id, started_at) DO NOTHING RETURNING id`, [x.assoc, x.marshal, x.rank, new Date(s), new Date(e)]);
        made += ins.rows.length;
      }
    }
    return made;
  }
  /** Shifts with their worked minutes and flags: over the agreed shift, no break noted on a long shift, and (per marshal and week) over the agreed week. */
  async function shifts(scope: { associationId?: string; marshalId?: string }, from: string, to: string): Promise<{ shifts: Row[]; weeks: Row[] }> {
    const a = saDayStart(from), b = saDayStart(addDays(to, 1));
    const rows = (await db.query(`SELECT s.*, u.name AS marshal_name, r.name AS rank_name FROM shifts s JOIN users u ON u.id = s.marshal_id JOIN ranks r ON r.id = s.rank_id WHERE s.started_at >= $1 AND s.started_at < $2 ORDER BY s.started_at DESC LIMIT 500`, [a, b])).rows
      .filter((s) => (!scope.associationId || String(s.association_id) === scope.associationId) && (!scope.marshalId || String(s.marshal_id) === scope.marshalId));
    const cache = new Map<string, Awaited<ReturnType<Commission["settings"]>>>(); const st = async (assoc: string) => { if (!cache.has(assoc)) cache.set(assoc, await commission.settings(assoc)); return cache.get(assoc)!; };
    const out: Row[] = [], weeks = new Map<string, { marshalId: string; marshal: string; week: string; minutes: number; limit: number }>();
    for (const s of rows) {
      const cfg = await st(String(s.association_id)), open = !s.ended_at, end = s.ended_at ?? now(), worked = Math.max(0, mins(s.started_at, end) - Number(s.break_minutes)), flags: string[] = [];
      if (worked > cfg.shiftLimitMinutes) flags.push("over_shift_limit"); if (worked > 360 && Number(s.break_minutes) === 0) flags.push("no_break_noted");
      const wk = commission.weekStart(saDay(new Date(s.started_at as string))), k = `${s.marshal_id}|${wk}`, w = weeks.get(k) ?? { marshalId: String(s.marshal_id), marshal: String(s.marshal_name ?? ""), week: wk, minutes: 0, limit: cfg.weekLimitMinutes };
      w.minutes += worked; weeks.set(k, w);
      out.push({ id: String(s.id), marshalId: String(s.marshal_id), marshal: String(s.marshal_name ?? ""), rank: String(s.rank_name), startedAt: iso(s.started_at), endedAt: iso(s.ended_at), inProgress: open, workedMinutes: worked, breakMinutes: Number(s.break_minutes), source: String(s.source), status: String(s.status), corrected: !!s.corrected, note: s.note ?? null, flags });
    }
    return { shifts: out, weeks: [...weeks.values()].sort((p, q) => q.week.localeCompare(p.week) || p.marshal.localeCompare(q.marshal)).map((w) => ({ ...w, over: w.minutes > w.limit })) };
  }
  /** A marshal corrects their own shift's times or break. It goes back to "proposed" for the association to approve again. */
  async function correctShift(marshalId: string, shiftId: string, a: { startedAt?: unknown; endedAt?: unknown; breakMinutes?: unknown; note?: unknown }): Promise<Res<{ id: string }>> {
    const s = (await db.query(`SELECT * FROM shifts WHERE id = $1 AND marshal_id = $2`, [shiftId, marshalId])).rows[0];
    if (!s) return bad(404, "Shift not found");
    const start = a.startedAt === undefined ? new Date(s.started_at as string) : new Date(String(a.startedAt)), end = a.endedAt === undefined ? (s.ended_at ? new Date(s.ended_at as string) : null) : a.endedAt === null ? null : new Date(String(a.endedAt));
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return bad(400, "Those times are not valid");
    if (end && (end <= start || end.getTime() - start.getTime() > 24 * 3600_000)) return bad(400, "A shift ends after it starts and is at most 24 hours");
    if (start.getTime() > now().getTime() + 300_000 || (end && end.getTime() > now().getTime() + 300_000)) return bad(400, "A shift cannot be in the future");
    const brk = a.breakMinutes === undefined ? Number(s.break_minutes) : Number(a.breakMinutes);
    if (!Number.isInteger(brk) || brk < 0 || (end && brk > mins(start, end))) return bad(400, "The break must be a whole number of minutes within the shift");
    const timesChanged = a.startedAt !== undefined || a.endedAt !== undefined, note = typeof a.note === "string" ? a.note.trim().slice(0, 200) : "";
    if (timesChanged && !note) return bad(400, "Say why the times are changed");
    await db.query(`UPDATE shifts SET started_at = $2, ended_at = $3, break_minutes = $4, note = CASE WHEN $5::text = '' THEN note ELSE $5::text END, corrected = true, status = 'proposed', approved_by = NULL, approved_at = NULL WHERE id = $1`, [shiftId, start, end, brk, note]);
    return { ok: true, value: { id: shiftId } };
  }
  /** A marshal records a shift that was not found (worked without activity being logged). Not allowed to overlap another of theirs at the rank. */
  async function addShift(marshalId: string, a: { rankId?: unknown; startedAt?: unknown; endedAt?: unknown; breakMinutes?: unknown; note?: unknown; clientRef?: unknown }): Promise<Res<{ id: string; replayed: boolean }>> {
    const ref = clientRef(a.clientRef); if (ref === undefined) return bad(400, "That reference is not valid");
    if (ref) { const dup = (await db.query(`SELECT id FROM shifts WHERE client_ref = $1 AND marshal_id = $2`, [ref, marshalId])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), replayed: true } }; }
    const rank = await worksAt(marshalId, a.rankId); if (!rank) return bad(403, "You do not work at that rank");
    const start = new Date(String(a.startedAt ?? "")), end = new Date(String(a.endedAt ?? "")), note = typeof a.note === "string" ? a.note.trim().slice(0, 200) : "";
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > 24 * 3600_000) return bad(400, "A shift ends after it starts and is at most 24 hours");
    if (end.getTime() > now().getTime() + 300_000) return bad(400, "A shift cannot be in the future");
    if (!note) return bad(400, "Say what this shift was");
    const brk = a.breakMinutes === undefined ? 0 : Number(a.breakMinutes); if (!Number.isInteger(brk) || brk < 0 || brk > mins(start, end)) return bad(400, "The break must be a whole number of minutes within the shift");
    const clash = (await db.query(`SELECT started_at, ended_at FROM shifts WHERE marshal_id = $1 AND rank_id = $2`, [marshalId, rank.id])).rows.some((h) => new Date(h.started_at as string) < end && (h.ended_at ? new Date(h.ended_at as string) > start : true));
    if (clash) return bad(409, "That overlaps a shift you already have");
    const r = (await db.query(`INSERT INTO shifts (association_id, marshal_id, rank_id, started_at, ended_at, source, status, break_minutes, note, client_ref) VALUES ($1,$2,$3,$4,$5,'manual','proposed',$6,$7,$8) RETURNING id`, [rank.association_id, marshalId, rank.id, start, end, brk, note, ref])).rows[0];
    return { ok: true, value: { id: String(r.id), replayed: false } };
  }
  async function decideShift(assoc: string, shiftId: string, by: string, decision: unknown): Promise<Res<{ status: string }>> {
    if (decision !== "approved" && decision !== "rejected") return bad(400, "Approve or reject");
    const r = (await db.query(`UPDATE shifts SET status = $3, approved_by = $4, approved_at = now() WHERE id = $1 AND association_id = $2 AND status = 'proposed' RETURNING id`, [shiftId, assoc, decision, by])).rows;
    return r.length ? { ok: true, value: { status: decision } } : bad((await db.query(`SELECT 1 AS x FROM shifts WHERE id = $1 AND association_id = $2`, [shiftId, assoc])).rows.length ? 409 : 404, "That shift is not waiting for a decision");
  }

  /* ───────────────────────── safety ───────────────────────── */
  async function reportIncident(marshalId: string, a: { rankId?: unknown; type?: unknown; occurredAt?: unknown; note?: unknown; photo?: unknown; clientRef?: unknown }): Promise<Res<{ id: string; replayed: boolean }>> {
    const ref = clientRef(a.clientRef); if (ref === undefined) return bad(400, "That reference is not valid");
    if (ref) { const dup = (await db.query(`SELECT id FROM incidents WHERE client_ref = $1 AND reported_by = $2`, [ref, marshalId])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), replayed: true } }; }
    const rank = await worksAt(marshalId, a.rankId); if (!rank) return bad(403, "You do not work at that rank");
    if (!INCIDENT_TYPES.includes(a.type as never)) return bad(400, "Choose what happened");
    const at = a.occurredAt === undefined || a.occurredAt === null || a.occurredAt === "" ? now() : new Date(String(a.occurredAt));
    if (Number.isNaN(at.getTime()) || at.getTime() > now().getTime() + 300_000 || at.getTime() < now().getTime() - 7 * 86_400_000) return bad(400, "Say when it happened (within the last 7 days)");
    const note = typeof a.note === "string" ? a.note.trim().slice(0, 300) || null : null;
    let photo: string | null = null;
    if (a.photo !== undefined && a.photo !== null && a.photo !== "") { if (typeof a.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.photo) || a.photo.length > 150_000) return bad(400, "The photo must be a small picture (under about 100 KB)"); photo = a.photo; }
    const r = (await db.query(`INSERT INTO incidents (association_id, rank_id, reported_by, type, occurred_at, note, photo, client_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [rank.association_id, rank.id, marshalId, a.type, at, note, photo, ref])).rows[0];
    return { ok: true, value: { id: String(r.id), replayed: false } };
  }
  async function incidents(scope: { associationId?: string; marshalId?: string }, o: { status?: string; from?: string; to?: string } = {}): Promise<{ incidents: Row[]; newCount: number }> {
    const rows = (await db.query(`SELECT i.id, i.association_id, i.reported_by, i.type, i.occurred_at, i.note, i.photo, i.status, i.acknowledged_at, rk.name AS rank_name, u.name AS reporter FROM incidents i JOIN ranks rk ON rk.id = i.rank_id JOIN users u ON u.id = i.reported_by ORDER BY i.occurred_at DESC LIMIT 500`)).rows
      .filter((i) => (!scope.associationId || String(i.association_id) === scope.associationId) && (!scope.marshalId || String(i.reported_by) === scope.marshalId) && (!o.status || i.status === o.status)
        && (!o.from || new Date(i.occurred_at as string) >= saDayStart(o.from)) && (!o.to || new Date(i.occurred_at as string) < saDayStart(addDays(o.to, 1))));
    return { newCount: rows.filter((i) => i.status === "new").length, incidents: rows.map((i) => ({ id: String(i.id), rank: String(i.rank_name), type: String(i.type), occurredAt: iso(i.occurred_at), note: (i.note as string | null) ?? null, hasPhoto: !!i.photo, status: String(i.status), reporter: scope.marshalId ? null : String(i.reporter ?? ""), acknowledgedAt: iso(i.acknowledged_at) })) };
  }
  async function incidentPhoto(assoc: string, id: string): Promise<string | null> { return ((await db.query(`SELECT photo FROM incidents WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0]?.photo as string | null | undefined) ?? null; }
  async function acknowledgeIncident(assoc: string, id: string, by: string, status: unknown): Promise<Res<{ status: string }>> {
    if (status !== "acknowledged" && status !== "closed") return bad(400, "Acknowledge or close");
    const r = (await db.query(`UPDATE incidents SET status = $3, acknowledged_by = $4, acknowledged_at = COALESCE(acknowledged_at, now()) WHERE id = $1 AND association_id = $2 AND status <> 'closed' RETURNING id`, [id, assoc, status, by])).rows;
    return r.length ? { ok: true, value: { status } } : bad((await db.query(`SELECT 1 AS x FROM incidents WHERE id = $1 AND association_id = $2`, [id, assoc])).rows.length ? 409 : 404, "That report is already closed");
  }
  /** The association's risk picture: per rank, what happened, when in the day, and a score weighted by how serious each kind is (robbery 5; threat, fight and injury 3; overcrowding and other 1). Supports the case for security. */
  async function riskMap(assoc: string, from: string, to: string): Promise<Res<{ ranks: { rank: string; total: number; score: number; level: string; byType: Record<string, number>; byPeriod: Record<string, number> }[] }>> {
    if (!DAY.test(from) || !DAY.test(to) || from > to) return bad(400, "Say the period (start and end dates)");
    const rows = (await incidents({ associationId: assoc }, { from, to })).incidents, ranks = (await db.query(`SELECT id, name FROM ranks WHERE association_id = $1 ORDER BY name`, [assoc])).rows;
    const out = ranks.map((r) => {
      const mine = rows.filter((i) => i.rank === String(r.name)), byType: Record<string, number> = {}, byPeriod: Record<string, number> = Object.fromEntries(PERIODS.map(([p]) => [p, 0]));
      let score = 0; for (const i of mine) { byType[String(i.type)] = (byType[String(i.type)] ?? 0) + 1; byPeriod[periodOf(new Date(String(i.occurredAt)))]++; score += WEIGHT[String(i.type)] ?? 1; }
      return { rank: String(r.name), total: mine.length, score, level: score >= 10 ? "high" : score >= 4 ? "medium" : "low", byType, byPeriod };
    }).sort((a, b) => b.score - a.score || a.rank.localeCompare(b.rank));
    return { ok: true, value: { ranks: out } };
  }

  /* ───────────────────────── grievances ───────────────────────── */
  async function submitGrievance(marshalId: string, a: { associationId?: unknown; category?: unknown; message?: unknown; clientRef?: unknown }): Promise<Res<{ id: string; replayed: boolean }>> {
    const ref = clientRef(a.clientRef); if (ref === undefined) return bad(400, "That reference is not valid");
    if (ref) { const dup = (await db.query(`SELECT id FROM grievances WHERE client_ref = $1 AND marshal_id = $2`, [ref, marshalId])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), replayed: true } }; }
    if (!GRIEVANCE_CATEGORIES.includes(a.category as never)) return bad(400, "Choose what it is about");
    const message = typeof a.message === "string" ? a.message.trim() : ""; if (message.length < 5 || message.length > 500) return bad(400, "Say what the matter is, in 5 to 500 characters");
    const assoc = typeof a.associationId === "string" && (await worksFor(a.associationId, marshalId)) ? a.associationId : await firstAssociation(marshalId); if (!assoc) return bad(403, "You do not work for an association");
    const r = (await db.query(`INSERT INTO grievances (association_id, marshal_id, category, message, client_ref) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [assoc, marshalId, a.category, message, ref])).rows[0];
    return { ok: true, value: { id: String(r.id), replayed: false } };
  }
  async function grievances(scope: { associationId?: string; marshalId?: string }, status?: string): Promise<Row[]> {
    return (await db.query(`SELECT g.*, u.name AS marshal_name, r.name AS responder FROM grievances g JOIN users u ON u.id = g.marshal_id LEFT JOIN users r ON r.id = g.responded_by ORDER BY g.created_at DESC LIMIT 300`)).rows
      .filter((g) => (!scope.associationId || String(g.association_id) === scope.associationId) && (!scope.marshalId || String(g.marshal_id) === scope.marshalId) && (!status || g.status === status))
      .map((g) => ({ id: String(g.id), category: String(g.category), message: String(g.message), status: String(g.status), response: g.response ?? null, respondedBy: scope.marshalId ? (g.responder ? "Your association" : null) : ((g.responder as string | null) ?? null), respondedAt: iso(g.responded_at), marshal: scope.marshalId ? null : String(g.marshal_name ?? ""), createdAt: iso(g.created_at) }));
  }
  async function respondGrievance(assoc: string, id: string, by: string, a: { status?: unknown; response?: unknown }): Promise<Res<{ status: string }>> {
    if (!["under_review", "resolved", "closed"].includes(String(a.status))) return bad(400, "Choose under review, resolved or closed");
    const response = typeof a.response === "string" ? a.response.trim().slice(0, 500) : ""; if (a.status !== "under_review" && !response) return bad(400, "Give the answer, so the marshal sees it");
    const r = (await db.query(`UPDATE grievances SET status = $3, response = CASE WHEN $4::text = '' THEN response ELSE $4::text END, responded_by = $5, responded_at = now() WHERE id = $1 AND association_id = $2 AND status IN ('open','under_review') RETURNING id`, [id, assoc, a.status, response, by])).rows;
    return r.length ? { ok: true, value: { status: String(a.status) } } : bad((await db.query(`SELECT 1 AS x FROM grievances WHERE id = $1 AND association_id = $2`, [id, assoc])).rows.length ? 409 : 404, "That complaint has already been answered");
  }
  /** What marshals are raising, without saying who: counts by theme and status, and how long answers take. */
  async function welfareInsights(assoc: string, from: string, to: string): Promise<Res<{ total: number; open: number; byCategory: Record<string, number>; byStatus: Record<string, number>; averageHoursToAnswer: number | null }>> {
    if (!DAY.test(from) || !DAY.test(to) || from > to) return bad(400, "Say the period (start and end dates)");
    const a = saDayStart(from), b = saDayStart(addDays(to, 1));
    const rows = (await db.query(`SELECT category, status, created_at, responded_at FROM grievances WHERE association_id = $1 AND created_at >= $2 AND created_at < $3`, [assoc, a, b])).rows;
    const byCategory: Record<string, number> = {}, byStatus: Record<string, number> = {}; for (const g of rows) { byCategory[String(g.category)] = (byCategory[String(g.category)] ?? 0) + 1; byStatus[String(g.status)] = (byStatus[String(g.status)] ?? 0) + 1; }
    const answered = rows.filter((g) => g.responded_at), avg = answered.length ? Math.round((answered.reduce((x, g) => x + (new Date(g.responded_at as string).getTime() - new Date(g.created_at as string).getTime()), 0) / answered.length / 3600_000) * 10) / 10 : null;
    return { ok: true, value: { total: rows.length, open: rows.filter((g) => g.status === "open" || g.status === "under_review").length, byCategory, byStatus, averageHoursToAnswer: avg } };
  }

  /* ───────────────────────── benefits and the work record ───────────────────────── */
  async function setBenefit(assoc: string, by: string, a: { marshalId?: unknown; kind?: unknown; status?: unknown; reference?: unknown; since?: unknown }): Promise<Res<{ ok: true }>> {
    if (!(await worksFor(assoc, a.marshalId))) return bad(400, "Choose one of your marshals");
    if (!BENEFIT_KINDS.includes(a.kind as never)) return bad(400, "Choose UIF, injury cover, savings or funeral cover");
    if (!["registered", "pending", "not_registered"].includes(String(a.status))) return bad(400, "Choose registered, pending or not registered");
    if (a.since !== undefined && a.since !== null && a.since !== "" && (typeof a.since !== "string" || !DAY.test(a.since))) return bad(400, "Say the date it started (YYYY-MM-DD)");
    const reference = typeof a.reference === "string" ? a.reference.trim().slice(0, 60) || null : null;
    await db.query(`INSERT INTO benefit_enrolments (association_id, marshal_id, kind, status, reference, since, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
                    ON CONFLICT (association_id, marshal_id, kind) DO UPDATE SET status = EXCLUDED.status, reference = EXCLUDED.reference, since = EXCLUDED.since, updated_by = EXCLUDED.updated_by, updated_at = now()`, [assoc, a.marshalId, a.kind, a.status, reference, a.since || null, by]);
    return { ok: true, value: { ok: true } };
  }
  /** A marshal's cover, and what they have contributed: read from their issued payslips, never typed. */
  async function benefits(marshalId: string, assoc?: string): Promise<{ associationId: string | null; benefits: { kind: string; status: string; reference: string | null; since: string | null; contributedCents: number | null }[]; contributions: { uifCents: number; stokvelCents: number; associationFeeCents: number } }> {
    const a = assoc ?? (await firstAssociation(marshalId)); if (!a) return { associationId: null, benefits: [], contributions: { uifCents: 0, stokvelCents: 0, associationFeeCents: 0 } };
    const lines = (await db.query(`SELECT l.kind, l.amount_cents FROM payslip_lines l JOIN payslips p ON p.id = l.payslip_id WHERE p.marshal_id = $1 AND p.association_id = $2 AND p.status IN ('issued','paid') AND l.side = 'deduction'`, [marshalId, a])).rows;
    const sum = (k: string) => lines.filter((l) => l.kind === k).reduce((x, l) => x + Number(l.amount_cents), 0);
    const contributions = { uifCents: sum("uif"), stokvelCents: sum("stokvel"), associationFeeCents: sum("association_fee") };
    const have = (await db.query(`SELECT kind, status, reference, since FROM benefit_enrolments WHERE association_id = $1 AND marshal_id = $2`, [a, marshalId])).rows;
    return { associationId: a, contributions, benefits: BENEFIT_KINDS.map((k) => { const h = have.find((x) => x.kind === k); return { kind: k, status: String(h?.status ?? "not_registered"), reference: (h?.reference as string | null) ?? null, since: h?.since ? new Date(h.since as string).toISOString().slice(0, 10) : null, contributedCents: k === "uif" ? contributions.uifCents : k === "savings" || k === "funeral" ? contributions.stokvelCents : null }; }) };
  }
  /** Tenure, ranks worked, trips handled and earnings by month, from the system's own records, and what is still needed for the profile to count as verified. */
  async function workRecord(marshalId: string, assoc?: string): Promise<Record<string, unknown>> {
    const deps = (await db.query(`SELECT d.departed_at, rk.name AS rank_name, rk.association_id FROM departures d JOIN ranks rk ON rk.id = d.rank_id WHERE d.marshal_id = $1 ORDER BY d.departed_at`, [marshalId])).rows.filter((d) => !assoc || String(d.association_id) === assoc);
    const slips = (await db.query(`SELECT association_id, period_end, status, gross_commission_cents, other_earnings_cents, deductions_cents, net_cents, trips FROM payslips WHERE marshal_id = $1 AND status IN ('issued','paid') ORDER BY period_end`, [marshalId])).rows.filter((p) => !assoc || String(p.association_id) === assoc);
    const prof = (await db.query(`SELECT started_on, marshal_number FROM marshal_profiles WHERE marshal_id = $1`, [marshalId])).rows[0];
    const consent = (await db.query(`SELECT withdrawn_at FROM consents WHERE user_id = $1 AND purpose = 'payroll_records'`, [marshalId])).rows[0];
    const ranks = new Map<string, { rank: string; trips: number; first: string; last: string }>(); for (const d of deps) { const day = saDay(new Date(d.departed_at as string)), x = ranks.get(String(d.rank_name)) ?? { rank: String(d.rank_name), trips: 0, first: day, last: day }; x.trips++; if (day < x.first) x.first = day; if (day > x.last) x.last = day; ranks.set(String(d.rank_name), x); }
    const months = new Map<string, { month: string; earnedCents: number; deductionsCents: number; netCents: number; trips: number }>();
    for (const p of slips) { const m = String(new Date(p.period_end as string).toISOString().slice(0, 7)), x = months.get(m) ?? { month: m, earnedCents: 0, deductionsCents: 0, netCents: 0, trips: 0 }; x.earnedCents += Number(p.gross_commission_cents) + Number(p.other_earnings_cents); x.deductionsCents += Number(p.deductions_cents); x.netCents += Number(p.net_cents); x.trips += Number(p.trips); months.set(m, x); }
    const first = [deps[0] ? saDay(new Date(deps[0].departed_at as string)) : null, slips[0] ? new Date(slips[0].period_end as string).toISOString().slice(0, 10) : null].filter(Boolean).sort()[0] ?? null;
    const startDate = prof?.started_on ? new Date(prof.started_on as string).toISOString().slice(0, 10) : first;
    const missing: string[] = []; if (!prof?.started_on) missing.push("a start date"); if (!consent || consent.withdrawn_at) missing.push("consent to keep payroll records"); if (!slips.length) missing.push("an issued payslip");
    return { marshalNumber: prof?.marshal_number ?? null, startDate, tenureDays: startDate ? Math.max(0, Math.round((Date.parse(saDay(now())) - Date.parse(startDate)) / 86_400_000)) : 0, totalTrips: deps.length, ranks: [...ranks.values()].sort((a, b) => b.trips - a.trips), earningsByMonth: [...months.values()], verified: missing.length === 0, missing };
  }

  /* ───────────────────────── the income letter ───────────────────────── */
  const hashOf = (c: unknown) => createHash("sha256").update(JSON.stringify(c)).digest("hex");
  async function letterContent(marshalId: string, from: string, to: string): Promise<{ months: { month: string; payslips: number; trips: number; earnedCents: number; deductionsCents: number; netCents: number }[]; totals: { earnedCents: number; deductionsCents: number; netCents: number; trips: number }; associations: string[] } | null> {
    const slips = (await db.query(`SELECT p.period_end, p.trips, p.gross_commission_cents, p.other_earnings_cents, p.deductions_cents, p.net_cents, a.name AS association FROM payslips p JOIN users a ON a.id = p.association_id WHERE p.marshal_id = $1 AND p.status IN ('issued','paid') ORDER BY p.period_end`, [marshalId])).rows
      .filter((p) => { const d = new Date(p.period_end as string).toISOString().slice(0, 10); return d >= from && d <= to; });
    if (!slips.length) return null;
    const m = new Map<string, { month: string; payslips: number; trips: number; earnedCents: number; deductionsCents: number; netCents: number }>();
    for (const p of slips) { const k = new Date(p.period_end as string).toISOString().slice(0, 7), x = m.get(k) ?? { month: k, payslips: 0, trips: 0, earnedCents: 0, deductionsCents: 0, netCents: 0 }; x.payslips++; x.trips += Number(p.trips); x.earnedCents += Number(p.gross_commission_cents) + Number(p.other_earnings_cents); x.deductionsCents += Number(p.deductions_cents); x.netCents += Number(p.net_cents); m.set(k, x); }
    const months = [...m.values()];
    return { months, totals: { earnedCents: months.reduce((a, x) => a + x.earnedCents, 0), deductionsCents: months.reduce((a, x) => a + x.deductionsCents, 0), netCents: months.reduce((a, x) => a + x.netCents, 0), trips: months.reduce((a, x) => a + x.trips, 0) }, associations: [...new Set(slips.map((p) => String(p.association)))].sort() };
  }
  /** A letter for the last 3 or 6 months, from issued payslips only. It needs the marshal's consent. It says what the system recorded, and that it is not a certificate of employment. */
  async function makeLetter(marshalId: string, months: unknown): Promise<Res<Record<string, unknown>>> {
    if (months !== 3 && months !== 6) return bad(400, "A letter covers the last 3 or 6 months");
    const consent = (await db.query(`SELECT withdrawn_at FROM consents WHERE user_id = $1 AND purpose = 'income_letter'`, [marshalId])).rows[0];
    if (!consent || consent.withdrawn_at) return bad(403, "Give your consent for income letters first");
    const today = saDay(now()), d = new Date(today + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - months); const from = d.toISOString().slice(0, 10);
    const content = await letterContent(marshalId, from, today); if (!content) return bad(409, "There are no issued payslips in that period yet");
    const prof = (await db.query(`SELECT marshal_number FROM marshal_profiles WHERE marshal_id = $1`, [marshalId])).rows[0];
    const seq = Number((await db.query(`SELECT COUNT(*) AS n FROM income_letters WHERE marshal_id = $1 AND issued_at >= $2`, [marshalId, saDayStart(today)])).rows[0].n) + 1;
    const number = `IL-${today.replace(/-/g, "")}-${String(prof?.marshal_number ?? "M").replace("-", "")}-${seq}`, hash = hashOf({ content, from, to: today });
    const row = (await db.query(`INSERT INTO income_letters (marshal_id, number, months, period_from, period_to, content_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [marshalId, number, months, from, today, hash])).rows[0];
    return { ok: true, value: await renderLetter(marshalId, String(row.id)) as never };
  }
  async function renderLetter(marshalId: string, letterId: string): Promise<Record<string, unknown> | null> {
    const l = (await db.query(`SELECT l.*, u.name AS marshal_name FROM income_letters l JOIN users u ON u.id = l.marshal_id WHERE l.id = $1 AND l.marshal_id = $2`, [letterId, marshalId])).rows[0]; if (!l) return null;
    const from = new Date(l.period_from as string).toISOString().slice(0, 10), to = new Date(l.period_to as string).toISOString().slice(0, 10), content = await letterContent(marshalId, from, to);
    const code = String(l.content_hash).slice(0, 12).toUpperCase();
    return { id: String(l.id), number: String(l.number), marshal: String(l.marshal_name ?? ""), from, to, issuedAt: iso(l.issued_at), verificationCode: code, intact: !!content && hashOf({ content, from, to }) === l.content_hash, ...(content ?? { months: [], totals: { earnedCents: 0, deductionsCents: 0, netCents: 0, trips: 0 }, associations: [] }), monthsCovered: Number(l.months),
      note: "Generated from the system's trip and payslip records. It describes what the system recorded and nothing more: it is not a certificate of employment, and no tax has been calculated. The association named can confirm its number and code." };
  }
  async function letters(marshalId: string): Promise<Row[]> { return (await db.query(`SELECT id, number, months, issued_at FROM income_letters WHERE marshal_id = $1 ORDER BY issued_at DESC LIMIT 50`, [marshalId])).rows.map((l) => ({ id: String(l.id), number: String(l.number), months: Number(l.months), issuedAt: iso(l.issued_at) })); }
  /** The association checks a letter someone presents: its number and code must match a letter of one of its own marshals. Nothing about the figures is revealed. */
  async function verifyLetter(assoc: string, number: unknown, code: unknown): Promise<Res<{ valid: boolean; marshal?: string; number?: string; issuedAt?: string | null; from?: string; to?: string; intact?: boolean }>> {
    if (typeof number !== "string" || typeof code !== "string") return bad(400, "Give the letter number and its code");
    const l = (await db.query(`SELECT l.*, u.name AS marshal_name FROM income_letters l JOIN users u ON u.id = l.marshal_id WHERE l.number = $1`, [number.trim()])).rows[0];
    if (!l || String(l.content_hash).slice(0, 12).toUpperCase() !== code.trim().toUpperCase() || !(await worksFor(assoc, String(l.marshal_id)))) return { ok: true, value: { valid: false } };
    const r = await renderLetter(String(l.marshal_id), String(l.id));
    return { ok: true, value: { valid: true, marshal: String(l.marshal_name ?? ""), number: String(l.number), issuedAt: iso(l.issued_at), from: String(r?.from), to: String(r?.to), intact: !!r?.intact } };
  }
  function letterPdf(v: Record<string, any>): Promise<Buffer> {           // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 48, compress: false, info: { Title: `Proof of income ${v.number}`, Author: "VINK" } }), parts: Buffer[] = [];
      doc.on("data", (c: Buffer) => parts.push(c)); doc.on("end", () => resolve(Buffer.concat(parts))); doc.on("error", reject);
      const L = 48, W = doc.page.width - 96, INK = "#111111", MUTED = "#555555";
      doc.font("Helvetica-Bold", 16).fillColor(INK).text("Proof of income", L, 48); doc.font("Helvetica", 10).fillColor(MUTED).text(`Letter ${v.number}   Issued ${String(v.issuedAt).slice(0, 10)}   Verification code ${v.verificationCode}`, L, doc.y + 2);
      doc.moveDown(0.8).font("Helvetica", 11).fillColor(INK).text(`This letter summarises the payslips issued to ${v.marshal} by ${v.associations.join(", ")} for the last ${v.monthsCovered} months, ${v.from} to ${v.to}.`, L, doc.y, { width: W });
      doc.moveDown(0.6).font("Helvetica-Bold", 10).fillColor(MUTED).text("Month", L, doc.y); const hy = doc.y - 12; doc.text("Payslips", L + 110, hy, { width: 60, align: "right" }); doc.text("Trips", L + 180, hy, { width: 50, align: "right" }); doc.text("Earned", L + 240, hy, { width: 80, align: "right" }); doc.text("Deductions", L + 330, hy, { width: 80, align: "right" }); doc.text("Net", L + W - 70, hy, { width: 70, align: "right" }); doc.y = hy + 16;
      for (const m of v.months) { const y = doc.y; doc.font("Helvetica", 10).fillColor(INK).text(m.month, L, y); doc.text(String(m.payslips), L + 110, y, { width: 60, align: "right" }); doc.text(String(m.trips), L + 180, y, { width: 50, align: "right" }); doc.text(rand(m.earnedCents), L + 240, y, { width: 80, align: "right" }); doc.text(rand(m.deductionsCents), L + 330, y, { width: 80, align: "right" }); doc.text(rand(m.netCents), L + W - 70, y, { width: 70, align: "right" }); doc.y = y + 14; }
      doc.moveDown(0.4).font("Helvetica-Bold", 11).fillColor(INK).text(`Total over ${v.monthsCovered} months: earned ${rand(v.totals.earnedCents)}, deductions ${rand(v.totals.deductionsCents)}, net ${rand(v.totals.netCents)}.`, L, doc.y, { width: W });
      doc.font("Helvetica", 11).text(`Average per month: earned ${rand(Math.round(v.totals.earnedCents / v.monthsCovered))}, net ${rand(Math.round(v.totals.netCents / v.monthsCovered))}.`, L, doc.y + 2, { width: W });
      doc.moveDown(1).font("Helvetica", 9).fillColor(MUTED).text(String(v.note), L, doc.y, { width: W }); doc.end();
    });
  }

  /* ───────────────────────── the association's overview and patterns ───────────────────────── */
  /** Sessions at the association's ranks that made a departure with its passengers counted: how many paid by tap, and how many are left over (an estimate of cash, labelled so). */
  async function cashShare(assoc: string, from: Date, to: Date, rankId?: string): Promise<{ rankId: string; rank: string; tapPassengers: number; cashEstimate: number; sample: number }[]> {
    const rows = (await db.query(`SELECT s.rank_id, rk.name AS rank_name, s.passengers AS tap_pax, d.passengers AS dep_pax, rk.association_id FROM loading_sessions s JOIN departures d ON d.id = s.departure_id JOIN ranks rk ON rk.id = s.rank_id WHERE s.departure_id IS NOT NULL AND s.paired_at >= $1 AND s.paired_at < $2`, [from, to])).rows
      .filter((r) => String(r.association_id) === assoc && r.dep_pax !== null && (!rankId || String(r.rank_id) === rankId));
    const m = new Map<string, { rankId: string; rank: string; tapPassengers: number; cashEstimate: number; sample: number }>();
    for (const r of rows) { const k = String(r.rank_id), x = m.get(k) ?? { rankId: k, rank: String(r.rank_name), tapPassengers: 0, cashEstimate: 0, sample: 0 }; x.tapPassengers += Number(r.tap_pax); x.cashEstimate += Math.max(0, Number(r.dep_pax) - Number(r.tap_pax)); x.sample += Math.max(Number(r.dep_pax), Number(r.tap_pax)); m.set(k, x); }
    return [...m.values()];
  }
  /** A change, never a person: a rank whose cash share this week is well above its own four-week average, with the figures behind it. Needs enough passengers in both windows to mean something. */
  async function patterns(assoc: string, today: string): Promise<{ rank: string; kind: string; message: string; nowPercent: number; basePercent: number; passengers: number }[]> {
    const weekFrom = saDayStart(addDays(today, -6)), end = saDayStart(addDays(today, 1)), baseFrom = saDayStart(addDays(today, -34)), baseTo = weekFrom;
    const now7 = await cashShare(assoc, weekFrom, end), base = await cashShare(assoc, baseFrom, baseTo), out = [];
    for (const n of now7) {
      const b = base.find((x) => x.rankId === n.rankId); if (!b || n.sample < 30 || b.sample < 30) continue;
      const np = (n.cashEstimate / n.sample) * 100, bp = (b.cashEstimate / b.sample) * 100;
      if (np - bp >= 12) out.push({ rank: n.rank, kind: "cash_share_up", message: `Cash share at ${n.rank} is ${Math.round(np - bp)} points above its 4-week average`, nowPercent: Math.round(np), basePercent: Math.round(bp), passengers: n.sample });
    }
    return out.sort((a, b) => b.nowPercent - b.basePercent - (a.nowPercent - a.basePercent));
  }
  async function kpis(assoc: string, from: string, to: string, f: { rankId?: string; marshalId?: string } = {}): Promise<Res<Record<string, unknown>>> {
    if (!DAY.test(from) || !DAY.test(to) || from > to) return bad(400, "Say the period (start and end dates)");
    const a = saDayStart(from), b = saDayStart(addDays(to, 1)), rankOk = (id: unknown) => !f.rankId || String(id) === f.rankId, marshalOk = (id: unknown) => !f.marshalId || String(id) === f.marshalId;
    const sessions = (await db.query(`SELECT s.rank_id, s.marshal_id, s.total_cents, rk.association_id FROM loading_sessions s JOIN ranks rk ON rk.id = s.rank_id WHERE s.paired_at >= $1 AND s.paired_at < $2`, [a, b])).rows.filter((s) => String(s.association_id) === assoc && rankOk(s.rank_id) && marshalOk(s.marshal_id));
    const deps = (await db.query(`SELECT d.rank_id, d.marshal_id FROM departures d JOIN ranks rk ON rk.id = d.rank_id WHERE d.departed_at >= $1 AND d.departed_at < $2 AND rk.association_id = $3`, [a, b, assoc])).rows.filter((d) => rankOk(d.rank_id) && marshalOk(d.marshal_id));
    const slips = (await db.query(`SELECT marshal_id, status, gross_commission_cents, net_cents, period_end FROM payslips WHERE association_id = $1`, [assoc])).rows.filter((p) => (p.status === "issued" || p.status === "paid") && marshalOk(p.marshal_id) && new Date(p.period_end as string) >= a && new Date(p.period_end as string) < b);
    const disputes = (await db.query(`SELECT status FROM disputes WHERE association_id = $1 AND created_at >= $2 AND created_at < $3`, [assoc, a, b])).rows;
    const inc = (await incidents({ associationId: assoc }, { from, to })).incidents;
    const incRows = (await db.query(`SELECT rank_id, reported_by FROM incidents WHERE association_id = $1 AND occurred_at >= $2 AND occurred_at < $3`, [assoc, a, b])).rows.filter((i) => rankOk(i.rank_id));
    const sh = (await shifts({ associationId: assoc, ...(f.marshalId ? { marshalId: f.marshalId } : {}) }, from, to)).shifts.filter((s) => s.endedAt);
    const cash = await cashShare(assoc, a, b, f.rankId), tap = cash.reduce((x, c) => x + c.tapPassengers, 0), cashEst = cash.reduce((x, c) => x + c.cashEstimate, 0);
    const marshals = (await db.query(`SELECT DISTINCT m.marshal_id FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE r.association_id = $1`, [assoc])).rows.map((r) => String(r.marshal_id)).filter(marshalOk);
    let verified = 0; for (const m of marshals) if ((await workRecord(m, assoc)).verified) verified++;
    return { ok: true, value: {
      from, to, totalFaresCents: sessions.reduce((x, s) => x + Number(s.total_cents), 0), trips: deps.length, tapPassengers: tap, cashPassengersEstimate: cashEst, tapSharePercent: tap + cashEst > 0 ? Math.round((tap / (tap + cashEst)) * 100) : null,
      commissionPaidCents: slips.filter((p) => p.status === "paid").reduce((x, p) => x + Number(p.gross_commission_cents), 0), commissionIssuedCents: slips.reduce((x, p) => x + Number(p.gross_commission_cents), 0), payslipsIssued: slips.length,
      disputesOpen: disputes.filter((d) => d.status === "open" || d.status === "under_review").length, disputesResolved: disputes.filter((d) => d.status === "upheld" || d.status === "rejected").length, incidents: incRows.length || (f.rankId ? 0 : inc.length),
      averageShiftMinutes: sh.length ? Math.round(sh.reduce((x, s) => x + Number(s.workedMinutes), 0) / sh.length) : null, marshals: marshals.length, verifiedProfiles: verified,
    } };
  }
  async function kpisPdf(assoc: string, v: Record<string, any>): Promise<Buffer> {           // eslint-disable-line @typescript-eslint/no-explicit-any
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [assoc])).rows[0]?.name ?? "Association");
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 48, compress: false, info: { Title: "Marshal overview", Author: "VINK" } }), parts: Buffer[] = [];
      doc.on("data", (c: Buffer) => parts.push(c)); doc.on("end", () => resolve(Buffer.concat(parts))); doc.on("error", reject);
      doc.font("Helvetica-Bold", 16).fillColor("#111111").text(`${name}: marshal overview`, 48, 48); doc.font("Helvetica", 10).fillColor("#555555").text(`${v.from} to ${v.to}`, 48, doc.y + 2);
      const rows: [string, string][] = [["Total fares on rank devices", rand(v.totalFaresCents)], ["Trips", String(v.trips)], ["Tap share of passengers", v.tapSharePercent === null ? "not enough passenger counts" : `${v.tapSharePercent}% (cash is an estimate)`], ["Commission issued", rand(v.commissionIssuedCents)], ["Commission paid", rand(v.commissionPaidCents)], ["Payslips issued", String(v.payslipsIssued)], ["Queries open", String(v.disputesOpen)], ["Queries resolved", String(v.disputesResolved)], ["Incidents reported", String(v.incidents)], ["Average shift", v.averageShiftMinutes === null ? "no shifts" : `${Math.floor(v.averageShiftMinutes / 60)} h ${v.averageShiftMinutes % 60} min`], ["Marshals", String(v.marshals)], ["Verified profiles", `${v.verifiedProfiles} of ${v.marshals}`]];
      doc.moveDown(0.8); for (const [k, val] of rows) { const y = doc.y; doc.font("Helvetica", 11).fillColor("#111111").text(k, 48, y, { width: 260 }); doc.font("Helvetica-Bold", 11).text(val, 320, y, { width: 220 }); doc.y = y + 18; }
      doc.end();
    });
  }

  return { detectShifts, shifts, correctShift, addShift, decideShift, reportIncident, incidents, incidentPhoto, acknowledgeIncident, riskMap, submitGrievance, grievances, respondGrievance, welfareInsights, setBenefit, benefits, workRecord, makeLetter, renderLetter, letters, verifyLetter, letterPdf, cashShare, patterns, kpis, kpisPdf, firstAssociation };
}
export type MarshalCare = ReturnType<typeof createMarshalCare>;
