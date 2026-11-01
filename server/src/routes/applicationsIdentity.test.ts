import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";

// The router talks to the shared connection pool; give it the in-memory database instead.
const holder = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("../db/pool.js", () => ({ get pool() { return holder.pool; }, hasDb: true }));

import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { JWT_SECRET } from "../middleware/auth.js";
import applicationsRouter, { setApplicationsIdentity } from "./applicationsRouter.js";
import { createIdentityModule, type IdentityModule } from "../services/sumsub/module.js";
import { mockSumsub, type MockSumsub } from "../services/sumsub/mockSumsub.js";

const ENV = { SUMSUB_APP_TOKEN: "sbx:app-token", SUMSUB_SECRET_KEY: "the-secret-key", SUMSUB_WEBHOOK_SECRET: "whsec", SUMSUB_LEVEL_NAME: "vink-default" } as NodeJS.ProcessEnv;
const EMAIL = "thandi@example.com";
type Body = Record<string, any>;

let db: Db, mod: IdentityModule, mock: MockSumsub, server: Server, url = "", clock: Date, n = 0, seq = 0;
const boot = async (env: NodeJS.ProcessEnv = ENV) => {
  db = allPortalsDb(); holder.pool = db; clock = new Date("2026-11-01T10:00:00Z");
  mock = mockSumsub({ appToken: "sbx:app-token", secretKey: "the-secret-key", levelName: "vink-default", now: () => clock });
  mod = createIdentityModule({ db, env, fetchImpl: mock.fetch, now: () => clock }); setApplicationsIdentity(mod.identity);
  const app = express(); app.use(express.json()); app.use("/api/applications", applicationsRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(() => { n = 0; seq = 0; });
afterEach(async () => { setApplicationsIdentity(null); await new Promise<void>((ok) => server.close(() => ok())); });

const uuidFor = (role: string) => `00000000-0000-4000-8000-${[...role].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1e12, 7).toString().padStart(12, "0")}`;      // a stable, valid user id for each role
const token = (role: string, name = `${role}-person`) => ({ authorization: `Bearer ${jwt.sign({ userId: uuidFor(role), username: name, role }, JWT_SECRET)}` });
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(url + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as Body };
};
const newApp = async (o: { tier?: string; status?: string } = {}) => {
  const id = randomUUID(), tier = o.tier ?? "personal", ref = `VNK-PA-TEST${String(++n).padStart(6, "0")}`;
  await db.query(`INSERT INTO applications (id, reference_number, tier, account_type_requested, applicant_name, applicant_email, applicant_phone, status) VALUES ($1,$2,$3,'creditCard','Thandi Nkosi',$4,'+27820000000',$5)`, [id, ref, tier, EMAIL, o.status ?? "under_review"]);
  return { id, ref };
};
const statusOf = async (id: string) => String((await db.query(`SELECT status FROM applications WHERE id = $1`, [id])).rows[0].status);
const history = async (id: string) => (await db.query(`SELECT to_status FROM application_status_history WHERE application_id = $1`, [id])).rows.length;
/** The applicant confirms their identity: they start the check and Sumsub answers GREEN. */
const confirm = async (a: { id: string; ref: string }) => {
  await mod.identity.startSession("application", a.ref, EMAIL, true);
  await mod.identity.applyEvent({ type: "applicantReviewed", applicantId: "app1", externalUserId: `ap-${a.id}`, reviewStatus: "completed", reviewResult: { reviewAnswer: "GREEN" }, correlationId: `c${++seq}`, createdAtMs: "2026-11-01 10:05:00.000" });
};
const approve = (ref: string, role = "owner") => call("PATCH", `/api/applications/${ref}/status`, { status: "approved", reason: "Documents are in order" }, token(role));

describe("approving an application that must have a confirmed identity", () => {
  beforeEach(() => boot());
  it("is refused until the applicant's identity is confirmed, says why, and changes nothing", async () => {
    const a = await newApp(); const r = await approve(a.ref);
    expect(r).toMatchObject({ status: 409, body: { success: false, code: "identity_required", error: expect.stringContaining("has not started") } });
    expect(await statusOf(a.id)).toBe("under_review"); expect(await history(a.id)).toBe(0);                  // nothing was written
  });
  it("goes through once Sumsub has confirmed the applicant, and is recorded as before", async () => {
    const a = await newApp(); await confirm(a);
    expect(await approve(a.ref)).toMatchObject({ status: 200, body: { success: true, data: { status: "approved" } } }); expect(await statusOf(a.id)).toBe("approved"); expect(await history(a.id)).toBe(1);
  });
  it("applies to every tier, and to every kind of application that arrives here: accounts, cards and loans alike", async () => {
    for (const tier of ["personal", "business", "corporate"]) { const a = await newApp({ tier }); expect((await approve(a.ref)).status, tier).toBe(409); }
  });
  it("never stops a decline or a request for more information: only an approval needs the identity confirmed", async () => {
    const a = await newApp(); const move = (ref: string, status: string, reason: string) => call("PATCH", `/api/applications/${ref}/status`, { status, reason }, token("owner"));
    expect((await move(a.ref, "more_info_requested", "Need a payslip")).status).toBe(200); expect((await move(a.ref, "under_review", "Payslip received")).status).toBe(200);
    expect((await move(a.ref, "approved", "Looks fine")).status).toBe(409);                                         // the one thing that is held back
    expect((await move(a.ref, "declined", "Does not qualify")).status).toBe(200); expect(await statusOf(a.id)).toBe("declined");
  });
  it("still needs a reason and a valid status, as before", async () => {
    const a = await newApp(); await confirm(a);
    expect((await call("PATCH", `/api/applications/${a.ref}/status`, { status: "approved" }, token("owner"))).status).toBe(400);
    expect((await call("PATCH", `/api/applications/${a.ref}/status`, { status: "nonsense", reason: "x" }, token("owner"))).status).toBe(400);
    expect((await call("PATCH", `/api/applications/${a.ref}/status`, { status: "approved", reason: "ok" })).status).toBe(401);            // and signing in
  });
});

describe("a Super Administrator overriding the requirement", () => {
  beforeEach(() => boot());
  it("lets the approval through with a recorded reason, only for owners and Super Administrators, and audits it", async () => {
    const a = await newApp(); const url_ = `/api/applications/${a.ref}/identity/override`;
    expect((await call("POST", url_, { reason: "Known customer; ID checked in branch" }, token("billing_admin"))).status).toBe(403); expect((await call("POST", url_, { reason: "Known customer; ID checked in branch" }, token("noc_engineer"))).status).toBe(403);
    expect((await call("POST", url_, { reason: "Known customer; ID checked in branch" })).status).toBe(401); expect((await call("POST", url_, { reason: "short" }, token("owner"))).status).toBe(400);
    expect((await approve(a.ref, "billing_admin")).status).toBe(409);
    const r = await call("POST", url_, { reason: "Known customer; ID checked in branch" }, token("superadmin", "Vincent")); expect(r).toMatchObject({ status: 200, body: { data: { override: { reason: "Known customer; ID checked in branch", by: "Vincent" } } } });
    expect((await approve(a.ref, "billing_admin")).status).toBe(200); expect(await statusOf(a.id)).toBe("approved");
    expect((await db.query(`SELECT actor_name, target FROM audit_log WHERE action = 'application.identity_override'`)).rows).toEqual([{ actor_name: "Vincent", target: a.ref }]);
  });
});

describe("what staff see on an application", () => {
  beforeEach(() => boot());
  it("includes the identity check: whether it is required, where it stands and Sumsub's reasons", async () => {
    const a = await newApp({ tier: "business" }); const before = (await call("GET", `/api/applications/${a.ref}`, undefined, token("billing_admin"))).body.data;
    expect(before.identity).toMatchObject({ enabled: true, status: "not_started", requirement: "required", confirmed: false, override: null });
    await confirm(a); expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data.identity).toMatchObject({ status: "approved", confirmed: true, reviewAnswer: "GREEN" });
  });
  it("can be refreshed from Sumsub by reviewers, and the visit is audited", async () => {
    const a = await newApp(); await mod.identity.startSession("application", a.ref, EMAIL, true); mock.setReview(`ap-${a.id}`, "completed", { reviewAnswer: "GREEN" }); clock = new Date(clock.getTime() + 60_000);
    expect(await call("POST", `/api/applications/${a.ref}/identity/refresh`, {}, token("billing_admin"))).toMatchObject({ status: 200, body: { data: { status: "approved", confirmed: true } } });
    expect((await db.query(`SELECT 1 FROM audit_log WHERE action = 'application.identity_refresh'`)).rows).toHaveLength(1);
    expect((await call("POST", `/api/applications/${a.ref}/identity/refresh`, {})).status).toBe(401); expect((await call("POST", `/api/applications/VNK-PA-NOPE000001/identity/refresh`, {}, token("owner"))).status).toBe(404);
  });
});

describe("while the identity checks are switched off", () => {
  it("changes nothing: applications are approved exactly as before, and staff see that checks are off", async () => {
    await boot({} as NodeJS.ProcessEnv); const a = await newApp();
    expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data.identity).toMatchObject({ enabled: false, requirement: "off" });
    expect(await approve(a.ref)).toMatchObject({ status: 200, body: { data: { status: "approved" } } });
  });
  it("changes nothing either when the identity system is not wired in at all", async () => {
    await boot(); setApplicationsIdentity(null); const a = await newApp();
    expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data).not.toHaveProperty("identity"); expect((await approve(a.ref)).status).toBe(200);
    expect((await call("POST", `/api/applications/${a.ref}/identity/refresh`, {}, token("owner"))).status).toBe(503);
  });
});
