import { describe, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { cleanRates, fetchLiveRates, createRatesCache, convert } from "./liveRates.js";
import { createRatesRouter } from "../routes/ratesRouter.js";
import type { FetchFn } from "./fxRates.js";

const CODES = ["USD", "EUR", "GBP", "ZMW", "CNY", "BWP", "NAD", "MZN", "SZL", "LSL", "MWK", "KES", "NGN", "GHS", "TZS", "UGX", "AED", "AUD", "CAD", "JPY", "INR", "BRL"];
const table = (extra: Record<string, number> = {}) => ({ ...Object.fromEntries(CODES.map((c, i) => [c, 0.05 + i * 0.37])), ZAR: 1, ...extra });
const ok = (body: unknown): ReturnType<FetchFn> => Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = (status = 500): ReturnType<FetchFn> => Promise.resolve({ ok: false, status, json: async () => ({}) });
const erApi = (rates: Record<string, number> = table()) => ({ result: "success", time_last_update_unix: 1791158551, rates });
const faw = (rates: Record<string, number> = table()) => ({ date: "2026-10-09", zar: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k.toLowerCase(), v])) });

describe("cleanRates", () => {
  it("keeps real currencies with usable rates, drops the rest, and always has the rand at 1", () => {
    const r = cleanRates({ ...table(), btc: 0.0000002, XXX: 5, usd: 0.055, BAD: -1, NAN: "x", ZMW: 0 });
    expect(r.USD).toBeCloseTo(0.055 > 0 ? 0.055 : 0, 5);                                   // lower-case codes are read as upper case
    expect(r.ZAR).toBe(1); expect(r.BTC).toBeUndefined(); expect(r.BAD).toBeUndefined(); expect(r.NAN).toBeUndefined();
    expect(r.ZMW).toBeUndefined();                                                          // a zero rate is not a rate
  });
  it("refuses a table that is too small or has no US dollar", () => {
    expect(() => cleanRates({ USD: 0.055, EUR: 0.05 })).toThrow(/incomplete/);
    const noUsd = table(); delete (noUsd as Record<string, number>).USD;
    expect(() => cleanRates(noUsd)).toThrow(/incomplete/);
  });
});

describe("fetchLiveRates", () => {
  it("reads ExchangeRate-API first, with the source, its link and its own update time", async () => {
    const f = vi.fn((url: string) => ok(erApi())) as unknown as FetchFn;
    const r = await fetchLiveRates(f, { now: () => new Date("2026-10-09T10:00:00Z") });
    expect(r).toMatchObject({ base: "ZAR", source: "ExchangeRate-API", attributionUrl: "https://www.exchangerate-api.com", sourceUpdatedAt: new Date(1791158551 * 1000).toISOString(), fetchedAt: "2026-10-09T10:00:00.000Z" });
    expect(r.rates.ZAR).toBe(1); expect(Object.keys(r.rates).length).toBeGreaterThan(20);
    expect((f as unknown as { mock: { calls: string[][] } }).mock.calls).toHaveLength(1);       // only one source asked when the first answers
  });

  it("uses the company's keyed endpoint when a key is set", async () => {
    const f = vi.fn((url: string) => ok({ result: "success", time_last_update_unix: 1791158551, conversion_rates: table() })) as unknown as FetchFn;
    const r = await fetchLiveRates(f, { key: "K 1/2" });
    expect((f as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toBe("https://v6.exchangerate-api.com/v6/K%201%2F2/latest/ZAR");
    expect(r.rates.USD).toBeGreaterThan(0);
  });

  it("falls back to the second source when the first fails or sends rubbish", async () => {
    for (const first of [() => fail(503), () => ok({ result: "error" }), () => ok(erApi({ USD: 0.05, ZAR: 1 })), () => Promise.reject(new Error("network"))]) {
      const f = ((url: string) => (url.includes("open.er-api") ? first() : ok(faw()))) as FetchFn;
      const r = await fetchLiveRates(f);
      expect(r.source).toBe("currency-api"); expect(r.sourceUpdatedAt).toBe("2026-10-09T00:00:00.000Z"); expect(r.rates.ZMW).toBeGreaterThan(0);
    }
    const mirror = ((url: string) => (url.includes("open.er-api") ? fail() : url.includes("jsdelivr") ? fail() : ok(faw()))) as FetchFn;
    expect((await fetchLiveRates(mirror)).source).toBe("currency-api");                      // the second host of the second source
  });

  it("throws a clear error when no source answers", async () => {
    await expect(fetchLiveRates((() => fail(500)) as FetchFn)).rejects.toThrow(/No rate source answered/);
  });
});

describe("createRatesCache", () => {
  it("fetches once an hour however many ask, and fetches again after the hour", async () => {
    let t = new Date("2026-10-09T10:00:00Z").getTime(), calls = 0;
    const f = ((url: string) => { calls++; return ok(erApi()); }) as FetchFn;
    const cache = createRatesCache({ fetchFn: f, now: () => new Date(t) });
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(calls).toBe(1); expect(a.cached).toBe(false); expect(b.data).toEqual(a.data);       // simultaneous visitors share one request
    expect(await cache.get()).toMatchObject({ cached: true, stale: false }); expect(calls).toBe(1);
    t += 61 * 60_000; expect(await cache.get()).toMatchObject({ cached: false }); expect(calls).toBe(2);
  });

  it("serves the last good table marked stale when every source is down, and errors only if it never had one", async () => {
    let t = new Date("2026-10-09T10:00:00Z").getTime(), down = false;
    const f = ((url: string) => (down ? fail(500) : ok(erApi()))) as FetchFn;
    const cache = createRatesCache({ fetchFn: f, now: () => new Date(t) });
    await cache.get(); down = true; t += 2 * 3600_000;
    expect(await cache.get()).toMatchObject({ cached: true, stale: true });
    const never = createRatesCache({ fetchFn: (() => fail(500)) as FetchFn });
    await expect(never.get()).rejects.toThrow();
  });
});

describe("convert", () => {
  it("converts through the rand: 1 ZAR = rates[X], so from -> to is rates[to] / rates[from]", () => {
    const rates = { ZAR: 1, USD: 0.05, ZMW: 1.5, EUR: 0.045 };
    expect(convert(rates, "USD", "ZMW", 100)).toEqual({ rate: 30, result: 3000 });
    expect(convert(rates, "ZAR", "USD", 200)).toEqual({ rate: 0.05, result: 10 });
    expect(convert(rates, "USD", "USD", 7)).toEqual({ rate: 1, result: 7 });
    expect(convert(rates, "USD", "XXX", 1)).toBeNull(); expect(convert(rates, "USD", "EUR", NaN)).toBeNull();
  });
});

describe("the rates routes", () => {
  const serve = async (get: () => Promise<{ data: ReturnType<typeof dataOf>; cached: boolean; stale: boolean }>) => {
    const app = express(); app.use("/api/currency", createRatesRouter({ get: get as never }));
    const srv = await new Promise<import("http").Server>((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/currency`;
    return { url, close: () => new Promise<void>((r) => srv.close(() => r())) };
  };
  const dataOf = () => ({ base: "ZAR" as const, rates: { ZAR: 1, USD: 0.05, ZMW: 1.5 }, source: "ExchangeRate-API", attributionUrl: "https://www.exchangerate-api.com", sourceUpdatedAt: "2026-10-09T00:02:31.000Z", fetchedAt: "2026-10-09T10:00:00.000Z" });

  it("returns the table and converts, with the source and its link", async () => {
    const s = await serve(async () => ({ data: dataOf(), cached: true, stale: false }));
    const rates = await (await fetch(`${s.url}/rates`)).json() as { success: boolean; data: { rates: Record<string, number> } };
    expect(rates).toMatchObject({ success: true, cached: true, data: { base: "ZAR", rates: { USD: 0.05 }, source: "ExchangeRate-API" } });
    const c = await (await fetch(`${s.url}/convert?from=usd&to=zmw&amount=100`)).json();
    expect(c).toMatchObject({ success: true, data: { from: "USD", to: "ZMW", amount: 100, rate: 30, result: 3000, attributionUrl: "https://www.exchangerate-api.com", sourceUpdatedAt: "2026-10-09T00:02:31.000Z" } });
    expect(((await (await fetch(`${s.url}/convert?from=USD&to=ZAR`)).json()) as { data: { amount: number } }).data.amount).toBe(1);        // the amount defaults to 1
    await s.close();
  });

  it("refuses bad input and unknown currencies, and says so plainly when the sources are down", async () => {
    const s = await serve(async () => ({ data: dataOf(), cached: false, stale: true }));
    for (const q of ["from=US&to=ZMW", "from=USD", "from=USD&to=ZMW&amount=abc", "from=USD&to=ZMW&amount=-5", "from=USD&to=ZMW&amount=1e13", "from=1SD&to=ZMW"]) expect((await fetch(`${s.url}/convert?${q}`)).status).toBe(400);
    expect((await fetch(`${s.url}/convert?from=USD&to=QQQ`)).status).toBe(404);
    expect(await (await fetch(`${s.url}/rates`)).json()).toMatchObject({ stale: true });
    await s.close();
    const down = await serve(async () => { throw new Error("no source"); });
    expect((await fetch(`${down.url}/rates`)).status).toBe(503); expect((await fetch(`${down.url}/convert?from=USD&to=ZMW`)).status).toBe(503);
    await down.close();
  });
});

// Talks to the real public services. Off by default so tests never depend on the network: LIVE_RATES_TEST=1 npx vitest run src/services/liveRates.test.ts
describe.skipIf(!process.env.LIVE_RATES_TEST)("the real rate sources (network)", () => {
  it("both sources answer with a usable table for the rand", async () => {
    const real = (url: string, init?: { signal?: AbortSignal }) => fetch(url, init) as unknown as ReturnType<FetchFn>;
    const a = await fetchLiveRates(real as FetchFn);
    expect(a.source).toBe("ExchangeRate-API"); expect(a.rates.USD).toBeGreaterThan(0.03); expect(a.rates.USD).toBeLessThan(0.12);
    for (const c of ["ZMW", "EUR", "GBP", "CNY", "BWP", "NAD", "MZN", "SZL", "LSL"]) expect(a.rates[c], c).toBeGreaterThan(0);
    const onlySecond = ((url: string, init?: { signal?: AbortSignal }) => (url.includes("open.er-api") ? Promise.reject(new Error("blocked for this test")) : real(url, init))) as FetchFn;
    const b = await fetchLiveRates(onlySecond);
    expect(b.source).toBe("currency-api"); expect(Math.abs(b.rates.USD - a.rates.USD) / a.rates.USD).toBeLessThan(0.05);     // the two sources agree
    console.log(`[live] 1 ZAR = ${a.rates.USD} USD, ${a.rates.ZMW} ZMW, ${a.rates.CNY} CNY (${a.source}, updated ${a.sourceUpdatedAt}); ${Object.keys(a.rates).length} currencies; second source ${b.source} ${b.rates.USD}`);
  }, 30000);
});
