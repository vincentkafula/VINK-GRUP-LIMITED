import { useEffect, useRef, useState } from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { GOOGLE_MAPS_KEY, loadGoogleMaps, onMapsAuthFailure, type GMaps, type MapsFailure } from "../../services/googleMaps";
import { DEFAULT_CENTER, DEFAULT_ZOOM, OverlayLayer, ROUTE_COLORS, type OverlayRoute, type OverlayPosition } from "./mapOverlays";
import { RouteMap, type MapPosition, type MapRoute } from "./widgets";

const WHY: Record<MapsFailure, string> = {
  no_key: "Google Maps is not switched on yet (no map key has been added), so a drawn map is shown instead.",
  script_failed: "Google Maps could not be loaded (network or an ad blocker), so a drawn map is shown instead.",
  timeout: "Google Maps took too long to load, so a drawn map is shown instead.",
  auth_failed: "Google rejected the map key (check the key's website restrictions, that the Maps JavaScript API is enabled, and that billing is on), so a drawn map is shown instead.",
};

interface Props {
  routes: MapRoute[]; positions: MapPosition[]; color: string;
  /** Points of a route being drawn (shown dashed and numbered). */
  draft?: { lat: number; lng: number }[];
  /** When given, clicking the map reports the clicked point (used to draw a new route). */
  onPick?: (lat: number, lng: number) => void;
  height?: number;
}

/**
 * The map used by the owner and association dashboards: the real Google map (satellite with labels by default, switchable to the road
 * map) with the routes as lines and each vehicle's last position as a marker. If Google cannot be used for any reason, the built-in
 * drawn map takes over and a short note says why.
 */
export function MapView({ routes, positions, color, draft = [], onPick, height = 460 }: Props) {
  const [failure, setFailure] = useState<MapsFailure | null>(GOOGLE_MAPS_KEY ? null : "no_key");
  if (failure) return <Fallback why={failure} routes={routes} positions={positions} color={color} />;
  return <GoogleMapCanvas routes={routes} positions={positions} color={color} draft={draft} onPick={onPick} height={height} onFail={setFailure} />;
}

function Fallback({ why, routes, positions, color }: { why: MapsFailure; routes: MapRoute[]; positions: MapPosition[]; color: string }) {
  return (
    <div className="space-y-2">
      <p role="status" className="flex items-start gap-2 text-xs text-amber-200/90"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{WHY[why]}</p>
      <RouteMap routes={routes} positions={positions} color={color} />
    </div>
  );
}

function GoogleMapCanvas({ routes, positions, color, draft, onPick, height, onFail }: Required<Pick<Props, "draft">> & Props & { height: number; onFail: (r: MapsFailure) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: unknown; layer: OverlayLayer; maps: GMaps } | null>(null);
  const fitted = useRef(false);
  const pick = useRef(onPick); pick.current = onPick;
  const [type, setType] = useState<"hybrid" | "roadmap">("hybrid");
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let dead = false;
    const stopAuth = onMapsAuthFailure(() => { if (!dead) onFail("auth_failed"); });
    loadGoogleMaps().then((maps) => {
      if (dead || !box.current) return;
      const map = new maps.Map(box.current, {
        center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, mapTypeId: "hybrid", mapId: "DEMO_MAP_ID",
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "greedy", clickableIcons: false,
      });
      map.addListener("click", (e: { latLng?: { lat(): number; lng(): number } }) => { if (pick.current && e.latLng) pick.current(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6))); });
      mapRef.current = { map, maps, layer: new OverlayLayer(maps, map, color) };
      setReady(true);
    }).catch((e: { reason?: MapsFailure }) => { if (!dead) onFail(e.reason ?? "script_failed"); });
    return () => { dead = true; stopAuth(); mapRef.current?.layer.destroy(); mapRef.current = null; };
  }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when the data changes. The view only moves to fit the first time, so a live refresh never snatches the map from the user.
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const hasData = routes.some((r) => r.points.length) || positions.length > 0 || draft.length > 0;
    m.layer.update({ routes: routes as OverlayRoute[], positions: positions as OverlayPosition[], draft }, hasData && !fitted.current);
    if (hasData) fitted.current = true;
  }, [ready, routes, positions, draft]);

  useEffect(() => { (mapRef.current?.map as { setMapTypeId(t: string): void } | undefined)?.setMapTypeId(type); }, [type, ready]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="relative">
        <div ref={box} role="application" aria-label={`Map showing ${routes.length} routes and ${positions.length} vehicle positions`} style={{ height, background: "#0D0B1E" }} />
        {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-white/60"><span className="flex items-center gap-2"><MapPin className="w-4 h-4 animate-pulse" /> Loading Google Maps…</span></div>}
        <div className="absolute top-3 left-3 flex rounded-lg overflow-hidden text-xs font-semibold shadow" role="group" aria-label="Map type">
          {([["hybrid", "Satellite"], ["roadmap", "Map"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} className="px-3 py-1.5" style={{ background: type === v ? "#fff" : "rgba(17,17,17,.75)", color: type === v ? "#111" : "#fff" }}>{label}</button>))}
        </div>
      </div>
      <ul className="p-3 grid gap-1.5 sm:grid-cols-2 text-xs text-white/70">
        {routes.map((r, i) => <li key={r.id} className="flex items-center gap-2"><span className="inline-block w-3 h-1 rounded" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />{r.name}{r.registration ? ` · ${r.registration}` : ""}{r.active ? "" : " (inactive)"}</li>)}
        {positions.map((p) => <li key={p.terminalSerial} className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />{p.registration ?? p.terminalSerial}{p.at ? ` · last seen ${new Date(p.at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</li>)}
      </ul>
    </div>
  );
}
