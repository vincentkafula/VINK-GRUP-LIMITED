import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registerRetailTerminal, authenticateRetailTerminal } from "../services/retailAuth.js";
import { calculateRetailSplit } from "../services/retailRevenueSplitService.js";
import { containsUnmaskedPan } from "../services/panValidation.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

/**
 * POST /api/retail/merchants
 * Admin-facing. Creates a retail merchant record, connected to the
 * same real banking-system account (users(id)) every other role in
 * this schema uses -- ownerId here is not a separate, parallel account
 * system.
 */
router.post("/merchants", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { ownerId, businessName } = req.body as { ownerId?: string; businessName?: string };
  if (!ownerId || !businessName) {
    res.status(400).json({ success: false, error: "ownerId and businessName are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO retail_merchants (owner_id, business_name) VALUES ($1, $2) RETURNING *`,
    [ownerId, businessName]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/**
 * GET /api/retail/merchants
 * Admin-facing listing.
 */
router.get("/merchants", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM retail_merchants ORDER BY registered_at DESC`);
  res.json({ success: true, data: rows });
});

/**
 * POST /api/retail/register
 * Admin-only device provisioning, same pattern as
 * POST /api/terminal/register.
 */
router.post("/register", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { serial, model } = req.body as { serial?: string; model?: string };
  if (!serial) {
    res.status(400).json({ success: false, error: "serial is required" });
    return;
  }
  try {
    const result = await registerRetailTerminal(serial.trim(), model?.trim() || "Retail POS", req.user!.username);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("[retail] Failed to register terminal:", err);
    res.status(500).json({ success: false, error: "Could not register terminal" });
  }
});

/**
 * GET /api/retail/terminals
 */
router.get("/terminals", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM retail_terminals ORDER BY registered_at DESC`);
  res.json({ success: true, data: rows });
});

/**
 * PATCH /api/retail/terminals/:id
 * Status control (the real access-control lever, same as the taxi
 * side -- authenticateRetailTerminal() rejects any non-'active'
 * terminal before even checking the API key) plus merchant assignment.
 */
router.patch("/terminals/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, merchantId } = req.body as { status?: string; merchantId?: string };
  if (status && !["active", "inactive", "revoked"].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'active', 'inactive', or 'revoked'" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE retail_terminals SET status = COALESCE($1, status), merchant_id = COALESCE($2, merchant_id) WHERE id = $3 RETURNING *`,
    [status ?? null, merchantId ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Terminal not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * POST /api/retail/transaction
 * Device-authenticated. The retail equivalent of POST
 * /api/terminal/tap -- calculates and persists the real 2.5% split on
 * every transaction. Honest limit stated here, not glossed over: this
 * records the correct settlement amounts, it does not yet move money
 * into the merchant's actual banking balance -- same gap
 * terminal_taps' own comment already states for the taxi side, not
 * resolved for retail here either.
 */
router.post("/transaction", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateRetailTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { maskedPan, scheme, amount, currency, cardholderVerification, emvCryptogramRef } = req.body as {
    maskedPan?: string; scheme?: string; amount?: number; currency?: string; cardholderVerification?: string; emvCryptogramRef?: string;
  };
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ success: false, error: "amount must be a positive number" });
    return;
  }
  // Same PAN-shape rejection guardrail as terminalRouter.ts's own /tap
  // endpoint -- a backstop against a misconfigured device or upstream
  // bug sending an unmasked card number, not the only control.
  for (const field of [maskedPan, emvCryptogramRef]) {
    if (containsUnmaskedPan(field)) {
      console.error(`[retail] Rejected transaction from terminal ${serial}: a field contained what looks like an unmasked card number`);
      res.status(400).json({ success: false, error: "Request rejected: field contains an unmasked card number, which this endpoint must never receive" });
      return;
    }
  }

  const split = calculateRetailSplit(amount);

  const { rows } = await pool.query(
    `INSERT INTO retail_transactions (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, emv_cryptogram_ref, vink_fee_pct, vink_fee_amount, merchant_settlement)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, received_at`,
    [auth.terminalId, maskedPan ?? null, scheme ?? null, amount, currency ?? "ZAR", cardholderVerification ?? null, emvCryptogramRef ?? null,
     split.vinkFeePct, split.vinkFeeAmount, split.merchantSettlement]
  );

  const txn = rows[0];
  emit("retail.transaction_received", { transactionId: txn.id, terminalId: auth.terminalId, amount, currency: currency ?? "ZAR", split });

  res.status(201).json({ success: true, data: { transactionId: txn.id, receivedAt: txn.received_at, status: "received", split } });
});

/**
 * GET /api/retail/transactions?merchantId=...
 * Admin-facing transaction history. Filtering by merchantId requires a
 * join to retail_terminals, since retail_transactions itself only has
 * terminal_id, not merchant_id directly -- unlike sales, which stores
 * merchant_id on the row itself for exactly this kind of lookup. Not a
 * bug, just a real structural difference between how these two tables
 * were designed, worth noting rather than silently working around.
 */
router.get("/transactions", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { merchantId } = req.query as { merchantId?: string };
  const { rows } = merchantId
    ? await pool.query(
        `SELECT rt.* FROM retail_transactions rt JOIN retail_terminals t ON t.id = rt.terminal_id WHERE t.merchant_id = $1 ORDER BY rt.received_at DESC LIMIT 200`,
        [merchantId]
      )
    : await pool.query(`SELECT * FROM retail_transactions ORDER BY received_at DESC LIMIT 200`);
  res.json({ success: true, data: rows });
});

/**
 * POST /api/retail/heartbeat
 * MDM check-in, mirrors POST /api/terminal/heartbeat exactly --
 * updates the status snapshot + history, and returns whether a newer
 * app version exists by checking app_releases where
 * product = 'retail_pos'. Same honest limit as the taxi side: this is
 * check-and-prompt, not a silent remote push.
 */
router.post("/heartbeat", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateRetailTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { appVersion, batteryPct } = req.body as { appVersion?: string; batteryPct?: number };
  if (typeof batteryPct === "number" && (batteryPct < 0 || batteryPct > 100)) {
    res.status(400).json({ success: false, error: "batteryPct must be between 0 and 100" });
    return;
  }

  await pool.query(
    `UPDATE retail_terminals SET app_version = COALESCE($1, app_version), battery_pct = COALESCE($2, battery_pct), last_heartbeat_at = now() WHERE id = $3`,
    [appVersion ?? null, batteryPct ?? null, auth.terminalId]
  );
  await pool.query(
    `INSERT INTO retail_device_status_reports (terminal_id, app_version, battery_pct) VALUES ($1, $2, $3)`,
    [auth.terminalId, appVersion ?? null, batteryPct ?? null]
  );

  const latestRelease = await pool.query(
    `SELECT version, download_url, release_notes, mandatory FROM app_releases WHERE active = true AND product = 'retail_pos' ORDER BY created_at DESC LIMIT 1`
  );
  const latest = latestRelease.rows[0];
  const updateAvailable = !!latest && !!appVersion && latest.version !== appVersion;

  res.status(201).json({
    success: true,
    data: {
      acknowledged: true,
      updateAvailable,
      latestVersion: latest?.version ?? null,
      downloadUrl: updateAvailable ? latest.download_url : null,
      releaseNotes: updateAvailable ? latest.release_notes : null,
      mandatory: updateAvailable ? latest.mandatory : false,
    },
  });
});

/**
 * POST /api/retail/fault
 */
router.post("/fault", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateRetailTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { faultCode, message, severity } = req.body as { faultCode?: string; message?: string; severity?: string };
  if (!faultCode) {
    res.status(400).json({ success: false, error: "faultCode is required" });
    return;
  }
  if (severity && !["info", "warning", "critical"].includes(severity)) {
    res.status(400).json({ success: false, error: "severity must be 'info', 'warning', or 'critical'" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO retail_device_faults (terminal_id, fault_code, message, severity) VALUES ($1, $2, $3, COALESCE($4, 'warning')) RETURNING id, reported_at`,
    [auth.terminalId, faultCode, message ?? null, severity ?? null]
  );

  emit("retail.fault_reported", { faultId: rows[0].id, terminalId: auth.terminalId, faultCode, severity: severity ?? "warning" });
  res.status(201).json({ success: true, data: { faultId: rows[0].id, reportedAt: rows[0].reported_at } });
});

/**
 * GET /api/retail/faults + PATCH /api/retail/faults/:id
 */
router.get("/faults", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { resolved } = req.query as { resolved?: string };
  const { rows } = resolved !== undefined
    ? await pool.query(`SELECT f.*, t.serial FROM retail_device_faults f JOIN retail_terminals t ON t.id = f.terminal_id WHERE f.resolved = $1 ORDER BY f.reported_at DESC`, [resolved === "true"])
    : await pool.query(`SELECT f.*, t.serial FROM retail_device_faults f JOIN retail_terminals t ON t.id = f.terminal_id ORDER BY f.reported_at DESC`);
  res.json({ success: true, data: rows });
});

router.patch("/faults/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { rows } = await pool.query(
    `UPDATE retail_device_faults SET resolved = true, resolved_at = now(), resolved_by = $1 WHERE id = $2 RETURNING *`,
    [req.user?.username ?? "admin", req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Fault not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * POST /api/retail/app-releases + GET /api/retail/app-releases
 * Reuses the shared app_releases table with product = 'retail_pos',
 * same table the taxi terminal app's own releases use with
 * product = 'taxi_terminal'.
 */
router.post("/app-releases", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { version, downloadUrl, releaseNotes, mandatory } = req.body as { version?: string; downloadUrl?: string; releaseNotes?: string; mandatory?: boolean };
  if (!version || !downloadUrl) {
    res.status(400).json({ success: false, error: "version and downloadUrl are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO app_releases (version, download_url, release_notes, mandatory, product) VALUES ($1, $2, $3, COALESCE($4, false), 'retail_pos') RETURNING *`,
    [version, downloadUrl, releaseNotes ?? null, mandatory ?? null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.get("/app-releases", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM app_releases WHERE product = 'retail_pos' ORDER BY created_at DESC`);
  res.json({ success: true, data: rows });
});

export default router;
