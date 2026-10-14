import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { signRequest, type SyncRequest, type SyncResponse, type SyncTransaction, deviceSecret, sampleFareTable } from "@afc/shared";
import type { FastifyInstance } from "fastify";
import { loadConfig, type Config } from "../src/config";
import { createDb, type Db } from "../src/db";
import { startEmbeddedPg, type EmbeddedPg } from "../src/embeddedPg";
import { FeedHub } from "../src/domain/events";
import { buildApp } from "../src/http/app";
import { seedDatabase } from "../src/seedData";

/** A real Postgres (embedded), migrated and seeded once per test file, with the API built on it and helpers to call it as staff or as a device. */
export interface Harness {
  pg: EmbeddedPg; db: Db; app: FastifyInstance; config: Config; hub: FeedHub; password: string; deviceSecret: Buffer;
  login(email: string): Promise<string>;
  api(token: string | null, method: string, url: string, body?: unknown): Promise<{ status: number; body: any; headers: Record<string, unknown> }>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  sync(txns: SyncTransaction[], over?: { deviceId?: string; secret?: Buffer; ts?: number; nonce?: string; versions?: Partial<Pick<SyncRequest, "hotlistVersion" | "fareTableVersion" | "profilesVersion">> }): Promise<{ status: number; body: SyncResponse & { error?: unknown; why?: string }; headers: Record<string, unknown> }>;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const pg = await startEmbeddedPg();
  const env = { NODE_ENV: "test", DATABASE_URL: pg.url, JWT_SECRET: "t".repeat(40), DEVICE_KEY_MASTER: "ab".repeat(32), MOBILE_MONEY_WEBHOOK_SECRET: "webhook-secret-0123456789", CORS_ORIGIN: "http://localhost:3000", LOGIN_RATE_LIMIT: "1000" } as NodeJS.ProcessEnv;
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { cwd: join(__dirname, ".."), env: { ...process.env, ...env }, stdio: "pipe", shell: process.platform === "win32" });
  const config = loadConfig(env, () => {});
  const db = createDb(pg.url);
  const hub = new FeedHub();
  const seeded = await seedDatabase(db, { deviceKeyMaster: config.deviceKeyMaster, adminPassword: "Test-passw0rd-123" });
  const app = await buildApp({ config, db, hub });
  await app.ready();
  const secret = deviceSecret(config.deviceKeyMaster, "VAL-0001", 1);

  const api: Harness["api"] = async (token, method, url, body) => {
    const r = await app.inject({ method: method as "GET", url, payload: body as object | undefined, headers: token ? { authorization: `Bearer ${token}` } : {} });
    let parsed: unknown = r.body;
    try { parsed = JSON.parse(r.body); } catch { /* csv or empty */ }
    return { status: r.statusCode, body: parsed as never, headers: r.headers };
  };
  const login = async (email: string) => {
    const r = await api(null, "POST", "/api/auth/login", { email, password: seeded.password });
    if (r.status !== 200) throw new Error("login failed for " + email + ": " + JSON.stringify(r.body));
    return r.body.token as string;
  };
  const table = sampleFareTable();
  const sync: Harness["sync"] = async (txns, over = {}) => {
    const deviceId = over.deviceId ?? "VAL-0001";
    const body: SyncRequest = { deviceId, batch: txns, hotlistVersion: -1, fareTableVersion: table.version - 1, profilesVersion: -1, ...over.versions };
    const raw = JSON.stringify(body);
    const ts = over.ts ?? Math.floor(Date.now() / 1000), nonce = over.nonce ?? randomUUID();
    const sig = signRequest(over.secret ?? secret, ts, nonce, raw);
    const r = await app.inject({ method: "POST", url: "/api/device/sync", payload: raw, headers: { "content-type": "application/json", "x-device-id": deviceId, "x-timestamp": String(ts), "x-nonce": nonce, "x-signature": sig } });
    return { status: r.statusCode, body: JSON.parse(r.body), headers: r.headers };
  };
  return { pg, db, app, config, hub, password: seeded.password, deviceSecret: secret, login, api, sync, async stop() { await app.close(); await db.$disconnect(); await pg.stop(); } };
}

let seq = 0;
/** A completed flat-fare tap on route 2 by default. */
export function tap(o: Partial<SyncTransaction> = {}): SyncTransaction {
  seq++;
  const fare = o.fare ?? 1200;
  const before = o.balanceBefore ?? 10_000;
  return {
    id: randomUUID(), deviceId: "VAL-0001", deviceSeq: seq, cardUid: "04a1b2c3d4e5f6", result: "ok", kind: "flat", routeId: 2, stopId: 201,
    fare, penalty: 0, balanceBefore: before, balanceAfter: before - fare, cardCounter: seq, category: "adult", tappedAt: new Date().toISOString(),
    fareTableVersion: 1, offline: false, ...o,
  };
}
export const resetSeq = (n = 0) => { seq = n; };
