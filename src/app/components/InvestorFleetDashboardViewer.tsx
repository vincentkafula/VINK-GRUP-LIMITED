import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  X, Search, Bell, Moon, Settings, ChevronDown, Plus, Zap, Route as RouteIcon,
  FileSignature, Users, TrendingUp, Smartphone, DollarSign, Scale, BarChart3,
  Wallet, Percent,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

/**
 * Investor Dashboard -- built from the uploaded reference, the most
 * complex of this series: a real financial engine where every statement
 * (Income Statement, Balance Sheet, Cash Flow) derives from the same
 * shared state (devices, transactions, contracts, tax rate) rather than
 * static disconnected numbers. Adding a device, simulating a tap, or
 * changing the tax rate recalculates everything consistently.
 *
 * Verified the balance sheet identity (assets = liabilities + equity)
 * both algebraically (symbolic derivation, confirms it holds for any
 * input, not just the seed data) and numerically with simulated
 * transactions, before porting any of this logic into the component --
 * a financial engine this interconnected is exactly the kind of thing
 * where a small transcription error could silently break the identity
 * under some inputs but not others.
 */

interface Props { isOpen: boolean; onClose: () => void; investorName?: string; onOpenRevenueDashboard?: () => void }

const NAVY_900 = "#0b1130", NAVY_950 = "#080c22";
const BLUE = "#2f5fed", PURPLE = "#7a5cf0", GREEN = "#17a869", ORANGE = "#f2790a", RED = "#e0463e";
const R = (n: number) => "R " + Math.round(n).toLocaleString("en-ZA");
const R2 = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Types ──────────────────────────────────────────────────────────────
interface Device { id: string; code: string; driver: string; vehicle: string; cost: number; status: "online" | "offline" }
interface Contract { id: string; driver: string; owner: string; vehicle: string; type: "fixed" | "target"; amount: number; target: number; assocFee: number; status: "active" | "pending renewal" }
interface Txn { id: string; deviceId: string; device: string; driver: string; date: Date; amount: number; method: "online" | "offline" }

function uid(prefix: string) { return prefix + "-" + Math.random().toString(36).slice(2, 7).toUpperCase(); }

function seedDevices(): Device[] {
  return [
    { id: "DEV-1001", code: "TAP-1001", driver: "Thabo Nkosi", vehicle: "Toyota Corolla · CA 123-456", cost: 3500, status: "online" },
    { id: "DEV-1002", code: "TAP-1002", driver: "Sipho Dlamini", vehicle: "VW Polo Vivo · CA 234-567", cost: 3500, status: "online" },
    { id: "DEV-1003", code: "TAP-1003", driver: "Naledi Mokoena", vehicle: "Toyota Etios · CA 345-678", cost: 3200, status: "offline" },
    { id: "DEV-1004", code: "TAP-1004", driver: "Johan van Wyk", vehicle: "Renault Kwid · CA 456-789", cost: 3200, status: "online" },
    { id: "DEV-1005", code: "TAP-1005", driver: "Zanele Khumalo", vehicle: "Nissan Almera · CA 567-890", cost: 4000, status: "online" },
    { id: "DEV-1006", code: "TAP-1006", driver: "Kabelo Seane", vehicle: "Hyundai Grand i10 · CA 678-901", cost: 3500, status: "online" },
  ];
}
function seedContracts(): Contract[] {
  return [
    { id: "CT-8801", driver: "Thabo Nkosi", owner: "Sizwe Holdings", vehicle: "Toyota Corolla · CA 123-456", type: "fixed", amount: 4500, target: 0, assocFee: 350, status: "active" },
    { id: "CT-8802", driver: "Sipho Dlamini", owner: "Palesa Investments", vehicle: "VW Polo Vivo · CA 234-567", type: "fixed", amount: 4200, target: 0, assocFee: 350, status: "active" },
    { id: "CT-8803", driver: "Naledi Mokoena", owner: "Naledi Mokoena (owner-driver)", vehicle: "Toyota Etios · CA 345-678", type: "target", amount: 0, target: 9000, assocFee: 300, status: "active" },
    { id: "CT-8804", driver: "Johan van Wyk", owner: "JVW Fleet Services", vehicle: "Renault Kwid · CA 456-789", type: "target", amount: 0, target: 8500, assocFee: 300, status: "active" },
    { id: "CT-8805", driver: "Zanele Khumalo", owner: "Khumalo Transport CC", vehicle: "Nissan Almera · CA 567-890", type: "fixed", amount: 5200, target: 0, assocFee: 400, status: "active" },
    { id: "CT-8806", driver: "Kabelo Seane", owner: "Sizwe Holdings", vehicle: "Hyundai Grand i10 · CA 678-901", type: "fixed", amount: 4400, target: 0, assocFee: 350, status: "pending renewal" },
  ];
}
function seedTransactions(devices: Device[]): Txn[] {
  const startDay = new Date("2025-04-29T00:00:00");
  const out: Txn[] = [];
  let counter = 1;
  devices.forEach(d => {
    if (d.status !== "online") return;
    const n = 14 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const dayOffset = Math.floor(Math.random() * 11);
      const dt = new Date(startDay.getTime() + dayOffset * 86400000 + Math.floor(Math.random() * 14 + 6) * 3600000 + Math.floor(Math.random() * 60) * 60000);
      const fare = Math.round((15 + Math.random() * 35) * 100) / 100;
      const method: "online" | "offline" = Math.random() < 0.78 ? "online" : "offline";
      out.push({ id: "TRP-" + String(3000 + counter).padStart(4, "0"), deviceId: d.id, device: d.code, driver: d.driver, date: dt, amount: fare, method });
      counter++;
    }
  });
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

const INVESTOR_CAPITAL = 150000;
const RETAINED_EARNINGS_OPENING = 45000;

// ─── Same VINK AFC revenue model as RevenueDashboard.tsx (the backend-
// connected "AFC Revenue Distribution & Investor Portal") -- matched
// exactly so both dashboards report consistent numbers for the same
// investor, rather than two different, disconnected revenue models. ───
const DEVICE_MONTHLY_RENTAL = 250;
const VINK_FEE_PER_TAP = 1.00;
const INVESTOR_SHARE_PCT = 10;
const INVESTOR_TAP_SHARE = +(VINK_FEE_PER_TAP * INVESTOR_SHARE_PCT / 100).toFixed(2); // R0.10/tap

function Sparkline({ color = BLUE }: { color?: string }) {
  const data = useMemo(() => Array.from({ length: 14 }, () => 40 + Math.random() * 60), []);
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs><linearGradient id={`inv-spark-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#inv-spark-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
function Pill({ children, tone = "grey" }: { children: React.ReactNode; tone?: "green" | "orange" | "red" | "blue" | "purple" | "grey" }) {
  const tones = { green: "bg-emerald-100 text-emerald-700", orange: "bg-orange-100 text-orange-700", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-700", purple: "bg-violet-100 text-violet-700", grey: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${tones[tone]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{children}</span>;
}
function StatementRow({ kind, label, value }: { kind: "section" | "indent" | "subtotal" | "total"; label: string; value?: string }) {
  if (kind === "section") return <tr><td colSpan={2} className="pt-4 pb-1 text-[11px] font-black uppercase tracking-wider text-gray-400">{label}</td></tr>;
  const cls = kind === "total" ? "border-t-2 border-gray-900 font-black" : kind === "subtotal" ? "border-t border-gray-200 font-bold" : "";
  return (
    <tr className={cls}>
      <td className={`py-2 ${kind === "indent" ? "pl-4 text-gray-700" : "text-gray-900"}`}>{label}</td>
      <td className="py-2 text-right font-mono">{value}</td>
    </tr>
  );
}

type View = "dashboard" | "devices" | "trips" | "income" | "contracts" | "association" | "income-statement" | "balance-sheet" | "cash-flow" | "tax" | "settings";
const NAV_GROUPS: { label: string; items: { id: View; label: string; icon: any }[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: BarChart3 }, { id: "devices", label: "Devices", icon: Smartphone }, { id: "trips", label: "Trips & Taps", icon: RouteIcon }] },
  { label: "Earnings", items: [{ id: "income", label: "Income", icon: TrendingUp }, { id: "contracts", label: "Contracts", icon: FileSignature }, { id: "association", label: "Association Fees", icon: Users }] },
  { label: "Financial statements", items: [{ id: "income-statement", label: "Income Statement", icon: DollarSign }, { id: "balance-sheet", label: "Balance Sheet", icon: Scale }, { id: "cash-flow", label: "Statement of Cash Flow", icon: Wallet }, { id: "tax", label: "Tax", icon: Percent }] },
];

export function InvestorFleetDashboardViewer({ isOpen, onClose, investorName = "Investor", onOpenRevenueDashboard }: Props) {
  const [view, setView] = useState<View>("dashboard");
  const [devices, setDevices] = useState<Device[]>(seedDevices);
  const [initialDeviceIds] = useState<string[]>(() => seedDevices().map(d => d.id));
  const [contracts, setContracts] = useState<Contract[]>(seedContracts);
  const [transactions, setTransactions] = useState<Txn[]>(() => seedTransactions(seedDevices()));
  const [assocPaid, setAssocPaid] = useState<Record<string, boolean>>({ "Thabo Nkosi": true, "Sipho Dlamini": true, "Naledi Mokoena": false, "Johan van Wyk": true, "Zanele Khumalo": false, "Kabelo Seane": true });
  const [taxRate, setTaxRate] = useState(18);
  const [taxRateInput, setTaxRateInput] = useState("18");
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [tripSearch, setTripSearch] = useState("");
  const [tripDeviceFilter, setTripDeviceFilter] = useState("all");
  const [tripMethodFilter, setTripMethodFilter] = useState("all");
  const [contractType, setContractType] = useState<"fixed" | "target">("fixed");

  // ── The financial engine -- every downstream number derives from here ──
  const f = useMemo(() => {
    const fixedIncomeTotal = devices.length * DEVICE_MONTHLY_RENTAL;
    const feeOnline = transactions.filter(t => t.method === "online").length * INVESTOR_TAP_SHARE;
    const feeOffline = transactions.filter(t => t.method === "offline").length * INVESTOR_TAP_SHARE;
    const feeTotal = feeOnline + feeOffline;
    const grossRevenue = fixedIncomeTotal + feeTotal;

    const maintenance = devices.length * 60;
    const insurance = devices.length * 35;
    const admin = 800;
    const grossDeviceCost = devices.reduce((s, d) => s + d.cost, 0);
    const depreciation = Math.round(grossDeviceCost * 0.02);
    const opexTotal = maintenance + insurance + admin + depreciation;

    const ebt = grossRevenue - opexTotal;
    const tax = Math.max(0, ebt * (taxRate / 100));
    const netIncome = ebt - tax;

    const cashCollected = fixedIncomeTotal + feeOnline - (maintenance + insurance + admin) - tax;
    const arIncrease = feeOffline;
    const assocFeesCollected = contracts.reduce((s, c) => s + c.assocFee, 0);

    const newDeviceCost = devices.filter(d => !initialDeviceIds.includes(d.id)).reduce((s, d) => s + d.cost, 0);
    const openingGrossDeviceCost = devices.filter(d => initialDeviceIds.includes(d.id)).reduce((s, d) => s + d.cost, 0);
    const openingCash = (INVESTOR_CAPITAL + RETAINED_EARNINGS_OPENING) - openingGrossDeviceCost;

    const cashFromOperating = cashCollected + assocFeesCollected;
    const cashFromInvesting = -newDeviceCost;
    const cashFromFinancing = 0;
    const netChangeInCash = cashFromOperating + cashFromInvesting + cashFromFinancing;
    const closingCash = openingCash + netChangeInCash;

    const devicesNet = grossDeviceCost - depreciation;
    const totalAssets = closingCash + arIncrease + devicesNet;
    const totalLiabilities = assocFeesCollected;
    const retainedEarnings = RETAINED_EARNINGS_OPENING + netIncome;
    const totalEquity = INVESTOR_CAPITAL + retainedEarnings;

    return {
      fixedIncomeTotal, feeOnline, feeOffline, feeTotal, grossRevenue,
      maintenance, insurance, admin, depreciation, opexTotal, ebt, tax, netIncome,
      cashCollected, arIncrease, assocFeesCollected, openingCash, closingCash,
      cashFromOperating, cashFromInvesting, cashFromFinancing, netChangeInCash,
      devicesNet, grossDeviceCost, totalAssets, totalLiabilities, retainedEarnings, totalEquity,
      tripsCount: transactions.length,
    };
  }, [devices, transactions, contracts, taxRate, initialDeviceIds]);

  if (!isOpen) return null;

  const toggleDevice = (id: string) => {
    setDevices(ds => ds.map(d => d.id === id ? { ...d, status: d.status === "online" ? "offline" as const : "online" as const } : d));
    const d = devices.find(x => x.id === id);
    if (d) toast.success(`${d.code} is now ${d.status === "online" ? "offline" : "online"}`);
  };

  const simulateTap = () => {
    const online = devices.filter(d => d.status === "online");
    if (!online.length) { toast.error("No devices online right now"); return; }
    const d = online[Math.floor(Math.random() * online.length)];
    const fare = Math.round((15 + Math.random() * 35) * 100) / 100;
    const method: "online" | "offline" = Math.random() < 0.8 ? "online" : "offline";
    setTransactions(ts => [{ id: "TRP-" + Math.floor(Math.random() * 9000 + 1000), deviceId: d.id, device: d.code, driver: d.driver, date: new Date(), amount: fare, method }, ...ts]);
    toast.success(`Tap on ${d.code}: ${R2(fare)} fare · your fee ${R2(INVESTOR_TAP_SHARE)}`);
  };

  const submitDevice = (driver: string, vehicle: string, cost: number) => {
    setDevices(ds => [...ds, { id: uid("DEV"), code: "TAP-" + (1007 + ds.length - 6), driver: driver || "New Driver", vehicle: vehicle || "Unassigned vehicle", cost: cost || 3200, status: "online" }]);
    toast.success(`Device added — earning ${R(DEVICE_MONTHLY_RENTAL)}/mo plus ${R2(INVESTOR_TAP_SHARE)} per tap`);
    setShowDeviceModal(false);
  };

  const submitContract = (driver: string, owner: string, vehicle: string, amount: number, assocFee: number) => {
    setContracts(cs => [...cs, { id: uid("CT"), driver: driver || "New Driver", owner: owner || "Unnamed Owner", vehicle: vehicle || "Unassigned vehicle", type: contractType, amount: contractType === "fixed" ? amount : 0, target: contractType === "target" ? amount : 0, assocFee, status: "active" }]);
    setAssocPaid(a => ({ ...a, [driver || "New Driver"]: false }));
    toast.success(`Contract created for ${driver || "New Driver"}`);
    setShowContractModal(false);
  };

  const filteredTrips = transactions.filter(t => {
    if (tripDeviceFilter !== "all" && t.deviceId !== tripDeviceFilter) return false;
    if (tripMethodFilter !== "all" && t.method !== tripMethodFilter) return false;
    if (tripSearch && !(t.driver.toLowerCase().includes(tripSearch.toLowerCase()) || t.device.toLowerCase().includes(tripSearch.toLowerCase()))) return false;
    return true;
  }).slice(0, 80);

  const donutData = [
    { name: "Fixed income", value: f.fixedIncomeTotal, color: PURPLE },
    { name: "Online trip fees", value: f.feeOnline, color: GREEN },
    { name: "Offline trip fees", value: f.feeOffline, color: ORANGE },
  ];
  const trendData = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date("2025-04-26T00:00:00"); d.setDate(d.getDate() + i);
    return { day: d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }), total: Math.round(f.grossRevenue / 16 * (0.7 + Math.random() * 0.6)) };
  }), [f.grossRevenue]);

  const bsBalanced = Math.abs(f.totalAssets - (f.totalLiabilities + f.totalEquity)) < 1;

  return (
    <div className="fixed inset-0 z-[110] flex bg-[#f5f6fb]" style={{ fontFamily: "Inter,ui-sans-serif,system-ui" }}>
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col p-4 overflow-y-auto" style={{ background: `linear-gradient(190deg,${NAVY_900},${NAVY_950})` }}>
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ background: `linear-gradient(135deg,${BLUE},${PURPLE})` }}>FT</span>
          <div><p className="text-white font-bold text-[15px] leading-tight">Fleetap</p><p className="text-[10px] uppercase tracking-wider text-white/40">Investor Console</p></div>
        </div>

        {NAV_GROUPS.map(g => (
          <div key={g.label} className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-white/35 px-2.5 mt-2 mb-1">{g.label}</p>
            {g.items.map(item => (
              <button key={item.id} onClick={() => setView(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
                style={view === item.id ? { background: `linear-gradient(90deg,${BLUE},#4f7cf5)`, color: "#fff" } : { color: "#aeb4d6" }}>
                <item.icon className="w-4 h-4 opacity-90" /> {item.label}
                {item.id === "devices" && <span className="ml-auto text-[10.5px] px-1.5 py-0.5 rounded-full" style={{ background: view === item.id ? "rgba(255,255,255,.22)" : "#232c5e", color: view === item.id ? "#fff" : "#c6cbef" }}>{devices.length}</span>}
              </button>
            ))}
          </div>
        ))}

        <div className="mt-auto space-y-2.5 pt-3">
          {onOpenRevenueDashboard && (
            <button onClick={() => { onClose(); onOpenRevenueDashboard(); }}
              className="w-full text-left rounded-xl p-3.5 transition-colors hover:brightness-110"
              style={{ background: `linear-gradient(135deg,${BLUE},${PURPLE})` }}>
              <p className="text-white text-[12.5px] font-bold">⚡ Live AFC Revenue System</p>
              <p className="text-white/70 text-[11px] mt-0.5 leading-snug">See real-time taps, agreements &amp; audit trail across all investors →</p>
            </button>
          )}
          <div className="rounded-xl p-3.5" style={{ background: "#111a42", border: "1px solid #1c2758" }}>
            <p className="text-white text-[12.5px] font-semibold">💠 Portfolio secured</p>
            <p className="text-white/50 text-[11.5px] mt-0.5 leading-snug">Device balances &amp; statements reconcile automatically each tap.</p>
          </div>
          <div className="rounded-xl p-3.5" style={{ background: "#111a42", border: "1px solid #1c2758" }}>
            <p className="text-white text-[12.5px] font-semibold">🎧 Need help?</p>
            <p className="text-white/50 text-[11.5px] mt-0.5">Contact your account manager.</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3.5 px-7 py-4 border-b border-gray-100 bg-white/85 backdrop-blur">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search devices, drivers, contracts…" className="w-full pl-9 pr-14 py-2.5 rounded-xl border border-gray-200 text-[13.5px] outline-none focus:border-blue-600" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">⌘K</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="relative w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Bell className="w-4.5 h-4.5 text-gray-500" /><span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: BLUE }}>3</span></button>
            <button className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Moon className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Settings className="w-4.5 h-4.5 text-gray-500" /></button>
            <button onClick={() => setView("settings")} className="flex items-center gap-2 pl-1.5 ml-1">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ background: `linear-gradient(135deg,${PURPLE},#3b7bf6)` }}>{investorName.split(" ").map(s => s[0]).join("").slice(0, 2)}</span>
              <span className="text-left hidden sm:block"><span className="block text-[13px] font-semibold leading-tight">{investorName}</span><span className="block text-[11px] text-gray-400 leading-tight">Investor</span></span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500 ml-1" aria-label="Close"><X className="w-4.5 h-4.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          {/* ── Dashboard ── */}
          {view === "dashboard" && (
            <>
              <div className="flex items-start justify-between flex-wrap gap-3.5 mb-5">
                <div><h1 className="text-[23px] font-bold">Welcome back, {investorName.split(" ")[0]} 👋</h1><p className="text-gray-500 text-[13.5px] mt-1">Live earnings across your device fleet for the selected period.</p></div>
                <span className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold">02 May 2025 – 08 May 2025</span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4.5 mb-5">
                {[
                  { label: "Gross Income", value: R(f.grossRevenue), bg: "#efeafd", color: PURPLE, icon: TrendingUp },
                  { label: "Fixed Device Income", value: R(f.fixedIncomeTotal), bg: "#e4f8ee", color: GREEN, icon: Smartphone },
                  { label: `Transaction Fees (${R2(INVESTOR_TAP_SHARE)}/tap)`, value: R(f.feeTotal), bg: "#fef0df", color: ORANGE, icon: Zap },
                  { label: "Net Income (after tax)", value: R(f.netIncome), bg: "#e6edff", color: BLUE, icon: DollarSign },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}><s.icon className="w-[21px] h-[21px]" /></span><div><p className="text-[12.5px] text-gray-500 font-semibold">{s.label}</p><p className="text-[21px] font-bold mt-0.5">{s.value}</p></div></div>
                    <p className="text-[11.5px] font-bold mt-2.5" style={{ color: GREEN }}>↑ +{(5 + Math.random() * 10).toFixed(1)}% <span className="text-gray-400 font-medium">vs last month</span></p>
                    <Sparkline color={s.color} />
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
                <p className="text-[15px] font-bold mb-3.5">Quick actions</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {[
                    { label: "Add Device", icon: Plus, bg: "#e6edff", c: BLUE, onClick: () => setShowDeviceModal(true) },
                    { label: "Simulate Tap", icon: Zap, bg: "#e4f8ee", c: GREEN, onClick: simulateTap },
                    { label: "Preview Trips", icon: RouteIcon, bg: "#efeafd", c: PURPLE, onClick: () => setView("trips") },
                    { label: "New Contract", icon: FileSignature, bg: "#fef0df", c: ORANGE, onClick: () => setShowContractModal(true) },
                    { label: "Income Statement", icon: DollarSign, bg: "#e6edff", c: BLUE, onClick: () => setView("income-statement") },
                    { label: "Association Fees", icon: Users, bg: "#e4f8ee", c: GREEN, onClick: () => setView("association") },
                  ].map(qa => (
                    <button key={qa.label} onClick={qa.onClick} className="flex flex-col items-start gap-2.5 bg-white border border-gray-100 rounded-2xl p-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: qa.bg, color: qa.c }}><qa.icon className="w-[18px] h-[18px]" /></span>
                      <span className="text-[12.5px] font-bold text-left">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5 mb-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-1">Earnings breakdown</p><p className="text-xs text-gray-400 mb-3">Fixed income vs transaction fees</p>
                  <div className="flex items-center gap-5 flex-wrap">
                    <div className="relative w-[170px] h-[170px] shrink-0">
                      <ResponsiveContainer><PieChart><Pie data={donutData} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2}>{donutData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><p className="text-[11px] text-gray-400 font-semibold">Total revenue</p><p className="text-xl font-black">{R(f.grossRevenue)}</p></div>
                    </div>
                    <div className="flex-1 min-w-[180px] space-y-2">
                      {donutData.map(d => (
                        <div key={d.name} className="flex items-center justify-between text-[12.5px] py-1.5">
                          <span className="flex items-center gap-2 font-semibold"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
                          <span className="font-bold">{R(d.value)}</span>
                          <span className="text-gray-400 font-semibold w-11 text-right">{f.grossRevenue ? Math.round(d.value / f.grossRevenue * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-1">Recent activity</p><p className="text-xs text-gray-400 mb-3">Latest fleet events</p>
                  <div className="space-y-3">
                    {[
                      { t: `Trip tapped on ${transactions[0]?.device ?? "TAP-1005"}`, s: `${R2(transactions[0]?.amount ?? 0)} fare · ${transactions[0]?.driver ?? "—"}`, time: "2 min ago", icon: RouteIcon, bg: "#efeafd", c: PURPLE },
                      { t: "Association fee marked paid", s: `Kabelo Seane · ${R(400)}`, time: "15 min ago", icon: Users, bg: "#e4f8ee", c: GREEN },
                      { t: "Income statement generated", s: "Statement #INC-2456", time: "1 hour ago", icon: DollarSign, bg: "#e6edff", c: BLUE },
                      { t: "Contract renewed", s: "Sipho Dlamini · fixed monthly", time: "3 hours ago", icon: FileSignature, bg: "#fef0df", c: ORANGE },
                    ].map(a => (
                      <div key={a.t} className="flex items-start gap-3"><span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.bg, color: a.c }}><a.icon className="w-4 h-4" /></span><div className="flex-1 min-w-0"><p className="text-[12.8px] font-bold truncate">{a.t}</p><p className="text-[11.5px] text-gray-400">{a.s}</p></div><span className="text-[11px] text-gray-400 shrink-0">{a.time}</span></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-1">Revenue trend</p><p className="text-xs text-gray-400 mb-3">Fixed income + transaction fees, last 14 days</p>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer><AreaChart data={trendData}><defs><linearGradient id="inv-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.28} /><stop offset="100%" stopColor={BLUE} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#f1f2f8" /><XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9198b3" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "#9198b3" }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `R${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Area type="monotone" dataKey="total" stroke={BLUE} strokeWidth={2.5} fill="url(#inv-trend)" /></AreaChart></ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Financial summary <span className="text-xs text-gray-400 font-normal">Period to date</span></p>
                  <div className="space-y-3">
                    {[
                      { l: "Total Assets", v: f.totalAssets, icon: Scale, bg: "#e6edff", c: BLUE },
                      { l: "Total Liabilities", v: f.totalLiabilities, icon: Users, bg: "#fef0df", c: ORANGE },
                      { l: "Net Income", v: f.netIncome, icon: TrendingUp, bg: "#e4f8ee", c: GREEN },
                      { l: "Operating Cash Flow", v: f.cashFromOperating, icon: Wallet, bg: "#efeafd", c: PURPLE },
                    ].map(x => (
                      <div key={x.l} className="flex items-center gap-3"><span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: x.bg, color: x.c }}><x.icon className="w-4 h-4" /></span><div className="flex-1"><p className="text-[12.8px] font-bold">{x.l}</p><p className="text-[11.5px] text-gray-400">{R(x.v)}</p></div><span className="text-[11px] font-bold" style={{ color: GREEN }}>↑</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Devices ── */}
          {view === "devices" && (
            <div>
              <div className="flex items-start justify-between flex-wrap gap-3.5 mb-5">
                <div><h1 className="text-[23px] font-bold">Devices</h1><p className="text-gray-500 text-[13.5px] mt-1">Every tap-to-pay unit you own, its driver assignment and live earnings.</p></div>
                <button onClick={() => setShowDeviceModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: `linear-gradient(90deg,${BLUE},#4f7cf5)` }}><Plus className="w-4 h-4" /> Add Device</button>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
                {[
                  { l: "Devices owned", v: String(devices.length), s: `${devices.filter(d => d.status === "online").length} online now` },
                  { l: "Fixed income / month", v: R(f.fixedIncomeTotal), s: "accumulates per device" },
                  { l: "Fee income to date", v: R(f.feeTotal), s: `${R2(INVESTOR_TAP_SHARE)} per tap` },
                  { l: "Portfolio value (cost)", v: R(f.grossDeviceCost), s: "device book value" },
                ].map(k => <div key={k.l} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[11.5px] text-gray-500 font-semibold">{k.l}</p><p className="text-[19px] font-black mt-1">{k.v}</p><p className="text-[11px] text-gray-400 mt-1">{k.s}</p></div>)}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-[15px] font-bold mb-1">Fleet ({devices.length})</p><p className="text-xs text-gray-400 mb-4">Toggle a device on/off to simulate its live status</p>
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {devices.map(d => {
                    const trips = transactions.filter(t => t.deviceId === d.id);
                    const feeEarned = trips.length * INVESTOR_TAP_SHARE;
                    return (
                      <div key={d.id} className="border border-gray-100 rounded-2xl p-4">
                        <div className="flex items-center justify-between"><div><p className="font-bold text-[14px]">{d.code}</p><p className="text-xs text-gray-400">{d.driver}</p></div>
                          <button onClick={() => toggleDevice(d.id)} className="w-9.5 h-5.5 rounded-full relative transition-colors" style={{ width: 38, height: 22, background: d.status === "online" ? GREEN : "#e2e5f3" }}><span className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: 18, height: 18, left: d.status === "online" ? 18 : 2 }} /></button>
                        </div>
                        <div className="h-px bg-gray-100 my-3" />
                        <p className="text-[12.5px] text-gray-600 mb-2">{d.vehicle}</p>
                        <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                          <div><p className="text-gray-400">Device rental</p><p className="font-bold">{R(DEVICE_MONTHLY_RENTAL)}/mo</p></div>
                          <div><p className="text-gray-400">Trips</p><p className="font-bold">{trips.length}</p></div>
                          <div><p className="text-gray-400">Fee earned (R{INVESTOR_TAP_SHARE.toFixed(2)}/tap)</p><p className="font-bold">{R2(feeEarned)}</p></div>
                          <div><p className="text-gray-400">Total earned</p><p className="font-bold" style={{ color: BLUE }}>{R2(DEVICE_MONTHLY_RENTAL + feeEarned)}</p></div>
                        </div>
                        <div className="mt-2.5"><Pill tone={d.status === "online" ? "green" : "grey"}>{d.status === "online" ? "Online" : "Offline"}</Pill></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11.5px] text-gray-400 mt-2.5 leading-relaxed">Each device pays a flat {R(DEVICE_MONTHLY_RENTAL)}/month rental to you regardless of usage, plus {R2(INVESTOR_TAP_SHARE)} for every tap on it. Earnings across all devices accumulate into one portfolio total — the more devices you hold, the larger both your rental base and your tap-fee income become.</p>
            </div>
          )}

          {/* ── Trips ── */}
          {view === "trips" && (
            <div>
              <div className="flex items-start justify-between flex-wrap gap-3.5 mb-5">
                <div><h1 className="text-[23px] font-bold">Trips &amp; Taps</h1><p className="text-gray-500 text-[13.5px] mt-1">Preview of every fare tapped across your fleet, with your {R2(INVESTOR_TAP_SHARE)} fee per tap.</p></div>
                <button onClick={simulateTap} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-bold"><Zap className="w-4 h-4" /> Simulate Tap</button>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
                {[
                  { l: "Total trips", v: String(f.tripsCount), s: "across all devices" },
                  { l: "Online payments", v: String(transactions.filter(t => t.method === "online").length), s: "settled immediately" },
                  { l: "Offline payments", v: String(transactions.filter(t => t.method === "offline").length), s: "pending settlement" },
                  { l: "Fee income earned", v: R(f.feeTotal), s: `${R2(INVESTOR_TAP_SHARE)} per tap` },
                ].map(k => <div key={k.l} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[11.5px] text-gray-500 font-semibold">{k.l}</p><p className="text-[19px] font-black mt-1">{k.v}</p><p className="text-[11px] text-gray-400 mt-1">{k.s}</p></div>)}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-wrap items-center gap-2.5 mb-4">
                  <input value={tripSearch} onChange={e => setTripSearch(e.target.value)} placeholder="Search driver or device…" className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none max-w-[220px]" />
                  <select value={tripDeviceFilter} onChange={e => setTripDeviceFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none"><option value="all">All devices</option>{devices.map(d => <option key={d.id} value={d.id}>{d.code} · {d.driver}</option>)}</select>
                  <select value={tripMethodFilter} onChange={e => setTripMethodFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none"><option value="all">All payment types</option><option value="online">Online</option><option value="offline">Offline</option></select>
                  <span className="text-[11.5px] text-gray-400 ml-auto">{filteredTrips.length} of {transactions.length} trips shown</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100"><th className="py-2.5 px-2.5 font-semibold">Trip</th><th className="py-2.5 px-2.5 font-semibold">Device</th><th className="py-2.5 px-2.5 font-semibold">Driver</th><th className="py-2.5 px-2.5 font-semibold">Date &amp; time</th><th className="py-2.5 px-2.5 font-semibold">Fare</th><th className="py-2.5 px-2.5 font-semibold">Payment</th><th className="py-2.5 px-2.5 font-semibold">Your fee ({R2(INVESTOR_TAP_SHARE)})</th></tr></thead>
                    <tbody>
                      {filteredTrips.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No trips match your filters</td></tr> : filteredTrips.map(t => (
                        <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                          <td className="py-2.5 px-2.5 font-mono text-gray-700">{t.id}</td><td className="py-2.5 px-2.5">{t.device}</td><td className="py-2.5 px-2.5">{t.driver}</td>
                          <td className="py-2.5 px-2.5 text-gray-500">{t.date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })} · {t.date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-2.5 px-2.5">{R2(t.amount)}</td><td className="py-2.5 px-2.5"><Pill tone={t.method === "online" ? "blue" : "orange"}>{t.method === "online" ? "Online" : "Offline"}</Pill></td>
                          <td className="py-2.5 px-2.5 font-bold" style={{ color: GREEN }}>+{R2(INVESTOR_TAP_SHARE)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Income ── */}
          {view === "income" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Income</h1><p className="text-gray-500 text-[13.5px] mt-1">Gross monthly earnings — {R(DEVICE_MONTHLY_RENTAL)}/month device rental plus {R2(INVESTOR_TAP_SHARE)}-per-tap fees, per device and combined.</p></div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
                {[
                  { l: "Gross monthly income", v: R(f.grossRevenue), s: "fixed + fees, all devices" },
                  { l: "Fixed base income", v: R(f.fixedIncomeTotal), s: `${devices.length} devices` },
                  { l: "Transaction fee income", v: R(f.feeTotal), s: `${f.tripsCount} taps at ${R2(INVESTOR_TAP_SHARE)}` },
                  { l: "Avg. income per device", v: R(devices.length ? f.grossRevenue / devices.length : 0), s: "blended" },
                ].map(k => <div key={k.l} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[11.5px] text-gray-500 font-semibold">{k.l}</p><p className="text-[19px] font-black mt-1">{k.v}</p><p className="text-[11px] text-gray-400 mt-1">{k.s}</p></div>)}
              </div>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto">
                  <p className="text-[15px] font-bold mb-1">Income by device</p><p className="text-xs text-gray-400 mb-3.5">{R(DEVICE_MONTHLY_RENTAL)}/month rental + accumulated {R2(INVESTOR_TAP_SHARE)}-per-tap fee income</p>
                  <table className="w-full text-[13px]">
                    <thead><tr className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100"><th className="py-2.5 px-2.5 font-semibold">Device</th><th className="py-2.5 px-2.5 font-semibold">Driver</th><th className="py-2.5 px-2.5 font-semibold">Fixed</th><th className="py-2.5 px-2.5 font-semibold">Trips</th><th className="py-2.5 px-2.5 font-semibold">Fee</th><th className="py-2.5 px-2.5 font-semibold">Total</th></tr></thead>
                    <tbody>
                      {devices.map(d => {
                        const trips = transactions.filter(t => t.deviceId === d.id);
                        const fee = trips.length * INVESTOR_TAP_SHARE;
                        return <tr key={d.id} className="border-b border-gray-50 last:border-0"><td className="py-2.5 px-2.5 font-bold">{d.code}</td><td className="py-2.5 px-2.5">{d.driver}</td><td className="py-2.5 px-2.5">{R(DEVICE_MONTHLY_RENTAL)}</td><td className="py-2.5 px-2.5">{trips.length}</td><td className="py-2.5 px-2.5">{R2(fee)}</td><td className="py-2.5 px-2.5 font-black" style={{ color: BLUE }}>{R2(DEVICE_MONTHLY_RENTAL + fee)}</td></tr>;
                      })}
                      <tr><td colSpan={5} className="py-2.5 px-2.5 font-black">Portfolio total</td><td className="py-2.5 px-2.5 font-black" style={{ color: BLUE }}>{R(f.grossRevenue)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">How your income accumulates</p>
                  <div className="space-y-3">
                    {[
                      { n: "1. Monthly device rental", s: `Every device you own pays a guaranteed ${R(DEVICE_MONTHLY_RENTAL)}/month, whether or not it's tapped.`, icon: Smartphone, bg: "#efeafd", c: PURPLE },
                      { n: `2. +${R2(INVESTOR_TAP_SHARE)} per tap`, s: `Each time a driver turns on the device for a fare, you earn ${R2(INVESTOR_TAP_SHARE)} — your 10% share of VINK's flat R1.00 transaction fee — on top of the monthly rental.`, icon: Zap, bg: "#e4f8ee", c: GREEN },
                      { n: `3. Income accumulates across devices`, s: `Own more devices and both the rental base and the tap-fee income stack together into one portfolio total — currently ${R(f.grossRevenue)}.`, icon: DollarSign, bg: "#e6edff", c: BLUE },
                    ].map(x => <div key={x.n} className="flex items-start gap-3"><span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: x.bg, color: x.c }}><x.icon className="w-4 h-4" /></span><div><p className="text-[12.8px] font-bold">{x.n}</p><p className="text-[11.5px] text-gray-400 mt-0.5 leading-relaxed">{x.s}</p></div></div>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Contracts ── */}
          {view === "contracts" && (
            <div>
              <div className="flex items-start justify-between flex-wrap gap-3.5 mb-5">
                <div><h1 className="text-[23px] font-bold">Contracts</h1><p className="text-gray-500 text-[13.5px] mt-1">Agreements between each driver and vehicle owner — fixed monthly or target-based, including association dues.</p></div>
                <button onClick={() => { setContractType("fixed"); setShowContractModal(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: `linear-gradient(90deg,${BLUE},#4f7cf5)` }}><Plus className="w-4 h-4" /> New Contract</button>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
                {[
                  { l: "Active contracts", v: String(contracts.filter(c => c.status === "active").length), s: `of ${contracts.length} total` },
                  { l: "Fixed monthly agreements", v: String(contracts.filter(c => c.type === "fixed").length), s: `${contracts.filter(c => c.type === "target").length} target-based` },
                  { l: "Guaranteed monthly value", v: R(contracts.filter(c => c.type === "fixed").reduce((s, c) => s + c.amount, 0)), s: "fixed-type contracts" },
                  { l: "Association fees / month", v: R(contracts.reduce((s, c) => s + c.assocFee, 0)), s: "collected via platform" },
                ].map(k => <div key={k.l} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[11.5px] text-gray-500 font-semibold">{k.l}</p><p className="text-[19px] font-black mt-1">{k.v}</p><p className="text-[11px] text-gray-400 mt-1">{k.s}</p></div>)}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto">
                <p className="text-[15px] font-bold mb-3.5">All contracts ({contracts.length})</p>
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100"><th className="py-2.5 px-2.5 font-semibold">Contract</th><th className="py-2.5 px-2.5 font-semibold">Driver</th><th className="py-2.5 px-2.5 font-semibold">Vehicle owner</th><th className="py-2.5 px-2.5 font-semibold">Vehicle</th><th className="py-2.5 px-2.5 font-semibold">Type</th><th className="py-2.5 px-2.5 font-semibold">Monthly amount</th><th className="py-2.5 px-2.5 font-semibold">Assoc. fee</th><th className="py-2.5 px-2.5 font-semibold">Status</th></tr></thead>
                  <tbody>
                    {contracts.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 px-2.5 font-mono">{c.id}</td><td className="py-2.5 px-2.5">{c.driver}</td><td className="py-2.5 px-2.5">{c.owner}</td><td className="py-2.5 px-2.5">{c.vehicle}</td>
                        <td className="py-2.5 px-2.5"><Pill tone={c.type === "fixed" ? "blue" : "purple"}>{c.type === "fixed" ? "Fixed monthly" : "Target-based"}</Pill></td>
                        <td className="py-2.5 px-2.5">{c.type === "fixed" ? R(c.amount) + "/mo" : "Target " + R(c.target) + "/mo"}</td>
                        <td className="py-2.5 px-2.5">{R(c.assocFee)}</td>
                        <td className="py-2.5 px-2.5"><Pill tone={c.status === "active" ? "green" : "orange"}>{c.status === "active" ? "Active" : "Pending renewal"}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Association Fees ── */}
          {view === "association" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Association Fees</h1><p className="text-gray-500 text-[13.5px] mt-1">Monthly dues each driver owes their taxi/route association, collected through the platform.</p></div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
                {(() => {
                  const total = contracts.reduce((s, c) => s + c.assocFee, 0);
                  const paidCount = contracts.filter(c => assocPaid[c.driver]).length;
                  const paid = contracts.filter(c => assocPaid[c.driver]).reduce((s, c) => s + c.assocFee, 0);
                  return [
                    { l: "Total due this month", v: R(total), s: `${contracts.length} drivers` },
                    { l: "Collected & remitted", v: R(paid), s: `${paidCount} paid` },
                    { l: "Outstanding", v: R(total - paid), s: `${contracts.length - paidCount} pending` },
                    { l: "Avg. fee per driver", v: R(contracts.length ? total / contracts.length : 0), s: "monthly" },
                  ];
                })().map(k => <div key={k.l} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[11.5px] text-gray-500 font-semibold">{k.l}</p><p className="text-[19px] font-black mt-1">{k.v}</p><p className="text-[11px] text-gray-400 mt-1">{k.s}</p></div>)}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto">
                <p className="text-[15px] font-bold mb-1">Association fee ledger</p><p className="text-xs text-gray-400 mb-3.5">Toggle to mark a driver's monthly due as remitted</p>
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100"><th className="py-2.5 px-2.5 font-semibold">Driver</th><th className="py-2.5 px-2.5 font-semibold">Association</th><th className="py-2.5 px-2.5 font-semibold">Vehicle</th><th className="py-2.5 px-2.5 font-semibold">Monthly due</th><th className="py-2.5 px-2.5 font-semibold">Status</th><th className="py-2.5 px-2.5"></th></tr></thead>
                  <tbody>
                    {contracts.map(c => {
                      const paidStatus = assocPaid[c.driver];
                      return (
                        <tr key={c.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 px-2.5 font-bold">{c.driver}</td><td className="py-2.5 px-2.5">Route Association — {c.owner.split(" ")[0]} Zone</td><td className="py-2.5 px-2.5">{c.vehicle}</td><td className="py-2.5 px-2.5">{R(c.assocFee)}</td>
                          <td className="py-2.5 px-2.5"><Pill tone={paidStatus ? "green" : "red"}>{paidStatus ? "Remitted" : "Outstanding"}</Pill></td>
                          <td className="py-2.5 px-2.5"><button onClick={() => setAssocPaid(a => ({ ...a, [c.driver]: !a[c.driver] }))} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11.5px] font-bold">{paidStatus ? "Mark unpaid" : "Mark remitted"}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11.5px] text-gray-400 mt-3.5 leading-relaxed">Association fees are collected on behalf of each route association and remitted monthly. They are held as a liability on your balance sheet until paid out — they are not part of your investment income.</p>
              </div>
            </div>
          )}

          {/* ── Income Statement ── */}
          {view === "income-statement" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Income Statement</h1><p className="text-gray-500 text-[13.5px] mt-1">Automatically generated from device income, trip fees and operating expenses.</p></div>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      <StatementRow kind="section" label="Revenue" />
                      <StatementRow kind="indent" label="Fixed device income" value={R2(f.fixedIncomeTotal)} />
                      <StatementRow kind="indent" label={`Transaction fee income (${R2(INVESTOR_TAP_SHARE)}/tap)`} value={R2(f.feeTotal)} />
                      <StatementRow kind="subtotal" label="Total revenue" value={R2(f.grossRevenue)} />
                      <StatementRow kind="section" label="Operating expenses" />
                      <StatementRow kind="indent" label="Device maintenance" value={R2(f.maintenance)} />
                      <StatementRow kind="indent" label="Insurance" value={R2(f.insurance)} />
                      <StatementRow kind="indent" label="Administration" value={R2(f.admin)} />
                      <StatementRow kind="indent" label="Depreciation" value={R2(f.depreciation)} />
                      <StatementRow kind="subtotal" label="Total operating expenses" value={R2(f.opexTotal)} />
                      <StatementRow kind="subtotal" label="Earnings before tax" value={R2(f.ebt)} />
                      <StatementRow kind="indent" label={`Provisional tax (${taxRate}%)`} value={R2(-f.tax)} />
                      <StatementRow kind="total" label="Net income" value={R2(f.netIncome)} />
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Revenue mix</p>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer><BarChart data={[{ n: "Fixed", v: f.fixedIncomeTotal, fill: PURPLE }, { n: "Fees", v: f.feeTotal, fill: GREEN }, { n: "Opex", v: -f.opexTotal, fill: ORANGE }, { n: "Tax", v: -f.tax, fill: RED }, { n: "Net", v: f.netIncome, fill: BLUE }]}><CartesianGrid vertical={false} stroke="#f1f2f8" /><XAxis dataKey="n" tick={{ fontSize: 11, fill: "#9198b3" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "#9198b3" }} axisLine={false} tickLine={false} width={44} tickFormatter={v => `R${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Bar dataKey="v" radius={[6, 6, 0, 0]}>{[PURPLE, GREEN, ORANGE, RED, BLUE].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer>
                  </div>
                  <p className="text-[11.5px] text-gray-400 mt-2.5">Net income flows into retained earnings on your balance sheet and drives your cash position on the statement of cash flow.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Balance Sheet ── */}
          {view === "balance-sheet" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Balance Sheet</h1><p className="text-gray-500 text-[13.5px] mt-1">Assets, liabilities and equity across your device portfolio, as at period end.</p></div>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      <StatementRow kind="section" label="Assets" />
                      <StatementRow kind="indent" label="Cash and bank" value={R2(f.closingCash)} />
                      <StatementRow kind="indent" label="Accounts receivable (offline fees pending)" value={R2(f.arIncrease)} />
                      <StatementRow kind="indent" label="Devices, net of depreciation" value={R2(f.devicesNet)} />
                      <StatementRow kind="total" label="Total assets" value={R2(f.totalAssets)} />
                      <StatementRow kind="section" label="Liabilities" />
                      <StatementRow kind="indent" label="Association fees payable" value={R2(f.totalLiabilities)} />
                      <StatementRow kind="subtotal" label="Total liabilities" value={R2(f.totalLiabilities)} />
                      <StatementRow kind="section" label="Equity" />
                      <StatementRow kind="indent" label="Investor capital" value={R2(INVESTOR_CAPITAL)} />
                      <StatementRow kind="indent" label="Retained earnings" value={R2(f.retainedEarnings)} />
                      <StatementRow kind="subtotal" label="Total equity" value={R2(f.totalEquity)} />
                      <StatementRow kind="total" label="Total liabilities and equity" value={R2(f.totalLiabilities + f.totalEquity)} />
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Asset composition</p>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer><PieChart><Pie data={[{ name: "Cash", value: f.closingCash, color: BLUE }, { name: "Receivables", value: f.arIncrease, color: ORANGE }, { name: "Devices (net)", value: f.devicesNet, color: PURPLE }]} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>{[BLUE, ORANGE, PURPLE].map((c, i) => <Cell key={i} fill={c} />)}</Pie><Tooltip formatter={(v: number) => R(v)} /></PieChart></ResponsiveContainer>
                  </div>
                  <p className="text-[11.5px] mt-2.5" style={{ color: bsBalanced ? GREEN : RED }}>{bsBalanced ? "Balanced ✓ — assets equal liabilities plus equity." : `Reconciliation variance: ${R2(f.totalAssets - (f.totalLiabilities + f.totalEquity))}`}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Cash Flow ── */}
          {view === "cash-flow" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Statement of Cash Flow</h1><p className="text-gray-500 text-[13.5px] mt-1">Cash movement from operating, investing and financing activity this period.</p></div>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      <StatementRow kind="section" label="Operating activities" />
                      <StatementRow kind="indent" label="Net income" value={R2(f.netIncome)} />
                      <StatementRow kind="indent" label="Add: depreciation" value={R2(f.depreciation)} />
                      <StatementRow kind="indent" label="Less: increase in accounts receivable" value={R2(-f.arIncrease)} />
                      <StatementRow kind="indent" label="Add: increase in association fees payable" value={R2(f.assocFeesCollected)} />
                      <StatementRow kind="subtotal" label="Net cash from operating activities" value={R2(f.cashFromOperating)} />
                      <StatementRow kind="section" label="Investing activities" />
                      <StatementRow kind="indent" label="Purchase of devices" value={R2(f.cashFromInvesting)} />
                      <StatementRow kind="subtotal" label="Net cash from investing activities" value={R2(f.cashFromInvesting)} />
                      <StatementRow kind="section" label="Financing activities" />
                      <StatementRow kind="indent" label="Investor capital contributions" value={R2(f.cashFromFinancing)} />
                      <StatementRow kind="subtotal" label="Net cash from financing activities" value={R2(f.cashFromFinancing)} />
                      <StatementRow kind="section" label="Summary" />
                      <StatementRow kind="indent" label="Net change in cash" value={R2(f.netChangeInCash)} />
                      <StatementRow kind="indent" label="Cash at beginning of period" value={R2(f.openingCash)} />
                      <StatementRow kind="total" label="Cash at end of period" value={R2(f.closingCash)} />
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Cash position, last 14 days</p>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer>
                      <LineChart data={(() => { const days = Array.from({ length: 14 }, (_, i) => { const d = new Date("2025-04-26T00:00:00"); d.setDate(d.getDate() + i); return d; }); let running = f.openingCash; const vals = days.map(() => { running += f.netChangeInCash / 14 * (0.6 + Math.random() * 0.8); return Math.round(running); }); vals[vals.length - 1] = Math.round(f.closingCash); return days.map((d, i) => ({ day: d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }), v: vals[i] })); })()}>
                        <CartesianGrid vertical={false} stroke="#f1f2f8" /><XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9198b3" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "#9198b3" }} axisLine={false} tickLine={false} width={44} tickFormatter={v => `R${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Line type="monotone" dataKey="v" stroke={GREEN} strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tax ── */}
          {view === "tax" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Tax</h1><p className="text-gray-500 text-[13.5px] mt-1">Provisional tax automatically calculated on your net investment income.</p></div>
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      <StatementRow kind="section" label="Provisional tax calculation" />
                      <StatementRow kind="indent" label="Gross revenue" value={R2(f.grossRevenue)} />
                      <StatementRow kind="indent" label="Less: operating expenses" value={R2(-f.opexTotal)} />
                      <StatementRow kind="subtotal" label="Taxable income" value={R2(f.ebt)} />
                      <StatementRow kind="indent" label="Effective tax rate" value={`${taxRate}%`} />
                      <StatementRow kind="total" label="Tax payable" value={R2(f.tax)} />
                      <StatementRow kind="section" label="After tax" />
                      <StatementRow kind="total" label="Net income retained" value={R2(f.netIncome)} />
                    </tbody>
                  </table>
                  <div className="h-px bg-gray-100 my-4.5" />
                  <div className="flex items-end gap-3 flex-wrap">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Effective tax rate</label><div className="flex items-center gap-2"><input type="number" min={0} max={60} step={0.5} value={taxRateInput} onChange={e => setTaxRateInput(e.target.value)} className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none" /><span className="font-bold">%</span></div></div>
                    <button onClick={() => { const v = parseFloat(taxRateInput); if (!isNaN(v) && v >= 0 && v <= 60) { setTaxRate(v); toast.success(`Tax rate updated to ${v}%`); } }} className="px-4 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: `linear-gradient(90deg,${BLUE},#4f7cf5)` }}>Recalculate</button>
                  </div>
                  <p className="text-[11.5px] text-gray-400 mt-3">Illustrative calculation only — confirm final liability with a registered tax practitioner in your jurisdiction.</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Tax by month</p>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer><BarChart data={["Dec", "Jan", "Feb", "Mar", "Apr", "May"].map((m, i) => ({ m, v: i === 5 ? Math.round(f.tax) : Math.round(f.tax * (0.7 + Math.random() * 0.5)) }))}><CartesianGrid vertical={false} stroke="#f1f2f8" /><XAxis dataKey="m" tick={{ fontSize: 11, fill: "#9198b3" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "#9198b3" }} axisLine={false} tickLine={false} width={44} /><Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 10 }} /><Bar dataKey="v" fill={RED} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {view === "settings" && (
            <div>
              <div className="mb-5"><h1 className="text-[23px] font-bold">Settings</h1><p className="text-gray-500 text-[13.5px] mt-1">Console preferences and portfolio assumptions.</p></div>
              <div className="grid lg:grid-cols-2 gap-4.5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Investor profile</p>
                  <div className="space-y-3">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Name</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" defaultValue={investorName} /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Investor capital contributed</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50" value={R2(INVESTOR_CAPITAL)} readOnly /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Currency</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50" value="South African Rand (R)" readOnly /></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-bold mb-3.5">Portfolio assumptions</p>
                  <div className="space-y-3">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Transaction fee per device</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50" value={`${R2(INVESTOR_TAP_SHARE)} per tap (10% of VINK's R1.00 fee)`} readOnly /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Device cost basis</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50" value="Set per device on creation" readOnly /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Reset demo data</label>
                      <button onClick={() => { setDevices(seedDevices()); setContracts(seedContracts()); setTransactions(seedTransactions(seedDevices())); setTaxRate(18); setTaxRateInput("18"); toast.success("Sample data restored"); }}
                        className="text-[12.5px] font-bold" style={{ color: BLUE }}>Restore original sample data →</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Device modal */}
      {showDeviceModal && <AddDeviceModal onClose={() => setShowDeviceModal(false)} onSubmit={submitDevice} />}
      {/* New Contract modal */}
      {showContractModal && <NewContractModal contractType={contractType} setContractType={setContractType} onClose={() => setShowContractModal(false)} onSubmit={submitContract} />}
    </div>
  );
}

function AddDeviceModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (driver: string, vehicle: string, cost: number) => void }) {
  const [driver, setDriver] = useState(""), [vehicle, setVehicle] = useState(""), [cost, setCost] = useState("3500");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.55)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold mb-1">Add a device</h3>
        <p className="text-[12.5px] text-gray-400 mb-4">New tap-to-pay units earn {R(DEVICE_MONTHLY_RENTAL)}/month device rental plus {R2(INVESTOR_TAP_SHARE)} per tap from the moment they're added.</p>
        <div className="space-y-3">
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Driver name</label><input value={driver} onChange={e => setDriver(e.target.value)} placeholder="e.g. Lindiwe Ngcobo" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Vehicle</label><input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. Toyota Quantum – CA 111-222" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Device cost (R)</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
        </div>
        <div className="flex gap-2.5 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={() => onSubmit(driver, vehicle, parseFloat(cost))} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: `linear-gradient(90deg,${BLUE},#4f7cf5)` }}>Add device</button>
        </div>
      </div>
    </div>
  );
}

function NewContractModal({ contractType, setContractType, onClose, onSubmit }: { contractType: "fixed" | "target"; setContractType: (t: "fixed" | "target") => void; onClose: () => void; onSubmit: (driver: string, owner: string, vehicle: string, amount: number, assocFee: number) => void }) {
  const [driver, setDriver] = useState(""), [owner, setOwner] = useState(""), [vehicle, setVehicle] = useState(""), [amount, setAmount] = useState("4500"), [assocFee, setAssocFee] = useState("350");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.55)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold mb-1">New contract</h3>
        <p className="text-[12.5px] text-gray-400 mb-4">Agreement between a driver and the vehicle owner.</p>
        <div className="space-y-3">
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Driver name</label><input value={driver} onChange={e => setDriver(e.target.value)} placeholder="e.g. Lindiwe Ngcobo" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Vehicle owner</label><input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Sizwe Holdings" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Vehicle</label><input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. Toyota Quantum – CA 111-222" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Agreement type</label>
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <button onClick={() => setContractType("fixed")} className="flex-1 text-center py-2 rounded-md text-[12.5px] font-bold" style={contractType === "fixed" ? { background: "#fff", boxShadow: "0 3px 10px -4px rgba(15,21,48,.3)" } : { color: "#5b6280" }}>Fixed monthly</button>
              <button onClick={() => setContractType("target")} className="flex-1 text-center py-2 rounded-md text-[12.5px] font-bold" style={contractType === "target" ? { background: "#fff", boxShadow: "0 3px 10px -4px rgba(15,21,48,.3)" } : { color: "#5b6280" }}>Target-based</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="block text-xs font-bold text-gray-600 mb-1.5">{contractType === "fixed" ? "Monthly amount (R)" : "Monthly target (R)"}</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
            <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Association fee (R/mo)</label><input type="number" value={assocFee} onChange={e => setAssocFee(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px]" /></div>
          </div>
        </div>
        <div className="flex gap-2.5 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={() => onSubmit(driver, owner, vehicle, parseFloat(amount), parseFloat(assocFee))} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: `linear-gradient(90deg,${BLUE},#4f7cf5)` }}>Create contract</button>
        </div>
      </div>
    </div>
  );
}
