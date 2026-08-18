/**
 * Off-route / geofence violation detection for GPS route assignment.
 *
 * A route is an ordered path (waypoints), not a single circular zone --
 * deliberately different from the older, simpler single-point-radius
 * geofence concept used elsewhere in this codebase (vehicleDb.geofences).
 * A vehicle is "off route" when its reported position is further than
 * the route's tolerance_meters from the NEAREST point anywhere along
 * the path -- not just from the nearest waypoint, since a vehicle
 * correctly following a route between two waypoints is on a straight
 * line between them, not required to pass exactly through intermediate
 * points.
 *
 * Uses an equirectangular flat-earth approximation for the point-to-
 * segment projection, which is accurate enough at city scale (taxi
 * routes, tolerance in the tens-to-hundreds of meters) -- this
 * approximation degrades at very large distances or near the poles,
 * neither of which applies here. Haversine (real great-circle distance)
 * is used for the final distance figure, not the flat approximation, so
 * the reported distance_from_route_m is accurate even though the
 * projection step that finds the nearest point uses the simpler method.
 */

const EARTH_RADIUS_M = 6_371_000;

interface LatLng { lat: number; lng: number }

/** Real great-circle distance between two points, in meters. */
function haversineDistanceM(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Finds the nearest point on segment [a,b] to point p, using a local
 * flat-earth approximation (equirectangular projection around the
 * segment's own latitude) -- accurate at the city scale this is used
 * for. Returns that nearest point as a real lat/lng, so the actual
 * reported distance can then be computed with real haversine distance
 * rather than the flat approximation.
 */
function nearestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const refLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(refLat);

  const toXY = (pt: LatLng) => ({ x: pt.lng * metersPerDegLng, y: pt.lat * metersPerDegLat });
  const toLatLng = (xy: { x: number; y: number }): LatLng => ({ lat: xy.y / metersPerDegLat, lng: xy.x / metersPerDegLng });

  const A = toXY(a), B = toXY(b), P = toXY(p);
  const ABx = B.x - A.x, ABy = B.y - A.y;
  const lenSq = ABx * ABx + ABy * ABy;

  // a and b are the same point (a zero-length segment) -- nearest point is just a.
  if (lenSq === 0) return a;

  let t = ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // clamp to the segment, not the infinite line
  return toLatLng({ x: A.x + t * ABx, y: A.y + t * ABy });
}

export interface OffRouteResult {
  isOffRoute: boolean;
  distanceFromRouteM: number;
}

/**
 * Checks a position against a route (an ordered list of waypoints) and
 * a tolerance in meters. Finds the minimum distance to any segment of
 * the path -- not just to the nearest single waypoint -- since a
 * vehicle between two waypoints, correctly following the route, should
 * not be flagged just because neither individual waypoint is close by.
 */
export function checkOffRoute(position: LatLng, waypoints: LatLng[], toleranceMeters: number): OffRouteResult {
  if (waypoints.length === 0) {
    throw new Error("checkOffRoute: a route must have at least one waypoint");
  }

  if (waypoints.length === 1) {
    const d = haversineDistanceM(position, waypoints[0]);
    return { isOffRoute: d > toleranceMeters, distanceFromRouteM: Math.round(d * 100) / 100 };
  }

  let minDistance = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const nearest = nearestPointOnSegment(position, waypoints[i], waypoints[i + 1]);
    const d = haversineDistanceM(position, nearest);
    if (d < minDistance) minDistance = d;
  }

  return { isOffRoute: minDistance > toleranceMeters, distanceFromRouteM: Math.round(minDistance * 100) / 100 };
}

export { haversineDistanceM };
