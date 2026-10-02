import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import type { AddressInfo } from "net";
import { LiveHub, type VerifiedToken } from "./liveHub.js";

/** Real WebSocket connections against a real server. */
let server: http.Server, url = "", hub: LiveHub;
const TOKENS: Record<string, VerifiedToken> = {
  good: { userId: "u1", username: "alice", role: "customer" },
  soon: { userId: "u2", username: "bob", role: "customer", exp: Math.floor(Date.now() / 1000) + 1 },
};

beforeAll(async () => {
  hub = new LiveHub((t) => TOKENS[t] ?? null, 300);
  server = http.createServer();
  hub.attach(new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 }));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(() => server.close());

function open() {
  const ws = new WebSocket(url), got: unknown[] = [];
  let closed: { code: number; reason: string } | null = null;
  ws.on("message", (d) => got.push(JSON.parse(d.toString())));
  ws.on("close", (code, reason) => { closed = { code, reason: reason.toString() }; });
  const ready = new Promise<void>((ok) => ws.on("open", () => ok()));
  return { ws, got, ready, closed: () => closed };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LiveHub", () => {
  it("an unauthenticated client receives nothing and is closed after the timeout", async () => {
    const c = open(); await c.ready;
    hub.broadcast({ event: "terminal.tap_received", timestamp: "t", data: { secret: 1 } });
    await wait(450);
    expect(c.got).toEqual([]);
    expect(c.closed()).toMatchObject({ code: 4401 });
  });

  it("a client with a valid token is welcomed and receives broadcasts", async () => {
    const c = open(); await c.ready;
    c.ws.send(JSON.stringify({ type: "auth", token: "good" }));
    await wait(100);
    expect(c.got[0]).toMatchObject({ event: "connected" });
    hub.broadcast({ event: "x.y", timestamp: "t", data: { n: 1 } });
    await wait(100);
    expect(c.got.at(-1)).toMatchObject({ event: "x.y", data: { n: 1 } });
    c.ws.close();
  });

  it("an invalid token closes the socket immediately", async () => {
    const c = open(); await c.ready;
    c.ws.send(JSON.stringify({ type: "auth", token: "forged" }));
    await wait(100);
    expect(c.closed()).toMatchObject({ code: 4401, reason: "invalid token" });
  });

  it("an authenticated socket is closed when its token expires, so the client reconnects with a fresh one", async () => {
    const c = open(); await c.ready;
    TOKENS.soon = { userId: "u2", username: "bob", role: "customer", exp: Math.floor(Date.now() / 1000) + 1 };
    c.ws.send(JSON.stringify({ type: "auth", token: "soon" }));
    await wait(1500);
    expect(c.closed()).toMatchObject({ code: 4401, reason: "token expired" });
  });

  it("ping is answered, and junk or oversize frames cannot hurt the server", async () => {
    const c = open(); await c.ready;
    c.ws.send(JSON.stringify({ type: "ping" }));
    c.ws.send("not json");
    await wait(100);
    expect(c.got[0]).toMatchObject({ type: "pong" });
    c.ws.send("x".repeat(20 * 1024));              // over maxPayload: that connection is dropped, the server lives on
    await wait(150);
    const d = open(); await d.ready;
    d.ws.send(JSON.stringify({ type: "auth", token: "good" }));
    await wait(100);
    expect(d.got[0]).toMatchObject({ event: "connected" });
    d.ws.close();
  });

  it("only authenticated sockets count", async () => {
    await wait(200);                                  // let sockets closed by earlier tests finish closing
    const before = hub.size, c = open(); await c.ready;
    expect(hub.size).toBe(before);
    c.ws.send(JSON.stringify({ type: "auth", token: "good" }));
    await wait(100);
    expect(hub.size).toBe(before + 1);
    c.ws.close(); await wait(100);
    expect(hub.size).toBe(before);
  });
});
