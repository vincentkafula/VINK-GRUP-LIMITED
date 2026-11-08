import { Router, json, type Request, type Response } from "express";
import { h, uid, audit, type Db } from "./common.js";
import { createOwnerSms } from "../services/ownerSms.js";
import { createSmsSender, type SmsSender } from "../services/alerts.js";

/**
 * The owner's text alerts (docs/OWNER_DASHBOARD.md, slice F3), mounted on the owner router. For the owner's own login only: the team gate refuses it for everyone else (it is not mapped to any module).
 *   GET    /sms                 whether text alerts are possible, the number (hidden but for its end), whether it is confirmed, what is chosen
 *   POST   /sms/phone           { phone }: saves a number and texts it a code
 *   POST   /sms/verify          { code }: confirms the number
 *   PUT    /sms/settings        { enabled, kinds }: switch on or off and choose what to be told
 *   POST   /sms/test            texts a test message (three a day)
 *   DELETE /sms                 deletes the number and every choice
 * The number itself is never written to the audit record.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
export interface SmsDeps { sms?: SmsSender }

export function mountOwnerSms(router: Router, db: Db, now: () => Date = () => new Date(), deps: SmsDeps = {}): void {
  const svc = createOwnerSms({ db, sms: deps.sms ?? createSmsSender(), now }), body = json({ limit: "10kb" });
  router.get("/sms", h(async (req: Request, res: Response) => { res.json({ success: true, ...(await svc.status(uid(req))) }); }));
  router.post("/sms/phone", body, h(async (req, res) => { const r = await svc.setPhone(uid(req), req.body?.phone); if (r.ok) await audit(db, req, "sms.phone", null); reply(res, r); }));
  router.post("/sms/verify", body, h(async (req, res) => { const r = await svc.verify(uid(req), req.body?.code); if (r.ok) await audit(db, req, "sms.verify", null); reply(res, r); }));
  router.put("/sms/settings", body, h(async (req, res) => { const r = await svc.configure(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "sms.settings", null, { enabled: r.value.enabled, kinds: r.value.kinds }); reply(res, r); }));
  router.post("/sms/test", h(async (req, res) => { const r = await svc.test(uid(req)); if (r.ok) await audit(db, req, "sms.test", null); reply(res, r); }));
  router.delete("/sms", h(async (req, res) => { const r = await svc.remove(uid(req)); if (r.ok) await audit(db, req, "sms.remove", null); reply(res, r); }));
}
