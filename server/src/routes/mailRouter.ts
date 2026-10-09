import { Router, json } from "express";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import type { MailService } from "../services/mailService.js";

/**
 * Department mail for staff, mounted at /api/mail (sign-in required; what a person sees depends on the departments they manage, see mailService.ts).
 *   GET  /departments                          the departments I can use, with how many messages are waiting
 *   GET  /messages?department=&box=&status=    my inbox (website messages and incoming email, newest first) or box=sent
 *   GET  /messages/:kind/:id                   one message (plain text) with the replies already sent    kind: web | email
 *   POST /messages/:kind/:id/reply             { body } answer it from the department's address; marks it answered
 *   POST /messages/:kind/:id/status            { status: open | answered | closed }
 *   POST /send                                 { department, to, subject, body } a new email from a department's address
 */
export function createMailRouter(d: { db: Db; svc: MailService }): Router {
  const router = Router();
  router.use(json({ limit: "64kb" }));
  const me = (req: { user?: { userId: string; role: string; username?: string } }) => req.user!;

  router.get("/departments", h(async (req, res) => { res.json({ success: true, departments: await d.svc.unread(me(req)) }); }));
  router.get("/messages", h(async (req, res) => {
    const q = req.query;
    const r = await d.svc.list(me(req), { department: typeof q.department === "string" && q.department ? q.department : undefined, box: typeof q.box === "string" ? q.box : undefined, status: typeof q.status === "string" ? q.status : undefined });
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, messages: r.value });
  }));
  router.get("/messages/:kind/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const r = await d.svc.get(me(req), String(req.params.kind), req.params.id);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, message: r.value });
  }));
  router.post("/messages/:kind/:id/reply", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const u = me(req);
    const r = await d.svc.reply(u, u.username ?? "staff", String(req.params.kind), req.params.id, (req.body ?? {}).body);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.reply", req.params.id, { kind: req.params.kind });
    res.status(201).json({ success: true, id: r.value.id });
  }));
  router.post("/messages/:kind/:id/status", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const r = await d.svc.setStatus(me(req), String(req.params.kind), req.params.id, (req.body ?? {}).status);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.status", req.params.id, { status: r.value.status });
    res.json({ success: true, status: r.value.status });
  }));
  router.post("/send", h(async (req, res) => {
    const u = me(req), b = (req.body ?? {}) as Record<string, unknown>;
    const r = await d.svc.send(u, u.username ?? "staff", { department: String(b.department ?? ""), to: String(b.to ?? ""), subject: String(b.subject ?? ""), body: String(b.body ?? "") });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.send", r.value.id, { department: b.department });
    res.status(201).json({ success: true, id: r.value.id });
  }));
  return router;
}
