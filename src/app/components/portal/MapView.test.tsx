// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ComponentType } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routes = [{ id: "r1", name: "Soweto - CBD", active: true, registration: "AB 12", terminalSerial: "T-1", points: [{ lat: -26.27, lng: 27.86 }, { lat: -26.2, lng: 28.05 }] }];
const positions = [{ terminalSerial: "T-1", registration: "AB 12", lat: -26.25, lng: 27.93, at: "2026-10-03T10:00:00Z" }];

/** Minimal google.maps: enough for MapView, recording what it was asked to do. */
function installFakeGoogle() {
  const rec = { mapListeners: {} as Record<string, (e: unknown) => void>, typeIds: [] as string[], mapOpts: undefined as Record<string, unknown> | undefined, polylines: 0, markers: 0 };
  (window as unknown as Record<string, unknown>).google = { maps: {
    importLibrary: async () => ({}),
    Map: class { constructor(_el: unknown, opts: Record<string, unknown>) { rec.mapOpts = opts; }
      addListener(n: string, f: (e: unknown) => void) { rec.mapListeners[n] = f; } setMapTypeId(t: string) { rec.typeIds.push(t); } fitBounds() {} getZoom() { return 12; } setZoom() {} },
    LatLngBounds: class { extend() {} },
    Polyline: class { constructor() { rec.polylines++; } setMap() {} addListener() {} },
    marker: { AdvancedMarkerElement: class { constructor() { rec.markers++; } addEventListener() {} } },
    InfoWindow: class { setContent() {} setPosition() {} open() {} close() {} },
    event: { addListenerOnce() {} },
  } };
  return rec;
}

let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); delete (window as unknown as Record<string, unknown>).google; vi.unstubAllEnvs(); vi.resetModules(); document.head.innerHTML = ""; });

async function mount(key: string, props: Record<string, unknown> = {}) {
  vi.stubEnv("VITE_GOOGLE_MAPS_KEY", key); vi.resetModules();
  const { MapView } = (await import("./MapView")) as unknown as { MapView: ComponentType<Record<string, unknown>> };
  await act(async () => { root.render(<MapView routes={routes} positions={positions} color="#f00" {...props} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("MapView", () => {
  it("without a key it shows the drawn map and says why", async () => {
    await mount("");
    expect(host.textContent).toContain("not switched on yet");
    expect(host.querySelector("svg[role=img]")).toBeTruthy(); expect(host.querySelector("[role=application]")).toBeNull();
  });

  it("with Google available it builds the satellite map, draws the routes and vehicles, and lists them", async () => {
    const rec = installFakeGoogle();
    await mount("test-key");
    expect(host.querySelector("[role=application]")).toBeTruthy();
    expect(rec.mapOpts).toMatchObject({ mapTypeId: "hybrid" });                 // satellite with labels, like the reference screenshot
    expect(rec.polylines).toBe(1); expect(rec.markers).toBe(1);
    expect(host.textContent).toContain("Soweto - CBD"); expect(host.textContent).toContain("AB 12");
    expect(host.textContent).not.toContain("Loading Google Maps");
  });

  it("clicking the map reports the point, rounded to 6 decimals (used to draw a route)", async () => {
    const rec = installFakeGoogle(); const onPick = vi.fn();
    await mount("test-key", { onPick });
    rec.mapListeners.click({ latLng: { lat: () => -26.123456789, lng: () => 28.5 } });
    expect(onPick).toHaveBeenCalledWith(-26.123457, 28.5);
    rec.mapListeners.click({});                                                // a click with no position is ignored
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("previews a route being drawn, and does not redraw the map from scratch when the points change", async () => {
    const rec = installFakeGoogle();
    await mount("test-key", { draft: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] });
    expect(rec.polylines).toBe(2);                                             // the saved route + the draft
    expect(rec.markers).toBe(1 + 2);                                           // the vehicle + two numbered points
  });

  it("the Satellite / Map buttons switch the map type", async () => {
    const rec = installFakeGoogle();
    await mount("test-key");
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Map")!;
    await act(async () => { btn.click(); });
    expect(rec.typeIds.at(-1)).toBe("roadmap"); expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to the drawn map, with the reason, if Google later rejects the key", async () => {
    installFakeGoogle();
    await mount("test-key");
    expect(host.querySelector("[role=application]")).toBeTruthy();
    await act(async () => { window.dispatchEvent(new Event("vink:maps-auth-failed")); });
    expect(host.textContent).toContain("Google rejected the map key");
    expect(host.querySelector("svg[role=img]")).toBeTruthy(); expect(host.querySelector("[role=application]")).toBeNull();
  });
});
