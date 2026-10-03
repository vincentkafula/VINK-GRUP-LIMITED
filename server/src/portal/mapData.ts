import { iso, num, type Db } from "./common.js";

/**
 * Routes (as ordered points) and the last reported position of each vehicle's terminal, for the Routes & Map screens.
 * The caller supplies WHERE fragments that decide whose routes and terminals these are; both fragments use the aliases
 * r (vehicle_routes), t (terminals) and v (vehicles) and the same positional parameters.
 */
export interface MapData {
  routes: { id: string; name: string; active: boolean; registration: string | null; terminalSerial: string; points: { lat: number; lng: number }[] }[];
  positions: { terminalSerial: string; registration: string | null; lat: number; lng: number; at: string | null }[];
}

export async function loadMap(db: Db, routeWhere: string, terminalWhere: string, params: unknown[]): Promise<MapData> {
  const routeRows = (await db.query(
    `SELECT r.id, r.name, r.active, t.serial, v.registration FROM vehicle_routes r JOIN terminals t ON t.id = r.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
      WHERE ${routeWhere} ORDER BY r.created_at DESC LIMIT 100`, params)).rows;
  const routes: MapData["routes"] = [];
  for (const r of routeRows) {
    const pts = (await db.query(`SELECT lat, lng FROM route_waypoints WHERE route_id = $1 ORDER BY sequence`, [r.id])).rows;
    routes.push({ id: String(r.id), name: String(r.name), active: Boolean(r.active), registration: r.registration == null ? null : String(r.registration), terminalSerial: String(r.serial), points: pts.map((p) => ({ lat: num(p.lat), lng: num(p.lng) })) });
  }
  const terms = (await db.query(`SELECT t.id, t.serial, v.registration FROM terminals t LEFT JOIN vehicles v ON v.id = t.vehicle_id WHERE ${terminalWhere} ORDER BY t.serial LIMIT 200`, params)).rows;
  const positions: MapData["positions"] = [];
  for (const t of terms) {
    const p = (await db.query(`SELECT lat, lng, recorded_at FROM vehicle_positions WHERE terminal_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [t.id])).rows[0];
    if (p) positions.push({ terminalSerial: String(t.serial), registration: t.registration == null ? null : String(t.registration), lat: num(p.lat), lng: num(p.lng), at: iso(p.recorded_at) });
  }
  return { routes, positions };
}
