import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registerTerminal, authenticateTerminal } from "../services/terminalAuth.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();

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

  const { rows } = await pool.query(
    `INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, emv_cryptogram_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, received_at`,
    [auth.terminalId, maskedPan ?? null, scheme ?? null, amount, currency ?? "ZAR", cardholderVerification ?? null, emvCryptogramRef ?? null]
  );

  const tap = rows[0];
  emit("terminal.tap_received", { tapId: tap.id, terminalId: auth.terminalId, amount, currency: currency ?? "ZAR" });

  // What happens next -- actually settling this tap through VinkPay's
  // existing submitOrderPayment/handleWebhook flow -- is deliberately not
  // wired here yet. A tap event and a payment submission are two
  // different things (this table records that a card was presented; an
  // actual charge needs an order to charge against), and building that
  // link out is the next real step once there's a genuine EMV kernel
  // producing genuine tap events to link.
  res.status(201).json({ success: true, data: { tapId: tap.id, receivedAt: tap.received_at, status: "received" } });
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
  const { rows } = await pool.query(`SELECT id, serial, model, status, assigned_driver, last_seen_at, registered_at FROM terminals ORDER BY registered_at DESC`);
  res.json({ success: true, data: rows });
});

export default router;
