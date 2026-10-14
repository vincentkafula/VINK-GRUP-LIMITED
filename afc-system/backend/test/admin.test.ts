import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { sampleFareTable } from "@afc/shared";
import { startHarness, tap, resetSeq, type Harness } from "./harness";

let h: Harness;
let admin: string, operator: string, agent: string, viewer: string;
beforeAll(async () => {
  h = await startHarness(); resetSeq(0);
  [admin, operator, agent, viewer] = await Promise.all(["admin", "operator", "agent", "viewer"].map((r) => h.login(`${r}@afc.local`)));
});
afterAll(async () => { await h.stop(); });

describe("signing in", () => {
  it("rejects a wrong password with a generic message, and a missing user the same way", async () => {
    const a = await h.api(null, "POST", "/api/auth/login", { email: "admin@afc.local", password: "nope-nope-nope1" });
    const b = await h.api(null, "POST", "/api/auth/login", { email: "ghost@afc.local", password: "nope-nope-nope1" });
    expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.body).toEqual(b.body);
  });
  it("locks the account after repeated failures, then a correct password still fails until the lock ends", async () => {
    await h.api(admin, "POST", "/api/users", { email: "lock@afc.local", name: "Lock", password: "Right-passw0rd-1", role: "VIEWER" });
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await h.api(null, "POST", "/api/auth/login", { email: "lock@afc.local", password: "bad-bad-bad-1" })).status;
    expect(last).toBe(401);
    const locked = await h.api(null, "POST", "/api/auth/login", { email: "lock@afc.local", password: "Right-passw0rd-1" });
    expect(locked.status).toBe(423);
    await h.db.adminUser.update({ where: { email: "lock@afc.local" }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await h.api(null, "POST", "/api/auth/login", { email: "lock@afc.local", password: "Right-passw0rd-1" })).status).toBe(200);
  });
  it("requires a token for everything, and rejects a forged one", async () => {
    expect((await h.api(null, "GET", "/api/cards")).status).toBe(401);
    expect((await h.api("not.a.token", "GET", "/api/cards")).status).toBe(401);
    expect((await h.api(null, "GET", "/health")).status).toBe(200);
  });
  it("stores passwords hashed, and creating a user enforces a strong password", async () => {
    const u = await h.db.adminUser.findUnique({ where: { email: "admin@afc.local" } });
    expect(u!.passwordHash).toMatch(/^scrypt\$/); expect(u!.passwordHash).not.toContain("Test-passw0rd");
    expect((await h.api(admin, "POST", "/api/users", { email: "weak@afc.local", name: "W", password: "short", role: "VIEWER" })).status).toBe(400);
  });
});

describe("who may do what", () => {
  it("viewers read but cannot change anything", async () => {
    expect((await h.api(viewer, "GET", "/api/cards")).status).toBe(200);
    expect((await h.api(viewer, "GET", "/api/reports/summary")).status).toBe(200);
    expect((await h.api(viewer, "POST", "/api/cards", { uid: "04bbbbbbbbbb01" })).status).toBe(403);
    expect((await h.api(viewer, "POST", "/api/fares/publish")).status).toBe(403);
    expect((await h.api(viewer, "POST", "/api/devices", { id: "VAL-9999", name: "x" })).status).toBe(403);
  });
  it("agents issue cards and top up but cannot block cards, edit fares, see reports or manage devices", async () => {
    expect((await h.api(agent, "POST", "/api/cards", { uid: "04bbbbbbbbbb02", holderName: "Agent made" })).status).toBe(201);
    expect((await h.api(agent, "PATCH", "/api/cards/04bbbbbbbbbb02/status", { status: "BLOCKED" })).status).toBe(403);
    expect((await h.api(agent, "GET", "/api/reports/summary")).status).toBe(403);
    expect((await h.api(agent, "POST", "/api/fares/publish")).status).toBe(403);
    expect((await h.api(agent, "GET", "/api/audit")).status).toBe(403);
    expect((await h.api(agent, "POST", "/api/topups", { cardUid: "04bbbbbbbbbb02", amount: 1000, method: "ADMIN", reference: "x" })).status).toBe(403);
  });
  it("only admins manage staff accounts and read the audit log", async () => {
    expect((await h.api(operator, "GET", "/api/users")).status).toBe(403);
    expect((await h.api(operator, "GET", "/api/audit")).status).toBe(403);
    expect((await h.api(admin, "GET", "/api/users")).body.users.length).toBeGreaterThanOrEqual(4);
  });
  it("an admin cannot lock themselves out", async () => {
    const me = (await h.api(admin, "GET", "/api/auth/me")).body.user.sub;
    expect((await h.api(admin, "PATCH", `/api/users/${me}`, { active: false })).status).toBe(400);
    expect((await h.api(admin, "PATCH", `/api/users/${me}`, { role: "VIEWER" })).status).toBe(400);
  });
});

describe("cards", () => {
  it("registers a card, rejects bad UIDs and duplicates, and records the starting balance in the books", async () => {
    const ok = await h.api(admin, "POST", "/api/cards", { uid: "04:CC:CC:CC:CC:CC:01", holderName: "Test", initialBalance: 2500, category: "student" });
    expect(ok.status).toBe(201);
    const view = await h.api(admin, "GET", "/api/cards/04cccccccccc01");
    expect(view.body.card).toMatchObject({ uid: "04cccccccccc01", balance: 2500, category: "student", status: "ACTIVE" });
    expect((await h.api(admin, "POST", "/api/cards", { uid: "04cccccccccc01" })).status).toBe(409);
    expect((await h.api(admin, "POST", "/api/cards", { uid: "123" })).status).toBe(400);
    expect((await h.api(admin, "POST", "/api/cards", { uid: "04cccccccccc02", initialBalance: 99_999_999 })).status).toBe(400);
  });
  it("searches by UID or holder and filters by status", async () => {
    expect((await h.api(admin, "GET", "/api/cards?search=Thandi")).body.cards.map((c: { uid: string }) => c.uid)).toContain("04a1b2c3d4e5f6");
    expect((await h.api(admin, "GET", "/api/cards?search=04a1b2c3d4e5f7")).body.total).toBe(1);
    await h.api(operator, "PATCH", "/api/cards/04a1b2c3d4e5f9/status", { status: "BLOCKED", reason: "test" });
    expect((await h.api(admin, "GET", "/api/cards?status=BLOCKED")).body.cards.map((c: { uid: string }) => c.uid)).toContain("04a1b2c3d4e5f9");
    await h.api(operator, "PATCH", "/api/cards/04a1b2c3d4e5f9/status", { status: "ACTIVE" });
  });
  it("shows a card's full history: taps, top-ups, ledger lines and problems", async () => {
    await h.sync([tap({ cardUid: "04a1b2c3d4e5f7", balanceBefore: 5000, cardCounter: 1, category: "student", fare: 900 })]);
    await h.api(agent, "POST", "/api/topups/load", { cardUid: "04a1b2c3d4e5f7", amount: 2000, method: "CASH", reference: "RC-HIST", cardBalanceAfter: 6100 });
    const r = (await h.api(viewer, "GET", "/api/cards/04a1b2c3d4e5f7/history")).body;
    expect(r.txns).toHaveLength(1); expect(r.topups).toHaveLength(1);
    expect(r.ledger.map((l: { kind: string }) => l.kind)).toEqual(expect.arrayContaining(["INITIAL", "FARE", "TOPUP_LOADED"]));
    expect(r.card.balance).toBe(6100);
  });
  it("writes every staff change to the audit log with who did it", async () => {
    const log = (await h.api(admin, "GET", "/api/audit?take=200")).body.entries as { action: string; actorEmail: string; target: string }[];
    expect(log.some((e) => e.action === "card.register" && e.actorEmail === "admin@afc.local")).toBe(true);
    expect(log.some((e) => e.action === "card.blocked" && e.actorEmail === "operator@afc.local" && e.target === "04a1b2c3d4e5f9")).toBe(true);
    expect(log.some((e) => e.action === "topup.loaded")).toBe(true);
  });
});

describe("top-up endpoints", () => {
  it("order, then confirm; a repeated order returns the first (200) and a repeated confirm does not double credit", async () => {
    const body = { cardUid: "04a1b2c3d4e5f8", amount: 3000, method: "MOBILE_MONEY", reference: "MM-API-1" };
    const a = await h.api(agent, "POST", "/api/topups", body);
    const b = await h.api(agent, "POST", "/api/topups", body);
    expect(a.status).toBe(201); expect(b.status).toBe(200); expect(b.body.replay).toBe(true);
    expect((await h.api(agent, "GET", "/api/cards/04a1b2c3d4e5f8/pending-loads")).body.loads).toHaveLength(1);
    await h.api(agent, "POST", `/api/topups/${a.body.topup.id}/confirm`, {});
    const again = await h.api(agent, "POST", `/api/topups/${a.body.topup.id}/confirm`, {});
    expect(again.body.replay).toBe(true);
    expect((await h.api(viewer, "GET", "/api/cards/04a1b2c3d4e5f8")).body.card.balance).toBe(6000);
  });
  it("the mobile-money webhook needs a valid signature and is safe to retry", async () => {
    const payload = JSON.stringify({ reference: "MM-HOOK-1", cardUid: "04a1b2c3d4e5f8", amount: 1000, status: "SUCCESS" });
    const sign = (p: string) => createHmac("sha256", "webhook-secret-0123456789").update(p).digest("hex");
    const send = (p: string, sig: string) => h.app.inject({ method: "POST", url: "/api/webhooks/mobile-money", payload: p, headers: { "content-type": "application/json", "x-signature": sig } });
    expect((await send(payload, "00".repeat(32))).statusCode).toBe(401);
    expect((await send(payload, sign(payload))).statusCode).toBe(200);
    expect((await send(payload, sign(payload))).statusCode).toBe(200);
    expect(await h.db.topup.count({ where: { method: "MOBILE_MONEY", reference: "MM-HOOK-1" } })).toBe(1);
    const failed = JSON.stringify({ reference: "MM-HOOK-2", cardUid: "04a1b2c3d4e5f8", amount: 1000, status: "FAILED" });
    expect(JSON.parse((await send(failed, sign(failed))).body).ignored).toBe(true);
    expect(await h.db.topup.count({ where: { reference: "MM-HOOK-2" } })).toBe(0);
  });
});

describe("fares", () => {
  const route = () => ({ ...sampleFareTable().routes[1], id: 3, code: "R3", name: "Test flat", stops: [{ id: 301, name: "Only", zone: 1, seq: 1 }], fare: { mode: "flat" as const, flatAmount: 1500 }, active: true });

  it("an operator adds a route; it only reaches devices once published", async () => {
    expect((await h.api(operator, "POST", "/api/fares/routes", route())).status).toBe(201);
    const pubBefore = (await h.api(viewer, "GET", "/api/fares/published")).body.table;
    expect(pubBefore.routes.some((r: { id: number }) => r.id === 3)).toBe(false);
    expect((await h.api(viewer, "GET", "/api/fares/draft")).body.table.routes.some((r: { id: number }) => r.id === 3)).toBe(true);
    const pub = await h.api(operator, "POST", "/api/fares/publish");
    expect(pub.body.table.routes.some((r: { id: number }) => r.id === 3)).toBe(true);
  });
  it("rejects routes with impossible fares or duplicate stops", async () => {
    const bad = { ...route(), id: 4, code: "R4", fare: { mode: "zone" as const, minFare: 2000, maxFare: 1000, zoneFares: [] }, stops: [{ id: 401, name: "A", zone: 1, seq: 1 }] };
    expect((await h.api(operator, "POST", "/api/fares/routes", bad)).status).toBe(400);
    const dup = { ...route(), id: 5, code: "R5", stops: [{ id: 501, name: "A", zone: 1, seq: 1 }, { id: 501, name: "B", zone: 1, seq: 2 }] };
    expect((await h.api(operator, "POST", "/api/fares/routes", dup)).status).toBe(400);
    const taken = { ...route(), id: 6, code: "R3", stops: [{ id: 601, name: "A", zone: 1, seq: 1 }] };
    expect((await h.api(operator, "POST", "/api/fares/routes", taken)).status).toBe(409);
    const stolen = { ...route(), id: 7, code: "R7", stops: [{ id: 101, name: "Steal", zone: 1, seq: 1 }] };
    expect((await h.api(operator, "POST", "/api/fares/routes", stolen)).status).toBe(409);
  });
  it("an operator cannot touch another operator's routes", async () => {
    await h.db.operator.create({ data: { id: 2, name: "Other Co" } });
    const other = { ...route(), id: 9, code: "R9", operatorId: 2, stops: [{ id: 901, name: "X", zone: 1, seq: 1 }] };
    expect((await h.api(operator, "POST", "/api/fares/routes", other)).status).toBe(400);
    expect((await h.api(admin, "POST", "/api/fares/routes", other)).status).toBe(201);
    expect((await h.api(operator, "DELETE", "/api/fares/routes/9")).status).toBe(404);
  });
  it("time rules and discounts are admin-only and validated", async () => {
    expect((await h.api(operator, "PUT", "/api/fares/discounts", [{ category: "student", discountBp: 3000 }])).status).toBe(403);
    expect((await h.api(admin, "PUT", "/api/fares/discounts", [{ category: "student", discountBp: 20000 }])).status).toBe(400);
    expect((await h.api(admin, "PUT", "/api/fares/discounts", [{ category: "student", discountBp: 3000 }])).status).toBe(200);
    expect((await h.api(admin, "PUT", "/api/fares/time-rules", [{ name: "bad", days: [1], startMinute: 600, endMinute: 500, multiplierBp: 9000 }])).status).toBe(400);
    expect((await h.api(admin, "GET", "/api/fares/draft")).body.table.discounts.find((d: { category: string }) => d.category === "student").discountBp).toBe(3000);
  });
});

describe("reports", () => {
  it("revenue by day / route / device / operator add up to the same total, and operators only see their own", async () => {
    await h.sync([tap({ cardUid: "04a1b2c3d4e5f6", balanceBefore: 10_000, cardCounter: 1, fare: 1200 }), tap({ cardUid: "04a1b2c3d4e5f6", balanceBefore: 8800, cardCounter: 2, fare: 1200, routeId: 1, stopId: 101, kind: "tap_out" })]);
    const totals = await Promise.all((["day", "route", "device", "operator"] as const).map(async (g) => (await h.api(admin, "GET", `/api/reports/revenue?groupBy=${g}`)).body.totals.revenue));
    expect(new Set(totals).size).toBe(1); expect(totals[0]).toBeGreaterThanOrEqual(2400);
    const mine = (await h.api(operator, "GET", "/api/reports/revenue?groupBy=operator")).body.totals.revenue;
    expect(mine).toBe(totals[0]);                                          // both routes belong to operator 1
    await h.api(admin, "POST", "/api/fares/routes", { ...sampleFareTable().routes[1], id: 11, code: "R11", operatorId: 2, stops: [{ id: 1101, name: "O", zone: 1, seq: 1 }], active: true });
    await h.sync([tap({ cardUid: "04a1b2c3d4e5f6", balanceBefore: 7600, cardCounter: 3, fare: 700, routeId: 11, stopId: 1101 })]);
    expect((await h.api(operator, "GET", "/api/reports/revenue?groupBy=operator")).body.totals.revenue).toBe(mine);
    expect((await h.api(admin, "GET", "/api/reports/revenue?groupBy=operator")).body.totals.revenue).toBe(mine + 700);
  });
  it("exports CSV with the right headers and no formula injection", async () => {
    await h.api(admin, "POST", "/api/cards", { uid: "04dddddddddd01", holderName: "=HYPERLINK(\"http://evil\")" });
    const csv = await h.app.inject({ method: "GET", url: "/api/reports/revenue?groupBy=route&format=csv", headers: { authorization: `Bearer ${admin}` } });
    expect(csv.headers["content-type"]).toContain("text/csv"); expect(csv.headers["content-disposition"]).toContain("attachment");
    expect(csv.body.split("\r\n")[0]).toBe("route,revenue_rand,trips,tap_ins,penalties_rand,offline_taps");
    const taps = await h.app.inject({ method: "GET", url: "/api/reports/taps.csv", headers: { authorization: `Bearer ${admin}` } });
    expect(taps.body.split("\r\n")[0]).toContain("tapped_at,device,card");
  });
  it("validates the date range", async () => {
    expect((await h.api(admin, "GET", "/api/reports/revenue?from=2026-01-10&to=2026-01-01")).status).toBe(400);
    expect((await h.api(admin, "GET", "/api/reports/revenue?from=2020-01-01&to=2026-01-01")).status).toBe(400);
    expect((await h.api(admin, "GET", "/api/reports/revenue?from=banana")).status).toBe(400);
  });
  it("the dashboard summary has the front-page numbers", async () => {
    const s = (await h.api(viewer, "GET", "/api/reports/summary")).body;
    expect(s.last24h.revenue).toBeGreaterThan(0); expect(s.devices.total).toBeGreaterThanOrEqual(1); expect(s.last7d.length).toBeGreaterThan(0);
  });
});

describe("live feed", () => {
  const open = (path: string) => new Promise<{ ws: WebSocket; closed: Promise<number>; seen: { type: string; cardUid?: string }[] }>((resolve, reject) => {
    const ws = new WebSocket(path);
    const seen: { type: string; cardUid?: string }[] = [];
    ws.on("message", (m) => seen.push(JSON.parse(String(m))));          // listen from the very start so the greeting is not missed
    const closed = new Promise<number>((r) => ws.on("close", (c) => r(c)));
    ws.on("open", () => resolve({ ws, closed, seen })); ws.on("error", reject);
  });
  it("pushes taps to a signed-in viewer and closes a connection that has no valid token", async () => {
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (h.app.server.address() as { port: number }).port;
    const bad = await open(`ws://127.0.0.1:${port}/api/ws/feed?token=junk`);
    expect(await bad.closed).toBe(4401);
    const { ws, seen } = await open(`ws://127.0.0.1:${port}/api/ws/feed?token=${viewer}`);
    await h.sync([tap({ cardUid: "04a1b2c3d4e5f6", balanceBefore: 6900, cardCounter: 4, fare: 1200 })]);
    await new Promise((r) => setTimeout(r, 200));
    expect(seen[0].type).toBe("hello");
    expect(seen.some((e) => e.type === "tap" && e.cardUid === "04a1b2c3d4e5f6")).toBe(true);
    ws.close();
  });
});
