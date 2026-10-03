/**
 * General-purpose live WebSocket connection, usable by any component --
 * not scoped to one dashboard the way mvnoApi.ts's own connectLiveFeed()
 * is. Reuses the same robust pattern already proven there (auto-reconnect
 * with backoff, ping/pong heartbeat so idle connections don't get dropped
 * by proxies, demo-mode fallback) rather than inventing a second,
 * slightly different implementation.
 *
 * Connects to the real backend WS server at API_BASE_WS (server/src/
 * index.ts's WebSocketServer on /ws) -- the same server mvnoApi.ts talks
 * to, so any event emitted via server/src/services/wsBroadcast.ts's
 * emit() reaches every connected client, mobile or web.
 *
 * Same honesty as wsBroadcast.ts's own comment: this is a global
 * broadcast, not per-user targeted. Treat received events as "something
 * changed, maybe worth refetching" rather than authoritative per-user
 * state -- callers still own their own source of truth.
 */
import { API_BASE_WS } from "./config";
import { isDemoMode } from "./demoMode";
import { getToken, refreshSession, sendSocketAuth, SOCKET_AUTH_CLOSE } from "./authSession";

export type LiveEventHandler = (event: string, data: unknown) => void;
export type ConnectionStatusHandler = (connected: boolean) => void;

export interface LiveSocketOptions {
  /** Demo-mode events to simulate, keyed by event name, each with its own interval in ms. */
  demoEvents?: { event: string; data: () => unknown; intervalMs: number }[];
}

export function connectLiveSocket(onEvent: LiveEventHandler, onStatusChange?: ConnectionStatusHandler, options: LiveSocketOptions = {}): () => void {
  if (isDemoMode()) {
    onStatusChange?.(false);
    const timers = (options.demoEvents ?? []).map(d => setInterval(() => onEvent(d.event, d.data()), d.intervalMs));
    return () => timers.forEach(clearInterval);
  }

  let ws: WebSocket | null = null;
  let dead = false;
  let ping: ReturnType<typeof setInterval>;

  function connect() {
    if (dead) return;
    // The live feed is for signed-in users: with no token there is nothing to connect to (and nothing to retry forever).
    if (!getToken()) { onStatusChange?.(false); return; }
    ws = new WebSocket(API_BASE_WS);
    ws.onopen = () => {
      sendSocketAuth(ws!);
      onStatusChange?.(true);
      ping = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 25_000);
    };
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data as string);
        if (m.event) onEvent(m.event, m.data);
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = (ev) => {
      clearInterval(ping); onStatusChange?.(false);
      if (dead) return;
      // 4401 = the server rejected or expired our token: renew it first, then reconnect.
      if (ev.code === SOCKET_AUTH_CLOSE) { void refreshSession().then(() => { if (!dead) setTimeout(connect, 500); }); return; }
      setTimeout(connect, 3000);
    };
    ws.onerror = () => { /* handled by onclose */ };
  }

  connect();
  return () => { dead = true; clearInterval(ping); ws?.close(); };
}
