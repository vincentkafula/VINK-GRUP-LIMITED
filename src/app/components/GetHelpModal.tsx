import { X, Search, Phone, Mail, MessageCircle, ChevronRight, MapPin } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface GetHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Same data as Footer ──────────────────────────────────────────────────────
const COLS = [
  {
    title: "Credit Cards",
    links: ["Cash Back Cards", "Travel Rewards", "Balance Transfer", "No Annual Fee", "Student Cards", "Business Cards", "Secured Cards"],
  },
  {
    title: "Banking",
    links: ["Savings Accounts", "Checking Accounts", "Money Market", "CDs", "Online Banking", "Mobile App", "ATM Network"],
  },
  {
    title: "Loans",
    links: ["Personal Loans", "Auto Loans", "Mortgage", "Home Equity", "Student Loans", "Small Business", "Debt Consolidation"],
  },
  {
    title: "Investing",
    links: ["Stocks & ETFs", "Mutual Funds", "Retirement (IRA)", "Managed Portfolios", "Crypto", "Options", "Bonds"],
  },
  {
    title: "Insurance",
    links: ["Life Insurance", "Auto Insurance", "Home Insurance", "Health Insurance", "Travel Insurance", "Pet Insurance", "Business Insurance"],
  },
  {
    title: "Company",
    links: ["About Vink", "Careers", "Press", "Blog", "Partner With Us", "Advertise", "Affiliate Program"],
  },
];

const LEGAL_LINKS = ["Privacy Policy", "Terms of Use", "Advertiser Disclosure", "Site Map", "Accessibility", "Ad Choices"];

const CONTACT_CHANNELS = [
  { icon: <Phone className="w-5 h-5" />, label: "Call Us", value: "0800 VINK (8465)", sub: "Mon–Fri 08:00–20:00 | Sat 09:00–14:00", color: "#6B5ED7" },
  { icon: <MessageCircle className="w-5 h-5" />, label: "Live Chat", value: "Chat on VINK App", sub: "Available 24/7", color: "#10B981" },
  { icon: <Mail className="w-5 h-5" />, label: "Email Support", value: "support@vink.co.za", sub: "Reply within 2 business hours", color: "#3B82F6" },
  { icon: <MapPin className="w-5 h-5" />, label: "Visit Us", value: "8 Rose Street, Cape Town CBD", sub: "By appointment", color: "#F59E0B" },
];

export function GetHelpModal({ isOpen, onClose }: GetHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: "#14112B" }}
    >
      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ background: "#14112B", borderColor: "#2D2A4A" }}>
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="w-[140px] h-auto object-contain" />
          <span className="text-white/60 text-sm">Get Help &amp; Information</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1">
        {/* ── Hero / Search ── */}
        <div className="px-6 py-10 text-center border-b" style={{ background: "linear-gradient(135deg,#1E1B4B,#2D2060)", borderColor: "#2D2A4A" }}>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2">How can we help you?</h1>
          <p className="text-white/55 text-sm mb-6">Search our knowledge base or browse topics below</p>
          <div className="flex items-center gap-3 max-w-xl mx-auto bg-white/10 rounded-2xl px-4 py-3 border border-white/15">
            <Search className="w-5 h-5 text-white/40 flex-shrink-0" />
            <input
              placeholder="What can we help you with today?"
              className="flex-1 bg-transparent outline-none text-white placeholder-white/35 text-sm"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {["Reset PIN", "Lost or Stolen Card", "Transfer Money", "Open an Account", "Dispute a Transaction", "Freeze My Card"].map((t) => (
              <button key={t} className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:border-white/50 hover:text-white transition-colors">
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contact channels ── */}
        <div className="px-6 py-8 border-b" style={{ borderColor: "#2D2A4A" }}>
          <h2 className="text-white font-bold text-base mb-5">Contact Us</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CONTACT_CHANNELS.map((c, i) => (
              <button key={i}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border text-center hover:border-white/30 transition-all group"
                style={{ background: c.color + "12", borderColor: c.color + "40" }}>
                <div className="p-2.5 rounded-xl" style={{ background: c.color + "22", color: c.color }}>
                  {c.icon}
                </div>
                <div>
                  <p className="text-white text-xs font-semibold">{c.label}</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: c.color }}>{c.value}</p>
                  <p className="text-white/40 text-[11px] mt-0.5">{c.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Footer link columns (same as site footer) ── */}
        <div className="px-6 py-8 border-b" style={{ borderColor: "#2D2A4A" }}>
          <h2 className="text-white font-bold text-base mb-6">Browse Products &amp; Services</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {COLS.map((col) => (
              <div key={col.title}>
                <h3 className="text-white text-[11px] font-bold uppercase tracking-wider mb-3">{col.title}</h3>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-white/45 text-[11px] hover:text-white transition-colors flex items-center gap-1 group leading-relaxed">
                        <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" style={{ color: "#6B5ED7" }} />
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── App download + brand logos ── */}
        <div className="px-6 py-8 border-b" style={{ borderColor: "#2D2A4A" }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* App badges */}
            <div>
              <p className="text-white/45 text-[10px] uppercase tracking-wider mb-1">Take VINK Everywhere</p>
              <p className="text-white/60 text-xs mb-3">Download the Vink app for instant payments, card management, rewards, and more.</p>
              <div className="flex gap-3">
                {/* Apple */}
                <a href="#" className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 hover:bg-white/20 transition-colors">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white flex-shrink-0">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  <div>
                    <p className="text-white/55 text-[9px] leading-none">Download on the</p>
                    <p className="text-white text-xs font-semibold leading-snug mt-0.5">App Store</p>
                  </div>
                </a>
                {/* Google Play */}
                <a href="#" className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5 hover:bg-white/20 transition-colors">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" fill="none">
                    <path d="M3 3L13.5 12 3 21V3Z" fill="#EA4335" />
                    <path d="M3 3L13.5 12 21 7.5 7.5 1 3 3Z" fill="#FBBC04" />
                    <path d="M3 21L13.5 12 21 16.5 7.5 23 3 21Z" fill="#34A853" />
                    <path d="M13.5 12L21 7.5V16.5L13.5 12Z" fill="#4285F4" />
                  </svg>
                  <div>
                    <p className="text-white/55 text-[9px] leading-none">Get it on</p>
                    <p className="text-white text-xs font-semibold leading-snug mt-0.5">Google Play</p>
                  </div>
                </a>
              </div>
            </div>

            {/* Card brand logos */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-white rounded-md px-3 py-1.5">
                <svg viewBox="0 0 58 18" className="h-4 w-14"><text x="0" y="15" fontSize="18" fontWeight="900" fill="#1A1F71" fontFamily="Arial">VISA</text></svg>
              </div>
              <div className="flex">
                <div className="w-8 h-8 rounded-full" style={{ background: "#EB001B" }} />
                <div className="w-8 h-8 rounded-full -ml-4" style={{ background: "#F79E1B" }} />
              </div>
              <div className="rounded-md px-3 py-1.5" style={{ background: "#007BC1" }}>
                <svg viewBox="0 0 56 18" className="h-4 w-12"><text x="0" y="14" fontSize="13" fontWeight="700" fill="white" fontFamily="Arial">AMEX</text></svg>
              </div>
              <div className="bg-white rounded-md px-3 py-1.5 flex items-center gap-1.5">
                <svg viewBox="0 0 80 18" className="h-4 w-20"><text x="0" y="14" fontSize="11" fontWeight="700" fill="#231F20" fontFamily="Arial">DISCOVER</text></svg>
                <div className="w-4 h-4 rounded-full" style={{ background: "linear-gradient(135deg,#F4841B,#E36900)" }} />
              </div>
              <div className="border border-white/20 rounded-md px-3 py-1.5">
                <svg viewBox="0 0 50 18" className="h-4 w-10"><text x="0" y="14" fontSize="12" fontWeight="700" fill="white" fontFamily="Arial">FDIC</text></svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── Legal / bottom bar (same as footer) ── */}
        <div className="px-6 py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <img src={vinkLogo} alt="Vink" className="w-[120px] h-auto object-contain opacity-60" />
              <p className="text-white/35 text-[11px]">&copy; 2026 Vink Financial Services, Inc. All rights reserved.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {LEGAL_LINKS.map((l) => (
                <a key={l} href="#" className="text-white/35 text-[11px] hover:text-white/60 transition-colors">{l}</a>
              ))}
            </div>
          </div>
          <p className="text-white/25 text-[10px] leading-relaxed max-w-4xl">
            Editorial disclaimer: Opinions expressed here are the author&apos;s alone, not those of any bank, credit card issuer, airline or hotel chain, and have not been reviewed, approved or otherwise endorsed by any of these entities. All products are presented without warranty and subject to change.
          </p>
        </div>
      </div>
    </div>
  );
}
