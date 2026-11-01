import { Router, json } from "express";
import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { h, fail } from "../portal/common.js";
import type { Identity } from "../services/sumsub/identity.js";

/**
 * Confirming that a real person is applying, for every kind of application (mounted at /api/identity). The applicant proves the application is theirs by its
 * reference with the email address on it, or by being signed in as its owner (some applications were sent before the customer had a login).
 *   POST /api/identity/status   { kind, ref, email?, party? }            where their check stands and what to do next (60 an hour per address)
 *   POST /api/identity/token    { kind, ref, email?, consent, party? }   starts or resumes it and returns the short-lived token for Sumsub's widget (15 an hour)
 * party is "person" (the default: is the applicant who they say?) or "company" (is the business behind a business or corporate application real? KYB).
 * kind is "application" (accounts, credit cards, loans, SIM, services: VNK-... references) or "sponsorship" (SP-... references).
 */
const limiter = (max: number, error: string) => rateLimit({ windowMs: 3600_000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, error } });

export function createIdentityRouter(d: { identity: Identity; kyb?: Identity; auth: RequestHandler }): Router {
  /** The check being asked about: the person (the default), or the business. undefined: not a party we know. null: business verification is not available at all. */
  const engine = (party: unknown): Identity | null | undefined => (party === undefined || party === "person" ? d.identity : party === "company" ? d.kyb ?? null : undefined);
  const NO_BUSINESS = { party: "company", enabled: false, status: "not_started", canStart: false, consentRequired: true, required: false, message: "", attempts: 0 };
  const router = Router();
  /** Signed in as a customer, the account's own email (their login name) is as good as typing it. */
  const proof = (req: Request) => { const b = (req.body ?? {}) as { email?: unknown }; return { email: b.email || req.user?.username || "", userId: req.user?.userId ?? null }; };

  router.post("/status", limiter(60, "Too many lookups. Please try again later."), json({ limit: "2kb" }), d.auth, h(async (req, res) => {
    const b = (req.body ?? {}) as { kind?: unknown; ref?: unknown; party?: unknown }; const p = proof(req); const identity = engine(b.party);
    if (identity === undefined) return fail(res, 400, "Unknown kind of check");
    if (identity === null) { res.json({ success: true, data: NO_BUSINESS }); return; }                         // no business verification here: show nothing
    const r = await identity.statusFor(b.kind, b.ref, p.email, p.userId);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, data: r.view });
  }));

  router.post("/token", limiter(15, "Too many attempts. Please try again later, or contact us."), json({ limit: "2kb" }), d.auth, h(async (req, res) => {
    const b = (req.body ?? {}) as { kind?: unknown; ref?: unknown; consent?: unknown; party?: unknown }; const p = proof(req); const identity = engine(b.party);
    if (identity === undefined) return fail(res, 400, "Unknown kind of check");
    if (identity === null) return fail(res, 503, "Business verification is not switched on yet. Please check back soon, or contact us.");
    const r = await identity.startSession(b.kind, b.ref, p.email, b.consent, p.userId);
    if (!r.ok) return fail(res, r.status, r.error);
    res.setHeader("Cache-Control", "no-store");                                  // the token opens this person's check: nothing should keep a copy
    res.json({ success: true, data: { token: r.token, expiresInSecs: r.expiresInSecs, status: r.status } });
  }));

  return router;
}
