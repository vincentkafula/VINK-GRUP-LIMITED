import crypto from "crypto";
import express, { Router, Request, Response } from "express";
import type { TokenCardAuthoriser } from "./issuerRoutes.js";

/**
 * Paymentology FAST endpoint: POST /api/payments/issuer/fast. Paymentology sends every card message here as JSON and VINK answers approve or decline in real time.
 *
 * Message types handled (from Paymentology's public FAST pages):
 *  - 0100 / 0200  authorisation / financial request  -> reply 0110 / 0210 with DE39 "00" (approved) or a decline code
 *  - 0400 / 0420  reversal / reversal advice         -> the purchase on that transaction thread is returned (fully or the stated amount); reply 0410 / 0430
 *  - 0120         authorisation advice               -> acknowledged, reply 0130 DE39 "00"
 *  - 1240         presentment (clearing)             -> acknowledged with HTTP 200 and no body
 * The reply always repeats the TID and RID exactly as received.
 *
 * NOT settled by the public documentation, to confirm with Paymentology before going further than UAT:
 *  - how they authenticate to us (the sandbox here uses a shared secret in the X-API-Key header and answers 501 until one is configured);
 *  - that ISO_MSG.DE2 carries the card's public token (the same value pws_create_card returns as body.token), not the card number;
 *  - the exact reply body for the advice messages and the decline code for a card that is not ours.
 * A request this code cannot read is declined ("30", format error) rather than guessed at.
 */
export interface FastOptions { tokens: TokenCardAuthoriser; secret: string | null; provider?: string }

const REPLY_MTI: Record<string, string> = { "0100": "0110", "0200": "0210", "0400": "0410", "0420": "0430", "0120": "0130" };
const DECLINE: Record<string, string> = { insufficient_funds: "51", limit_exceeded: "61", card_not_active: "62", wallet_inactive: "62", unknown_card: "14", currency_mismatch: "57" };

const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null);

function sameSecret(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest(), y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/** Amount in minor units. Billing_Amount is a decimal in the account currency (rand), so R12.50 arrives as 12.5. */
function cents(v: unknown): number | null {
  const n = num(v);
  return n === null || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
}

function channelOf(m: Record<string, unknown>): string {
  const t = `${str(m.Spend_Type) ?? ""} ${str(m.Card_Use_Type) ?? ""}`.toLowerCase();
  if (/atm|cash/.test(t)) return "atm";
  if (/online|ecom|e-com|internet/.test(t)) return "online";
  return "pos";
}

export function createPaymentologyFastRouter(opts: FastOptions): Router {
  const router = Router();
  const provider = opts.provider ?? "paymentology";

  router.post("/fast", express.json({ limit: "100kb" }), async (req: Request, res: Response) => {
    if (!opts.secret) { res.status(501).json({ error: "fast_not_configured" }); return; }
    const given = req.header("x-api-key") ?? "";
    if (!given || !sameSecret(given, opts.secret)) { res.status(401).json({ error: "unauthorised" }); return; }

    const m = (req.body ?? {}) as Record<string, unknown>;
    const mti = str(m.Message_Type), tid = str(m.TID), rid = str(m.RID);
    const iso = (m.ISO_MSG && typeof m.ISO_MSG === "object" ? m.ISO_MSG : {}) as Record<string, unknown>;
    const reply = (code: string) => res.json({ Message_Type: REPLY_MTI[mti ?? ""] ?? "0110", TID: m.TID ?? tid, RID: m.RID ?? rid, DE39: code });

    if (!mti) { res.status(400).json({ error: "malformed_request" }); return; }
    if (mti === "1240") { res.status(200).end(); return; }                                                    // clearing: nothing to decide
    if (mti === "0120") { reply("00"); return; }                                                               // advice: acknowledged
    if (!REPLY_MTI[mti]) { res.status(400).json({ error: "unsupported_message" }); return; }
    if (!tid || !rid) { reply("30"); return; }

    try {
      if (mti === "0400" || mti === "0420") {
        const amount = cents(m.Billing_Amount);
        await opts.tokens.reverse({ provider, threadId: tid, amountCents: amount && amount > 0 ? amount : undefined, reversalId: rid });
        reply("00");                                                                                            // never leave a reversal unanswered; an unknown purchase has nothing to return
        return;
      }
      const card = str(iso.DE2), amount = cents(m.Billing_Amount);
      if (!card || amount === null) { reply("30"); return; }
      if (amount === 0) {                                                                                       // a card check with no amount: is it ours and live?
        const live = opts.tokens.isActive ? await opts.tokens.isActive(provider, card) : null;
        reply(live === null ? "14" : live ? "00" : "62");
        return;
      }
      const t = await opts.tokens.authorise({ provider, providerCardId: card, authorisationId: `${tid}:${rid}`, amountCents: amount, currency: "ZAR", channel: channelOf(m), merchant: str(m.Merchant_Name) ?? str(iso.DE43) ?? undefined });
      if (!t) { reply("14"); return; }                                                                          // not a VINK card
      reply(t.approved ? "00" : (DECLINE[t.reason ?? ""] ?? "05"));
    } catch (e) {
      console.error("[fast] failed:", (e as Error).message);
      reply("96");                                                                                              // system malfunction: Paymentology treats it as a decline
    }
  });

  return router;
}
