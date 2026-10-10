import express, { Router, json, type Request } from "express";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import { verifyWaSignature, waReady, type WaConfig } from "../services/whatsapp/cloud.js";
import type { WhatsAppService } from "../services/whatsapp/whatsappService.js";

/**
 * WhatsApp, three routers:
 *   createWhatsAppWebhookRouter  /api/webhooks/whatsapp   Meta calls this. GET answers the set-up handshake (WHATSAPP_VERIFY_TOKEN); POST carries messages and delivery updates,
 *                                signed with the app secret (the raw body is needed to check it, so it is mounted before the JSON parser). A message with a bad signature is refused.
 *   createWhatsAppInfoRouter     /api/whatsapp/info       public: whether chat is on, and the link the website's button and QR code open
 *   createWhatsAppRouter         /api/admin/whatsapp      staff, behind sign-in; what a person sees depends on the departments they manage (the same as department mail)
 *      GET /summary · GET /conversations?department=&status= · GET /conversations/:id · POST /conversations/:id/reply { body }
 *      POST /conversations/:id/status { status } · POST /conversations/:id/department { department } · POST /notify { to, template, language?, params? } (Super Administrators)
 */
export function createWhatsAppWebhookRouter(d: { svc: WhatsAppService; config: WaConfig }) {
  const router = Router();
  router.get("/", (req, res) => {
    const ok = req.query["hub.mode"] === "subscribe" && !!d.config.verifyToken && req.query["hub.verify_token"] === d.config.verifyToken;
    if (!ok) { res.status(403).send("Forbidden"); return; }
    res.status(200).type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  });
  router.post("/", express.raw({ type: "*/*", limit: "1mb" }), h(async (req, res) => {
    if (!d.config.appSecret) { res.status(501).json({ success: false, error: "WhatsApp is not configured" }); return; }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyWaSignature(raw, req.headers["x-hub-signature-256"], d.config.appSecret)) { res.status(401).json({ success: false, error: "Bad signature" }); return; }
    let payload: unknown; try { payload = JSON.parse(raw.toString("utf8")); } catch { res.status(400).json({ success: false, error: "Not JSON" }); return; }
    await d.svc.handleWebhook(payload);
    res.status(200).json({ success: true });
  }));
  return router;
}

export function createWhatsAppInfoRouter(d: { config: WaConfig }) {
  const router = Router();
  router.get("/info", (_req, res) => {
    const on = waReady(d.config) && !!d.config.number;
    res.set("Cache-Control", "public, max-age=300").json({ success: true, enabled: on, number: on ? d.config.number : null, link: on ? `https://wa.me/${d.config.number}?text=${encodeURIComponent("Hi VINK")}` : null });
  });
  return router;
}

export function createWhatsAppRouter(d: { db: Db; svc: WhatsAppService }) {
  const router = Router();
  router.use(json({ limit: "16kb" }));
  const me = (req: Request) => ({ userId: req.user!.userId, role: req.user!.role, username: req.user!.username });
  const id = (req: Request) => (isUuid(req.params.id) ? String(req.params.id) : null);

  router.get("/summary", h(async (req, res) => { res.json({ success: true, departments: await d.svc.summary(me(req)) }); }));
  router.get("/conversations", h(async (req, res) => {
    const r = await d.svc.list(me(req), { department: typeof req.query.department === "string" ? req.query.department : undefined, status: typeof req.query.status === "string" ? req.query.status : undefined });
    if (!r.ok) return fail(res, r.status, r.error); res.json({ success: true, conversations: r.value });
  }));
  router.get("/conversations/:id", h(async (req, res) => {
    const i = id(req); if (!i) return fail(res, 404, "No such chat");
    const r = await d.svc.get(me(req), i); if (!r.ok) return fail(res, r.status, r.error); res.json({ success: true, ...r.value });
  }));
  router.post("/conversations/:id/reply", h(async (req, res) => {
    const i = id(req); if (!i) return fail(res, 404, "No such chat");
    const r = await d.svc.reply(me(req), i, (req.body as { body?: unknown })?.body); if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "whatsapp.reply", i, {}); res.json({ success: true, ...r.value });
  }));
  router.post("/conversations/:id/status", h(async (req, res) => {
    const i = id(req); if (!i) return fail(res, 404, "No such chat");
    const r = await d.svc.setStatus(me(req), i, (req.body as { status?: unknown })?.status); if (!r.ok) return fail(res, r.status, r.error); res.json({ success: true, ...r.value });
  }));
  router.post("/conversations/:id/department", h(async (req, res) => {
    const i = id(req); if (!i) return fail(res, 404, "No such chat");
    const r = await d.svc.transfer(me(req), i, (req.body as { department?: unknown })?.department); if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "whatsapp.transfer", i, { department: r.value.department }); res.json({ success: true, ...r.value });
  }));
  router.post("/notify", h(async (req, res) => {
    if (!["owner", "superadmin"].includes(req.user!.role)) return fail(res, 403, "Only a Super Administrator can send alerts");
    const b = (req.body ?? {}) as { to?: unknown; template?: unknown; language?: unknown; params?: unknown };
    if (typeof b.to !== "string" || typeof b.template !== "string") return fail(res, 400, "Send { to, template }");
    const r = await d.svc.notify({ to: b.to, template: b.template, language: typeof b.language === "string" ? b.language : undefined, params: Array.isArray(b.params) ? b.params.map(String) : [] });
    if (!r.ok) return fail(res, r.status, r.error); await audit(d.db, req, "whatsapp.notify", null, { template: b.template }); res.json({ success: true, ...r.value });
  }));
  return router;
}
