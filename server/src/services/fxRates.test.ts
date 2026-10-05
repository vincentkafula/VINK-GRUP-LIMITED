import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { refreshRates, pickRate, exchangeRateApiOpen, exchangeRateApiKeyed, currencyApi, defaultProviders, type FetchFn } from "./fxRates.js";

const NOW = new Date("2026-10-05T10:00:00Z");
const erOpen = (rate: number, unix = 1791158551) => ({ result: "success", time_last_update_unix: unix, rates: { ZMW: rate, ZAR: rate } });
const fawaz = (from: string, to: string, rate: number) => ({ date: "2026-10-04", [from.toLowerCase()]: { [to.toLowerCase()]: rate } });

/** A fake network: maps URL fragments to answers. */
function net(map: Record<string, unknown | (() => never)>): { f: FetchFn; urls: string[] } {
  const urls: string[] = [];
  const f: FetchFn = async (url) => {
    urls.push(url);
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    const v = map[key];
    if (typeof v === "function") (v as () => never)();
    return { ok: true, status: 200, json: async () => v };
  };
  return { f, urls };
}

describe("providers", () => {
  it("read the three sources' formats", async () => {
    const a = await exchangeRateApiOpen.read("ZAR", "ZMW", net({ "open.er-api.com/v6/latest/ZAR": erOpen(1.2) }).f);
    expect(a).toMatchObject({ rate: 1.2, source: "exchangerate-api.com" }); expect(a.sourceAt.toISOString()).toBe(new Date(1791158551 * 1000).toISOString());
    const k = await exchangeRateApiKeyed("sekret").read("ZAR", "ZMW", net({ "v6.exchangerate-api.com/v6/sekret/pair/ZAR/ZMW": { result: "success", conversion_rate: 1.21, time_last_update_unix: 1791158551 } }).f);
    expect(k.rate).toBe(1.21);
    const c = await currencyApi.read("ZAR", "ZMW", net({ "cdn.jsdelivr.net": fawaz("ZAR", "ZMW", 1.18) }).f);
    expect(c).toMatchObject({ rate: 1.18, source: "currency-api (fawazahmed0)" }); expect(c.sourceAt.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
  it("the currency-api source falls back to its mirror", async () => {
    const n = net({ "cdn.jsdelivr.net": () => { throw new Error("down"); }, "latest.currency-api.pages.dev": fawaz("ZAR", "ZMW", 1.18) });
    expect((await currencyApi.read("ZAR", "ZMW", n.f)).rate).toBe(1.18); expect(n.urls).toHaveLength(2);
  });
  it("refuse unusable answers", async () => {
    await expect(exchangeRateApiOpen.read("ZAR", "ZMW", net({ "open.er-api.com": { result: "error" } }).f)).rejects.toThrow();
    await expect(exchangeRateApiOpen.read("ZAR", "ZMW", net({ "open.er-api.com": erOpen(0) }).f)).rejects.toThrow(/usable/);
    await expect(exchangeRateApiOpen.read("ZAR", "ZMW", net({ "open.er-api.com": { result: "success", rates: { ZMW: "abc" } } }).f)).rejects.toThrow(/usable/);
  });
  it("uses the keyed endpoint when a key is configured", () => { expect(defaultProviders("k")[0]).not.toBe(exchangeRateApiOpen); expect(defaultProviders()[0]).toBe(exchangeRateApiOpen); });
});

describe("pickRate safety rules", () => {
  const both = (a: number, b: number) => net({ "open.er-api.com": erOpen(a), "cdn.jsdelivr.net": fawaz("ZAR", "ZMW", b) }).f;
  it("takes the first source when the two agree", async () => {
    const r = await pickRate("ZAR", "ZMW", both(1.2, 1.18), [exchangeRateApiOpen, currencyApi], null);
    expect(r).toMatchObject({ ok: true, reading: { rate: 1.2 }, checkedAgainst: "currency-api (fawazahmed0)" });
  });
  it("refuses when the sources disagree by more than 5%", async () => {
    expect(await pickRate("ZAR", "ZMW", both(1.2, 1.0), [exchangeRateApiOpen, currencyApi], null)).toMatchObject({ ok: false, status: "rejected", reason: expect.stringMatching(/disagree/) });
  });
  it("works with one source when the other is down, and fails when both are", async () => {
    expect(await pickRate("ZAR", "ZMW", net({ "open.er-api.com": erOpen(1.2) }).f, [exchangeRateApiOpen, currencyApi], null)).toMatchObject({ ok: true, checkedAgainst: null });
    expect(await pickRate("ZAR", "ZMW", net({}).f, [exchangeRateApiOpen, currencyApi], null)).toMatchObject({ ok: false, status: "failed" });
  });
  it("does not apply a jump of more than 15% automatically", async () => {
    expect(await pickRate("ZAR", "ZMW", both(1.5, 1.5), [exchangeRateApiOpen, currencyApi], 1.2)).toMatchObject({ ok: false, status: "rejected", reason: expect.stringMatching(/confirm/) });
    expect(await pickRate("ZAR", "ZMW", both(1.3, 1.3), [exchangeRateApiOpen, currencyApi], 1.2)).toMatchObject({ ok: true });
  });
});

describe("refreshRates", () => {
  let db: Db;
  beforeEach(() => { db = allPortalsDb(); });
  const q = async () => (await db.query(`SELECT pair, rate, source, auto, source_at FROM fx_rates ORDER BY pair`)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any
  const f = () => net({ "open.er-api.com/v6/latest/ZAR": erOpen(1.2), "open.er-api.com/v6/latest/ZMW": erOpen(0.83), "cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/zar.json": fawaz("ZAR", "ZMW", 1.19), "currencies/zmw.json": fawaz("ZMW", "ZAR", 0.84) }).f;

  it("stores both directions with their source and the source's own time", async () => {
    const r = await refreshRates(db, { pairs: ["ZAR-ZMW", "ZMW-ZAR"], fetchFn: f(), now: NOW });
    expect(r.map((x) => x.status)).toEqual(["updated", "updated"]);
    const rows = await q();
    expect(rows).toEqual([expect.objectContaining({ pair: "ZAR-ZMW", source: "exchangerate-api.com", auto: true }), expect.objectContaining({ pair: "ZMW-ZAR", auto: true })]);
    expect(Number(rows[0].rate)).toBe(1.2); expect(Number(rows[1].rate)).toBe(0.83);
  });
  it("replaces an earlier automatic rate, but leaves a rate set by hand alone for 24 hours", async () => {
    await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: f(), now: NOW });
    expect((await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: net({ "open.er-api.com": erOpen(1.25), "cdn": fawaz("ZAR", "ZMW", 1.24) }).f, now: new Date(NOW.getTime() + 3600_000) }))[0].status).toBe("updated");
    await db.query(`UPDATE fx_rates SET rate = 1.3, auto = false, source = 'manual', set_at = $1`, [NOW]);
    expect((await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: f(), now: new Date(NOW.getTime() + 23 * 3600_000) }))[0]).toMatchObject({ status: "kept_manual" });
    expect(Number((await q())[0].rate)).toBe(1.3);
    expect((await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: f(), now: new Date(NOW.getTime() + 25 * 3600_000) }))[0].status).toBe("updated");     // the pin ends after a day
  });
  it("keeps the old rate when every source is down or the sources disagree, and never throws", async () => {
    await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: f(), now: NOW });
    expect((await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: net({}).f, now: NOW }))[0].status).toBe("failed");
    expect((await refreshRates(db, { pairs: ["ZAR-ZMW"], fetchFn: net({ "open.er-api.com": erOpen(1.2), "cdn": fawaz("ZAR", "ZMW", 0.9) }).f, now: NOW }))[0].status).toBe("rejected");
    expect(Number((await q())[0].rate)).toBe(1.2);
  });
});
