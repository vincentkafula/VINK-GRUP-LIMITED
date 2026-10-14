import type { FastifyInstance } from "fastify";
import type { Deps, JwtUser } from "./app";

/**
 * Live tap feed for the dashboard: GET /api/ws/feed?token=<staff JWT> upgrades to a WebSocket and then pushes events as they happen.
 * (Browsers cannot set headers on a WebSocket, so the token travels in the address; it expires with the session and the connection
 * is closed as soon as it does. Put the API behind TLS so the address is not readable in transit.)
 */
export async function feedRoutes(app: FastifyInstance, { hub }: Deps): Promise<void> {
  app.get("/ws/feed", { websocket: true }, (socket, req) => {
    const token = String((req.query as { token?: string }).token ?? "");
    let user: JwtUser | undefined;
    try { user = app.jwt.verify<JwtUser & { exp?: number }>(token); } catch { /* handled below */ }
    if (!user) { socket.close(4401, "unauthorized"); return; }
    const exp = (user as { exp?: number }).exp;
    const unsub = hub.subscribe((e) => { if (socket.readyState === 1) socket.send(JSON.stringify(e)); });
    const timer = exp ? setTimeout(() => socket.close(4401, "session expired"), Math.max(0, exp * 1000 - Date.now())) : undefined;
    socket.send(JSON.stringify({ type: "hello", user: user.email }));
    socket.on("close", () => { unsub(); if (timer) clearTimeout(timer); });
  });
}
