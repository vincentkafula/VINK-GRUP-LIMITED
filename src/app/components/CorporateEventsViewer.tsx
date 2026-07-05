import { useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const PD = "#3d1d63";
const GOLD = "#F5A623";

const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

// ─── Data ─────────────────────────────────────────────────────────────────────

const QUICK_CATS = [
  { icon: "🛒", label: "MMA" },
  { icon: "🏪", label: "TOP UP" },
  { icon: "🛒", label: "GROCERIES" },
  { icon: "✈️", label: "TRAVEL" },
  { icon: "🎮", label: "GAMING" },
  { icon: "🎫", label: "PREPAID VOUCHERS" },
  { icon: "🎓", label: "EDUCATION" },
];

const CAT_STRIP = ["Sell Your Event With…", "Travel", "On Stage", "Lifestyle", "Sport", "Music"];

interface EventCard { icon: string; name: string; loc: string; date: string; price: string; bg: string; badge?: string; }

const POPULAR: EventCard[] = [
  { icon: "🛒", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: `linear-gradient(135deg,${P},#6C3DB5)` },
  { icon: "✈️", name: "Africa Aerospace…", loc: "Gauteng", date: "Sat, 24 Sep 22 – Sun, 25 Sep 22", price: "From R200", bg: "linear-gradient(135deg,#1565C0,#1E88E5)" },
  { icon: "🎭", name: "The Trolley Dollies…", loc: "Gauteng", date: "Thu, 08 Sep 22 – Sun, 11 Sep 22", price: "From R50", bg: "linear-gradient(135deg,#880E4F,#C2185B)" },
  { icon: "🛒", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: `linear-gradient(135deg,${P},#6C3DB5)` },
  { icon: "🛒", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: `linear-gradient(135deg,${P},#6C3DB5)` },
  { icon: "🛒", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: `linear-gradient(135deg,${P},#6C3DB5)` },
];

const VOUCHERS: EventCard[] = [
  { icon: "🛒", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#c8102e,#e63946)" },
  { icon: "🛒", name: "Shoprite Multiple…", loc: "Gauteng", date: "Wed, 31 Dec 25", price: "FROM R10", bg: "linear-gradient(135deg,#c8102e,#e63946)" },
  { icon: "🎮", name: "Xbox", loc: "Gauteng", date: "Sat, 02 Jan 49", price: "FROM R149", bg: "linear-gradient(135deg,#107c10,#1a9b1a)" },
  { icon: "🎮", name: "Steam", loc: "Gauteng", date: "Sat, 02 Jan 49", price: "From R150", bg: "linear-gradient(135deg,#1b2838,#2a475e)" },
  { icon: "🛒", name: "Shoprite Multiple…", loc: "Gauteng", date: "Mon, 16 Jul 40", price: "From R50", bg: "linear-gradient(135deg,#c8102e,#e63946)" },
  { icon: "🛒", name: "Checkers Virtual…", loc: "Gauteng", date: "Mon, 16 Jul 40", price: "From R50", bg: "linear-gradient(135deg,#00703c,#009a52)" },
];

const COMEDY: EventCard[] = [
  { icon: "😂", name: "The Trolley Dollies…", loc: "Gauteng", date: "Fri, 09 Sep 22 – Sun, 11 Sep 22", price: "FROM R200", bg: "linear-gradient(135deg,#7B1FA2,#AB47BC)" },
  { icon: "😂", name: "Celeste Ntuli…", loc: "Gauteng", date: "Sat, 10 Sep 22", price: "FROM R300", bg: "linear-gradient(135deg,#7B1FA2,#AB47BC)" },
  { icon: "🎭", name: "WHO'S AFRAID…", loc: "Gauteng, Western Cape", date: "Wed, 14 Sep 22 – Sun, 06 Nov 22", price: "FROM R150", bg: "linear-gradient(135deg,#B71C1C,#E53935)" },
  { icon: "🎭", name: "FORDSBURG'S FINEST", loc: "Western Cape", date: "Fri, 09 Sep 22 – Sat, 10 Sep 22", price: "FROM R180", bg: "linear-gradient(135deg,#E65100,#FF8F00)" },
  { icon: "😂", name: "BIG AMMA & BIGGS", loc: "Gauteng", date: "Sun, 11 Sep 22", price: "FROM R130", bg: "linear-gradient(135deg,#1565C0,#1E88E5)" },
  { icon: "🏹", name: "Robin Hood", loc: "Western Cape", date: "Fri, 09 Sep 22 – Sat, 17 Sep 22", price: "FROM R100", bg: "linear-gradient(135deg,#2E7D32,#43A047)" },
];

const AFRIKAANS: EventCard[] = [
  { icon: "🎵", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#37474F,#546E7A)", badge: "ON DEMAND" },
  { icon: "🎵", name: "Africa Aerospace…", loc: "Gauteng", date: "Sat, 24 Sep 22 – Sun, 25 Sep 22", price: "From R200", bg: "linear-gradient(135deg,#4A148C,#7B1FA2)", badge: "ON DEMAND" },
  { icon: "🎵", name: "The Trolley Dollies…", loc: "Gauteng", date: "Thu, 08 Sep 22 – Sun, 11 Sep 22", price: "From R50", bg: "linear-gradient(135deg,#880E4F,#C2185B)", badge: "ON DEMAND" },
  { icon: "🎵", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#1A237E,#283593)" },
  { icon: "🎵", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#004D40,#00695C)" },
  { icon: "🎵", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#BF360C,#E64A19)" },
];

const CONCERTS: EventCard[] = [
  { icon: "🎤", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#212121,#424242)" },
  { icon: "🎤", name: "Africa Aerospace…", loc: "Gauteng", date: "Sat, 24 Sep 22 – Sun, 25 Sep 22", price: "From R200", bg: "linear-gradient(135deg,#311B92,#4527A0)" },
  { icon: "🎤", name: "The Trolley Dollies…", loc: "Gauteng", date: "Thu, 08 Sep 22 – Sun, 11 Sep 22", price: "From R50", bg: "linear-gradient(135deg,#1A237E,#283593)" },
  { icon: "🎤", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#880E4F,#AD1457)" },
  { icon: "🎤", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#B71C1C,#C62828)" },
  { icon: "🎤", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#E65100,#F57F17)" },
];

const WATCH_ONLINE: EventCard[] = [
  { icon: "📺", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#1B5E20,#2E7D32)" },
  { icon: "📺", name: "Africa Aerospace…", loc: "Gauteng", date: "Sat, 24 Sep 22 – Sun, 25 Sep 22", price: "From R200", bg: "linear-gradient(135deg,#4A148C,#6A1B9A)" },
  { icon: "📺", name: "The Trolley Dollies…", loc: "Gauteng", date: "Thu, 08 Sep 22 – Sun, 11 Sep 22", price: "From R50", bg: "linear-gradient(135deg,#0D47A1,#1565C0)" },
  { icon: "📺", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#37474F,#455A64)" },
  { icon: "📺", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#BF360C,#D84315)" },
  { icon: "📺", name: "Shoprite Gr…", loc: "Gauteng", date: "Fri, 31 Jan 25", price: "From R50", bg: "linear-gradient(135deg,#880E4F,#AD1457)" },
];

const REGIONS = [
  { name: "🏙️ Cape Town",       bg: "linear-gradient(135deg,#1565C0,#1E88E5)" },
  { name: "🌊 Port Elizabeth",  bg: "linear-gradient(135deg,#2E7D32,#43A047)" },
  { name: "🌸 Bloemfontein",    bg: "linear-gradient(135deg,#E65100,#FF8F00)" },
  { name: "🏙️ Johannesburg",    bg: `linear-gradient(135deg,${P},#7B4DB5)` },
  { name: "🏛️ Pretoria",        bg: "linear-gradient(135deg,#B71C1C,#E53935)" },
  { name: "🌿 Potchefstroom",   bg: "linear-gradient(135deg,#37474F,#546E7A)" },
];

// ─── Carousel ─────────────────────────────────────────────────────────────────

function Carousel({ items }: { items: EventCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <div className="relative">
      <button onClick={() => scroll(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-purple-50 transition-colors" style={{ color: P }}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map((card, i) => (
          <div key={i} className="flex-none w-40 rounded-lg border border-gray-200 bg-white cursor-pointer hover:shadow-md transition-shadow overflow-hidden" style={{ borderColor: "#e0e0e0" }}>
            <div className="w-full h-24 flex items-center justify-center text-3xl" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <div className="p-2">
              <div className="text-[.78rem] font-semibold text-gray-800 leading-snug mb-0.5">
                {card.name}
                {card.badge && <span className="ml-1 text-[.6rem] bg-gray-100 text-gray-500 px-1 rounded">{card.badge}</span>}
              </div>
              <div className="text-[.72rem] text-gray-500">{card.loc}</div>
              <div className="text-[.7rem] text-gray-400 mt-0.5">{card.date}</div>
              <span className="inline-block mt-1.5 text-[.7rem] font-bold text-white rounded-full px-2.5 py-0.5" style={{ background: P }}>
                {card.price}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => scroll(1)} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-purple-50 transition-colors" style={{ color: P }}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-base font-bold text-gray-800 mb-4">
      {children}
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

export function CorporateEventsViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#f5f5f7]">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Main nav ── */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-6 overflow-x-auto text-sm">
        {["Menu", "Personal", "Business", "Corporate", "Marketplace"].map((item) => (
          <span key={item} className="py-3 flex-shrink-0 font-medium"
            style={{ color: item === "Corporate" ? P : "#444", borderBottom: item === "Corporate" ? `2px solid ${P}` : "2px solid transparent" }}>
            {item}
          </span>
        ))}
      </div>

      {/* ── Sub nav ── */}
      <div className="flex overflow-x-auto px-4" style={{ background: P }}>
        {CORPORATE_SUB_NAV.map((item) => (
          <span key={item} className="text-xs py-2.5 px-3 flex-shrink-0 cursor-pointer transition-colors"
            style={{ color: item === "Events" ? "#fff" : "rgba(255,255,255,.75)", borderBottom: item === "Events" ? "3px solid #fff" : "3px solid transparent", fontWeight: item === "Events" ? 600 : 400 }}>
            {item}
          </span>
        ))}
        <span className="ml-auto my-1.5 px-3 flex items-center text-xs font-bold rounded cursor-pointer flex-shrink-0" style={{ background: GOLD, color: "#222" }}>
          Get Help
        </span>
      </div>

      {/* ── Hero Banner ── */}
      <div className="relative h-64 flex items-end justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg,#1a0533 0%,${PD} 50%,${P} 100%)` }}>
        {/* Decorative circles */}
        <div className="absolute rounded-full" style={{ width: 300, height: 300, top: -80, left: -60, background: "rgba(245,166,35,.08)" }} />
        <div className="absolute rounded-full" style={{ width: 200, height: 200, bottom: -60, right: 80, background: "rgba(245,166,35,.08)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,.1) 60%)" }} />
        <div className="relative z-10 text-center pb-8 px-4">
          <h1 className="text-5xl font-black tracking-widest leading-none" style={{ color: GOLD, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>
            IMBIZO
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1 text-sm" style={{ color: "rgba(255,255,255,.9)" }}>
            <span>✦</span>
            <span style={{ color: GOLD }}>Carnival City Big Top Arena</span>
            <span>✦</span>
          </div>
          <div className="mt-1.5 text-xs uppercase tracking-wide" style={{ color: "rgba(255,255,255,.7)" }}>
            Date: 01 Oct 2022 &nbsp;|&nbsp; Doors Open at 5PM &nbsp;|&nbsp; Show Starts at 6PM
          </div>
        </div>
      </div>

      {/* ── Quick category tiles ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex gap-3 overflow-x-auto pb-1 max-w-5xl mx-auto" style={{ scrollbarWidth: "none" }}>
          {QUICK_CATS.map((cat) => (
            <a key={cat.label} href="#"
              className="flex-none w-24 rounded-xl border-2 border-gray-200 bg-white flex flex-col items-center justify-center gap-1.5 py-3 cursor-pointer text-center text-[.78rem] font-semibold text-gray-700 hover:border-purple-500 hover:shadow-md transition-all no-underline">
              <span className="text-3xl">{cat.icon}</span>
              {cat.label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Category strip ── */}
      <div className="bg-white border-b border-gray-200 flex overflow-x-auto px-4">
        {CAT_STRIP.map((cat, i) => (
          <span key={cat} className="px-4 py-2.5 text-sm flex-shrink-0 cursor-pointer transition-colors"
            style={{ color: i === 0 ? P : "#888", borderBottom: i === 0 ? `2px solid ${P}` : "2px solid transparent", fontWeight: i === 0 ? 600 : 400 }}>
            {cat}
          </span>
        ))}
      </div>

      {/* ── Sell Event Banner ── */}
      <div className="max-w-5xl mx-auto w-full px-5 mt-5">
        <div className="flex items-center gap-4 rounded-xl px-6 py-4 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: `linear-gradient(90deg,${PD} 0%,${P} 100%)` }}>
          <span className="text-3xl">🎪</span>
          <div className="flex-1">
            <h3 className="text-white font-bold text-base">Sell Your Event With VMS</h3>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,.75)" }}>Flights, Buses, Cars and Packages — reach thousands of customers</p>
          </div>
          <span className="text-2xl font-bold" style={{ color: GOLD }}>›</span>
        </div>
      </div>

      {/* ── Event sections ── */}
      {[
        { title: "Popular",             items: POPULAR },
        { title: "Vouchers",            items: VOUCHERS },
        { title: "Comedy",              items: COMEDY },
        { title: "Afrikaans",           items: AFRIKAANS },
        { title: "Concerts",            items: CONCERTS },
        { title: "Watch A Show Online", items: WATCH_ONLINE },
      ].map(({ title, items }) => (
        <div key={title} className="max-w-5xl mx-auto w-full px-5 mt-7">
          <SectionTitle>{title}</SectionTitle>
          <Carousel items={items} />
        </div>
      ))}

      {/* ── Regions ── */}
      <div className="max-w-5xl mx-auto w-full px-5 mt-7">
        <SectionTitle>Regions</SectionTitle>
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {REGIONS.map((r) => (
              <div key={r.name} className="flex-none w-40 h-24 rounded-lg overflow-hidden relative cursor-pointer hover:shadow-lg transition-shadow"
                style={{ background: r.bg }}>
                <div className="absolute inset-0 opacity-80" style={{ background: r.bg }} />
                <div className="absolute bottom-0 left-0 right-0 p-2 text-sm font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,.5)" }}>
                  {r.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom actions ── */}
      <div className="flex gap-3 justify-center py-8 px-5">
        <button className="rounded-full px-7 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ background: P }}>
          Store Locator
        </button>
        <button className="rounded-full px-7 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
          style={{ background: "none", border: `1.5px solid ${P}`, color: P }}>
          Contact Us
        </button>
      </div>

      <Footer />

    </div>
  );
}
