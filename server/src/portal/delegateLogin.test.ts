/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createPortalRouter } from "../routes/portal.js";
import { createAuthRouter } from "../auth/router.js";
import { PgAuthStore } from "../auth/store.js";
import { SessionService } from "../auth/sessionService.js";
import { AuthFlows } from "../auth/flows.js";
import { ConsoleEmail } from "../auth/email.js";
import { resolveAuthConfig } from "../auth/config.js";
import { createOriginPolicy } from "../auth/origins.js";
import { createDelegates } from "../services/delegates.js";

/**
 * A named office bearer signing in through the REAL login endpoint, with the REAL authentication store reading the same `users` table the logins are created in, then using the portal. It needs a real PostgreSQL (TEST_PG_URL): the in-memory test database
 * does not have the columns the real store reads, so this is skipped without one. It proves the part the other tests cannot: that a login made by the association is a login the sign-in accepts, and that the token it gives reaches only what the role allows.
 */
const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;
let db: Db, server: Server, base = "", assoc = "", bearer = "";
const post = async (path: string, body: unknown, token?: string) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const get = async (path: string, token: string) => { const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };

describe.skipIf(!process.env.TEST_PG_URL)("a delegate signs in through the real login", () => {
  beforeEach(async () => {
    db = allPortalsDb(); assoc = String((await db.query(`INSERT INTO users (username, password_hash, role, name, email) VALUES ('langa', $1, 'association', 'Langa Taxi Association', 'langa@x.test') RETURNING id`, [await bcrypt.hash("a-long-passphrase-nobody-guesses", 4)])).rows[0].id);
    bearer = String((await db.query(`INSERT INTO office_bearers (association_id, name, office) VALUES ($1,'Sipho Dube','Treasurer') RETURNING id`, [assoc])).rows[0].id);
    const cfg = resolveAuthConfig(env({})), store = new PgAuthStore(db as any), sessions = new SessionService(store, cfg), flows = new AuthFlows(store, sessions, new ConsoleEmail(), cfg, undefined, () => {});
    const app = express(); app.use(express.json()); app.use("/api/auth", createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin: createOriginPolicy(env({ ALLOWED_ORIGINS: "https://www.example.test", FRONTEND_URL: "https://www.example.test" })) })); app.use("/api/portal", createPortalRouter(db, null, {}));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const make = async (role = "treasurer") => (await createDelegates(db).create(assoc, assoc, { name: "Sipho Dube", email: "sipho@langa.test", username: "sipho", role, officeBearerId: bearer }) as any).value as { id: string; username: string; temporaryPassword: string };

  it("accepts the one-time password, and the token it gives reaches what the role allows and nothing more", async () => {
    const d = await make(); expect((await post("/auth/login", { username: d.username, password: "not-the-password" })).status).toBe(401); expect((await post("/auth/login", { username: "Sipho", password: d.temporaryPassword })).status).toBe(401);                  // the sign-in matches the username exactly, and it is saved in lower case
    const l = await post("/auth/login", { username: d.username, password: d.temporaryPassword }); expect(l.status, JSON.stringify(l.body)).toBe(200); expect(l.body.user).toMatchObject({ username: "sipho", role: "association" }); const t = l.body.token as string;
    expect((await get("/portal/association/access", t)).body).toMatchObject({ kind: "delegate", role: "treasurer", name: "Sipho Dube", officeBearerId: bearer }); expect((await get("/portal/association/finance/summary", t)).status).toBe(200); expect((await get("/portal/association/compliance/summary", t)).status).toBe(200);
    for (const p of ["/governance/cases", "/safety/summary", "/member-register", "/bank/accounts", "/money/summary", "/delegates", "/commission/settings"]) expect((await get(`/portal/association${p}`, t)).status, p).toBe(403);
  });
  it("lets the person change the temporary password, which ends the old one and every other session", async () => {
    const d = await make(); const first = await post("/auth/login", { username: d.username, password: d.temporaryPassword }); const t = first.body.token as string; const weak = await post("/auth/change-password", { currentPassword: d.temporaryPassword, newPassword: "password1" }, t); expect(weak.status).toBe(400);
    expect((await post("/auth/change-password", { currentPassword: "wrong", newPassword: "A-much-better-passphrase-2026" }, t)).status).toBe(401); const ch = await post("/auth/change-password", { currentPassword: d.temporaryPassword, newPassword: "A-much-better-passphrase-2026" }, t); expect(ch.status, JSON.stringify(ch.body)).toBe(200);
    expect((await post("/auth/login", { username: d.username, password: d.temporaryPassword })).status).toBe(401); const again = await post("/auth/login", { username: d.username, password: "A-much-better-passphrase-2026" }); expect(again.status).toBe(200); expect((await get("/portal/association/finance/summary", again.body.token)).status).toBe(200);
  });
  it("signs in after a reset with the new password only, and a switched-off login can sign in but can do nothing", async () => {
    const d = await make("secretary"); const r = (await createDelegates(db).resetPassword(assoc, assoc, d.id) as any).value; expect((await post("/auth/login", { username: d.username, password: d.temporaryPassword })).status).toBe(401); const l = await post("/auth/login", { username: d.username, password: r.temporaryPassword }); expect(l.status).toBe(200);
    expect((await get("/portal/association/governance/cases", l.body.token)).status).toBe(200); await createDelegates(db).setActive(assoc, assoc, d.id, false); expect((await post("/auth/login", { username: d.username, password: r.temporaryPassword })).status).toBe(200);                  // the sign-in itself is the authentication layer's
    for (const p of ["/access", "/governance/cases", "/compliance/summary"]) { const x = await get(`/portal/association${p}`, l.body.token); expect(x.status, p).toBe(403); expect(x.body.error).toContain("switched off"); }
  });
  it("locks the account after repeated wrong passwords, like any other", async () => {
    const d = await make(); let last = 0; for (let i = 0; i < 12; i++) last = (await post("/auth/login", { username: d.username, password: `wrong-${i}` })).status; expect(last).toBe(423); expect((await post("/auth/login", { username: d.username, password: d.temporaryPassword })).status).toBe(423);
  });
  it("keeps the association's own login working as before, with the whole portal, and the bank answering for itself", async () => {
    const l = await post("/auth/login", { username: "langa", password: "a-long-passphrase-nobody-guesses" }); expect(l.status).toBe(200); expect((await get("/portal/association/access", l.body.token)).body).toMatchObject({ kind: "owner" }); expect((await get("/portal/association/delegates", l.body.token)).status).toBe(200); expect((await get("/portal/association/bank/accounts", l.body.token)).status).toBe(503);
  });
});
