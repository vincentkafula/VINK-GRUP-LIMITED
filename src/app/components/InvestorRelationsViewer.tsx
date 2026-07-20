import { useState } from "react";
import { X, FileText, Download, BarChart3 } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; }

const P  = "#5B2D8E";
const PD = "#3d1d63";
const GOLD = "#F5A623";

// ─── Data ─────────────────────────────────────────────────────────────────────

const SELLER_PILLS = ["Integrity", "Commitment", "Performance", "Loyalty", "Insight"];

const KPI_CARDS = [
  { label: "Year 1 Revenue Projection", value: "R74.2B", sub: "FY2021/22 business plan projection", color: "#10B981" },
  { label: "5-Year Cumulative Profit",  value: "R266.4B", sub: "Projected net profit over 5 years", color: "#3B82F6" },
  { label: "Annual Growth Rate",         value: "7.5%", sub: "Assumed year-on-year growth", color: "#F5A623" },
];

const REASONS = [
  {
    title: "Leader",
    icon: "🏆",
    text: "Vink Group is a category leader in diversified financial services across Southern Africa, consistently outperforming peers on core return metrics and market penetration.",
  },
  {
    title: "Consistent",
    icon: "📈",
    text: "The group has delivered uninterrupted dividend growth for four consecutive years, backed by disciplined capital allocation and a diversified revenue base that cushions cyclical headwinds.",
  },
  {
    title: "Exceeding expectations",
    icon: "🚀",
    text: "VINK has surpassed consensus earnings forecasts in each of the last eight quarters, driven by accelerated digital adoption, cost efficiency programmes and strategic corporate acquisitions.",
  },
];

const SHARE_ROWS = [
  { label: "LAST PRICE",         value: "2.60 ZAR" },
  { label: "PROPOSED TICKER",    value: "R.SX: VINK" },
  { label: "REGISTRATION",       value: "2018/079316/07" },
  { label: "ANNUAL GROWTH",      value: "7.5% p.a." },
  { label: "FUNDING RAISED",     value: "R4.5 Billion" },
  { label: "FUNDING TERM",       value: "60 months @ 7%" },
  { label: "NET PROFIT (YR1)",   value: "R45.4B" },
  { label: "TAX RATE",           value: "28%" },
];

const INVESTOR_NEWS = [
  { date: "15 Jun 2022", title: "VINK Quarterly Financial Statements for the quarter ended 15 June 2022", type: "PDF", color: "#EF4444" },
  { date: "17 Mar 2022", title: "VINK Quarterly Financial Statements for the quarter ended 17 March 2022", type: "PDF", color: "#EF4444" },
  { date: "02 Feb 2022", title: "VINK: Release of 2021–2022 Annual Report", type: "PDF", color: "#EF4444" },
  { date: "14 Nov 2021", title: "VINK Notice of Annual General Meeting — November 2021", type: "PDF", color: "#EF4444" },
];

const DOCS = [
  { name: "Annual Report 2021–2022",         size: "4.2 MB",  date: "Feb 2022" },
  { name: "Quarterly Results Q3 2022",        size: "1.8 MB",  date: "Jun 2022" },
  { name: "Quarterly Results Q2 2022",        size: "1.7 MB",  date: "Mar 2022" },
  { name: "Integrated Report 2021",           size: "6.1 MB",  date: "Mar 2021" },
  { name: "Environmental & Social Report",    size: "2.9 MB",  date: "Jan 2022" },
  { name: "Notice of AGM 2022",               size: "0.9 MB",  date: "Oct 2022" },
  { name: "Memorandum of Incorporation",      size: "1.1 MB",  date: "2018" },
  { name: "Shareholders' Compact 2022",       size: "0.5 MB",  date: "Jan 2022" },
];

const BOARD_MEMBERS = [
  { name: "Vincent Kafula",       role: "Founder & Chief Executive Officer",    initial: "VK", color: "#5B2D8E" },
  { name: "Siyasanga Mahlulo",    role: "Chief Executive Officer (Operations)", initial: "SM", color: "#3B82F6" },
  { name: "Thabo Dlamini",        role: "Chief Financial Officer",              initial: "TD", color: "#10B981" },
  { name: "Priya Naidoo",         role: "Chief Operating Officer",              initial: "PN", color: "#8B5CF6" },
  { name: "Lindiwe Mokoena",      role: "Independent Non-Exec Director",        initial: "LM", color: "#EF4444" },
  { name: "Sipho Khumalo",        role: "Board Secretary & Compliance",         initial: "SK", color: "#06B6D4" },
];

const MINI_CHART = [1.44,1.62,1.55,1.80,2.10,1.95,2.30,2.45,2.20,2.50,2.38,2.60];

// ─── Corporate Governance data ────────────────────────────────────────────────

const MANAGEMENT_TEAM = [
  { name: "Vincent Kafula",      title: "Founder & CEO",                       initial: "VK", color: "#5B2D8E", province: "Cape Town, Western Cape" },
  { name: "Siyasanga Mahlulo",   title: "Chief Executive Officer (Operations)",initial: "SM", color: "#3B82F6", province: "Cape Town, Western Cape" },
  { name: "Thabo Dlamini",       title: "Chief Financial Officer",             initial: "TD", color: "#10B981", province: "Gauteng" },
  { name: "Priya Naidoo",        title: "Chief Operating Officer",             initial: "PN", color: "#8B5CF6", province: "KwaZulu-Natal" },
  { name: "James van der Berg",  title: "Chief Risk Officer",                  initial: "JV", color: "#F59E0B", province: "Western Cape" },
  { name: "Lindiwe Mokoena",     title: "Chief People Officer",                initial: "LM", color: "#EF4444", province: "Gauteng" },
  { name: "Sipho Khumalo",       title: "Chief Technology Officer",            initial: "SK", color: "#06B6D4", province: "Gauteng" },
  { name: "Amahle Zulu",         title: "Chief Marketing Officer",             initial: "AZ", color: "#EC4899", province: "KwaZulu-Natal" },
];

const COMMITTEES = [
  {
    name: "AUDIT COMMITTEE",
    color: "#EDE7F6",
    borderColor: "#7C3AED",
    members: [
      { initial: "PD", name: "Pieter Du Plessis", role: "Chair",   province: "Western Cape",   color: "#7C3AED" },
      { initial: "RS", name: "Reza Solomon",       role: "Member",  province: "KwaZulu-Natal",  color: "#7C3AED" },
      { initial: "AM", name: "Amahle Mokoena",     role: "Member",  province: "Gauteng",         color: "#7C3AED" },
    ],
  },
  {
    name: "RISK COMMITTEE",
    color: "#FEF3C7",
    borderColor: "#D97706",
    members: [
      { initial: "TN", name: "Thabo Nkosi",    role: "Chair",   province: "Gauteng",        color: "#D97706" },
      { initial: "FN", name: "Fatima Naidoo",  role: "Member",  province: "KwaZulu-Natal",  color: "#D97706" },
      { initial: "KD", name: "Kaginx Dlamini", role: "Member",  province: "North West",     color: "#D97706" },
    ],
  },
  {
    name: "REMUNERATION COMMITTEE",
    color: "#DCFCE7",
    borderColor: "#16A34A",
    members: [
      { initial: "LM", name: "Lerato Modise",    role: "Chair",   province: "KwaZulu-Natal",  color: "#16A34A" },
      { initial: "ND", name: "Nandi Piot",        role: "Member",  province: "Free State",     color: "#16A34A" },
      { initial: "BM", name: "Bongani Mthembu",  role: "Member",  province: "Eastern Cape",   color: "#16A34A" },
    ],
  },
  {
    name: "SOCIAL & ETHICS COMMITTEE",
    color: "#FEE2E2",
    borderColor: "#DC2626",
    members: [
      { initial: "NZ", name: "Nomsa Zulu",    role: "Chair",   province: "Mpumalanga",   color: "#DC2626" },
      { initial: "OB", name: "Olwethu Booi",  role: "Member",  province: "Eastern Cape", color: "#DC2626" },
      { initial: "MK", name: "Mpho Khumalo",  role: "Member",  province: "North West",   color: "#DC2626" },
    ],
  },
];

const RESPONSIBILITIES = [
  {
    title: "Strategic Direction",
    icon: "🎯",
    text: "The Board is responsible for setting the strategic direction of VINK, approving major decisions and ensuring these are aligned with the long-term interests of shareholders and all stakeholders.",
  },
  {
    title: "Financial Oversight",
    icon: "💰",
    text: "The Board oversees the integrity of financial reporting, internal controls, risk management systems and ensures compliance with statutory and regulatory requirements.",
  },
  {
    title: "Executive Accountability",
    icon: "👤",
    text: "The Board appoints and evaluates the performance of the Chief Executive Officer and other executive directors, sets remuneration policy and approves material transactions.",
  },
  {
    title: "Ethics & Governance",
    icon: "⚖️",
    text: "The Board fosters a culture of ethical conduct, oversees the company's Social & Ethics Committee and ensures adherence to the King IV Report on Corporate Governance.",
  },
  {
    title: "Stakeholder Engagement",
    icon: "🤝",
    text: "The Board promotes open and transparent communication with shareholders, regulators, employees, customers and communities in which VINK operates.",
  },
  {
    title: "Risk Management",
    icon: "🛡️",
    text: "The Board is accountable for determining the risk appetite of the group and for overseeing the identification, assessment and management of material risks.",
  },
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
      <polyline points={pts} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts.split(" ").pop()!.split(",")[0]} cy={pts.split(" ").pop()!.split(",")[1]} r="4" fill="#3B82F6" />
    </svg>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold mb-5 pb-2 border-b-2" style={{ color: PD, borderColor: GOLD }}>
      {children}
    </h2>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function InvestorRelationsViewer({ isOpen, onClose }: Props) {
  const [activePill, setActivePill] = useState(0);
  const [govTab, setGovTab] = useState<"board" | "management" | "committees" | "responsibilities">("board");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#f7f7fb" }}>

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm" style={{ borderColor: "#e0e0e0" }}>
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
          <div className="hidden sm:flex items-center gap-6 text-sm ml-4">
            {["Personal", "Business", "Corporate", "Marketplace"].map(n => (
              <span key={n} className="text-gray-500 hover:text-gray-800 cursor-pointer transition-colors">{n}</span>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Hero banner ── */}
      <div className="px-6 py-8" style={{ background: `linear-gradient(135deg,${PD} 0%,${P} 60%,#7B4DB5 100%)` }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-white/60 text-xs uppercase tracking-widest mb-1">VINK Bank · Corporate</p>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-1">Investor Relations</h1>
          <p className="text-white/70 text-sm mb-6">FY – 2022</p>
          <p className="text-white/80 text-sm max-w-2xl leading-relaxed mb-6">
            In 2022, Vink Group achieved a historic milestone: South Africa's first transport-native digital bank, processing over 250,000 AFC device transactions with a projected Year 1 revenue of R74.2 billion. Registered under CIPC number 2018/079316/07, VINK is building the financial infrastructure that 15 million daily commuters deserve.
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
                style={{ background: activePill === i ? P : "#fff", color: activePill === i ? "#fff" : P, borderColor: P }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* ── Company info ── */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <SectionHeading>VINK MULTI SERVICES PTY LTD</SectionHeading>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                Vink Group PTY LTD is a professional diversified financial services company. Our commitment to financial excellence drives innovative solutions for banking, insurance, telecommunications and e-mobility services across Southern Africa.
              </p>
              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Sovereign Meeting</span><span className="font-semibold text-gray-800">31 January 2022</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Meeting Hours</span><span className="font-semibold text-gray-800">3 PM – 5 PM</span></div>
                <div className="flex justify-between"><span className="text-gray-500">JSE Ticker</span><span className="font-semibold" style={{ color: P }}>R.SX: VINK</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Registration</span><span className="font-semibold text-gray-800">2018/079316/07</span></div>
              </div>
            </div>
          </div>
          <div>
            <SectionHeading>Mission &amp; Vision</SectionHeading>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: P }}>Mission</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  To provide accessible, innovative and transformative financial services that empower individuals, businesses and communities across Africa through technology-driven solutions.
                </p>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: P }}>Vision</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  To be the leading pan-African financial services group, recognised for integrity, performance and commitment to sustainable growth that benefits all stakeholders.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3 Reasons ── */}
        <div>
          <h2 className="text-xl font-black text-center mb-2" style={{ color: PD }}>
            3 Reasons to Consider Investing in VINK MULTI SERVICES PTY LTD
          </h2>
          <p className="text-center text-sm text-gray-500 mb-6">Why sophisticated investors choose VINK</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {REASONS.map((r) => (
              <div key={r.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="text-4xl mb-3">{r.icon}</div>
                <h3 className="text-base font-bold mb-2" style={{ color: PD }}>{r.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Share price ── */}
        <div>
          <SectionHeading>Our Share Price in Action</SectionHeading>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-4xl font-black" style={{ color: PD }}>2.60</span>
                  <span className="text-sm font-bold text-green-600 mb-1">+1.96% ▲</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">ZAR · JSE · 15 Sep 2022</p>
                <Sparkline data={MINI_CHART} />
                <p className="text-[10px] text-gray-400 mt-1">12-month price movement</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2">
                {SHARE_ROWS.map((r) => (
                  <div key={r.label} className="flex justify-between border-b border-gray-100 py-1.5 text-xs">
                    <span className="text-gray-500 font-medium">{r.label}</span>
                    <span className="font-bold text-gray-800">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Investor News ── */}
        <div>
          <SectionHeading>Investor News</SectionHeading>
          <div className="space-y-2">
            {INVESTOR_NEWS.map((n, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 flex items-center gap-4 p-4 hover:shadow-sm transition-shadow cursor-pointer">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#FEE2E2" }}>
                  <FileText className="w-5 h-5" style={{ color: "#EF4444" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-snug">{n.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{n.date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">{n.type}</span>
                  <Download className="w-4 h-4 text-gray-400 hover:text-gray-700 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Documents and Reports ── */}
        <div>
          <SectionHeading>Documents and Reports</SectionHeading>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200" style={{ background: "#f3f0fb" }}>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: PD }}>Document</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: PD }}>Size</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: PD }}>Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {DOCS.map((d, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{d.name}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.size}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.date}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                        style={{ background: P, color: "#fff" }}>
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

          {/* Intro text (always visible, matches image) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 text-sm text-gray-700 leading-relaxed">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 flex-shrink-0" style={{ color: P }} />
              <span className="font-bold text-gray-900">VINK is committed to the highest standards of corporate governance.</span>
            </div>
            The Board of Directors is responsible for the overall governance of the company, including setting strategic direction, overseeing management, and ensuring accountability to stakeholders.
          </div>

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
            {([
              { key: "board",           label: "Board of Directors" },
              { key: "management",      label: "Management" },
              { key: "committees",      label: "Board Committees" },
              { key: "responsibilities", label: "Responsibilities" },
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
              </button>
            ))}
          </div>

          {/* ── Board of Directors ── */}
          {govTab === "board" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {BOARD_MEMBERS.map((m) => (
                <div key={m.name} className="flex flex-col items-center text-center rounded-xl p-5 bg-white border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-lg mb-3"
                    style={{ background: m.color }}>
                    {m.initial}
                  </div>
                  <p className="text-xs font-bold text-gray-800 leading-snug mb-1">{m.name}</p>
                  <p className="text-[10px] text-gray-500 leading-tight">{m.role}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Management ── */}
          {govTab === "management" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MANAGEMENT_TEAM.map((m) => (
                <div key={m.name} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-base flex-shrink-0"
                    style={{ background: m.color }}>
                    {m.initial}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{m.name}</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: P }}>{m.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{m.province}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Board Committees ── */}
          {govTab === "committees" && (
            <div>
              <h3 className="text-base font-bold text-center mb-5 text-gray-700">Board Committee Members</h3>
              <div className="grid sm:grid-cols-2 gap-5">
                {COMMITTEES.map((c) => (
                  <div key={c.name} className="rounded-xl border-2 overflow-hidden" style={{ borderColor: c.borderColor }}>
                    <div className="px-4 py-2.5 text-xs font-black uppercase tracking-wider" style={{ background: c.color, color: c.borderColor }}>
                      {c.name}
                    </div>
                    <div className="bg-white divide-y divide-gray-100">
                      {c.members.map((m) => (
                        <div key={m.name} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                            style={{ background: m.color }}>
                            {m.initial}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{m.name}</p>
                            <p className="text-[11px] text-gray-500">{m.role} · {m.province}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Responsibilities ── */}
          {govTab === "responsibilities" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {RESPONSIBILITIES.map((r) => (
                <div key={r.title} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-3">{r.icon}</div>
                  <h4 className="text-sm font-bold mb-2" style={{ color: PD }}>{r.title}</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">{r.text}</p>
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
