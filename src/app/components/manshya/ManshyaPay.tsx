/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { useEffect, useState, type FormEvent } from "react";
import "./manshya.css";
import { publicApi } from "./api";
import { R } from "./format";
import { TestModeBanner } from "./TestModeBanner";

/* Hosted checkout: /pay?r=TOKEN (payment request) or /pay?b=TOKEN (payment button).
   Public: the customer paying does not need an account. */

interface Info { status?: string; expired?: boolean; amount?: number | null; merchant: string; description?: string; label?: string }
type Phase =
  | { t: "loading" } | { t: "missing" } | { t: "dealt"; status: string } | { t: "expired" }
  | { t: "form"; info: Info; sandbox: boolean } | { t: "paid"; info: Info; amount: number; email: string };

/** Only follow a gateway redirect to a real https address. */
const safeRedirect = (url: unknown): string | null => {
  try { const u = new URL(String(url)); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};

export function ManshyaPay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const q = new URLSearchParams(window.location.search);
  const tok = q.get("r") || q.get("b");
  const kind = q.get("r") ? "payment-requests" : "buttons";
  const [phase, setPhase] = useState<Phase>({ t: "loading" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!tok) { setPhase({ t: "missing" }); return; }
    let live = true;
    (async () => {
      try {
        const [info, health] = await Promise.all([publicApi<Info>(`/public/${kind}/${encodeURIComponent(tok)}`), publicApi("/health").catch(() => ({}))]);
        if (!live) return;
        if (info.status && info.status !== "open") setPhase({ t: "dealt", status: info.status });
        else if (info.expired) setPhase({ t: "expired" });
        else setPhase({ t: "form", info, sandbox: (health as { mode?: string }).mode === "test" });
      } catch { if (live) setPhase({ t: "missing" }); }
    })();
    return () => { live = false; };
  }, [isOpen, tok, kind]);

  if (!isOpen) return null;

  const submit = async (e: FormEvent<HTMLFormElement>, info: Info) => {
    e.preventDefault();
    const f = e.currentTarget.elements as unknown as Record<string, HTMLInputElement>;
    const fixed = info.amount != null;
    const body: Record<string, unknown> = {
      name: f.nm.value.trim(), email: f.em.value.trim(), method: f.mt.value, paymentToken: f.tk ? f.tk.value : undefined,
    };
    if (!body.name || !/^\S+@\S+\.\S+$/.test(String(body.email))) { setMsg({ ok: false, text: "Enter your name and a valid email." }); return; }
    if (!fixed) {
      const amount = Math.round(parseFloat(f.amt.value) * 100);
      if (!(amount >= 100)) { setMsg({ ok: false, text: "Enter an amount of R1.00 or more." }); return; }
      body.amount = amount;
    }
    setBusy(true); setMsg(null);
    try {
      const j = await publicApi<{ payment?: any; status: string }>(`/public/${kind}/${encodeURIComponent(tok!)}/pay`, { method: "POST", body });
      const p = j.payment || {};
      if (j.status === "paid") setPhase({ t: "paid", info, amount: p.amount, email: String(body.email) });
      else if (j.status === "pending" && p.redirect_url) {
        const url = safeRedirect(p.redirect_url);
        if (!url) throw new Error("The payment provider sent an invalid link. Please try another method.");
        setMsg({ ok: true, text: "Continue in your bank to approve the payment." });
        setTimeout(() => { window.location.href = url; }, 1200);
      } else {
        setMsg({ ok: false, text: `The payment was ${j.status}. ${p.failure_reason ? String(p.failure_reason).replace(/_/g, " ") : "Please try another card."}` });
        setBusy(false);
      }
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); setBusy(false); }
  };

  return (
    <div className="mkp" role="dialog" aria-modal="true" aria-label="Pay securely">
      <TestModeBanner />
      <main>
        <div className="logo">manshya<i>.</i></div>
        {phase.t === "loading" && <p>Loading...</p>}
        {phase.t === "missing" && <><h1>Link not found</h1><p>Check the link you were sent, or ask the business for a new one.</p></>}
        {phase.t === "dealt" && <><h1>Already dealt with</h1><p>This payment request is {phase.status}.</p></>}
        {phase.t === "expired" && <><h1>Link expired</h1><p>Ask the business for a new payment link.</p></>}
        {phase.t === "paid" && <><h1>Payment received</h1><p>Thank you. {R(phase.amount)} was paid to {phase.info.merchant}. A receipt is on its way to {phase.email}.</p></>}
        {phase.t === "form" && (
          <>
            <h1>{phase.info.amount != null ? R(phase.info.amount) : "Pay"}</h1>
            <p>{phase.info.merchant}{phase.info.description || phase.info.label ? ` · ${phase.info.description || phase.info.label}` : ""}</p>
            <form onSubmit={(e) => submit(e, phase.info)} noValidate>
              {phase.info.amount == null && <label>Amount in rand<input name="amt" type="number" min="1" step="0.01" required inputMode="decimal" /></label>}
              <label>Your name<input name="nm" autoComplete="name" required /></label>
              <label>Email for your receipt<input name="em" type="email" autoComplete="email" required /></label>
              <label>Pay with<select name="mt"><option value="card">Card</option><option value="eft">Instant EFT</option><option value="qr">QR code</option></select></label>
              {phase.sandbox
                ? <label>Sandbox card<select name="tk"><option value="tok_visa">Test card that works</option><option value="tok_decline">Test card that is declined</option></select></label>
                : <small>Card details are entered in your bank’s secure form on the next step.</small>}
              <button disabled={busy}>Pay{phase.info.amount != null ? " " + R(phase.info.amount) : ""}</button>
            </form>
            <div role="status">{msg && <div className={`msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}</div>
            {phase.sandbox && <small>Sandbox mode: no real money moves.</small>}
          </>
        )}
        <button className="g" onClick={onClose}>Close</button>
      </main>
    </div>
  );
}
