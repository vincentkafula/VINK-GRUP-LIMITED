import { useState } from "react";
import {
  X, ChevronDown, Sun, Moon, ArrowRight, BookOpen, Copy, Check,
  Wallet, CreditCard, Bus, Vote, MapPin, Video, Mic,
  LayoutGrid, KeyRound, Webhook, BarChart3, FileText, TerminalSquare, Settings,
  ShieldCheck, Lock, BadgeCheck, UserCheck, Cloud,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void; }

const GREEN = "#0F8A4B";
const DARK_GREEN = "#0B5C2E";
const ORANGE = "#FF7A1A";
const INK = "#111827";

const SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

const NAV = ["APIs", "Documentation", "Solutions", "Pricing", "Resources", "Support"];

const FEATURE_PILLS = [
  { icon: <LayoutGrid className="w-4 h-4" />, label: "REST", sub: "API" },
  { icon: <FileText className="w-4 h-4" />, label: "JSON", sub: "Format" },
  { icon: <BookOpen className="w-4 h-4" />, label: "SDKs", sub: "Available" },
  { icon: <Webhook className="w-4 h-4" />, label: "Webhooks", sub: "Real-time" },
  { icon: <TerminalSquare className="w-4 h-4" />, label: "Sandbox", sub: "Free Access" },
];

const TRUST_BADGES = [
  { icon: <ShieldCheck className="w-5 h-5" />, label: "OAuth 2.0", sub: "Secure Auth" },
  { icon: <Lock className="w-5 h-5" />, label: "256-bit", sub: "Encryption" },
  { icon: <BadgeCheck className="w-5 h-5" />, label: "ISO 27001", sub: "Certified" },
  { icon: <UserCheck className="w-5 h-5" />, label: "POPIA", sub: "Compliant" },
];

const DASH_NAV = [
  { icon: <LayoutGrid className="w-3.5 h-3.5" />, label: "Overview", active: true },
  { icon: <KeyRound className="w-3.5 h-3.5" />, label: "API Keys" },
  { icon: <Webhook className="w-3.5 h-3.5" />, label: "Webhooks" },
  { icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Analytics" },
  { icon: <FileText className="w-3.5 h-3.5" />, label: "Logs" },
  { icon: <TerminalSquare className="w-3.5 h-3.5" />, label: "Sandbox" },
  { icon: <Settings className="w-3.5 h-3.5" />, label: "Settings" },
];

const RECENT_REQUESTS = [
  { method: "POST", path: "/v1/wallets/transfer", status: 200, ms: 120 },
  { method: "GET",  path: "/v1/accounts/balance", status: 200, ms: 98 },
  { method: "POST", path: "/v1/payments/initiate", status: 200, ms: 150 },
  { method: "GET",  path: "/v1/transactions", status: 200, ms: 110 },
  { method: "POST", path: "/v1/webhooks/register", status: 201, ms: 200 },
];
const METHOD_COLOR: Record<string, string> = { POST: "#0369A1", GET: "#059669" };

interface ApiProduct {
  id: string; name: string; icon: React.ReactNode; iconBg: string; iconColor: string;
  desc: string; price: string;
}
const API_PRODUCTS: ApiProduct[] = [
  { id: "wallet",   name: "VINK Wallet API",   icon: <Wallet className="w-6 h-6" />,   iconBg: "#E8F7EE", iconColor: GREEN,  desc: "Create, manage and transact with Vink wallets programmatically", price: "R0" },
  { id: "payments", name: "Payments API",       icon: <CreditCard className="w-6 h-6" />, iconBg: "#FFF1E6", iconColor: ORANGE, desc: "Initiate, verify and settle payments across the VINK AFC network", price: "R0" },
  { id: "vmvo",     name: "VMVO API",           icon: <Bus className="w-6 h-6" />,      iconBg: "#E8F7EE", iconColor: GREEN,  desc: "Validate, manage and operate AFC transactions in real time", price: "R0" },
  { id: "election", name: "Election API",       icon: <Vote className="w-6 h-6" />,     iconBg: "#FFF1E6", iconColor: ORANGE, desc: "Secure digital voting for AGMs and board resolutions", price: "R85" },
  { id: "vehicle",  name: "Vehicle Tracking API", icon: <MapPin className="w-6 h-6" />, iconBg: "#E8F7EE", iconColor: GREEN,  desc: "Real-time GPS tracking, routes, alerts and geofence events", price: "R265" },
  { id: "cctv",     name: "CCTV System API",    icon: <Video className="w-6 h-6" />,    iconBg: "#FFF1E6", iconColor: ORANGE, desc: "Monitor, manage and retrieve video streams securely", price: "R170" },
  { id: "voip",     name: "Voice Over IP API",  icon: <Mic className="w-6 h-6" />,      iconBg: "#E8F7EE", iconColor: GREEN,  desc: "Enable voice communication and call control features", price: "R415" },
];

function ApiProductCard({ p }: { p: ApiProduct }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <span className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: p.iconBg, color: p.iconColor }}>{p.icon}</span>
      <h3 className="text-base font-bold text-gray-900 mb-1.5">{p.name}</h3>
      <p className="text-[13px] text-gray-500 leading-relaxed mb-5">{p.desc}</p>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
        <div>
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">From</span>
          <div><span className="text-lg font-black text-gray-900">{p.price}</span><span className="text-xs text-gray-400"> / month</span></div>
        </div>
        <button className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={{ background: "#F3F4F6", color: GREEN }}>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function CodeCard({ title, lines, corner }: { title: string; lines: { text: string; color?: string }[]; corner: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`absolute ${corner} w-64 sm:w-72 rounded-xl shadow-2xl overflow-hidden hidden md:block`} style={{ background: "#0B1220" }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white/60 text-[11px] font-mono">{title}</span>
        <button onClick={() => setCopied(true)} className="text-white/40 hover:text-white/80">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="p-3 font-mono text-[10.5px] leading-relaxed">
        {lines.map((l, i) => <div key={i} style={{ color: l.color ?? "rgba(255,255,255,0.75)" }}>{l.text}</div>)}
      </div>
    </div>
  );
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 30" className="w-full h-8" preserveAspectRatio="none">
      <polyline points="0,25 15,22 30,18 45,20 60,12 75,14 90,5 100,3" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CorporateApiViewer({ isOpen, onClose, onNavigate }: Props) {
  const [dark, setDark] = useState(false);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      {/* ── Corporate sub-nav (kept for consistency with the rest of the site) ── */}
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-1 h-11 overflow-x-auto">
          {SUB_NAV.map((item) => (
            <button
              key={item}
              onClick={() => item !== "API" && onNavigate(item)}
              className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors"
              style={item === "API" ? { background: "#E8F7EE", color: GREEN } : { color: "#6B7280" }}
            >
              {item}
            </button>
          ))}
          <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-gray-100 transition-colors shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </nav>

      {/* ── Developer portal top bar ── */}
      <div className="sticky top-11 z-20 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <img src={vinkLogo} alt="VINK" className="h-8 w-auto object-contain" />
            <span className="hidden sm:block h-5 w-px bg-gray-200" />
            <span className="hidden sm:block text-[11px] font-bold tracking-[0.12em]" style={{ color: ORANGE }}>DEVELOPER PORTAL</span>
          </div>
          <nav className="hidden lg:flex items-center gap-7">
            {NAV.map(item => (
              <button key={item} className="flex items-center gap-1 text-[13.5px] font-medium text-gray-700 hover:text-gray-900">
                {item}{(item === "APIs" || item === "Solutions" || item === "Resources") && <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2.5 shrink-0">
            <button onClick={() => setDark(d => !d)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              {dark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>
            <button className="hidden sm:block px-4 py-2 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">Log in</button>
            <button className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: ORANGE }}>Sign up</button>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg,#FAFCFB 0%,#F3F9F5 100%)" }}>
        <div className="absolute -right-32 top-0 bottom-0 w-96 rounded-full opacity-30" style={{ background: `linear-gradient(180deg,${GREEN},${ORANGE})`, filter: "blur(80px)" }} />

        <div className="relative max-w-7xl mx-auto px-6 py-14 sm:py-20 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-1.5 rounded-full mb-6" style={{ background: "#E8F7EE", color: DARK_GREEN }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} /> Powering Payments. Mobility. Governance.
            </span>
            <h1 className="text-4xl sm:text-[52px] font-black leading-[1.05] text-gray-900">
              Build with<br /><span style={{ color: GREEN }}>VINK</span> <span style={{ color: ORANGE }}>APIs</span>
            </h1>
            <p className="text-gray-500 text-base sm:text-lg mt-5 max-w-md leading-relaxed">
              Secure, scalable and developer-friendly APIs to build the future of payments, mobility, wallets and digital services across Africa.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <button className="flex items-center gap-2 px-6 py-3.5 rounded-full text-white text-sm font-bold shadow-lg" style={{ background: GREEN }}>
                Get Started for Free <ArrowRight className="w-4 h-4" />
              </button>
              <button className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold border-2" style={{ borderColor: GREEN, color: GREEN }}>
                <BookOpen className="w-4 h-4" /> Explore Documentation
              </button>
            </div>

            <div className="flex flex-wrap gap-2.5 mt-9">
              {FEATURE_PILLS.map(f => (
                <div key={f.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <span style={{ color: ORANGE }}>{f.icon}</span>
                  <div className="leading-tight">
                    <p className="text-[11px] font-bold text-gray-800">{f.label}</p>
                    <p className="text-[9px] text-gray-400">{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="relative hidden md:block" style={{ minHeight: 440 }}>
            <div className="absolute inset-0 flex items-center">
              <div className="w-full rounded-2xl shadow-2xl overflow-hidden border border-gray-100 bg-white flex">
                {/* sidebar */}
                <div className="w-36 shrink-0 py-4 px-2 space-y-0.5" style={{ background: INK }}>
                  <div className="flex items-center gap-1.5 px-2 pb-3 mb-2 border-b border-white/10">
                    <span style={{ color: GREEN }} className="font-black text-xs">VINK</span>
                    <span style={{ color: ORANGE }} className="font-black text-xs">API</span>
                  </div>
                  {DASH_NAV.map(n => (
                    <div key={n.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px]" style={{ background: n.active ? GREEN : "transparent", color: n.active ? "#fff" : "rgba(255,255,255,0.55)" }}>
                      {n.icon} {n.label}
                    </div>
                  ))}
                </div>
                {/* main panel */}
                <div className="flex-1 p-4">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: "API Calls", value: "128,540", trend: "+24.5%", color: GREEN },
                      { label: "Success Rate", value: "99.9%", trend: "+0.2%", color: GREEN },
                      { label: "Response Time", value: "123ms", trend: "-12ms", color: ORANGE },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-gray-100 p-2.5">
                        <p className="text-[9px] text-gray-400">{s.label}</p>
                        <p className="text-sm font-black text-gray-900 mt-0.5">{s.value}</p>
                        <p className="text-[8px] font-semibold mt-0.5" style={{ color: s.color }}>{s.trend} vs last month</p>
                        <Sparkline color={s.color} />
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-gray-100 p-3 mb-3">
                    <p className="text-[10px] font-bold text-gray-700 mb-2">Recent Requests</p>
                    {RECENT_REQUESTS.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[9.5px]">
                        <span className="font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: METHOD_COLOR[r.method], fontSize: 8 }}>{r.method}</span>
                        <span className="font-mono text-gray-600 flex-1 truncate">{r.path}</span>
                        <span className="text-green-600 font-semibold shrink-0">{r.status}</span>
                        <span className="text-gray-400 shrink-0">{r.ms}ms</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl border border-gray-100 p-2.5">
                      <p className="text-[9px] text-gray-400 mb-1">API Status</p>
                      <p className="text-[10px] font-semibold text-green-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> All Systems Operational</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-gray-100 p-2.5">
                      <p className="text-[9px] text-gray-400 mb-1">Environment</p>
                      <p className="text-[10px] font-semibold text-gray-700">Sandbox <span style={{ color: GREEN }} className="ml-1 cursor-pointer">Change</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* floating icons */}
            <div className="absolute -top-2 left-8 w-10 h-10 rounded-xl bg-white shadow-lg flex items-center justify-center"><Cloud className="w-5 h-5 text-gray-400" /></div>
            <div className="absolute top-16 right-16 w-9 h-9 rounded-lg flex items-center justify-center shadow-lg" style={{ background: ORANGE }}><Lock className="w-4 h-4 text-white" /></div>
            <div className="absolute bottom-4 left-0 w-9 h-9 rounded-lg flex items-center justify-center shadow-lg" style={{ background: GREEN }}><Wallet className="w-4 h-4 text-white" /></div>

            <CodeCard
              title="curl"
              corner="-top-4 -right-4"
              lines={[
                { text: "curl -X POST \\", color: "#F59E0B" },
                { text: "  https://api.vink.co.za/v1/payments \\" },
                { text: '  -H "Authorization: Bearer YOUR_API_KEY" \\', color: "#60A5FA" },
                { text: '  -H "Content-Type: application/json" \\' },
                { text: "  -d '{" },
                { text: '    "amount": 150.00,' },
                { text: '    "currency": "ZAR",' },
                { text: '    "reference": "INV-1001"' },
                { text: "  }'" },
              ]}
            />
            <CodeCard
              title="JSON Response"
              corner="bottom-10 -right-8"
              lines={[
                { text: "{" },
                { text: '  "status": "success",', color: "#4ADE80" },
                { text: '  "data": {' },
                { text: '    "payment_id": "pay_1234567890",' },
                { text: '    "amount": 150.00,' },
                { text: '    "currency": "ZAR",' },
                { text: '    "status": "completed"', color: "#4ADE80" },
                { text: "  }" },
                { text: "}" },
              ]}
            />
          </div>
        </div>

        {/* Trust badges */}
        <div className="relative max-w-4xl mx-auto px-6 pb-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            {TRUST_BADGES.map(b => (
              <div key={b.label} className="flex items-center gap-2.5 px-2">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#E8F7EE", color: GREEN }}>{b.icon}</span>
                <div><p className="text-[12px] font-bold text-gray-800 leading-tight">{b.label}</p><p className="text-[10px] text-gray-400">{b.sub}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── APIs for every use case ── */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-20">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">
              APIs for Every <span style={{ color: ORANGE }}>Use Case</span>
            </h2>
            <p className="text-gray-500 text-sm mt-2">Powerful building blocks to integrate, innovate and scale your business.</p>
          </div>
          <button className="flex items-center gap-1.5 text-sm font-bold shrink-0" style={{ color: GREEN }}>
            View all APIs <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {API_PRODUCTS.map(p => <ApiProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <Footer />
    </div>
  );
}
