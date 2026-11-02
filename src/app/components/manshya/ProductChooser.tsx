import { useEffect, useState } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { getSession, clearSession } from "../../services/apiClient";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { api } from "./api";
import { PRODUCTS, PRODUCT_ORDER, accountKind, type Product } from "./products";

/**
 * "What would you like to do?": the screen a customer or a business sees after signing in, before any dashboard. VINK Banking, VINK Pay and VINK Tap are separate products with separate
 * dashboards; this is where a person chooses which to use or set up. It says who each is for, whether it is already set up on this account, and, for a personal account, which services inside it
 * are for businesses only (so it is clear why something is not offered).
 */
interface Status { bank: { accounts: number } | null; pay: { verified: boolean } | null; tap: { devices: number } | null }

export function ProductChooser({ isOpen, onClose, onOpen, onApplyBank, onSignOut }: {
  isOpen: boolean; onClose: () => void; onOpen: (p: Product) => void;
  /** Opens the application for a bank account (for someone with none yet). Without it, the dashboard opens and offers to create one. */
  onApplyBank?: () => void; onSignOut?: () => void;
}) {
  useBodyScrollLock(isOpen);
  const session = getSession(), kind = accountKind(session?.role);
  const [status, setStatus] = useState<Status | null>(null);

  // How far each product is set up on this account. Each is looked up on its own and any that fails is simply shown without a status: choosing must never depend on it.
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    (async () => {
      const [me, accounts, devices] = await Promise.all([api("/me").catch(() => null), api("/bank/accounts").catch(() => null), api("/pos/devices").catch(() => null)]);
      if (!live) return;
      setStatus({
        pay: me ? { verified: !!me.verified } : null,
        bank: accounts && Array.isArray(accounts.data) ? { accounts: accounts.data.length } : null,
        tap: devices && Array.isArray(devices.data) ? { devices: devices.data.length } : null,
      });
    })();
    return () => { live = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const state = (p: Product): { label: string; ok: boolean; hint?: string; cta: string; apply?: boolean } => {
    const s = status?.[p];
    if (p === "bank") {
      const n = (s as Status["bank"])?.accounts;
      return n === 0 ? { label: "No account yet", ok: false, hint: "Open a bank account to start.", cta: "Open a bank account", apply: true } : { label: n ? "Set up" : "", ok: !!n, cta: "Open VINK Banking" };
    }
    if (p === "pay") {
      const v = (s as Status["pay"])?.verified;
      return s ? (v ? { label: "Verified", ok: true, cta: "Open VINK Pay" } : { label: "Not verified yet", ok: false, hint: "Add your verification documents under Account to go live.", cta: "Open VINK Pay" }) : { label: "", ok: false, cta: "Open VINK Pay" };
    }
    const d = (s as Status["tap"])?.devices;
    return d === 0 ? { label: "No card machine yet", ok: false, hint: "Add a card machine to start taking payments.", cta: "Open VINK Tap" } : { label: d ? "Set up" : "", ok: !!d, cta: "Open VINK Tap" };
  };

  const signOut = () => { clearSession(); onClose(); onSignOut?.(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-2" role="dialog" aria-modal="true" aria-label="Choose a VINK product">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3 shadow-sm">
        <img src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" loading="lazy" decoding="async" />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-fg-muted sm:block"><b className="text-fg">{session?.name}</b> · {kind === "personal" ? "Personal account" : "Business account"}</span>
          <button onClick={signOut} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg hover:bg-surface-2">Log out</button>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-black tracking-tight text-fg">What would you like to do?</h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">Each VINK product has its own dashboard. Choose the one you need. You can come back here at any time to use or set up another.</p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PRODUCT_ORDER.map((p) => {
            const info = PRODUCTS[p], st = state(p);
            return (
              <article key={p} aria-labelledby={`prod-${p}`} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h2 id={`prod-${p}`} className="text-xl font-black text-fg">{info.name}</h2>
                  {st.label && <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: st.ok ? "var(--vk-ok)" : "var(--vk-warn)", background: st.ok ? "var(--vk-ok-bg)" : "var(--vk-warn-bg)" }}>{st.label}</span>}
                </div>
                <p className="mt-1 text-sm font-semibold text-fg">{info.forWho}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">{info.offers.map((o) => <li key={o} className="flex gap-2"><span aria-hidden="true" className="text-fg-subtle">•</span><span>{o}</span></li>)}</ul>
                {kind === "personal" && info.businessOnly.length > 0 && <p className="mt-4 rounded-lg bg-surface-2 p-2.5 text-xs text-fg-muted"><b className="text-fg">Business accounts only:</b> {info.businessOnly.join("; ")}.</p>}
                {st.hint && <p className="mt-3 text-xs text-fg-muted">{st.hint}</p>}
                <div className="mt-auto pt-6">
                  <button onClick={() => (st.apply && onApplyBank ? onApplyBank() : onOpen(p))} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow transition hover:opacity-90" style={{ background: "linear-gradient(135deg,#C8102E,#A50F27)" }}>{st.cta}</button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
