import type { GMaps } from "../../services/googleMaps";
import { BRAND } from "../../brand";

export interface OverlayRoute { id: string; name: string; active: boolean; registration: string | null; points: { lat: number; lng: number }[] }
export interface OverlayPosition { terminalSerial: string; registration: string | null; lat: number; lng: number; at: string | null }
export interface OverlayData { routes: OverlayRoute[]; positions: OverlayPosition[]; draft: { lat: number; lng: number }[] }

/** Cape Town, the area in the platform's first rollout, used when there is nothing to show yet. */
export const DEFAULT_CENTER = { lat: -33.9249, lng: 18.4241 };
export const DEFAULT_ZOOM = 11;
export const ROUTE_COLORS = ["#60A5FA", BRAND.warn, "#34D399", "#F472B6", BRAND.gold, "#F87171"];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "unknown");

/**
 * Draws routes (lines), vehicle positions (markers with an info window) and an in-progress route (dashed line with numbered points)
 * onto a Google map. Redrawing replaces what was drawn before. Text is put in with textContent, never as HTML, so names that came
 * from users cannot inject markup into the page.
 */
export class OverlayLayer {
  private shapes: { setMap(m: unknown): void }[] = [];
  private markers: { map: unknown | null }[] = [];
  private info: { close(): void; setContent(n: Node): void; setPosition(p: unknown): void; open(o: unknown): void } | null = null;

  constructor(private readonly maps: GMaps, private readonly map: unknown, private readonly color: string) {}

  private clear() {
    for (const s of this.shapes) s.setMap(null);
    for (const m of this.markers) m.map = null;
    this.shapes = []; this.markers = [];
    this.info?.close();
  }

  /** Redraws everything. With `fit` the view is moved to show it all. */
  update(data: OverlayData, fit: boolean) {
    const { maps, map } = this;
    this.clear();
    const bounds = new maps.LatLngBounds();
    let any = false;
    const extend = (p: { lat: number; lng: number }) => { bounds.extend(p); any = true; };

    data.routes.forEach((r, i) => {
      if (r.points.length === 0) return;
      const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
      const line = new maps.Polyline({
        map, path: r.points, strokeColor: c, strokeWeight: 5, strokeOpacity: r.active ? 0.95 : 0.45, geodesic: true, clickable: true, zIndex: 1,
        icons: r.active ? undefined : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }],
      });
      line.addListener?.("click", (e: { latLng?: unknown }) => this.open(e.latLng, `${r.name}${r.registration ? ` · ${r.registration}` : ""}${r.active ? "" : " (inactive)"}`));
      this.shapes.push(line);
      r.points.forEach(extend);
    });

    for (const p of data.positions) {
      const dot = document.createElement("div");
      dot.style.cssText = `width:18px;height:18px;border-radius:50%;background:${this.color};border:3px solid #fff;box-shadow:0 0 0 2px ${this.color}66, 0 2px 6px rgba(0,0,0,.5)`;
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", `${p.registration ?? p.terminalSerial}, last seen ${when(p.at)}`);
      const m = new maps.marker.AdvancedMarkerElement({ map, position: { lat: p.lat, lng: p.lng }, content: dot, title: p.registration ?? p.terminalSerial, zIndex: 3, gmpClickable: true });
      const show = () => this.open({ lat: p.lat, lng: p.lng }, `${p.registration ?? p.terminalSerial}\nLast seen ${when(p.at)}`);
      if (m.addEventListener) m.addEventListener("gmp-click", show); else m.addListener?.("click", show);       // gmp-click is the current event; addListener is deprecated
      this.markers.push(m);
      extend({ lat: p.lat, lng: p.lng });
    }

    if (data.draft.length > 0) {
      this.shapes.push(new maps.Polyline({
        map, path: data.draft, strokeColor: "#FFFFFF", strokeWeight: 3, strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#FFFFFF", scale: 3 }, offset: "0", repeat: "12px" }], zIndex: 2,
      }));
      data.draft.forEach((p, i) => {
        const tag = document.createElement("div");
        tag.textContent = String(i + 1);
        tag.style.cssText = "min-width:22px;height:22px;border-radius:11px;background:#fff;color:#111;font:700 12px sans-serif;display:grid;place-items:center;border:2px solid #111";
        this.markers.push(new maps.marker.AdvancedMarkerElement({ map, position: p, content: tag, zIndex: 4 }));
        extend(p);
      });
    }

    if (fit && any) {
      (map as { fitBounds(b: unknown, pad?: number): void }).fitBounds(bounds, 56);
      // A single point would zoom in absurdly far; keep a street-level view instead.
      maps.event?.addListenerOnce?.(map, "idle", () => { const z = (map as { getZoom(): number }).getZoom(); if (z > 16) (map as { setZoom(z: number): void }).setZoom(16); });
    }
  }

  private open(position: unknown, text: string) {
    if (!this.info) this.info = new this.maps.InfoWindow();
    const box = document.createElement("div");
    box.style.cssText = "font:13px sans-serif;color:#111;white-space:pre-line;max-width:220px";
    box.textContent = text;                                 // textContent: never HTML
    this.info!.setContent(box);
    this.info!.setPosition(position);
    this.info!.open({ map: this.map });
  }

  destroy() { this.clear(); }
}
