import { applyBp, formatRand } from "../money";
import type { CardState } from "../desfire/layout";
import type { Category, FareTable, Route } from "./types";

/**
 * The fare rules, in one place, used by the validator (offline, from its copy of the table) and by the server (to check what devices report).
 * Pure: the same input always gives the same answer, with no clock, network or database.
 *
 * Model: flat routes charge on a single tap. Zone routes are "pay on exit": tapping in costs nothing but needs enough balance for the
 * route's maximum fare; tapping out charges the fare for the zones travelled. A trip never tapped out is charged the maximum fare the next
 * time the card is used. (Validators hold only the DEBIT key, so they can take money but never give it back; charging on exit keeps it that way.)
 */

export type DenyReason = "UNKNOWN_ROUTE" | "UNKNOWN_STOP" | "DUPLICATE_TAP" | "INSUFFICIENT_FUNDS";
export type TapKind = "flat" | "tap_in" | "tap_out" | "penalty_tap_in";

export interface TapInput {
  table: FareTable;
  routeId: number;
  stopId: number;
  /** Seconds since 1970-01-01 UTC. */
  now: number;
  category: Category;
  balance: number;
  state: CardState;
  deviceTag: number;
}

export type TapDecision =
  | { ok: true; kind: TapKind; fare: number; penalty: number; newState: CardState; message: string }
  | { ok: false; reason: DenyReason; message: string; needed?: number };

const route = (t: FareTable, id: number) => t.routes.find((r) => r.id === id);

/** Local day-of-week (0 = Sunday) and minute-of-day at an instant, for the table's UTC offset. */
export function localParts(epochSeconds: number, utcOffsetMinutes: number): { day: number; minute: number } {
  const local = new Date((epochSeconds + utcOffsetMinutes * 60) * 1000);
  return { day: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function timeMultiplierBp(t: FareTable, epochSeconds: number): number {
  const { day, minute } = localParts(epochSeconds, t.utcOffsetMinutes);
  const rule = t.timeRules.find((r) => r.days.includes(day) && minute >= r.startMinute && minute < r.endMinute);
  return rule ? rule.multiplierBp : 10000;
}

export function discountBp(t: FareTable, category: Category): number {
  return t.discounts.find((d) => d.category === category)?.discountBp ?? 0;
}

/** Base fare between two zones on a zone route. */
export function zoneBase(r: Route, fromZone: number, toZone: number): number {
  if (r.fare.mode !== "zone") throw new Error("not a zone route");
  const f = r.fare.zoneFares.find((z) => (z.from === fromZone && z.to === toZone) || (z.from === toZone && z.to === fromZone));
  return Math.min(Math.max(f ? f.amount : r.fare.maxFare, r.fare.minFare), r.fare.maxFare);
}

const adjust = (t: FareTable, base: number, at: number, category: Category) =>
  applyBp(applyBp(base, timeMultiplierBp(t, at)), 10000 - discountBp(t, category));

/** What a passenger needs on the card to tap in / pay on this route. */
export function requiredBalance(t: FareTable, r: Route, category: Category, at: number): number {
  return r.fare.mode === "flat" ? adjust(t, r.fare.flatAmount, at, category) : applyBp(r.fare.maxFare, 10000 - discountBp(t, category));
}

const money = formatRand;

export function evaluateTap(i: TapInput): TapDecision {
  const { table, state } = i;
  const r = route(table, i.routeId);
  if (!r) return { ok: false, reason: "UNKNOWN_ROUTE", message: "Route not set up" };
  const stop = r.stops.find((s) => s.id === i.stopId);
  if (!stop && r.fare.mode === "zone") return { ok: false, reason: "UNKNOWN_STOP", message: "Stop not set up" };

  // anti-passback: the same card at the same place again too soon
  if (state.counter > 0 && state.routeId === i.routeId && state.boardStopId === i.stopId && i.now - state.tapInEpoch >= 0 && i.now - state.tapInEpoch < r.apbSeconds) {
    return { ok: false, reason: "DUPLICATE_TAP", message: "Already tapped" };
  }

  // an unfinished trip: abandoned if it timed out or was on another route, otherwise this tap completes it
  let penalty = 0;
  let completing = false;
  if (state.inTrip) {
    const prev = route(table, state.routeId);
    const sameRoute = state.routeId === i.routeId;
    const timedOut = !prev || i.now - state.tapInEpoch > prev.tapOutTimeoutSeconds;
    if (sameRoute && !timedOut && r.fare.mode === "zone") completing = true;
    else if (prev && prev.fare.mode === "zone") penalty = prev.fare.maxFare;
  }

  const base: CardStateBase = { version: 1, routeId: i.routeId, deviceTag: i.deviceTag, counter: state.counter + 1 };

  if (r.fare.mode === "flat") {
    const fare = adjust(table, r.fare.flatAmount, i.now, i.category);
    const total = fare + penalty;
    if (i.balance < total) return { ok: false, reason: "INSUFFICIENT_FUNDS", needed: total, message: `Balance ${money(i.balance)}, need ${money(total)}` };
    return {
      ok: true, kind: "flat", fare: total, penalty,
      newState: { ...base, inTrip: false, tapInEpoch: i.now, boardStopId: i.stopId },
      message: `Paid ${money(total)} · Bal ${money(i.balance - total)}`,
    };
  }

  if (completing) {
    const from = r.stops.find((s) => s.id === state.boardStopId);
    const boardedZone = from ? from.zone : stop!.zone;
    const fare = adjust(table, zoneBase(r, boardedZone, stop!.zone), state.tapInEpoch, i.category);
    if (i.balance < fare) return { ok: false, reason: "INSUFFICIENT_FUNDS", needed: fare, message: `Balance ${money(i.balance)}, need ${money(fare)}` };
    return {
      ok: true, kind: "tap_out", fare, penalty: 0,
      newState: { ...base, inTrip: false, tapInEpoch: i.now, boardStopId: i.stopId },
      message: `Paid ${money(fare)} · Bal ${money(i.balance - fare)}`,
    };
  }

  // a tap in (possibly after an abandoned trip that is charged first)
  const need = requiredBalance(table, r, i.category, i.now) + penalty;
  if (i.balance < need) return { ok: false, reason: "INSUFFICIENT_FUNDS", needed: need, message: `Balance ${money(i.balance)}, need ${money(need)}` };
  return {
    ok: true, kind: penalty > 0 ? "penalty_tap_in" : "tap_in", fare: penalty, penalty,
    newState: { ...base, inTrip: true, tapInEpoch: i.now, boardStopId: i.stopId },
    message: penalty > 0 ? `Last trip ${money(penalty)} · Bal ${money(i.balance - penalty)}` : `Tap out when you leave · Bal ${money(i.balance)}`,
  };
}

type CardStateBase = Pick<CardState, "version" | "routeId" | "deviceTag" | "counter">;
