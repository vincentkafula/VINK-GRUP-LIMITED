import { useMemo, useState } from "react";
import { X, ArrowLeftRight, RefreshCw, TriangleAlert } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";
import { useLiveRates, convertAt, formatRate, formatMoney, currencyName, PRIORITY } from "../../services/liveRates";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5C0A10";
const GOLD = "#C9A84C";

/** The currencies shown in the rate table, in this order, when the source has them. */
const TABLE_CODES = ["USD", "EUR", "GBP", "CNY", "ZMW", "BWP", "NAD", "MZN", "SZL", "LSL", "ZWG", "MWK", "AOA", "TZS"];
const MARKETS = [["South Africa", "ZAR"], ["United States", "USD"], ["Zambia", "ZMW"], ["China", "CNY"]];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);

export function ExchangeRatesViewer({ isOpen, onClose }: Props) {
  const { state, reload } = useLiveRates();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("ZMW");

  const codes = useMemo(() => {
    if (state.status !== "ready") return { popular: [] as string[], other: [] as string[] };
    const all = Object.keys(state.data.rates);
    const popular = PRIORITY.filter((c) => all.includes(c));
    const other = all.filter((c) => !popular.includes(c)).sort((a, b) => currencyName(a).localeCompare(currencyName(b)));
    return { popular, other };
  }, [state]);

  if (!isOpen) return null;

  const n = Number(amount.replace(/\s/g, "").replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 1e12;
  const rates = state.status === "ready" ? state.data.rates : null;
  const conv = rates && valid ? convertAt(rates, from, to, n) : null;
  const unit = rates ? convertAt(rates, from, to, 1) : null;

  const options = (
    <>
      <optgroup label="Popular">{codes.popular.map((c) => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}</optgroup>
      <optgroup label="All currencies">{codes.other.map((c) => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}</optgroup>
    </>
  );
  const selectCls = "w-full rounded-xl border border-line bg-surface text-fg px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--vk-gold)]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,#0F172A,${P})` }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>Cross-Border</span>
            <span aria-hidden="true" className="h-px w-14" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black mb-3" style={{ fontFamily: "'Fraunces', serif" }}>Exchange Rates</h1>
          <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
            Live market rates for the currencies our customers move between: the rand, the US dollar, the Zambian kwacha, the Chinese yuan and the rest of the region.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "var(--vk-warn-bg)", border: "1px solid color-mix(in srgb, #FDE68A var(--vk-wash), var(--vk-surface))" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--vk-warn)" }}>
            These are indicative market rates for information only. They are not a quote or an offer. VINK is not yet in full operation: VINK&apos;s own cross-border rates will be published here when we launch in June 2027, and no rate on this page is active for transacting today.
          </p>
        </section>

        {/* Converter */}
        <section aria-label="Currency converter" className="rounded-3xl border border-line bg-surface p-5 sm:p-7" style={{ boxShadow: "0 24px 48px -28px rgba(0,0,0,0.35)" }}>
          <h2 className="text-2xl font-black mb-1" style={{ color: "var(--vk-crimson-text)" }}>Currency converter</h2>
          <p className="text-fg-muted text-sm mb-6">Convert between any two of {state.status === "ready" ? Object.keys(state.data.rates).length : "more than 150"} currencies at today&apos;s market rate.</p>

          {state.status === "loading" && <div role="status" className="space-y-3" aria-label="Loading exchange rates">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-surface-2 animate-pulse" />)}</div>}

          {state.status === "error" && (
            <div role="alert" className="rounded-xl border border-line bg-surface-2 p-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg flex items-start gap-2"><TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{state.error}</p>
              <button onClick={reload} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: "var(--vk-brand)", color: "var(--vk-brand-fg)" }}><RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again</button>
            </div>)}

          {state.status === "ready" && (
            <>
              <label className="block mb-4 sm:max-w-xs"><span className="text-xs font-bold text-fg-muted uppercase tracking-wider">Amount</span>
                <input aria-label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={selectCls + " mt-1.5 text-lg"} placeholder="100" autoComplete="off" /></label>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] items-end">
                <label className="block"><span className="text-xs font-bold text-fg-muted uppercase tracking-wider">From</span>
                  <select aria-label="From currency" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls + " mt-1.5"}>{options}</select></label>
                <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap the two currencies" className="mx-auto rounded-full border border-line bg-surface-2 p-3 hover:bg-surface transition-colors"><ArrowLeftRight className="w-4 h-4 text-fg" aria-hidden="true" /></button>
                <label className="block"><span className="text-xs font-bold text-fg-muted uppercase tracking-wider">To</span>
                  <select aria-label="To currency" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls + " mt-1.5"}>{options}</select></label>
              </div>

              <div aria-live="polite" className="mt-6 rounded-2xl p-5 sm:p-6" style={{ background: "linear-gradient(160deg,#1A0D10,#0C0709)", border: "1px solid rgba(201,168,76,0.35)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                {!valid ? <p className="text-white/80 text-sm">Enter an amount from 0 upwards.</p>
                  : !conv ? <p className="text-white/80 text-sm">There is no rate for that pair.</p>
                  : (
                    <>
                      <p className="text-white/70 text-sm">{formatMoney(n, from)} =</p>
                      <p className="text-3xl sm:text-4xl font-black mt-1 text-white" style={{ fontFamily: "'Fraunces', serif" }}><span style={{ color: "#EBD592" }}>{formatMoney(conv.result, to)}</span></p>
                      {unit && <p className="text-white/65 text-sm mt-3">1 {from} = {formatRate(unit.rate)} {to} <span className="mx-1.5 opacity-50">·</span> 1 {to} = {formatRate(1 / unit.rate)} {from}</p>}
                    </>)}
              </div>

              <p className="text-xs text-fg-muted mt-4">
                {state.stale && <span className="font-semibold" style={{ color: "var(--vk-warn)" }}>The rate source is not answering right now, so these are the last rates we received. </span>}
                Rates by <a href={state.data.attributionUrl ?? "https://www.exchangerate-api.com"} target="_blank" rel="noopener noreferrer" className="underline font-semibold">{state.data.source ?? "ExchangeRate-API"}</a>
                {state.data.sourceUpdatedAt ? <>, last updated {when(state.data.sourceUpdatedAt)} (South African time)</> : null}. Market rates move through the day: these are reference rates, refreshed about once a day by the source.
              </p>
            </>)}
        </section>

        {/* Rate table */}
        {state.status === "ready" && (
          <section aria-label="Rates against the rand">
            <h2 className="text-2xl font-black mb-2" style={{ color: "var(--vk-crimson-text)" }}>Rates against the rand</h2>
            <p className="text-fg-muted text-sm leading-relaxed mb-5">What one South African rand buys, and what one unit of each currency costs in rand, for the currencies we expect to serve first.</p>
            <div className="bg-surface rounded-2xl border border-line overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Exchange rates against the South African rand</caption>
                <thead><tr className="text-left text-xs uppercase tracking-wider text-fg-muted border-b border-line">
                  <th scope="col" className="px-4 py-3 font-bold">Currency</th><th scope="col" className="px-4 py-3 font-bold text-right">1 ZAR =</th><th scope="col" className="px-4 py-3 font-bold text-right">1 unit = ZAR</th>
                </tr></thead>
                <tbody>
                  {TABLE_CODES.filter((c) => state.data.rates[c]).map((c) => (
                    <tr key={c} className="border-t border-line">
                      <th scope="row" className="px-4 py-3 text-left font-normal"><span className="font-semibold text-fg">{currencyName(c)}</span> <span className="ml-1.5 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--vk-ok-bg)", color: "var(--vk-crimson-text)" }}>{c}</span></th>
                      <td className="px-4 py-3 text-right font-mono text-fg">{formatRate(state.data.rates[c])} {c}</td>
                      <td className="px-4 py-3 text-right font-mono text-fg">{formatRate(1 / state.data.rates[c])} ZAR</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>)}

        <section className="bg-surface-2 rounded-2xl p-6 border border-line">
          <h2 className="text-lg font-black mb-3" style={{ color: "var(--vk-crimson-text)" }}>Why This Matters</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            Traditional cross-border transfers in the region are slow and expensive, often eating a meaningful cut of the amount sent. VINK&apos;s ambition is to make moving money across borders as simple as tapping your card at a taxi validator, with transparent, local-rate pricing between {MARKETS.map(([c]) => c).join(", ")} and the wider region once we launch.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
