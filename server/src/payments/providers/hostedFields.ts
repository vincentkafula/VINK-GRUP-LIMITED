import crypto from "crypto";
import { Router, json, type Response } from "express";
import type { CardVaultProvider, HostedCardFields, HostedCardResult, HostedCardSession } from "./types.js";
import { expiryOf } from "./mockCardRail.js";

/**
 * SANDBOX stand-in for a processor's hosted card fields.
 *
 * With real hosted fields the card form is served from the processor's own domain inside an iframe on VINK's page, and the number goes from the cardholder's
 * browser straight to the processor, which returns only a token. VINK's server and VINK's page never see the number. This class and its tiny router reproduce
 * exactly that shape for the sandbox: the form lives on a separate page (the vault page, framed by VINK's site), the main API only ever receives a session id,
 * and VINK collects the finished card from the session. Only published TEST card numbers are accepted here.
 *
 * In live mode a provider implementing HostedCardFields replaces this; nothing in the token service or the front end changes.
 */
const TTL_MS = 10 * 60_000, MAX_SESSIONS = 2000, MAX_TRIES = 5;

interface Session { userId: string; expires: number; tries: number; result?: HostedCardResult; used: boolean }

export class SandboxHostedFields implements HostedCardFields {
  readonly name = "sandbox_hosted";
  private sessions = new Map<string, Session>();
  constructor(private readonly vault: CardVaultProvider, private readonly testPans: Set<string>, private readonly now: () => number = Date.now, private readonly basePath = "/api/payments/sandbox-vault") {}

  private sweep() { const t = this.now(); for (const [k, s] of this.sessions) if (s.expires < t) this.sessions.delete(k); }

  async createSession(input: { userId: string }): Promise<HostedCardSession> {
    this.sweep();
    if (this.sessions.size >= MAX_SESSIONS) throw new Error("Too many card forms are open right now. Try again in a few minutes.");
    const sessionId = crypto.randomBytes(24).toString("base64url");
    const expires = this.now() + TTL_MS;
    this.sessions.set(sessionId, { userId: input.userId, expires, tries: 0, used: false });
    return { sessionId, fieldsUrl: `${this.basePath}/fields/${sessionId}`, expiresAt: new Date(expires).toISOString() };
  }

  /** The vault's side: the cardholder's browser sends the card here. Returns what the form may show; the number is not kept. */
  async submit(sessionId: string, card: { pan: unknown; expiry: unknown; name: unknown }): Promise<{ ok: true; last4: string } | { ok: false; error: string }> {
    const s = this.sessions.get(sessionId);
    if (!s || s.expires < this.now() || s.used) return { ok: false, error: "This card form has expired. Close it and start again." };
    if (++s.tries > MAX_TRIES) { this.sessions.delete(sessionId); return { ok: false, error: "Too many attempts. Close this form and start again." }; }
    const pan = typeof card.pan === "string" ? card.pan.replace(/[\s-]/g, "") : "";
    if (!/^[0-9]{13,19}$/.test(pan)) return { ok: false, error: "Enter the card number" };
    if (!this.testPans.has(pan)) return { ok: false, error: "Only sandbox test cards can be added until live card entry is in place. Do not enter a real card number." };
    const name = typeof card.name === "string" ? card.name.trim() : "";
    if (name.length < 2 || name.length > 40 || /[<>]/.test(name)) return { ok: false, error: "Enter the name on the card" };
    const raw = typeof card.expiry === "string" ? card.expiry.trim() : "";
    const m = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(raw);
    const yyyymm = m ? `20${m[2]}-${m[1]}` : raw;
    if (!expiryOf(yyyymm, new Date(this.now()))) return { ok: false, error: "The card has expired, or the expiry date is not valid" };
    try {
      const t = await this.vault.tokenise({ primaryAccountNumber: pan, expiry: yyyymm, cardholderName: name });
      s.result = { ...t, cardholderName: name };
      return { ok: true, last4: t.last4 };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "The card could not be added" }; }
  }

  async complete(input: { sessionId: string; userId: string }): Promise<HostedCardResult | null> {
    const s = this.sessions.get(input.sessionId);
    if (!s || s.userId !== input.userId || s.used || s.expires < this.now() || !s.result) return null;
    s.used = true;                                                                    // one use only
    const r = s.result; s.result = undefined; this.sessions.delete(input.sessionId);
    return r;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The vault page and its submit endpoint. Sandbox only: mount it only when the payments mode is sandbox. */
export function createSandboxVaultRouter(hosted: SandboxHostedFields, frameAncestors: string[]): Router {
  const router = Router();
  const sessionOk = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(id);
  const noCache = (res: Response) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer"); };

  router.get("/fields/:sessionId", (req, res) => {
    const id = req.params.sessionId;
    if (!sessionOk(id)) { res.status(404).type("text/plain").send("Not found"); return; }
    noCache(res);
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors ${frameAncestors.length ? frameAncestors.join(" ") : "'none'"}`);
    res.type("html").send(PAGE.replace("__SESSION__", esc(id)));
  });

  router.post("/submit/:sessionId", json({ limit: "2kb" }), async (req, res) => {
    noCache(res);
    if (!sessionOk(req.params.sessionId)) { res.status(404).json({ ok: false, error: "Not found" }); return; }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await hosted.submit(req.params.sessionId, { pan: b.pan, expiry: b.expiry, name: b.name });
    res.status(r.ok ? 200 : 400).json(r);
  });
  return router;
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Card details</title>
<style>*{box-sizing:border-box}body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#0f172a;background:#fff}label{display:block;font-size:12px;color:#475569;margin:0 0 10px}
input{display:block;width:100%;margin-top:4px;padding:9px 10px;font:inherit;border:1px solid #cbd5e1;border-radius:8px}.row{display:flex;gap:10px}.row label{flex:1}
button{width:100%;padding:10px;font:inherit;font-weight:600;color:#fff;background:#0f172a;border:0;border-radius:8px;cursor:pointer}button[disabled]{opacity:.6}
#m{min-height:18px;margin:8px 0;font-size:12px}.err{color:#b91c1c}.ok{color:#047857}.note{font-size:11px;color:#92400e;margin-top:8px}</style></head>
<body><form id="f" autocomplete="off"><label>Card number<input id="pan" inputmode="numeric" autocomplete="off" placeholder="4111 1111 1111 1111" maxlength="23"></label>
<div class="row"><label>Expiry (MM/YY)<input id="exp" autocomplete="off" placeholder="12/34" maxlength="5"></label><label>Name on the card<input id="name" autocomplete="off" maxlength="40"></label></div>
<div id="m" role="status"></div><button id="b" type="submit">Add this card</button><p class="note">Sandbox card form: test cards only. This form stands in for the card processor's secure card fields.</p></form>
<script>(function(){var s="__SESSION__",f=document.getElementById("f"),m=document.getElementById("m"),b=document.getElementById("b");
f.addEventListener("submit",function(e){e.preventDefault();b.disabled=true;m.className="";m.textContent="Checking the card...";
fetch("../submit/"+s,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pan:document.getElementById("pan").value,expiry:document.getElementById("exp").value,name:document.getElementById("name").value})})
.then(function(r){return r.json()}).then(function(j){if(j.ok){document.getElementById("pan").value="";m.className="ok";m.textContent="Card ready.";parent.postMessage({type:"vink-card-complete",sessionId:s},"*")}else{b.disabled=false;m.className="err";m.textContent=j.error||"The card could not be added"}})
.catch(function(){b.disabled=false;m.className="err";m.textContent="Could not reach the card form. Try again."})})})();</script></body></html>`;
