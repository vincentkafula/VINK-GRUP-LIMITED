import type { WebSocket, WebSocketServer } from "ws";
import type { AuthPayload } from "../types/auth.js";

export type VerifiedToken = (AuthPayload & { exp?: number }) | null;

/**
 * Who may see which events. A broadcast goes to every signed-in client, so only things that are harmless to everyone belong in one. These carry money or device detail (a tap's fare and fee
 * split, faults, route violations, retail transactions): no screen uses them for anyone but staff, so they go to staff only. Anything about one person (a driver's loading session)
 * is sent to that person by id (sendToUsers), never broadcast.
 */
export const STAFF_EVENT_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;
const STAFF_ONLY_PREFIXES = ["terminal.", "route.", "retail."];
export const isStaffOnlyEvent = (event: string): boolean => STAFF_ONLY_PREFIXES.some((p) => event.startsWith(p));

/**
 * Live event feed for signed-in clients only.
 *
 * A socket must send {"type":"auth","token":"<access token>"} within `authTimeoutMs` of connecting, or it is closed (code 4401).
 * Until then it receives nothing. When its access token expires the socket is closed with 4401 so the client reconnects with a
 * fresh one. The token is sent as a message, not in the URL, so it never lands in access logs or browser history.
 */
export class LiveHub {
  private authed = new Map<WebSocket, { userId: string; role: string }>();           // the sockets that have signed in, and who each is
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
      this.authed.set(ws, { userId: String(who.userId), role: String(who.role) });
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
    for (const ws of this.authed.keys()) if (ws.readyState === 1 /* OPEN */) ws.send(payload);
  }

  /** Sends to the given people only (a person may be signed in on several devices, and each gets it). Anyone else, signed in or not, receives nothing. */
  sendToUsers(userIds: readonly string[], event: { event: string; timestamp: string; data: unknown }): void {
    const want = new Set(userIds.map(String)), payload = JSON.stringify(event);
    for (const [ws, who] of this.authed) if (want.has(who.userId) && ws.readyState === 1) ws.send(payload);
  }

  /** Sends to signed-in clients holding one of the given roles. */
  sendToRoles(roles: readonly string[], event: { event: string; timestamp: string; data: unknown }): void {
    const want = new Set(roles), payload = JSON.stringify(event);
    for (const [ws, who] of this.authed) if (want.has(who.role) && ws.readyState === 1) ws.send(payload);
  }
}
