import { useState } from "react";
import { X, FileText, Download, BarChart3, ShieldCheck, Compass, Users, ShieldAlert, Briefcase, Target, Trophy, TrendingUp, Rocket, type LucideIcon } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { BRAND } from "../brand";
import { PersonGrid } from "./GovernanceCards";

interface Props { isOpen: boolean; onClose: () => void; }

const P  = BRAND.crimson;
const GOLD = BRAND.crimson;          // the accent lines are the brand red

// ─── Data ─────────────────────────────────────────────────────────────────────

const SELLER_PILLS = ["Integrity", "Commitment", "Performance", "Loyalty", "Insight"];

const KPI_CARDS = [
  { label: "Addressable Market", value: "R11B", sub: "Estimated annual TAM across the national taxi network", color: "#FFFFFF" },
  { label: "Revenue Model", value: "Per-Tap", sub: "R0.50–R1.00 per transaction, scaling with network volume", color: "#FFFFFF" },
  { label: "Target Growth", value: "Multi-Year", sub: "Detailed year-by-year projections available on request", color: "#FFFFFF" },
];

const REASONS = [
  {
    title: "Leader",
    icon: Trophy,
    text: "Vink is positioned to become a category leader in diversified financial services across Southern Africa, targeting core return metrics and market penetration that outperform existing peers.",
  },
  {
    title: "Disciplined",
    icon: TrendingUp,
    text: "Vink's business plan is built on disciplined capital allocation and a diversified revenue base — banking, insurance, telecommunications and e-mobility — designed to cushion cyclical headwinds once operational.",
  },
  {
    title: "High growth potential",
    icon: Rocket,
    text: "VINK Finance targets rapid adoption from launch, driven by accelerated digital uptake among underbanked commuters, cost efficiency built into the platform from day one, and a clear roadmap for strategic partnerships.",
  },
];

const SHARE_ROWS = [
  { label: "STATUS",             value: "Pre-launch — full operation June 2027" },
  { label: "US REGISTRATION",    value: "EIN 37-2148609" },
  { label: "SA REGISTRATION",    value: "2018/079316/07" },
  { label: "ZAMBIA REGISTRATION", value: "120210020196" },
  { label: "TARGET GROWTH",      value: "7.5% p.a." },
  { label: "FUNDING SOUGHT",     value: "R4.5 Billion" },
  { label: "FUNDING TERM",       value: "60 months @ 7%" },
  { label: "ADDRESSABLE MARKET", value: "R11B / year (TAM)" },
  { label: "TAX RATE",           value: "28%" },
];

const INVESTOR_NEWS: { date: string; title: string; type: string; color: string }[] = [];

const DOCS: { name: string; size: string; date: string }[] = [
  { name: "Memorandum of Incorporation",      size: "1.1 MB",  date: "2018" },
];

/** The Board of Directors: ten people. Add `photo: "https://…"` to a person and the card shows the photo instead of the silhouette. */
const BOARD_MEMBERS: { name: string; role: string; tag?: string; photo?: string }[] = [
  { name: "Professor Oliver Saasa", role: "Chairperson", tag: "Chair" },
  { name: "Regina Mulenga",         role: "Vice Chairperson" },
  { name: "Cecilia Zimba",          role: "Non-Executive Director" },
  { name: "David Musunga",          role: "Non-Executive Director" },
  { name: "Deepak Malik",           role: "Non-Executive Director" },
  { name: "Leslie Horne",           role: "Non-Executive Director" },
  { name: "Michael Mbulo",          role: "Non-Executive Director" },
  { name: "Musata Ndhlovu",         role: "Non-Executive Director" },
  { name: "Owen Silavwe",           role: "Non-Executive Director" },
  { name: "Robin Miller",           role: "Non-Executive Director" },
];

const MINI_CHART = [1.44,1.62,1.55,1.80,2.10,1.95,2.30,2.45,2.20,2.50,2.38,2.60];

// ─── Corporate Governance data ────────────────────────────────────────────────

/** The Executive Committee: fifteen people, led by the Chief Executive Officer. */
const EXECUTIVE_COMMITTEE: { name: string; role: string; tag?: string; note?: string; photo?: string }[] = [
  { name: "Mukwandi Chibesakunda",                 role: "Chief Executive Officer*", tag: "CEO", note: "*Non-Board Member" },
  { name: "Kalaluka Itwi",                         role: "Chief Financial Officer" },
  { name: "Chali Mwefyeni",                        role: "Chief Commercial Officer" },
  { name: "Vincent Chuunga",                       role: "Chief Operations Officer" },
  { name: "Kaluba Gloria Kaulung\u2019ombe-Inampasa", role: "Chief Legal Officer and Company Secretary" },
  { name: "Kalengo S. Simukoko",                   role: "Chief Credit Risk Officer" },
  { name: "Mutisunge Zulu",                        role: "Chief Credit Risk Officer" },
  { name: "Wisdom Shangenta",                      role: "Chief Information Officer" },
  { name: "Mwila Chibela",                         role: "Chief Digital Banking Officer" },
  { name: "Nawa Themba Joel Samatebele",           role: "Chief Information Security Officer" },
  { name: "Henry Kalubi",                          role: "Acting Chief Human Capital Officer" },
  { name: "Chanda Chime Katongo",                  role: "Executive Head Client Solutions" },
  { name: "Fredrick K. Mulenga",                   role: "Executive Head Treasury" },
  { name: "Temba Nonde",                           role: "Executive Head Compliance and Financial Crimes" },
  { name: "Eletina Phiri Bbuku",                   role: "Executive Head Internal Audit" },
];

/** What each group is responsible for, in the Board's own words. */
const BOARD_INTRO = "The Board of Directors retains full and effective control of the bank and monitors the Executive Management Team. The Board is also responsible for direction, policies and strategies and all investment and divestment decisions. It also ensures that the bank meets its responsibilities towards all its stakeholders and that the bank is prudently managed against the major risks inherent in business and banking.";
const EXEC_INTRO = "The Executive Committee, led by the Chief Executive Officer, is responsible for the day-to-day management of the bank and for executing the strategy and policies set by the Board of Directors.";

const RESPONSIBILITIES: { group: string; title: string; icon: LucideIcon; text: string }[] = [
  { group: "The Board", title: "Full and effective control", icon: ShieldCheck, text: "The Board retains full and effective control of the bank and monitors the Executive Management Team." },
  { group: "The Board", title: "Direction and strategy", icon: Compass, text: "The Board is responsible for direction, policies and strategies, and for all investment and divestment decisions." },
  { group: "The Board", title: "Stakeholders", icon: Users, text: "The Board ensures that the bank meets its responsibilities towards all its stakeholders." },
  { group: "The Board", title: "Prudent management of risk", icon: ShieldAlert, text: "The Board ensures that the bank is prudently managed against the major risks inherent in business and banking." },
  { group: "The Executive Committee", title: "Day-to-day management", icon: Briefcase, text: "The Executive Committee, led by the Chief Executive Officer, is responsible for the day-to-day management of the bank." },
  { group: "The Executive Committee", title: "Executing the strategy", icon: Target, text: "The Executive Committee executes the strategy and policies set by the Board of Directors." },
];

// ─── Tiny sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data), max = Math.max(...data);
  const W = 220, H = 60;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={BRAND.info} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts.split(" ").pop()!.split(",")[0]} cy={pts.split(" ").pop()!.split(",")[1]} r="4" fill={BRAND.info} />
    </svg>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold mb-5 pb-2 border-b-2" style={{ color: "var(--vk-fg)", borderColor: GOLD }}>
      {children}
    </h2>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function InvestorRelationsViewer({ isOpen, onClose }: Props) {
  const [activePill, setActivePill] = useState(0);
  const [govTab, setGovTab] = useState<"board" | "executive" | "responsibilities">("board");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "color-mix(in srgb, #f7f7fb var(--vk-wash), var(--vk-surface))" }}>

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-surface border-b shadow-sm" style={{ borderColor: "#e0e0e0" }}>
        <div className="flex items-center gap-3">
          <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
          <div className="hidden sm:flex items-center gap-6 text-sm ml-4">
            {["Personal", "Business", "Corporate"].map(n => (
              <span key={n} className="text-fg-muted hover:text-fg cursor-pointer transition-colors">{n}</span>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Hero banner ── */}
      <div className="px-6 py-8" style={{ background: "#C8102E" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">VINK Finance · Corporate</p>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-1">Investor Relations</h1>
          <p className="text-white/70 text-sm mb-6">Business Plan &amp; Projections</p>
          <p className="text-white/80 text-sm max-w-2xl leading-relaxed mb-6">
            VINK is building South Africa's first transport-native digital bank, with a national rollout plan for 250,000+ AFC devices across the minibus taxi network. Registered under CIPC number 2018/079316/07, VINK is building the financial infrastructure that 15 million daily commuters deserve.
          </p>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl">
            {KPI_CARDS.map((k) => (
              <div key={k.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,.12)" }}>
                <div className="text-3xl font-black mb-1" style={{ color: k.color }}>{k.value}</div>
                <div className="text-white text-xs font-semibold">{k.label}</div>
                <div className="text-white/50 text-[10px] mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-4 py-8 space-y-10">

        {/* ── Seller / category pills ── */}
        <div>
          <div className="flex flex-wrap gap-2 mb-6">
            {SELLER_PILLS.map((p, i) => (
              <button key={p} onClick={() => setActivePill(i)}
                className="rounded-full px-5 py-1.5 text-sm font-medium transition-all border"
                style={{ background: activePill === i ? P : "color-mix(in srgb, #fff var(--vk-wash), var(--vk-surface))", color: activePill === i ? "color-mix(in srgb, #fff var(--vk-wash), var(--vk-surface))" : P, borderColor: P }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* ── 3 Reasons ── */}
        <div>
          <h2 className="text-xl font-black text-center mb-2" style={{ color: "var(--vk-fg)" }}>
            3 Reasons to Consider Investing in VINK
          </h2>
          <p className="text-center text-sm text-fg-muted mb-6">Why sophisticated investors choose Vink</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {REASONS.map((r) => (
              <div key={r.title} className="bg-surface rounded-xl border border-line p-6 hover:shadow-md transition-shadow">
                <span aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}><r.icon className="h-6 w-6" /></span>
                <h3 className="text-base font-bold mb-2" style={{ color: "var(--vk-fg)" }}>{r.title}</h3>
                <p className="text-sm text-fg-muted leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Share price ── */}
        <div>
          <SectionHeading>Our Share Price in Action</SectionHeading>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-4xl font-black" style={{ color: "var(--vk-fg)" }}>2.60</span>
                  <span className="text-sm font-bold text-green-600 mb-1">+1.96% ▲</span>
                </div>
                <p className="text-xs text-fg-muted mb-4">ZAR · JSE · 15 Sep 2022</p>
                <Sparkline data={MINI_CHART} />
                <p className="text-[10px] text-fg-subtle mt-1">12-month price movement</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2">
                {SHARE_ROWS.map((r) => (
                  <div key={r.label} className="flex justify-between border-b border-line py-1.5 text-xs">
                    <span className="text-fg-muted font-medium">{r.label}</span>
                    <span className="font-bold text-fg">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Investor News ── */}
        <div>
          <SectionHeading>Investor News</SectionHeading>
          {INVESTOR_NEWS.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-6 text-center">
              <p className="text-sm text-fg-muted">VINK is not yet in full operation. Investor news and quarterly updates will be published here as we approach our June 2027 launch.</p>
            </div>
          ) : (
          <div className="space-y-2">
            {INVESTOR_NEWS.map((n, i) => (
              <div key={i} className="bg-surface rounded-xl border border-line flex items-center gap-4 p-4 hover:shadow-sm transition-shadow cursor-pointer">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--vk-bad-bg)" }}>
                  <FileText className="w-5 h-5" style={{ color: BRAND.bad }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fg leading-snug">{n.title}</p>
                  <p className="text-xs text-fg-subtle mt-0.5">{n.date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{n.type}</span>
                  <Download className="w-4 h-4 text-fg-subtle hover:text-fg transition-colors" />
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* ── Documents and Reports ── */}
        <div>
          <SectionHeading>Documents and Reports</SectionHeading>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line" style={{ background: "var(--vk-surface-2)" }}>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--vk-fg)" }}>Document</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--vk-fg)" }}>Size</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--vk-fg)" }}>Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {DOCS.map((d, i) => (
                  <tr key={i} className="border-b border-line hover:bg-emerald-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-fg">{d.name}</td>
                    <td className="px-5 py-3 text-fg-muted text-xs">{d.size}</td>
                    <td className="px-5 py-3 text-fg-muted text-xs">{d.date}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                        style={{ background: P, color: "color-mix(in srgb, #fff var(--vk-wash), var(--vk-surface))" }}>
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Corporate Governance — tabbed ── */}
        <div>
          <SectionHeading>Corporate Governance</SectionHeading>

          {/* What the group is responsible for */}
          <div className="bg-surface rounded-xl border border-line p-5 mb-5 text-sm text-fg leading-relaxed">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--vk-crimson-text)" }} />
              <span className="font-bold text-fg">{govTab === "executive" ? "The Executive Committee" : govTab === "responsibilities" ? "Responsibilities" : "The Board of Directors"}</span>
            </div>
            {govTab === "executive" ? EXEC_INTRO : govTab === "responsibilities" ? "What the Board and the Executive Committee are each responsible for." : BOARD_INTRO}
          </div>

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
            {([
              { key: "board",           label: "Board of Directors",   count: BOARD_MEMBERS.length },
              { key: "executive",       label: "Executive Committee",  count: EXECUTIVE_COMMITTEE.length },
              { key: "responsibilities", label: "Responsibilities",    count: 0 },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setGovTab(tab.key)}
                className="px-4 py-2.5 text-sm font-medium flex-shrink-0 transition-colors border-b-2 -mb-px"
                style={{
                  borderBottomColor: govTab === tab.key ? P : "transparent",
                  color: govTab === tab.key ? P : "#6B7280",
                  background: "transparent",
                }}>
                {tab.label}
                {tab.count > 0 && <em className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold not-italic" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}>{tab.count}</em>}
              </button>
            ))}
          </div>

          {/* ── Board of Directors ── */}
          {govTab === "board" && <PersonGrid groupKey="board" noun="members of the Board" people={BOARD_MEMBERS} />}

          {/* ── Executive Committee ── */}
          {govTab === "executive" && <PersonGrid groupKey="executive" noun="members of the Executive Committee" people={EXECUTIVE_COMMITTEE} />}

          {/* ── Responsibilities ── */}
          {govTab === "responsibilities" && (
            <div className="space-y-8">
              {["The Board", "The Executive Committee"].map((g) => (
                <div key={g}>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">{g}</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {RESPONSIBILITIES.filter((r) => r.group === g).map((r) => (
                      <div key={r.title} className="rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md">
                        <span aria-hidden="true" className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}><r.icon className="h-5 w-5" /></span>
                        <h4 className="mb-2 text-sm font-bold text-fg">{r.title}</h4>
                        <p className="text-xs leading-relaxed text-fg-muted">{r.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <Footer />

    </div>
  );
}
