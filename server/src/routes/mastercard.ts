import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isConfigured, configStatus, mastercardRequest } from "../services/mastercardClient.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/mastercard/status — safe to call anytime, never makes a signed
// request, just reports whether the integration is configured. Useful for
// a "Connect Mastercard" admin screen to show real setup state instead of
// pretending the integration works when the credentials aren't set yet.
router.get("/status", requireAuth, requireRole("owner", "superadmin"), (_req: Request, res: Response): void => {
  const status = configStatus();
  res.json({
    success: true,
    data: {
      configured: status.configured,
      missingEnvVars: status.missing,
      environment: process.env.MASTERCARD_ENV ?? "sandbox",
    },
  });
});

// POST /api/mastercard/accounts/link — example Open Finance account-link
// initiation. Path and payload shape are illustrative — confirm the exact
// endpoint against whichever specific Mastercard API product you've
// onboarded to in the Developer Portal before relying on this; Mastercard
// has several API families (Open Banking Connect, Send, MDES, etc.) with
// different endpoint structures, and this wasn't verified against a live
// sandbox call in this environment (no network access to Mastercard's
// sandbox from this sandbox, and no signing key was provided to test with).
router.post("/accounts/link", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!isConfigured()) {
    res.status(503).json({
      success: false,
      error: "Mastercard integration isn't configured yet. Set MASTERCARD_CONSUMER_KEY and MASTERCARD_SIGNING_KEY in Railway's environment variables first.",
    });
    return;
  }
  try {
    const data = await mastercardRequest({
      method: "POST",
      path: "/openfinance/accounts/v1/accounts", // confirm against your actual onboarded product
      body: req.body,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : "Mastercard request failed" });
  }
});

export default router;
