import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createTaxTables, taxBeforeRebateCents, payeForPeriod, uifForPeriod, periodsPerYear, tableProblem, ageOn, rebateFor, type TaxTable, type TaxTables } from "./tax.js";

/**
 * PAYE is checked against figures published by SARS and by payroll guides for the 2026/27 tax year (1 March 2026 to 28 February 2027), not against numbers produced by this code:
 * R240 000 a year -> R25 380 (18% less the R17 820 primary rebate); R360 000 -> R56 172; R500 000 -> R98 417; nothing at or below R99 000; and the base tax at each bracket edge.
 */
let db: Db, t: TaxTables, table: TaxTable;
const R = (rand: number) => Math.round(rand * 100);
beforeEach(async () => { db = allPortalsDb(); t = createTaxTables(db); table = (await t.forDay("2026-11-02"))!; });

describe("the 2026/27 tax table that ships with the system", () => {
  it("is the SARS table: seven brackets from 18% to 45%, the R17 820 rebate, a R17 712 monthly UIF ceiling, and its source", () => {
    expect(table.taxYear).toBe("2026/27"); expect(table.brackets.map((b) => b.rateBp)).toEqual([1800, 2600, 3100, 3600, 3900, 4100, 4500]); expect(table.brackets.map((b) => b.upToCents)).toEqual([R(245_100), R(383_100), R(530_200), R(695_800), R(887_000), R(1_878_600), null]);
    expect(table.primaryRebateCents).toBe(R(17_820)); expect(table.uifCeilingMonthlyCents).toBe(R(17_712)); expect(table.source).toContain("sars.gov.za");
  });
  it("gives the base tax SARS publishes at each bracket edge", () => {
    for (const [income, tax] of [[245_100, 44_118], [383_100, 79_998], [530_200, 125_599], [695_800, 185_215], [887_000, 259_783], [1_878_600, 666_339]] as const) expect(taxBeforeRebateCents(R(income), table.brackets), String(income)).toBe(R(tax));
    expect(taxBeforeRebateCents(R(2_000_000), table.brackets)).toBe(R(666_339 + 0.45 * (2_000_000 - 1_878_600)));
  });
});

describe("PAYE by the annualisation method", () => {
  it("matches the published worked examples", () => {
    expect(payeForPeriod(R(20_000), 12, table)).toMatchObject({ annualTaxableCents: R(240_000), taxBeforeRebateCents: R(43_200), annualPayeCents: R(25_380) });                                                        // R240 000 a year
    expect(payeForPeriod(R(30_000), 12, table)).toMatchObject({ taxBeforeRebateCents: R(73_992), annualPayeCents: R(56_172), periodPayeCents: R(4_681) });                                                         // R360 000: R30 000 a month
    expect(payeForPeriod(R(500_000) / 12, 12, table).annualPayeCents).toBe(R(98_417));                                                                                                                               // R500 000
  });
  it("is nothing at or below the R99 000 threshold, and cents above it", () => {
    expect(payeForPeriod(R(99_000) / 12, 12, table).annualPayeCents).toBe(0); expect(payeForPeriod(R(90_000) / 12, 12, table).periodPayeCents).toBe(0); expect(payeForPeriod(0, 12, table).periodPayeCents).toBe(0); expect(payeForPeriod(-500, 12, table).periodPayeCents).toBe(0);
    expect(payeForPeriod(R(99_001) / 12, 12, table).annualPayeCents).toBe(18);                                                                                                                                       // 18 cents above the line
  });
  it("scales a weekly or fortnightly period to a year (52 and 26 periods) and back", () => {
    expect(periodsPerYear("weekly")).toBe(52); expect(periodsPerYear("fortnightly")).toBe(26); expect(periodsPerYear("monthly")).toBe(12);
    expect(payeForPeriod(R(2_000), 52, table)).toMatchObject({ annualTaxableCents: R(104_000), annualPayeCents: R(900), periodPayeCents: Math.round(R(900) / 52) });                                                    // 104 000 -> 18 720 - 17 820
  });
});

describe("UIF with its ceiling", () => {
  it("is 1% of earnings up to the monthly ceiling: R177.12 a month at most, scaled to the period", () => {
    expect(uifForPeriod(R(10_000), 100, 12, table)).toBe(R(100)); expect(uifForPeriod(R(17_712), 100, 12, table)).toBe(R(177.12)); expect(uifForPeriod(R(50_000), 100, 12, table)).toBe(R(177.12));
    expect(uifForPeriod(R(10_000), 100, 52, table)).toBe(R(40.87)); expect(uifForPeriod(R(2_000), 100, 52, table)).toBe(R(20));                                                                                     // weekly ceiling R4 087.38
  });
  it("has no ceiling when no table covers the day (the old behaviour)", () => { expect(uifForPeriod(R(50_000), 100, 12, null)).toBe(R(500)); });
});

describe("the tables the system holds", () => {
  it("finds the table for a day, none outside its dates, and lists them", async () => {
    expect((await t.forDay("2026-03-01"))!.taxYear).toBe("2026/27"); expect((await t.forDay("2027-02-28"))!.taxYear).toBe("2026/27"); expect(await t.forDay("2026-02-28")).toBeNull(); expect(await t.forDay("2027-03-01")).toBeNull(); expect((await t.list()).map((x) => x.taxYear)).toEqual(["2026/27"]);
  });
  const next = { taxYear: "2027/28", effectiveFrom: "2027-03-01", effectiveTo: "2028-02-29", brackets: [{ upToCents: R(250_000), rateBp: 1800 }, { upToCents: R(400_000), rateBp: 2600 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: R(18_000), uifCeilingMonthlyCents: R(18_000), source: "SARS Budget 2027 tax guide" };
  it("takes next year's table, which then applies from its date, once", async () => {
    expect(await t.add(next)).toEqual({ ok: true }); expect((await t.forDay("2027-03-01"))!.primaryRebateCents).toBe(R(18_000)); expect((await t.forDay("2027-02-28"))!.taxYear).toBe("2026/27");
    expect(await t.add(next)).toMatchObject({ ok: false, status: 409 }); expect(await t.add({ ...next, taxYear: "2028/29", effectiveFrom: "2027-12-01", effectiveTo: "2028-12-31" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("overlaps") });
  });
  it("refuses a table that is wrong or has no source, so a typing mistake cannot become everyone's tax", async () => {
    for (const [bad, why] of [[{ source: "" }, /where the figures come from/], [{ taxYear: "next year" }, /tax year/], [{ effectiveTo: "2026-01-01" }, /dates/], [{ brackets: [{ upToCents: 100, rateBp: 1800 }] }, /between 2 and 12/], [{ brackets: [{ upToCents: 500, rateBp: 1800 }, { upToCents: 100, rateBp: 2600 }, { upToCents: null, rateBp: 4500 }] }, /rise/],
      [{ brackets: [{ upToCents: 500, rateBp: 1800 }, { upToCents: 900, rateBp: 20000 }, { upToCents: null, rateBp: 4500 }] }, /rate/], [{ brackets: [{ upToCents: 500, rateBp: 1800 }, { upToCents: 900, rateBp: 2600 }, { upToCents: 1200, rateBp: 4500 }] }, /no upper limit/], [{ primaryRebateCents: -1 }, /rebate/], [{ uifCeilingMonthlyCents: 0 }, /UIF/]] as const)
      expect(await t.add({ ...next, ...bad } as any), JSON.stringify(bad).slice(0, 40)).toMatchObject({ ok: false, status: expect.any(Number), error: expect.stringMatching(why) });
    expect(tableProblem(next)).toBeNull(); expect((await t.list()).length).toBe(1);
  });
  it("never uses a table that has been damaged in the database", async () => { await db.query(`UPDATE tax_tables SET brackets = 'not json'`); expect(await t.forDay("2026-11-02")).toBeNull(); expect(await t.list()).toEqual([]); });
});

describe("age rebates", () => {
  it("ship with the table: the secondary rebate R9 765 from 65 and the tertiary R3 249 from 75", () => { expect(table.secondaryRebateCents).toBe(R(9_765)); expect(table.tertiaryRebateCents).toBe(R(3_249)); expect(rebateFor(null, table)).toBe(R(17_820)); expect(rebateFor(64, table)).toBe(R(17_820)); expect(rebateFor(65, table)).toBe(R(27_585)); expect(rebateFor(74, table)).toBe(R(27_585)); expect(rebateFor(75, table)).toBe(R(30_834)); });
  it("move the tax-free threshold to the published figures: R99 000 under 65, R153 250 from 65 and R171 300 from 75", () => {
    const owed = (annual: number, age: number | null) => payeForPeriod(R(annual) / 12, 12, table, age).annualPayeCents;
    expect(owed(99_000, 50)).toBe(0); expect(owed(99_001, 50)).toBe(18); expect(owed(153_250, 66)).toBe(0); expect(owed(153_251, 66)).toBe(18); expect(owed(153_250, 40)).toBe(R(9_765)); expect(owed(171_300, 77)).toBe(0); expect(owed(171_301, 77)).toBe(18); expect(owed(153_250, null)).toBe(R(9_765));          // an unknown age gets no age rebate
  });
  it("works out age on a day the way SARS does (a birthday not yet reached does not count)", () => {
    expect(ageOn("1962-02-28", "2027-02-28")).toBe(65); expect(ageOn("1962-03-01", "2027-02-28")).toBe(64); expect(ageOn("1952-02-28", "2027-02-28")).toBe(75); expect(ageOn("1952-03-01", "2027-02-28")).toBe(74); expect(ageOn("2000-12-31", "2027-01-01")).toBe(26);
  });
  it("can be given when a table is added (and default to none), and are refused if they are not amounts", async () => {
    const next = { taxYear: "2027/28", effectiveFrom: "2027-03-01", effectiveTo: "2028-02-29", brackets: [{ upToCents: 25000000, rateBp: 1800 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: R(18_000), uifCeilingMonthlyCents: R(18_000), source: "SARS Budget 2027" };
    expect(await t.add({ ...next, secondaryRebateCents: -1 } as any)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("age rebates") }); expect(await t.add({ ...next, tertiaryRebateCents: 1.5 } as any)).toMatchObject({ ok: false, status: 400 });
    expect(await t.add({ ...next, secondaryRebateCents: R(9_900), tertiaryRebateCents: R(3_300) })).toEqual({ ok: true }); expect(await t.forDay("2027-06-01")).toMatchObject({ secondaryRebateCents: R(9_900), tertiaryRebateCents: R(3_300) });
    await db.query(`DELETE FROM tax_tables WHERE tax_year = '2027/28'`); expect(await t.add(next)).toEqual({ ok: true }); expect(await t.forDay("2027-06-01")).toMatchObject({ secondaryRebateCents: 0, tertiaryRebateCents: 0 });
  });
});

