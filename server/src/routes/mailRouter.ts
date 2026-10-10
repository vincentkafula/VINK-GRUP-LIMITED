import { Router, json, raw, type Response } from "express";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import type { MailService } from "../services/mailService.js";
import { MAX_FILE_BYTES, type MailFiles, type StoredFile } from "../services/mailFiles.js";

/**
 * Department mail for staff, mounted at /api/mail (sign-in required; what a person sees depends on the departments they manage, see mailService.ts).
 *   GET  /departments                          the departments I can use, with how many messages are waiting
 *   GET  /messages?department=&box=&status=&q= my mail, newest first. box: inbox | starred | spam | trash | sent | all. q: a search (from:, subject:, has:attachment, is:starred, after:, "phrases", -word)
 *   GET  /messages/:kind/:id                   one message (plain text) with the replies already sent    kind: web | email
 *   POST /messages/:kind/:id/reply             { body, attachmentIds? } answer it from the department's address; marks it answered
 *   POST /messages/:kind/:id/status            { status: open | answered | closed }
 *   POST /messages/:kind/:id/folder            { folder: inbox | spam | trash, blockSender? } move it (spam can also block the sender: their email then goes straight to spam)
 *   POST /messages/:kind/:id/star              { starred }
 *   GET  /drafts?department=                   my unsent emails and replies
 *   POST /drafts                               { id?, department, to, subject, body, replyKind?, replyId?, attachmentIds? } save as I type; an empty draft is thrown away
 *   DELETE /drafts/:id                         discard a draft
 *   POST /messages/:kind/:id/snooze            { until } hide it until then (an ISO time up to a year ahead), or { until: null } to bring it back
 *   POST /messages/:kind/:id/labels            { labelId, on } put a label on it or take it off
 *   POST /schedule                             like /send, plus { sendAt } (up to 6 days ahead); for a reply send { kind, id, body } or { replyKind, replyId, body }
 *   GET  /scheduled?department=   DELETE /scheduled/:id      emails waiting to be sent; cancel one
 *   GET  /signature?department=   PUT /signature   POST /signature/preview     my signature (name, title, phone, photo) in the VINK design
 *   GET/POST /templates?department=   DELETE /templates/:id                   reusable replies
 *   GET/POST /labels?department=      DELETE /labels/:id                       labels (colour-coded tags)
 *   GET/POST /filters?department=     DELETE /filters/:id                      rules applied to each new email
 *   GET/PUT  /autoreply?department=                                           the department's out-of-office reply
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
    const r = await d.svc.list(me(req), { department: typeof q.department === "string" && q.department ? q.department : undefined, box: typeof q.box === "string" ? q.box : undefined, status: typeof q.status === "string" ? q.status : undefined, q: typeof q.q === "string" ? q.q : undefined, label: typeof q.label === "string" ? q.label : undefined });
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
    const r = await d.svc.reply(u, u.username ?? "staff", String(req.params.kind), req.params.id, (req.body ?? {}).body, (req.body ?? {}).attachmentIds, (req.body ?? {}).bodyHtml);          // the reply draft is removed by the service once the reply has gone
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
    const r = await d.svc.send(u, u.username ?? "staff", { department: String(b.department ?? ""), to: String(b.to ?? ""), subject: String(b.subject ?? ""), body: String(b.body ?? ""), bodyHtml: b.bodyHtml, attachmentIds: b.attachmentIds, draftId: b.draftId });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.send", r.value.id, { department: b.department });
    res.status(201).json({ success: true, id: r.value.id });
  }));
  router.post("/messages/:kind/:id/folder", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await d.svc.setFolder(me(req), String(req.params.kind), req.params.id, b.folder, b.blockSender === true);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.folder", req.params.id, { folder: r.value.folder, blockSender: b.blockSender === true });
    res.json({ success: true, ...r.value });
  }));
  router.post("/messages/:kind/:id/star", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const r = await d.svc.setStar(me(req), String(req.params.kind), req.params.id, (req.body ?? {}).starred);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.get("/drafts", h(async (req, res) => {
    const r = await d.svc.listDrafts(me(req), String(req.query.department ?? ""));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, drafts: r.value });
  }));
  router.post("/drafts", h(async (req, res) => {
    const r = await d.svc.saveDraft(me(req), (req.body ?? {}) as Record<string, unknown>);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, id: r.value.id });
  }));
  router.delete("/drafts/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid draft");
    res.json({ success: true, removed: await d.svc.deleteDraft(me(req), req.params.id) });
  }));
  const dept = (req: { query: Record<string, unknown> }) => String(req.query.department ?? "");
  const body = (req: { body?: unknown }) => ((req.body ?? {}) as Record<string, unknown>);
  router.post("/messages/:kind/:id/snooze", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const r = await d.svc.setSnooze(me(req), String(req.params.kind), req.params.id, body(req).until);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.post("/messages/:kind/:id/labels", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid message");
    const r = await d.svc.setMessageLabel(me(req), String(req.params.kind), req.params.id, body(req).labelId, body(req).on);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.post("/schedule", h(async (req, res) => {
    const u = me(req), b = body(req);
    const r = await d.svc.schedule(u, u.username ?? "staff", { ...b, replyKind: (b.kind ?? b.replyKind) as never, replyId: (b.id ?? b.replyId) as never, department: String(b.department ?? ""), to: String(b.to ?? ""), subject: String(b.subject ?? ""), body: String(b.body ?? "") });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.schedule", r.value.id, { sendAt: r.value.sendAt });
    res.status(201).json({ success: true, ...r.value });
  }));
  router.get("/scheduled", h(async (req, res) => {
    const r = await d.svc.listScheduled(me(req), dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, scheduled: r.value });
  }));
  router.delete("/scheduled/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    const r = await d.svc.cancelScheduled(me(req), req.params.id);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.schedule.cancel", req.params.id, {});
    res.json({ success: true, ...r.value });
  }));
  router.get("/signature", h(async (req, res) => {
    const u = me(req);
    const r = await d.svc.getSignature(u, u.username ?? "", dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, signature: r.value });
  }));
  router.put("/signature", h(async (req, res) => {
    const u = me(req), b = body(req);
    const r = await d.svc.saveSignature(u, u.username ?? "", String(b.department ?? ""), b);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, signature: r.value });
  }));
  router.post("/signature/preview", h(async (req, res) => {
    const b = body(req);
    const r = await d.svc.previewSignature(me(req), String(b.department ?? ""), b);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.get("/templates", h(async (req, res) => {
    const r = await d.svc.listTemplates(me(req), dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, templates: r.value });
  }));
  router.post("/templates", h(async (req, res) => {
    const r = await d.svc.saveTemplate(me(req), body(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, template: r.value });
  }));
  router.delete("/templates/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    const r = await d.svc.deleteTemplate(me(req), req.params.id);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.get("/labels", h(async (req, res) => {
    const r = await d.svc.listLabels(me(req), dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, labels: r.value });
  }));
  router.post("/labels", h(async (req, res) => {
    const b = body(req);
    const r = await d.svc.createLabel(me(req), b.department, b.name, b.color);
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, label: r.value });
  }));
  router.delete("/labels/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    const r = await d.svc.deleteLabel(me(req), req.params.id);
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, ...r.value });
  }));
  router.get("/filters", h(async (req, res) => {
    const r = await d.svc.listFilters(me(req), dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, filters: r.value });
  }));
  router.post("/filters", h(async (req, res) => {
    const r = await d.svc.saveFilter(me(req), body(req));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.filter", r.value.id, {});
    res.status(201).json({ success: true, ...r.value });
  }));
  router.delete("/filters/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    const r = await d.svc.deleteFilter(me(req), req.params.id);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.filter.delete", req.params.id, {});
    res.json({ success: true, ...r.value });
  }));
  router.get("/autoreply", h(async (req, res) => {
    const r = await d.svc.getAutoreply(me(req), dept(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.json({ success: true, autoreply: r.value });
  }));
  router.put("/autoreply", h(async (req, res) => {
    const r = await d.svc.saveAutoreply(me(req), body(req));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "mail.autoreply", r.value.department, { enabled: r.value.enabled });
    res.json({ success: true, autoreply: r.value });
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
