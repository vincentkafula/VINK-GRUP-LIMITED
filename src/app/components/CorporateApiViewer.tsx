import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; }

const CORPORATE_PURPLE = "#5B2D8E";
const GOLD = "#F5A623";

const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

// ─── Plan data ────────────────────────────────────────────────────────────────

interface ApiPlan {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}

const CORE_PLANS: ApiPlan[] = [
  {
    name: "VMS VMVO API",
    price: "R0",
    features: [
      "RESTful JSON architecture; OAuth 2.0 authentication",
      "Up to 10,000 API calls per day on standard tier",
      "Initiate, verify, and settle payments through the VMS AFC network",
      "Full sandbox environment and Swagger documentation provided",
      "Ideal for taxi associations, municipality portals, and transport developers",
    ],
  },
  {
    name: "VMS Wallet API",
    price: "R0",
    features: [
      "Create, fund, and manage Vink wallets programmatically",
      "Balance queries, top-ups, P2P transfers, and withdrawals",
      "Webhook notifications for real-time transaction events",
      "Ideal for fintech apps, super-app integrations, and corporate expense platforms",
    ],
  },
  {
    name: "Election Management API",
    price: "R85",
    features: [
      "Secure anonymous digital ballots for AGMs and board resolutions",
      "Voter registration, ballot creation, submission, and result audit endpoints",
      "POPIA-compliant data handling",
      "Supports cooperative votes and taxi association elections",
    ],
  },
];

const ADVANCED_PLANS: ApiPlan[] = [
  {
    name: "CCTV System API",
    price: "R170",
    features: [
      "Cloud CCTV integration with RTSP streams and motion-trigger webhooks",
      "30-day footage retrieval from any authorised device",
      "Compatible with Hikvision, Dahua, and ONVIF-compliant cameras",
      "Suitable for municipalities, fleet depots, and commercial property owners",
    ],
  },
  {
    name: "Vehicle Tracking API",
    price: "R265",
    features: [
      "Live location data updated every 30 seconds across the SADC region",
      "Geofence alerts, route history, and driver behaviour scoring",
      "Delivered in JSON via REST or MQTT",
      "POPIA-compliant — no third-party data sharing",
      "Theft recovery triggers included",
    ],
    featured: true,
  },
  {
    name: "Voice Over Internet API",
    price: "R415",
    features: [
      "SIP and WebRTC protocols for embedding voice calls in any application",
      "1,000 free minutes/month on advanced tier",
      "HD audio quality; call recording and transcription available",
      "SLA: 99.9% uptime guarantee",
      "Ideal for contact centres, taxi dispatch platforms, and community services",
    ],
  },
];

// ─── Card ─────────────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: ApiPlan }) {
  const f = plan.featured;
  return (
    <div
      className="rounded-xl border flex flex-col p-6 transition-shadow hover:shadow-lg"
      style={{
        background: f ? CORPORATE_PURPLE : "#fff",
        borderColor: f ? CORPORATE_PURPLE : "#e0e0e0",
        color: f ? "#fff" : "#222",
      }}
    >
      <div className="font-bold text-base mb-2" style={{ color: f ? "#fff" : "#6C3DB5" }}>
        {plan.name}
      </div>
      <div className="mb-3" style={{ color: f ? "#fff" : "#3d1d63" }}>
        <span className="text-4xl font-extrabold leading-none">{plan.price}</span>
        <span className="text-sm font-normal ml-1 opacity-80">/ Month</span>
      </div>
      <div className="text-xs font-semibold mb-2" style={{ color: f ? "rgba(255,255,255,.85)" : "#6C3DB5" }}>
        What you Get
      </div>
      <ul className="flex-1 mb-5 space-y-1.5">
        {plan.features.map((feat, i) => (
          <li key={i} className="flex gap-2 items-start text-xs leading-snug" style={{ color: f ? "rgba(255,255,255,.9)" : "#666" }}>
            <span className="mt-0.5 font-bold flex-shrink-0" style={{ color: f ? "#a5f3b4" : CORPORATE_PURPLE }}>✓</span>
            {feat}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-auto">
        <button
          className="flex-1 rounded-full py-2 text-sm font-semibold transition-colors"
          style={{ background: f ? "#fff" : CORPORATE_PURPLE, color: f ? CORPORATE_PURPLE : "#fff", border: "none" }}
        >
          Apply Now
        </button>
        <button
          className="flex-1 rounded-full py-2 text-sm transition-colors"
          style={{
            background: "none",
            border: `1.5px solid ${f ? "rgba(255,255,255,.5)" : "#ddd"}`,
            color: f ? "#fff" : "#222",
          }}
        >
          Tell me more
        </button>
      </div>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-6 px-4 text-base font-semibold" style={{ color: "#3d1d63" }}>
      <span className="border-b-2 pb-0.5" style={{ borderColor: GOLD }}>{children}</span>
    </div>
  );
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

export function CorporateApiViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#f5f5f7]">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Main nav strip ── */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-6 overflow-x-auto text-sm">
        {["Menu", "Personal", "Business", "Corporate", "Marketplace"].map((item) => (
          <span
            key={item}
            className="py-3 flex-shrink-0 font-medium"
            style={{ color: item === "Corporate" ? CORPORATE_PURPLE : "#444", borderBottom: item === "Corporate" ? `2px solid ${CORPORATE_PURPLE}` : "2px solid transparent" }}
          >
            {item}
          </span>
        ))}
      </div>

      {/* ── Sub nav ── */}
      <div className="flex overflow-x-auto px-4" style={{ background: CORPORATE_PURPLE }}>
        {CORPORATE_SUB_NAV.map((item) => (
          <span
            key={item}
            className="text-xs py-2.5 px-3 flex-shrink-0 cursor-pointer transition-colors"
            style={{
              color: item === "API" ? "#fff" : "rgba(255,255,255,.75)",
              borderBottom: item === "API" ? "3px solid #fff" : "3px solid transparent",
              fontWeight: item === "API" ? 600 : 400,
            }}
          >
            {item}
          </span>
        ))}
        <span
          className="ml-auto my-1.5 px-3 flex items-center text-xs font-bold rounded cursor-pointer flex-shrink-0"
          style={{ background: GOLD, color: "#222" }}
        >
          Get Help
        </span>
      </div>

      {/* ── Hero ── */}
      <div
        className="text-center py-10 px-4"
        style={{ background: "linear-gradient(135deg,#EDE7F6 0%,#fff 60%)" }}
      >
        <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: CORPORATE_PURPLE }}>
          Plans that help you grow
        </h1>
        <p className="text-gray-500 text-sm">Transparent Pricing for You</p>
      </div>

      {/* ── Core API Plans ── */}
      <SectionLabel>Core API Plans</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto w-full px-5 pb-8">
        {CORE_PLANS.map((plan) => <PlanCard key={plan.name} plan={plan} />)}
      </div>

      {/* ── Advanced API Plans ── */}
      <SectionLabel>Advanced API Plans</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto w-full px-5 pb-12">
        {ADVANCED_PLANS.map((plan) => <PlanCard key={plan.name} plan={plan} />)}
      </div>

      <Footer />
    </div>
  );
}
