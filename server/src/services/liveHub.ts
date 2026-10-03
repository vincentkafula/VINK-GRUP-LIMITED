import type { WebSocket, WebSocketServer } from "ws";
import type { AuthPayload } from "../types/auth.js";

export type VerifiedToken = (AuthPayload & { exp?: number }) | null;

/**
 * Live event feed for signed-in clients only.
 *
 * A socket must send {"type":"auth","token":"<access token>"} within `authTimeoutMs` of connecting, or it is closed (code 4401).
 * Until then it receives nothing. When its access token expires the socket is closed with 4401 so the client reconnects with a
 * fresh one. The token is sent as a message, not in the URL, so it never lands in access logs or browser history.
 */
export class LiveHub {
  private authed = new Set<WebSocket>();
  constructor(private readonly verify: (token: string) => VerifiedToken, private readonly authTimeoutMs = 5000, private readonly log: (m: string) => void = () => {}) {}

  get size(): number { return this.authed.size; }

  attach(wss: WebSocketServer): void {
    wss.on("connection", (ws) => this.onConnection(ws));
  }

  onConnection(ws: WebSocket): void {
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => { if (!this.authed.has(ws)) ws.close(4401, "auth required"); }, this.authTimeoutMs);

    ws.on("message", (raw) => {
      let msg: { type?: unknown; token?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() })); return; }
      if (msg.type !== "auth" || this.authed.has(ws)) return;
      const who = typeof msg.token === "string" ? this.verify(msg.token) : null;
      if (!who) { ws.close(4401, "invalid token"); return; }
      clearTimeout(deadline);
      this.authed.add(ws);
      if (who.exp) {
        expiry = setTimeout(() => ws.close(4401, "token expired"), Math.max(0, who.exp * 1000 - Date.now()));
        expiry.unref?.();
      }
      this.log(`[WS] ${who.username} connected  total=${this.authed.size}`);
      ws.send(JSON.stringify({ event: "connected", timestamp: new Date().toISOString(), data: { clientCount: this.authed.size } }));
    });

    ws.on("close", () => { clearTimeout(deadline); if (expiry) clearTimeout(expiry); this.authed.delete(ws); });
    ws.on("error", (err) => this.log(`[WS] Socket error: ${err.message}`));
  }

  /** Sends to authenticated clients only. */
  broadcast(event: { event: string; timestamp: string; data: unknown }): void {
    const payload = JSON.stringify(event);
    for (const ws of this.authed) if (ws.readyState === 1 /* OPEN */) ws.send(payload);
  }
}
