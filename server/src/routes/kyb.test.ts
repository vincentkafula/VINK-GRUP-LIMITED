import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createHmac, randomUUID } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { createIdentityRouter } from "./identityRouter.js";
import { createIdentityModule, type IdentityModule } from "../services/sumsub/module.js";
import { mockSumsub, type MockSumsub } from "../services/sumsub/mockSumsub.js";

const ENV = { SUMSUB_APP_TOKEN: "sbx:app-token", SUMSUB_SECRET_KEY: "the-secret-key", SUMSUB_WEBHOOK_SECRET: "whsec", SUMSUB_LEVEL_NAME: "vink-default", SUMSUB_LEVEL_KYB: "vink-kyb" } as NodeJS.ProcessEnv;
const EMAIL = "director@zuri.example";
type Body = Record<string, any>;
type Table = "identity_checks" | "business_checks";

let db: Db, mod: IdentityModule, mock: MockSumsub, server: Server, url = "", clock: Date, seq = 0, nApps = 0;
const boot = async (env: NodeJS.ProcessEnv = ENV) => {
  mock = mockSumsub({ appToken: "sbx:app-token", secretKey: "the-secret-key", levelName: "vink-default", companyLevels: ["vink-kyb"], now: () => clock });
  mod = createIdentityModule({ db, env, fetchImpl: mock.fetch, now: () => clock });
  const app = express();
  app.use("/api/webhooks/sumsub", mod.webhookRouter);
  app.use("/api/identity", createIdentityRouter({ identity: mod.identity, kyb: mod.kyb, auth: (req, _res, next) => { const u = req.headers["x-test-user"]; if (typeof u === "string") req.user = JSON.parse(u); next(); } }));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(() => { db = allPortalsDb(); clock = new Date("2026-11-01T10:00:00Z"); seq = 0; nApps = 0; });
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

const post = async (p: string, body: unknown, headers: Record<string, string> = {}) => { const r = await fetch(url + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as Body }; };
const asUser = (u: { userId: string; username: string }) => ({ "x-test-user": JSON.stringify({ ...u, role: "customer" }) });
const newApplication = async (o: { tier?: "personal" | "business" | "corporate"; email?: string | null; tierData?: unknown; status?: string; userId?: string | null } = {}) => {
  const id = randomUUID(), tier = o.tier ?? "business", ref = `VNK-${{ personal: "PA", business: "BA", corporate: "CA" }[tier]}-KYB${String(++nApps).padStart(6, "0")}`;
  await db.query(`INSERT INTO applications (id, reference_number, tier, account_type_requested, applicant_user_id, applicant_name, applicant_email, applicant_phone, status, tier_data) VALUES ($1,$2,$3,'account',$4,'Thandi Nkosi',$5,'+27820000000',$6,$7)`,
    [id, ref, tier, o.userId ?? null, o.email === undefined ? EMAIL : o.email, o.status ?? "submitted", JSON.stringify(o.tierData ?? { bizName: "Zuri Transport (Pty) Ltd", regNo: "2019/123456/07" })]);
  return { id, ref };
};
const status = (ref: string, party: string | null = "company", email: string | null = EMAIL, headers: Record<string, string> = {}, kind = "application") => post("/api/identity/status", { kind, ref, ...(party === null ? {} : { party }), ...(email === null ? {} : { email }) }, headers);      // null: send no party / no email at all
const start = (ref: string, consent: unknown = true, party: string | null = "company", email: string | null = EMAIL, headers: Record<string, string> = {}, kind = "application") => post("/api/identity/token", { kind, ref, consent, ...(party === null ? {} : { party }), ...(email === null ? {} : { email }) }, headers);
const rowOf = async (table: Table, id: string) => (await db.query(`SELECT * FROM ${table} WHERE kind = 'application' AND subject_id = $1`, [id])).rows[0] as Body | undefined;
const hook = async (payload: unknown) => { const raw = JSON.stringify(payload); const r = await fetch(url + "/api/webhooks/sumsub", { method: "POST", headers: { "content-type": "application/json", "x-payload-digest": createHmac("sha256", "whsec").update(raw).digest("hex"), "x-payload-digest-alg": "HMAC_SHA256_HEX" }, body: raw }); return { status: r.status, body: (await r.json()) as Body }; };
const event = async (table: Table, id: string, type: string, extra: Body = {}) => { const r = (await rowOf(table, id))!; const reviewStatus = { applicantPending: "pending", applicantReviewed: "completed", applicantOnHold: "onHold" }[type]; return { type, applicantId: r.applicant_id, externalUserId: r.external_user_id, correlationId: `c${++seq}`, createdAtMs: clock.toISOString().replace("T", " ").replace("Z", ""), ...(reviewStatus ? { reviewStatus } : {}), ...extra }; };
const later = (s = 60) => { clock = new Date(clock.getTime() + s * 1000); };
const green = { reviewAnswer: "GREEN" }, red = { reviewAnswer: "RED", reviewRejectType: "RETRY", rejectLabels: ["COMPANY_NOT_DEFINED_STRUCTURE"], moderationComment: "Directors do not match the registry", clientComment: "Please add every director listed on your registration." };
const verify = async (table: Table, id: string, answer: Body) => { later(); await hook(await event(table, id, "applicantPending")); later(); await hook(await event(table, id, "applicantReviewed", { reviewResult: answer })); later(); };

describe("when business verification is not set up", () => {
  it("is off without a company level, even though identity checks are on: a level made for a person cannot verify a company", async () => {
    await boot({ ...ENV, SUMSUB_LEVEL_KYB: "" } as NodeJS.ProcessEnv); const a = await newApplication();
    expect((await status(a.ref)).body.data).toMatchObject({ enabled: false, canStart: false });
    const t = await start(a.ref); expect(t.status).toBe(503); expect(t.body.error).toMatch(/Business verification is not switched on/); expect(mock.applicants.size).toBe(0);                      // nothing reaches Sumsub
    expect((await status(a.ref, "person")).body.data).toMatchObject({ enabled: true });                                  // the person check is unaffected
    expect(await mod.kyb.gate("application", { id: a.id, profile: "business" })).toEqual({ ok: true });                  // and nothing is ever blocked by a feature that is off
  });
  it("is off entirely when identity checks are off", async () => { await boot({} as NodeJS.ProcessEnv); const a = await newApplication(); expect((await status(a.ref)).body.data.enabled).toBe(false); expect((await start(a.ref)).status).toBe(503); });
});

describe("which applications have a business to verify", () => {
  beforeEach(() => boot());
  it("business and corporate applications do; personal ones do not, so they are never asked and never blocked", async () => {
    for (const tier of ["business", "corporate"] as const) { const a = await newApplication({ tier }); expect((await status(a.ref)).body.data, tier).toMatchObject({ enabled: true, canStart: true, required: true }); }
    const p = await newApplication({ tier: "personal" }); expect((await status(p.ref)).body.data).toMatchObject({ enabled: false, canStart: false, required: false });
    const t = await start(p.ref); expect(t).toMatchObject({ status: 409, body: { error: "Business verification is not needed for this application." } }); expect(mock.applicants.size).toBe(0);
    expect(await mod.kyb.gate("application", { id: p.id, profile: "personal" })).toEqual({ ok: true });
  });
  it("a sponsorship has no business check", async () => { expect((await status("SP-ABCDEF", "company", EMAIL, {}, "sponsorship")).status).toBe(404); expect(mod.kyb.applies("sponsorship", "sponsorship")).toBe(false); });
  it("an unknown kind of check is refused", async () => { const a = await newApplication(); expect((await status(a.ref, "partner")).status).toBe(400); expect((await start(a.ref, true, "partner")).status).toBe(400); });
  it("and a request without a party is still the person check, as before", async () => { const a = await newApplication(); await start(a.ref, true, null); expect(await rowOf("identity_checks", a.id)).toBeTruthy(); expect(await rowOf("business_checks", a.id)).toBeUndefined(); });
});

describe("who may ask about the business", () => {
  beforeEach(() => boot());
  it("is whoever may ask about the application: its reference with the email on it, or the signed-in customer who owns it", async () => {
    const a = await newApplication({ email: null, userId: "user-7" });
    expect((await status(a.ref, "company", "someone@else.com")).status).toBe(404); expect((await status(a.ref, "company", null)).status).toBe(404);
    expect((await status(a.ref, "company", null, asUser({ userId: "user-7", username: "x@y.co" }))).status).toBe(200); expect((await status(a.ref, "company", null, asUser({ userId: "user-8", username: "x@y.co" }))).status).toBe(404);
  });
});

describe("starting the business verification", () => {
  beforeEach(() => boot());
  it("needs consent that names Sumsub and the business documents, and creates nothing at Sumsub until it is given", async () => {
    const a = await newApplication(); for (const consent of [null, false, "yes", 1]) expect(await start(a.ref, consent)).toMatchObject({ status: 400, body: { error: expect.stringMatching(/business documents.*Sumsub/) } }); expect(mock.applicants.size).toBe(0);
  });
  it("creates a COMPANY applicant with the company level, under an opaque id, with what the application says about the business", async () => {
    const a = await newApplication(); const r = await start(a.ref); expect(r).toMatchObject({ status: 200, body: { data: { status: "in_progress", expiresInSecs: 900 } } });
    const made = mock.calls.find((c) => c.path.startsWith("/resources/applicants?"))!; expect(made.path).toBe("/resources/applicants?levelName=vink-kyb");
    expect(made.body).toEqual({ externalUserId: `ab-${a.id}`, email: EMAIL, phone: "+27820000000", type: "company", info: { companyInfo: { companyName: "Zuri Transport (Pty) Ltd", registrationNumber: "2019/123456/07" } } });
    expect(await rowOf("business_checks", a.id)).toMatchObject({ profile: "business", level_name: "vink-kyb", status: "in_progress", external_user_id: `ab-${a.id}` }); expect(await rowOf("identity_checks", a.id)).toBeUndefined();
    expect(JSON.stringify(mock.calls)).not.toMatch(/Thandi|VNK-/);                                                     // the applicant's name and our reference never leave
  });
  it("works for each shape of business application, and when the business details were left blank", async () => {
    const shapes: [unknown, Body][] = [[{ business: { name: "Flow Co", registrationNumber: "R1" } }, { companyName: "Flow Co", registrationNumber: "R1" }], [{ businessName: "Loan Co", cipcNumber: "R2" }, { companyName: "Loan Co", registrationNumber: "R2" }],
      [{ company: { name: "Corp Co", cipc: "R3" } }, { companyName: "Corp Co", registrationNumber: "R3" }], [{ bizName: "", regNo: "" }, {}], [{}, {}]];
    for (const [tierData, info] of shapes) { const a = await newApplication({ tierData, tier: "corporate" }); expect((await start(a.ref)).status, JSON.stringify(tierData)).toBe(200); expect(mock.calls.filter((c) => c.path.startsWith("/resources/applicants?")).at(-1)!.body!.info).toEqual({ companyInfo: info }); }
  });
  it("carries on with the same Sumsub record when they come back, and is not offered once the application is decided", async () => {
    const a = await newApplication(); const first = await start(a.ref); const again = await start(a.ref, null); expect(again.status).toBe(200); expect(again.body.data.token).not.toBe(first.body.data.token); expect(mock.applicants.size).toBe(1);
    for (const st of ["approved", "declined"]) { const d = await newApplication({ status: st }); expect((await status(d.ref)).body.data.canStart).toBe(false); expect((await start(d.ref)).status).toBe(409); }
  });
  it("tells the applicant plainly, and nothing technical, when Sumsub refuses (for example a level that is not a company level)", async () => {
    await new Promise<void>((ok) => server.close(() => ok())); await boot({ ...ENV, SUMSUB_LEVEL_KYB: "vink-default" } as NodeJS.ProcessEnv);       // the person level set by mistake as the company level
    const a = await newApplication(); const r = await start(a.ref); expect(r.status).toBe(502); expect(r.body.error).toBe("We could not start the check just now. Please try again in a few minutes."); expect(JSON.stringify(r.body)).not.toMatch(/company level|400/);
  });
});

describe("the person and the business are checked separately", () => {
  beforeEach(() => boot());
  it("each has its own row, its own opaque id and its own Sumsub level, and one does not change the other", async () => {
    const a = await newApplication(); await start(a.ref, true, "person"); await start(a.ref, true, "company");
    expect(await rowOf("identity_checks", a.id)).toMatchObject({ external_user_id: `ap-${a.id}`, level_name: "vink-default" }); expect(await rowOf("business_checks", a.id)).toMatchObject({ external_user_id: `ab-${a.id}`, level_name: "vink-kyb" });
    await verify("business_checks", a.id, green);
    expect((await status(a.ref, "company")).body.data.status).toBe("approved"); expect((await status(a.ref, "person")).body.data.status).toBe("in_progress");
  });
});

describe("Sumsub reports back on a business through the same webhook", () => {
  beforeEach(() => boot());
  it("lands each event on the right check, and acknowledges events for the people Sumsub adds behind a business", async () => {
    const a = await newApplication(); await start(a.ref, true, "person"); await start(a.ref, true, "company");
    await verify("business_checks", a.id, red); expect(await rowOf("business_checks", a.id)).toMatchObject({ status: "retry", review_answer: "RED", reject_type: "RETRY" }); expect(await rowOf("identity_checks", a.id)).toMatchObject({ status: "in_progress" });
    later(); await hook(await event("identity_checks", a.id, "applicantReviewed", { reviewResult: green })); expect(await rowOf("identity_checks", a.id)).toMatchObject({ status: "approved" }); expect(await rowOf("business_checks", a.id)).toMatchObject({ status: "retry" });
    expect(await hook({ type: "applicantReviewed", applicantId: "director-1", externalUserId: "ben-xyz", reviewStatus: "completed", reviewResult: green })).toMatchObject({ status: 200, body: { ignored: "unknown applicant" } });
  });
  it("shows the applicant only what Sumsub says they may be told, in words about the business, and staff everything", async () => {
    const a = await newApplication(); await start(a.ref); await verify("business_checks", a.id, red);
    const t = await status(a.ref); expect(t.body.data).toMatchObject({ status: "retry", canStart: true }); expect(t.body.data.message).toContain("We could not verify your business"); expect(t.body.data.message).toContain("add every director"); expect(JSON.stringify(t.body)).not.toMatch(/COMPANY_NOT_DEFINED|Directors do not match/);
    const v = await mod.kyb.staffView("application", { id: a.id, profile: "business" }); expect(v).toMatchObject({ requirement: "required", rejectLabels: ["COMPANY_NOT_DEFINED_STRUCTURE"], moderationComment: "Directors do not match the registry", levelName: "vink-kyb" });
  });
  it("applies each event once and ignores one that arrives late", async () => {
    const a = await newApplication(); await start(a.ref); const ev = await event("business_checks", a.id, "applicantPending"); expect(await hook(ev)).toMatchObject({ status: 200 }); expect(await hook(ev)).toMatchObject({ body: { ignored: "duplicate" } });
    expect(await hook(await event("business_checks", a.id, "applicantOnHold", { createdAtMs: "2026-11-01 09:00:00.000" }))).toMatchObject({ body: { ignored: "older than what we already have" } });
  });
});

describe("the requirement that the business is verified before approval", () => {
  const app = (profile: "personal" | "business" | "corporate", id: string) => ({ id, profile });
  it("blocks a business or corporate application until Sumsub has verified the business, in words about the business, and not a personal one", async () => {
    await boot(); const a = await newApplication();
    expect(await mod.kyb.gate("application", app("business", a.id))).toMatchObject({ ok: false, status: 409, code: "identity_required", error: expect.stringContaining("until the business is verified") });
    expect((await mod.kyb.gate("application", app("business", a.id)) as { error: string }).error).toContain("has not started being verified");
    await start(a.ref); expect((await mod.kyb.gate("application", app("business", a.id)) as { error: string }).error).toContain("was started but not finished");
    await verify("business_checks", a.id, red); expect((await mod.kyb.gate("application", app("business", a.id)) as { error: string }).error).toContain("may try again");
    expect((await mod.kyb.gate("application", app("corporate", "other"))).ok).toBe(false); expect((await mod.kyb.gate("application", app("personal", "p"))).ok).toBe(true);
  });
  it("passes once verified, or once a Super Administrator has overridden it with a reason, which is kept with their name", async () => {
    await boot(); const a = await newApplication(); await start(a.ref); await verify("business_checks", a.id, green); expect(await mod.kyb.gate("application", app("business", a.id))).toEqual({ ok: true });
    const b = await newApplication(); expect(await mod.kyb.override("application", b.ref, "short", "Vincent")).toMatchObject({ ok: false, status: 400 });
    later(); expect(await mod.kyb.override("application", b.ref, "Registry search done by compliance; certificate on file.", "Vincent")).toMatchObject({ ok: true, view: { override: { by: "Vincent", at: clock.toISOString() } } });
    expect(await mod.kyb.gate("application", app("business", b.id))).toEqual({ ok: true }); expect(await rowOf("identity_checks", b.id)).toBeUndefined();         // the person check is untouched
  });
  it("follows the setting for which kinds, including none, and a blank or misspelt setting uses the default", async () => {
    await boot({ ...ENV, SUMSUB_KYB_REQUIRED_FOR: "business" } as NodeJS.ProcessEnv); expect((await mod.kyb.gate("application", app("business", "x"))).ok).toBe(false); expect((await mod.kyb.gate("application", app("corporate", "y"))).ok).toBe(true);
    for (const v of ["", "  ", "bussiness", "personal"]) { await new Promise<void>((ok) => server.close(() => ok())); await boot({ ...ENV, SUMSUB_KYB_REQUIRED_FOR: v } as NodeJS.ProcessEnv); expect((await mod.kyb.gate("application", app("business", "x"))).ok, JSON.stringify(v)).toBe(false); expect((await mod.kyb.gate("application", app("corporate", "y"))).ok, JSON.stringify(v)).toBe(false); }
    await new Promise<void>((ok) => server.close(() => ok())); await boot({ ...ENV, SUMSUB_KYB_REQUIRED_FOR: "none" } as NodeJS.ProcessEnv); for (const p of ["business", "corporate"] as const) expect((await mod.kyb.gate("application", app(p, "z"))).ok, p).toBe(true);
    expect((await mod.kyb.staffView("application", app("business", "z"))).requirement).toBe("recommended");
  });
  it("can be refreshed from Sumsub by staff when an event was missed", async () => {
    await boot(); const a = await newApplication(); await start(a.ref); mock.setReview(`ab-${a.id}`, "completed", green); later();
    expect(await mod.kyb.refresh("application", a.ref)).toMatchObject({ ok: true, view: { status: "approved", confirmed: true } }); const b = await newApplication(); expect(await mod.kyb.refresh("application", b.ref)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("verifying the business") });
  });
});
