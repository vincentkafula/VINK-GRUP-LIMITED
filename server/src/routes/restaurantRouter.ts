import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { authenticateTillTerminal } from "../services/tillAuth.js";
import { calculateRetailSplit } from "../services/retailRevenueSplitService.js";
import { containsUnmaskedPan } from "../services/panValidation.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

router.post("/tables", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { merchantId, tableNumber } = req.body as { merchantId?: string; tableNumber?: string };
  if (!merchantId || !tableNumber) {
    res.status(400).json({ success: false, error: "merchantId and tableNumber are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO restaurant_tables (merchant_id, table_number) VALUES ($1, $2) RETURNING *`,
    [merchantId, tableNumber]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.get("/tables", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { merchantId } = req.query as { merchantId?: string };
  const { rows } = merchantId
    ? await pool.query(`SELECT * FROM restaurant_tables WHERE merchant_id = $1 ORDER BY table_number ASC`, [merchantId])
    : await pool.query(`SELECT * FROM restaurant_tables ORDER BY table_number ASC`);
  res.json({ success: true, data: rows });
});

router.post("/orders", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }
  if (!auth.merchantId) {
    res.status(400).json({ success: false, error: "This terminal has no merchant assigned" });
    return;
  }

  const { tableId, items, notes } = req.body as {
    tableId?: string;
    items?: { productId?: string; productName?: string; quantity?: number; unitPrice?: number; notes?: string }[];
    notes?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: "items must be a non-empty array" });
    return;
  }
  for (const item of items) {
    if (!item.productName || typeof item.quantity !== "number" || item.quantity <= 0 || typeof item.unitPrice !== "number" || item.unitPrice < 0) {
      res.status(400).json({ success: false, error: "Each item needs a productName, a positive quantity, and a non-negative unitPrice" });
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `INSERT INTO restaurant_orders (terminal_id, merchant_id, table_id, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [auth.terminalId, auth.merchantId, tableId ?? null, notes ?? null]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO restaurant_order_items (order_id, product_id, product_name, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.productId ?? null, item.productName, item.quantity, item.unitPrice, item.notes ?? null]
      );
    }
    await client.query("COMMIT");

    emit("restaurant.order_placed", { orderId: order.id, terminalId: auth.terminalId, merchantId: auth.merchantId, tableId: tableId ?? null, itemCount: items.length });
    res.status(201).json({ success: true, data: { ...order, items } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[restaurant] Failed to create order:", err);
    res.status(500).json({ success: false, error: "Could not create order" });
  } finally {
    client.release();
  }
});

router.get("/orders", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { merchantId, status } = req.query as { merchantId?: string; status?: string };

  const conditions: string[] = [];
  const params: string[] = [];
  if (merchantId) { params.push(merchantId); conditions.push(`merchant_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const ordersResult = await pool.query(`SELECT * FROM restaurant_orders ${whereClause} ORDER BY created_at DESC LIMIT 200`, params);
  const orders = ordersResult.rows;
  if (!orders.length) { res.json({ success: true, data: [] }); return; }

  const itemsResult = await pool.query(
    `SELECT * FROM restaurant_order_items WHERE order_id = ANY($1::uuid[])`,
    [orders.map((o: { id: string }) => o.id)]
  );
  const itemsByOrder = new Map<string, unknown[]>();
  for (const item of itemsResult.rows) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id)!.push(item);
  }

  res.json({ success: true, data: orders.map((o: { id: string }) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })) });
});

router.patch("/orders/:id/status", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status } = req.body as { status?: string };
  if (!status || !["received", "preparing", "ready", "served", "cancelled"].includes(status)) {
    res.status(400).json({ success: false, error: "status must be one of received, preparing, ready, served, cancelled" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE restaurant_orders SET status = $1, updated_at = now() WHERE id = $2 AND status != 'paid' RETURNING *`,
    [status, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Order not found, or already paid (paid orders can't change status)" }); return; }

  emit("restaurant.order_status_changed", { orderId: rows[0].id, status, merchantId: rows[0].merchant_id });
  res.json({ success: true, data: rows[0] });
});

router.post("/orders/:id/pay", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const serial = req.header("x-terminal-serial");
  const apiKey = req.header("x-terminal-api-key");
  const auth = await authenticateTillTerminal(serial ?? "", apiKey ?? "");
  if (!auth.authenticated) {
    res.status(401).json({ success: false, error: auth.error ?? "Terminal authentication failed" });
    return;
  }

  const { paymentMethod, taxAmount, maskedPan, scheme, cardholderVerification, emvCryptogramRef } = req.body as {
    paymentMethod?: string; taxAmount?: number; maskedPan?: string; scheme?: string; cardholderVerification?: string; emvCryptogramRef?: string;
  };
  if (paymentMethod !== "cash" && paymentMethod !== "card") {
    res.status(400).json({ success: false, error: "paymentMethod must be 'cash' or 'card'" });
    return;
  }
  for (const field of [maskedPan, emvCryptogramRef]) {
    if (containsUnmaskedPan(field)) {
      console.error(`[restaurant] Rejected payment for order ${req.params.id}: a field contained what looks like an unmasked card number`);
      res.status(400).json({ success: false, error: "Request rejected: field contains an unmasked card number, which this endpoint must never receive" });
      return;
    }
  }

  const orderResult = await pool.query(`SELECT * FROM restaurant_orders WHERE id = $1`, [req.params.id]);
  if (!orderResult.rows.length) { res.status(404).json({ success: false, error: "Order not found" }); return; }
  const order = orderResult.rows[0];
  if (order.status === "paid") { res.status(400).json({ success: false, error: "Order already paid" }); return; }
  if (order.status === "cancelled") { res.status(400).json({ success: false, error: "Cannot pay a cancelled order" }); return; }

  const itemsResult = await pool.query(`SELECT * FROM restaurant_order_items WHERE order_id = $1`, [req.params.id]);
  const items = itemsResult.rows;

  const subtotal = +items.reduce((sum: number, i: { quantity: number; unit_price: string }) => sum + i.quantity * Number(i.unit_price), 0).toFixed(2);
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
      [order.terminal_id, order.merchant_id, subtotal, tax, total, paymentMethod,
       paymentMethod === "card" ? (maskedPan ?? null) : null, paymentMethod === "card" ? (scheme ?? null) : null,
       paymentMethod === "card" ? (cardholderVerification ?? null) : null, paymentMethod === "card" ? (emvCryptogramRef ?? null) : null,
       split.vinkFeePct, split.vinkFeeAmount, split.merchantSettlement]
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.product_id, item.product_name, item.quantity, item.unit_price, +(item.quantity * Number(item.unit_price)).toFixed(2)]
      );
    }

    await client.query(`UPDATE restaurant_orders SET status = 'paid', sale_id = $1, updated_at = now() WHERE id = $2`, [sale.id, order.id]);
    await client.query("COMMIT");

    emit("restaurant.order_paid", { orderId: order.id, saleId: sale.id, total, paymentMethod, split });
    res.status(201).json({ success: true, data: { orderId: order.id, saleId: sale.id, createdAt: sale.created_at, subtotal, taxAmount: tax, total, paymentMethod, split } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[restaurant] Failed to process payment:", err);
    res.status(500).json({ success: false, error: "Could not process payment" });
  } finally {
    client.release();
  }
});

export default router;
