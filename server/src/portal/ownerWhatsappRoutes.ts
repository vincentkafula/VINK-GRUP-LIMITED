import { Router, json, type Request, type Response } from "express";
import { h, uid, audit, type Db } from "./common.js";
import { createOwnerWhatsapp } from "../services/ownerWhatsapp.js";

/**
 * The owner's WhatsApp alerts (docs/OWNER_DASHBOARD.md), mounted on the owner router. For the owner's own login only: the team gate refuses it for everyone else (it is not mapped to any team module).
 *   GET    /whatsapp            whether it is available (and why not), the confirmed number (hidden but for its end), what is chosen, when the owner agreed
 *   PUT    /whatsapp/settings   { enabled, kinds, consent }: switch on or off and choose what to be told. Switching on needs consent: true
 *   POST   /whatsapp/test       sends a test message with the real template (three a day)
 *   DELETE /whatsapp            withdraws consent and forgets the choices
 * The number is never written to the audit record, and neither is any message.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
export function mountOwnerWhatsapp(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createOwnerWhatsapp(db, now), body = json({ limit: "10kb" });
  router.get("/whatsapp", h(async (req: Request, res: Response) => { res.json({ success: true, ...(await svc.status(uid(req))) }); }));
  router.put("/whatsapp/settings", body, h(async (req: Request, res: Response) => { const r = await svc.configure(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.whatsapp.settings", null, { enabled: r.value.enabled, kinds: r.value.kinds.length }); reply(res, r); }));
  router.post("/whatsapp/test", h(async (req: Request, res: Response) => { const r = await svc.test(uid(req)); if (r.ok) await audit(db, req, "owner.whatsapp.test", null); reply(res, r); }));
  router.delete("/whatsapp", h(async (req: Request, res: Response) => { const r = await svc.remove(uid(req)); if (r.ok) await audit(db, req, "owner.whatsapp.remove", null); reply(res, r); }));
}
