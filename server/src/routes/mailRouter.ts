import { Router, json, raw, type Response } from "express";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import type { MailService } from "../services/mailService.js";
import { MAX_FILE_BYTES, type MailFiles, type StoredFile } from "../services/mailFiles.js";

/**
 * Department mail for staff, mounted at /api/mail (sign-in required; what a person sees depends on the departments they manage, see mailService.ts).
 *   GET  /departments                          the departments I can use, with how many messages are waiting
 *   GET  /messages?department=&box=&status=    my inbox (website messages and incoming email, newest first) or box=sent
 *   GET  /messages/:kind/:id                   one message (plain text) with the replies already sent    kind: web | email
 *   POST /messages/:kind/:id/reply             { body, attachmentIds? } answer it from the department's address; marks it answered
 *   POST /messages/:kind/:id/status            { status: open | answered | closed }
 *   POST /send                                 { department, to, subject, body, attachmentIds? } a new email from a department's address
 *   PUT  /uploads?name=&type=                  the file itself as the body (octet-stream, up to 50 MB): kept privately until it is sent; answers { file }
 *   DELETE /uploads/:id                        throw away a file that has not been sent
 *   GET  /files/:id                            download a file of a message in a department I manage (always as a download)
 *
 * createShareRouter (below) serves the expiring download links of files that were too big to attach. It needs no sign-in: the link is the secret.
 */
/** Sends a file so a browser downloads it and never shows or runs it: attachment disposition, no sniffing, no caching, no framing. */
function sendDownload(res: Response, f: StoredFile) {
  const ascii = f.filename.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(f.data.length));
  res.end(f.data);
}

/** GET /:token — a file that was sent as a link. */
export function createShareRouter(files: MailFiles): Router {
  const router = Router();
  router.get("/:token", h(async (req, res) => {
    const r = await files.byShareToken(String(req.params.token));
    if (!r.ok) return fail(res, r.status, r.error);
    sendDownload(res, r.value);
  }));
  return router;
}

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
    const r = await d.svc.reply(u, u.username ?? "staff", String(req.params.kind), req.params.id, (req.body ?? {}).body, (req.body ?? {}).attachmentIds);
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
    const r = await d.svc.send(u, u.username ?? "staff", { department: String(b.department ?? ""), to: String(b.to ?? ""), subject: String(b.subject ?? ""), body: String(b.body ?? ""), attachmentIds: b.attachmentIds });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.send", r.value.id, { department: b.department });
    res.status(201).json({ success: true, id: r.value.id });
  }));
  router.put("/uploads", raw({ type: () => true, limit: MAX_FILE_BYTES + 1024 }), h(async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const r = await d.svc.files.stage(me(req).userId, req.query.name, req.query.type, body);
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, file: r.value });
  }));
  router.delete("/uploads/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid file");
    res.json({ success: true, removed: await d.svc.files.discard(me(req).userId, req.params.id) });
  }));
  router.get("/files/:id", h(async (req, res) => {
    const r = await d.svc.openFile(me(req), String(req.params.id));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.download", req.params.id, { name: r.value.filename });
    sendDownload(res, r.value);
  }));
  return router;
}
