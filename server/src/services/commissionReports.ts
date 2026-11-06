import type { Db } from "../portal/common.js";
import { saDay, saDayStart } from "../portal/common.js";
import type { Commission } from "./commission.js";
import type { Payslips } from "./payslips.js";

/**
 * What marshals, drivers and the association can see of the commission records (docs/MARSHAL_COMMISSION.md): a marshal's earnings by day and the trips behind a day, the money check (trip fees due,
 * received and outstanding, and commission earned against commission payable), disputes with what happens when one is upheld, and a driver's place in the queue.
 * Every query is scoped to who is asking: a marshal sees only their own trips, a driver only their own fees and place in line, an association everything of its own.
 */
type Row = Record<string, unknown>;
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export type FeeStatus = "paid" | "owed" | "waived" | "recorded";
/** The state of a trip fee, read from its payment item (never stored): paid, owed (waiting to be collected), waived, or only recorded (shadow mode). */
export const feeStatus = (r: Row): FeeStatus => (r.waived_at ? "waived" : r.mode === "shadow" ? "recorded" : r.item_status === "paid" ? "paid" : r.item_status === "waived" ? "waived" : "owed");

export interface Scope { associationId?: string; marshalId?: string; driverId?: string }

export function createCommissionReports(db: Db, commission: Commission, payslips: Payslips, now: () => Date = () => new Date()) {
  const range = (from: string, to: string): { a: Date; b: Date } | null => (DAY.test(from) && DAY.test(to) && from <= to ? { a: saDayStart(from), b: saDayStart(new Date(Date.parse(to + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10)) } : null);

  /* ───────────────────────── a marshal's earnings ───────────────────────── */
  /** A marshal's commission by day and rank for a period, with what has already been paid on a payslip and what is still building up. Live trips only: shadow calculations belong to the association. */
  async function earnings(marshalId: string, from: string, to: string): Promise<Res<{ from: string; to: string; days: { date: string; rank: string; trips: number; feesCents: number; commissionCents: number }[]; totals: { trips: number; feesCents: number; commissionCents: number; onPayslipCents: number; accruingCents: number } }>> {
    const r = range(from, to); if (!r) return bad(400, "Say the period (start and end dates)");
    const rows = (await db.query(`SELECT c.departure_id, c.seq, c.fee_cents, c.commission_cents, c.reverses_id, c.departed_at, c.payslip_id, rk.name AS rank_name FROM trip_commissions c JOIN ranks rk ON rk.id = c.rank_id WHERE c.marshal_id = $1 AND c.mode = 'live' AND c.departed_at >= $2 AND c.departed_at < $3 ORDER BY c.departed_at, c.seq`, [marshalId, r.a, r.b])).rows;
    const reversed = new Set(rows.filter((x) => x.reverses_id).map((x) => String(x.departure_id)));
    const g = new Map<string, { date: string; rank: string; trips: number; feesCents: number; commissionCents: number }>();
    let onPayslip = 0, total = 0;
    for (const x of rows) {
      const date = saDay(new Date(x.departed_at as string)), k = `${date}|${x.rank_name}`, d = g.get(k) ?? { date, rank: String(x.rank_name), trips: 0, feesCents: 0, commissionCents: 0 };
      if (Number(x.seq) === 1 && !x.reverses_id && !reversed.has(String(x.departure_id))) { d.trips++; d.feesCents += Number(x.fee_cents); }
      d.commissionCents += Number(x.commission_cents); total += Number(x.commission_cents); if (x.payslip_id) onPayslip += Number(x.commission_cents); g.set(k, d);
    }
    const days = [...g.values()].sort((a, b) => a.date.localeCompare(b.date) || a.rank.localeCompare(b.rank));
    return { ok: true, value: { from, to, days, totals: { trips: days.reduce((a, d) => a + d.trips, 0), feesCents: days.reduce((a, d) => a + d.feesCents, 0), commissionCents: total, onPayslipCents: onPayslip, accruingCents: total - onPayslip } } };
  }
  /** The trips behind one day: when, which vehicle and driver, the fee and whether it has been paid, and the commission. */
  async function dayTrips(marshalId: string, date: string): Promise<Res<{ date: string; trips: { departureId: string; time: string; rank: string; registration: string; driver: string | null; feeCents: number; feeStatus: FeeStatus; rateBp: number; commissionCents: number; payslip: string | null; exception: string | null }[] }>> {
    const r = range(date, date); if (!r) return bad(400, "Say the day (YYYY-MM-DD)");
    const rows = (await db.query(`SELECT c.departure_id, c.seq, c.fee_cents, c.rate_bp, c.commission_cents, c.reverses_id, c.departed_at, c.reason_code, rk.name AS rank_name, v.registration, du.name AS driver_name, f.waived_at, f.mode, pi.status AS item_status, ps.number AS payslip_number
        FROM trip_commissions c JOIN ranks rk ON rk.id = c.rank_id JOIN vehicles v ON v.id = c.vehicle_id LEFT JOIN users du ON du.id = c.driver_id LEFT JOIN trip_fees f ON f.departure_id = c.departure_id LEFT JOIN payment_items pi ON pi.id = f.payment_item_id LEFT JOIN payslips ps ON ps.id = c.payslip_id
       WHERE c.marshal_id = $1 AND c.mode = 'live' AND c.departed_at >= $2 AND c.departed_at < $3 ORDER BY c.departed_at, c.seq`, [marshalId, r.a, r.b])).rows;
    const by = new Map<string, Row[]>(); for (const x of rows) by.set(String(x.departure_id), [...(by.get(String(x.departure_id)) ?? []), x]);
    const trips = [...by.values()].map((g) => {
      const o = g[0];
      return { departureId: String(o.departure_id), time: new Date(o.departed_at as string).toISOString(), rank: String(o.rank_name), registration: String(o.registration), driver: o.driver_name ? String(o.driver_name) : null, feeCents: Number(o.fee_cents), feeStatus: feeStatus(o), rateBp: Number(o.rate_bp), commissionCents: g.reduce((a, x) => a + Number(x.commission_cents), 0), payslip: o.payslip_number ? String(o.payslip_number) : null, exception: o.reason_code ? String(o.reason_code) : null };
    });
    return { ok: true, value: { date, trips } };
  }

  /* ───────────────────────── the money check ───────────────────────── */
  /**
   * Trip fees due, received and outstanding, and commission earned against commission payable, for a marshal (their own trips), a driver (the fees on their trips) or an association (everything). Live trips only.
   * Commission payable follows the association's rule: when the fee is recorded (the default, so a driver's late payment never touches the marshal), or only when it is paid.
   */
  async function reconcile(scope: Scope, from: string, to: string): Promise<Res<Record<string, unknown>>> {
    const r = range(from, to); if (!r) return bad(400, "Say the period (start and end dates)");
    const fees = (await db.query(`SELECT f.departure_id, f.association_id, f.amount_cents, f.waived_at, f.mode, f.driver_id, f.payer_id, d.marshal_id, d.departed_at, pi.status AS item_status, du.name AS driver_name, v.registration
        FROM trip_fees f JOIN departures d ON d.id = f.departure_id JOIN vehicles v ON v.id = f.vehicle_id LEFT JOIN users du ON du.id = COALESCE(f.driver_id, f.payer_id) LEFT JOIN payment_items pi ON pi.id = f.payment_item_id
       WHERE f.mode = 'live' AND d.departed_at >= $1 AND d.departed_at < $2 ORDER BY d.departed_at`, [r.a, r.b])).rows
      .filter((f) => (!scope.associationId || String(f.association_id) === scope.associationId) && (!scope.marshalId || String(f.marshal_id) === scope.marshalId) && (!scope.driverId || String(f.driver_id ?? f.payer_id) === scope.driverId));
    const status = new Map(fees.map((f) => [String(f.departure_id), feeStatus(f)]));
    const sum = (rows: Row[]) => rows.reduce((a, f) => a + Number(f.amount_cents), 0);
    const paid = fees.filter((f) => status.get(String(f.departure_id)) === "paid"), owed = fees.filter((f) => status.get(String(f.departure_id)) === "owed"), waived = fees.filter((f) => status.get(String(f.departure_id)) === "waived");
    const byWho = new Map<string, { driver: string; vehicle: string; trips: number; cents: number }>();
    for (const f of owed) { const k = `${f.driver_name}|${f.registration}`, x = byWho.get(k) ?? { driver: String(f.driver_name ?? "No driver"), vehicle: String(f.registration), trips: 0, cents: 0 }; x.trips++; x.cents += Number(f.amount_cents); byWho.set(k, x); }
    const out: Record<string, unknown> = {
      from, to, trips: fees.length, feesDueCents: sum(fees) - sum(waived), feesReceivedCents: sum(paid), feesOutstandingCents: sum(owed), feesWaivedCents: sum(waived), tripsPaid: paid.length, tripsOwed: owed.length, tripsWaived: waived.length,
      outstanding: [...byWho.values()].sort((a, b) => b.cents - a.cents || a.driver.localeCompare(b.driver)),
    };
    if (!scope.driverId) {                                                                                 // a driver is told about fees, never about a marshal's commission
      const crows = (await db.query(`SELECT c.departure_id, c.seq, c.association_id, c.marshal_id, c.commission_cents FROM trip_commissions c WHERE c.mode = 'live' AND c.departed_at >= $1 AND c.departed_at < $2`, [r.a, r.b])).rows
        .filter((c) => (!scope.associationId || String(c.association_id) === scope.associationId) && (!scope.marshalId || String(c.marshal_id) === scope.marshalId));
      const earned = crows.reduce((a, c) => a + Number(c.commission_cents), 0);
      const rule = scope.associationId ? (await commission.settings(scope.associationId)).payableOn : "recorded";
      let withheld = 0;
      if (rule === "paid") for (const [dep, st] of status) if (st === "owed") withheld += crows.filter((c) => String(c.departure_id) === dep).reduce((a, c) => a + Number(c.commission_cents), 0);
      Object.assign(out, { commissionEarnedCents: earned, commissionPayableCents: earned - withheld, commissionWithheldCents: withheld, commissionRule: rule });
    }
    return { ok: true, value: out };
  }
  /** The audit trail for the association: each trip with its fee, the rule and rate applied, and what it earned. */
  async function auditTrail(associationId: string, from: string, to: string, marshalId?: string): Promise<Res<Row[]>> {
    const r = range(from, to); if (!r) return bad(400, "Say the period (start and end dates)");
    const rows = (await db.query(`SELECT c.departure_id, c.seq, c.fee_cents, c.rate_bp, c.tier_after_trips, c.commission_cents, c.fee_rule_id, c.rate_rule_id, c.mode, c.departed_at, c.marshal_id, c.reason_code, c.engine_version, rk.name AS rank_name, v.registration, du.name AS driver_name, mu.name AS marshal_name, f.waived_at, pi.status AS item_status
        FROM trip_commissions c JOIN ranks rk ON rk.id = c.rank_id JOIN vehicles v ON v.id = c.vehicle_id JOIN users mu ON mu.id = c.marshal_id LEFT JOIN users du ON du.id = c.driver_id LEFT JOIN trip_fees f ON f.departure_id = c.departure_id LEFT JOIN payment_items pi ON pi.id = f.payment_item_id
       WHERE c.association_id = $1 AND c.departed_at >= $2 AND c.departed_at < $3 ORDER BY c.departed_at DESC, c.seq LIMIT 1000`, [associationId, r.a, r.b])).rows.filter((x) => !marshalId || String(x.marshal_id) === marshalId);
    const by = new Map<string, Row[]>(); for (const x of rows) by.set(String(x.departure_id), [...(by.get(String(x.departure_id)) ?? []), x]);
    return { ok: true, value: [...by.values()].map((g) => { const o = g.find((x) => Number(x.seq) === 1) ?? g[0]; return {
      departureId: String(o.departure_id), time: iso(o.departed_at), rank: String(o.rank_name), marshal: String(o.marshal_name), registration: String(o.registration), driver: o.driver_name ? String(o.driver_name) : null, mode: String(o.mode),
      feeCents: Number(o.fee_cents), feeRuleId: o.fee_rule_id ?? null, rateBp: Number(o.rate_bp), rateRuleId: o.rate_rule_id ?? null, tier: o.tier_after_trips === null ? null : Number(o.tier_after_trips),
      commissionCents: g.reduce((a, x) => a + Number(x.commission_cents), 0), reversed: g.length > 1, feeStatus: feeStatus(o), exception: o.reason_code ?? null, engineVersion: String(o.engine_version),
    }; }) };
  }

  /* ───────────────────────── disputes ───────────────────────── */
  /** A marshal queries a line of a payslip or a trip; a driver queries a trip. It goes to the association admin and is tracked until answered. */
  async function raiseDispute(userId: string, role: "marshal" | "driver", a: { targetType?: unknown; targetId?: unknown; message?: unknown }): Promise<Res<{ id: string }>> {
    const message = typeof a.message === "string" ? a.message.trim() : "";
    if (message.length < 5 || message.length > 500) return bad(400, "Say what is wrong, in 5 to 500 characters");
    if (typeof a.targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(a.targetId)) return bad(400, "Choose what you are querying");
    let association: string | null = null, payslipId: string | null = null;
    if (a.targetType === "payslip_line") {
      if (role !== "marshal") return bad(403, "Only the marshal can query their payslip");
      const l = (await db.query(`SELECT l.id, p.id AS payslip_id, p.association_id, p.marshal_id, p.status FROM payslip_lines l JOIN payslips p ON p.id = l.payslip_id WHERE l.id = $1`, [a.targetId])).rows[0];
      if (!l || String(l.marshal_id) !== userId || l.status === "draft") return bad(404, "That line was not found");
      association = String(l.association_id); payslipId = String(l.payslip_id);
    } else if (a.targetType === "trip") {
      const d = (await db.query(`SELECT d.id, d.marshal_id, d.driver_id, r.association_id FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE d.id = $1`, [a.targetId])).rows[0];
      const mine = d && (role === "marshal" ? String(d.marshal_id) === userId : String(d.driver_id ?? "") === userId || (await db.query(`SELECT 1 AS x FROM trip_fees WHERE departure_id = $1 AND payer_id = $2`, [a.targetId, userId])).rows.length > 0);
      if (!d || !mine) return bad(404, "That trip was not found");
      association = String(d.association_id);
    } else return bad(400, "Query a payslip line or a trip");
    if ((await db.query(`SELECT 1 AS x FROM disputes WHERE raised_by = $1 AND target_id = $2 AND status IN ('open','under_review')`, [userId, a.targetId])).rows.length) return bad(409, "You already have an open query about that");
    const row = (await db.query(`INSERT INTO disputes (association_id, raised_by, raised_role, target_type, target_id, payslip_id, message) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [association, userId, role, a.targetType, a.targetId, payslipId, message])).rows[0];
    return { ok: true, value: { id: String(row.id) } };
  }
  async function listDisputes(scope: { associationId?: string; userId?: string }, status?: string): Promise<Row[]> {
    const rows = (await db.query(`SELECT d.*, u.name AS raised_name, r.name AS responder_name FROM disputes d JOIN users u ON u.id = d.raised_by LEFT JOIN users r ON r.id = d.responded_by ORDER BY d.created_at DESC LIMIT 300`)).rows
      .filter((d) => (!scope.associationId || String(d.association_id) === scope.associationId) && (!scope.userId || String(d.raised_by) === scope.userId) && (!status || d.status === status));
    return rows.map((d) => ({ id: String(d.id), raisedBy: String(d.raised_name ?? ""), role: String(d.raised_role), targetType: String(d.target_type), targetId: String(d.target_id), payslipId: d.payslip_id ? String(d.payslip_id) : null, message: String(d.message), status: String(d.status), response: d.response ?? null, respondedBy: d.responder_name ?? null, respondedAt: iso(d.responded_at), creditCents: d.credit_cents === null ? null : Number(d.credit_cents), createdAt: iso(d.created_at) }));
  }
  /**
   * The association's answer. Upheld needs a reason that the person sees, and has an effect: a driver's query about a trip waives an unpaid fee and reverses that trip's commission (a fee already paid needs a refund,
   * which is not built here and is said so); a marshal's upheld query can carry a credit that appears on their next payslip as its own line. Rejected needs a reason. A decided query cannot be decided again.
   */
  async function respond(assoc: string, disputeId: string, by: string, a: { decision?: unknown; response?: unknown; creditCents?: unknown }): Promise<Res<{ status: string; effect: string }>> {
    const d = (await db.query(`SELECT * FROM disputes WHERE id = $1 AND association_id = $2`, [disputeId, assoc])).rows[0];
    if (!d) return bad(404, "No such query");
    if (d.status === "upheld" || d.status === "rejected") return bad(409, "That query has already been answered");
    if (!["under_review", "upheld", "rejected"].includes(String(a.decision))) return bad(400, "Choose under review, upheld or rejected");
    const response = typeof a.response === "string" ? a.response.trim().slice(0, 500) : "";
    if (a.decision !== "under_review" && !response) return bad(400, "Give the reason, so the person sees why");
    let effect = "none"; let credit: number | null = null;
    if (a.decision === "upheld") {
      if (a.creditCents !== undefined && a.creditCents !== null) { if (!Number.isInteger(a.creditCents) || (a.creditCents as number) < 1 || (a.creditCents as number) > 10_000_000) return bad(400, "The credit must be a whole number of cents"); credit = a.creditCents as number; }
      if (d.target_type === "trip" && d.raised_role === "driver") {
        const w = await commission.waiveFee(String(d.target_id), by, { reasonCode: "error_corrected", reason: response });
        if (w.ok) effect = "fee_waived_commission_reversed";
        else if (w.status === 409 && /already paid/.test(w.error)) { const rf = await commission.refundFee(String(d.target_id), by, { reasonCode: "error_corrected", reason: response }); effect = rf.ok ? "fee_refunded_commission_reversed" : "fee_already_paid_needs_refund"; }      // a fee already paid is refunded
        else effect = w.status === 409 ? "already_waived" : "none";
      }
      if (credit) {
        const marshal = d.raised_role === "marshal" ? String(d.raised_by) : null;
        if (!marshal) return bad(400, "A credit goes to a marshal: it cannot be given on a driver's query");
        const c = await payslips.addAdjustment(assoc, by, { marshalId: marshal, kind: "dispute_credit", label: "Dispute credit", reason: `Upheld: ${response}`, reference: `DSP-${String(d.id).slice(0, 8)}`, totalCents: credit });
        if (!c.ok) return c; effect = "credit_on_next_payslip";
      }
    }
    await db.query(`UPDATE disputes SET status = $2, response = $3, responded_by = $4, responded_at = now(), credit_cents = $5 WHERE id = $1`, [disputeId, a.decision, response || null, by, credit]);
    return { ok: true, value: { status: String(a.decision), effect } };
  }

  /* ───────────────────────── a driver's place in the queue ───────────────────────── */
  /** Where each of a driver's vehicles stands in the queue at each rank, so favouritism cannot be alleged without the record to answer it. */
  async function queuePosition(driverId: string): Promise<{ rankId: string; rank: string; registration: string; position: number; ahead: number; waiting: number; loading: boolean; since: string }[]> {
    const mine = (await db.query(`SELECT q.id, q.rank_id, q.joined_at, v.registration, rk.name AS rank_name FROM rank_queue q JOIN vehicles v ON v.id = q.vehicle_id JOIN ranks rk ON rk.id = q.rank_id WHERE v.driver_id = $1 AND q.left_at IS NULL`, [driverId])).rows;
    const out = [];
    for (const m of mine) {
      const line = (await db.query(`SELECT id FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL ORDER BY joined_at, id`, [m.rank_id])).rows.map((x) => String(x.id));
      const pos = line.indexOf(String(m.id)) + 1;
      const loading = (await db.query(`SELECT 1 AS x FROM loading_sessions WHERE queue_id = $1 AND status IN ('pending','loading')`, [m.id])).rows.length > 0;
      out.push({ rankId: String(m.rank_id), rank: String(m.rank_name), registration: String(m.registration), position: pos, ahead: pos - 1, waiting: line.length, loading, since: new Date(m.joined_at as string).toISOString() });
    }
    return out;
  }
  /** A marshal's own recent queue changes (who, when, why). */
  async function myQueueEvents(marshalId: string, limit = 50): Promise<Row[]> {
    return (await db.query(`SELECT e.action, e.reason_code, e.position_before, e.created_at, v.registration, rk.name AS rank_name, c.label_en FROM queue_events e JOIN vehicles v ON v.id = e.vehicle_id JOIN ranks rk ON rk.id = e.rank_id LEFT JOIN reason_codes c ON c.code = e.reason_code WHERE e.marshal_id = $1 ORDER BY e.created_at DESC LIMIT ${Math.max(1, Math.min(200, limit))}`, [marshalId]))
      .rows.map((e) => ({ action: String(e.action), reason: e.label_en ?? null, reasonCode: e.reason_code ?? null, positionBefore: e.position_before === null ? null : Number(e.position_before), at: iso(e.created_at), registration: String(e.registration), rank: String(e.rank_name) }));
  }
  void now;
  return { earnings, dayTrips, reconcile, auditTrail, raiseDispute, listDisputes, respond, queuePosition, myQueueEvents };
}
export type CommissionReports = ReturnType<typeof createCommissionReports>;
