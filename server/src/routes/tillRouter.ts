import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registerTillTerminal, authenticateTillTerminal } from "../services/tillAuth.js";
import { calculateRetailSplit } from "../services/retailRevenueSplitService.js";
import { containsUnmaskedPan } from "../services/panValidation.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

/**
 * POST /api/till/register
 * Admin-only device provisioning, same pattern as every other
 * terminal type in this codebase.
 */
router.post("/register", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { serial, model } = req.body as { serial?: string; model?: string };
  if (!serial) {
    res.status(400).json({ success: false, error: "serial is required" });
    return;
  }
  try {
    const result = await registerTillTerminal(serial.trim(), model?.trim() || "Till Device", req.user!.username);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("[till] Failed to register terminal:", err);
    res.status(500).json({ success: false, error: "Could not register terminal" });
  }
});

router.get("/terminals", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM till_terminals ORDER BY registered_at DESC`);
  res.json({ success: true, data: rows });
});

router.patch("/terminals/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, merchantId } = req.body as { status?: string; merchantId?: string };
  if (status && !["active", "inactive", "revoked"].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'active', 'inactive', or 'revoked'" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE till_terminals SET status = COALESCE($1, status), merchant_id = COALESCE($2, merchant_id) WHERE id = $3 RETURNING *`,
    [status ?? null, merchantId ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Terminal not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * POST /api/till/products
 * Admin-facing (a real merchant-facing product management screen is a
 * reasonable follow-up, not built here -- this is the backend
 * capability, reachable today only through the admin panel).
 */
router.post("/products", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { merchantId, name, sku, price, stockQty } = req.body as { merchantId?: string; name?: string; sku?: string; price?: number; stockQty?: number };
  if (!merchantId || !name || typeof price !== "number" || price < 0) {
    res.status(400).json({ success: false, error: "merchantId, name, and a non-negative price are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO products (merchant_id, name, sku, price, stock_qty) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [merchantId, name, sku ?? null, price, stockQty ?? null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/**
 * GET /api/till/products?merchantId=...
 * Device-authenticated -- the till itself needs to fetch its own
 * merchant's catalog to build a checkout screen, so this specific
 * endpoint uses terminal credentials, not an admin JWT, unlike the
 * rest of this router.
 */
router.get("/products", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }
  if (!auth.merchantId) {
    res.json({ success: true, data: [] });
    return;
  }

  const { rows } = await pool.query(`SELECT * FROM products WHERE merchant_id = $1 AND active = true ORDER BY name ASC`, [auth.merchantId]);
  res.json({ success: true, data: rows });
});

/**
 * GET /api/till/admin/products?merchantId=...
 * Admin-facing equivalent of the device endpoint above -- deliberately
 * a separate path rather than overloading /products with two auth
 * modes, since mixing "authenticate via terminal headers" and
 * "authenticate via admin JWT" on one endpoint is exactly the kind of
 * ambiguity worth avoiding in payment-adjacent code. Includes inactive
 * products too (unlike the device endpoint, which only shows what a
 * till should actually be able to sell), since an admin managing a
 * catalog needs to see everything, active or not.
 */
router.get("/admin/products", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { merchantId } = req.query as { merchantId?: string };
  const { rows } = merchantId
    ? await pool.query(`SELECT * FROM products WHERE merchant_id = $1 ORDER BY name ASC`, [merchantId])
    : await pool.query(`SELECT * FROM products ORDER BY name ASC`);
  res.json({ success: true, data: rows });
});

/**
 * PATCH /api/till/products/:id
 * Admin-facing. Edits price/stock/active status -- name and merchant
 * are deliberately not editable here (renaming would be fine, but
 * reassigning a product to a different merchant is a bigger, riskier
 * operation better handled as delete-and-recreate than a silent field
 * update).
 */
router.patch("/products/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { name, price, stockQty, active } = req.body as { name?: string; price?: number; stockQty?: number; active?: boolean };
  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    res.status(400).json({ success: false, error: "price must be a non-negative number" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE products SET name = COALESCE($1, name), price = COALESCE($2, price), stock_qty = COALESCE($3, stock_qty), active = COALESCE($4, active) WHERE id = $5 RETURNING *`,
    [name ?? null, price ?? null, stockQty ?? null, active ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * GET /api/till/sales?merchantId=...
 * Admin-facing sales history, with line items included so the caller
 * doesn't need a second request per sale.
 */
router.get("/sales", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { merchantId } = req.query as { merchantId?: string };
  const salesResult = merchantId
    ? await pool.query(`SELECT * FROM sales WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 200`, [merchantId])
    : await pool.query(`SELECT * FROM sales ORDER BY created_at DESC LIMIT 200`);

  const sales = salesResult.rows;
  if (!sales.length) { res.json({ success: true, data: [] }); return; }

  const itemsResult = await pool.query(
    `SELECT * FROM sale_items WHERE sale_id = ANY($1::uuid[])`,
    [sales.map((s: { id: string }) => s.id)]
  );
  const itemsBySale = new Map<string, unknown[]>();
  for (const item of itemsResult.rows) {
    if (!itemsBySale.has(item.sale_id)) itemsBySale.set(item.sale_id, []);
    itemsBySale.get(item.sale_id)!.push(item);
  }

  res.json({ success: true, data: sales.map((s: { id: string }) => ({ ...s, items: itemsBySale.get(s.id) ?? [] })) });
});

/**
 * POST /api/till/sale
 * Device-authenticated. Confirmed model: cash sales carry zero VINK
 * fee (the full amount is the merchant's), card sales use the exact
 * same 2.5% calculateRetailSplit already proven for retail POS, reused
 * here rather than reimplemented. Wrapped in a real transaction since
 * this writes both the sale and its line items together -- either both
 * succeed or neither does.
 */
router.post("/sale", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }


  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }
  if (!auth.merchantId) {
    res.status(400).json({ success: false, error: "This terminal has no merchant assigned -- an admin must assign one before it can record sales" });
    return;
  }

  const { items, paymentMethod, taxAmount, maskedPan, scheme, cardholderVerification, emvCryptogramRef } = req.body as {
    items?: { productId?: string; productName?: string; quantity?: number; unitPrice?: number }[];
    paymentMethod?: string; taxAmount?: number;
    maskedPan?: string; scheme?: string; cardholderVerification?: string; emvCryptogramRef?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: "items must be a non-empty array" });
    return;
  }
  if (paymentMethod !== "cash" && paymentMethod !== "card") {
    res.status(400).json({ success: false, error: "paymentMethod must be 'cash' or 'card'" });
    return;
  }
  for (const item of items) {
    if (!item.productName || typeof item.quantity !== "number" || item.quantity <= 0 || typeof item.unitPrice !== "number" || item.unitPrice < 0) {
      res.status(400).json({ success: false, error: "Each item needs a productName, a positive quantity, and a non-negative unitPrice" });
      return;
    }
  }
  for (const field of [maskedPan, emvCryptogramRef]) {
    if (containsUnmaskedPan(field)) {
      console.error(`[till] Rejected sale from terminal ${serial}: a field contained what looks like an unmasked card number`);
      res.status(400).json({ success: false, error: "Request rejected: field contains an unmasked card number, which this endpoint must never receive" });
      return;
    }
  }

  const subtotal = +items.reduce((sum, i) => sum + i.quantity! * i.unitPrice!, 0).toFixed(2);
  const tax = +(taxAmount ?? 0).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const split = paymentMethod === "card"
    ? calculateRetailSplit(total)
    : { vinkFeePct: 0, vinkFeeAmount: 0, merchantSettlement: total };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saleResult = await client.query(
      `INSERT INTO sales (terminal_id, merchant_id, subtotal, tax_amount, total, payment_method, masked_pan, scheme, cardholder_verification, emv_cryptogram_ref, vink_fee_pct, vink_fee_amount, merchant_settlement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, created_at`,
      [auth.terminalId, auth.merchantId, subtotal, tax, total, paymentMethod,
       paymentMethod === "card" ? (maskedPan ?? null) : null, paymentMethod === "card" ? (scheme ?? null) : null,
       paymentMethod === "card" ? (cardholderVerification ?? null) : null, paymentMethod === "card" ? (emvCryptogramRef ?? null) : null,
       split.vinkFeePct, split.vinkFeeAmount, split.merchantSettlement]
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.productId ?? null, item.productName, item.quantity, item.unitPrice, +(item.quantity! * item.unitPrice!).toFixed(2)]
      );
    }
    await client.query("COMMIT");

    emit("till.sale_completed", { saleId: sale.id, terminalId: auth.terminalId, total, paymentMethod, split });
    res.status(201).json({ success: true, data: { saleId: sale.id, createdAt: sale.created_at, subtotal, taxAmount: tax, total, paymentMethod, split } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[till] Failed to record sale:", err);
    res.status(500).json({ success: false, error: "Could not record sale" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/till/sales/:id/receipt
 * Device-authenticated -- lets the till re-display a receipt for a
 * sale it just made, including its line items.
 */
router.get("/sales/:id/receipt", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const saleResult = await pool.query(`SELECT * FROM sales WHERE id = $1 AND terminal_id = $2`, [req.params.id, auth.terminalId]);
  if (!saleResult.rows.length) { res.status(404).json({ success: false, error: "Sale not found" }); return; }
  const itemsResult = await pool.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [req.params.id]);
  res.json({ success: true, data: { ...saleResult.rows[0], items: itemsResult.rows } });
});

router.post("/heartbeat", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
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
    `UPDATE till_terminals SET app_version = COALESCE($1, app_version), battery_pct = COALESCE($2, battery_pct), last_heartbeat_at = now() WHERE id = $3`,
    [appVersion ?? null, batteryPct ?? null, auth.terminalId]
  );
  await pool.query(
    `INSERT INTO till_device_status_reports (terminal_id, app_version, battery_pct) VALUES ($1, $2, $3)`,
    [auth.terminalId, appVersion ?? null, batteryPct ?? null]
  );

  const latestRelease = await pool.query(
    `SELECT version, download_url, release_notes, mandatory FROM app_releases WHERE active = true AND product = 'till_app' ORDER BY created_at DESC LIMIT 1`
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

router.post("/fault", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
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
    `INSERT INTO till_device_faults (terminal_id, fault_code, message, severity) VALUES ($1, $2, $3, COALESCE($4, 'warning')) RETURNING id, reported_at`,
    [auth.terminalId, faultCode, message ?? null, severity ?? null]
  );

  emit("till.fault_reported", { faultId: rows[0].id, terminalId: auth.terminalId, faultCode, severity: severity ?? "warning" });
  res.status(201).json({ success: true, data: { faultId: rows[0].id, reportedAt: rows[0].reported_at } });
});

router.get("/faults", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { resolved } = req.query as { resolved?: string };
  const { rows } = resolved !== undefined
    ? await pool.query(`SELECT f.*, t.serial FROM till_device_faults f JOIN till_terminals t ON t.id = f.terminal_id WHERE f.resolved = $1 ORDER BY f.reported_at DESC`, [resolved === "true"])
    : await pool.query(`SELECT f.*, t.serial FROM till_device_faults f JOIN till_terminals t ON t.id = f.terminal_id ORDER BY f.reported_at DESC`);
  res.json({ success: true, data: rows });
});

router.patch("/faults/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { rows } = await pool.query(
    `UPDATE till_device_faults SET resolved = true, resolved_at = now(), resolved_by = $1 WHERE id = $2 RETURNING *`,
    [req.user?.username ?? "admin", req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Fault not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

router.post("/app-releases", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { version, downloadUrl, releaseNotes, mandatory } = req.body as { version?: string; downloadUrl?: string; releaseNotes?: string; mandatory?: boolean };
  if (!version || !downloadUrl) {
    res.status(400).json({ success: false, error: "version and downloadUrl are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO app_releases (version, download_url, release_notes, mandatory, product) VALUES ($1, $2, $3, COALESCE($4, false), 'till_app') RETURNING *`,
    [version, downloadUrl, releaseNotes ?? null, mandatory ?? null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.get("/app-releases", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM app_releases WHERE product = 'till_app' ORDER BY created_at DESC`);
  res.json({ success: true, data: rows });
});

export default router;
