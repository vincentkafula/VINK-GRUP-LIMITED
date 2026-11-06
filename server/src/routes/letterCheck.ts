import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { Db } from "../portal/common.js";
import { createCommission } from "../services/commission.js";
import { createMarshalCare } from "../services/marshalCare.js";

/**
 * A public page for checking a proof-of-income letter: a bank or landlord holding the letter enters its number and code, with no sign-in. It says whether the letter is genuine, when it was issued, what period it
 * covers, and a masked name, and nothing about the figures. It is rate limited (the code is 12 hex characters, so guessing is not practical, and this keeps it that way), never cached, and sends no scripts.
 * It answers a form in a browser with a small page, and JSON to a program that asks for it (?format=json or Accept: application/json).
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check a proof-of-income letter</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem;color:#111}input{display:block;width:100%;padding:.6rem;margin:.25rem 0 1rem;font:inherit;box-sizing:border-box}button{padding:.6rem 1.2rem;font:inherit;font-weight:700;background:#C8102E;color:#fff;border:0;border-radius:.4rem}.ok{border-left:4px solid #15803d;padding-left:.8rem}.no{border-left:4px solid #b91c1c;padding-left:.8rem}small{color:#555}</style></head><body><h1>Check a proof-of-income letter</h1>${body}<p><small>This confirms a letter is genuine and says when it was issued. It does not show any amounts, and it is not a certificate of employment.</small></p></body></html>`;
const form = (number = "", code = "") => `<form method="get"><label>Letter number<input name="number" value="${esc(number)}" maxlength="60" autocomplete="off" required></label><label>Verification code<input name="code" value="${esc(code)}" maxlength="20" autocomplete="off" required></label><button type="submit">Check</button></form>`;

export function createLetterCheckRouter(db: Db, now: () => Date = () => new Date()): Router {
  const care = createMarshalCare(db, createCommission(db, now), now), router = Router();
  router.use(rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).type("html").send(page("<p class=\"no\">Too many checks from this address. Please wait a minute and try again.</p>")); } }));
  router.get("/", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    const number = typeof req.query.number === "string" ? req.query.number : "", code = typeof req.query.code === "string" ? req.query.code : "", wantsJson = req.query.format === "json" || /application\/json/.test(String(req.headers.accept ?? ""));
    if (!number && !code) { if (wantsJson) { res.status(400).json({ success: false, error: "Give the letter number and its code" }); return; } res.type("html").send(page(form())); return; }
    const v = await care.verifyLetterPublic(number, code);
    if (wantsJson) { res.json({ success: true, ...v }); return; }
    res.type("html").send(page(v.valid
      ? `<p class="ok"><b>Genuine.</b> Letter ${esc(String(v.number))} was issued to ${esc(String(v.name))} on ${esc(String(v.issuedAt).slice(0, 10))}, covering ${esc(String(v.from))} to ${esc(String(v.to))}.${v.intact === false ? " <b>The payslips behind it have changed since it was made, so it should not be relied on.</b>" : ""}</p>${form(number, code)}`
      : `<p class="no"><b>Not recognised.</b> No letter has that number and code. Check them against the letter, or ask the association to confirm.</p>${form(number, code)}`));
  });
  return router;
}
