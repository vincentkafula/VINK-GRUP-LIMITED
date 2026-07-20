import { X, MapPin, Clock, Phone } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";

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
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-12 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black mb-2">Find a VINK Service Point</h1>
          <p className="text-white/70 text-sm">VINK is a digital-first bank. Full banking services are available at our Head Office and through our national agent network.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        {/* Search */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-2">Find your nearest Vink card agent</label>
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input className="flex-1 text-sm outline-none text-gray-700" placeholder="Enter your area or postal code..." />
            </div>
            <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0"
              style={{ background: P }}>Search</button>
          </div>
        </div>

        {/* Head Office */}
        <section>
          <h2 className="text-2xl font-black mb-4" style={{ color: P }}>Head Office — Full Service</h2>
          <div className="bg-white rounded-2xl border-2 p-6" style={{ borderColor: P }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: P }}><MapPin className="w-6 h-6" /></div>
              <div className="flex-1">
                <p className="font-black text-gray-900 text-lg">VINK Head Office</p>
                <p className="text-gray-600 text-sm mt-1">8 Rose Street, Cape Town CBD<br />State House Building, Cape Town, 8001</p>
                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: P }} />
                    <span className="text-sm text-gray-700">Mon–Fri 08:00–17:00</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" style={{ color: P }} />
                    <a href="tel:+27210070772" className="text-sm font-semibold" style={{ color: P }}>+27 (0)21 007 0772</a>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Services Available</p>
                  <div className="flex flex-wrap gap-2">
                    {["Account opening", "FICA verification", "Card collection", "AFC device enquiries", "Business banking consultations"].map((s, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                        style={{ background: "#EDE9FE", color: P }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agent Network */}
        <section>
          <h2 className="text-2xl font-black mb-2" style={{ color: P }}>Agent Network — Card Services</h2>
          <p className="text-gray-500 text-sm mb-5">Card recharge, replacement, and cash withdrawals available at these nationwide partners. Service hours follow store trading hours.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {AGENT_NETWORKS.map((a, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="font-bold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.cover}</p>
                  <p className="text-xs text-gray-600 mt-1 font-medium">{a.services}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            * Availability varies by store. Ask in-store for Vink card services.
          </p>
        </section>
      </div>
    </div>
  );
}
