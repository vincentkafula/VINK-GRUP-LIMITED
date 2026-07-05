/**
 * VMS AFC Revenue Distribution Dashboard
 *
 * Shows the complete revenue flow:
 *   Passenger → Fare + R0.50 fee
 *   Driver    → Fare - R0.50 fee - R20/trip levy
 *   VMS       → R1.00/tap → keeps R0.90, sends R0.10 to device investor
 *   Association → R20/trip levy → splits with marshall per agreed %
 *   Investor  → R0.10/tap + R250/month device rental
 *   Marshall  → % of R20 levy per trip
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, TrendingUp, Users, Zap, Building2, CreditCard, BarChart3,
  RefreshCw, ChevronRight, Plus, AlertTriangle, CheckCircle, Settings,
} from "lucide-react";
import { api } from "../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const GOLD = "#F5A623";
const fmt = (n: number) => `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtM = (n: number) => n >= 1_000_000 ? `R${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `R${(n/1000).toFixed(1)}K` : fmt(n);

type Screen = "overview" | "tap_simulator" | "accounts" | "devices" | "agreements" | "transactions" | "investor";

const ACCOUNT_COLORS: Record<string, string> = {
  vms_platform: "#5B2D8E", investor: "#F59E0B", association: "#3B82F6",
  marshall: "#10B981", driver: "#14B8A6", passenger: "#EC4899", taxi_owner: "#6B7280",
};

const ACCOUNT_ICONS: Record<string, string> = {
  vms_platform: "🏦", investor: "💰", association: "🏛️",
  marshall: "👮", driver: "🚌", passenger: "👤", taxi_owner: "🏢",
};

// ─── Fee constant display ──────────────────────────────────────────────────────
const FEES = {
  PASSENGER_TAP_FEE: 0.50,
  DRIVER_TAP_FEE:    0.50,
  VMS_FEE_TOTAL:     1.00,
  INVESTOR_SHARE_PCT: 10,
  TRIP_LEVY:         20.00,
  DEVICE_MONTHLY_RENTAL: 250.00,
};

// ─── Simulated tap function ────────────────────────────────────────────────────
function simulateTapResult(fareAmount: number, marshallPct = 15) {
  const passengerFee  = FEES.PASSENGER_TAP_FEE;
  const driverFee     = FEES.DRIVER_TAP_FEE;
  const vmsFee        = FEES.VMS_FEE_TOTAL;
  const investorShare = +(vmsFee * FEES.INVESTOR_SHARE_PCT / 100).toFixed(2);
  const vmsKeeps      = +(vmsFee - investorShare).toFixed(2);
  const levy          = FEES.TRIP_LEVY;
  const marshallLevy  = +(levy * marshallPct / 100).toFixed(2);
  const assocLevy     = +(levy - marshallLevy).toFixed(2);
  return {
    passenger: { pays: fareAmount + passengerFee, fee: passengerFee },
    driver: { receives: fareAmount - driverFee, fee: driverFee, tripLevyPerTrip: levy },
    vms: { earns: vmsFee, keeps: vmsKeeps },
    investor: { tapShare: investorShare, monthly: FEES.DEVICE_MONTHLY_RENTAL },
    association: { receives: assocLevy, perTrip: levy },
    marshall: { receives: marshallLevy, percentage: marshallPct },
  };
}

export function RevenueDashboard({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("overview");
  const [snapshot, setSnapshot] = useState<Record<string,unknown> | null>(null);
  const [accounts, setAccounts] = useState<Record<string,unknown>[]>([]);
  const [devices, setDevices] = useState<Record<string,unknown>[]>([]);
  const [agreements, setAgreements] = useState<Record<string,unknown>[]>([]);
  const [transactions, setTransactions] = useState<Record<string,unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  // Tap simulator state
  const [simFare, setSimFare] = useState("14");
  const [simMarshall, setSimMarshall] = useState("15");
  const [simResult, setSimResult] = useState<ReturnType<typeof simulateTapResult> | null>(null);
  const [simProcessing, setSimProcessing] = useState(false);
  const [simHistory, setSimHistory] = useState<{fare: number; ts: string}[]>([]);

  // Agreement form
  const [agrAssoc, setAgrAssoc] = useState("");
  const [agrMarshall, setAgrMarshall] = useState("");
  const [agrPct, setAgrPct] = useState("15");
  const [agrSaving, setAgrSaving] = useState(false);
  const [agrSaved, setAgrSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [snapR, acctR, devR, agrR, txnR] = await Promise.allSettled([
      api.get("/levy/snapshot"),
      api.get("/levy/accounts"),
      api.get("/levy/devices"),
      api.get("/levy/agreements"),
      api.get("/levy/transactions"),
    ]);
    if (snapR.status === "fulfilled" && snapR.value.success) setSnapshot(snapR.value.data as Record<string,unknown>);
    if (acctR.status === "fulfilled" && acctR.value.success) setAccounts((acctR.value.data as Record<string,unknown>[]) ?? []);
    if (devR.status  === "fulfilled" && devR.value.success)  setDevices((devR.value.data as Record<string,unknown>[]) ?? []);
    if (agrR.status  === "fulfilled" && agrR.value.success)  setAgreements((agrR.value.data as Record<string,unknown>[]) ?? []);
    if (txnR.status  === "fulfilled" && txnR.value.success)  setTransactions((txnR.value.data as Record<string,unknown>[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isOpen) { load(); } }, [isOpen, load]);

  const runSimulator = async () => {
    setSimProcessing(true);
    setSimResult(null);
    await new Promise(r => setTimeout(r, 800));
    const result = simulateTapResult(+simFare, +simMarshall);
    setSimResult(result);
    setSimHistory(h => [{ fare: +simFare, ts: new Date().toLocaleTimeString("en-ZA") }, ...h].slice(0, 10));
    // Also call backend if available
    await api.post("/levy/tap", {
      deviceId: "dev-001", passengerId: "pax-001",
      fareAmount: +simFare, routeName: "Demo Route",
      paymentPath: "online_fast", processingMs: 800,
    });
    await load();
    setSimProcessing(false);
  };

  const saveAgreement = async () => {
    setAgrSaving(true);
    await api.post("/levy/agreements", {
      associationId: agrAssoc, marshallId: agrMarshall,
      marshallPercentage: +agrPct, approvedBy: "Dashboard Admin",
    });
    setAgrSaved(true);
    setAgrSaving(false);
    await load();
    setTimeout(() => setAgrSaved(false), 3000);
  };

  if (!isOpen) return null;

  const NAV = [
    { id: "overview",       label: "Overview",         icon: <BarChart3 className="w-4 h-4" /> },
    { id: "tap_simulator",  label: "Tap Simulator",    icon: <Zap className="w-4 h-4" /> },
    { id: "accounts",       label: "All Accounts",     icon: <Users className="w-4 h-4" /> },
    { id: "devices",        label: "AFC Devices",      icon: <CreditCard className="w-4 h-4" /> },
    { id: "agreements",     label: "Marshall Agreements", icon: <Building2 className="w-4 h-4" /> },
    { id: "transactions",   label: "Transactions",     icon: <TrendingUp className="w-4 h-4" /> },
    { id: "investor",       label: "Investor View",    icon: <RefreshCw className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: P }}>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-900 leading-none">AFC Revenue Distribution System</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Live fare splits · Levy distribution · Investor earnings · Marshall payments</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar ── */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col py-3 px-2 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setScreen(item.id as Screen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5"
              style={{ background: screen === item.id ? P + "15" : "transparent", color: screen === item.id ? P : "#6B7280", fontWeight: screen === item.id ? 700 : 400 }}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}

          {/* Fee reference */}
          <div className="mt-4 mx-1 rounded-xl border border-gray-100 p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Current Fee Schedule</p>
            {[
              { label: "Passenger tap fee", value: "R0.50" },
              { label: "Driver tap fee",    value: "R0.50" },
              { label: "VMS total/tap",     value: "R1.00" },
              { label: "Investor share",    value: "10%" },
              { label: "Trip levy",         value: "R20.00" },
              { label: "Device rental",     value: "R250/mo" },
            ].map(f => (
              <div key={f.label} className="flex justify-between">
                <span className="text-[10px] text-gray-500">{f.label}</span>
                <span className="text-[10px] font-black" style={{ color: P }}>{f.value}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 overflow-y-auto px-5 py-5">

          {/* ── OVERVIEW ── */}
          {screen === "overview" && (
            <div className="space-y-6 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Revenue Distribution Overview</h1>

              {/* Flow diagram */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-5">Revenue Flow — Per Tap (R14 fare example)</p>
                <div className="overflow-x-auto">
                  <div className="flex items-start gap-4 min-w-[700px]">
                    {[
                      { label: "Passenger", pays: "R14.50", note: "R14 fare\n+ R0.50 fee", color: "#EC4899", arrow: true },
                      { label: "Driver",    pays: "R13.50", note: "Receives R14\n- R0.50 fee\n- R20/trip levy", color: "#14B8A6", arrow: true },
                      { label: "VMS Platform", pays: "R0.90/tap", note: "Keeps 90%\nof R1.00 fee", color: P, arrow: true },
                      { label: "Investor",  pays: "R0.10/tap\n+R250/mo", note: "10% of R1.00\n+ monthly rental", color: "#F59E0B", arrow: false },
                    ].map((n, i) => (
                      <div key={i} className="flex items-center gap-2 flex-1">
                        <div className="flex-1 rounded-xl p-3 text-center border"
                          style={{ borderColor: n.color + "40", background: n.color + "08" }}>
                          <div className="text-lg font-black" style={{ color: n.color }}>{n.label}</div>
                          <div className="text-xs font-bold text-gray-700 mt-1 whitespace-pre-line">{n.pays}</div>
                          <div className="text-[9px] text-gray-400 mt-1 whitespace-pre-line leading-tight">{n.note}</div>
                        </div>
                        {n.arrow && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="text-xs font-bold text-gray-600 mb-2">Trip Levy Distribution (R20/trip)</p>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl p-3 text-center border flex-1" style={{ borderColor: "#14B8A640", background: "#14B8A608" }}>
                        <div className="font-black text-sm" style={{ color: "#14B8A6" }}>Driver</div>
                        <div className="text-xs text-gray-600 mt-0.5">-R20 per trip</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                      <div className="rounded-xl p-3 text-center border flex-1" style={{ borderColor: "#3B82F640", background: "#3B82F608" }}>
                        <div className="font-black text-sm" style={{ color: "#3B82F6" }}>Association</div>
                        <div className="text-xs text-gray-600 mt-0.5">85% of R20 = R17</div>
                        <div className="text-[9px] text-gray-400">(after 15% to marshall)</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                      <div className="rounded-xl p-3 text-center border flex-1" style={{ borderColor: "#10B98140", background: "#10B98108" }}>
                        <div className="font-black text-sm" style={{ color: "#10B981" }}>Marshall</div>
                        <div className="text-xs text-gray-600 mt-0.5">15% of R20 = R3</div>
                        <div className="text-[9px] text-gray-400">(agreed percentage)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI cards */}
              {snapshot && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Taps Today",         value: String((snapshot.totalTapsToday as number) ?? 0),               color: P },
                    { label: "Total Fare Today",         value: fmtM((snapshot.totalFareToday as number) ?? 0),                  color: "#14B8A6" },
                    { label: "VMS Earnings Today",       value: fmtM((snapshot.totalVmsEarningsToday as number) ?? 0),           color: "#F59E0B" },
                    { label: "Investor Earnings Today",  value: fmtM((snapshot.totalInvestorEarningsToday as number) ?? 0),      color: "#EC4899" },
                    { label: "Levies Collected",         value: fmtM((snapshot.totalLeviesCollectedToday as number) ?? 0),       color: "#3B82F6" },
                    { label: "Marshall Payments",        value: fmtM((snapshot.totalMarshallPaymentsToday as number) ?? 0),      color: "#10B981" },
                    { label: "Monthly Rentals",          value: fmtM((snapshot.totalRentalsThisMonth as number) ?? 0),           color: "#8B5CF6" },
                    { label: "Active Devices",           value: String((snapshot.activeDevices as number) ?? 0),                 color: "#6B7280" },
                  ].map((k, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{k.label}</p>
                      <p className="text-2xl font-black mt-1" style={{ color: k.color }}>{k.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Account balances grid */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Account Balances — All Parties</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accounts.map((acct, i) => {
                    const t = String(acct.type);
                    const color = ACCOUNT_COLORS[t] ?? "#9CA3AF";
                    return (
                      <div key={i} className="rounded-xl border p-4 hover:shadow-sm transition-shadow cursor-pointer"
                        style={{ borderColor: color + "30", background: color + "06" }}
                        onClick={() => setScreen("accounts")}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{ACCOUNT_ICONS[t] ?? "💼"}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-700 truncate">{String(acct.ownerName)}</p>
                            <p className="text-[9px] font-semibold uppercase" style={{ color }}>{t.replace("_"," ")}</p>
                          </div>
                        </div>
                        <p className="text-xl font-black" style={{ color }}>{fmt(Number(acct.balance))}</p>
                        <div className="flex gap-3 mt-1 text-[9px] text-gray-400">
                          <span>↑ {fmtM(Number(acct.totalIn))}</span>
                          <span>↓ {fmtM(Number(acct.totalOut))}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── TAP SIMULATOR ── */}
          {screen === "tap_simulator" && (
            <div className="space-y-5 max-w-3xl">
              <h1 className="text-xl font-black text-gray-900">Tap Revenue Simulator</h1>
              <p className="text-sm text-gray-500">Enter a fare amount and marshall percentage to see exactly how every rand is distributed across all parties in real time.</p>

              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Fare Amount (ZAR)</label>
                    <input type="number" value={simFare} onChange={e => setSimFare(e.target.value)} min="1" max="500"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black outline-none focus:border-purple-400"
                      style={{ color: P }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Marshall Percentage (%)</label>
                    <input type="number" value={simMarshall} onChange={e => setSimMarshall(e.target.value)} min="0" max="50"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black outline-none focus:border-purple-400"
                      style={{ color: "#10B981" }} />
                    <p className="text-[10px] text-gray-400 mt-1">% of R20 trip levy that goes to marshall</p>
                  </div>
                </div>

                <button onClick={runSimulator} disabled={simProcessing}
                  className="w-full py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-3 shadow-lg"
                  style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                  {simProcessing ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Processing tap…</> : <><Zap className="w-5 h-5" />Simulate Tap &amp; Distribute Revenue</>}
                </button>
              </div>

              {/* Results */}
              {simResult && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                  <p className="text-sm font-black text-gray-800">Distribution for R{simFare} fare</p>
                  <div className="space-y-3">
                    {[
                      { party: "Passenger pays",  amount: simResult.passenger.pays,                      note: `R${simFare} fare + R${simResult.passenger.fee} tap fee`,          color: "#EC4899", arrow: "←" },
                      { party: "Driver receives",  amount: simResult.driver.receives,                     note: `R${simFare} fare − R${simResult.driver.fee} tap fee`,             color: "#14B8A6", arrow: "→" },
                      { party: "VMS earns (keeps)", amount: simResult.vms.keeps,                          note: `R${simResult.vms.earns} total fee − R${simResult.investor.tapShare} investor`, color: P, arrow: "→" },
                      { party: "Investor earns/tap", amount: simResult.investor.tapShare,                 note: `${FEES.INVESTOR_SHARE_PCT}% of R${FEES.VMS_FEE_TOTAL} VMS fee`,  color: "#F59E0B", arrow: "→" },
                      { party: "Association (levy)", amount: simResult.association.receives,              note: `R${FEES.TRIP_LEVY} levy − ${simResult.marshall.percentage}% marshall = R${simResult.marshall.receives}`, color: "#3B82F6", arrow: "→" },
                      { party: "Marshall (levy %)", amount: simResult.marshall.receives,                  note: `${simResult.marshall.percentage}% of R${FEES.TRIP_LEVY} trip levy`, color: "#10B981", arrow: "→" },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center gap-4 p-3.5 rounded-xl border"
                        style={{ borderColor: row.color + "30", background: row.color + "06" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800">{row.party}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{row.note}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-black" style={{ color: row.color }}>{fmt(row.amount)}</p>
                          <p className="text-[10px]" style={{ color: row.color }}>per {i <= 3 ? "tap" : "trip"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl p-4 bg-green-50 border border-green-200 text-sm text-green-800">
                    <strong>Driver net after 1 trip (15 taps @ R{simFare}):</strong><br />
                    Fare collected: {fmt(15 * +simFare)} − Driver fees (15 × R0.50): {fmt(15 * 0.50)} − Trip levy: R20 = <strong>{fmt(15 * +simFare - 15 * 0.50 - 20)}</strong>
                  </div>
                </div>
              )}

              {/* Tap history */}
              {simHistory.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-sm font-black text-gray-800 mb-3">Simulation History</p>
                  <div className="space-y-1.5">
                    {simHistory.map((h, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                        <span className="text-gray-500">{h.ts}</span>
                        <span className="font-semibold text-gray-800">R{h.fare} fare → {fmt(h.fare * 0.5 / 0.5 * FEES.VMS_FEE_TOTAL)} VMS earning</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ACCOUNTS ── */}
          {screen === "accounts" && (
            <div className="space-y-4 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">All Accounts</h1>
              <div className="space-y-3">
                {accounts.map((acct, i) => {
                  const t = String(acct.type);
                  const color = ACCOUNT_COLORS[t] ?? "#9CA3AF";
                  return (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: color + "15" }}>
                            {ACCOUNT_ICONS[t] ?? "💼"}
                          </div>
                          <div>
                            <p className="font-black text-gray-900">{String(acct.ownerName)}</p>
                            <p className="text-xs font-semibold uppercase mt-0.5" style={{ color }}>{t.replace("_"," ")}</p>
                            <p className="text-[10px] text-gray-400 font-mono">ID: {String(acct.ownerId)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black" style={{ color }}>{fmt(Number(acct.balance))}</p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            Total in: <span className="text-green-600 font-bold">{fmtM(Number(acct.totalIn))}</span> ·
                            Total out: <span className="text-red-500 font-bold"> {fmtM(Number(acct.totalOut))}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DEVICES ── */}
          {screen === "devices" && (
            <div className="space-y-4 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">AFC Devices & Investor Ownership</h1>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <strong>Investor model:</strong> Investors purchase AFC devices and rent them to taxi owners at <strong>R250/month</strong>. Each tap on their device earns them <strong>R0.10</strong> (10% of the R1.00 VMS fee). A device doing 200 taps/day earns the investor R20/day in tap revenue + R250/month rental = ~R850/month per device.
              </div>
              <div className="space-y-4">
                {devices.map((dev, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <p className="font-black text-gray-900">{String(dev.serialNumber)}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{String(dev.status).toUpperCase()}</span>
                        </div>
                        <p className="text-xs text-gray-500">Route: {String(dev.routeId)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total taps</p>
                        <p className="text-2xl font-black" style={{ color: P }}>{Number(dev.tapCount).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Investor earns (taps)", value: fmt(Number(dev.tapCount) * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100), color: "#F59E0B" },
                        { label: "Monthly rental",        value: fmt(Number(dev.monthlyRental)),                    color: "#8B5CF6" },
                        { label: "Est. monthly tap revenue", value: fmt(200 * 30 * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100), color: "#10B981" },
                        { label: "Total monthly return",  value: fmt(Number(dev.monthlyRental) + 200 * 30 * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100), color: P },
                      ].map((s, j) => (
                        <div key={j} className="rounded-xl p-3 text-center" style={{ background: s.color + "10", border: `1px solid ${s.color}25` }}>
                          <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                          <p className="text-sm font-black mt-0.5" style={{ color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">* Monthly tap revenue estimated at 200 taps/day × 30 days × R0.10</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AGREEMENTS ── */}
          {screen === "agreements" && (
            <div className="space-y-5 max-w-3xl">
              <h1 className="text-xl font-black text-gray-900">Association–Marshall Levy Agreements</h1>
              <p className="text-sm text-gray-500">The association and marshall agree on a percentage of the R20 trip levy that the marshall receives. This is set per route and can be updated at any time.</p>

              {/* Existing agreements */}
              <div className="space-y-3">
                {agreements.map((agr, i) => {
                  const levyPct = Number(agr.marshallPercentage);
                  return (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-black text-gray-900">{String(agr.associationName)}</p>
                          <p className="text-xs text-gray-500">with Marshall: <span className="font-semibold">{String(agr.marshallName)}</span></p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">ACTIVE</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl p-3 text-center bg-green-50">
                          <p className="text-[9px] text-gray-500">Marshall gets</p>
                          <p className="text-xl font-black text-green-700">{levyPct}%</p>
                          <p className="text-[9px] text-green-600">= {fmt(FEES.TRIP_LEVY * levyPct / 100)}/trip</p>
                        </div>
                        <div className="rounded-xl p-3 text-center bg-blue-50">
                          <p className="text-[9px] text-gray-500">Association keeps</p>
                          <p className="text-xl font-black text-blue-700">{100-levyPct}%</p>
                          <p className="text-[9px] text-blue-600">= {fmt(FEES.TRIP_LEVY * (100-levyPct) / 100)}/trip</p>
                        </div>
                        <div className="rounded-xl p-3 text-center bg-gray-50">
                          <p className="text-[9px] text-gray-500">Total levy/trip</p>
                          <p className="text-xl font-black text-gray-700">{fmt(FEES.TRIP_LEVY)}</p>
                          <p className="text-[9px] text-gray-500">from driver</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2">Effective from {String(agr.effectiveFrom)} · Approved by {String(agr.approvedBy)}</p>
                    </div>
                  );
                })}
              </div>

              {/* New agreement form */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-black text-gray-800 flex items-center gap-2">
                  <Plus className="w-4 h-4" style={{ color: P }} />Create New Agreement
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Association ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="assoc-001" value={agrAssoc} onChange={e => setAgrAssoc(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Marshall ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="marsh-001" value={agrMarshall} onChange={e => setAgrMarshall(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Marshall Percentage (0–50%)</label>
                    <input type="number" min="0" max="50" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" value={agrPct} onChange={e => setAgrPct(e.target.value)} />
                    {agrPct && <p className="text-[10px] text-gray-400 mt-0.5">Marshall: {fmt(FEES.TRIP_LEVY * +agrPct / 100)} · Association: {fmt(FEES.TRIP_LEVY * (100 - +agrPct) / 100)} per trip</p>}
                  </div>
                </div>
                <button onClick={saveAgreement} disabled={!agrAssoc || !agrMarshall || agrSaving}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                  {agrSaved ? <><CheckCircle className="w-4 h-4" />Agreement Saved!</> : agrSaving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : "Save Agreement"}
                </button>
              </div>
            </div>
          )}

          {/* ── TRANSACTIONS ── */}
          {screen === "transactions" && (
            <div className="space-y-4 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Transaction Audit Trail</h1>
              {transactions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                  <p className="text-gray-400 text-sm">No transactions yet. Run a tap simulation to see the audit trail.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {transactions.map((txn, i) => {
                      const typeColors: Record<string, string> = {
                        tap_fare: "#14B8A6", tap_fee_passenger: "#EC4899",
                        tap_fee_driver: "#F59E0B", investor_tap: "#8B5CF6",
                        vms_platform_tap: P, trip_levy: "#3B82F6",
                        marshall_share: "#10B981", device_rental: "#F59E0B",
                      };
                      const color = typeColors[String(txn.type)] ?? "#9CA3AF";
                      return (
                        <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                            style={{ background: color }}>
                            {String(txn.type).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{String(txn.description)}</p>
                            <p className="text-[10px] text-gray-400">{String(txn.type).replace(/_/g," ")} · {new Date(String(txn.timestamp)).toLocaleTimeString("en-ZA")}</p>
                          </div>
                          <p className="text-sm font-black flex-shrink-0" style={{ color }}>{fmt(Number(txn.amount))}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── INVESTOR VIEW ── */}
          {screen === "investor" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Investor Portfolio Dashboard</h1>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>How investors earn:</strong> You buy AFC devices (R{fmt(0)} upfront — see device pricing) and rent them to taxi owners at <strong>R250/month</strong>. Every time a passenger taps on your device, you earn <strong>R0.10</strong>. A busy taxi does ~200 taps/day = R20/day = R600/month in tap revenue + R250/month rental = <strong>R850/month per device</strong>.
              </div>

              {/* Per investor summary */}
              {["inv-001", "inv-002"].map(invId => {
                const invAcct = accounts.find(a => String(a.ownerId) === invId);
                const invDevices = devices.filter(d => String(d.investorId) === invId);
                if (!invAcct) return null;
                const totalTaps = invDevices.reduce((s, d) => s + Number(d.tapCount), 0);
                return (
                  <div key={invId} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-lg">{String(invAcct.ownerName)}</p>
                        <p className="text-xs text-gray-500">{invDevices.length} device{invDevices.length !== 1 ? "s" : ""} deployed</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black" style={{ color: GOLD }}>{fmt(Number(invAcct.balance))}</p>
                        <p className="text-[10px] text-gray-400">Current balance</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Total taps earned from",    value: totalTaps.toLocaleString(),               color: P },
                        { label: "Tap revenue (lifetime)",    value: fmt(totalTaps * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100), color: "#F59E0B" },
                        { label: "Monthly rental income",     value: fmt(invDevices.length * FEES.DEVICE_MONTHLY_RENTAL),               color: "#10B981" },
                        { label: "Est. monthly total return", value: fmt(invDevices.length * FEES.DEVICE_MONTHLY_RENTAL + 200 * 30 * invDevices.length * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100), color: "#8B5CF6" },
                      ].map((s, j) => (
                        <div key={j} className="rounded-xl p-3 text-center" style={{ background: s.color + "10", border: `1px solid ${s.color}25` }}>
                          <p className="text-[9px] text-gray-500 uppercase tracking-wide leading-tight">{s.label}</p>
                          <p className="text-lg font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-600">Devices owned</p>
                      {invDevices.map((dev, j) => (
                        <div key={j} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{String(dev.serialNumber)}</p>
                            <p className="text-[10px] text-gray-500">{Number(dev.tapCount).toLocaleString()} total taps · R{String(dev.monthlyRental)}/month rental</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color: GOLD }}>
                              {fmt(Number(dev.tapCount) * FEES.VMS_FEE_TOTAL * FEES.INVESTOR_SHARE_PCT / 100)}
                            </p>
                            <p className="text-[9px] text-gray-400">lifetime tap earnings</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
