import express, { Router, Request, Response } from "express";
import type { PaymentsConfig } from "./config.js";
import { getIssuingProvider } from "./providers/registry.js";
import { NotConfiguredError } from "./providers/types.js";

/**
 * Real-time authorisation endpoint for the card issuer-processor: POST /api/payments/issuer/authorisation.
 *
 * For every card purchase the processor asks us "approve or decline?" and expects an answer within a tight deadline.
 *  - the signature is checked by the selected provider adapter (each processor signs differently)
 *  - the body must be the RAW bytes (this router is mounted before the global JSON parser)
 *  - retries are normal: the decision is idempotent per authorisation id (see cards.authoriseFromProvider), so a repeat
 *    returns the first answer and never spends the money twice
 *  - anything we cannot decide is a decline with a reason, never a server error
 *
 * The request shape accepted here is OUR normalised event, produced by the mock issuer in sandbox:
 *   { id, type: "card.authorisation", data: { providerCardId, amount: { amount (cents), currency }, channel, merchantName } }
 * Paymentology's real format is not known yet: its adapter must translate it into this shape. Until then it answers 501.
 */
export interface IssuerAuthoriser {
  cards: { authoriseFromProvider(a: { provider: string; authorisationId: string; providerCardId: string; amount: number; currency?: string; channel?: string; descriptor?: string }): { id: string | null; approved: boolean; reason: string | null; replayed: boolean } };
}

export function createIssuerRouter(cfg: PaymentsConfig, core: IssuerAuthoriser): Router {
  const router = Router();
  const issuer = getIssuingProvider(cfg);

  router.post("/authorisation", express.raw({ type: "*/*", limit: "100kb" }), (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let evt;
    try {
      evt = issuer.verifyWebhook(raw, req.headers, { allowReplay: true });
    } catch (e) {
      if (e instanceof NotConfiguredError) { res.status(501).json({ approved: false, reason: "provider_not_configured" }); return; }
      res.status(401).json({ approved: false, reason: "bad_signature" });
      return;
    }
    const d = evt.data as { providerCardId?: unknown; amount?: { amount?: unknown; currency?: unknown }; channel?: unknown; merchantName?: unknown } | undefined;
    if (evt.type !== "card.authorisation" || !d || typeof d.providerCardId !== "string") {
      res.status(400).json({ approved: false, reason: "malformed_request" });
      return;
    }
    try {
      const r = core.cards.authoriseFromProvider({
        provider: issuer.name,
        authorisationId: evt.id,
        providerCardId: d.providerCardId,
        amount: d.amount?.amount as number,
        currency: typeof d.amount?.currency === "string" ? d.amount.currency : undefined,
        channel: typeof d.channel === "string" ? d.channel : undefined,
        descriptor: typeof d.merchantName === "string" ? d.merchantName : undefined,
      });
      res.json({ approved: r.approved, reason: r.reason ?? undefined, replayed: r.replayed });
    } catch (e) {
      // Never leave the processor without an answer, and never leak internals.
      console.error("[issuer] authorisation failed:", (e as Error).message);
      res.status(200).json({ approved: false, reason: "system_error" });
    }
  });

  return router;
}
