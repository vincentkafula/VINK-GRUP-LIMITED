import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createOwnerAssociation } from "../services/ownerAssociation.js";

/**
 * The owner's view of their association (docs/OWNER_DASHBOARD.md, slice B), mounted on the owner router, so everything is scoped to the signed-in owner by construction.
 *   GET  /my-association                              each association the owner belongs to (or has asked to join), with membership, standing, routes, what is owed and documents
 *   GET  /my-association/:aid/statement               charges and receipts with a running balance, what is open, and the owner's claims
 *   GET  /my-association/:aid/receipts                the association's numbered receipts to this owner
 *   GET  /my-association/:aid/receipts/:rid.pdf       one receipt, only if it was issued to this owner
 *   GET/POST /my-association/claims, POST .../:id/withdraw   "I have paid": a record that waits for the association to confirm it. The platform holds no money here.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};

export function mountOwnerAssociation(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createOwnerAssociation(db, now), body = json({ limit: "10kb" }), p = (req: Request, k: string) => String(req.params[k]), bad = (res: Response) => fail(res, 400, "Invalid id");
  router.get("/my-association", h(async (req, res) => { res.json({ success: true, ...(await svc.profile(uid(req))) }); }));
  router.get("/my-association/claims", h(async (req, res) => { res.json({ success: true, claims: await svc.claims(uid(req)) }); }));
  router.post("/my-association/claims", body, h(async (req, res) => { const r = await svc.claim(uid(req), req.body ?? {}); if (r.ok && !r.value.duplicate) await audit(db, req, "owner.dues.claim", r.value.id, { associationId: req.body?.associationId, amountCents: req.body?.amountCents }); reply(res, r, r.ok && r.value.duplicate ? 200 : 201); }));
  router.post("/my-association/claims/:id/withdraw", h(async (req, res) => { if (!isUuid(p(req, "id"))) { bad(res); return; } const r = await svc.withdraw(uid(req), p(req, "id")); if (r.ok) await audit(db, req, "owner.dues.withdraw", p(req, "id")); reply(res, r); }));
  router.get("/my-association/:aid/statement", h(async (req, res) => { if (!isUuid(p(req, "aid"))) { bad(res); return; } reply(res, await svc.statement(uid(req), p(req, "aid"))); }));
  router.get("/my-association/:aid/receipts", h(async (req, res) => { if (!isUuid(p(req, "aid"))) { bad(res); return; } reply(res, await svc.receipts(uid(req), p(req, "aid"))); }));
  router.get("/my-association/:aid/receipts/:rid.pdf", h(async (req, res) => {
    if (!isUuid(p(req, "aid")) || !isUuid(p(req, "rid"))) { bad(res); return; } const r = await svc.receiptPdf(uid(req), p(req, "aid"), p(req, "rid")); if (!r.ok) { fail(res, r.status, r.error); return; }
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="receipt-${p(req, "rid").slice(0, 8)}.pdf"`); res.send(r.value);
  }));
}
