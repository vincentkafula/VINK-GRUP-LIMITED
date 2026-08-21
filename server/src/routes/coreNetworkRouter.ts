import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as open5gs from "../services/open5gsClient.js";
import * as genieAcs from "../services/genieAcsClient.js";

/**
 * Real integration endpoints connecting VINK's own admin panel to a
 * running Open5GS core network and a running GenieACS ACS instance --
 * genuinely separate systems VINK doesn't run itself, reached over
 * real MongoDB and real HTTP respectively (see each service's own
 * comment for what's verified vs. what couldn't be tested live in
 * this environment).
 *
 * Nothing in this router works until real OPEN5GS_MONGO_URI and
 * GENIEACS_NBI_URL environment variables point at real, running
 * instances of that infrastructure -- this is the integration layer,
 * not the core network or ACS themselves.
 */

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer"] as const;

// ── Open5GS subscriber provisioning ──────────────────────────────────────────

router.post("/core/subscribers", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { imsi, k, opc, apn, downlinkMbps, uplinkMbps } = req.body as {
    imsi?: string; k?: string; opc?: string; apn?: string; downlinkMbps?: number; uplinkMbps?: number;
  };
  if (!imsi || !k || !opc) {
    res.status(400).json({ success: false, error: "imsi, k, and opc are required" });
    return;
  }
  try {
    const result = await open5gs.provisionSubscriber({ imsi, k, opc, apn, downlinkMbps, uplinkMbps });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("[coreNetwork] Failed to provision subscriber into Open5GS:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not provision subscriber" });
  }
});

router.get("/core/subscribers/:imsi", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const subscriber = await open5gs.getSubscriber(req.params.imsi);
    if (!subscriber) { res.status(404).json({ success: false, error: "Subscriber not found in Open5GS" }); return; }
    res.json({ success: true, data: subscriber });
  } catch (err) {
    console.error("[coreNetwork] Failed to query Open5GS subscriber:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not query subscriber" });
  }
});

router.patch("/core/subscribers/:imsi/suspend", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await open5gs.suspendSubscriber(req.params.imsi);
    if (!found) { res.status(404).json({ success: false, error: "Subscriber not found in Open5GS" }); return; }
    res.json({ success: true, message: "Subscriber suspended in Open5GS" });
  } catch (err) {
    console.error("[coreNetwork] Failed to suspend Open5GS subscriber:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not suspend subscriber" });
  }
});

router.patch("/core/subscribers/:imsi/reactivate", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await open5gs.reactivateSubscriber(req.params.imsi);
    if (!found) { res.status(404).json({ success: false, error: "Subscriber not found in Open5GS" }); return; }
    res.json({ success: true, message: "Subscriber reactivated in Open5GS" });
  } catch (err) {
    console.error("[coreNetwork] Failed to reactivate Open5GS subscriber:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not reactivate subscriber" });
  }
});

router.delete("/core/subscribers/:imsi", requireAuth, requireRole("owner", "superadmin"), async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await open5gs.deleteSubscriber(req.params.imsi);
    if (!found) { res.status(404).json({ success: false, error: "Subscriber not found in Open5GS" }); return; }
    res.json({ success: true, message: "Subscriber removed from Open5GS" });
  } catch (err) {
    console.error("[coreNetwork] Failed to delete Open5GS subscriber:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not delete subscriber" });
  }
});

// ── GenieACS router/CPE management ───────────────────────────────────────────

router.get("/cpe/devices", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query as { query?: string };
    const devices = await genieAcs.listDevices(query ? JSON.parse(query) : undefined);
    res.json({ success: true, data: devices });
  } catch (err) {
    console.error("[coreNetwork] Failed to list GenieACS devices:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not list devices" });
  }
});

router.get("/cpe/devices/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await genieAcs.getDevice(req.params.id);
    if (!device) { res.status(404).json({ success: false, error: "Device not found in GenieACS" }); return; }
    res.json({ success: true, data: device });
  } catch (err) {
    console.error("[coreNetwork] Failed to query GenieACS device:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not query device" });
  }
});

router.post("/cpe/devices/:id/reboot", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    await genieAcs.rebootDevice(req.params.id);
    res.json({ success: true, message: "Reboot task enqueued -- device will restart on next connection request or periodic inform" });
  } catch (err) {
    console.error("[coreNetwork] Failed to reboot CPE device:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not reboot device" });
  }
});

router.post("/cpe/devices/:id/wifi", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { ssid, password } = req.body as { ssid?: string; password?: string };
  if (!ssid || !password) {
    res.status(400).json({ success: false, error: "ssid and password are required" });
    return;
  }
  try {
    await genieAcs.setWifiCredentials(req.params.id, ssid, password);
    res.json({ success: true, message: "WiFi credentials pushed to device" });
  } catch (err) {
    console.error("[coreNetwork] Failed to push WiFi credentials:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not push WiFi credentials" });
  }
});

router.post("/cpe/devices/:id/firmware", requireAuth, requireRole("owner", "superadmin"), async (req: Request, res: Response): Promise<void> => {
  const { fileName } = req.body as { fileName?: string };
  if (!fileName) {
    res.status(400).json({ success: false, error: "fileName is required -- upload the firmware file to GenieACS separately first" });
    return;
  }
  try {
    await genieAcs.pushFirmwareUpgrade(req.params.id, fileName);
    res.json({ success: true, message: "Firmware upgrade task enqueued" });
  } catch (err) {
    console.error("[coreNetwork] Failed to push firmware upgrade:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not push firmware upgrade" });
  }
});

router.get("/cpe/faults", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.query as { deviceId?: string };
    const faults = await genieAcs.listFaults(deviceId);
    res.json({ success: true, data: faults });
  } catch (err) {
    console.error("[coreNetwork] Failed to list CPE faults:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not list faults" });
  }
});

router.post("/cpe/presets", requireAuth, requireRole("owner", "superadmin"), async (req: Request, res: Response): Promise<void> => {
  const { name, preset } = req.body as { name?: string; preset?: Record<string, unknown> };
  if (!name || !preset) {
    res.status(400).json({ success: false, error: "name and preset are required" });
    return;
  }
  try {
    await genieAcs.createPreset(name, preset);
    res.json({ success: true, message: "Preset created" });
  } catch (err) {
    console.error("[coreNetwork] Failed to create GenieACS preset:", err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Could not create preset" });
  }
});

export default router;
