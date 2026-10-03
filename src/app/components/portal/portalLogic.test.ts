import { describe, it, expect } from "vitest";
import { parseWaypoints } from "./AssociationExtras";
import { saShift, rangeQuery } from "./widgets";
import { portalPathForRole, PORTALS } from "./portalDefs";

describe("parseWaypoints", () => {
  it("reads one 'lat, lng' point per line, with commas, semicolons or spaces", () => {
    expect(parseWaypoints("-26.2678, 27.8585\n-26.2041;28.0473\r\n -26.1  28.0 ")).toEqual({ points: [{ lat: -26.2678, lng: 27.8585 }, { lat: -26.2041, lng: 28.0473 }, { lat: -26.1, lng: 28 }] });
  });
  it("says which line is wrong, and rejects out-of-range, too few or too many points", () => {
    expect(parseWaypoints("-26.2, 28.0\nnope")).toEqual({ error: expect.stringContaining("Line 2") });
    expect(parseWaypoints("95, 10\n10, 10")).toEqual({ error: expect.stringContaining("outside") });
    expect(parseWaypoints("-26.2, 28.0")).toEqual({ error: expect.stringContaining("at least two") });
    expect(parseWaypoints(Array.from({ length: 201 }, () => "1, 1").join("\n"))).toEqual({ error: expect.stringContaining("at most 200") });
    expect(parseWaypoints("")).toHaveProperty("error");
  });
});

describe("date helpers", () => {
  it("saShift moves a day string by whole days, across month ends", () => {
    expect(saShift("2026-10-01", -1)).toBe("2026-09-30");
    expect(saShift("2026-02-27", 2)).toBe("2026-03-01");
  });
  it("rangeQuery builds the query string and drops empty extras", () => {
    expect(rangeQuery({ from: "2026-10-01", to: "2026-10-07" }, { status: "confirmed", q: "" })).toBe("from=2026-10-01&to=2026-10-07&status=confirmed");
  });
});

describe("portal routing table", () => {
  it("sends every account type to its own dashboard and nobody else to one", () => {
    for (const p of Object.values(PORTALS)) expect(portalPathForRole(p.role)).toBe(`/portal/${p.segment}`);
    expect(Object.keys(PORTALS)).toEqual(["personal", "driver", "marshal", "owner", "association", "investor"]);
    for (const other of ["customer", "owner", "superadmin", "seller", undefined]) expect(portalPathForRole(other)).toBeNull();
  });
});
