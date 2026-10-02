import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { resolvePaymentsConfig, type PaymentsConfig } from "./config.js";
import { getCardServicingProvider } from "./providers/registry.js";
import { redactPan } from "./providers/visaDps.js";
import { GENERIC_TEST_CARDS, MOCK_SCENARIOS } from "./sandbox/testData.js";
import type { ServicedCardStatus } from "./providers/types.js";

/**
 * Staff-only sandbox tools for card servicing (/api/payments/sandbox). Exists to try the Visa sandbox end to end.
 * - 404 in live mode (the whole router disappears)
 * - owner / superadmin only
 * - the only place a card number enters this server, and only to be forwarded; it is never stored or logged
 *   and responses carry the card id and last4 only. Use sandbox TEST card numbers only.
 */
export function createPaymentsSandboxRouter(cfg: PaymentsConfig = resolvePaymentsConfig()): Router {
  const router = Router();
  const servicing = getCardServicingProvider(cfg);

  router.use((_req, res, next) => {
    if (cfg.mode !== "sandbox") { res.status(404).json({ success: false, error: "Endpoint not found" }); return; }
    next();
  });
  router.use(requireAuth, requireRole("owner", "superadmin"));

  const fail = (res: Response, e: unknown) => {
    const err = e as { message?: string; status?: number };
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ success: false, error: redactPan(err.message ?? "Provider error") });
  };

  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        mode: cfg.mode, cardServicingProvider: cfg.cardServicingProvider, issuingProvider: cfg.issuingProvider,
        testCards: GENERIC_TEST_CARDS.map(({ label, brand, scenario }) => ({ label, brand, scenario })), scenarios: MOCK_SCENARIOS,
      },
    });
  });

  router.post("/cards", async (req: Request, res: Response) => {
    const pan = String(req.body?.primaryAccountNumber ?? "").replace(/[ -]/g, "");
    if (!/^[0-9]{16,19}$/.test(pan)) { res.status(400).json({ success: false, error: "primaryAccountNumber must be 16 to 19 digits" }); return; }
    try {
      const { cardId } = await servicing.registerCard({ primaryAccountNumber: pan });
      res.status(201).json({ success: true, data: { cardId, last4: pan.slice(-4) } });
    } catch (e) { fail(res, e); }
  });

  router.get("/cards/:cardId", async (req: Request, res: Response) => {
    try { res.json({ success: true, data: await servicing.getCardDetails(req.params.cardId) }); } catch (e) { fail(res, e); }
  });

  router.get("/cards/:cardId/status", async (req: Request, res: Response) => {
    try { res.json({ success: true, data: await servicing.getCardStatus(req.params.cardId) }); } catch (e) { fail(res, e); }
  });

  router.put("/cards/:cardId/status", async (req: Request, res: Response) => {
    const status = req.body?.status as ServicedCardStatus;
    if (!["active", "frozen", "blocked"].includes(status)) { res.status(400).json({ success: false, error: "status must be active, frozen or blocked" }); return; }
    try { await servicing.setCardStatus(req.params.cardId, status); res.json({ success: true }); } catch (e) { fail(res, e); }
  });

  return router;
}
