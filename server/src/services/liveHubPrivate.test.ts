import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import type { AddressInfo } from "net";
import { LiveHub, STAFF_EVENT_ROLES, isStaffOnlyEvent, type VerifiedToken } from "./liveHub.js";

/**
 * The live hub's PRIVATE channels, on real WebSocket connections. A driver's loading session must reach that driver and their marshal and nobody else: not another driver, not a passenger,
 * not an unauthenticated client. And the events that carry fares and fees go to staff, not to everyone who is signed in.
 */
let server: http.Server, url = "", hub: LiveHub;
const TOKENS: Record<string, VerifiedToken> = {
  driverA: { userId: "driver-a", username: "dee", role: "driver" }, driverB: { userId: "driver-b", username: "dan", role: "driver" },
  marshal: { userId: "marshal-1", username: "mo", role: "marshal" }, pax: { userId: "pax-1", username: "pax", role: "personal" },
  staff: { userId: "staff-1", username: "admin", role: "superadmin" }, owner: { userId: "owner-1", username: "oz", role: "vehicle_owner" },
};
beforeAll(async () => {
  hub = new LiveHub((t) => TOKENS[t] ?? null, 300);
  server = http.createServer(); hub.attach(new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 }));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok)); url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(() => server.close());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function client(token?: string) {
  const ws = new WebSocket(url), got: any[] = []; ws.on("message", (d) => got.push(JSON.parse(d.toString())));
  await new Promise<void>((ok) => ws.on("open", () => ok()));
  if (token) { ws.send(JSON.stringify({ type: "auth", token })); await wait(60); }
  return { ws, events: () => got.filter((m) => m.event && m.event !== "connected").map((m) => m.event + ":" + JSON.stringify(m.data)) };
}
const ev = (event: string, data: unknown = {}) => ({ event, timestamp: "t", data });

describe("the live hub's private channels", () => {
  it("sends a person's event to that person only, on every device they are signed in on", async () => {
    const a1 = await client("driverA"), a2 = await client("driverA"), b = await client("driverB"), m = await client("marshal"), p = await client("pax"), anon = await client();
    hub.sendToUsers(["driver-a", "marshal-1"], ev("rank.tap", { total: 2500 })); await wait(80);
    expect(a1.events()).toEqual(['rank.tap:{"total":2500}']); expect(a2.events()).toEqual(['rank.tap:{"total":2500}']); expect(m.events()).toEqual(['rank.tap:{"total":2500}']);
    expect(b.events()).toEqual([]); expect(p.events()).toEqual([]); expect(anon.events()).toEqual([]);                    // another driver, a passenger and an unauthenticated client get nothing
    for (const c of [a1, a2, b, m, p, anon]) c.ws.close();
  });
  it("sends to nobody when nobody is named, and to a person who is not connected without error", async () => {
    const p = await client("pax"); hub.sendToUsers([], ev("rank.tap")); hub.sendToUsers(["nobody-here"], ev("rank.tap")); await wait(60); expect(p.events()).toEqual([]); p.ws.close();
  });
  it("sends role-limited events to those roles only", async () => {
    const s = await client("staff"), d = await client("driverA"), p = await client("pax"), o = await client("owner");
    hub.sendToRoles(STAFF_EVENT_ROLES, ev("terminal.tap_received", { fare: 2500, split: { vink: 100 } })); await wait(80);
    expect(s.events()).toHaveLength(1); expect(d.events()).toEqual([]); expect(p.events()).toEqual([]); expect(o.events()).toEqual([]);
    for (const c of [s, d, p, o]) c.ws.close();
  });
  it("still broadcasts a harmless event to every signed-in client, and to no one who has not signed in", async () => {
    const d = await client("driverA"), p = await client("pax"), anon = await client(); hub.broadcast(ev("rates.updated", { pair: "ZAR/ZMW" })); await wait(80);
    expect(d.events()).toHaveLength(1); expect(p.events()).toHaveLength(1); expect(anon.events()).toEqual([]); for (const c of [d, p, anon]) c.ws.close();
  });
  it("stops sending to a socket once it has closed", async () => {
    const d = await client("driverA"); const connected = hub.size; d.ws.close(); await wait(100); expect(hub.size).toBe(connected - 1);       // the hub forgets it
    hub.sendToUsers(["driver-a"], ev("rank.tap")); expect(d.events()).toEqual([]);
  });
});

describe("which events are for staff only", () => {
  it("is every event that carries a fare, a fee, a device fault, a route violation or a retail transaction", () => {
    for (const e of ["terminal.tap_received", "terminal.fault_reported", "route.violation", "retail.transaction_received", "retail.fault_reported"]) expect(isStaffOnlyEvent(e), e).toBe(true);
    for (const e of ["rates.updated", "rank.tap", "rank.session"]) expect(isStaffOnlyEvent(e), e).toBe(false);                // a rank event is private to a person, sent by id, never broadcast
    expect([...STAFF_EVENT_ROLES].sort()).toEqual(["billing_admin", "noc_engineer", "owner", "superadmin"]);
  });
  it("is how the server routes events: staff-only ones to the staff roles, the rest to everyone, and a person's own by id", () => {
    const idx = readFileSync(join(__dirname, "../index.ts"), "utf8");
    expect(idx).toMatch(/setBroadcaster\(\(event\) => \(isStaffOnlyEvent\(event\.event\) \? hub\.sendToRoles\(STAFF_EVENT_ROLES, event\) : hub\.broadcast\(event\)\)\)/);
    expect(idx).toMatch(/setTargetedBroadcaster\(\(userIds, event\) => hub\.sendToUsers\(userIds, event\)\)/);
  });
});
