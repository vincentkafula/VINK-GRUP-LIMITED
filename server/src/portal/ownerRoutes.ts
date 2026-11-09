import { mountOwnerDriverPay } from "./ownerDriverPayRoutes.js";
import { mountOwnerAssociation } from "./ownerAssociationRoutes.js";
import { mountOwnerCompliance } from "./ownerComplianceRoutes.js";
import { mountOwnerFiles, type FileDeps } from "./ownerFilesRoutes.js";
import { mountOwnerFinance } from "./ownerFinanceRoutes.js";
import { mountOwnerTeam } from "./ownerTeamRoutes.js";
import { mountOwnerAudit } from "./ownerAuditRoutes.js";
import { mountOwnerSms, type SmsDeps } from "./ownerSmsRoutes.js";
import { mountOwnerWhatsapp } from "./ownerWhatsappRoutes.js";
import { createOwnerCompliance } from "../services/ownerCompliance.js";
import { gatherAttention, attentionKey, attentionTitle, type AttentionKind } from "../services/ownerAttention.js";
import { teamCanRead, type TeamRole, type TeamModule } from "../services/ownerTeam.js";
import { createCompliance } from "../services/compliance.js";
import { Router, json, type Request } from "express";
import { h, uid, num, iso, dateOnly, isUuid, text, optText, validDate, fail, findUserByEmail, readKeys, markKeys, isUniqueViolation, audit, bucketDays, rangeParams, saDay, sendCsv, type Db } from "./common.js";
import { saPeriods, expiryReminders } from "./driverRoutes.js";
import { requestLink } from "./linkRoutes.js";
import { loadMap } from "./mapData.js";
import { createRankSessions, ONLINE_WITHIN_MS } from "./rankSessions.js";
import { createLoadingReports } from "./loadingReports.js";
import { createCommission, sessionClosedHook } from "../services/commission.js";

/**
 * The Owner Dashboard API, mounted at /api/portal/owner (vehicle owners only). An owner sees and changes only their own records.
 *
 *   GET/POST /vehicles, PUT /vehicles/:id, PUT /vehicles/:id/driver     the owner's vehicles and who drives them
 *   GET/POST /drivers, POST /drivers/:id/remove                        the owner's drivers (two-sided: the driver has to accept)
 *   GET /earnings                                                       fares collected on the owner's vehicles, and the owner's share
 *   GET /reports                                                        per-vehicle figures for this month
 *   GET/POST /documents, POST /documents/:id/delete                     compliance documents (details and expiry dates only)
 *   GET /notifications, POST /notifications/read                        expiry reminders (documents, licence discs)
 */
const REG = /^[A-Za-z0-9 -]{2,15}$/;

function cleanVehicle(b: Record<string, unknown>): { error: string } | { v: { registration: string; make: string | null; model: string | null; year: number | null; colour: string | null; seats: number | null; disc_expiry: string | null } } {
  const registration = typeof b.registration === "string" ? b.registration.trim().toUpperCase() : "";
  if (!REG.test(registration)) return { error: "Registration must be 2 to 15 letters, numbers, spaces or dashes" };
  const make = optText(b.make, 40), model = optText(b.model, 40), colour = optText(b.colour, 30);
  if (make === undefined || model === undefined || colour === undefined) return { error: "Make, model or colour is too long" };
  const intField = (k: string, lo: number, hi: number): number | null | undefined => {
    const v = b[k]; if (v === undefined || v === null || v === "") return null;
    const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
  };
  const year = intField("year", 1950, 2100), seats = intField("seats", 1, 100);
  if (year === undefined) return { error: "Year is not valid" };
  if (seats === undefined) return { error: "Seats must be a whole number from 1 to 100" };
  const disc = b.disc_expiry === undefined || b.disc_expiry === null || b.disc_expiry === "" ? null : b.disc_expiry;
  if (disc !== null && !validDate(disc)) return { error: "Licence disc expiry must be a date like 2027-03-31" };
  return { v: { registration, make, model, year, colour, seats, disc_expiry: disc as string | null } };
}

export function createOwnerRouter(db: Db, now: () => Date = () => new Date(), onSessionClosed?: (sessionId: string) => Promise<unknown>, fileDeps?: FileDeps, smsDeps?: SmsDeps): Router {
  const router = Router();

  router.get("/", (req, res) => { res.json({ success: true, role: "vehicle_owner", user: { id: uid(req), username: req.user!.username } }); });

  /* ───── vehicles ───── */
  router.get("/vehicles", h(async (req, res) => {
    const r = await db.query(
      `SELECT v.id, v.registration, v.make, v.model, v.year, v.colour, v.seats, v.disc_expiry, v.driver_id, u.name AS driver_name
         FROM vehicles v LEFT JOIN users u ON u.id = v.driver_id WHERE v.owner_id = $1 ORDER BY v.registration`, [uid(req)]);
    res.json({ success: true, vehicles: r.rows.map((x) => ({ id: x.id, registration: x.registration, make: x.make ?? null, model: x.model ?? null, year: x.year ?? null, colour: x.colour ?? null, seats: x.seats ?? null, discExpiry: dateOnly(x.disc_expiry), driverId: x.driver_id ?? null, driverName: x.driver_name ?? null })) });
  }));

  router.post("/vehicles", json({ limit: "10kb" }), h(async (req, res) => {
    const c = cleanVehicle(req.body ?? {});
    if ("error" in c) { fail(res, 400, c.error); return; }
    const v = c.v;
    try {
      const r = await db.query(`INSERT INTO vehicles (owner_id, registration, make, model, year, colour, seats, disc_expiry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [uid(req), v.registration, v.make, v.model, v.year, v.colour, v.seats, v.disc_expiry]);
      res.status(201).json({ success: true, id: r.rows[0].id });
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "A vehicle with that registration already exists"); return; } throw e; }
  }));

  router.put("/vehicles/:id", json({ limit: "10kb" }), h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid vehicle id"); return; }
    const c = cleanVehicle(req.body ?? {});
    if ("error" in c) { fail(res, 400, c.error); return; }
    const v = c.v;
    try {
      const r = await db.query(`UPDATE vehicles SET registration=$3, make=$4, model=$5, year=$6, colour=$7, seats=$8, disc_expiry=$9 WHERE id = $1 AND owner_id = $2 RETURNING id`,
        [req.params.id, uid(req), v.registration, v.make, v.model, v.year, v.colour, v.seats, v.disc_expiry]);
      if (!r.rows.length) { fail(res, 404, "Vehicle not found"); return; }
      res.json({ success: true });
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "A vehicle with that registration already exists"); return; } throw e; }
  }));

  /** Put one of MY active drivers on one of MY vehicles (or take the driver off with driverId: null). */
  router.put("/vehicles/:id/driver", json({ limit: "5kb" }), h(async (req, res) => {
    const me = uid(req), driverId = req.body?.driverId ?? null;
    if (!isUuid(req.params.id) || (driverId !== null && !isUuid(driverId))) { fail(res, 400, "Invalid id"); return; }
    if (driverId !== null) {
      const ok = (await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2 AND status = 'active'`, [me, driverId])).rows.length;
      if (!ok) { fail(res, 400, "That person is not one of your active drivers"); return; }
    }
    if (driverId !== null) { const block = await createCompliance(db).assignmentBlock(me, driverId); if (block) { fail(res, 409, block); return; } }      // an association that has switched it on does not allow a driver without a valid permit
    const r = await db.query(`UPDATE vehicles SET driver_id = $3 WHERE id = $1 AND owner_id = $2 RETURNING id`, [req.params.id, me, driverId]);
    if (!r.rows.length) { fail(res, 404, "Vehicle not found"); return; }
    await audit(db, req, "owner.vehicle.driver", req.params.id, { driverId });
    res.json({ success: true });
  }));

  /* ───── drivers ───── */
  router.get("/drivers", h(async (req, res) => {
    const r = await db.query(
      `SELECT o.id, o.status, o.requested_by, o.created_at, u.id AS driver_id, u.name, u.email
         FROM owner_drivers o JOIN users u ON u.id = o.driver_id WHERE o.owner_id = $1 AND o.status IN ('active','pending') ORDER BY o.created_at DESC`, [uid(req)]);
    const vehicles = (await db.query(`SELECT registration, driver_id FROM vehicles WHERE owner_id = $1 AND driver_id IS NOT NULL`, [uid(req)])).rows;
    res.json({ success: true, drivers: r.rows.map((x) => ({ linkId: x.id, driverId: x.driver_id, name: x.name, email: x.email, status: x.status, requestedBy: x.requested_by, since: iso(x.created_at), vehicles: vehicles.filter((v) => v.driver_id === x.driver_id).map((v) => v.registration) })) });
  }));

  router.post("/drivers", json({ limit: "5kb" }), h(async (req, res) => {
    const target = await findUserByEmail(db, req.body?.email);
    if (!target || target.role !== "driver") { fail(res, 404, "No driver account was found with that email"); return; }
    const ok = await requestLink(db, "owner_drivers", { a: "owner_id", b: "driver_id", requested: "owner" }, uid(req), target.id);
    if (!ok) { fail(res, 409, "You already have a link or a pending request with this driver"); return; }
    res.status(201).json({ success: true, message: `Request sent to ${target.name}. They have to accept it.` });
  }));

  router.post("/drivers/:id/remove", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`UPDATE owner_drivers SET status = 'removed', responded_at = now() WHERE id = $1 AND owner_id = $2 AND status IN ('active','pending') RETURNING driver_id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Driver link not found"); return; }
    await db.query(`UPDATE vehicles SET driver_id = NULL WHERE owner_id = $1 AND driver_id = $2`, [uid(req), r.rows[0].driver_id]);   // a removed driver comes off the vehicles
    await audit(db, req, "owner.driver.remove", req.params.id);
    res.json({ success: true });
  }));

  /* ───── the owner's own card devices ───── */
  // A device the owner has bought is assigned to them by VINK. The owner fits it to one of their own vehicles and says which route (and so which fare) it charges. The driver then taps their own driver card
  // on it to start a trip: no marshal and no rank pairing, but the money and the trip are still the tapping driver's. Shared rank devices are not the owner's to change.
  router.get("/devices", h(async (req, res) => {
    const r = await db.query(
      `SELECT t.id, t.serial, t.model, t.status, t.kind, t.vehicle_id, t.route_id, t.last_seen_at, v.registration, tr.name AS route_name, tr.fare_cents
         FROM terminals t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN token_routes tr ON tr.id = t.route_id WHERE t.owner_id = $1 ORDER BY t.serial`, [uid(req)]);
    const open = (await db.query(`SELECT s.id, s.terminal_id, s.passengers, s.total_cents, s.paired_at, u.name AS driver_name FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id LEFT JOIN users u ON u.id = s.driver_id WHERE v.owner_id = $1 AND s.status IN ('pending','loading')`, [uid(req)])).rows;
    res.json({ success: true, devices: r.rows.map((d) => { const s = open.find((x) => String(x.terminal_id) === String(d.id)); return {
      id: d.id, serial: d.serial, model: d.model ?? null, status: d.status, shared: d.kind === "rank", vehicleId: d.vehicle_id ?? null, registration: d.registration ?? null, routeId: d.route_id ?? null, route: d.route_name ?? null, fareCents: d.fare_cents === null || d.fare_cents === undefined ? null : Number(d.fare_cents),
      online: !!d.last_seen_at && now().getTime() - new Date(d.last_seen_at as string).getTime() <= ONLINE_WITHIN_MS,
      session: s ? { id: s.id, driver: s.driver_name ?? null, passengers: Number(s.passengers), totalCents: Number(s.total_cents), pairedAt: iso(s.paired_at) } : null }; }) });
  }));
  router.put("/devices/:id", json({ limit: "5kb" }), h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid device"); return; }
    const { vehicleId, routeId } = req.body ?? {};
    const dev = (await db.query(`SELECT id, serial, kind, owner_id, association_id FROM terminals WHERE id = $1 AND owner_id = $2`, [req.params.id, uid(req)])).rows[0];
    if (!dev) { fail(res, 404, "Device not found"); return; }
    if (dev.kind === "rank") { fail(res, 409, "That is a shared rank device. Your association sets those up."); return; }
    if ((await db.query(`SELECT 1 AS x FROM loading_sessions WHERE terminal_id = $1 AND status IN ('pending','loading')`, [dev.id])).rows.length) { fail(res, 409, "A driver is loading on that device right now. End the trip first."); return; }
    if (vehicleId === null) {                                                                           // take it off the vehicle
      await db.query(`UPDATE terminals SET vehicle_id = NULL, route_id = NULL WHERE id = $1`, [dev.id]); await audit(db, req, "owner.device_detach", String(dev.id), {}); res.json({ success: true }); return;
    }
    if (!isUuid(vehicleId)) { fail(res, 400, "Choose one of your vehicles"); return; }
    if (!isUuid(routeId)) { fail(res, 400, "Choose the route this device charges for"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM vehicles WHERE id = $1 AND owner_id = $2`, [vehicleId, uid(req)])).rows.length) { fail(res, 404, "Vehicle not found"); return; }
    if ((await db.query(`SELECT 1 AS x FROM terminals WHERE vehicle_id = $1 AND id <> $2 AND status = 'active'`, [vehicleId, dev.id])).rows.length) { fail(res, 409, "That vehicle already has a device fitted"); return; }
    const route = (await db.query(`SELECT id, association_id FROM token_routes WHERE id = $1 AND active = true`, [routeId])).rows[0];
    if (!route) { fail(res, 404, "Route not found"); return; }
    if (route.association_id && dev.association_id && String(route.association_id) !== String(dev.association_id)) { fail(res, 400, "That route belongs to a different association from this device"); return; }
    await db.query(`UPDATE terminals SET kind = 'vehicle', vehicle_id = $2, route_id = $3 WHERE id = $1`, [dev.id, vehicleId, routeId]);
    await audit(db, req, "owner.device_attach", String(dev.id), { vehicleId, routeId });
    res.json({ success: true });
  }));
  createLoadingReports(db).mount(router, "owner", now);                                // what loads on their vehicles collected: per load, driver, vehicle or route
  /** End a trip on one of the owner's own vehicles, for a driver who forgot to or has left. */
  router.post("/loading/:sid/end", h(async (req, res) => {
    if (!isUuid(req.params.sid)) { fail(res, 400, "Invalid session"); return; }
    const r = await createRankSessions(db, now, undefined, { onClosed: sessionClosedHook(createCommission(db, now), onSessionClosed) }).endByOwner({ ownerId: uid(req), sessionId: req.params.sid, actorName: req.user!.username });
    if (!r.ok) { res.status(r.status).json({ success: false, error: r.message, code: r.code }); return; }
    res.json({ success: true, session: r.value });
  }));

  /* ───── earnings and reports (taps on terminals fitted to the owner's vehicles, or assigned to the owner) ───── */
  const OWNED = `(t.owner_id = $1 OR v.owner_id = $1)`;
  router.get("/earnings", h(async (req, res) => {
    const p = saPeriods(now());
    const sum = async (from: Date) => {
      const r = (await db.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(k.amount), 0) AS fares, COALESCE(SUM(k.owner_settlement), 0) AS share
           FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
          WHERE ${OWNED} AND k.status = 'confirmed' AND k.received_at >= $2`, [uid(req), from])).rows[0];
      return { count: num(r?.n), fares: num(r?.fares), ownerShare: num(r?.share) };
    };
    res.json({ success: true, currency: "ZAR", today: await sum(p.day), week: await sum(p.week), month: await sum(p.month) });
  }));

  router.get("/reports", h(async (req, res) => {
    const p = saPeriods(now());
    const perVehicle = await db.query(
      `SELECT v.registration, COUNT(k.id) AS n, COALESCE(SUM(k.amount), 0) AS fares, COALESCE(SUM(k.owner_settlement), 0) AS share
         FROM vehicles v
         LEFT JOIN terminals t ON t.vehicle_id = v.id
         LEFT JOIN terminal_taps k ON k.terminal_id = t.id AND k.status = 'confirmed' AND k.received_at >= $2
        WHERE v.owner_id = $1 GROUP BY v.registration ORDER BY v.registration`, [uid(req), p.month]);
    const fines = (await db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(rv.fine_amount), 0) AS total
         FROM route_violations rv JOIN terminals t ON t.id = rv.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE ${OWNED} AND rv.created_at >= $2`, [uid(req), p.month])).rows[0];
    res.json({ success: true, currency: "ZAR", month: { vehicles: perVehicle.rows.map((x) => ({ registration: x.registration, fares: num(x.fares), ownerShare: num(x.share), count: num(x.n) })), fines: { count: num(fines?.n), total: num(fines?.total) } } });
  }));

  /* ───── routes and map: the routes recorded for my vehicles' terminals, and where each vehicle last reported from ───── */
  router.get("/map", h(async (req, res) => {
    res.json({ success: true, ...(await loadMap(db, OWNED, OWNED, [uid(req)])) });
  }));

  /** Confirmed fares and my share per day (default last 14 days), zero-filled, for the trend chart. */
  router.get("/trend", h(async (req, res) => {
    const range = rangeParams(req, now(), 14);
    if ("error" in range) { fail(res, 400, range.error); return; }
    const rows = (await db.query(
      `SELECT k.amount, k.owner_settlement, k.received_at FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE ${OWNED} AND k.status = 'confirmed' AND k.received_at >= $2 AND k.received_at < $3 LIMIT 50000`, [uid(req), range.from, range.toExclusive])).rows;
    res.json({
      success: true, currency: "ZAR",
      days: bucketDays(rows.map((x) => ({ at: x.received_at, value: num(x.amount) })), range.from, range.toExclusive),
      share: bucketDays(rows.map((x) => ({ at: x.received_at, value: num(x.owner_settlement) })), range.from, range.toExclusive).map((d) => d.value),
    });
  }));

  /**
   * A summary of the money recorded for my vehicles over a period (default: this month so far): fares collected, what the split left for
   * the owner, the platform's fees, the investor's share, route fines, and the levies associations charged me. Every figure is read from
   * recorded transactions; it is not an audited financial statement and not tax advice.
   */
  async function statement(req: Request) {
    const range = rangeParams(req, now(), 31, saDay(now()).slice(0, 8) + "01");
    if ("error" in range) return range;
    const taps = (await db.query(
      `SELECT k.amount, k.owner_settlement, k.vink_fee_device, k.vink_fee_card, k.investor_share, k.received_at FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE ${OWNED} AND k.status = 'confirmed' AND k.received_at >= $2 AND k.received_at < $3 ORDER BY k.received_at LIMIT 50000`, [uid(req), range.from, range.toExclusive])).rows;
    const round = (n: number) => Math.round(n * 100) / 100;
    const sum = (f: (x: Record<string, unknown>) => number) => round(taps.reduce((a, x) => a + f(x), 0));
    const fares = bucketDays(taps.map((x) => ({ at: x.received_at, value: num(x.amount) })), range.from, range.toExclusive);
    const share = bucketDays(taps.map((x) => ({ at: x.received_at, value: num(x.owner_settlement) })), range.from, range.toExclusive);
    const days = fares.map((d, i) => ({ day: d.day, fares: d.count, collected: d.value, ownerShare: share[i].value })).filter((d) => d.fares > 0);
    const fines = (await db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(rv.fine_amount), 0) AS total FROM route_violations rv JOIN terminals t ON t.id = rv.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE ${OWNED} AND rv.created_at >= $2 AND rv.created_at < $3`, [uid(req), range.from, range.toExclusive])).rows[0];
    const levies = (await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS charged, COALESCE(SUM(CASE WHEN paid_at IS NULL THEN 0 ELSE amount END), 0) AS paid
         FROM levies WHERE member_id = $1 AND created_at >= $2 AND created_at < $3`, [uid(req), range.from, range.toExclusive])).rows[0];
    return {
      range, days,
      totals: {
        fares: taps.length, collected: sum((x) => num(x.amount)), ownerShare: sum((x) => num(x.owner_settlement)),
        platformFees: sum((x) => num(x.vink_fee_device) + num(x.vink_fee_card)), investorShare: sum((x) => num(x.investor_share)),
        fines: { count: num(fines?.n), total: round(num(fines?.total)) }, levies: { charged: round(num(levies?.charged)), paid: round(num(levies?.paid)) },
      },
    };
  }
  router.get("/statements", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    res.json({ success: true, currency: "ZAR", from: st.range.fromDay, to: st.range.toDay, days: st.days, totals: st.totals });
  }));
  router.get("/statements.csv", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    await audit(db, req, "owner.export.statement", null, { from: st.range.fromDay, to: st.range.toDay });
    const t = st.totals;
    sendCsv(res, `owner-summary-${st.range.fromDay}-to-${st.range.toDay}.csv`, ["Date", "Fares", "Fares collected (ZAR)", "Owner share (ZAR)"],
      [...st.days.map((d) => [d.day, d.fares, d.collected, d.ownerShare]),
        ["TOTAL", t.fares, t.collected, t.ownerShare], ["Platform fees", "", "", t.platformFees], ["Investor share", "", "", t.investorShare],
        ["Route fines", t.fines.count, "", t.fines.total], ["Levies charged", "", "", t.levies.charged], ["Levies paid", "", "", t.levies.paid]]);
  }));

  /* ───── compliance documents ───── */
  router.get("/documents", h(async (req, res) => {
    const r = await db.query(`SELECT d.id, d.kind, d.reference, d.expires_on, d.vehicle_id, v.registration FROM compliance_documents d LEFT JOIN vehicles v ON v.id = d.vehicle_id WHERE d.owner_id = $1 ORDER BY d.expires_on, d.created_at`, [uid(req)]);
    res.json({ success: true, documents: r.rows.map((x) => ({ id: x.id, kind: x.kind, reference: x.reference ?? null, expiresOn: dateOnly(x.expires_on), vehicleId: x.vehicle_id ?? null, vehicle: x.registration ?? null })) });
  }));

  router.post("/documents", json({ limit: "10kb" }), h(async (req, res) => {
    const b = req.body ?? {}, kind = text(b.kind, 60), reference = optText(b.reference, 60);
    if (!kind) { fail(res, 400, "What kind of document is it? (for example Operating licence)"); return; }
    if (reference === undefined) { fail(res, 400, "Reference is too long"); return; }
    const expires = b.expires_on === undefined || b.expires_on === null || b.expires_on === "" ? null : b.expires_on;
    if (expires !== null && !validDate(expires)) { fail(res, 400, "Expiry must be a date like 2027-03-31"); return; }
    let vehicleId: string | null = null;
    if (b.vehicle_id) {
      if (!isUuid(b.vehicle_id) || !(await db.query(`SELECT 1 AS x FROM vehicles WHERE id = $1 AND owner_id = $2`, [b.vehicle_id, uid(req)])).rows.length) { fail(res, 400, "That vehicle is not one of yours"); return; }
      vehicleId = b.vehicle_id;
    }
    const r = await db.query(`INSERT INTO compliance_documents (owner_id, vehicle_id, kind, reference, expires_on) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [uid(req), vehicleId, kind, reference, expires]);
    res.status(201).json({ success: true, id: r.rows[0].id });
  }));

  router.post("/documents/:id/delete", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`DELETE FROM compliance_documents WHERE id = $1 AND owner_id = $2 RETURNING id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Document not found"); return; }
    res.json({ success: true });
  }));

  /* ───── notifications ───── */
  router.get("/notifications", h(async (req, res) => {
    const docs = (await db.query(`SELECT id, kind, expires_on FROM compliance_documents WHERE owner_id = $1`, [uid(req)])).rows;
    const discs = (await db.query(`SELECT registration, disc_expiry FROM vehicles WHERE owner_id = $1`, [uid(req)])).rows;
    const items = expiryReminders([
      ...docs.map((d) => ({ key: `doc-${d.id}`, kind: "licence" as const, label: String(d.kind), date: dateOnly(d.expires_on) })),
      ...discs.map((v) => ({ key: `disc-${v.registration}`, kind: "disc" as const, label: `Licence disc for ${v.registration}`, date: dateOnly(v.disc_expiry) })),
    ], now()).map((r) => ({ key: r.key, kind: r.kind, title: r.title, body: r.body, at: r.date + "T00:00:00.000Z" }));
    // The compliance centre's reminders (licence, roadworthy, insurance, driver licence, PrDP) at the days the owner chose, one per band. The disc is already above.
    for (const r of (await createOwnerCompliance(db, now).centre(uid(req))).reminders.filter((x) => !x.itemKey.startsWith("disc:"))) items.push({ key: r.key, kind: r.itemKey.startsWith("prdp:") ? "pdp" : "licence", title: r.title, body: r.daysLeft < 0 ? `It expired on ${r.expiresOn}. Please renew it.` : `Expiry date: ${r.expiresOn}.`, at: `${r.expiresOn}T00:00:00.000Z` });
    // What needs the owner beyond expiries: the money, servicing and driver-payment alerts the dashboard and the text messages also show, so the three never disagree. Each is included only if this person's role may see that part (a fleet manager gets servicing and fines and driver payments, an accountant the money, the owner everything).
    const role = (req as unknown as { ownerRole?: TeamRole }).ownerRole ?? null, can = (m: TeamModule) => teamCanRead(role, m), kinds: AttentionKind[] = [];
    if (can("finance") || can("costs")) kinds.push("finance"); if (can("costs")) kinds.push("service"); if (can("driverpay")) kinds.push("arrears");
    const today = saDay(now()), mine = (id: string) => (id.startsWith("fin:") || id.startsWith("pl:") ? can("finance") : id.startsWith("fines:") || id.startsWith("mnt:") ? can("costs") : id.startsWith("pay:") ? can("driverpay") : false);
    const alerts = kinds.length ? (await gatherAttention(db, now, uid(req), kinds, today)).filter((x) => mine(x.id)).map((x) => ({ key: attentionKey(x), kind: "alert" as string, title: attentionTitle(x.id), body: x.message, at: `${today}T00:00:00.000Z` })) : [];
    const everything = [...items, ...alerts], read = await readKeys(db, uid(req));
    everything.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ success: true, notifications: everything.map((i) => ({ ...i, read: read.has(i.key) })), unread: everything.filter((i) => !read.has(i.key)).length });
  }));
  router.post("/notifications/read", json({ limit: "10kb" }), h(async (req, res) => { res.json({ success: true, marked: await markKeys(db, uid(req), req.body?.keys) }); }));

  mountOwnerWhatsapp(router, db, now);                                                      // the owner's WhatsApp alerts (the owner's own login only)
  mountOwnerSms(router, db, now, smsDeps);                                               // the owner's text alerts (the owner's own login only)
  mountOwnerAudit(router, db, now);                                                      // the owner's activity log (read only)
  mountOwnerTeam(router, db, now);                                                       // the owner's team: their own logins and roles
  mountOwnerFinance(router, db, now);                                                    // the owner's costs, loans, maintenance and profit
  mountOwnerFiles(router, db, now, fileDeps);                                            // the owner's documents, stored encrypted
  mountOwnerCompliance(router, db, now);                                                 // the licence and compliance centre
  mountOwnerAssociation(router, db, now);                                                // the owner's association: profile, statement, receipts, "I have paid"
  mountOwnerDriverPay(router, db, now);                                                  // what each driver owes, what was paid, and where it is earmarked (docs/OWNER_DASHBOARD.md)
  return router;
}
