import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, saDay, sendCsv, type Db } from "./common.js";
import { createCommission } from "../services/commission.js";
import { createPayslips, periodFor, addDays } from "../services/payslips.js";
import { createCommissionReports } from "../services/commissionReports.js";
import { createMarshalCare } from "../services/marshalCare.js";

/**
 * The marshal commission and payslip API (docs/MARSHAL_COMMISSION.md), mounted on three routers. Who can see what is decided here, by the signed-in role:
 *
 *   ASSOCIATION  /commission/…  settings, fee and rate rules (never edited: a later date supersedes), tiers, catch-up, the audit trail, waivers, approved exceptions, the money check, marshals
 *                /payruns, /payslips/…  the pay run: draft, review, issue, record payment, PDF;  /adjustments  bonuses, advances and other deductions;  /disputes  answer queries;  /access-log
 *   MARSHAL      /earnings, /earnings/day/:date, /payslips, /payslips/:id(.pdf), /disputes, /money-check, /profile, /consents/:purpose, /queue-events, /reason-codes (their own data only)
 *   DRIVER       /queue-position, /fees, /disputes (their own place in line, their own fees)
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200, key?: string) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(key ? { [key]: r.value } : (r.value as object)) });
};
const queryDay = (req: Request, name: string, fallback: string): string => (typeof req.query[name] === "string" && DAY.test(String(req.query[name])) ? String(req.query[name]) : fallback);

function services(db: Db, now: () => Date) {
  const commission = createCommission(db, now), payslips = createPayslips(db, commission, now), reports = createCommissionReports(db, commission, payslips, now);
  return { commission, payslips, reports, care: createMarshalCare(db, commission, now) };
}

/* ───────────────────────── the association ───────────────────────── */
export function mountAssociationCommission(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const { commission, payslips, reports } = services(db, now);
  mountAssociationCare(router, db, now);
  const body = json({ limit: "10kb" });
  const assoc = (req: Request) => uid(req);

  router.get("/commission/settings", h(async (req, res) => {
    const st = await commission.settings(assoc(req)), today = saDay(now()), cur = periodFor(st, today), prev = periodFor(st, addDays(cur.start, -1));
    res.json({ success: true, settings: st, currentPeriod: cur, lastFinishedPeriod: prev, reasons: (await db.query(`SELECT code, kind, label_en FROM reason_codes WHERE active = true ORDER BY kind, label_en`)).rows.map((r) => ({ code: String(r.code), kind: String(r.kind), label: String(r.label_en) })) });
  }));
  router.put("/commission/settings", body, h(async (req, res) => {
    const r = await commission.updateSettings(assoc(req), req.body ?? {});
    if (r.ok) await audit(db, req, "commission.settings", assoc(req), req.body ?? {});
    reply(res, r, 200, "settings");
  }));
  router.get("/commission/rules", h(async (req, res) => {
    const a = assoc(req), fee = (await db.query(`SELECT r.*, rk.name AS rank_name, rt.name AS route_name FROM trip_fee_rules r LEFT JOIN ranks rk ON rk.id = r.rank_id LEFT JOIN token_routes rt ON rt.id = r.route_id WHERE r.association_id = $1 ORDER BY r.effective_from DESC, r.created_at DESC`, [a])).rows;
    const rates = (await db.query(`SELECT r.*, rk.name AS rank_name, u.name AS marshal_name FROM commission_rules r LEFT JOIN ranks rk ON rk.id = r.rank_id LEFT JOIN users u ON u.id = r.marshal_id WHERE r.association_id = $1 ORDER BY r.effective_from DESC, r.created_at DESC`, [a])).rows;
    const tiers = (await db.query(`SELECT t.*, rk.name AS rank_name FROM commission_tiers t LEFT JOIN ranks rk ON rk.id = t.rank_id WHERE t.association_id = $1 ORDER BY t.effective_from DESC, t.after_trips`, [a])).rows;
    const day = (v: unknown) => new Date(v as string).toISOString().slice(0, 10);
    res.json({ success: true,
      feeRules: fee.map((r) => ({ id: String(r.id), scope: String(r.scope), rank: r.rank_name ?? null, route: r.route_name ?? null, amountCents: Number(r.amount_cents), effectiveFrom: day(r.effective_from), note: r.note ?? null })),
      rates: rates.map((r) => ({ id: String(r.id), scope: String(r.scope), rank: r.rank_name ?? null, marshal: r.marshal_name ?? null, rateBp: Number(r.rate_bp), effectiveFrom: day(r.effective_from), note: r.note ?? null })),
      tiers: tiers.map((t) => ({ id: String(t.id), rank: t.rank_name ?? null, afterTrips: Number(t.after_trips), rateBp: Number(t.rate_bp), effectiveFrom: day(t.effective_from) })) });
  }));
  router.post("/commission/fee-rules", body, h(async (req, res) => { const r = await commission.addFeeRule(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "commission.fee_rule", r.value.id, req.body ?? {}); reply(res, r, 201); }));
  router.post("/commission/rates", body, h(async (req, res) => { const r = await commission.addRate(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "commission.rate", r.value.id, req.body ?? {}); reply(res, r, 201); }));
  router.post("/commission/tiers", body, h(async (req, res) => { const r = await commission.addTier(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "commission.tier", r.value.id, req.body ?? {}); reply(res, r, 201); }));
  router.post("/commission/backfill", body, h(async (req, res) => {
    const from = req.body?.from; if (typeof from !== "string" || !DAY.test(from)) { fail(res, 400, "Say the date to calculate from (YYYY-MM-DD)"); return; }
    if ((await commission.settings(assoc(req))).mode === "off") { fail(res, 409, "Commission is off. Switch it to shadow or live first."); return; }
    const r = await commission.backfill(assoc(req), from); await audit(db, req, "commission.backfill", assoc(req), { from, ...r }); res.json({ success: true, ...r });
  }));
  router.get("/commission/trips", h(async (req, res) => {
    const today = saDay(now()), from = queryDay(req, "from", addDays(today, -6)), to = queryDay(req, "to", today), m = typeof req.query.marshalId === "string" && isUuid(req.query.marshalId) ? req.query.marshalId : undefined;
    reply(res, await reports.auditTrail(assoc(req), from, to, m), 200, "trips");
  }));
  router.post("/commission/trips/:departureId/waive", body, h(async (req, res) => {
    if (!isUuid(req.params.departureId)) { fail(res, 400, "Invalid trip"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM trip_fees WHERE departure_id = $1 AND association_id = $2`, [req.params.departureId, assoc(req)])).rows.length) { fail(res, 404, "That trip was not found"); return; }
    const r = await commission.waiveFee(req.params.departureId as string, uid(req), { reasonCode: req.body?.reasonCode, reason: req.body?.reason, absorb: req.body?.absorb === true });
    if (r.ok) await audit(db, req, "commission.waive", req.params.departureId as string, { reasonCode: req.body?.reasonCode, absorb: req.body?.absorb === true });
    reply(res, r);
  }));
  router.post("/commission/trips/:departureId/refund", body, h(async (req, res) => {
    if (!isUuid(req.params.departureId)) { fail(res, 400, "Invalid trip"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM trip_fees WHERE departure_id = $1 AND association_id = $2`, [req.params.departureId, assoc(req)])).rows.length) { fail(res, 404, "That trip was not found"); return; }
    const r = await commission.refundFee(req.params.departureId as string, uid(req), { reasonCode: req.body?.reasonCode, reason: req.body?.reason, absorb: req.body?.absorb === true });
    if (r.ok) await audit(db, req, "commission.refund", req.params.departureId as string, { reasonCode: req.body?.reasonCode, absorb: req.body?.absorb === true });
    reply(res, r);
  }));
  router.post("/commission/exceptions", body, h(async (req, res) => { const r = await commission.approveException(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "commission.exception", assoc(req), req.body ?? {}); reply(res, r, 201, "result"); }));
  router.get("/commission/reconciliation", h(async (req, res) => {
    const today = saDay(now()); reply(res, await reports.reconcile({ associationId: assoc(req) }, queryDay(req, "from", addDays(today, -6)), queryDay(req, "to", today)));
  }));
  router.get("/commission/marshals", h(async (req, res) => { res.json({ success: true, marshals: await payslips.marshals(assoc(req)) }); }));
  router.put("/commission/marshals/:id", body, h(async (req, res) => {
    const m = req.params.id; if (!isUuid(m) || !(await db.query(`SELECT 1 AS x FROM rank_marshals rm JOIN ranks r ON r.id = rm.rank_id WHERE rm.marshal_id = $1 AND r.association_id = $2`, [m, assoc(req)])).rows.length) { fail(res, 404, "Marshal not found"); return; }
    const { class: cls, uifApplies, startedOn } = req.body ?? {}; const r = await payslips.updateProfile(m, { class: cls, uifApplies, startedOn });
    if (r.ok) await audit(db, req, "commission.marshal_profile", m, { class: cls, uifApplies, startedOn }); reply(res, r.ok ? { ok: true, value: {} } : r);
  }));

  /* the pay run */
  router.get("/payruns", h(async (req, res) => {
    const st = await commission.settings(assoc(req)), cur = periodFor(st, saDay(now())), prev = periodFor(st, addDays(cur.start, -1));
    const start = queryDay(req, "start", prev.start), p = periodFor(st, start);
    res.json({ success: true, period: p, finished: p.end < saDay(now()), payslips: await payslips.list({ associationId: assoc(req) }, { start: p.start, end: p.end }) });
  }));
  router.post("/payruns", body, h(async (req, res) => {
    const st = await commission.settings(assoc(req)), cur = periodFor(st, saDay(now())), p = typeof req.body?.start === "string" && DAY.test(req.body.start) ? periodFor(st, req.body.start) : periodFor(st, addDays(cur.start, -1));
    const r = await payslips.runPeriod(assoc(req), p.start, p.end, uid(req)); if (r.ok) await audit(db, req, "payrun.draft", assoc(req), { ...p, ...r.value }); reply(res, r.ok ? { ok: true, value: { period: p, ...r.value } } : r);
  }));
  router.post("/payslips/draft", body, h(async (req, res) => {
    const { marshalId, start } = req.body ?? {}; if (!isUuid(marshalId) || typeof start !== "string" || !DAY.test(start)) { fail(res, 400, "Choose the marshal and the period"); return; }
    const p = periodFor(await commission.settings(assoc(req)), start); reply(res, await payslips.draft(assoc(req), marshalId, p.start, p.end, uid(req)));
  }));
  router.get("/payslips/:id.pdf", h(async (req, res) => {
    const v = await payslips.view(String(req.params.id), { associationId: assoc(req) }); if (!v.ok) { fail(res, v.status, v.error); return; }
    await payslips.logAccess(uid(req), String((await db.query(`SELECT marshal_id FROM payslips WHERE id = $1`, [req.params.id])).rows[0].marshal_id), "payslip_pdf", String(req.params.id));
    const buf = await payslips.pdf(v.value); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="payslip-${String(v.value.number)}.pdf"`); res.send(buf);
  }));
  router.get("/payslips/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid payslip"); return; }
    const v = await payslips.view(req.params.id, { associationId: assoc(req) }); if (!v.ok) { fail(res, v.status, v.error); return; }
    await payslips.logAccess(uid(req), String((await db.query(`SELECT marshal_id FROM payslips WHERE id = $1`, [req.params.id])).rows[0].marshal_id), "payslip", req.params.id); res.json({ success: true, payslip: v.value });
  }));
  router.post("/payslips/:id/issue", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid payslip"); return; }
    const r = await payslips.issue(assoc(req), req.params.id, uid(req), req.body?.method ?? "wallet"); if (r.ok) await audit(db, req, "payslip.issue", req.params.id, { method: req.body?.method ?? "wallet", netCents: r.value.netCents }); reply(res, r);
  }));
  router.post("/payslips/:id/revise", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid payslip"); return; }
    const r = await payslips.revise(assoc(req), req.params.id, uid(req), req.body?.note); if (r.ok) await audit(db, req, "payslip.revise", req.params.id, { note: req.body?.note }); reply(res, r);
  }));
  router.post("/payslips/:id/payment", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid payslip"); return; }
    const r = await payslips.recordPayment(assoc(req), req.params.id, uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "payslip.payment", req.params.id, { method: req.body?.method, reference: req.body?.reference }); reply(res, r);
  }));
  router.get("/adjustments", h(async (req, res) => { res.json({ success: true, adjustments: await payslips.adjustments(assoc(req), typeof req.query.marshalId === "string" && isUuid(req.query.marshalId) ? req.query.marshalId : undefined) }); }));
  router.post("/adjustments", body, h(async (req, res) => { const r = await payslips.addAdjustment(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "adjustment.add", r.value.id, { kind: req.body?.kind, marshalId: req.body?.marshalId, totalCents: req.body?.totalCents }); reply(res, r, 201); }));
  router.post("/adjustments/:id/cancel", h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid adjustment"); return; } const r = await payslips.cancelAdjustment(assoc(req), req.params.id); if (r.ok) await audit(db, req, "adjustment.cancel", req.params.id, {}); reply(res, r); }));
  router.get("/disputes", h(async (req, res) => { res.json({ success: true, disputes: await reports.listDisputes({ associationId: assoc(req) }, typeof req.query.status === "string" ? req.query.status : undefined) }); }));
  router.post("/disputes/:id/respond", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid query"); return; }
    const r = await reports.respond(assoc(req), req.params.id, uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "dispute.respond", req.params.id, { decision: req.body?.decision, effect: r.value.effect }); reply(res, r);
  }));
  router.get("/access-log", h(async (req, res) => {
    const m = typeof req.query.marshalId === "string" && isUuid(req.query.marshalId) ? req.query.marshalId : null;
    if (!m || !(await db.query(`SELECT 1 AS x FROM rank_marshals rm JOIN ranks r ON r.id = rm.rank_id WHERE rm.marshal_id = $1 AND r.association_id = $2`, [m, assoc(req)])).rows.length) { fail(res, 404, "Marshal not found"); return; }
    res.json({ success: true, entries: await payslips.accessLog(m) });
  }));
}

/* ───────────────────────── the marshal (their own data only) ───────────────────────── */
export function mountMarshalCommission(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const { payslips, reports } = services(db, now);
  mountMarshalCare(router, db, now);
  /** The association a marshal works for (the first, if they work for several: a request can name another). */
  const firstAssociation = async (marshalId: string): Promise<string | null> => String((await db.query(`SELECT r.association_id FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 ORDER BY r.created_at LIMIT 1`, [marshalId])).rows[0]?.association_id ?? "") || null;
  const body = json({ limit: "5kb" });
  router.get("/earnings", h(async (req, res) => { const today = saDay(now()); reply(res, await reports.earnings(uid(req), queryDay(req, "from", addDays(today, -6)), queryDay(req, "to", today))); }));
  router.get("/earnings/day/:date", h(async (req, res) => { reply(res, await reports.dayTrips(uid(req), String(req.params.date))); }));
  router.get("/payslips", h(async (req, res) => { res.json({ success: true, payslips: await payslips.listForMarshal(uid(req)) }); }));
  router.get("/payslips/:id.pdf", h(async (req, res) => {
    const v = await payslips.view(String(req.params.id), { marshalId: uid(req) }); if (!v.ok) { fail(res, v.status, v.error); return; }
    await payslips.logAccess(uid(req), uid(req), "payslip_pdf", String(req.params.id));
    const buf = await payslips.pdf(v.value); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="payslip-${String(v.value.number)}.pdf"`); res.send(buf);
  }));
  router.get("/payslips/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid payslip"); return; }
    const v = await payslips.view(req.params.id, { marshalId: uid(req) }); if (!v.ok) { fail(res, v.status, v.error); return; }
    await payslips.logAccess(uid(req), uid(req), "payslip", req.params.id); res.json({ success: true, payslip: v.value });
  }));
  router.get("/cash-out", h(async (req, res) => { const a = typeof req.query.associationId === "string" && isUuid(req.query.associationId) ? req.query.associationId : await firstAssociation(uid(req)); res.json({ success: true, ...(a ? await payslips.cashOutStatus(a, uid(req)) : { enabled: false, availableCents: 0, outstandingCents: 0, maxCents: 0, capBp: 0 }) }); }));
  router.post("/cash-out", body, h(async (req, res) => { const a = typeof req.body?.associationId === "string" && isUuid(req.body.associationId) ? req.body.associationId : await firstAssociation(uid(req)); if (!a) { fail(res, 403, "You do not work for an association"); return; } reply(res, await payslips.cashOut(a, uid(req), req.body?.amountCents, uid(req)), 201); }));
  router.get("/disputes", h(async (req, res) => { res.json({ success: true, disputes: await reports.listDisputes({ userId: uid(req) }) }); }));
  router.post("/disputes", body, h(async (req, res) => { reply(res, await reports.raiseDispute(uid(req), "marshal", req.body ?? {}), 201); }));
  router.get("/money-check", h(async (req, res) => { const today = saDay(now()); reply(res, await reports.reconcile({ marshalId: uid(req) }, queryDay(req, "from", addDays(today, -6)), queryDay(req, "to", today))); }));
  router.get("/profile", h(async (req, res) => { const p = await payslips.ensureProfile(uid(req)); res.json({ success: true, profile: { marshalNumber: String(p.marshal_number), language: String(p.language), class: String(p.class) }, consents: await payslips.consents(uid(req)) }); }));
  router.put("/profile", body, h(async (req, res) => {
    const r = await payslips.updateProfile(uid(req), { language: req.body?.language });                           // a marshal chooses their language; class and UIF are the association's to set
    reply(res, r.ok ? { ok: true, value: { profile: { marshalNumber: String(r.value.marshal_number), language: String(r.value.language), class: String(r.value.class) } } } : r);
  }));
  router.put("/consents/:purpose", body, h(async (req, res) => { if (typeof req.body?.granted !== "boolean") { fail(res, 400, "Say whether you agree"); return; } reply(res, await payslips.setConsent(uid(req), String(req.params.purpose), req.body.granted)); }));
  router.get("/queue-events", h(async (req, res) => { res.json({ success: true, events: await reports.myQueueEvents(uid(req)) }); }));
}

/* ───────────────────────── the driver (their own fees and place in line) ───────────────────────── */
export function mountDriverCommission(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const { reports } = services(db, now);
  router.get("/trip-fees", h(async (req, res) => { const today = saDay(now()); res.json({ success: true, trips: await reports.driverTrips(uid(req), queryDay(req, "from", addDays(today, -13)), queryDay(req, "to", today)) }); }));
  const body = json({ limit: "5kb" });
  router.get("/queue-position", h(async (req, res) => { res.json({ success: true, positions: await reports.queuePosition(uid(req)) }); }));
  router.get("/fees", h(async (req, res) => { const today = saDay(now()); reply(res, await reports.reconcile({ driverId: uid(req) }, queryDay(req, "from", addDays(today, -6)), queryDay(req, "to", today))); }));
  router.get("/disputes", h(async (req, res) => { res.json({ success: true, disputes: await reports.listDisputes({ userId: uid(req) }) }); }));
  router.post("/disputes", body, h(async (req, res) => { reply(res, await reports.raiseDispute(uid(req), "driver", { ...(req.body ?? {}), targetType: "trip" }), 201); }));
}

/* ───────────────────────── marshal care: the marshal's side ───────────────────────── */
function mountMarshalCare(router: Router, db: Db, now: () => Date): void {
  const { care } = services(db, now), body = json({ limit: "300kb" });               // a small photo with an incident report
  const window = (req: Request) => { const today = saDay(now()); return { from: queryDay(req, "from", addDays(today, -13)), to: queryDay(req, "to", today) }; };
  router.get("/shifts", h(async (req, res) => { const w = window(req); await care.detectShifts({ marshalId: uid(req) }, w.from, w.to); res.json({ success: true, ...(await care.shifts({ marshalId: uid(req) }, w.from, w.to)) }); }));
  router.post("/shifts", body, h(async (req, res) => { reply(res, await care.addShift(uid(req), req.body ?? {}), 201); }));
  router.put("/shifts/:id", body, h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid shift"); return; } reply(res, await care.correctShift(uid(req), req.params.id, req.body ?? {})); }));
  router.post("/incidents", body, h(async (req, res) => { reply(res, await care.reportIncident(uid(req), req.body ?? {}), 201); }));
  router.get("/incidents", h(async (req, res) => { res.json({ success: true, ...(await care.incidents({ marshalId: uid(req) })) }); }));
  router.post("/grievances", body, h(async (req, res) => { reply(res, await care.submitGrievance(uid(req), req.body ?? {}), 201); }));
  router.get("/grievances", h(async (req, res) => { res.json({ success: true, grievances: await care.grievances({ marshalId: uid(req) }) }); }));
  router.get("/benefits", h(async (req, res) => { res.json({ success: true, ...(await care.benefits(uid(req))) }); }));
  router.get("/work-record", h(async (req, res) => { res.json({ success: true, record: await care.workRecord(uid(req)) }); }));
  router.get("/income-letters", h(async (req, res) => { res.json({ success: true, letters: await care.letters(uid(req)) }); }));
  router.post("/income-letters", body, h(async (req, res) => { const r = await care.makeLetter(uid(req), req.body?.months); if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; } res.status(201).json({ success: true, letter: r.value }); }));
  router.get("/income-letters/:id.pdf", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid letter"); return; } const l = await care.renderLetter(uid(req), req.params.id); if (!l) { fail(res, 404, "Letter not found"); return; }
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="income-letter-${String(l.number)}.pdf"`); res.send(await care.letterPdf(l as never));
  }));
  router.get("/income-letters/:id", h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid letter"); return; } const l = await care.renderLetter(uid(req), req.params.id); if (!l) { fail(res, 404, "Letter not found"); return; } res.json({ success: true, letter: l }); }));
}

/* ───────────────────────── marshal care: the association's side ───────────────────────── */
function mountAssociationCare(router: Router, db: Db, now: () => Date): void {
  const { care } = services(db, now), body = json({ limit: "10kb" }), assoc = (req: Request) => uid(req);
  const window = (req: Request) => { const today = saDay(now()); return { from: queryDay(req, "from", addDays(today, -13)), to: queryDay(req, "to", today) }; };
  router.get("/shifts", h(async (req, res) => { const w = window(req); res.json({ success: true, ...(await care.shifts({ associationId: assoc(req) }, w.from, w.to)) }); }));
  router.post("/shifts/detect", body, h(async (req, res) => {
    const to = typeof req.body?.to === "string" && DAY.test(req.body.to) ? req.body.to : saDay(now()), from = typeof req.body?.from === "string" && DAY.test(req.body.from) ? req.body.from : addDays(to, -13);
    if (from > to) { fail(res, 400, "The start must not be after the end"); return; } res.json({ success: true, found: await care.detectShifts({ associationId: assoc(req) }, from, to) });
  }));
  router.post("/shifts/:id/decide", body, h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid shift"); return; } const r = await care.decideShift(assoc(req), req.params.id, uid(req), req.body?.decision); if (r.ok) await audit(db, req, "shift.decide", req.params.id, { decision: req.body?.decision }); reply(res, r); }));
  router.get("/incidents", h(async (req, res) => { const st = typeof req.query.status === "string" ? req.query.status : undefined; res.json({ success: true, ...(await care.incidents({ associationId: assoc(req) }, { ...(st ? { status: st } : {}), from: queryDay(req, "from", ""), to: queryDay(req, "to", "") })) }); }));
  router.get("/incidents/:id/photo", h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid report"); return; } const p = await care.incidentPhoto(assoc(req), req.params.id); if (!p) { fail(res, 404, "No photo"); return; } res.json({ success: true, photo: p }); }));
  router.post("/incidents/:id/ack", body, h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid report"); return; } const r = await care.acknowledgeIncident(assoc(req), req.params.id, uid(req), req.body?.status); if (r.ok) await audit(db, req, "incident.ack", req.params.id, { status: req.body?.status }); reply(res, r); }));
  router.get("/risk-map", h(async (req, res) => { const w = window(req); reply(res, await care.riskMap(assoc(req), w.from, w.to)); }));
  router.get("/grievances", h(async (req, res) => { res.json({ success: true, grievances: await care.grievances({ associationId: assoc(req) }, typeof req.query.status === "string" ? req.query.status : undefined) }); }));
  router.post("/grievances/:id/respond", body, h(async (req, res) => { if (!isUuid(req.params.id)) { fail(res, 400, "Invalid complaint"); return; } const r = await care.respondGrievance(assoc(req), req.params.id, uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "grievance.respond", req.params.id, { status: req.body?.status }); reply(res, r); }));
  router.get("/welfare-insights", h(async (req, res) => { const w = window(req); reply(res, await care.welfareInsights(assoc(req), w.from, w.to)); }));
  router.get("/benefits", h(async (req, res) => {
    const ms = (await db.query(`SELECT DISTINCT m.marshal_id, u.name FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id JOIN users u ON u.id = m.marshal_id WHERE r.association_id = $1 ORDER BY u.name`, [assoc(req)])).rows;
    res.json({ success: true, marshals: await Promise.all(ms.map(async (m) => ({ id: String(m.marshal_id), name: String(m.name), ...(await care.benefits(String(m.marshal_id), assoc(req))) }))) });
  }));
  router.put("/benefits", body, h(async (req, res) => { const r = await care.setBenefit(assoc(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "benefit.set", String(req.body?.marshalId), { kind: req.body?.kind, status: req.body?.status }); reply(res, r); }));
  router.get("/work-record/:marshalId", h(async (req, res) => {
    if (!isUuid(req.params.marshalId) || !(await db.query(`SELECT 1 AS x FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 AND r.association_id = $2`, [req.params.marshalId, assoc(req)])).rows.length) { fail(res, 404, "That marshal was not found"); return; }
    res.json({ success: true, record: await care.workRecord(req.params.marshalId, assoc(req)) });
  }));
  router.post("/income-letters/verify", body, h(async (req, res) => { reply(res, await care.verifyLetter(assoc(req), req.body?.number, req.body?.code)); }));
  const kpiArgs = (req: Request) => { const w = window(req), rankId = typeof req.query.rankId === "string" && isUuid(req.query.rankId) ? req.query.rankId : undefined, marshalId = typeof req.query.marshalId === "string" && isUuid(req.query.marshalId) ? req.query.marshalId : undefined; return { ...w, f: { ...(rankId ? { rankId } : {}), ...(marshalId ? { marshalId } : {}) } }; };
  router.get("/kpis", h(async (req, res) => { const k = kpiArgs(req); reply(res, await care.kpis(assoc(req), k.from, k.to, k.f), 200, "kpis"); }));
  router.get("/kpis.csv", h(async (req, res) => {
    const k = kpiArgs(req), r = await care.kpis(assoc(req), k.from, k.to, k.f); if (!r.ok) { fail(res, r.status, r.error); return; }
    sendCsv(res, `marshal-overview-${k.from}-to-${k.to}.csv`, ["Measure", "Value"], Object.entries(r.value).map(([key, v]) => [key, v === null ? "" : v as never]));
  }));
  router.get("/kpis.pdf", h(async (req, res) => {
    const k = kpiArgs(req), r = await care.kpis(assoc(req), k.from, k.to, k.f); if (!r.ok) { fail(res, r.status, r.error); return; }
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="marshal-overview-${k.from}-to-${k.to}.pdf"`); res.send(await care.kpisPdf(assoc(req), r.value));
  }));
  router.get("/patterns", h(async (req, res) => { res.json({ success: true, patterns: await care.patterns(assoc(req), saDay(now())) }); }));
}
