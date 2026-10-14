import { describe, it, expect } from "vitest";
import { EMPTY_STATE, evaluateTap, sampleFareTable, applyBp, formatRand, randToCents, localParts, timeMultiplierBp, zoneBase, type CardState, type TapInput } from "../src";

const table = sampleFareTable();
// 2026-10-14 is a Wednesday. 10:30 local (SAST, +2) = 08:30 UTC = midday off-peak; 07:30 local = morning peak; 12:00 local is off-peak (cheaper)
const at = (hhmm: string, date = "2026-10-14") => Math.floor(Date.parse(`${date}T${hhmm}:00+02:00`) / 1000);
const WED_OFFPEAK = at("11:00"), WED_PEAK = at("07:30"), WED_NORMAL = at("09:30"), SATURDAY = at("11:00", "2026-10-17");

const input = (o: Partial<TapInput> = {}): TapInput => ({ table, routeId: 1, stopId: 101, now: WED_NORMAL, category: "adult", balance: 10_000, state: { ...EMPTY_STATE }, deviceTag: 7, ...o });
const ok = (d: ReturnType<typeof evaluateTap>) => { if (!d.ok) throw new Error("expected ok, got " + d.reason); return d; };

describe("money helpers", () => {
  it("formats and parses rand", () => {
    expect(formatRand(1250)).toBe("R12.50"); expect(formatRand(5)).toBe("R0.05"); expect(formatRand(-300)).toBe("-R3.00");
    expect(randToCents("12")).toBe(1200); expect(randToCents("12.5")).toBe(1250); expect(randToCents("0.07")).toBe(7);
    expect(() => randToCents("12.345")).toThrow(); expect(() => randToCents("-1")).toThrow(); expect(() => randToCents("abc")).toThrow();
  });
  it("applies basis points with half-up rounding in integers", () => {
    expect(applyBp(1000, 12000)).toBe(1200); expect(applyBp(1000, 8000)).toBe(800); expect(applyBp(999, 5000)).toBe(500); expect(applyBp(1, 5000)).toBe(1); expect(applyBp(1, 4999)).toBe(0);
  });
});

describe("time of day", () => {
  it("works out local weekday and minute from the table's offset", () => {
    expect(localParts(at("07:30"), 120)).toEqual({ day: 3, minute: 450 });
    expect(localParts(Math.floor(Date.parse("2026-10-14T23:30:00Z") / 1000), 120)).toEqual({ day: 4, minute: 90 });     // after midnight local
  });
  it("picks the peak, off-peak, weekend and normal multipliers", () => {
    expect(timeMultiplierBp(table, WED_PEAK)).toBe(12000);
    expect(timeMultiplierBp(table, WED_OFFPEAK)).toBe(8000);
    expect(timeMultiplierBp(table, SATURDAY)).toBe(8000);
    expect(timeMultiplierBp(table, WED_NORMAL)).toBe(10000);
  });
});

describe("flat-fare route", () => {
  const flat = (o: Partial<TapInput> = {}) => input({ routeId: 2, stopId: 201, ...o });
  it("charges the flat fare on one tap and leaves the rider not in a trip", () => {
    const d = ok(evaluateTap(flat()));
    expect(d).toMatchObject({ kind: "flat", fare: 1200, penalty: 0 });
    expect(d.newState).toMatchObject({ inTrip: false, counter: 1, routeId: 2, tapInEpoch: WED_NORMAL });
  });
  it("time-of-day and passenger category change the fare", () => {
    expect(ok(evaluateTap(flat({ now: WED_PEAK }))).fare).toBe(1440);
    expect(ok(evaluateTap(flat({ now: WED_OFFPEAK }))).fare).toBe(960);
    expect(ok(evaluateTap(flat({ category: "student" }))).fare).toBe(900);
    expect(ok(evaluateTap(flat({ category: "senior", now: WED_PEAK }))).fare).toBe(720);
    expect(ok(evaluateTap(flat({ category: "staff" }))).fare).toBe(0);
  });
  it("refuses when the balance is short and says how much is needed", () => {
    const d = evaluateTap(flat({ balance: 1199 }));
    expect(d).toMatchObject({ ok: false, reason: "INSUFFICIENT_FUNDS", needed: 1200 });
    expect(ok(evaluateTap(flat({ balance: 1200 }))).message).toContain("Bal R0.00");
  });
  it("blocks the same card tapping again within the anti-passback window, and allows it afterwards", () => {
    const first = ok(evaluateTap(flat()));
    expect(evaluateTap(flat({ state: first.newState, now: WED_NORMAL + 89 }))).toMatchObject({ ok: false, reason: "DUPLICATE_TAP" });
    expect(evaluateTap(flat({ state: first.newState, now: WED_NORMAL + 90 })).ok).toBe(true);
  });
  it("unknown route is refused", () => expect(evaluateTap(input({ routeId: 99 }))).toMatchObject({ ok: false, reason: "UNKNOWN_ROUTE" }));
});

describe("zone route (pay on exit)", () => {
  it("tap in costs nothing but needs the maximum fare in the balance", () => {
    expect(evaluateTap(input({ balance: 2799 }))).toMatchObject({ ok: false, reason: "INSUFFICIENT_FUNDS", needed: 2800 });
    const d = ok(evaluateTap(input({ balance: 2800 })));
    expect(d).toMatchObject({ kind: "tap_in", fare: 0 });
    expect(d.newState).toMatchObject({ inTrip: true, boardStopId: 101, tapInEpoch: WED_NORMAL, counter: 1 });
  });
  it("a student needs only their discounted maximum to tap in", () => {
    expect(ok(evaluateTap(input({ balance: 2100, category: "student" }))).kind).toBe("tap_in");
    expect(evaluateTap(input({ balance: 2099, category: "student" })).ok).toBe(false);
  });
  it("tap out charges the fare for the zones travelled", () => {
    const tapIn = ok(evaluateTap(input()));
    const out = ok(evaluateTap(input({ stopId: 104, state: tapIn.newState, now: WED_NORMAL + 1800, balance: 10_000 })));
    expect(out).toMatchObject({ kind: "tap_out", fare: 1800 });          // zone 1 to zone 3, normal hours
    expect(out.newState).toMatchObject({ inTrip: false, counter: 2, boardStopId: 104 });
  });
  it("the fare is the same in either direction and uses the time of boarding", () => {
    expect(zoneBase(table.routes[0], 1, 4)).toBe(zoneBase(table.routes[0], 4, 1));
    const peakIn = ok(evaluateTap(input({ now: WED_PEAK })));
    const out = ok(evaluateTap(input({ stopId: 103, state: peakIn.newState, now: WED_PEAK + 4000 })));     // arrives in normal hours, charged at the peak it boarded in
    expect(out.fare).toBe(Math.round(1200 * 1.2));
  });
  it("tapping out at the boarding stop right away is a duplicate; later it costs the minimum", () => {
    const tapIn = ok(evaluateTap(input()));
    expect(evaluateTap(input({ state: tapIn.newState, now: WED_NORMAL + 30 }))).toMatchObject({ ok: false, reason: "DUPLICATE_TAP" });
    expect(ok(evaluateTap(input({ state: tapIn.newState, now: WED_NORMAL + 600 }))).fare).toBe(800);
  });
  it("refuses a tap-out the balance cannot cover, leaving the trip open", () => {
    const tapIn = ok(evaluateTap(input({ balance: 2800 })));
    expect(evaluateTap(input({ stopId: 105, state: tapIn.newState, now: WED_NORMAL + 3000, balance: 2000 }))).toMatchObject({ ok: false, reason: "INSUFFICIENT_FUNDS", needed: 2800 });
  });
  it("a trip that was never tapped out is charged the maximum on the next tap in, which starts a new trip", () => {
    const tapIn = ok(evaluateTap(input()));
    const later = WED_NORMAL + 5 * 3600;
    const d = ok(evaluateTap(input({ state: tapIn.newState, now: later, balance: 10_000 })));
    expect(d).toMatchObject({ kind: "penalty_tap_in", fare: 2800, penalty: 2800 });
    expect(d.newState).toMatchObject({ inTrip: true, tapInEpoch: later });
    expect(evaluateTap(input({ state: tapIn.newState, now: later, balance: 2800 }))).toMatchObject({ ok: false, reason: "INSUFFICIENT_FUNDS", needed: 5600 });
  });
  it("tapping in on another route while a trip is open charges the previous route's maximum", () => {
    const tapIn = ok(evaluateTap(input()));
    const d = ok(evaluateTap(input({ routeId: 2, stopId: 201, state: tapIn.newState, now: WED_NORMAL + 600, balance: 10_000 })));
    expect(d).toMatchObject({ kind: "flat", fare: 2800 + 1200, penalty: 2800 });
  });
  it("rounds nothing it should not: every result is a whole number of cents", () => {
    for (const category of ["adult", "student", "senior", "child", "staff"] as const) for (const now of [WED_PEAK, WED_OFFPEAK, WED_NORMAL, SATURDAY]) for (const stop of [101, 102, 103, 104, 105]) {
      const tapIn = ok(evaluateTap(input({ category, now })));
      const out = evaluateTap(input({ category, now: now + 900, stopId: stop, state: { ...tapIn.newState, tapInEpoch: now } as CardState }));
      if (out.ok) expect(Number.isInteger(out.fare)).toBe(true);
    }
  });
  it("unknown stop on a zone route is refused", () => expect(evaluateTap(input({ stopId: 999 }))).toMatchObject({ ok: false, reason: "UNKNOWN_STOP" }));
});
