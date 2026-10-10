import { useMemo, useState } from "react";
import { X, ArrowLeftRight, RefreshCw, TriangleAlert, Info } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";
import { useLiveRates, convertAt, formatRate, formatMoney, currencyName, PRIORITY } from "../../services/liveRates";
import { BRAND } from "../../brand";

interface Props { isOpen: boolean; onClose: () => void; }
const GOLD = BRAND.gold;
const GOLD_SOFT = "#EBD592";

/** The currencies shown in the rate table, in this order, when the source has them. */
const TABLE_CODES = ["USD", "EUR", "GBP", "CNY", "ZMW", "BWP", "NAD", "MZN", "SZL", "LSL", "ZWG", "MWK", "AOA", "TZS"];
/** The currencies in the live strip under the headline. */
const STRIP_CODES = ["USD", "EUR", "GBP", "CNY", "ZMW", "BWP"];
const MARKETS = ["South Africa", "United States", "Zambia", "China"];

/** Fine film grain, drawn in the browser (no image file), laid over the dark panels so they read as printed card stock and not flat colour. */
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
const symbolOf = (code: string) => {
  let sym = code;
  try { sym = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code; } catch { /* the code itself will do */ }
  return sym === "$" && code !== "USD" ? `${code[0]}$` : sym;          // N$, A$, C$: a bare "$" on another country's dollar would read as US dollars
};
/** Long symbols (MZN, ZWG) get smaller type so they sit inside their circle. */
const symbolSize = (sym: string) => (sym.length >= 3 ? 10 : sym.length === 2 ? 12.5 : 15);

function Grain({ opacity = 0.07 }: { opacity?: number }) {
  return <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity, mixBlendMode: "overlay" }} />;
}

export function ExchangeRatesViewer({ isOpen, onClose }: Props) {
  const { state, reload } = useLiveRates();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("ZMW");
  const [turns, setTurns] = useState(0);

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
  const fieldCls = "w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/30";
  const fieldStyle = { background: "rgba(0,0,0,0.38)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.35)", colorScheme: "dark" as const };
  const label = "text-[11px] font-bold uppercase tracking-[0.2em]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface/95 backdrop-blur border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden shrink-0 text-white" style={{ background: "radial-gradient(900px 420px at 85% -10%, rgba(201,168,76,0.22), transparent 60%), radial-gradient(800px 500px at 0% 100%, rgba(139,0,0,0.55), transparent 62%), linear-gradient(135deg,#0B0F1A 0%,#1A0D12 55%,#3A0A10 100%)" }}>
        <Grain opacity={0.09} />
        {/* concentric arcs and oversized currency glyphs: decoration only */}
        <svg aria-hidden="true" className="absolute -right-24 -top-24 w-[560px] h-[560px] pointer-events-none" viewBox="0 0 560 560" fill="none">
          {[120, 180, 240, 300].map((r, i) => <circle key={r} cx="280" cy="280" r={r} stroke={GOLD} strokeOpacity={0.22 - i * 0.04} strokeWidth="1" strokeDasharray={i % 2 ? "2 7" : undefined} />)}
        </svg>
        {[["R", "left-[4%] top-[14%] text-[9rem] -rotate-6"], ["$", "left-[44%] top-[2%] text-[7rem] rotate-6"], ["¥", "right-[10%] bottom-[18%] text-[8rem] -rotate-3"], ["€", "left-[28%] bottom-[2%] text-[6rem] rotate-3"]].map(([g, pos]) => (
          <span key={g} aria-hidden="true" className={`absolute select-none pointer-events-none leading-none ${pos}`} style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: GOLD, opacity: 0.07 }}>{g}</span>))}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${GOLD},transparent)`, opacity: 0.7 }} />

        <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-12 sm:pt-20">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>Cross-Border</span>
            <span aria-hidden="true" className="h-px w-14 sm:w-20" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
          </div>
          <h1 className="text-[2.75rem] sm:text-6xl leading-[1.02] tracking-[-0.02em] mb-5" style={{ fontFamily: "'Fraunces', serif", fontWeight: 650 }}>
            Exchange <span style={{ backgroundImage: "linear-gradient(180deg,#F6E3A6 0%,#E0C068 45%,#B88A20 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Rates</span>
          </h1>
          <p className="text-white/80 text-lg sm:text-xl max-w-2xl leading-[1.6]">
            Live market rates for the currencies our customers move between: the rand, the US dollar, the Zambian kwacha, the Chinese yuan and the rest of the region.
          </p>

          {state.status === "ready" && (
            <ul aria-label="Today's rates against the rand" className="mt-9 flex flex-wrap gap-2.5 list-none p-0">
              {STRIP_CODES.filter((c) => state.data.rates[c]).map((c) => (
                <li key={c} className="inline-flex items-center gap-2.5 rounded-full pl-1.5 pr-4 py-1.5 text-sm" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))", border: "1px solid rgba(201,168,76,0.35)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)" }}>
                  <span aria-hidden="true" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[13px] font-bold" style={{ background: "linear-gradient(145deg,#2A1A1E,#0B0709)", border: `1px solid ${GOLD}`, color: GOLD_SOFT, fontSize: symbolSize(symbolOf(c)), letterSpacing: "-0.02em" }}>{symbolOf(c)}</span>
                  <span className="font-bold tracking-wide">{c}</span>
                  <span className="font-mono text-white/85">{formatMoney(1 / state.data.rates[c], "ZAR")}</span>
                </li>))}
            </ul>)}
        </div>
      </header>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 sm:py-12 space-y-12">

        <section className="flex items-start gap-3 rounded-2xl px-5 py-4" style={{ background: "var(--vk-surface-2, #f6f3ee)", border: "1px solid color-mix(in srgb, var(--vk-gold) 40%, var(--vk-line))", borderLeft: `3px solid ${GOLD}` }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-gold-text" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-fg">
            These are indicative market rates for information only. They are not a quote or an offer. VINK is not yet in full operation: VINK&apos;s own cross-border rates will be published here when we launch in June 2027, and no rate on this page is active for transacting today.
          </p>
        </section>

        {/* ── Converter ──────────────────────────────────────────────────── */}
        <section aria-label="Currency converter" className="relative overflow-hidden rounded-[28px] text-white p-6 sm:p-9"
          style={{ background: "radial-gradient(520px 260px at 100% 0%, rgba(201,168,76,0.20), transparent 62%), radial-gradient(480px 300px at 0% 100%, rgba(139,0,0,0.45), transparent 65%), linear-gradient(160deg,#241216 0%,#140B0E 55%,#0B0709 100%)", border: "1px solid rgba(201,168,76,0.4)", boxShadow: "0 40px 70px -34px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.10)" }}>
          <Grain opacity={0.08} />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>Currency converter</h2>
              <span aria-hidden="true" className="h-px flex-1 max-w-24" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
            </div>
            <p className="text-white/70 text-sm sm:text-base mb-8">Convert between any two of {state.status === "ready" ? Object.keys(state.data.rates).length : "more than 150"} currencies at today&apos;s market rate.</p>

            {state.status === "loading" && <div role="status" className="space-y-3" aria-label="Loading exchange rates">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />)}</div>}

            {state.status === "error" && (
              <div role="alert" className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <p className="text-sm flex items-start gap-2"><TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD_SOFT }} aria-hidden="true" />{state.error}</p>
                <button onClick={reload} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: `linear-gradient(180deg,#E0C068,#B88A20)`, color: "#14161d" }}><RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again</button>
              </div>)}

            {state.status === "ready" && (
              <>
                <label className="block mb-5 sm:max-w-xs"><span className={label} style={{ color: GOLD_SOFT }}>Amount</span>
                  <input aria-label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldCls + " mt-2 text-2xl font-bold"} style={fieldStyle} placeholder="100" autoComplete="off" /></label>

                <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr] items-end">
                  <label className="block"><span className={label} style={{ color: GOLD_SOFT }}>From</span>
                    <select aria-label="From currency" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls + " mt-2"} style={fieldStyle}>{options}</select></label>
                  <button type="button" onClick={() => { setFrom(to); setTo(from); setTurns((t) => t + 1); }} aria-label="Swap the two currencies"
                    className="mx-auto w-12 h-12 rounded-full inline-flex items-center justify-center transition-transform duration-500 hover:scale-105 motion-reduce:transition-none"
                    style={{ background: "linear-gradient(145deg,#F2D58A,#B88A20)", boxShadow: "0 10px 22px -8px rgba(201,168,76,0.7), inset 0 1px 0 rgba(255,255,255,0.5)", transform: `rotate(${turns * 180}deg)` }}>
                    <ArrowLeftRight className="w-5 h-5 text-[#14161d]" aria-hidden="true" />
                  </button>
                  <label className="block"><span className={label} style={{ color: GOLD_SOFT }}>To</span>
                    <select aria-label="To currency" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls + " mt-2"} style={fieldStyle}>{options}</select></label>
                </div>

                <div aria-live="polite" className="relative mt-8 rounded-2xl p-6 sm:p-8 overflow-hidden" style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))", border: "1px solid rgba(201,168,76,0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}>
                  {!valid ? <p className="text-white/80 text-sm">Enter an amount from 0 upwards.</p>
                    : !conv ? <p className="text-white/80 text-sm">There is no rate for that pair.</p>
                    : (
                      <>
                        <p className="text-white/65 text-sm sm:text-base">{formatMoney(n, from)} =</p>
                        <p className="mt-2 text-4xl sm:text-6xl leading-[1.05] tracking-[-0.02em] break-words" style={{ fontFamily: "'Fraunces', serif", fontWeight: 650 }}>
                          <span style={{ backgroundImage: "linear-gradient(180deg,#F6E3A6 0%,#E0C068 50%,#B88A20 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{formatMoney(conv.result, to)}</span>
                        </p>
                        {unit && (
                          <div className="mt-5 flex flex-wrap gap-2 text-xs sm:text-sm">
                            <span className="rounded-full px-3.5 py-1.5 font-mono" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)" }}>1 {from} = {formatRate(unit.rate)} {to}</span>
                            <span className="rounded-full px-3.5 py-1.5 font-mono text-white/75" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)" }}>1 {to} = {formatRate(1 / unit.rate)} {from}</span>
                          </div>)}
                      </>)}
                </div>

                <p className="text-xs sm:text-[13px] text-white/60 mt-5 leading-relaxed">
                  {state.stale && <span className="font-semibold" style={{ color: GOLD_SOFT }}>The rate source is not answering right now, so these are the last rates we received. </span>}
                  Rates by <a href={state.data.attributionUrl ?? "https://www.exchangerate-api.com"} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-white/85 hover:text-white">{state.data.source ?? "ExchangeRate-API"}</a>
                  {state.data.sourceUpdatedAt ? <>, last updated {when(state.data.sourceUpdatedAt)} (South African time)</> : null}. Market rates move through the day: these are reference rates, refreshed about once a day by the source.
                </p>
              </>)}
          </div>
        </section>

        {/* ── Rate table ─────────────────────────────────────────────────── */}
        {state.status === "ready" && (
          <section aria-label="Rates against the rand">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-semibold tracking-tight text-fg" style={{ fontFamily: "'Fraunces', serif" }}>Rates against the rand</h2>
              <span aria-hidden="true" className="h-px flex-1 max-w-24" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
            </div>
            <p className="text-fg-muted text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">What one South African rand buys, and what one unit of each currency costs in rand, for the currencies we expect to serve first.</p>
            <div className="rounded-3xl border overflow-hidden overflow-x-auto bg-surface" style={{ borderColor: "color-mix(in srgb, var(--vk-gold) 35%, var(--vk-line))", boxShadow: "0 28px 50px -34px rgba(0,0,0,0.45)" }}>
              <table className="w-full text-sm">
                <caption className="sr-only">Exchange rates against the South African rand</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg,#1A0D12,#2E0B10)" }}>
                    <th scope="col" className="px-5 py-4 font-bold" style={{ color: GOLD_SOFT }}>Currency</th>
                    <th scope="col" className="px-5 py-4 font-bold text-right" style={{ color: GOLD_SOFT }}>1 ZAR =</th>
                    <th scope="col" className="px-5 py-4 font-bold text-right" style={{ color: GOLD_SOFT }}>1 unit = ZAR</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_CODES.filter((c) => state.data.rates[c]).map((c, i) => (
                    <tr key={c} className="border-t border-line transition-colors hover:bg-[color-mix(in_srgb,var(--vk-gold)_9%,transparent)]" style={i % 2 ? { background: "color-mix(in srgb, var(--vk-gold) 4%, transparent)" } : undefined}>
                      <th scope="row" className="px-5 py-3.5 text-left font-normal">
                        <span className="inline-flex items-center gap-3">
                          <span aria-hidden="true" className="w-9 h-9 rounded-full inline-flex items-center justify-center font-bold shrink-0" style={{ background: "linear-gradient(145deg,#2A1A1E,#0B0709)", border: `1px solid ${GOLD}`, color: GOLD_SOFT, boxShadow: "0 6px 14px -6px rgba(0,0,0,0.6)", fontSize: symbolSize(symbolOf(c)), letterSpacing: "-0.02em" }}>{symbolOf(c)}</span>
                          <span className="font-semibold text-fg">{currencyName(c)}</span>
                          <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md font-mono" style={{ background: "color-mix(in srgb, var(--vk-gold) 18%, transparent)", color: "var(--vk-gold-text, #8a6a12)" }}>{c}</span>
                        </span>
                      </th>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg">{formatRate(state.data.rates[c])} {c}</td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg">{formatRate(1 / state.data.rates[c])} ZAR</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>)}

        {/* ── Why this matters ───────────────────────────────────────────── */}
        <section className="relative rounded-3xl p-7 sm:p-9 border border-line bg-surface-2 overflow-hidden">
          <div aria-hidden="true" className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full" style={{ background: `linear-gradient(180deg,${GOLD},transparent)` }} />
          <h2 className="text-2xl font-semibold tracking-tight mb-3 text-fg" style={{ fontFamily: "'Fraunces', serif" }}>Why this matters</h2>
          <p className="text-fg-muted text-base leading-[1.75]">
            Traditional cross-border transfers in the region are slow and expensive, often eating a meaningful cut of the amount sent. VINK&apos;s ambition is to make moving money across borders as simple as tapping your card at a taxi validator, with transparent, local-rate pricing between {MARKETS.join(", ")} and the wider region once we launch.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
