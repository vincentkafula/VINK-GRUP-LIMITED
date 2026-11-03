import { randomUUID } from "node:crypto";
import { isUniqueViolation, type Db } from "./common.js";
import { cardHash, normaliseCardUid } from "../services/tokenService.js";
import { emitTo } from "../services/wsBroadcast.js";

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
  queue: { id: string; vehicleId: string; registration: string; seats: number | null; joinedAt: string; status: "waiting" | "pairing" | "loading"; sessionId: string | null; driverName: string | null; passengers: number; totalCents: number }[];
  devices: { id: string; serial: string; model: string; status: string; lastSeenAt: string | null; online: boolean; routeId: string | null; sessionId: string | null }[];
}

/** How long a device waits for the driver's card before the session is cancelled, and how recently a device must have reported to count as online. */
export const PAIR_WINDOW_MS = 10 * 60_000;
/** The same card tapped again on the same session inside this window is not charged twice. (Someone paying for two passengers taps twice on purpose, so it is short.) */
export const DUPLICATE_WINDOW_MS = 10_000;
/** What the token service answers to a tap. */
export type TapAnswer = { ok: true; tapId: string; fareCents: number; balanceCents: number; route: string; replayed: boolean } | { ok: false; status: number; code: string; message: string; tapId?: string };
export type TapFn = (t: { terminalId: string; cardUid: unknown; routeId: string; key: string; sessionId: string; at?: Date | null }) => Promise<TapAnswer>;
/** Taps a device made without a signal and sends later: at most this many in one request, and none older than this (a device that has been off for days has a problem to look at, not taps to trust). */
export const MAX_OFFLINE_BATCH = 200;
export const MAX_OFFLINE_AGE_MS = 72 * 3600_000;
export interface SyncItem { key: unknown; cardUid: unknown; at: unknown }
export interface SyncResult { key: string; status: "accepted" | "replayed" | "declined" | "rejected"; code?: string; message?: string; tapId?: string; sessionId?: string }
export const ONLINE_WITHIN_MS = 3 * 60_000;

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export function createRankSessions(db: Db, now: () => Date = () => new Date(), pairWindowMs: number = PAIR_WINDOW_MS, hooks: { onClosed?: (sessionId: string) => Promise<unknown>; notify?: (userIds: string[], event: string, data: unknown) => void } = {}) {
  async function record(actorId: string | null, actorName: string, action: string, target: string, details: Record<string, unknown>): Promise<void> {
    try { await db.query(`INSERT INTO audit_log (id, actor_id, actor_name, action, target, details) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), actorId, actorName, action, target, JSON.stringify(details)]); }
    catch (e) { console.error("[rank] audit failed:", e instanceof Error ? e.message : e); }
  }

  /** A live nudge to particular people (never everyone). Best effort: it can never make the action that caused it fail. */
  const tell = (ids: (string | null | undefined)[], event: string, data: unknown): void => {
    const who = [...new Set(ids.filter((x): x is string => !!x).map(String))];
    try { (hooks.notify ?? emitTo)(who, event, data); } catch { /* ignore */ }
  };

  const SESSION_SQL = `SELECT s.*, v.registration, u.name AS driver_name FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id LEFT JOIN users u ON u.id = s.driver_id`;
  const view = (r: Record<string, any>): SessionView => ({
    id: String(r.id), status: r.status, rankId: String(r.rank_id), terminalId: String(r.terminal_id), vehicleId: String(r.vehicle_id), registration: r.registration ?? null, routeId: r.route_id ? String(r.route_id) : null,
    driverId: r.driver_id ? String(r.driver_id) : null, driverName: r.driver_name ?? null, marshalId: String(r.marshal_id),
    startedAt: iso(r.started_at)!, pairedAt: iso(r.paired_at), endedAt: iso(r.ended_at), passengers: Number(r.passengers ?? 0), totalCents: Number(r.total_cents ?? 0), departureId: r.departure_id ? String(r.departure_id) : null, closeReason: r.close_reason ?? null,
  });
  const byId = async (id: string, rankId?: string) => (await db.query(`${SESSION_SQL} WHERE s.id = $1${rankId ? " AND s.rank_id = $2" : ""}`, rankId ? [id, rankId] : [id])).rows[0] ?? null;
  /** Tells the session's marshal and driver (and nobody else) that it changed, with its new state. */
  const announce = async (id: string): Promise<void> => { const r = await byId(id); if (r) tell([r.marshal_id as string, r.driver_id as string | null], "rank.session", { session: view(r) }); };

  /** A session still waiting for the driver's card after the window is cancelled, so a forgotten one can never block a device. */
  async function expireStale(): Promise<number> {
    const cutoff = new Date(now().getTime() - pairWindowMs);
    const r = await db.query(`UPDATE loading_sessions SET status = 'cancelled', ended_at = $1, close_reason = 'No driver card was tapped in time' WHERE status = 'pending' AND started_at < $2 RETURNING id`, [now(), cutoff]);
    for (const row of r.rows) { await record(null, "system", "rank.session_expired", String(row.id), {}); await announce(String(row.id)); }
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
    await announce(id);
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
    let s = (await db.query(`SELECT s.*, v.owner_id, v.driver_id AS vehicle_driver FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.terminal_id = $1 AND s.status IN ('pending','loading')`, [a.terminalId])).rows[0];
    // A device the owner fitted to their own vehicle has no marshal to open a session: the driver's card is what opens it (and pairs it, in one step).
    let ownerDevice = false;
    if (!s) {
      const t = (await db.query(`SELECT t.id, t.vehicle_id, t.route_id, v.owner_id, v.driver_id AS vehicle_driver FROM terminals t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = $1 AND t.kind = 'vehicle' AND t.status = 'active'`, [a.terminalId])).rows[0];
      if (!t) { await record(null, `terminal:${a.serial}`, "rank.pair_refused", a.terminalId, { reason: "no_session", card: last4 }); return bad(409, "no_session", "No vehicle is waiting to load on this device"); }
      s = { id: null, status: "pending", terminal_id: t.id, vehicle_id: t.vehicle_id, route_id: t.route_id, owner_id: t.owner_id, vehicle_driver: t.vehicle_driver, rank_id: null, marshal_id: null };
      ownerDevice = true;
    }
    const c = (await db.query(`SELECT c.id, c.status, w.user_id, w.role, w.status AS wallet_status FROM token_cards c JOIN token_wallets w ON w.id = c.wallet_id WHERE c.card_hash = $1`, [hash])).rows[0];
    const refuse = async (status: number, code: string, message: string) => { await record(null, `terminal:${a.serial}`, "rank.pair_refused", String(s.id ?? a.terminalId), { reason: code, card: last4 }); return bad(status, code, message); };
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
      claimed = ownerDevice
        ? (await db.query(`INSERT INTO loading_sessions (terminal_id, vehicle_id, route_id, driver_id, driver_card_id, status, started_at, paired_at) VALUES ($1,$2,$3,$4,$5,'loading',$6,$6) RETURNING id`, [s.terminal_id, s.vehicle_id, s.route_id ?? null, driver, c.id, now()])).rows[0]
        : (await db.query(`UPDATE loading_sessions SET status = 'loading', driver_id = $2, driver_card_id = $3, paired_at = $4 WHERE id = $1 AND status = 'pending' RETURNING id`, [s.id, driver, c.id, now()])).rows[0];
    } catch (e) { if (isUniqueViolation(e)) return refuse(409, "driver_busy", "This driver, or this vehicle, is already loading"); throw e; }
    if (claimed && ownerDevice) s = { ...s, id: claimed.id };
    if (!claimed) return refuse(409, "not_pending", "This session is no longer waiting for a driver");
    await record(driver, `terminal:${a.serial}`, "rank.paired", String(s.id), { terminalId: a.terminalId, driverId: driver, card: last4, vehicleId: s.vehicle_id });
    await announce(String(s.id));
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
    await announce(String(s.id));
    return { ok: true, value: view((await byId(String(s.id)))!) };
  }

  /** The vehicle departs. The session is closed first (an atomic step, so it can only happen once), then the vehicle takes its place out of the queue and the departure is logged as the marshal's Depart does. */
  async function close(a: { sessionId: string; rankId?: string | null; marshalId?: string | null; actorName: string; actorId?: string | null; by?: "marshal" | "driver" | "owner"; passengers?: number | null; note?: string | null }): Promise<Res<SessionView>> {
    const s = await byId(a.sessionId, a.rankId ?? undefined);
    if (!s) return bad(404, "session", "Session not found");
    if (s.status === "closed") return { ok: true, value: view(s) };                                // a repeat of the same request
    if (s.status !== "loading") return bad(409, "not_loading", s.status === "pending" ? "That vehicle has not paired with its driver yet. Cancel the session instead." : "That session is not loading");
    const claimed = (await db.query(`UPDATE loading_sessions SET status = 'closed', ended_at = $2 WHERE id = $1 AND status = 'loading' RETURNING id`, [s.id, now()])).rows[0];
    if (!claimed) return bad(409, "changed", "That session has just changed. Refresh and try again.");
    if (s.queue_id) await db.query(`UPDATE rank_queue SET left_at = $2 WHERE id = $1 AND left_at IS NULL`, [s.queue_id, now()]);
    const pax = a.passengers ?? (Number(s.passengers) || null);
    // A session at a rank is a departure the marshal logged. A session on an owner's own device has no rank, no queue and no marshal, so it has no departure: it is just the driver's trip.
    const dep = s.rank_id ? (await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, passengers, note, departed_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [s.rank_id, s.vehicle_id, s.driver_id, a.marshalId ?? s.marshal_id, pax, a.note ?? null, now()])).rows[0] : null;
    await db.query(`UPDATE loading_sessions SET departure_id = $2, passengers = COALESCE($3, passengers) WHERE id = $1`, [s.id, dep?.id ?? null, pax]);
    await record(a.actorId ?? a.marshalId ?? null, a.actorName, "rank.session_close", String(s.id), { departureId: dep?.id ?? null, passengers: pax, totalCents: Number(s.total_cents), by: a.by ?? "marshal" });
    await announce(String(s.id));
    // The session becomes a trip for ITS vehicle, driver and marshal. If that fails the departure still stands and the money cycle makes the trip on its next run.
    if (hooks.onClosed) { try { await hooks.onClosed(String(s.id)); } catch (e) { console.error("[rank] the trip for a closed session will be made by the next cycle:", e instanceof Error ? e.message : e); } }
    return { ok: true, value: view((await byId(String(s.id)))!) };
  }

  /**
   * A PASSENGER taps their VINK card on the rank device. It is charged only while a driver is paired, at the fare of the route the device serves (the server decides the amount), to the
   * session, so the money and the trip follow that session's driver and vehicle. A retry with the same reference is answered as before and never charged twice; the same card again within
   * a few seconds, on a new reference, is refused so a double tap cannot charge twice; a card without enough tokens is declined. Each session's passenger count and total are recounted from its taps.
   */
  async function tap(a: { terminalId: string; serial: string; cardUid: unknown; key: string }, charge: TapFn): Promise<Res<{ tapId: string; fareCents: number; balanceCents: number; route: string; replayed: boolean; session: { id: string; registration: string | null; driverName: string | null; passengers: number; totalCents: number } }>> {
    const s = (await db.query(`${SESSION_SQL} WHERE s.terminal_id = $1 AND s.status IN ('pending','loading')`, [a.terminalId])).rows[0];
    if (!s) return bad(409, "no_session", "No vehicle is loading on this device");
    if (s.status === "pending") return bad(409, "not_paired", "Waiting for the driver to tap their driver card");
    const term = (await db.query(`SELECT route_id FROM terminals WHERE id = $1`, [a.terminalId])).rows[0];
    if (!term?.route_id) return bad(409, "no_route", "This device has no route, so no fare, set");
    const uid = normaliseCardUid(a.cardUid);
    if (!uid) return bad(400, "bad_card", "Card not recognised");
    const ref = `toktap:${a.terminalId}:${a.key}`;
    const seen = (await db.query(`SELECT id FROM terminal_taps WHERE terminal_id = $1 AND idempotency_key = $2`, [a.terminalId, ref])).rows[0];
    if (!seen) {                                                                                      // a retry of a tap already answered skips this check and is answered as before
      const masked = `VINK ****${uid.slice(-4)}`;
      const recent = (await db.query(`SELECT id FROM terminal_taps WHERE session_id = $1 AND masked_pan = $2 AND status = 'confirmed' AND received_at >= $3 LIMIT 1`, [s.id, masked, new Date(Date.now() - DUPLICATE_WINDOW_MS)])).rows[0];
      if (recent) { await record(null, `terminal:${a.serial}`, "rank.tap_blocked", String(s.id), { reason: "duplicate", card: uid.slice(-4) }); return bad(409, "duplicate_tap", "This card was just used. Wait a few seconds before tapping again."); }
    }
    const r = await charge({ terminalId: a.terminalId, cardUid: a.cardUid, routeId: String(term.route_id), key: a.key, sessionId: String(s.id) });
    if (!r.ok) return { ...bad(r.status, r.code, r.message), ...(r.tapId ? { tapId: r.tapId } : {}) } as Fail;
    const sum = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM terminal_taps WHERE session_id = $1 AND status = 'confirmed'`, [s.id])).rows[0];
    const passengers = Number(sum.n), totalCents = Math.round(Number(sum.total) * 100);
    await db.query(`UPDATE loading_sessions SET passengers = $2, total_cents = $3 WHERE id = $1`, [s.id, passengers, totalCents]);
    if (!r.replayed) tell([s.marshal_id as string, s.driver_id as string | null], "rank.tap", { sessionId: String(s.id), tap: { id: r.tapId, at: new Date().toISOString(), amountCents: r.fareCents, card: `VINK ****${uid.slice(-4)}`, status: "confirmed" }, passengers, totalCents });
    return { ok: true, value: { tapId: r.tapId, fareCents: r.fareCents, balanceCents: r.balanceCents, route: r.route, replayed: r.replayed, session: { id: String(s.id), registration: s.registration ? String(s.registration) : null, driverName: s.driver_name ? String(s.driver_name) : null, passengers, totalCents } } };
  }

  /**
   * The DRIVER presses "vehicle full, depart" on their own Loading Dashboard. It ends the session they are loading, exactly as the marshal's Depart does (the departure is logged under the marshal who
   * opened it, the vehicle leaves the queue, the trip is made), with the driver as the person who pressed it. A driver can only depart their own session.
   */
  async function departByDriver(a: { driverId: string; actorName: string; passengers?: number | null; note?: string | null }): Promise<Res<SessionView>> {
    const s = (await db.query(`SELECT id, rank_id, marshal_id FROM loading_sessions WHERE driver_id = $1 AND status = 'loading'`, [a.driverId])).rows[0];
    if (!s) return bad(409, "no_session", "You are not loading a vehicle right now");
    return close({ sessionId: String(s.id), rankId: s.rank_id ? String(s.rank_id) : null, marshalId: s.marshal_id ? String(s.marshal_id) : null, actorName: a.actorName, actorId: a.driverId, by: "driver", passengers: a.passengers ?? null, note: a.note ?? null });
  }

  /**
   * An OWNER ends a session on their own vehicle, for a driver who forgot to or has left: only a session on one of the owner's own vehicles. It is the same departure and trip as the driver's.
   */
  async function endByOwner(a: { ownerId: string; sessionId: string; actorName: string }): Promise<Res<SessionView>> {
    const s = (await db.query(`SELECT s.id, s.rank_id, s.marshal_id, s.status FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.id = $1 AND v.owner_id = $2`, [a.sessionId, a.ownerId])).rows[0];
    if (!s) return bad(404, "session", "Session not found");
    return close({ sessionId: String(s.id), rankId: s.rank_id ? String(s.rank_id) : null, marshalId: s.marshal_id ? String(s.marshal_id) : null, actorName: a.actorName, actorId: a.ownerId, by: "owner" });
  }

  /**
   * TAPS MADE WITHOUT A SIGNAL. A device that loses its connection keeps taking taps and sends them later, each with the time it really happened and its own reference. Each one is placed in the
   * session that was loading on that device AT THAT TIME (not whichever is open now), so the fare goes to the driver who was driving then. A tap made when no driver was paired is refused and
   * charges nothing. Each tap is decided on its own (one bad one never stops the rest), a resent batch charges nothing twice (each reference answers as before), the double-tap rule uses the
   * original times, and taps for a vehicle that has already left join its trip. The answer lists every tap, in the order sent.
   */
  async function syncTaps(a: { terminalId: string; serial: string; taps: unknown }, charge: TapFn): Promise<Res<{ results: SyncResult[]; accepted: number; replayed: number; declined: number; rejected: number }>> {
    const list = Array.isArray(a.taps) ? (a.taps as SyncItem[]) : [];
    if (!list.length) return bad(400, "empty", "There are no taps to send");
    if (list.length > MAX_OFFLINE_BATCH) return bad(400, "too_many", `Send at most ${MAX_OFFLINE_BATCH} taps at a time`);
    const term = (await db.query(`SELECT route_id FROM terminals WHERE id = $1`, [a.terminalId])).rows[0];
    if (!term?.route_id) return bad(409, "no_route", "This device has no route, so no fare, set");
    const results: SyncResult[] = new Array(list.length), touched = new Set<string>();
    const nowMs = now().getTime();
    // oldest first, so the double-tap rule always sees the earlier tap first, whatever order the device sent them in
    const order = list.map((item, i) => ({ item, i, t: new Date(String((item as SyncItem)?.at ?? "")).getTime() })).sort((x, y) => (Number.isNaN(x.t) ? Infinity : x.t) - (Number.isNaN(y.t) ? Infinity : y.t) || x.i - y.i);
    for (const { item, i, t } of order) {
      const key = typeof item?.key === "string" ? item.key : "";
      const no = (code: string, message: string): SyncResult => ({ key, status: "rejected", code, message });
      if (!/^[A-Za-z0-9._-]{6,80}$/.test(key)) { results[i] = no("bad_key", "A unique tap reference is required"); continue; }
      const uid = normaliseCardUid(item.cardUid); if (!uid) { results[i] = no("bad_card", "Card not recognised"); continue; }
      if (Number.isNaN(t)) { results[i] = no("bad_time", "The time of the tap is not valid"); continue; }
      if (t > nowMs + 5 * 60_000) { results[i] = no("bad_time", "The tap is dated in the future"); continue; }
      if (nowMs - t > MAX_OFFLINE_AGE_MS) { results[i] = no("too_old", "That tap is too old to accept. Contact VINK."); continue; }
      const at = new Date(t), ref = `toktap:${a.terminalId}:${key}`;
      const seen = (await db.query(`SELECT id, status, session_id FROM terminal_taps WHERE terminal_id = $1 AND idempotency_key = $2`, [a.terminalId, ref])).rows[0];
      if (seen) { results[i] = seen.status === "confirmed" ? { key, status: "replayed", tapId: String(seen.id), ...(seen.session_id ? { sessionId: String(seen.session_id) } : {}) } : { key, status: "declined", code: "insufficient_tokens", message: "Not enough tokens", tapId: String(seen.id) }; continue; }
      const s = (await db.query(`SELECT s.id FROM terminals t JOIN loading_sessions s ON s.terminal_id = t.id WHERE t.id = $1 AND s.status IN ('loading','closed') AND s.paired_at IS NOT NULL AND s.paired_at <= $2 AND (s.ended_at IS NULL OR s.ended_at >= $2) ORDER BY s.paired_at DESC LIMIT 1`, [a.terminalId, at])).rows[0];
      if (!s) { results[i] = no("no_session", "No driver was paired on this device at that time"); continue; }
      const near = (await db.query(`SELECT id FROM terminal_taps WHERE session_id = $1 AND masked_pan = $2 AND status = 'confirmed' AND received_at >= $3 AND received_at <= $4 LIMIT 1`, [s.id, `VINK ****${uid.slice(-4)}`, new Date(t - DUPLICATE_WINDOW_MS), new Date(t + DUPLICATE_WINDOW_MS)])).rows[0];
      if (near) { results[i] = no("duplicate_tap", "This card was used a moment before or after"); continue; }
      const r = await charge({ terminalId: a.terminalId, cardUid: item.cardUid, routeId: String(term.route_id), key, sessionId: String(s.id), at });
      if (!r.ok) { results[i] = { key, status: "declined", code: r.code, message: r.message, ...(r.tapId ? { tapId: r.tapId } : {}) }; if (r.tapId) touched.add(String(s.id)); continue; }
      touched.add(String(s.id)); results[i] = { key, status: r.replayed ? "replayed" : "accepted", tapId: r.tapId, sessionId: String(s.id) };
    }
    for (const sid of touched) {
      const sum = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM terminal_taps WHERE session_id = $1 AND status = 'confirmed'`, [sid])).rows[0];
      await db.query(`UPDATE loading_sessions SET passengers = $2, total_cents = $3 WHERE id = $1`, [sid, Number(sum.n), Math.round(Number(sum.total) * 100)]);
      const st = (await db.query(`SELECT status FROM loading_sessions WHERE id = $1`, [sid])).rows[0]?.status;
      if (st === "closed" && hooks.onClosed) { try { await hooks.onClosed(sid); } catch (e) { console.error("[rank] the trip for late taps will be completed by the next cycle:", e instanceof Error ? e.message : e); } }       // joins the trip already made
      await announce(sid);
    }
    const count = (st: SyncResult["status"]) => results.filter((x) => x.status === st).length;
    return { ok: true, value: { results, accepted: count("accepted"), replayed: count("replayed"), declined: count("declined"), rejected: count("rejected") } };
  }

  /** What the driver's Loading Dashboard shows: the session they are driving now (passengers, running total, the latest taps) and their closed sessions in a period. */
  async function forDriver(driverId: string, period: { from: Date; to: Date }) {
    const cur = (await db.query(`${SESSION_SQL} WHERE s.driver_id = $1 AND s.status = 'loading'`, [driverId])).rows[0] ?? null;
    const taps = cur ? (await db.query(`SELECT id, amount, received_at, masked_pan, status FROM terminal_taps WHERE session_id = $1 ORDER BY received_at DESC, id DESC LIMIT 15`, [cur.id])).rows : [];
    // a closed session is a departure (the same record the marshal's list shows), so the day is this driver's departures in the period, with what each session collected
    const day = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(s.passengers), 0) AS p, COALESCE(SUM(s.total_cents), 0) AS t FROM departures d JOIN loading_sessions s ON s.departure_id = d.id WHERE d.driver_id = $1 AND d.departed_at >= $2 AND d.departed_at < $3`, [driverId, period.from, period.to])).rows[0];
    return {
      current: cur ? { ...view(cur), taps: taps.map((t) => ({ id: String(t.id), at: iso(t.received_at)!, amountCents: Math.round(Number(t.amount) * 100), card: String(t.masked_pan ?? ""), status: String(t.status) })) } : null,
      period: { sessions: Number(day.n), passengers: Number(day.p), totalCents: Number(day.t) },
    };
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
        passengers: s ? Number(s.passengers ?? 0) : 0, totalCents: s ? Number(s.total_cents ?? 0) : 0,
      }; }),
      devices: devices.map((d) => ({ id: String(d.id), serial: String(d.serial), model: String(d.model ?? ""), status: String(d.status), lastSeenAt: iso(d.last_seen_at), online: !!d.last_seen_at && t - new Date(d.last_seen_at as string).getTime() <= ONLINE_WITHIN_MS,
        routeId: d.route_id ? String(d.route_id) : null, sessionId: (() => { const s = open.find((x) => String(x.terminal_id) === String(d.id)); return s ? String(s.id) : null; })() })),
    };
  }

  return { open, pair, tap, syncTaps, cancel, close, departByDriver, endByOwner, board, forDriver, expireStale };
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
