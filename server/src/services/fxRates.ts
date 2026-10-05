import type { Db } from "../portal/driverRoutes.js";

/**
 * Automatic exchange rates for cross-border quotes.
 *
 * Sources (all free, all give a daily reference rate, not a dealing rate; the corridor's margin has to cover the difference):
 *   1. ExchangeRate-API "open access"  https://open.er-api.com/v6/latest/<from>   no key. Updated once a day. Their terms ask for attribution (shown on the quote).
 *      With FX_PROVIDER_KEY set, the keyed endpoint is used instead (same company, higher limits, same data).
 *   2. fawazahmed0 currency-api via jsDelivr / Cloudflare Pages   no key. Updated once a day.
 *
 * Safety rules, so a bad feed cannot misprice a transfer:
 *   - when two sources answer and differ by more than MAX_DIVERGENCE, nothing is changed (they disagree; a person decides);
 *   - a new rate more than MAX_JUMP away from the one in use is not applied automatically;
 *   - a rate a person set by hand is left alone for 24 hours;
 *   - the rate carries the source and the source's own timestamp, and quotes refuse a rate whose source data is too old.
 */
export const MAX_DIVERGENCE = 0.05, MAX_JUMP = 0.15, MANUAL_PIN_MS = 24 * 3600_000;
export const AUTO_FETCHED_MAX_AGE_MS = 3 * 3600_000, AUTO_SOURCE_MAX_AGE_MS = 36 * 3600_000, MANUAL_MAX_AGE_MS = 3600_000;

export interface RateReading { rate: number; source: string; sourceAt: Date }
export type FetchFn = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export interface Provider { name: string; read(from: string, to: string, f: FetchFn): Promise<RateReading> }

const get = async (f: FetchFn, url: string): Promise<Record<string, any>> => {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await f(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
};
const positive = (n: unknown): number => { const x = Number(n); if (!(x > 0) || !Number.isFinite(x) || x > 1e6) throw new Error("not a usable rate"); return x; };

export const exchangeRateApiOpen: Provider = {
  name: "exchangerate-api.com",
  async read(from, to, f) {
    const j = await get(f, `https://open.er-api.com/v6/latest/${from}`);
    if (j.result !== "success") throw new Error("provider reported failure");
    return { rate: positive(j.rates?.[to]), source: this.name, sourceAt: new Date(Number(j.time_last_update_unix) * 1000) };
  },
};
export const exchangeRateApiKeyed = (key: string): Provider => ({
  name: "exchangerate-api.com",
  async read(from, to, f) {
    const j = await get(f, `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/pair/${from}/${to}`);
    if (j.result !== "success") throw new Error("provider reported failure");
    return { rate: positive(j.conversion_rate), source: this.name, sourceAt: new Date(Number(j.time_last_update_unix) * 1000) };
  },
});
export const currencyApi: Provider = {
  name: "currency-api (fawazahmed0)",
  async read(from, to, f) {
    const path = `v1/currencies/${from.toLowerCase()}.json`;
    let j: Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    try { j = await get(f, `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/${path}`); } catch { j = await get(f, `https://latest.currency-api.pages.dev/${path}`); }
    return { rate: positive(j[from.toLowerCase()]?.[to.toLowerCase()]), source: this.name, sourceAt: new Date(`${String(j.date)}T00:00:00Z`) };
  },
};
export const defaultProviders = (key?: string): Provider[] => [key ? exchangeRateApiKeyed(key) : exchangeRateApiOpen, currencyApi];

export type Outcome = { pair: string; status: "updated" | "kept_manual" | "rejected" | "failed"; reason?: string; rate?: number; source?: string };

/** Asks the sources, applies the safety rules, and returns the reading to store (or why not). */
export async function pickRate(from: string, to: string, f: FetchFn, providers: Provider[], previous: number | null): Promise<{ ok: true; reading: RateReading; checkedAgainst: string | null } | { ok: false; status: "rejected" | "failed"; reason: string }> {
  const readings: RateReading[] = [], errors: string[] = [];
  for (const p of providers) { try { readings.push(await p.read(from, to, f)); } catch (e) { errors.push(`${p.name}: ${e instanceof Error ? e.message : "failed"}`); } }
  if (readings.length === 0) return { ok: false, status: "failed", reason: `No source answered (${errors.join("; ")})` };
  const first = readings[0];
  if (readings.length > 1) {
    const other = readings[1], gap = Math.abs(first.rate - other.rate) / Math.max(first.rate, other.rate);
    if (gap > MAX_DIVERGENCE) return { ok: false, status: "rejected", reason: `The sources disagree by ${(gap * 100).toFixed(1)}% (${first.source} ${first.rate}, ${other.source} ${other.rate}). A person has to set the rate.` };
  }
  if (previous !== null) {
    const jump = Math.abs(first.rate - previous) / previous;
    if (jump > MAX_JUMP) return { ok: false, status: "rejected", reason: `The new rate ${first.rate} is ${(jump * 100).toFixed(1)}% away from the one in use (${previous}). A person has to confirm it.` };
  }
  return { ok: true, reading: first, checkedAgainst: readings[1]?.source ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> };

/** Refreshes the given pairs ("ZAR-ZMW" ...). A rate a person set by hand in the last 24 hours is kept. Never throws: a failed refresh leaves the old rate in place. */
export async function refreshRates(database: Db, o: { pairs: string[]; fetchFn?: FetchFn; providers?: Provider[]; now?: Date }): Promise<Outcome[]> {
  const db = database as unknown as Loose, now = o.now ?? new Date(), f = o.fetchFn ?? (fetch as unknown as FetchFn), providers = o.providers ?? defaultProviders(process.env.FX_PROVIDER_KEY?.trim() || undefined);
  const out: Outcome[] = [];
  for (const pair of o.pairs) {
    const [from, to] = pair.split("-");
    try {
      const cur = (await db.query(`SELECT rate, auto, set_at FROM fx_rates WHERE pair = $1`, [pair])).rows[0];
      if (cur && !cur.auto && now.getTime() - new Date(cur.set_at).getTime() < MANUAL_PIN_MS) { out.push({ pair, status: "kept_manual", reason: "A rate set by hand is kept for 24 hours." }); continue; }
      const pick = await pickRate(from, to, f, providers, cur ? Number(cur.rate) : null);
      if (!pick.ok) { out.push({ pair, status: pick.status, reason: pick.reason }); continue; }
      await db.query(`INSERT INTO fx_rates (pair, rate, set_by, set_at, source, source_at, auto) VALUES ($1,$2,NULL,$3,$4,$5,true)
                      ON CONFLICT (pair) DO UPDATE SET rate = EXCLUDED.rate, set_by = NULL, set_at = EXCLUDED.set_at, source = EXCLUDED.source, source_at = EXCLUDED.source_at, auto = true`,
        [pair, pick.reading.rate, now, pick.reading.source, pick.reading.sourceAt]);
      out.push({ pair, status: "updated", rate: pick.reading.rate, source: pick.reading.source });
    } catch (e) { out.push({ pair, status: "failed", reason: e instanceof Error ? e.message : "failed" }); }
  }
  return out;
}
