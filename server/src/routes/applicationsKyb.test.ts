import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";

const holder = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("../db/pool.js", () => ({ get pool() { return holder.pool; }, hasDb: true }));

import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { JWT_SECRET } from "../middleware/auth.js";
import applicationsRouter, { setApplicationsIdentity } from "./applicationsRouter.js";
import { createIdentityModule, type IdentityModule } from "../services/sumsub/module.js";
import { mockSumsub, type MockSumsub } from "../services/sumsub/mockSumsub.js";

const ENV = { SUMSUB_APP_TOKEN: "sbx:app-token", SUMSUB_SECRET_KEY: "the-secret-key", SUMSUB_WEBHOOK_SECRET: "whsec", SUMSUB_LEVEL_NAME: "vink-default", SUMSUB_LEVEL_KYB: "vink-kyb" } as NodeJS.ProcessEnv;
const EMAIL = "director@zuri.example";
type Body = Record<string, any>;

let db: Db, mod: IdentityModule, mock: MockSumsub, server: Server, url = "", clock: Date, n = 0, seq = 0;
const boot = async (env: NodeJS.ProcessEnv = ENV) => {
  db = allPortalsDb(); holder.pool = db; clock = new Date("2026-11-01T10:00:00Z");
  mock = mockSumsub({ appToken: "sbx:app-token", secretKey: "the-secret-key", levelName: "vink-default", companyLevels: ["vink-kyb"], now: () => clock });
  mod = createIdentityModule({ db, env, fetchImpl: mock.fetch, now: () => clock }); setApplicationsIdentity(mod.identity, mod.kyb);
  const app = express(); app.use(express.json()); app.use("/api/applications", applicationsRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(() => { n = 0; seq = 0; });
afterEach(async () => { setApplicationsIdentity(null); await new Promise<void>((ok) => server.close(() => ok())); });

const uuidFor = (role: string) => `00000000-0000-4000-8000-${[...role].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1e12, 7).toString().padStart(12, "0")}`;
const token = (role: string, name = `${role}-person`) => ({ authorization: `Bearer ${jwt.sign({ userId: uuidFor(role), username: name, role }, JWT_SECRET)}` });
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => { const r = await fetch(url + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as Body }; };
const newApp = async (tier = "business") => {
  const id = randomUUID(), ref = `VNK-BA-TEST${String(++n).padStart(6, "0")}`;
  await db.query(`INSERT INTO applications (id, reference_number, tier, account_type_requested, applicant_name, applicant_email, applicant_phone, status, tier_data) VALUES ($1,$2,$3,'account','Thandi Nkosi',$4,'+27820000000','under_review',$5)`, [id, ref, tier, EMAIL, JSON.stringify({ bizName: "Zuri Transport (Pty) Ltd", regNo: "2019/123456/07" })]);
  return { id, ref };
};
const statusOf = async (id: string) => String((await db.query(`SELECT status FROM applications WHERE id = $1`, [id])).rows[0].status);
/** The applicant finishes: they start the check, and Sumsub answers GREEN (the Sumsub applicant id is read back from the row, not guessed). */
const done = (engine: "identity" | "kyb", a: { id: string; ref: string }) => async () => {
  const e = mod[engine]; const table = engine === "kyb" ? "business_checks" : "identity_checks"; await e.startSession("application", a.ref, EMAIL, true);
  const applicantId = String((await db.query(`SELECT applicant_id FROM ${table} WHERE subject_id = $1`, [a.id])).rows[0].applicant_id);
  await e.applyEvent({ type: "applicantReviewed", applicantId, externalUserId: `${engine === "kyb" ? "ab" : "ap"}-${a.id}`, reviewStatus: "completed", reviewResult: { reviewAnswer: "GREEN" }, correlationId: `c${++seq}`, createdAtMs: "2026-11-01 10:05:00.000" });
};
const approve = (ref: string, role = "owner") => call("PATCH", `/api/applications/${ref}/status`, { status: "approved", reason: "Documents are in order" }, token(role));
const audits = async (like: string) => (await db.query(`SELECT action FROM audit_log WHERE action LIKE $1`, [like])).rows.map((r) => r.action as string);

describe("approving a business application", () => {
  beforeEach(() => boot());
  it("needs the person confirmed AND the business verified: either one missing refuses it, with a message about the one that is missing", async () => {
    const a = await newApp();
    expect(await approve(a.ref)).toMatchObject({ status: 409, body: { code: "identity_required", error: expect.stringContaining("applicant's identity") } });
    await done("identity", a)();                                                                                // the person is confirmed
    expect(await approve(a.ref)).toMatchObject({ status: 409, body: { code: "identity_required", error: expect.stringContaining("until the business is verified") } }); expect(await statusOf(a.id)).toBe("under_review");
    await done("kyb", a)();                                                                                     // and now the business too
    expect(await approve(a.ref)).toMatchObject({ status: 200, body: { data: { status: "approved" } } }); expect(await statusOf(a.id)).toBe("approved");
  });
  it("is refused for a verified business whose person was never confirmed", async () => {
    const a = await newApp("corporate"); await done("kyb", a)(); expect(await approve(a.ref)).toMatchObject({ status: 409, body: { error: expect.stringContaining("applicant's identity") } });
  });
  it("does not stop a decline or a request for more information", async () => {
    const a = await newApp(); expect((await call("PATCH", `/api/applications/${a.ref}/status`, { status: "declined", reason: "Does not qualify" }, token("owner"))).status).toBe(200);
  });
});

describe("a personal application is untouched by business verification", () => {
  beforeEach(() => boot());
  it("needs only the person confirmed, and shows no business block to staff", async () => {
    const a = await newApp("personal"); expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data).not.toHaveProperty("kyb");
    await done("identity", a)(); expect(await approve(a.ref)).toMatchObject({ status: 200 });
  });
});

describe("what staff see on a business application", () => {
  beforeEach(() => boot());
  it("includes both checks, each with whether it is required and where it stands", async () => {
    const a = await newApp(); await done("kyb", a)();
    const d = (await call("GET", `/api/applications/${a.ref}`, undefined, token("billing_admin"))).body.data;
    expect(d.identity).toMatchObject({ status: "not_started", requirement: "required" }); expect(d.kyb).toMatchObject({ status: "approved", confirmed: true, requirement: "required", levelName: "vink-kyb" });
  });
});

describe("refreshing and overriding the business verification", () => {
  beforeEach(() => boot());
  it("acts on the business only when told to, and on the person otherwise", async () => {
    const a = await newApp(); await mod.kyb.startSession("application", a.ref, EMAIL, true); mock.setReview(`ab-${a.id}`, "completed", { reviewAnswer: "GREEN" }); clock = new Date(clock.getTime() + 60_000);
    expect(await call("POST", `/api/applications/${a.ref}/identity/refresh`, {}, token("billing_admin"))).toMatchObject({ status: 409 });                           // the person has not started: nothing to refresh
    expect(await call("POST", `/api/applications/${a.ref}/identity/refresh`, { party: "company" }, token("billing_admin"))).toMatchObject({ status: 200, body: { data: { status: "approved" } } });
    expect(await audits("application.kyb_refresh")).toHaveLength(1);
  });
  it("lets only an owner or Super Administrator override the business, with a reason kept against the business only, and audits it separately", async () => {
    const a = await newApp(); const o = `/api/applications/${a.ref}/identity/override`; const why = "Registry search done by compliance; certificate on file.";
    expect((await call("POST", o, { party: "company", reason: why }, token("billing_admin"))).status).toBe(403); expect((await call("POST", o, { party: "company", reason: "short" }, token("owner"))).status).toBe(400);
    expect(await call("POST", o, { party: "company", reason: why }, token("superadmin", "Vincent"))).toMatchObject({ status: 200, body: { data: { override: { reason: why, by: "Vincent" } } } });
    expect((await db.query(`SELECT 1 FROM business_checks WHERE subject_id = $1 AND override_reason IS NOT NULL`, [a.id])).rows).toHaveLength(1); expect((await db.query(`SELECT 1 FROM identity_checks WHERE subject_id = $1`, [a.id])).rows).toHaveLength(0);
    expect(await audits("application.kyb_override")).toEqual(["application.kyb_override"]); expect(await audits("application.identity_override")).toHaveLength(0);
    expect(await approve(a.ref)).toMatchObject({ status: 409, body: { error: expect.stringContaining("applicant's identity") } });                                    // the person still has to be confirmed
    expect(await call("POST", o, { reason: why }, token("owner"))).toMatchObject({ status: 200 }); expect(await approve(a.ref)).toMatchObject({ status: 200 });               // overriding both, approval goes through
  });
  it("refuses a party it does not know rather than acting on the person check", async () => {
    const a = await newApp(); for (const path of ["refresh", "override"]) expect((await call("POST", `/api/applications/${a.ref}/identity/${path}`, { party: "partner", reason: "A good enough reason here" }, token("owner"))).status, path).toBe(400);
    expect((await db.query(`SELECT 1 FROM identity_checks`)).rows).toHaveLength(0);
  });
});

describe("when business verification is not set up", () => {
  it("changes nothing: a business application needs only the person confirmed, exactly as before", async () => {
    await boot({ ...ENV, SUMSUB_LEVEL_KYB: "" } as NodeJS.ProcessEnv); const a = await newApp();
    expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data.kyb).toMatchObject({ enabled: false, requirement: "off" });
    await done("identity", a)(); expect(await approve(a.ref)).toMatchObject({ status: 200 });
  });
  it("changes nothing when the business check is not wired in at all", async () => {
    await boot(); setApplicationsIdentity(mod.identity); const a = await newApp(); expect((await call("GET", `/api/applications/${a.ref}`, undefined, token("owner"))).body.data).not.toHaveProperty("kyb");
    await done("identity", a)(); expect(await approve(a.ref)).toMatchObject({ status: 200 });
  });
});
