import { X, MapPin, Clock, Phone } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5C0A10";

const AGENT_NETWORKS = [
  { name: "Pick n Pay",  icon: "🛒", cover: "Nationwide — all stores",      services: "Card recharge, replacement, cash withdrawals" },
  { name: "Shoprite",   icon: "🛒", cover: "Nationwide — all stores",      services: "Card recharge, cash withdrawals" },
  { name: "Checkers",   icon: "🛒", cover: "Nationwide — all stores",      services: "Card recharge, cash withdrawals" },
  { name: "Spar",       icon: "🛒", cover: "Nationwide — all stores",      services: "Card recharge, cash withdrawals" },
  { name: "Spaza Shops", icon: "🏪", cover: "Western Cape — participating", services: "Card recharge, airtime top-up" },
];

export function BranchLocatorViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-2">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-12 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#9B1C1C)` }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black mb-2">Find a VINK Service Point</h1>
          <p className="text-white/70 text-sm">VINK is a digital-first bank. Full banking services are available at our Head Office and through our national agent network.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        {/* Search */}
        <div className="bg-surface rounded-2xl border border-line p-5">
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted block mb-2">Find your nearest VINK card agent</label>
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-2 border border-line rounded-xl px-4 py-2.5">
              <MapPin className="w-4 h-4 text-fg-muted flex-shrink-0" />
              <input className="flex-1 text-sm outline-none text-fg" placeholder="Enter your area or postal code..." />
            </div>
            <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0"
              style={{ background: P }}>Search</button>
          </div>
        </div>

        {/* Head Office */}
        <section>
          <h2 className="text-2xl font-black mb-4" style={{ color: "var(--vk-crimson-text)" }}>Head Office — Full Service</h2>
          <div className="bg-surface rounded-2xl border-2 p-6" style={{ borderColor: P }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: P }}><MapPin className="w-6 h-6" /></div>
              <div className="flex-1">
                <p className="font-black text-fg text-lg">VINK Head Office</p>
                <p className="text-fg-muted text-sm mt-1">8 Rose Street, Cape Town CBD<br />State House Building, Cape Town, 8001</p>
                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: "var(--vk-crimson-text)" }} />
                    <span className="text-sm text-fg">Mon–Fri 08:00–17:00</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" style={{ color: "var(--vk-crimson-text)" }} />
                    <a href="tel:+27210070772" className="text-sm font-semibold" style={{ color: "var(--vk-crimson-text)" }}>+27 (0)21 007 0772</a>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-2">Services Available</p>
                  <div className="flex flex-wrap gap-2">
                    {["Account opening", "FICA verification", "Card collection", "AFC device enquiries", "Business banking consultations"].map((s, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                        style={{ background: "var(--vk-surface-2)", color: "var(--vk-crimson-text)" }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agent Network */}
        <section>
          <h2 className="text-2xl font-black mb-2" style={{ color: "var(--vk-crimson-text)" }}>Agent Network — Card Services</h2>
          <p className="text-fg-muted text-sm mb-5">Card recharge, replacement, and cash withdrawals available at these nationwide partners. Service hours follow store trading hours.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {AGENT_NETWORKS.map((a, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-surface rounded-xl border border-line hover:shadow-md transition-shadow">
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="font-bold text-fg">{a.name}</p>
                  <p className="text-xs text-fg-muted mt-0.5">{a.cover}</p>
                  <p className="text-xs text-fg-muted mt-1 font-medium">{a.services}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-muted mt-4">
            * Availability varies by store. Ask in-store for VINK card services.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
