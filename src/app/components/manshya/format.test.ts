import { describe, it, expect } from "vitest";
import { R, K, initials, shiftMonth, cumulative, toCents, pctOf } from "./format";

describe("manshya formatting", () => {
  it("formats cents as rand", () => {
    expect(R(12345)).toBe("R 123.45");
    expect(R(0)).toBe("R 0.00");
    expect(R(-5000)).toBe("− R 50.00");
    expect(R(123456789)).toBe("R 1,234,567.89");
  });
  it("shortens axis labels", () => {
    expect(K(5000)).toBe("R50");
    expect(K(250000)).toBe("R2.5k");
    expect(K(2000000)).toBe("R20k");
  });
  it("makes initials", () => {
    expect(initials("Sipho Dlamini")).toBe("SD");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });
  it("shifts months across year ends", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });
  it("accumulates a running total per day", () => {
    expect(cumulative([{ day: 1, total: 100 }, { day: 3, total: 50 }], 4)).toEqual([100, 100, 150, 150]);
  });
  it("converts typed rand to cents", () => {
    expect(toCents("12.50")).toBe(1250);
    expect(toCents("  ")).toBeUndefined();
    expect(toCents("0.1")).toBe(10);
  });
  it("formats rates", () => { expect(pctOf(0.21)).toBe("21.0%"); });
});
