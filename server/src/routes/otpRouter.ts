import { Router, Request, Response } from "express";
import crypto from "crypto";

const router: ReturnType<typeof Router> = Router();

/**
 * OTP send/verify. Unblocks the Personal application form's identity-
 * verification step, which was calling a dead orphaned endpoint and could
 * never succeed -- not a cosmetic issue, it meant nobody could ever reach
 * the submission step at all.
 *
 * The verification logic here is real: random codes, hashed storage (not
 * plaintext), expiry, attempt limiting, one-time use. What's NOT real yet:
 * actual delivery. No SMS/email provider is configured, so the generated
 * code is returned directly in the response as demoCode -- which the
 * frontend's type already anticipated (ApiResult.demoCode was already in
 * applicationsApi.ts's types before this file existed), so this isn't a
 * new shortcut invented here, it's completing what was already designed
 * for. Wire a real provider (Twilio/SendGrid, same env-var-only pattern as
 * every other integration this session) and stop returning demoCode once
 * one exists -- everything else in this file works unchanged.
 */

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
}

const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map<string, OtpRecord>();

function hashCode(code: string, destination: string): string {
  return crypto.createHash("sha256").update(`${code}:${destination}`).digest("hex");
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of otpStore) {
    if (record.expiresAt < now) otpStore.delete(key);
  }
}, 5 * 60_000);

router.post("/send", async (req: Request, res: Response): Promise<void> => {
  const { destination, channel } = req.body as { destination?: string; channel?: "sms" | "email" };
  if (!destination?.trim()) {
    res.status(400).json({ success: false, error: "destination is required" });
    return;
  }
  const ch = channel === "email" ? "email" : "sms";
  const key = `${ch}:${destination.trim().toLowerCase()}`;

  const code = generateCode();
  otpStore.set(key, { codeHash: hashCode(code, destination), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, verified: false });

  res.json({ success: true, demoCode: code, data: { sent: true, demoCode: code } });
});

router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  const { destination, code } = req.body as { destination?: string; code?: string };
  if (!destination?.trim() || !code?.trim()) {
    res.status(400).json({ success: false, error: "destination and code are required" });
    return;
  }

  const key = otpStore.has(`sms:${destination.trim().toLowerCase()}`) ? `sms:${destination.trim().toLowerCase()}` : `email:${destination.trim().toLowerCase()}`;
  const record = otpStore.get(key);

  if (!record) {
    res.status(400).json({ success: false, error: "No code was sent to this destination, or it already expired -- request a new one." });
    return;
  }
  if (record.verified) {
    res.status(400).json({ success: false, error: "This code was already used -- request a new one." });
    return;
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    res.status(400).json({ success: false, error: "Code expired -- request a new one." });
    return;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    res.status(429).json({ success: false, error: "Too many incorrect attempts -- request a new code." });
    return;
  }

  record.attempts++;
  if (hashCode(code.trim(), destination) !== record.codeHash) {
    res.status(400).json({ success: false, error: "Incorrect code." });
    return;
  }

  record.verified = true;
  res.json({ success: true, data: { verified: true } });
});

export default router;
