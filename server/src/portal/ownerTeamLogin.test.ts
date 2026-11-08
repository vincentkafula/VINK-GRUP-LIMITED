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
import { createOwnerTeam } from "../services/ownerTeam.js";

/**
 * A member of an owner's team signing in through the REAL login endpoint, with the REAL authentication store reading the same `users` table the logins are created in, then using the owner portal. It needs a real PostgreSQL (TEST_PG_URL): the in-memory test database
 * does not have the columns the real store reads, so this is skipped without one. It proves the part the other tests cannot: that a login made by the association is a login the sign-in accepts, and that the token it gives reaches only what the role allows.
 */
const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;
let db: Db, server: Server, base = "", owner = "";
const post = async (path: string, body: unknown, token?: string) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const get = async (path: string, token: string) => { const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };

describe.skipIf(!process.env.TEST_PG_URL)("a team member signs in through the real login", () => {
  beforeEach(async () => {
    db = allPortalsDb(); owner = String((await db.query(`INSERT INTO users (username, password_hash, role, name, email) VALUES ('olu', $1, 'vehicle_owner', 'Olu Owner', 'olu@x.test') RETURNING id`, [await bcrypt.hash("a-long-passphrase-nobody-guesses", 4)])).rows[0].id);
    await db.query(`INSERT INTO vehicles (owner_id, registration, make, seats) VALUES ($1,'CA 111-111','Toyota',15)`, [owner]);
    const cfg = resolveAuthConfig(env({})), store = new PgAuthStore(db as any), sessions = new SessionService(store, cfg), flows = new AuthFlows(store, sessions, new ConsoleEmail(), cfg, undefined, () => {});
    const app = express(); app.use(express.json()); app.use("/api/auth", createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin: createOriginPolicy(env({ ALLOWED_ORIGINS: "https://www.example.test", FRONTEND_URL: "https://www.example.test" })) })); app.use("/api/portal", createPortalRouter(db, null, {}));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const make = async (role = "fleet_manager") => (await createOwnerTeam(db).create(owner, { name: "Thabo Mokoena", email: "thabo@x.test", username: "thabo", role }) as any).value as { id: string; username: string; temporaryPassword: string };

  it("accepts the one-time password, and the token it gives reaches what the role allows, as the owner's business, and nothing more", async () => {
    const d = await make(); expect((await post("/auth/login", { username: d.username, password: "not-the-password" })).status).toBe(401); const l = await post("/auth/login", { username: d.username, password: d.temporaryPassword }); expect(l.status, JSON.stringify(l.body)).toBe(200); expect(l.body.user).toMatchObject({ username: "thabo", role: "vehicle_owner" }); const t = l.body.token as string;
    expect((await get("/portal/owner/access", t)).body).toMatchObject({ kind: "team", role: "fleet_manager", name: "Thabo Mokoena" }); const fleet = await get("/portal/owner/driver-pay/fleet", t); expect(fleet.status).toBe(200); expect(fleet.body.vehicles.map((v: any) => v.registration)).toEqual(["CA 111-111"]);
    for (const p of ["/finance/profit", "/finance/loans", "/earnings", "/my-association", "/bank/accounts", "/money/summary", "/tokens", "/team"]) expect((await get(`/portal/owner${p}`, t)).status, p).toBe(403);
  });
  it("lets the person change the temporary password, which ends the old one", async () => {
    const d = await make(); const t = (await post("/auth/login", { username: d.username, password: d.temporaryPassword })).body.token as string; expect((await post("/auth/change-password", { currentPassword: d.temporaryPassword, newPassword: "password1" }, t)).status).toBe(400); expect((await post("/auth/change-password", { currentPassword: d.temporaryPassword, newPassword: "A-much-better-passphrase-2026" }, t)).status).toBe(200);
    expect((await post("/auth/login", { username: d.username, password: d.temporaryPassword })).status).toBe(401); const again = await post("/auth/login", { username: d.username, password: "A-much-better-passphrase-2026" }); expect(again.status).toBe(200); expect((await get("/portal/owner/driver-pay/fleet", again.body.token)).status).toBe(200);
  });
  it("signs in after a reset with the new password only, and a switched-off login can sign in but can do nothing", async () => {
    const d = await make("accountant"); const r = (await createOwnerTeam(db).resetPassword(owner, d.id) as any).value; expect((await post("/auth/login", { username: d.username, password: d.temporaryPassword })).status).toBe(401); const l = await post("/auth/login", { username: d.username, password: r.temporaryPassword }); expect(l.status).toBe(200); expect((await get("/portal/owner/finance/profit", l.body.token)).status).toBe(200);
    await createOwnerTeam(db).setActive(owner, d.id, false); expect((await post("/auth/login", { username: d.username, password: r.temporaryPassword })).status).toBe(200); for (const p of ["/access", "/finance/profit", "/bank/accounts"]) { const x = await get(`/portal/owner${p}`, l.body.token); expect(x.status, p).toBe(403); expect(x.body.error).toContain("switched off"); }
  });
  it("keeps the owner's own login working as before, with the whole portal, and the bank answering for itself", async () => {
    const l = await post("/auth/login", { username: "olu", password: "a-long-passphrase-nobody-guesses" }); expect(l.status).toBe(200); expect((await get("/portal/owner/access", l.body.token)).body).toMatchObject({ kind: "owner" }); expect((await get("/portal/owner/team", l.body.token)).status).toBe(200); expect((await get("/portal/owner/bank/accounts", l.body.token)).status).toBe(503);
  });
});
