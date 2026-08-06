import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createJweSharedSecret, decryptJweSharedSecret, createJwsSharedSecret,
  verifyAndExtractJweFromJwsSharedSecret, VisaEncryptionError,
} from "../services/visaEncryptionUtils.js";
import { generateXPayToken, visaXPayRequest } from "../services/visaXPayToken.js";

const router: ReturnType<typeof Router> = Router();

interface VisaConfig {
  apiKey: string;
  sharedSecret: string;
  rsaPublicKeyPem: string;
  kid: string;
}

function loadConfig(): VisaConfig {
  return {
    apiKey: process.env.VISA_API_KEY ?? "",
    sharedSecret: process.env.VISA_SHARED_SECRET ?? "",
    rsaPublicKeyPem: process.env.VISA_RSA_PUBLIC_KEY ?? "",
    kid: process.env.VISA_KEY_ID ?? "",
  };
}

// GET /api/visa/status — safe to call anytime, never encrypts/decrypts
// anything, just reports which credential set (if any) is configured.
router.get("/status", requireAuth, requireRole("owner", "superadmin"), (_req: Request, res: Response): void => {
  const c = loadConfig();
  const sharedSecretReady = Boolean(c.apiKey && c.sharedSecret);
  const rsaReady = Boolean(c.rsaPublicKeyPem && c.kid);
  res.json({
    success: true,
    data: {
      sharedSecretConfigured: sharedSecretReady,
      rsaConfigured: rsaReady,
      configured: sharedSecretReady || rsaReady,
      missingForSharedSecret: sharedSecretReady ? [] : ["VISA_API_KEY", "VISA_SHARED_SECRET"].filter(k => !process.env[k]),
      missingForRsa: rsaReady ? [] : ["VISA_RSA_PUBLIC_KEY", "VISA_KEY_ID"].filter(k => !process.env[k]),
    },
  });
});

// POST /api/visa/encrypt — encrypts a payload using the shared-secret flow
// (JWE, then wrapped in a JWS), matching Visa's documented pattern for
// sensitive fields in Visa Developer Platform API requests. Requires
// VISA_API_KEY + VISA_SHARED_SECRET to be set — see DEV_CREDENTIALS.md.
router.post("/encrypt", requireAuth, requireRole("owner", "superadmin"), async (req: Request, res: Response): Promise<void> => {
  const c = loadConfig();
  if (!c.apiKey || !c.sharedSecret) {
    res.status(503).json({
      success: false,
      error: "Visa integration isn't configured yet. Set VISA_API_KEY and VISA_SHARED_SECRET in Railway's environment variables first.",
    });
    return;
  }
  const { payload } = req.body as { payload?: string };
  if (!payload) { res.status(400).json({ success: false, error: "payload (string) is required" }); return; }

  try {
    const iat = Math.floor(Date.now() / 1000);
    const jwe = await createJweSharedSecret(payload, c.apiKey, c.sharedSecret, { iat: Date.now() });
    const jws = await createJwsSharedSecret(jwe, c.sharedSecret, { iat, exp: iat + 300 });
    res.json({ success: true, data: { jwe, jws } });
  } catch (err) {
    const message = err instanceof VisaEncryptionError ? err.message : "Encryption failed";
    res.status(502).json({ success: false, error: message });
  }
});

// POST /api/visa/decrypt — verifies a JWS and decrypts the JWE it wraps,
// the reverse of /encrypt. Useful for confirming a round-trip actually
// works with your real sandbox credentials before this is wired into any
// real Visa API call.
router.post("/decrypt", requireAuth, requireRole("owner", "superadmin"), async (req: Request, res: Response): Promise<void> => {
  const c = loadConfig();
  if (!c.apiKey || !c.sharedSecret) {
    res.status(503).json({
      success: false,
      error: "Visa integration isn't configured yet. Set VISA_API_KEY and VISA_SHARED_SECRET in Railway's environment variables first.",
    });
    return;
  }
  const { jws } = req.body as { jws?: string };
  if (!jws) { res.status(400).json({ success: false, error: "jws (string) is required" }); return; }

  try {
    const jwe = await verifyAndExtractJweFromJwsSharedSecret(jws, c.sharedSecret);
    const plaintext = await decryptJweSharedSecret(jwe, c.sharedSecret);
    res.json({ success: true, data: { plaintext } });
  } catch (err) {
    const message = err instanceof VisaEncryptionError ? err.message : "Decryption failed";
    res.status(400).json({ success: false, error: message });
  }
});

// GET /api/visa/xpaytoken/test-connection — the actual "does my API Key +
// Shared Secret work against Visa's real sandbox" check. Calls Visa's own
// documented "helloworld" endpoint (developer.visa.com's standard sanity-
// check endpoint for X-Pay Token auth specifically), not a made-up one —
// if this succeeds, X-Pay Token signing is genuinely working end to end
// against Visa's servers, not just internally self-consistent.
router.get("/xpaytoken/test-connection", requireAuth, requireRole("owner", "superadmin"), async (_req: Request, res: Response): Promise<void> => {
  const c = loadConfig();
  if (!c.apiKey || !c.sharedSecret) {
    res.status(503).json({
      success: false,
      error: "Visa integration isn't configured yet. Set VISA_API_KEY and VISA_SHARED_SECRET in Railway's environment variables first.",
    });
    return;
  }
  try {
    const data = await visaXPayRequest({
      baseUrl: process.env.VISA_API_BASE_URL ?? "https://sandbox.api.visa.com",
      method: "GET",
      resourcePath: "helloworld",
      apiKey: c.apiKey,
      sharedSecret: c.sharedSecret,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : "Visa API request failed" });
  }
});

// GET /api/visa/xpaytoken/generate — generates a token for a given
// resourcePath without making a real call, useful for debugging a
// mismatch against Visa's own token-validator tooling.
router.post("/xpaytoken/generate", requireAuth, requireRole("owner", "superadmin"), (req: Request, res: Response): void => {
  const c = loadConfig();
  if (!c.apiKey || !c.sharedSecret) {
    res.status(503).json({ success: false, error: "Visa integration isn't configured yet." });
    return;
  }
  const { resourcePath, requestBody } = req.body as { resourcePath?: string; requestBody?: string };
  if (!resourcePath) { res.status(400).json({ success: false, error: "resourcePath is required" }); return; }

  const token = generateXPayToken({ method: "GET", resourcePath, requestBody: requestBody ?? "" }, c.apiKey, c.sharedSecret);
  res.json({ success: true, data: { token } });
});

export default router;
