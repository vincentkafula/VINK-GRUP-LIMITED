/**
 * VMS Financial Reports System
 * Covers: Payslip · Bank Statement · Balance Sheet · Income Statement · Cash Flow
 * Both Driver and Business accounts.
 * Auto-loads from /api/financial backend.
 */
import { useState, useEffect } from "react";
import { X, Printer, TrendingUp, TrendingDown, DollarSign, FileText, BarChart3, Activity, RefreshCw, Plus, CheckCircle } from "lucide-react";
import { projectId } from "../../../utils/supabase/info";

interface Props { isOpen: boolean; onClose: () => void; }

// Try Supabase first, fall back to local Express
const SUPABASE_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-3f39932e/financial`;
const LOCAL_BASE    = (import.meta.env.VITE_API_URL ?? "http://localhost:3001") + "/api/financial";

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  try {
    const r = await fetch(`${SUPABASE_BASE}${path}`, opts);
    if (r.ok || r.status < 500) return r;
  } catch {}
  return fetch(`${LOCAL_BASE}${path}`, opts);
}

const API = SUPABASE_BASE; // kept for reference
const P = "#5B2D8E";
const GOLD = "#F5A623";
const GREEN = "#10B981";
const RED = "#EF4444";

const fmt = (n: number, abs = false) => `R ${(abs ? Math.abs(n) : n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => n < 0 ? <span style={{ color: RED }}>{fmt(n)}</span> : <span style={{ color: GREEN }}>{fmt(n)}</span>;

type Screen = "payslip" | "bank" | "balance" | "income" | "cashflow" | "journal";

const NAV = [
  { id: "payslip",  label: "Payslip",          icon: <FileText className="w-4 h-4" />, desc: "Driver earnings proof" },
  { id: "bank",     label: "Bank Statement",   icon: <Activity className="w-4 h-4" />, desc: "All transactions" },
  { id: "income",   label: "Income Statement", icon: <TrendingUp className="w-4 h-4" />, desc: "Profit & loss" },
  { id: "balance",  label: "Balance Sheet",    icon: <BarChart3 className="w-4 h-4" />, desc: "Assets & liabilities" },
  { id: "cashflow", label: "Cash Flow",        icon: <DollarSign className="w-4 h-4" />, desc: "Cash movements" },
  { id: "journal",  label: "Journal",          icon: <Plus className="w-4 h-4" />, desc: "Add entries" },
];

// ─── Section row helpers ──────────────────────────────────────────────────────
function StatRow({ label, value, indent = 0, bold = false, border = false, highlight = false, color }: {
  label: string; value: string | React.ReactNode; indent?: number; bold?: boolean; border?: boolean; highlight?: boolean; color?: string;
}) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${border ? "border-t border-gray-200 mt-1 pt-2" : ""} ${highlight ? "bg-purple-50 px-2 rounded" : ""}`}
      style={{ paddingLeft: indent * 16 }}>
      <span className={`text-sm ${bold ? "font-black text-gray-900" : "text-gray-600"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-black" : "font-semibold"}`} style={{ color: color ?? (bold ? P : "#374151") }}>{value}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-5 mb-2 pb-1 border-b border-gray-100">{children}</p>;
}

export function FinancialReportsViewer({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("payslip");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [trips, setTrips] = useState<Record<string, unknown>[]>([]);
  const [journal, setJournal] = useState<Record<string, unknown>[]>([]);
  const [bankEntries, setBankEntries] = useState<Record<string, unknown>[]>([]);
  const [bankMeta, setBankMeta] = useState<Record<string, number>>({});
  const [newEntry, setNewEntry] = useState({ date: new Date().toISOString().split("T")[0], account: "", description: "", debit: "", credit: "", entryType: "expense", category: "fuel" });
  const [entryAdded, setEntryAdded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadAll();
  }, [isOpen, screen]);

  const load = async (path: string) => {
    try { const r = await apiFetch(path); return await r.json(); } catch { return null; }
  };

  const loadAll = async () => {
    setLoading(true);
    if (screen === "payslip") {
      const [payslip, summary] = await Promise.all([load("/payslip/drv-001"), load("/trips/summary?driverId=drv-001")]);
      setData({ payslip: payslip?.data, summary: summary?.data });
    } else if (screen === "bank") {
      const r = await load("/bank-statement/drv-001");
      setBankEntries((r?.data ?? []) as Record<string, unknown>[]);
      setBankMeta((r?.meta ?? {}) as Record<string, number>);
    } else if (screen === "income") {
      const r = await load("/statements/income?businessId=biz-001");
      setData({ income: r?.data });
    } else if (screen === "balance") {
      const r = await load("/statements/balance-sheet?businessId=biz-001");
      setData({ balance: r?.data });
    } else if (screen === "cashflow") {
      const r = await load("/statements/cash-flow?businessId=biz-001");
      setData({ cashflow: r?.data });
    } else if (screen === "journal") {
      const [j, tr] = await Promise.all([load("/journal/biz-001"), load("/trips?driverId=drv-001&limit=20")]);
      setJournal((j?.data ?? []) as Record<string, unknown>[]);
      setTrips((tr?.data ?? []) as Record<string, unknown>[]);
    }
    setLoading(false);
  };

  const addJournalEntry = async () => {
    const body = { businessId: "biz-001", ...newEntry, debit: +newEntry.debit || 0, credit: +newEntry.credit || 0 };
    await apiFetch("/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setEntryAdded(true);
    setTimeout(() => { setEntryAdded(false); loadAll(); }, 1500);
  };

  if (!isOpen) return null;

  const ps = data.payslip as Record<string, number & string> | undefined;
  const sm = data.summary as Record<string, unknown> | undefined;
  const is = data.income as Record<string, number> | undefined;
  const bs = data.balance as Record<string, unknown> | undefined;
  const cf = data.cashflow as Record<string, number> | undefined;

  const printPage = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: P }}>
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">Financial Reports</p>
              <p className="text-[10px] text-gray-400">Driver · Business · All Statements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAll} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={printPage} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
              <Printer className="w-3.5 h-3.5" />Print
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Nav */}
        <div className="flex overflow-x-auto px-3 pb-2 gap-1" style={{ scrollbarWidth: "none" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setScreen(n.id as Screen)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
              style={{ background: screen === n.id ? P : "transparent", color: screen === n.id ? "#fff" : "#6B7280" }}>
              {n.icon}{n.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-4xl mx-auto w-full">

        {/* ══ PAYSLIP ══════════════════════════════════════════════════════════ */}
        {screen === "payslip" && (
          <div className="space-y-5">
            {/* Payslip document */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-0">
              {/* Header band */}
              <div className="px-8 py-5 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">PAYSLIP</p>
                    <p className="text-2xl font-black">{ps?.employerName ?? "Khayelitsha Taxi Association"}</p>
                    <p className="text-white/70 text-xs mt-1">{ps?.employerAddress ?? "8 Rose Street, Cape Town CBD, 8001"}</p>
                    <p className="text-white/70 text-xs">Reg: {ps?.employerReg ?? "2018/079316/07"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs opacity-70">Period</p>
                    <p className="font-black">{ps?.periodStart ? new Date(String(ps.periodStart)).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}</p>
                    <p className="text-xs opacity-70 mt-2">Issue date: {ps?.issueDate ?? new Date().toISOString().split("T")[0]}</p>
                  </div>
                </div>
              </div>

              <div className="px-8 py-5 space-y-1">
                {/* Employee details */}
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 mb-4 pb-4 border-b border-gray-100">
                  {[
                    ["Employee", ps?.employeeName ?? "Sipho Dlamini"],
                    ["ID Number", ps?.employeeId ?? "8707125482085"],
                    ["Tax Number", ps?.employeeTaxNo ?? "9312345678"],
                    ["Vehicle", ps?.vehicleReg ?? "CA 847-891"],
                    ["Bank", ps?.bankName ?? "Standard Bank"],
                    ["Account", ps?.bankAccount ? `**** ${String(ps.bankAccount).slice(-4)}` : "**** 7890"],
                    ["Payment Model", (ps?.paymentModel ?? "target") === "target" ? "Target-based" : "Monthly salary"],
                    ["Trips this period", String(ps?.tripsCount ?? sm?.tripCount ?? 0)],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-0.5">
                      <span className="text-xs text-gray-500">{l}</span>
                      <span className="text-xs font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Earnings */}
                <SectionHeader>Earnings</SectionHeader>
                <StatRow label="Fare revenue — card payments" value={fmt(ps?.faresTotalCard ?? Number(sm?.cardTotal) ?? 0)} />
                <StatRow label="Fare revenue — cash payments" value={fmt(ps?.faresTotalCash ?? Number(sm?.cashTotal) ?? 0)} />
                {(ps?.bonusAmount ?? 0) > 0 && <StatRow label="Bonus" value={fmt(+(ps?.bonusAmount ?? 0))} />}
                <StatRow label="Total Gross Earnings" value={fmt(ps?.totalGross ?? Number(sm?.totalFares) ?? 0)} bold border color={GREEN} />
                {ps?.paymentModel === "target" && ps?.targetAmount && (
                  <div className={`mt-2 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${ps.targetAchieved ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    {ps.targetAchieved ? <CheckCircle className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    Monthly target: {fmt(+ps.targetAmount)} — {ps.targetAchieved ? "TARGET ACHIEVED ✓" : "TARGET NOT MET"}
                  </div>
                )}

                {/* Deductions */}
                <SectionHeader>Deductions</SectionHeader>
                <StatRow label="Vehicle rental" value={fmt(ps?.vehicleRental ?? 3500)} indent={1} />
                <StatRow label="Association levy (KTA)" value={fmt(ps?.associationLevy ?? 450)} indent={1} />
                <StatRow label="Insurance (Santam)" value={fmt(ps?.insurance ?? 680)} indent={1} />
                <StatRow label="PAYE (income tax)" value={fmt(ps?.paye ?? 0)} indent={1} />
                <StatRow label="UIF (1% employee contribution)" value={fmt(ps?.uif ?? 0)} indent={1} />
                {(ps?.otherDeductions ?? 0) > 0 && <StatRow label="Other deductions" value={fmt(+(ps?.otherDeductions ?? 0))} indent={1} />}
                <StatRow label="Total Deductions" value={fmt(ps?.totalDeductions ?? 4630)} bold border color={RED} />

                {/* Net pay */}
                <div className="mt-4 p-4 rounded-2xl text-white" style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">NET PAY</p>
                      <p className="text-white/60 text-xs mt-0.5">Paid to {ps?.bankName ?? "Standard Bank"} **** {String(ps?.bankAccount ?? "7890").slice(-4)}</p>
                    </div>
                    <p className="text-3xl font-black" style={{ color: GOLD }}>
                      {fmt(ps?.netPay ?? (Number(sm?.totalFares ?? 9800) - 4630))}
                    </p>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 text-center mt-4">
                  This payslip is a certified financial record generated by VMS Bank · Authorised Financial Services Provider (NCRCP)
                  and may be used as proof of income for vehicle finance and loan applications.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══ BANK STATEMENT ═══════════════════════════════════════════════════ */}
        {screen === "bank" && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                { label: "Opening Balance", value: fmt(bankMeta.openingBalance ?? 0), color: P },
                { label: "Total Credits",   value: fmt(bankMeta.totalCredits ?? 0),   color: GREEN },
                { label: "Total Debits",    value: fmt(bankMeta.totalDebits ?? 0),    color: RED },
                { label: "Closing Balance", value: fmt(bankMeta.closingBalance ?? 0), color: P },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-bold">{s.label}</p>
                  <p className="text-xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Transaction History — Driver Account (CA 847-891)</p>
                <span className="text-[10px] text-gray-400">{bankEntries.length} transactions</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {["Date", "Description", "Reference", "Debit", "Credit", "Balance"].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold text-gray-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bankEntries.map((e: Record<string, unknown>, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{String(e.date)}</td>
                        <td className="px-4 py-3 text-gray-700">{String(e.description)}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{String(e.reference)}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: RED }}>{e.debit ? fmt(Number(e.debit)) : ""}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: GREEN }}>{e.credit ? fmt(Number(e.credit)) : ""}</td>
                        <td className="px-4 py-3 font-black text-gray-900">{fmt(Number(e.balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ INCOME STATEMENT ═════════════════════════════════════════════════ */}
        {screen === "income" && is && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xl font-black text-gray-900">Income Statement</p>
                <p className="text-xs text-gray-500 mt-0.5">VMS / Vink Taxi Operations — {is.periodStart} to {is.periodEnd}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-xl text-sm font-black ${is.netProfit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {is.netProfit >= 0 ? "PROFIT" : "LOSS"} {fmt(is.netProfit)}
              </div>
            </div>

            <SectionHeader>Revenue</SectionHeader>
            <StatRow label="Fare revenue — card payments (AFC)" value={fmt(is.fareRevenueCard)} indent={1} />
            <StatRow label="Fare revenue — cash payments" value={fmt(is.fareRevenueCash)} indent={1} />
            {is.otherIncome > 0 && <StatRow label="Other income" value={fmt(is.otherIncome)} indent={1} />}
            <StatRow label="Total Revenue" value={fmt(is.totalRevenue)} bold border color={P} />

            <SectionHeader>Cost of Sales</SectionHeader>
            <StatRow label="Driver wages & target payouts" value={`(${fmt(is.driverWages)})`} indent={1} />
            <StatRow label="Association levies" value={`(${fmt(is.associationLevy)})`} indent={1} />
            <StatRow label="AFC device rental" value={`(${fmt(is.afcDeviceRental)})`} indent={1} />
            <StatRow label="Total Cost of Sales" value={`(${fmt(is.totalCostOfSales)})`} bold border />
            <StatRow label="Gross Profit" value={fmt(is.grossProfit)} bold highlight color={is.grossProfit >= 0 ? GREEN : RED} />
            <StatRow label="Gross Profit Margin" value={`${is.grossProfitMargin}%`} color="#6B7280" />

            <SectionHeader>Operating Expenses</SectionHeader>
            <StatRow label="Fuel costs" value={`(${fmt(is.fuelCosts)})`} indent={1} />
            <StatRow label="Vehicle maintenance & repairs" value={`(${fmt(is.vehicleMaintenance)})`} indent={1} />
            <StatRow label="Insurance premiums" value={`(${fmt(is.insurance)})`} indent={1} />
            {is.depreciation > 0 && <StatRow label="Depreciation (vehicles & equipment)" value={`(${fmt(is.depreciation)})`} indent={1} />}
            {is.adminExpenses > 0 && <StatRow label="Administration expenses" value={`(${fmt(is.adminExpenses)})`} indent={1} />}
            {is.otherExpenses > 0 && <StatRow label="Other operating expenses" value={`(${fmt(is.otherExpenses)})`} indent={1} />}
            <StatRow label="Total Operating Expenses" value={`(${fmt(is.totalOpExpenses)})`} bold border />
            <StatRow label="Operating Profit" value={fmt(is.operatingProfit)} bold highlight color={is.operatingProfit >= 0 ? GREEN : RED} />

            <SectionHeader>Finance Costs</SectionHeader>
            <StatRow label="Vehicle loan interest" value={`(${fmt(is.loanInterest)})`} indent={1} />
            <StatRow label="Bank charges" value={`(${fmt(is.bankCharges)})`} indent={1} />
            <StatRow label="Total Finance Costs" value={`(${fmt(is.totalFinanceCosts)})`} bold border />
            <StatRow label="Profit Before Tax" value={fmt(is.profitBeforeTax)} bold />
            <StatRow label="Income tax (27%)" value={`(${fmt(is.taxExpense)})`} indent={1} />
            <StatRow label="NET PROFIT / (LOSS)" value={fmt(is.netProfit)} bold border highlight color={is.netProfit >= 0 ? GREEN : RED} />
            <StatRow label="Net Profit Margin" value={`${is.netProfitMargin}%`} color="#6B7280" />
          </div>
        )}

        {/* ══ BALANCE SHEET ════════════════════════════════════════════════════ */}
        {screen === "balance" && bs && (() => {
          const ca = bs.currentAssets as Record<string, number>;
          const nca = bs.nonCurrentAssets as Record<string, number>;
          const cl = bs.currentLiabilities as Record<string, number>;
          const ncl = bs.nonCurrentLiabilities as Record<string, number>;
          const eq = bs.equity as Record<string, number>;
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
                <div>
                  <p className="text-xl font-black text-gray-900">Balance Sheet</p>
                  <p className="text-xs text-gray-500 mt-0.5">VMS / Vink Taxi Operations — As at {String(bs.asAt)}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${bs.balanced ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {bs.balanced ? "✓ BALANCED" : "⚠ NOT BALANCED"}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Assets */}
                <div>
                  <SectionHeader>Assets</SectionHeader>
                  <p className="text-xs font-bold text-gray-500 mb-2">Current Assets</p>
                  <StatRow label="Cash in hand" value={fmt(ca.cashInHand)} indent={1} />
                  <StatRow label="Bank balance" value={fmt(ca.bankBalance)} indent={1} />
                  <StatRow label="Debtors / receivables" value={fmt(ca.debtors)} indent={1} />
                  <StatRow label="Total Current Assets" value={fmt(ca.total)} bold border />
                  <p className="text-xs font-bold text-gray-500 mb-2 mt-4">Non-Current Assets</p>
                  <StatRow label="Vehicles (at cost)" value={fmt(nca.vehicles)} indent={1} />
                  <StatRow label="Accumulated depreciation" value={`(${fmt(nca.accumulatedDepreciation, true)})`} indent={1} />
                  <StatRow label="AFC devices" value={fmt(nca.afcDevices)} indent={1} />
                  <StatRow label="Total Non-Current Assets" value={fmt(nca.total)} bold border />
                  <StatRow label="TOTAL ASSETS" value={fmt(Number(bs.totalAssets))} bold border highlight color={P} />
                </div>

                {/* Liabilities + Equity */}
                <div>
                  <SectionHeader>Liabilities</SectionHeader>
                  <p className="text-xs font-bold text-gray-500 mb-2">Current Liabilities</p>
                  <StatRow label="Trade creditors" value={fmt(cl.tradeCreditors)} indent={1} />
                  <StatRow label="Tax payable" value={fmt(cl.taxPayable)} indent={1} />
                  <StatRow label="UIF payable" value={fmt(cl.uifPayable)} indent={1} />
                  <StatRow label="Total Current Liabilities" value={fmt(cl.total)} bold border />
                  <p className="text-xs font-bold text-gray-500 mb-2 mt-4">Non-Current Liabilities</p>
                  <StatRow label="Vehicle loan — FNB" value={fmt(ncl.vehicleLoan)} indent={1} />
                  <StatRow label="Total Non-Current Liabilities" value={fmt(ncl.total)} bold border />
                  <StatRow label="TOTAL LIABILITIES" value={fmt(Number(bs.totalLiabilities))} bold border highlight color={RED} />

                  <SectionHeader>Equity</SectionHeader>
                  <StatRow label="Opening capital" value={fmt(eq.openingCapital)} indent={1} />
                  <StatRow label="Retained earnings" value={fmt(eq.retainedEarnings)} indent={1} />
                  <StatRow label="Current year profit" value={fmt(eq.currentYearProfit)} indent={1} />
                  <StatRow label="Drawings" value={`(${fmt(eq.drawings, true)})`} indent={1} />
                  <StatRow label="TOTAL EQUITY" value={fmt(eq.total)} bold border highlight color={P} />
                  <StatRow label="TOTAL LIABILITIES & EQUITY" value={fmt(Number(bs.liabilitiesAndEquity))} bold border color={P} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ CASH FLOW ═══════════════════════════════════════════════════════ */}
        {screen === "cashflow" && cf && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
              <div>
                <p className="text-xl font-black text-gray-900">Statement of Cash Flows</p>
                <p className="text-xs text-gray-500 mt-0.5">VMS / Vink Taxi Operations — {cf.periodStart} to {cf.periodEnd}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-xl text-sm font-black ${cf.netChangeInCash >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                Net cash {cf.netChangeInCash >= 0 ? "inflow" : "outflow"} {fmt(cf.netChangeInCash)}
              </div>
            </div>

            <StatRow label="Opening Cash Balance" value={fmt(cf.openingCashBalance)} bold />

            <SectionHeader>Operating Activities</SectionHeader>
            <StatRow label="Cash received from card fares (AFC)" value={fmt(cf.cashFromFaresCard)} indent={1} color={GREEN} />
            <StatRow label="Cash received from cash fares" value={fmt(cf.cashFromFaresCash)} indent={1} color={GREEN} />
            {cf.cashPaidDrivers > 0 && <StatRow label="Cash paid to drivers (wages/target)" value={`(${fmt(cf.cashPaidDrivers)})`} indent={1} color={RED} />}
            <StatRow label="Cash paid for fuel" value={`(${fmt(cf.cashPaidFuel)})`} indent={1} color={RED} />
            {cf.cashPaidMaintenance > 0 && <StatRow label="Cash paid for maintenance" value={`(${fmt(cf.cashPaidMaintenance)})`} indent={1} color={RED} />}
            {cf.cashPaidLevy > 0 && <StatRow label="Cash paid — association levies" value={`(${fmt(cf.cashPaidLevy)})`} indent={1} color={RED} />}
            {cf.cashPaidInsurance > 0 && <StatRow label="Cash paid — insurance" value={`(${fmt(cf.cashPaidInsurance)})`} indent={1} color={RED} />}
            <StatRow label="Net Cash from Operating Activities" value={fmt(cf.netOperatingCashFlow)} bold border highlight color={cf.netOperatingCashFlow >= 0 ? GREEN : RED} />

            <SectionHeader>Investing Activities</SectionHeader>
            {cf.vehiclePurchases > 0 && <StatRow label="Purchase of vehicles" value={`(${fmt(cf.vehiclePurchases)})`} indent={1} color={RED} />}
            {cf.vehicleProceeds > 0 && <StatRow label="Proceeds from vehicle sale" value={fmt(cf.vehicleProceeds)} indent={1} color={GREEN} />}
            {cf.afcDevicePurchases > 0 && <StatRow label="Purchase of AFC devices" value={`(${fmt(cf.afcDevicePurchases)})`} indent={1} color={RED} />}
            {cf.vehiclePurchases === 0 && cf.vehicleProceeds === 0 && cf.afcDevicePurchases === 0 && <StatRow label="No investing activities this period" value="—" indent={1} />}
            <StatRow label="Net Cash from Investing Activities" value={fmt(cf.netInvestingCashFlow)} bold border highlight color={cf.netInvestingCashFlow >= 0 ? GREEN : RED} />

            <SectionHeader>Financing Activities</SectionHeader>
            {cf.loanDrawdowns > 0 && <StatRow label="Loan drawdowns received" value={fmt(cf.loanDrawdowns)} indent={1} color={GREEN} />}
            {cf.loanRepayments > 0 && <StatRow label="Loan repayments made" value={`(${fmt(cf.loanRepayments)})`} indent={1} color={RED} />}
            {cf.ownerDrawings > 0 && <StatRow label="Owner drawings" value={`(${fmt(cf.ownerDrawings)})`} indent={1} color={RED} />}
            {cf.ownerCapitalInjections > 0 && <StatRow label="Owner capital injections" value={fmt(cf.ownerCapitalInjections)} indent={1} color={GREEN} />}
            <StatRow label="Net Cash from Financing Activities" value={fmt(cf.netFinancingCashFlow)} bold border highlight color={cf.netFinancingCashFlow >= 0 ? GREEN : RED} />

            <StatRow label="Net Change in Cash" value={fmt(cf.netChangeInCash)} bold border />
            <StatRow label="Opening Cash Balance" value={fmt(cf.openingCashBalance)} />
            <StatRow label="CLOSING CASH BALANCE" value={fmt(cf.closingCashBalance)} bold border highlight color={P} />
          </div>
        )}

        {/* ══ JOURNAL / MANUAL ENTRIES ═════════════════════════════════════════ */}
        {screen === "journal" && (
          <div className="space-y-5">
            {/* Add entry */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-black text-gray-900 mb-4">Add Manual Entry</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" value={newEntry.date} onChange={e => setNewEntry(n => ({ ...n, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Account / Category</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" value={newEntry.category} onChange={e => setNewEntry(n => ({ ...n, category: e.target.value, account: e.target.options[e.target.selectedIndex].text }))}>
                    <option value="fuel">Fuel Cost</option>
                    <option value="vehicle_maintenance">Vehicle Maintenance</option>
                    <option value="driver_wages">Driver Wages</option>
                    <option value="insurance">Insurance</option>
                    <option value="association_levy">Association Levy</option>
                    <option value="depreciation">Vehicle Depreciation</option>
                    <option value="afc_rental">AFC Device Rental</option>
                    <option value="admin">Administration</option>
                    <option value="fare_card">Fare Revenue (Card)</option>
                    <option value="fare_cash">Fare Revenue (Cash)</option>
                    <option value="other_income">Other Income</option>
                    <option value="other_expense">Other Expense</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Description</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="e.g. BP garage fill-up, Shell N2" value={newEntry.description} onChange={e => setNewEntry(n => ({ ...n, description: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Debit (expense / asset)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="0.00" value={newEntry.debit} onChange={e => setNewEntry(n => ({ ...n, debit: e.target.value, credit: "" }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Credit (income / liability)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="0.00" value={newEntry.credit} onChange={e => setNewEntry(n => ({ ...n, credit: e.target.value, debit: "" }))} />
                </div>
              </div>
              <button onClick={addJournalEntry} disabled={!newEntry.description || (!newEntry.debit && !newEntry.credit)}
                className="mt-4 w-full py-3 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                {entryAdded ? <><CheckCircle className="w-4 h-4" />Entry Added!</> : <><Plus className="w-4 h-4" />Add to Journal</>}
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2">Card and cash fare entries are added automatically from the AFC app. Add fuel, maintenance, wages, and other items manually here.</p>
            </div>

            {/* Journal entries table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-black text-gray-900">Journal Entries — Business Account</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {["Date", "Account", "Description", "Debit", "Credit", "Source"].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold text-gray-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {journal.map((e: Record<string, unknown>, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{String(e.date)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{String(e.account)}</td>
                        <td className="px-4 py-3 text-gray-600">{String(e.description)}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: RED }}>{Number(e.debit) > 0 ? fmt(Number(e.debit)) : ""}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: GREEN }}>{Number(e.credit) > 0 ? fmt(Number(e.credit)) : ""}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${String(e.source) === "auto" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                            {String(e.source).toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
