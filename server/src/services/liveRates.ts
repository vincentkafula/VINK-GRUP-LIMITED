import type { FetchFn } from "./fxRates.js";

/**
 * Live market exchange rates for DISPLAY (the public Exchange Rates page and the price converter). One table of every currency against the South African rand.
 *
 * These are mid-market reference rates, not a dealing rate and not an offer: nothing here is a price VINK will transact at. Cross-border quotes use their own,
 * stricter rate handling (see fxRates.ts).
 *
 * Sources, tried in this order until one answers with a usable table:
 *   1. ExchangeRate-API  https://open.er-api.com/v6/latest/ZAR  (no key; with FX_PROVIDER_KEY the keyed endpoint of the same company is used)
 *      Their terms for the open endpoint ask for attribution, so the response names the source and its link, and the page shows it.
 *   2. currency-api (fawazahmed0) through jsDelivr and Cloudflare Pages  (no key)
 * A table is accepted only if every rate is a finite positive number, only real currency codes (ISO 4217) are kept, and the US dollar and the rand itself are present.
 * The answer is cached for an hour; if every source is down the last good table is served, marked stale, rather than nothing.
 */
export interface LiveRates {
  base: "ZAR";
  /** 1 ZAR = rates[code] units of that currency. */
  rates: Record<string, number>;
  source: string;
  attributionUrl: string;
  /** When the source says its figures were last updated (they move about once a day), if it says. */
  sourceUpdatedAt: string | null;
  fetchedAt: string;
}

const ISO = (() => { try { return new Set<string>((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency")); } catch { return null; } })();
const isCurrency = (code: string) => /^[A-Z]{3}$/.test(code) && (ISO ? ISO.has(code) : true);

/** Keeps only usable rates; throws if the table is not trustworthy. */
export function cleanRates(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const code = k.toUpperCase(), n = Number(v);
    if (isCurrency(code) && Number.isFinite(n) && n > 0 && n < 1e9) out[code] = n;
  }
  out.ZAR = 1;
  if (!out.USD || Object.keys(out).length < 20) throw new Error("the rate table is incomplete");
  return out;
}

const getJson = async (f: FetchFn, url: string): Promise<Record<string, unknown>> => {
  const r = await f(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
};

type Source = (f: FetchFn, key?: string) => Promise<Omit<LiveRates, "fetchedAt">>;

const exchangeRateApi: Source = async (f, key) => {
  const j = await getJson(f, key ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/ZAR` : "https://open.er-api.com/v6/latest/ZAR");
  if (j.result !== "success") throw new Error("the provider reported a failure");
  const unix = Number(j.time_last_update_unix);
  return { base: "ZAR", rates: cleanRates((j.rates ?? j.conversion_rates) as Record<string, unknown>), source: "ExchangeRate-API", attributionUrl: "https://www.exchangerate-api.com", sourceUpdatedAt: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : null };
};

const currencyApi: Source = async (f) => {
  const path = "v1/currencies/zar.json";
  let j: Record<string, unknown>;
  try { j = await getJson(f, `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/${path}`); } catch { j = await getJson(f, `https://latest.currency-api.pages.dev/${path}`); }
  const d = new Date(`${String(j.date)}T00:00:00Z`);
  return { base: "ZAR", rates: cleanRates(j.zar as Record<string, unknown>), source: "currency-api", attributionUrl: "https://github.com/fawazahmed0/exchange-api", sourceUpdatedAt: Number.isNaN(d.getTime()) ? null : d.toISOString() };
};

/** Asks the sources in order and returns the first usable table. */
export async function fetchLiveRates(f: FetchFn, o: { key?: string; now?: () => Date } = {}): Promise<LiveRates> {
  const errors: string[] = [];
  for (const [name, source] of [["ExchangeRate-API", exchangeRateApi], ["currency-api", currencyApi]] as const) {
    try { return { ...(await source(f, o.key)), fetchedAt: (o.now ?? (() => new Date()))().toISOString() }; }
    catch (e) { errors.push(`${name}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  throw new Error(`No rate source answered (${errors.join("; ")})`);
}

/** The table, cached for an hour, with the last good one kept for when the sources are down. */
export function createRatesCache(o: { fetchFn: FetchFn; key?: string; ttlMs?: number; now?: () => Date; staleAfterMs?: number }) {
  const ttl = o.ttlMs ?? 3600_000, now = o.now ?? (() => new Date());
  let last: { data: LiveRates; at: number } | null = null;
  let inflight: Promise<LiveRates> | null = null;
  return {
    async get(): Promise<{ data: LiveRates; cached: boolean; stale: boolean }> {
      const t = now().getTime();
      if (last && t - last.at < ttl) return { data: last.data, cached: true, stale: false };
      try {
        inflight ??= fetchLiveRates(o.fetchFn, { key: o.key, now }).finally(() => { inflight = null; });   // one request to the sources however many visitors arrive at once
        const data = await inflight;
        last = { data, at: t };
        return { data, cached: false, stale: false };
      } catch (e) {
        if (last) return { data: last.data, cached: true, stale: true };
        throw e;
      }
    },
  };
}

/** Converts using the rand-based table: 1 ZAR = rates[X], so from -> to is rates[to] / rates[from]. */
export function convert(rates: Record<string, number>, from: string, to: string, amount: number): { rate: number; result: number } | null {
  const a = rates[from], b = rates[to];
  if (!a || !b || !Number.isFinite(amount)) return null;
  const rate = b / a;
  return { rate, result: amount * rate };
}
