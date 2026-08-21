import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as open5gs from "../services/open5gsClient.js";
import * as genieAcs from "../services/genieAcsClient.js";

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer"] as const;

router.post("/cpe/devices", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { serials, model } = req.body as { serials?: string[]; model?: string };
  if (!Array.isArray(serials) || serials.length === 0) {
    res.status(400).json({ success: false, error: "serials must be a non-empty array of serial numbers" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted: unknown[] = [];
    for (const serial of serials) {
      const result = await client.query(
        `INSERT INTO cpe_devices (serial_number, model) VALUES ($1, $2)
         ON CONFLICT (serial_number) DO NOTHING RETURNING *`,
        [serial, model ?? null]
      );
      if (result.rows.length) inserted.push(result.rows[0]);
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { registered: inserted.length, skipped: serials.length - inserted.length, devices: inserted } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[provisioning] Failed to bulk-register CPE devices:", err);
    res.status(500).json({ success: false, error: "Could not register devices" });
  } finally {
    client.release();
  }
});

router.get("/cpe/devices", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { status } = req.query as { status?: string };
  const { rows } = status
    ? await pool.query(`SELECT * FROM cpe_devices WHERE status = $1 ORDER BY created_at DESC`, [status])
    : await pool.query(`SELECT * FROM cpe_devices ORDER BY created_at DESC`);
  res.json({ success: true, data: rows });
});

router.post("/cpe/devices/:serial/claim", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { ricaRegistrationId } = req.body as { ricaRegistrationId?: string };
  if (!ricaRegistrationId) {
    res.status(400).json({ success: false, error: "ricaRegistrationId is required" });
    return;
  }

  const ricaResult = await pool.query(`SELECT verification_status FROM rica_registrations WHERE id = $1`, [ricaRegistrationId]);
  if (!ricaResult.rows.length) {
    res.status(404).json({ success: false, error: "RICA registration not found" });
    return;
  }
  if (ricaResult.rows[0].verification_status !== "verified") {
    res.status(400).json({ success: false, error: `Cannot claim a device against an unverified RICA registration (current status: ${ricaResult.rows[0].verification_status})` });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE cpe_devices SET rica_registration_id = $1, status = 'claimed', claimed_at = now()
     WHERE serial_number = $2 AND status IN ('manufactured', 'shipped') RETURNING *`,
    [ricaRegistrationId, req.params.serial]
  );
  if (!rows.length) {
    res.status(400).json({ success: false, error: "Device not found, or not in a claimable state (must be 'manufactured' or 'shipped')" });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

router.patch("/cpe/devices/:serial/genieacs-link", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { genieacsDeviceId } = req.body as { genieacsDeviceId?: string };
  if (!genieacsDeviceId) {
    res.status(400).json({ success: false, error: "genieacsDeviceId is required" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE cpe_devices SET genieacs_device_id = $1 WHERE serial_number = $2 RETURNING *`,
    [genieacsDeviceId, req.params.serial]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

router.post("/cpe/devices/:serial/provision", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { imsi, k, opc, wifiSsid, wifiPassword } = req.body as {
    imsi?: string; k?: string; opc?: string; wifiSsid?: string; wifiPassword?: string;
  };
  if (!imsi || !k || !opc || !wifiSsid || !wifiPassword) {
    res.status(400).json({ success: false, error: "imsi, k, opc, wifiSsid, and wifiPassword are required" });
    return;
  }

  const deviceResult = await pool.query(`SELECT * FROM cpe_devices WHERE serial_number = $1`, [req.params.serial]);
  if (!deviceResult.rows.length) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  const device = deviceResult.rows[0];

  if (device.status !== "claimed") {
    res.status(400).json({ success: false, error: `Device must be 'claimed' before provisioning (current status: ${device.status})` });
    return;
  }
  if (!device.genieacs_device_id) {
    res.status(400).json({ success: false, error: "Device has no linked GenieACS device_id yet -- it must contact the ACS at least once, then be linked via PATCH .../genieacs-link, before config can be pushed to it" });
    return;
  }

  try {
    await open5gs.provisionSubscriber({ imsi, k, opc });
  } catch (err) {
    console.error(`[provisioning] Failed to provision Open5GS subscriber for device ${req.params.serial}:`, err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not provision core network subscriber" });
    return;
  }

  try {
    await genieAcs.setWifiCredentials(device.genieacs_device_id, wifiSsid, wifiPassword);
  } catch (err) {
    console.error(`[provisioning] Open5GS subscriber created but GenieACS WiFi push failed for device ${req.params.serial}:`, err);
    res.status(500).json({ success: false, error: `Core network subscriber created, but pushing WiFi config failed: ${err instanceof Error ? err.message : "unknown error"}. Retry the WiFi push separately.` });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE cpe_devices SET subscriber_imsi = $1, status = 'provisioned', provisioned_at = now() WHERE serial_number = $2 RETURNING *`,
    [imsi, req.params.serial]
  );
  res.json({ success: true, data: rows[0] });
});

export default router;
