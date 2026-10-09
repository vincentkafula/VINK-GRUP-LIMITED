import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./config";

/** Live market rates from the server (see server/src/services/liveRates.ts). 1 ZAR = rates[code] units of that currency. */
export interface LiveRates {
  base: "ZAR";
  rates: Record<string, number>;
  source: string;
  attributionUrl: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
}
export type RatesState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: LiveRates; stale: boolean };

export function useLiveRates(): { state: RatesState; reload: () => void } {
  const [state, setState] = useState<RatesState>({ status: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fetch(`${API_BASE}/api/currency/rates`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!live) return;
        if (ok && body.success && body.data?.rates) setState({ status: "ready", data: body.data as LiveRates, stale: Boolean(body.stale) });
        else setState({ status: "error", error: body.error ?? "Exchange rates are temporarily unavailable." });
      })
      .catch(() => { if (live) setState({ status: "error", error: "We could not reach the server. Please check your connection and try again." }); });
    return () => { live = false; };
  }, [n]);
  return { state, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** from -> to at these rates, or null when either currency has no rate. */
export function convertAt(rates: Record<string, number>, from: string, to: string, amount: number): { rate: number; result: number } | null {
  const a = rates[from], b = rates[to];
  if (!a || !b || !Number.isFinite(amount)) return null;
  return { rate: b / a, result: (amount * b) / a };
}

/** A rate with sensible precision: 18.1234, 0.060185, 1,204.99. Numbers follow the visitor's own language settings. */
export function formatRate(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return "n/a";
  if (r >= 1000) return r.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (r >= 1) return r.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return r.toLocaleString(undefined, { minimumSignificantDigits: 4, maximumSignificantDigits: 5 });
}

export function formatMoney(amount: number, code: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "code" }).format(amount); }
  catch { return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`; }
}

const names = (() => { try { return new Intl.DisplayNames(["en"], { type: "currency" }); } catch { return null; } })();
export const currencyName = (code: string): string => { try { return names?.of(code) ?? code; } catch { return code; } };

/** The currencies VINK's customers use most, shown first. */
export const PRIORITY = ["ZAR", "USD", "ZMW", "CNY", "EUR", "GBP", "BWP", "NAD", "MZN", "SZL", "LSL", "ZWG", "MWK", "AOA", "TZS"];
