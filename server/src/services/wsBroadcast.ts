/**
 * Lets other modules (VinkPay, the webhook handler) emit a WebSocket event
 * without importing index.ts directly, which would create a circular
 * import (index.ts is the thing that imports routes/services, not the
 * other way around). index.ts calls setBroadcaster() once at startup with
 * its real broadcast function; everything else calls emit() and doesn't
 * need to know how the transport actually works.
 *
 * Explicitly NOT a replacement for real per-user targeting — the
 * underlying WS server still broadcasts to every connected client. That's
 * scheduled work (M4), not something silently faked here. Until that
 * exists, treat anything emitted through this as a best-effort nudge
 * ("something changed, maybe worth refetching"), never as the definitive
 * source of truth for a specific user's own data — callers still need to
 * fetch/poll the real authoritative state themselves.
 */

type Broadcaster = (event: { event: string; timestamp: string; data: unknown }) => void;

let broadcaster: Broadcaster | null = null;

export function setBroadcaster(fn: Broadcaster): void {
  broadcaster = fn;
}

export function emit(event: string, data: unknown): void {
  if (!broadcaster) return; // no-op if called before index.ts has wired it up, or in a context without a WS server at all
  broadcaster({ event, timestamp: new Date().toISOString(), data });
}
