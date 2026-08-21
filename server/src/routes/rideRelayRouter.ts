import { Router, Request, Response } from "express";
import { emit } from "../services/wsBroadcast.js";

/**
 * A deliberate bridge, not a migration: RideHailingSystem.tsx runs on
 * a genuinely separate Supabase Edge Function backend (confirmed by
 * reading its own fetch base URL) -- migrating its whole data layer
 * onto this Express/Postgres backend would be a much larger, riskier
 * undertaking than what was actually asked for here. This endpoint is
 * the smaller, real thing: whenever a ride event happens in that
 * separate system, the client can relay it here so it reaches the
 * same real-time WS infrastructure every other app in this session
 * (Control Centre, DriveDashboardViewer, the till/retail/restaurant
 * work) already broadcasts through.
 *
 * Deliberately unauthenticated, matching the reality of the system
 * it's relaying from -- RideHailingSystem.tsx's own api() helper sends
 * no auth header at all to its Supabase backend either. This is safe
 * specifically because of wsBroadcast.ts's own stated design
 * philosophy: every event through it is a "best-effort nudge, maybe
 * worth refetching," never authoritative state a receiver trusts
 * outright. A spoofed event here can, at worst, cause an unnecessary
 * refetch -- not corrupt any real data, since nothing in this backend
 * treats a WS event as a source of truth. Protected by strict event-
 * name whitelisting (only real ride-lifecycle events, not arbitrary
 * ones) and the existing global /api rate limiter, not a JWT.
 */

const router: ReturnType<typeof Router> = Router();

const ALLOWED_EVENTS = [
  "ride.requested",
  "ride.driver_assigned",
  "ride.status_changed",
  "ride.cancelled",
  "ride.completed",
] as const;

router.post("/relay-event", (req: Request, res: Response): void => {
  const { event, data } = req.body as { event?: string; data?: unknown };

  if (!event || !ALLOWED_EVENTS.includes(event as (typeof ALLOWED_EVENTS)[number])) {
    res.status(400).json({ success: false, error: `event must be one of: ${ALLOWED_EVENTS.join(", ")}` });
    return;
  }
  if (data === undefined || data === null || typeof data !== "object") {
    res.status(400).json({ success: false, error: "data is required and must be an object" });
    return;
  }

  emit(event, data);
  res.status(202).json({ success: true });
});

export default router;
