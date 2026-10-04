import { describe, it, expect, vi } from "vitest";
import { OverlayLayer, ROUTE_COLORS, type OverlayData } from "./mapOverlays";
import { draftPoints, parseWaypoints } from "./AssociationExtras";

/** A stand-in for google.maps that records what is drawn. */
function fakeMaps() {
  const log = { polylines: [] as Record<string, unknown>[], markers: [] as { opts: Record<string, unknown>; listeners: Record<string, () => void>; map: unknown }[], extended: [] as unknown[], infos: [] as { content?: Node; position?: unknown; opened: boolean }[] };
  const maps = {
    LatLngBounds: class { extend(p: unknown) { log.extended.push(p); } },
    Polyline: class { constructor(public opts: Record<string, unknown>) { log.polylines.push(opts); } setMap(m: unknown) { this.opts.map = m; } addListener() {} },
    marker: { AdvancedMarkerElement: class {
      listeners: Record<string, () => void> = {}; map: unknown;
      constructor(public opts: Record<string, unknown>) { this.map = opts.map; log.markers.push({ opts, listeners: this.listeners, map: this.map }); }
      addEventListener(n: string, f: () => void) { this.listeners[n] = f; } } },
    InfoWindow: class { rec = { opened: false } as { content?: Node; position?: unknown; opened: boolean }; constructor() { log.infos.push(this.rec); }
      setContent(n: Node) { this.rec.content = n; } setPosition(p: unknown) { this.rec.position = p; } open() { this.rec.opened = true; } close() { this.rec.opened = false; } },
    event: { addListenerOnce: vi.fn() },
  };
  return { maps, log };
}
const map = { fitBounds: vi.fn(), getZoom: () => 12, setZoom: vi.fn() };
const data = (over: Partial<OverlayData> = {}): OverlayData => ({
  routes: [{ id: "r1", name: "Soweto - CBD", active: true, registration: "AB 12", points: [{ lat: -26.27, lng: 27.86 }, { lat: -26.2, lng: 28.05 }] }],
  positions: [{ terminalSerial: "T-1", registration: "AB 12", lat: -26.25, lng: 27.93, at: "2026-10-03T10:00:00Z" }], draft: [], ...over,
});

describe("OverlayLayer", () => {
  it("draws each route as a coloured line and each vehicle as a marker, and fits the view when asked", () => {
    const { maps, log } = fakeMaps();
    new OverlayLayer(maps, map, "#ff0000").update(data(), true);
    expect(log.polylines).toHaveLength(1);
    expect(log.polylines[0]).toMatchObject({ path: [{ lat: -26.27, lng: 27.86 }, { lat: -26.2, lng: 28.05 }], strokeColor: ROUTE_COLORS[0], strokeOpacity: 0.95 });
    expect(log.markers).toHaveLength(1); expect(log.markers[0].opts.position).toEqual({ lat: -26.25, lng: 27.93 });
    expect(log.extended).toHaveLength(3);                              // two route points + one vehicle
    expect(map.fitBounds).toHaveBeenCalled();
  });

  it("an inactive route is drawn faded and dashed", () => {
    const { maps, log } = fakeMaps();
    new OverlayLayer(maps, map, "#f00").update(data({ routes: [{ id: "r", name: "Off", active: false, registration: null, points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }], positions: [] }), false);
    expect(log.polylines[0]).toMatchObject({ strokeOpacity: 0.45 }); expect(log.polylines[0].icons).toBeTruthy();
  });

  it("redrawing removes what was drawn before (no duplicates piling up on every live refresh)", () => {
    const { maps, log } = fakeMaps();
    const layer = new OverlayLayer(maps, map, "#f00");
    layer.update(data(), false); layer.update(data(), false);
    expect(log.polylines.filter((p) => p.map !== null)).toHaveLength(1);
    expect(log.markers.filter((m) => (m as unknown as { map: unknown }).map !== null || m.map !== null).length).toBeGreaterThan(0);
    layer.destroy();
    expect(log.polylines.every((p) => p.map === null)).toBe(true);
  });

  it("does not move the view when fit is false", () => {
    const { maps } = fakeMaps(); map.fitBounds.mockClear();
    new OverlayLayer(maps, map, "#f00").update(data(), false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("shows a route being drawn as a dashed line with numbered points", () => {
    const { maps, log } = fakeMaps();
    new OverlayLayer(maps, map, "#f00").update(data({ routes: [], positions: [], draft: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }] }), false);
    expect(log.markers.map((m) => (m.opts.content as HTMLElement).textContent)).toEqual(["1", "2", "3"]);
    expect(log.polylines).toHaveLength(1);
  });

  it("names that came from users are shown as plain text, never as HTML", () => {
    const { maps, log } = fakeMaps();
    const evil = `<img src=x onerror="alert(1)">`;
    new OverlayLayer(maps, map, "#f00").update(data({ routes: [], positions: [{ terminalSerial: "T", registration: evil, lat: 1, lng: 1, at: null }] }), false);
    log.markers[0].listeners["gmp-click"]();
    const content = log.infos[0].content as HTMLElement;
    expect(content.textContent).toContain(evil);
    expect(content.children).toHaveLength(0);                          // no element was created from the text
    expect((log.markers[0].opts.content as HTMLElement).getAttribute("aria-label")).toContain(evil);   // attribute, not markup
    expect((log.markers[0].opts.content as HTMLElement).innerHTML).not.toContain("<img");
  });
});

describe("draftPoints (live preview while typing a route)", () => {
  it("keeps the valid lines in order and skips the bad ones", () => {
    expect(draftPoints("-26.2, 28.0\nnonsense\n-26.1;28.1\n\n95, 10")).toEqual([{ lat: -26.2, lng: 28 }, { lat: -26.1, lng: 28.1 }]);
    expect(draftPoints("")).toEqual([]);
  });
  it("agrees with the strict parser on what is valid", () => {
    expect(parseWaypoints("-26.2, 28.0\n-26.1, 28.1")).toEqual({ points: draftPoints("-26.2, 28.0\n-26.1, 28.1").length === 2 ? [{ lat: -26.2, lng: 28 }, { lat: -26.1, lng: 28.1 }] : [] });
  });
});
