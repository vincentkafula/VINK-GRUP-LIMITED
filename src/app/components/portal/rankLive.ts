import { useEffect, useRef, useState } from "react";
import { connectLiveSocket } from "../../services/liveSocket";

/**
 * Listens for the live events about the signed-in person's own loading session (rank.session, rank.tap). The server sends them to that driver and their marshal only, never to everyone, so
 * this never sees anyone else's. An event is a nudge: the screen fetches the real state when one arrives rather than trusting the event as the source of truth. Returns whether the live
 * connection is up, so a screen can poll more often when it is not.
 */
export function useRankLive(onEvent: (event: string, data: unknown) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent); handler.current = onEvent;
  useEffect(() => connectLiveSocket((event, data) => { if (event.startsWith("rank.")) handler.current(event, data); }, setConnected), []);
  return connected;
}
