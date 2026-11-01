import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createHmac, randomUUID } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createSponsorship, type Sponsorship } from "./sponsorshipRouter.js";
import { createIdentityRouter } from "./identityRouter.js";
import { createIdentityModule, type IdentityModule } from "../services/sumsub/module.js";
import { mockSumsub, type MockSumsub } from "../services/sumsub/mockSumsub.js";
import { good, ngoDocs } from "./sponsorshipFixtures.js";

const ENV = { SUMSUB_APP_TOKEN: "sbx:app-token", SUMSUB_SECRET_KEY: "the-secret-key", SUMSUB_WEBHOOK_SECRET: "whsec", SUMSUB_LEVEL_NAME: "vink-default", SUMSUB_LEVEL_BUSINESS: "vink-business", SUMSUB_LEVEL_SPONSORSHIP: "vink-sponsor" } as NodeJS.ProcessEnv;
const EMAIL = "thandi@example.com", ADMIN = "00000000-0000-4000-8000-000000000090";
type Body = Record<string, any>;
type Kind = "application" | "sponsorship";

let db: Db, sys: Sponsorship, mod: IdentityModule, mock: MockSumsub, server: Server, url = "", clock: Date, seq = 0, nApps = 0;
const boot = async (env: NodeJS.ProcessEnv = ENV) => {
  mock = mockSumsub({ appToken: "sbx:app-token", secretKey: "the-secret-key", levelName: "vink-default", moreLevels: ["vink-business", "vink-sponsor"], now: () => clock });
  mod = createIdentityModule({ db, env, fetchImpl: mock.fetch, now: () => clock });
  sys = createSponsorship({ db, mail: new ConsoleEmail(), env, now: () => clock, identity: mod.identity });
  const app = express();
  app.use("/api/webhooks/sumsub", mod.webhookRouter);                                  // before any JSON parser, as in the server
  app.use("/api/identity", createIdentityRouter({ identity: mod.identity, auth: (req, _res, next) => { const u = req.headers["x-test-user"]; if (typeof u === "string") req.user = JSON.parse(u); next(); } }));
  app.use("/api/sponsorship", sys.publicRouter);
  app.use((req, _r, next) => { req.user = { userId: ADMIN, username: "admin", role: "superadmin" }; next(); });
  app.use("/admin", sys.adminRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(() => { db = allPortalsDb(); clock = new Date("2026-11-01T10:00:00Z"); seq = 0; nApps = 0; });
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

const post = async (p: string, body: unknown, headers: Record<string, string> = {}) => { const r = await fetch(url + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { status: r.status, headers: r.headers, body: (await r.json()) as Body }; };
const getJson = async (p: string) => { const r = await fetch(url + p); return { status: r.status, body: (await r.json()) as Body }; };
const asUser = (u: { userId: string; username: string }) => ({ "x-test-user": JSON.stringify({ ...u, role: "customer" }) });

/** An account, card or loan application as the applications table holds it. */
const newApplication = async (o: { tier?: "personal" | "business" | "corporate"; email?: string | null; phone?: string | null; userId?: string | null; status?: string } = {}) => {
  const id = randomUUID(), tier = o.tier ?? "personal", ref = `VNK-${{ personal: "PA", business: "BA", corporate: "CA" }[tier]}-TEST${String(++nApps).padStart(6, "0")}`;
  await db.query(`INSERT INTO applications (id, reference_number, tier, account_type_requested, applicant_user_id, applicant_name, applicant_email, applicant_phone, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, ref, tier, "creditCard", o.userId ?? null, "Thandi Nkosi", o.email === undefined ? EMAIL : o.email, o.phone === undefined ? "+27 82 000 0000" : o.phone, o.status ?? "submitted"]);
  return { id, ref };
};
const newSponsorship = async () => { const ref = ((await sys.svc.submit(good, ngoDocs())) as { ref: string }).ref; return { ref, id: String((await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0].id) }; };
const status = (kind: unknown, ref: string, email: string | null = EMAIL, headers: Record<string, string> = {}) => post("/api/identity/status", { kind, ref, ...(email === null ? {} : { email }) }, headers);      // null: send no email address at all
const start = (kind: unknown, ref: string, consent: unknown = true, email: string | null = EMAIL, headers: Record<string, string> = {}) => post("/api/identity/token", { kind, ref, consent, ...(email === null ? {} : { email }) }, headers);
const rowOf = async (kind: Kind, id: string) => (await db.query(`SELECT * FROM identity_checks WHERE kind = $1 AND subject_id = $2`, [kind, id])).rows[0] as Body | undefined;

/** A webhook as Sumsub sends it: the exact bytes, signed with the webhook secret. */
const hook = async (payload: unknown, o: { secret?: string; alg?: string; raw?: string } = {}) => {
  const raw = o.raw ?? JSON.stringify(payload); const alg = o.alg ?? "HMAC_SHA256_HEX";
  const digest = createHmac(alg.replace("HMAC_", "").replace("_HEX", "").toLowerCase(), o.secret ?? "whsec").update(raw).digest("hex");
  const r = await fetch(url + "/api/webhooks/sumsub", { method: "POST", headers: { "content-type": "application/json", "x-payload-digest": digest, "x-payload-digest-alg": alg }, body: raw });
  return { status: r.status, body: (await r.json()) as Body };
};
const event = async (kind: Kind, id: string, type: string, extra: Body = {}) => {
  const r = (await rowOf(kind, id))!; const reviewStatus = { applicantPending: "pending", applicantReviewed: "completed", applicantOnHold: "onHold", applicantReset: "init", applicantCreated: "init" }[type];
  return { type, applicantId: r.applicant_id, externalUserId: r.external_user_id, correlationId: `c${++seq}`, createdAtMs: clock.toISOString().replace("T", " ").replace("Z", ""), ...(reviewStatus ? { reviewStatus } : {}), ...extra };
};
const later = (s = 60) => { clock = new Date(clock.getTime() + s * 1000); };
const green = { reviewAnswer: "GREEN" };
const retry = { reviewAnswer: "RED", reviewRejectType: "RETRY", rejectLabels: ["BAD_PHOTO_QUALITY", "FORGERY_SUSPECTED"], moderationComment: "Looks edited; ask for the original", clientComment: "The photo was blurred. Please retake it in good light." };
/** Takes a check all the way to Sumsub's answer. */
const finish = async (kind: Kind, ref: string, id: string, answer: Body) => { await start(kind, ref); later(); await hook(await event(kind, id, "applicantPending")); later(); await hook(await event(kind, id, "applicantReviewed", { reviewResult: answer })); later(); };

describe("when Sumsub is not set up", () => {
  beforeEach(() => boot({} as NodeJS.ProcessEnv));
  it("offers applicants nothing, refuses to start a check, never calls Sumsub, and answers the webhook with 503", async () => {
    const a = await newApplication();
    expect((await status("application", a.ref)).body.data).toMatchObject({ enabled: false, canStart: false, required: false });
    expect(await start("application", a.ref)).toMatchObject({ status: 503 }); expect(mock.calls).toHaveLength(0);
    expect((await hook({ type: "applicantReviewed", applicantId: "x" })).status).toBe(503);
  });
  it("never blocks an approval, so a missing setting cannot lock staff out", async () => {
    const a = await newApplication(); for (const profile of ["personal", "business", "corporate", "sponsorship"] as const) expect(await mod.identity.gate("application", { id: a.id, profile })).toEqual({ ok: true });
  });
});

describe("who may ask about an application", () => {
  beforeEach(() => boot());
  it("is the person who has its reference and the email address on it, in any letter case, and no one else", async () => {
    const a = await newApplication({ email: "Thandi@Example.com" });
    for (const [ref, email] of [[a.ref, EMAIL], [a.ref.toLowerCase(), " THANDI@example.com "]] as const) expect((await status("application", ref, email)).body.data).toMatchObject({ enabled: true, status: "not_started", canStart: true, consentRequired: true, required: true });
    for (const [ref, email] of [[a.ref, "someone@else.com"], ["VNK-PA-NOPE000001", EMAIL], ["not-a-ref", EMAIL], [a.ref, ""]] as const) expect((await status("application", ref, email)).status, `${ref} ${email}`).toBe(404);
  });
  it("is told which kind of application it is for, and a sponsorship reference does not open an account application or the other way round", async () => {
    const a = await newApplication(), s = await newSponsorship();
    expect((await status("nonsense", a.ref)).status).toBe(400); expect((await status(undefined, a.ref)).status).toBe(400);
    expect((await status("application", s.ref)).status).toBe(404); expect((await status("sponsorship", a.ref)).status).toBe(404);
    expect((await status("sponsorship", s.ref)).body.data).toMatchObject({ enabled: true, canStart: true, required: false });
  });
  it("can also be a signed-in customer: by the email that is their login, or by the account the application was sent from, but never someone else's", async () => {
    const byEmail = await newApplication({ email: EMAIL }), byAccount = await newApplication({ email: null, userId: "user-7" });
    expect((await status("application", byEmail.ref, null, asUser({ userId: "user-1", username: EMAIL }))).status).toBe(200);
    expect((await status("application", byAccount.ref, null, asUser({ userId: "user-7", username: "other@x.co" }))).status).toBe(200);
    expect((await status("application", byEmail.ref, null, asUser({ userId: "user-1", username: "mallory@x.co" }))).status).toBe(404);
    expect((await status("application", byAccount.ref, null, asUser({ userId: "user-8", username: "mallory@x.co" }))).status).toBe(404);
    expect((await status("application", byEmail.ref, null)).status).toBe(404);                              // not signed in and no email: nothing proves it is theirs
  });
});

describe("starting the check on an application", () => {
  beforeEach(() => boot());
  it("needs consent that names Sumsub (only the boolean true counts), and creates nothing at Sumsub until it is given", async () => {
    const a = await newApplication();
    for (const consent of [null, false, "yes", 1, 0, "true"]) expect(await start("application", a.ref, consent)).toMatchObject({ status: 400, body: { error: expect.stringContaining("Sumsub") } });
    expect(await post("/api/identity/token", { kind: "application", ref: a.ref, email: EMAIL })).toMatchObject({ status: 400 }); expect(mock.applicants.size).toBe(0);
  });
  it("creates them at Sumsub under an opaque id with the right level for their tier, records the consent, and returns a token that nothing may cache", async () => {
    const cases = [["personal", "vink-default"], ["business", "vink-business"], ["corporate", "vink-default"]] as const;
    for (const [tier, level] of cases) {
      const a = await newApplication({ tier }); const r = await start("application", a.ref);
      expect(r).toMatchObject({ status: 200, body: { success: true, data: { status: "in_progress", expiresInSecs: 900 } } }); expect(r.body.data.token).toMatch(/^_act-/); expect(r.headers.get("cache-control")).toBe("no-store");
      const made = mock.calls.filter((c) => c.path.startsWith("/resources/applicants?")).at(-1)!;
      expect(made.path).toBe(`/resources/applicants?levelName=${level}`); expect(made.body).toEqual({ externalUserId: `ap-${a.id}`, email: EMAIL, phone: "+27820000000" });
      expect(await rowOf("application", a.id)).toMatchObject({ profile: tier, level_name: level, status: "in_progress", external_user_id: `ap-${a.id}` });
    }
    expect(JSON.stringify(mock.calls)).not.toMatch(/Thandi|VNK-/);                                           // no name and no reference number ever leave
  });
  it("leaves out a phone number that is not in international format, and works without an email address when the customer is signed in as its owner", async () => {
    const a = await newApplication({ phone: "082 000 0000", email: null, userId: "user-7" }); const r = await start("application", a.ref, true, null, asUser({ userId: "user-7", username: "x@y.co" }));
    expect(r.status).toBe(200); expect(mock.calls.find((c) => c.path.startsWith("/resources/applicants?"))!.body).toEqual({ externalUserId: `ap-${a.id}` });
  });
  it("carries on with the same Sumsub record and a fresh token when they come back, without asking for consent again", async () => {
    const a = await newApplication(); const first = await start("application", a.ref); const again = await start("application", a.ref, null);
    expect(again.status).toBe(200); expect(again.body.data.token).not.toBe(first.body.data.token); expect(mock.applicants.size).toBe(1);
  });
  it("is not offered, and cannot be started, once the application has been decided", async () => {
    for (const st of ["approved", "declined"]) { const a = await newApplication({ status: st }); expect((await status("application", a.ref)).body.data.canStart).toBe(false); expect((await start("application", a.ref)).status).toBe(409); }
    expect(mock.applicants.size).toBe(0);
  });
  it("tells the applicant plainly, and nothing technical, when Sumsub cannot be reached", async () => {
    const a = await newApplication(); mock.failNext(500); const r = await start("application", a.ref);
    expect(r.status).toBe(502); expect(r.body.error).toBe("We could not start the check just now. Please try again in a few minutes."); expect(JSON.stringify(r.body)).not.toMatch(/Sumsub answered|Injected|500/);
    expect((await start("application", a.ref)).status).toBe(200);
  });
  it("is limited to 15 attempts an hour from one address", async () => {
    const a = await newApplication(); let last = 0; for (let i = 0; i < 17; i++) last = (await start("application", a.ref, true, "x@y.co")).status; expect(last).toBe(429);
  });
});

describe("Sumsub reports back, for every kind of application, through one webhook", () => {
  beforeEach(() => boot());
  it("refuses an event that is not signed with the webhook secret, or whose body was changed, whatever it claims", async () => {
    const a = await newApplication(); await start("application", a.ref); const ev = await event("application", a.id, "applicantReviewed", { reviewResult: green });
    expect((await hook(ev, { secret: "guess" })).status).toBe(401);
    const signed = JSON.stringify(ev); const r = await fetch(url + "/api/webhooks/sumsub", { method: "POST", headers: { "content-type": "application/json", "x-payload-digest": createHmac("sha256", "whsec").update(signed).digest("hex"), "x-payload-digest-alg": "HMAC_SHA256_HEX" }, body: JSON.stringify(ev, null, 2) });
    expect(r.status).toBe(401); expect((await rowOf("application", a.id))!.status).toBe("in_progress");
  });
  it("moves an application's check through submitted, on hold, reviewed and confirmed, and then closes it to further tries", async () => {
    const a = await newApplication(); await start("application", a.ref); later();
    await hook(await event("application", a.id, "applicantPending")); expect((await status("application", a.ref)).body.data).toMatchObject({ status: "pending", canStart: false, attempts: 1 });
    later(); await hook(await event("application", a.id, "applicantOnHold")); expect((await status("application", a.ref)).body.data.status).toBe("on_hold");
    later(); await hook(await event("application", a.id, "applicantReviewed", { reviewResult: green }));
    expect((await status("application", a.ref)).body.data).toMatchObject({ status: "approved", canStart: false, message: "Your identity has been confirmed. Thank you." }); expect((await start("application", a.ref)).status).toBe(409);
  });
  it("lets the applicant try again after a RETRY, showing them only what Sumsub says they may be told, and nothing after a final rejection", async () => {
    const a = await newApplication(); await finish("application", a.ref, a.id, retry);
    const t = await status("application", a.ref); expect(t.body.data).toMatchObject({ status: "retry", canStart: true }); expect(t.body.data.message).toContain("The photo was blurred"); expect(JSON.stringify(t.body)).not.toMatch(/FORGERY|BAD_PHOTO_QUALITY|Looks edited/);
    await hook(await event("application", a.id, "applicantReset")); expect((await rowOf("application", a.id))).toMatchObject({ status: "in_progress", review_answer: null, moderation_comment: null });
    const b = await newApplication(); await finish("application", b.ref, b.id, { reviewAnswer: "RED", reviewRejectType: "FINAL", rejectLabels: ["FORGERY"], moderationComment: "Forged ID" });
    const f = await status("application", b.ref); expect(f.body.data).toMatchObject({ status: "rejected", canStart: false }); expect(JSON.stringify(f.body)).not.toMatch(/FORGERY|Forged/);
  });
  it("applies each event once, ignores one that arrives late, and acknowledges applicants that are not ours", async () => {
    const a = await newApplication(); await start("application", a.ref); const ev = await event("application", a.id, "applicantPending");
    expect(await hook(ev)).toMatchObject({ status: 200 }); expect(await hook(ev)).toMatchObject({ status: 200, body: { ignored: "duplicate" } }); expect((await status("application", a.ref)).body.data.attempts).toBe(1);
    const older = await event("application", a.id, "applicantOnHold", { createdAtMs: "2026-11-01 09:00:00.000" }); expect(await hook(older)).toMatchObject({ body: { ignored: "older than what we already have" } });
    expect(await hook({ type: "applicantReviewed", applicantId: "someone-elses", externalUserId: "ap-other", reviewStatus: "completed", reviewResult: green })).toMatchObject({ status: 200, body: { ignored: "unknown applicant" } });
  });
  it("lands each event on the right kind of application when an account application and a sponsorship are both being checked", async () => {
    const a = await newApplication(), s = await newSponsorship(); await start("application", a.ref); await start("sponsorship", s.ref); later();
    await hook(await event("application", a.id, "applicantReviewed", { reviewResult: green })); await hook(await event("sponsorship", s.id, "applicantReviewed", { reviewResult: retry }));
    expect((await status("application", a.ref)).body.data.status).toBe("approved"); expect((await status("sponsorship", s.ref)).body.data.status).toBe("retry");
    expect(mock.calls.filter((c) => c.path.startsWith("/resources/applicants?")).map((c) => c.path.split("=")[1])).toEqual(["vink-default", "vink-sponsor"]);      // and each used its own level
  });
});

describe("the approval gate", () => {
  const app = (profile: "personal" | "business" | "corporate" | "sponsorship", id = "x") => ({ id, profile });
  it("blocks the approval of a kind that must have a confirmed identity, saying where the check stands, until it is confirmed", async () => {
    await boot(); const a = await newApplication();
    expect(await mod.identity.gate("application", app("personal", a.id))).toMatchObject({ ok: false, status: 409, code: "identity_required", error: expect.stringContaining("has not started") });
    await start("application", a.ref); expect(await mod.identity.gate("application", app("personal", a.id))).toMatchObject({ ok: false, error: expect.stringContaining("started confirming") });
    later(); await hook(await event("application", a.id, "applicantPending")); expect(await mod.identity.gate("application", app("personal", a.id))).toMatchObject({ ok: false, error: expect.stringContaining("still being reviewed") });
    later(); await hook(await event("application", a.id, "applicantReviewed", { reviewResult: retry })); expect(await mod.identity.gate("application", app("personal", a.id))).toMatchObject({ ok: false, error: expect.stringContaining("may try again") });
    later(); await hook(await event("application", a.id, "applicantReset")); later(); await hook(await event("application", a.id, "applicantReviewed", { reviewResult: green }));
    expect(await mod.identity.gate("application", app("personal", a.id))).toEqual({ ok: true });
  });
  it("applies to accounts and loans of every tier but not to sponsorships, unless it is told to", async () => {
    await boot(); for (const p of ["personal", "business", "corporate"] as const) expect((await mod.identity.gate("application", app(p, `n-${p}`))).ok, p).toBe(false); expect((await mod.identity.gate("sponsorship", app("sponsorship", "n-sp"))).ok).toBe(true);
  });
  it("follows the setting for which kinds are required, including none", async () => {
    await server?.close(); await boot({ ...ENV, SUMSUB_REQUIRED_FOR: "sponsorship" }); expect((await mod.identity.gate("sponsorship", app("sponsorship"))).ok).toBe(false); expect((await mod.identity.gate("application", app("personal"))).ok).toBe(true);
    await new Promise<void>((ok) => server.close(() => ok())); await boot({ ...ENV, SUMSUB_REQUIRED_FOR: "none" }); for (const p of ["personal", "business", "corporate", "sponsorship"] as const) expect((await mod.identity.gate("application", app(p))).ok, p).toBe(true);
  });
});

describe("a Super Administrator overriding the requirement", () => {
  beforeEach(() => boot());
  it("needs a real reason, is kept with who and when, and makes the approval possible even though the identity was never confirmed", async () => {
    const a = await newApplication();
    for (const reason of [undefined, "", "short", "         ", 42]) expect(await mod.identity.override("application", a.ref, reason, "Vincent")).toMatchObject({ ok: false, status: 400 });
    expect((await mod.identity.gate("application", { id: a.id, profile: "personal" })).ok).toBe(false);
    later(); const r = await mod.identity.override("application", a.ref, "Known customer of ten years; ID checked in person at the branch.", "Vincent");
    expect(r).toMatchObject({ ok: true, view: { override: { reason: "Known customer of ten years; ID checked in person at the branch.", by: "Vincent", at: clock.toISOString() }, confirmed: false } });
    expect(await mod.identity.gate("application", { id: a.id, profile: "personal" })).toEqual({ ok: true });
  });
  it("is refused for an unknown application or kind", async () => {
    expect(await mod.identity.override("application", "VNK-PA-NOPE000001", "A good enough reason here", "V")).toMatchObject({ ok: false, status: 404 }); expect(await mod.identity.override("nonsense" as never, "x", "A good enough reason here", "V")).toMatchObject({ ok: false, status: 400 });
  });
  it("means nothing, and is refused, while the checks are switched off", async () => {
    await new Promise<void>((ok) => server.close(() => ok())); await boot({} as NodeJS.ProcessEnv); const a = await newApplication();
    expect(await mod.identity.override("application", a.ref, "A good enough reason here", "V")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("staff see it", () => {
  beforeEach(() => boot());
  it("with Sumsub's answer and reasons, whether it is required, and any override, for an account application", async () => {
    const a = await newApplication({ tier: "business" }); await finish("application", a.ref, a.id, retry);
    const v = await mod.identity.staffView("application", { id: a.id, profile: "business" });
    expect(v).toMatchObject({ enabled: true, status: "retry", requirement: "required", confirmed: false, reviewAnswer: "RED", rejectType: "RETRY", rejectLabels: ["BAD_PHOTO_QUALITY", "FORGERY_SUSPECTED"], moderationComment: "Looks edited; ask for the original", levelName: "vink-business", override: null });
    expect(v.caseUrl).toBe("https://cockpit.sumsub.com/checkus#/applicant/app1");
  });
  it("as 'recommended' for a kind that is not required, and 'off' when the checks are not switched on", async () => {
    expect((await mod.identity.staffView("sponsorship", { id: "x", profile: "sponsorship" })).requirement).toBe("recommended");
    await new Promise<void>((ok) => server.close(() => ok())); await boot({} as NodeJS.ProcessEnv); expect((await mod.identity.staffView("application", { id: "x", profile: "personal" })).requirement).toBe("off");
  });
  it("and can ask Sumsub for the latest when an event was missed, for an account application", async () => {
    const a = await newApplication(); await start("application", a.ref); mock.setReview(`ap-${a.id}`, "completed", green); later();
    expect(await mod.identity.refresh("application", a.ref)).toMatchObject({ ok: true, view: { status: "approved", confirmed: true } });
    expect(await mod.identity.refresh("application", "VNK-PA-NOPE000001")).toMatchObject({ ok: false, status: 404 }); const b = await newApplication(); expect(await mod.identity.refresh("application", b.ref)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("sponsorships, on the same engine", () => {
  beforeEach(() => boot());
  it("show the check on the application for staff and on the applicant's tracking answer, as 'recommended' by default", async () => {
    const s = await newSponsorship(); await finish("sponsorship", s.ref, s.id, retry);
    expect((await getJson(`/admin/${s.ref}`)).body.data.identity).toMatchObject({ status: "retry", requirement: "recommended", rejectLabels: ["BAD_PHOTO_QUALITY", "FORGERY_SUSPECTED"], levelName: "vink-sponsor" });
    const t = await post("/api/sponsorship/track", { ref: s.ref, email: EMAIL }); expect(t.body.data.identity).toMatchObject({ status: "retry", canStart: true }); expect(JSON.stringify(t.body)).not.toMatch(/FORGERY|Looks edited/);
  });
  it("can be made to require a confirmed identity before approval, with the same override by a Super Administrator, and every step is audited", async () => {
    await new Promise<void>((ok) => server.close(() => ok())); await boot({ ...ENV, SUMSUB_REQUIRED_FOR: "sponsorship" });
    const s = await newSponsorship(); await sys.svc.setStatus(s.ref, { status: "under_review", reason: "Taken on", by: ADMIN });
    const blocked = await post(`/admin/${s.ref}/status`, { status: "approved", reason: "Looks good" }); expect(blocked).toMatchObject({ status: 409, body: { success: false, code: "identity_required" } });
    expect((await getJson(`/admin/${s.ref}`)).body.data.status).toBe("under_review");
    expect((await post(`/admin/${s.ref}/identity/override`, { reason: "short" })).status).toBe(400);
    expect(await post(`/admin/${s.ref}/identity/override`, { reason: "Identity confirmed in person at the site visit." })).toMatchObject({ status: 200, body: { data: { override: { reason: "Identity confirmed in person at the site visit." } } } });
    expect(await post(`/admin/${s.ref}/status`, { status: "approved", reason: "Looks good" })).toMatchObject({ status: 200 });
    expect((await db.query(`SELECT action FROM audit_log WHERE action LIKE 'sponsorship.identity%'`)).rows.map((r) => r.action)).toEqual(["sponsorship.identity_override"]);
  });
  it("can be refreshed from Sumsub by staff, and the visit is audited", async () => {
    const s = await newSponsorship(); await start("sponsorship", s.ref); mock.setReview(`sp-${s.id}`, "completed", green); later();
    expect(await post(`/admin/${s.ref}/identity/refresh`, {})).toMatchObject({ status: 200, body: { data: { status: "approved" } } }); expect((await db.query(`SELECT 1 FROM audit_log WHERE action = 'sponsorship.identity_refresh'`)).rows).toHaveLength(1);
    expect((await post(`/admin/SP-AAAAAA/identity/refresh`, {})).status).toBe(404); expect((await post(`/admin/bad/identity/refresh`, {})).status).toBe(400);
  });
});

describe("the database tables", () => {
  it("are defined with the same columns in the real schema and in the test copy of it", async () => {
    const { readFileSync } = await import("fs"); const { join } = await import("path");
    const columns = (src: string, table: string) => {
      const i = src.search(new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table} \\(`)); expect(i, table).toBeGreaterThanOrEqual(0);
      let depth = 0, start = src.indexOf("(", i), end = start; for (let k = start; k < src.length; k++) { if (src[k] === "(") depth++; if (src[k] === ")" && --depth === 0) { end = k; break; } }
      const inner = src.slice(start + 1, end).replace(/--[^\n]*/g, ""); const parts: string[] = []; let d = 0, cur = "";
      for (const ch of inner) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { parts.push(cur); cur = ""; } else cur += ch; } parts.push(cur);
      const added = [...src.matchAll(new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS (\\w+)`, "g"))].map((m) => m[1]);      // columns the real schema adds with a later ALTER
      return [...parts.map((p) => p.trim().split(/\s+/)[0]).filter((c) => c && !/^(PRIMARY|UNIQUE|CHECK|CONSTRAINT|FOREIGN)$/i.test(c)), ...added].sort();
    };
    const real = readFileSync(join(__dirname, "../db/schema.sql"), "utf8"), mirror = readFileSync(join(__dirname, "../portal/testDb.ts"), "utf8");
    for (const t of ["identity_checks", "identity_events", "applications", "application_status_history"]) expect(columns(mirror, t), t).toEqual(columns(real, t));
    expect(columns(real, "identity_checks")).toEqual(expect.arrayContaining(["kind", "subject_id", "consent_at", "override_reason"]));
  });
});
