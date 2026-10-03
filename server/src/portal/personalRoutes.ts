import { Router, json } from "express";
import { h, uid, iso, text, optText, fail, type Db } from "./common.js";

/**
 * The Personal (passenger) account API, mounted at /api/portal/personal (personal accounts only).
 *
 *   GET/PUT /profile          who I am + saved details (phone, home area, favourite route, emergency contact)
 *   GET/POST /support         my support requests; send a new one
 *
 * Online payments, payment history, receipts and banking are NOT here: a personal account uses the same Manshya payments and banking
 * dashboard as a customer (see manshya/access.ts), opened from the "Payments & banking" tab. Trip history has no data source yet
 * (fare taps are not linked to a passenger), so the dashboard shows an empty state for it rather than inventing records.
 */
const PHONE = /^[+0-9 ()-]{7,20}$/;

export function createPersonalRouter(db: Db): Router {
  const router = Router();
  const body = json({ limit: "10kb" });

  router.get("/", (req, res) => { res.json({ success: true, role: "personal", user: { id: uid(req), username: req.user!.username } }); });

  router.get("/profile", h(async (req, res) => {
    const u = (await db.query(`SELECT username, name, email FROM users WHERE id = $1`, [uid(req)])).rows[0];
    const p = (await db.query(`SELECT phone, home_area, favourite_route, emergency_contact_name, emergency_contact_phone FROM personal_profiles WHERE user_id = $1`, [uid(req)])).rows[0];
    res.json({
      success: true, user: { username: u?.username, name: u?.name, email: u?.email },
      profile: { phone: p?.phone ?? null, homeArea: p?.home_area ?? null, favouriteRoute: p?.favourite_route ?? null, emergencyContactName: p?.emergency_contact_name ?? null, emergencyContactPhone: p?.emergency_contact_phone ?? null },
    });
  }));

  router.put("/profile", body, h(async (req, res) => {
    const b = req.body ?? {};
    const phone = optText(b.phone, 20), home = optText(b.home_area, 120), fav = optText(b.favourite_route, 120), en = optText(b.emergency_contact_name, 80), ep = optText(b.emergency_contact_phone, 20);
    if ([phone, home, fav, en, ep].some((v) => v === undefined)) { fail(res, 400, "One of the fields is too long"); return; }
    if ((phone && !PHONE.test(phone)) || (ep && !PHONE.test(ep))) { fail(res, 400, "A phone number is not valid"); return; }
    await db.query(
      `INSERT INTO personal_profiles (user_id, phone, home_area, favourite_route, emergency_contact_name, emergency_contact_phone, updated_at) VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (user_id) DO UPDATE SET phone=$2, home_area=$3, favourite_route=$4, emergency_contact_name=$5, emergency_contact_phone=$6, updated_at=now()`,
      [uid(req), phone, home, fav, en, ep]);
    res.json({ success: true });
  }));

  router.get("/support", h(async (req, res) => {
    const r = (await db.query(`SELECT id, subject, message, status, created_at FROM support_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [uid(req)])).rows;
    res.json({ success: true, requests: r.map((x) => ({ id: x.id, subject: x.subject, message: x.message, status: x.status, at: iso(x.created_at) })) });
  }));

  router.post("/support", body, h(async (req, res) => {
    const subject = text(req.body?.subject, 120), message = text(req.body?.message, 2000);
    if (!subject || !message) { fail(res, 400, "Please add a subject (up to 120 characters) and a message (up to 2000)"); return; }
    // A simple guard against flooding: at most 10 open requests per account.
    const open = Number((await db.query(`SELECT COUNT(*) AS n FROM support_requests WHERE user_id = $1 AND status = 'open'`, [uid(req)])).rows[0]?.n ?? 0);
    if (open >= 10) { fail(res, 429, "You have 10 open requests already. Please wait for a reply."); return; }
    const r = await db.query(`INSERT INTO support_requests (user_id, subject, message) VALUES ($1,$2,$3) RETURNING id`, [uid(req), subject, message]);
    res.status(201).json({ success: true, id: r.rows[0].id });
  }));

  return router;
}
