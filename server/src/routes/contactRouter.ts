import { Router, json } from "express";
import rateLimit from "express-rate-limit";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import type { ContactService } from "../services/contactService.js";
import { DEPARTMENTS } from "../config/departments.js";

/**
 * POST /api/contact                       { department, name, email, phone?, subject?, message, website? }  a message to a VINK department (public)
 * GET  /api/contact/departments           the departments a message can be sent to (public)
 *
 * Staff (mounted at /api/admin/contact, owner and superadmin):
 *   GET  /                                 messages, newest first (?department=&status=)
 *   POST /:id/status                       { status: open | answered | closed }
 *   POST /retry                            try again now for messages that did not reach their department
 *
 * The public route is limited to 8 messages an hour per address, and a hidden field catches simple bots. The message is stored before any email is sent.
 */
export function createContactRouter(svc: ContactService): Router {
  const router = Router();
  router.get("/departments", (_req, res) => { res.json({ success: true, departments: DEPARTMENTS.map(({ key, name, address, purpose, respondWithin }) => ({ key, name, address, purpose, respondWithin })) }); });
  router.post("/", rateLimit({ windowMs: 3600_000, max: 8, standardHeaders: true, legacyHeaders: false, message: { success: false, error: "You have sent several messages already. Please try again later, or email us directly." } }),
    json({ limit: "20kb" }), h(async (req, res) => {
      const r = await svc.submit((req.body ?? {}) as Record<string, unknown>);
      if (!r.ok) return fail(res, r.status, r.error);
      res.status(201).json({ success: true, data: { ref: r.ref, department: r.department, message: `Thank you. Your reference is ${r.ref}. You can expect a reply within ${r.respondWithin}.` } });
    }));
  return router;
}

export function createContactAdminRouter(d: { db: Db; svc: ContactService }): Router {
  const router = Router();
  router.get("/", h(async (req, res) => {
    res.json({ success: true, messages: await d.svc.list({ department: typeof req.query.department === "string" ? req.query.department : undefined, status: typeof req.query.status === "string" ? req.query.status : undefined }) });
  }));
  router.post("/retry", h(async (req, res) => { const sent = await d.svc.retryUnsent(); await audit(d.db, req, "contact.retry", null, { sent }); res.json({ success: true, sent }); }));
  router.post("/:id/status", json({ limit: "2kb" }), h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    if (!(await d.svc.setStatus(req.params.id, (req.body ?? {}).status))) return fail(res, 400, "Choose open, answered or closed for an existing message");
    await audit(d.db, req, "contact.status", req.params.id, { status: req.body.status });
    res.json({ success: true });
  }));
  return router;
}
