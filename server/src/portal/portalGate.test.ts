/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createPortalRouter } from "../routes/portal.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { createDelegates } from "../services/delegates.js";

/**
 * The REAL portal router, with real tokens: proves the gate runs before the association's bank, money and token routers, so a named office bearer can never reach them, while the association's own login still can.
 * (The bank is not configured in this test, so the main login gets "unavailable" from it: what matters is that a delegate gets "forbidden" instead.)
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), D: id(2), O: id(3) };
let db: Db, server: Server, url = "";
const token = (userId: string, username: string) => jwt.sign({ userId, username, role: "association" }, JWT_SECRET, { expiresIn: "1h" });
const get = async (path: string, t: string, method = "GET") => { const r = await fetch(`${url}/api/portal/association${path}`, { method, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };

beforeEach(async () => {
  db = allPortalsDb(); for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.D, "Sipho Dube", "association"], [U.O, "Olu Owner", "vehicle_owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${nm.split(" ")[0].toLowerCase()}@x.test`, r]);
  await db.query(`INSERT INTO association_delegates (user_id, association_id, role) VALUES ($1,$2,'chairperson')`, [U.D, U.A]);
  const app = express(); app.use(express.json()); app.use("/api/portal", createPortalRouter(db, null, {}));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

describe("the gate in the real portal router", () => {
  it("refuses a delegate the bank, money, tokens, payroll and anything not mapped, before those routers see the request", async () => {
    const d = token(U.D, "sipho"); for (const p of ["/bank/accounts", "/bank", "/money/summary", "/money", "/tokens/balance", "/tokens", "/commission/settings", "/payruns", "/payslips", "/adjustments", "/delegates", "/something-new"]) { const r = await get(p, d); expect(r.status, p).toBe(403); expect(r.body.success).toBe(false); }
    for (const m of ["POST", "PUT", "DELETE"]) for (const p of ["/bank/accounts", "/money/pay", "/tokens/send"]) expect((await get(p, d, m)).status, `${m} ${p}`).toBe(403);
  });
  it("does not stop the association's own login: it reaches the bank and money routers (which answer for themselves)", async () => {
    const a = token(U.A, "langa"); const bank = await get("/bank/accounts", a); expect(bank.status).not.toBe(403); expect(bank.status).toBe(503);                  // the bank is not configured in this test
    expect((await get("/money/summary", a)).status).not.toBe(403); expect((await get("/delegates", a)).status).toBe(200); expect((await get("/access", a)).body).toMatchObject({ kind: "owner" });
  });
  it("lets a delegate use what their role allows, as the association they act for, and shows them as who they are", async () => {
    const d = token(U.D, "sipho"); expect((await get("/compliance/summary", d)).status).toBe(200); expect((await get("/finance/summary", d)).status).toBe(200); const a = await get("/access", d); expect(a.body).toMatchObject({ kind: "delegate", name: "Sipho Dube", role: "chairperson" });
  });
  it("refuses a switched-off delegate everywhere, including the bank, and a request with no token at all", async () => {
    await createDelegates(db).setActive(U.A, U.A, U.D, false); const d = token(U.D, "sipho"); for (const p of ["/compliance/summary", "/access", "/bank/accounts", "/money/summary"]) { const r = await get(p, d); expect(r.status, p).toBe(403); expect(r.body.error).toContain("switched off"); }
    expect((await fetch(`${url}/api/portal/association/compliance/summary`)).status).toBe(401);
  });
  it("does not make a delegate of the account of an ordinary user: a delegate row for a user who is not a delegate changes nothing for others", async () => {
    const o = jwt.sign({ userId: U.O, username: "olu", role: "vehicle_owner" }, JWT_SECRET, { expiresIn: "1h" }); const r = await fetch(`${url}/api/portal/association/compliance/summary`, { headers: { Authorization: `Bearer ${o}` } }); expect(r.status).toBe(403);                  // an owner has no business on the association portal
  });
});
