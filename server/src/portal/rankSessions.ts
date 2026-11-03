import { randomUUID } from "node:crypto";
import { isUniqueViolation, type Db } from "./common.js";
import { cardHash, normaliseCardUid } from "../services/tokenService.js";

/**
 * Loading sessions on a shared RANK DEVICE.
 *
 * A route has a shared card device at each end. A vehicle needs no device of its own: when it reaches the front of the queue the marshal OPENS A SESSION for it on the rank's device
 * (status "pending"). The device then waits for the DRIVER to tap their own driver card; that PAIRS the session ("loading"), and only then can passengers pay on it. When the vehicle is
 * full the session is CLOSED, which logs the departure exactly as the marshal's Depart button does and takes the vehicle out of the queue, so the next one can start loading.
 *
 *   marshal  open(rank, device, queue entry?)  ->  pending
 *   device   pair(device, driver card)          ->  loading      (no card tap = no pairing)
 *   marshal  close(session)                     ->  closed       (departure logged, vehicle leaves the queue)
 *   marshal  cancel(session)                    ->  cancelled    (it never loaded, or the wrong vehicle was started)
 *
 * What the database guarantees, whatever order requests arrive in (unique partial indexes on loading_sessions): one open session per device, one per vehicle, and a driver loading
 * only one vehicle at a time. A "driver card" is a VINK token card whose wallet belongs to a driver, so no new card table is needed. Every change is written to the audit log.
 */
export type Fail = { ok: false; status: number; code: string; message: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });

export interface SessionView {
  id: string; status: "pending" | "loading" | "closed" | "cancelled";
  rankId: string; terminalId: string; vehicleId: string; registration: string | null; routeId: string | null;
  driverId: string | null; driverName: string | null; marshalId: string;
  startedAt: string; pairedAt: string | null; endedAt: string | null; passengers: number; totalCents: number; departureId: string | null; closeReason: string | null;
}
export interface BoardView {
  queue: { id: string; vehicleId: string; registration: string; seats: number | null; joinedAt: string; status: "waiting" | "pairing" | "loading"; sessionId: string | null; driverName: string | null }[];
  devices: { id: string; serial: string; model: string; status: string; lastSeenAt: string | null; online: boolean; routeId: string | null; sessionId: string | null }[];
}

/** How long a device waits for the driver's card before the session is cancelled, and how recently a device must have reported to count as online. */
export const PAIR_WINDOW_MS = 10 * 60_000;
export const ONLINE_WITHIN_MS = 3 * 60_000;

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export function createRankSessions(db: Db, now: () => Date = () => new Date(), pairWindowMs: number = PAIR_WINDOW_MS) {
  async function record(actorId: string | null, actorName: string, action: string, target: string, details: Record<string, unknown>): Promise<void> {
    try { await db.query(`INSERT INTO audit_log (id, actor_id, actor_name, action, target, details) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), actorId, actorName, action, target, JSON.stringify(details)]); }
    catch (e) { console.error("[rank] audit failed:", e instanceof Error ? e.message : e); }
  }

  const SESSION_SQL = `SELECT s.*, v.registration, u.name AS driver_name FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id LEFT JOIN users u ON u.id = s.driver_id`;
  const view = (r: Record<string, any>): SessionView => ({
    id: String(r.id), status: r.status, rankId: String(r.rank_id), terminalId: String(r.terminal_id), vehicleId: String(r.vehicle_id), registration: r.registration ?? null, routeId: r.route_id ? String(r.route_id) : null,
    driverId: r.driver_id ? String(r.driver_id) : null, driverName: r.driver_name ?? null, marshalId: String(r.marshal_id),
    startedAt: iso(r.started_at)!, pairedAt: iso(r.paired_at), endedAt: iso(r.ended_at), passengers: Number(r.passengers ?? 0), totalCents: Number(r.total_cents ?? 0), departureId: r.departure_id ? String(r.departure_id) : null, closeReason: r.close_reason ?? null,
  });
  const byId = async (id: string, rankId?: string) => (await db.query(`${SESSION_SQL} WHERE s.id = $1${rankId ? " AND s.rank_id = $2" : ""}`, rankId ? [id, rankId] : [id])).rows[0] ?? null;

  /** A session still waiting for the driver's card after the window is cancelled, so a forgotten one can never block a device. */
  async function expireStale(): Promise<number> {
    const cutoff = new Date(now().getTime() - pairWindowMs);
    const r = await db.query(`UPDATE loading_sessions SET status = 'cancelled', ended_at = $1, close_reason = 'No driver card was tapped in time' WHERE status = 'pending' AND started_at < $2 RETURNING id`, [now(), cutoff]);
    for (const row of r.rows) await record(null, "system", "rank.session_expired", String(row.id), {});
    return r.rows.length;
  }

  /** The marshal opens a session for a vehicle on one of the rank's devices. Without queueId it is the vehicle at the front of the line that is not already loading. */
  async function open(a: { rankId: string; marshalId: string; actorName: string; terminalId: string; queueId?: string | null }): Promise<Res<SessionView>> {
    await expireStale();
    const t = (await db.query(`SELECT id, serial, status, kind, rank_id, route_id FROM terminals WHERE id = $1`, [a.terminalId])).rows[0];
    if (!t || t.kind !== "rank" || String(t.rank_id) !== a.rankId) return bad(404, "device", "That device is not a shared device at this rank");
    if (t.status !== "active") return bad(409, "device_inactive", "That device is not active");
    const busy = (await db.query(`SELECT terminal_id, vehicle_id, queue_id FROM loading_sessions WHERE rank_id = $1 AND status IN ('pending','loading')`, [a.rankId])).rows;
    if (busy.some((s) => String(s.terminal_id) === a.terminalId)) return bad(409, "device_busy", "That device is already loading a vehicle");
    const waiting = (await db.query(`SELECT id, vehicle_id FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL ORDER BY joined_at, id`, [a.rankId])).rows;
    const open = new Set(busy.map((s) => String(s.queue_id)));
    const q = a.queueId ? waiting.find((w) => String(w.id) === a.queueId) : waiting.find((w) => !open.has(String(w.id)));
    if (!q) return bad(409, "queue", a.queueId ? "That vehicle is not waiting at this rank" : "Nobody is waiting at this rank");
    if (busy.some((s) => String(s.vehicle_id) === String(q.vehicle_id))) return bad(409, "vehicle_busy", "That vehicle is already loading");
    let id: string;
    try {
      id = String((await db.query(`INSERT INTO loading_sessions (terminal_id, rank_id, queue_id, vehicle_id, route_id, marshal_id, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [t.id, a.rankId, q.id, q.vehicle_id, t.route_id ?? null, a.marshalId, now()])).rows[0].id);
    } catch (e) { if (isUniqueViolation(e)) return bad(409, "busy", "That device or vehicle is already loading"); throw e; }
    await record(a.marshalId, a.actorName, "rank.session_open", id, { rankId: a.rankId, terminalId: t.id, serial: t.serial, vehicleId: q.vehicle_id });
    return { ok: true, value: view(await byId(id)) };
  }

  /**
   * The DEVICE reports the driver's card. Pairs the device's waiting session to that driver, or says exactly why not. The same card tapped again for the same session is answered as before
   * (a retry), and a device already loading a different driver is refused: a device pairs with one driver session at a time.
   */
  async function pair(a: { terminalId: string; serial: string; cardUid: unknown }): Promise<Res<SessionView & { replayed: boolean }>> {
    await expireStale();
    const uid = normaliseCardUid(a.cardUid);
    if (!uid) return bad(400, "bad_card", "Card not recognised");
    const hash = cardHash(uid), last4 = uid.slice(-4);
    const s = (await db.query(`SELECT s.*, v.owner_id, v.driver_id AS vehicle_driver FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.terminal_id = $1 AND s.status IN ('pending','loading')`, [a.terminalId])).rows[0];
    if (!s) { await record(null, `terminal:${a.serial}`, "rank.pair_refused", a.terminalId, { reason: "no_session", card: last4 }); return bad(409, "no_session", "No vehicle is waiting to load on this device"); }
    const c = (await db.query(`SELECT c.id, c.status, w.user_id, w.role, w.status AS wallet_status FROM token_cards c JOIN token_wallets w ON w.id = c.wallet_id WHERE c.card_hash = $1`, [hash])).rows[0];
    const refuse = async (status: number, code: string, message: string) => { await record(null, `terminal:${a.serial}`, "rank.pair_refused", String(s.id), { reason: code, card: last4 }); return bad(status, code, message); };
    if (!c) return refuse(404, "card_unknown", "This card is not registered");
    if (c.status !== "active" || c.wallet_status !== "active") return refuse(403, "card_blocked", "This card cannot be used");
    if (c.role !== "driver") return refuse(403, "not_driver_card", "This is not a driver card");
    if (s.status === "loading") {
      if (String(s.driver_card_id) === String(c.id)) return { ok: true, value: { ...view((await byId(String(s.id)))!), replayed: true } };
      return refuse(409, "device_busy", "This device is already loading another driver");
    }
    // The driver has to be the one on this vehicle: the driver the owner put on it, or one of the owner's active drivers.
    const driver = String(c.user_id);
    const linked = String(s.vehicle_driver ?? "") === driver || (await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2 AND status = 'active'`, [s.owner_id, driver])).rows.length > 0;
    if (!linked) return refuse(403, "wrong_driver", "This driver is not registered for this vehicle");
    let claimed;
    try {
      claimed = (await db.query(`UPDATE loading_sessions SET status = 'loading', driver_id = $2, driver_card_id = $3, paired_at = $4 WHERE id = $1 AND status = 'pending' RETURNING id`, [s.id, driver, c.id, now()])).rows[0];
    } catch (e) { if (isUniqueViolation(e)) return refuse(409, "driver_busy", "This driver is already loading another vehicle"); throw e; }
    if (!claimed) return refuse(409, "not_pending", "This session is no longer waiting for a driver");
    await record(driver, `terminal:${a.serial}`, "rank.paired", String(s.id), { terminalId: a.terminalId, driverId: driver, card: last4, vehicleId: s.vehicle_id });
    return { ok: true, value: { ...view((await byId(String(s.id)))!), replayed: false } };
  }

  /** Cancels a session that never loaded, or was started on the wrong vehicle. One that already has passengers paying cannot be cancelled: it has to depart. */
  async function cancel(a: { sessionId: string; rankId: string; marshalId: string; actorName: string; reason?: string | null }): Promise<Res<SessionView>> {
    const s = await byId(a.sessionId, a.rankId);
    if (!s) return bad(404, "session", "Session not found");
    if (s.status === "cancelled") return { ok: true, value: view(s) };
    if (s.status === "closed") return bad(409, "closed", "That vehicle has already departed");
    if (Number(s.total_cents) > 0 || Number(s.passengers) > 0) return bad(409, "has_payments", "Passengers have already paid on this session. End it as a departure instead.");
    const r = await db.query(`UPDATE loading_sessions SET status = 'cancelled', ended_at = $2, close_reason = $3 WHERE id = $1 AND status IN ('pending','loading') RETURNING id`, [s.id, now(), a.reason ?? "Cancelled by the marshal"]);
    if (!r.rows.length) return bad(409, "changed", "That session has just changed. Refresh and try again.");
    await record(a.marshalId, a.actorName, "rank.session_cancel", String(s.id), { reason: a.reason ?? null });
    return { ok: true, value: view((await byId(String(s.id)))!) };
  }

  /** The vehicle departs. The session is closed first (an atomic step, so it can only happen once), then the vehicle takes its place out of the queue and the departure is logged as the marshal's Depart does. */
  async function close(a: { sessionId: string; rankId: string; marshalId: string; actorName: string; passengers?: number | null; note?: string | null }): Promise<Res<SessionView>> {
    const s = await byId(a.sessionId, a.rankId);
    if (!s) return bad(404, "session", "Session not found");
    if (s.status === "closed") return { ok: true, value: view(s) };                                // a repeat of the same request
    if (s.status !== "loading") return bad(409, "not_loading", s.status === "pending" ? "That vehicle has not paired with its driver yet. Cancel the session instead." : "That session is not loading");
    const claimed = (await db.query(`UPDATE loading_sessions SET status = 'closed', ended_at = $2 WHERE id = $1 AND status = 'loading' RETURNING id`, [s.id, now()])).rows[0];
    if (!claimed) return bad(409, "changed", "That session has just changed. Refresh and try again.");
    if (s.queue_id) await db.query(`UPDATE rank_queue SET left_at = $2 WHERE id = $1 AND left_at IS NULL`, [s.queue_id, now()]);
    const pax = a.passengers ?? (Number(s.passengers) || null);
    const dep = (await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, passengers, note, departed_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [s.rank_id, s.vehicle_id, s.driver_id, a.marshalId, pax, a.note ?? null, now()])).rows[0];
    await db.query(`UPDATE loading_sessions SET departure_id = $2, passengers = COALESCE($3, passengers) WHERE id = $1`, [s.id, dep.id, pax]);
    await record(a.marshalId, a.actorName, "rank.session_close", String(s.id), { departureId: dep.id, passengers: pax, totalCents: Number(s.total_cents) });
    return { ok: true, value: view((await byId(String(s.id)))!) };
  }

  /** What the marshal sees: the queue with each vehicle's loading status, and the rank's devices with whether each is online and in use. */
  async function board(rankId: string): Promise<BoardView> {
    await expireStale();
    const waiting = (await db.query(`SELECT q.id, q.vehicle_id, q.joined_at, v.registration, v.seats FROM rank_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.rank_id = $1 AND q.left_at IS NULL ORDER BY q.joined_at, q.id`, [rankId])).rows;
    const open = (await db.query(`${SESSION_SQL} WHERE s.rank_id = $1 AND s.status IN ('pending','loading')`, [rankId])).rows;
    const devices = (await db.query(`SELECT id, serial, model, status, last_seen_at, route_id FROM terminals WHERE kind = 'rank' AND rank_id = $1 ORDER BY serial`, [rankId])).rows;
    const t = now().getTime();
    return {
      queue: waiting.map((w) => { const s = open.find((x) => String(x.queue_id) === String(w.id)); return {
        id: String(w.id), vehicleId: String(w.vehicle_id), registration: String(w.registration), seats: w.seats === null ? null : Number(w.seats), joinedAt: iso(w.joined_at)!,
        status: !s ? "waiting" as const : s.status === "pending" ? "pairing" as const : "loading" as const, sessionId: s ? String(s.id) : null, driverName: s?.driver_name ? String(s.driver_name) : null,
      }; }),
      devices: devices.map((d) => ({ id: String(d.id), serial: String(d.serial), model: String(d.model ?? ""), status: String(d.status), lastSeenAt: iso(d.last_seen_at), online: !!d.last_seen_at && t - new Date(d.last_seen_at as string).getTime() <= ONLINE_WITHIN_MS,
        routeId: d.route_id ? String(d.route_id) : null, sessionId: (() => { const s = open.find((x) => String(x.terminal_id) === String(d.id)); return s ? String(s.id) : null; })() })),
    };
  }

  return { open, pair, cancel, close, board, expireStale };
}
/**
 * Whether a terminal may be set up (or changed) as a SHARED RANK DEVICE: kind "rank", at one rank, charging one route. The rank has to be at one end of that route, and a route has one active
 * device at each end. Settings that do not touch any of that are always fine.
 */
export async function checkRankDevice(db: Db, terminalId: string, input: { kind?: unknown; rankId?: unknown; routeId?: unknown }): Promise<Res<null>> {
  const { kind, rankId, routeId } = input;
  if (kind !== undefined && kind !== "vehicle" && kind !== "rank") return bad(400, "kind", "kind must be 'vehicle' or 'rank'");
  if (rankId === undefined && routeId === undefined && kind !== "rank") return { ok: true, value: null };
  const cur = (await db.query(`SELECT kind, rank_id, route_id FROM terminals WHERE id = $1`, [terminalId])).rows[0];
  if (!cur) return bad(404, "terminal", "Terminal not found");
  const k = kind ?? cur.kind, rk = rankId ?? cur.rank_id, rt = routeId ?? cur.route_id;
  if (k !== "rank") return { ok: true, value: null };
  if (!rk || !rt) return bad(400, "rank_route", "A rank device needs both a rank and a route");
  const rank = (await db.query(`SELECT id FROM ranks WHERE id = $1`, [rk])).rows[0];
  const route = (await db.query(`SELECT id, from_rank_id, to_rank_id FROM token_routes WHERE id = $1`, [rt])).rows[0];
  if (!rank) return bad(400, "rank", "That rank does not exist");
  if (!route) return bad(400, "route", "That route does not exist");
  if (![route.from_rank_id, route.to_rank_id].map(String).includes(String(rk))) return bad(400, "not_on_route", "That rank is not at either end of that route");
  const clash = (await db.query(`SELECT serial FROM terminals WHERE kind = 'rank' AND status = 'active' AND rank_id = $1 AND route_id = $2 AND id <> $3`, [rk, rt, terminalId])).rows[0];
  if (clash) return bad(409, "end_taken", `Device ${clash.serial} is already the device for that end of that route`);
  return { ok: true, value: null };
}
export type RankSessions = ReturnType<typeof createRankSessions>;
