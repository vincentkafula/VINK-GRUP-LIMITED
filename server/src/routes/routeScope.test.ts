/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createRouteScope } from "./routeScope.js";

/**
 * An association login may use /api/routes only for its own routes and ledger; a named office-bearer login not at all; platform staff are untouched.
 * Association A (with delegate DL) and association B each have a route; the terminal is shared.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), DL: id(3), STAFF: id(4) }, RT = { a: id(40), b: id(41) }, TERM = id(60);
let db: Db | null, server: Server, url = "", real: Db;
const send = async (who: string, role: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${url}${path}`, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
const asA = (m: string, p: string, b?: unknown) => send(U.A, "association", m, p, b), asDelegate = (m: string, p: string, b?: unknown) => send(U.DL, "association", m, p, b);

async function start(d: Db | null) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const h = String(req.headers["x-test-user"] ?? ""); if (h) { const [userId, role] = h.split(":"); (req as any).user = { userId, username: userId, role }; } next(); });
  app.use(createRouteScope(d), (req, res) => { res.json({ reached: true, scope: res.locals.associationScope ?? null, body: req.body ?? null }); });
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeEach(async () => {
  real = allPortalsDb(); db = real;
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.DL, "Sipho Delegate", "association"], [U.STAFF, "Staff", "noc_engineer"]] as const) await real.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await real.query(`INSERT INTO association_delegates (user_id, association_id, role) VALUES ($1,$2,'chairperson')`, [U.DL, U.A]);
  await real.query(`INSERT INTO terminals (id, serial, api_key_hash) VALUES ($1,'T-1','x')`, [TERM]);
  await real.query(`INSERT INTO vehicle_routes (id, terminal_id, association_id, name) VALUES ($1,$2,$3,'A route'),($4,$2,$5,'B route')`, [RT.a, TERM, U.A, RT.b, U.B]); await start(db);
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

describe("platform staff and no login", () => {
  it("is not restricted for any platform role, on any path", async () => {
    for (const role of ["owner", "superadmin", "noc_engineer", "billing_admin"]) for (const [m, p] of [["GET", "/"], ["POST", "/"], ["PATCH", `/${RT.b}`], ["GET", `/${RT.a}/violations`], ["GET", `/associations/${U.B}/ledger`], ["GET", `/drivers/${id(9)}/ledger`]] as const) { const r = await send(U.STAFF, role, m, p, m === "POST" ? { associationId: U.B } : undefined); expect([r.status, r.body.reached, r.body.scope], `${role} ${m} ${p}`).toEqual([200, true, null]); if (m === "POST") expect(r.body.body.associationId).toBe(U.B); }
  });
  it("leaves a request with no login to the authentication that comes before it", async () => { const r = await fetch(`${url}/`); expect(r.status).toBe(200); expect((await r.json() as any).reached).toBe(true); });
  it("does not check anything when there is no database (those routes then answer 503 themselves)", async () => { await new Promise<void>((ok) => server.close(() => ok())); await start(null); const r = await asA("GET", `/associations/${U.B}/ledger`); expect([r.status, r.body.reached]).toEqual([200, true]); });
});

describe("an association's own login", () => {
  it("lists only its own routes: the scope is set to itself", async () => { expect((await asA("GET", "/")).body).toMatchObject({ reached: true, scope: U.A }); expect((await send(U.B, "association", "GET", "/")).body.scope).toBe(U.B); });
  it("creates routes only for itself: another association's id is refused, and its own is filled in when left out", async () => {
    expect(await asA("POST", "/", { name: "x", associationId: U.B })).toMatchObject({ status: 403, body: { error: "You can only create routes for your own association" } }); expect((await asA("POST", "/", { name: "x", associationId: U.A })).body.body).toMatchObject({ associationId: U.A, name: "x" }); for (const none of [undefined, null, ""]) expect((await asA("POST", "/", { name: "y", associationId: none })).body.body.associationId, String(none)).toBe(U.A); expect((await asA("POST", "/", { name: "z" })).body.body.associationId).toBe(U.A); expect((await asA("POST", "/")).body.body.associationId).toBe(U.A);
  });
  it("changes and reads the violations of its own routes, and finds another association's, a missing one, or a bad id 'not found'", async () => {
    for (const [m, p] of [["PATCH", `/${RT.a}`], ["GET", `/${RT.a}/violations`]] as const) expect((await asA(m, p, m === "PATCH" ? { active: false } : undefined)).status, `${m} ${p}`).toBe(200);
    for (const [m, p] of [["PATCH", `/${RT.b}`], ["GET", `/${RT.b}/violations`], ["PATCH", `/${id(99)}`], ["GET", `/${id(99)}/violations`], ["PATCH", "/nope"], ["GET", "/nope/violations"], ["PATCH", "/1;DROP TABLE users"]] as const) expect(await asA(m, p, m === "PATCH" ? { active: false } : undefined), `${m} ${p}`).toMatchObject({ status: 404, body: { error: "Route not found" } });
  });
  it("reads its own ledger, and no other association's, whether the id is another's, missing or not an id", async () => {
    expect((await asA("GET", `/associations/${U.A}/ledger`)).status).toBe(200); for (const p of [`/associations/${U.B}/ledger`, `/associations/${id(99)}/ledger`, "/associations/nope/ledger", "/associations//ledger"]) expect(await asA("GET", p), p).toMatchObject({ status: 403, body: { error: "You can only see your own association's ledger" } });
  });
  it("cannot read a driver's ledger, which is for platform staff", async () => { expect(await asA("GET", `/drivers/${id(9)}/ledger`)).toMatchObject({ status: 403, body: { error: "Driver ledgers are for platform staff" } }); });
});

describe("a named office-bearer login", () => {
  it("cannot use any of it, not even for its own association, whatever its role", async () => {
    for (const role of ["chairperson", "secretary", "treasurer", "viewer"]) { await real.query(`UPDATE association_delegates SET role = $1 WHERE user_id = $2`, [role, U.DL]); for (const [m, p] of [["GET", "/"], ["POST", "/"], ["PATCH", `/${RT.a}`], ["GET", `/${RT.a}/violations`], ["GET", `/associations/${U.A}/ledger`], ["GET", `/drivers/${id(9)}/ledger`]] as const) expect(await asDelegate(m, p, m === "POST" ? { associationId: U.A } : undefined), `${role} ${m} ${p}`).toMatchObject({ status: 403, body: { error: "That is for the association's own login only" } }); }
  });
  it("is refused even when its login has been switched off, and the association's own login is unaffected", async () => { await real.query(`UPDATE association_delegates SET disabled_at = now() WHERE user_id = $1`, [U.DL]); expect((await asDelegate("GET", "/")).status).toBe(403); expect((await asA("GET", "/")).status).toBe(200); });
});

describe("the scoping of the route list", () => {
  /** The two statements the list handler runs: a scope of null means platform staff, who see every route; an association id means only its own. */
  const list = async (own: string | null, terminal?: string) => (terminal ? await real.query(`SELECT * FROM vehicle_routes WHERE terminal_id = $1 AND ($2::uuid IS NULL OR association_id = $2) ORDER BY created_at DESC`, [terminal, own]) : await real.query(`SELECT * FROM vehicle_routes WHERE ($1::uuid IS NULL OR association_id = $1) ORDER BY created_at DESC`, [own])).rows.map((r: any) => r.name).sort();
  it("gives platform staff every route and an association only its own, with or without a terminal", async () => {
    expect(await list(null)).toEqual(["A route", "B route"]); expect(await list(U.A)).toEqual(["A route"]); expect(await list(U.B)).toEqual(["B route"]); expect(await list(id(99))).toEqual([]); expect(await list(null, TERM)).toEqual(["A route", "B route"]); expect(await list(U.A, TERM)).toEqual(["A route"]); expect(await list(U.A, id(98))).toEqual([]);
  });
});
