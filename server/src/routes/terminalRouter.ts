import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registerTerminal, authenticateTerminal } from "../services/terminalAuth.js";
import { calculateRevenueSplit } from "../services/revenueSplitService.js";
import { checkOffRoute } from "../services/routeGeofenceService.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();

// Confirmed fixed amount (2026-08-18) -- R50 per off-route violation.
const ROUTE_VIOLATION_FINE_AMOUNT = 50;

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

/**
 * A raw card number (PAN) is 13-19 consecutive digits. masked_pan should
 * never contain that -- it should look like "**** **** **** 4242" or
 * similar. This is a defensive backstop, not the only control: the real
 * control is that this route never expects or documents a field for a
 * full PAN in the first place. But if a field somehow contains something
 * PAN-shaped anyway (a misconfigured caller, a bug upstream), reject the
 * whole request outright rather than storing it.
 */
function containsUnmaskedPan(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digitsOnly = value.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digitsOnly);
}

/**
 * POST /api/terminal/register
 * Admin-only. Provisions a new physical terminal and returns its API key
 * exactly once -- the operator setting up the device must capture it now;
 * it cannot be retrieved again afterward (see terminalAuth.ts).
 */
router.post("/register", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { serial, model } = req.body as { serial?: string; model?: string };
  if (!serial || !serial.trim()) {
    res.status(400).json({ success: false, error: "serial is required" });
    return;
  }
  try {
    const result = await registerTerminal(serial.trim(), model?.trim() || "P18Q Bus Validator", req.user!.username);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err?.code === "23505") { // unique_violation on serial
      res.status(409).json({ success: false, error: "A terminal with this serial is already registered" });
      return;
    }
    console.error("[terminal] Registration failed:", err);
    res.status(500).json({ success: false, error: "Could not register terminal" });
  }
});

/**
 * POST /api/terminal/tap
 * Device-authenticated (serial + API key in headers), not user-JWT --
 * the caller is the physical terminal itself. Deliberately does NOT sit
 * behind requireAuth, same reasoning as vinkpayWebhook.ts.
 *
 * IMPORTANT: nothing calls this endpoint with real production data yet.
 * A real Deka EMV kernel is integrated on the device side (see
 * android/app/src/main/java/za/co/vink/app/terminal/P18QTerminalPlugin.java),
 * running on a reader chip (SCR916, confirmed to be the same chip in
 * the standard P18Q's built-in reader) that genuinely holds EMVCo
 * Level 1 and Visa/Mastercard Level 2 certification (the latter
 * conditional on SAM pairing, per the SDK's own FOL-SCR916.pdf). That
 * hardware certification is separate from the CAPK keys currently
 * loaded, which are still the vendor demo's test-only keys (EMVCo's
 * reserved test range, not Visa's production RID) -- this route is the
 * receiving end, built and ready for when real production CAPKs and an
 * acquirer relationship exist. It is not itself a payment terminal, and
 * does not simulate one.
 */
router.post("/tap", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { maskedPan, scheme, amount, currency, cardholderVerification, emvCryptogramRef } = req.body as {
    maskedPan?: string; scheme?: string; amount?: number; currency?: string;
    cardholderVerification?: string; emvCryptogramRef?: string;
  };

  // Defensive rejection -- see containsUnmaskedPan's own comment.
  for (const field of [maskedPan, emvCryptogramRef]) {
    if (containsUnmaskedPan(field)) {
      console.error(`[terminal] Rejected tap from terminal ${serial}: a field contained what looks like an unmasked card number`);
      res.status(400).json({ success: false, error: "Request rejected: field contains an unmasked card number, which this endpoint must never receive" });
      return;
    }
  }

  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ success: false, error: "amount must be a positive number" });
    return;
  }

  // Multi-party revenue split -- corrected model (2026-08-18): VINK's
  // flat R1.00 fee (two named halves) comes off first. The driver's
  // pay is a fixed amount privately agreed with the owner and is NOT
  // calculated here at all. The investor gets 10% of VINK's fee
  // specifically (R0.10/tap), not 10% of the fare. The owner gets
  // everything else. See revenueSplitService.ts for the full
  // reasoning, including the feeExceedsFare edge case for a fare too
  // small to cover VINK's fee.
  const split = calculateRevenueSplit(amount);
  if (split.feeExceedsFare) {
    console.error(`[terminal] Tap from terminal ${serial}: fare ${amount} is below VINK's flat fee (${split.vinkFeeTotal}) -- owner/investor amounts are zero for this tap`);
  }

  const { rows } = await pool.query(
    `INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, emv_cryptogram_ref, vink_fee_device, vink_fee_card, owner_settlement, investor_share)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, received_at`,
    [auth.terminalId, maskedPan ?? null, scheme ?? null, amount, currency ?? "ZAR", cardholderVerification ?? null, emvCryptogramRef ?? null,
     split.vinkFeeDevice, split.vinkFeeCard, split.ownerSettlement, split.investorShare]
  );

  const tap = rows[0];
  emit("terminal.tap_received", { tapId: tap.id, terminalId: auth.terminalId, amount, currency: currency ?? "ZAR", split });

  // What happens next -- actually settling this tap through VinkPay's
  // existing submitOrderPayment/handleWebhook flow -- is deliberately not
  // wired here yet. A tap event and a payment submission are two
  // different things (this table records that a card was presented; an
  // actual charge needs an order to charge against), and building that
  // link out is the next real step once there's a genuine EMV kernel
  // producing genuine tap events to link. The revenue split calculated
  // here is real and persisted, but crediting it into an actual
  // investor/owner/driver wallet balance is a further step, not yet
  // built -- this endpoint records the correct split amounts, it does
  // not yet move money into any account.
  res.status(201).json({ success: true, data: { tapId: tap.id, receivedAt: tap.received_at, status: "received", split } });
});

/**
 * GET /api/terminal/taps
 * Reviewer-facing list of recent taps, for the same dashboards that
 * already show device activity (Owner/Investor/Taxi Association fleet
 * dashboards) once this is wired up to real hardware.
 */
router.get("/taps", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(
    `SELECT t.*, term.serial AS terminal_serial FROM terminal_taps t
     JOIN terminals term ON term.id = t.terminal_id
     ORDER BY t.received_at DESC LIMIT 200`
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/terminal/terminals
 * Reviewer-facing list of registered terminals.
 */
router.get("/terminals", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT id, serial, model, status, assigned_driver, investor_id, owner_id, driver_id, association_id, last_seen_at, registered_at FROM terminals ORDER BY registered_at DESC`);
  res.json({ success: true, data: rows });
});

/**
 * PATCH /api/terminal/terminals/:id
 * Admin-only. Two things this endpoint does, both real:
 * 1. Status is the access-control lever, not a decorative field:
 *    authenticateTerminal() (terminalAuth.ts) already rejects any
 *    request where status !== 'active', so setting a terminal to
 *    'inactive' or 'revoked' here immediately blocks every subsequent
 *    POST /api/terminal/tap call from that physical device, regardless
 *    of whether its API key is still technically valid.
 * 2. Assigning investorId/ownerId/driverId/associationId is what makes
 *    the multi-party revenue split in POST /tap possible at all --
 *    without these set, a tap's split is calculated but has no real
 *    account to credit (authenticateTerminal() returns null for any
 *    unassigned party). This is the actual provisioning step: register
 *    a terminal, then assign it here before real revenue splitting can
 *    happen for it.
 */
router.patch("/terminals/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, assignedDriver, investorId, ownerId, driverId, associationId } = req.body as {
    status?: string; assignedDriver?: string; investorId?: string; ownerId?: string; driverId?: string; associationId?: string;
  };
  if (status && !["active", "inactive", "revoked"].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'active', 'inactive', or 'revoked'" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE terminals SET
       status = COALESCE($1, status),
       assigned_driver = COALESCE($2, assigned_driver),
       investor_id = COALESCE($3, investor_id),
       owner_id = COALESCE($4, owner_id),
       driver_id = COALESCE($5, driver_id),
       association_id = COALESCE($6, association_id)
     WHERE id = $7
     RETURNING id, serial, model, status, assigned_driver, investor_id, owner_id, driver_id, association_id, last_seen_at, registered_at`,
    [status ?? null, assignedDriver ?? null, investorId ?? null, ownerId ?? null, driverId ?? null, associationId ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Terminal not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * POST /api/terminal/position
 * Device-authenticated, same pattern as /tap -- a GPS position report
 * is a different event type from the same physical device, not a
 * payment event. Checks the reported position against the terminal's
 * currently active route (if any), and if off-route by more than the
 * route's tolerance, records a violation and posts a real R50 fine to
 * the driver's ledger -- but only if the terminal actually has a
 * driver_id assigned (see authenticateTerminal()); a violation is
 * still recorded either way, but a fine can't be posted to nobody.
 */
router.post("/position", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number" || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ success: false, error: "lat/lng must be valid numbers within real coordinate ranges" });
    return;
  }

  const posResult = await pool.query(
    `INSERT INTO vehicle_positions (terminal_id, lat, lng) VALUES ($1, $2, $3) RETURNING id`,
    [auth.terminalId, lat, lng]
  );
  const positionId = posResult.rows[0].id;

  const routeResult = await pool.query(
    `SELECT id, tolerance_meters FROM vehicle_routes WHERE terminal_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1`,
    [auth.terminalId]
  );

  if (!routeResult.rows.length) {
    // No active route assigned -- position recorded, nothing to check against.
    res.status(201).json({ success: true, data: { positionId, routeChecked: false } });
    return;
  }

  const route = routeResult.rows[0];
  const waypointsResult = await pool.query(
    `SELECT lat, lng FROM route_waypoints WHERE route_id = $1 ORDER BY sequence ASC`,
    [route.id]
  );
  if (!waypointsResult.rows.length) {
    // A route exists but has no waypoints -- nothing to check against, but this is worth logging since it likely means the route was set up incompletely.
    console.error(`[terminal] Terminal ${serial}'s active route ${route.id} has no waypoints -- cannot check position against it`);
    res.status(201).json({ success: true, data: { positionId, routeChecked: false } });
    return;
  }

  const waypoints = waypointsResult.rows.map((w: { lat: string; lng: string }) => ({ lat: Number(w.lat), lng: Number(w.lng) }));
  const offRoute = checkOffRoute({ lat, lng }, waypoints, Number(route.tolerance_meters));

  if (!offRoute.isOffRoute) {
    res.status(201).json({ success: true, data: { positionId, routeChecked: true, isOffRoute: false, distanceFromRouteM: offRoute.distanceFromRouteM } });
    return;
  }

  const violationResult = await pool.query(
    `INSERT INTO route_violations (terminal_id, route_id, position_id, distance_from_route_m, fine_amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [auth.terminalId, route.id, positionId, offRoute.distanceFromRouteM, ROUTE_VIOLATION_FINE_AMOUNT]
  );
  const violationId = violationResult.rows[0].id;

  let fineLedgerId: string | null = null;
  if (auth.driverId) {
    const balanceResult = await pool.query(
      `SELECT balance_after FROM driver_ledger WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [auth.driverId]
    );
    const currentBalance = balanceResult.rows.length ? Number(balanceResult.rows[0].balance_after) : 0;
    const newBalance = +(currentBalance - ROUTE_VIOLATION_FINE_AMOUNT).toFixed(2);
    const ledgerResult = await pool.query(
      `INSERT INTO driver_ledger (driver_id, entry_type, amount, balance_after, reference_id, description)
       VALUES ($1, 'fine', $2, $3, $4, $5) RETURNING id`,
      [auth.driverId, -ROUTE_VIOLATION_FINE_AMOUNT, newBalance, violationId, `Off-route violation -- ${offRoute.distanceFromRouteM}m from assigned route (tolerance ${route.tolerance_meters}m)`]
    );
    fineLedgerId = ledgerResult.rows[0].id;
  } else {
    console.error(`[terminal] Off-route violation on terminal ${serial} but no driver_id assigned -- violation recorded, no fine posted`);
  }

  emit("route.violation", { violationId, terminalId: auth.terminalId, distanceFromRouteM: offRoute.distanceFromRouteM, fineAmount: ROUTE_VIOLATION_FINE_AMOUNT, finePosted: !!fineLedgerId });

  res.status(201).json({
    success: true,
    data: { positionId, routeChecked: true, isOffRoute: true, distanceFromRouteM: offRoute.distanceFromRouteM, violationId, fineAmount: ROUTE_VIOLATION_FINE_AMOUNT, finePosted: !!fineLedgerId },
  });
});

export default router;
