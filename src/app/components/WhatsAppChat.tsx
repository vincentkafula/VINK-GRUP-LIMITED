import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { API_BASE } from "../services/config";

/**
 * Chat with VINK on WhatsApp, for the public: a button on every page, and a card with a QR code on the Contact page. Nothing is shown until the server says WhatsApp
 * chat is on (it needs the WhatsApp number and keys to be set up), so there is never a button that leads nowhere.
 */
export interface WhatsAppInfo { enabled: boolean; number: string | null; link: string | null }
let cached: Promise<WhatsAppInfo> | null = null;

export function loadWhatsAppInfo(): Promise<WhatsAppInfo> {
  cached ??= fetch(`${API_BASE}/api/whatsapp/info`).then((r) => (r.ok ? r.json() : null)).then((b: Partial<WhatsAppInfo> | null) => ({ enabled: b?.enabled === true && !!b.link, number: b?.number ?? null, link: b?.link ?? null })).catch(() => ({ enabled: false, number: null, link: null }));
  return cached;
}
/** For tests: forget the answer so the next render asks again. */
export const resetWhatsAppInfo = () => { cached = null; };

export function useWhatsAppInfo(): WhatsAppInfo | null {
  const [info, setInfo] = useState<WhatsAppInfo | null>(null);
  useEffect(() => { let live = true; loadWhatsAppInfo().then((i) => { if (live) setInfo(i); }); return () => { live = false; }; }, []);
  return info;
}

const GREEN = "#128C4A";

/** The round button in the corner of every page. It opens WhatsApp (the app on a phone, WhatsApp Web on a computer) with a first message ready. */
export function WhatsAppButton({ hidden = false }: { hidden?: boolean }) {
  const info = useWhatsAppInfo();
  if (hidden || !info?.enabled || !info.link) return null;
  return (
    <a href={info.link} target="_blank" rel="noopener noreferrer" aria-label="Chat with VINK on WhatsApp"
      className="fixed bottom-6 left-6 z-[90] inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-transform hover:scale-105" style={{ background: GREEN }}>
      <MessageCircle className="size-5" aria-hidden="true" /> <span className="hidden sm:inline">Chat on WhatsApp</span>
    </a>
  );
}

/** A card with the button and a QR code that opens the same chat from another phone. */
export function WhatsAppCard() {
  const info = useWhatsAppInfo();
  if (!info?.enabled || !info.link) return null;
  return (
    <section aria-label="Chat on WhatsApp" className="mx-auto my-8 flex max-w-3xl flex-col items-center gap-5 rounded-2xl border border-line bg-surface p-6 text-center sm:flex-row sm:text-left">
      <img src={`${API_BASE}/api/whatsapp/qr.png`} alt="QR code: scan it to chat with VINK on WhatsApp" width={140} height={140} className="rounded-lg bg-white p-1" />
      <div className="flex-1">
        <h2 className="text-lg font-bold text-fg">Chat with us on WhatsApp</h2>
        <p className="mt-1 text-sm text-fg-muted">Message VINK and choose the department you need. Our team answers Monday to Friday, 08:00 to 17:00 (South African time). Scan the code with your phone, or use the button.</p>
        <a href={info.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: GREEN }}><MessageCircle className="size-4" aria-hidden="true" /> Open WhatsApp</a>
      </div>
    </section>
  );
}
