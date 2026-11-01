import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { sumsubConfigFromEnv, sumsubReady, sumsubWebhookReady, levelFor, isRequired, PROFILES } from "./config.js";
import { sumsubSignature, sumsubHeaders } from "./signing.js";
import { verifySumsubDigest } from "./webhook.js";
import { identityStatusFor, EVENT_REVIEW_STATUS } from "./status.js";
import { createSumsubClient } from "./client.js";
import { mockSumsub } from "./mockSumsub.js";

const ENV = { SUMSUB_APP_TOKEN: "sbx:app-token", SUMSUB_SECRET_KEY: "the-secret-key", SUMSUB_WEBHOOK_SECRET: "whsec", SUMSUB_LEVEL_NAME: "vink-sponsor" } as NodeJS.ProcessEnv;
const cfg = () => sumsubConfigFromEnv(ENV);
const NOW = new Date("2026-11-01T10:00:00Z");

describe("the settings", () => {
  it("come from the environment, with the documented defaults", () => {
    expect(sumsubConfigFromEnv({} as NodeJS.ProcessEnv)).toMatchObject({ appToken: "", secretKey: "", webhookSecret: "", levelName: "basic-kyc-level", baseUrl: "https://api.sumsub.com", tokenTtlSecs: 900 });
    expect(cfg()).toMatchObject({ appToken: "sbx:app-token", secretKey: "the-secret-key", webhookSecret: "whsec", levelName: "vink-sponsor" });
  });
  it("trim stray spaces and a trailing slash, and keep the token lifetime between a minute and a day", () => {
    expect(sumsubConfigFromEnv({ SUMSUB_APP_TOKEN: "  t  ", SUMSUB_BASE_URL: "https://x.test///" } as NodeJS.ProcessEnv)).toMatchObject({ appToken: "t", baseUrl: "https://x.test" });
    for (const [v, want] of [["30", 900], ["120", 120], ["90000", 900], ["abc", 900]] as const) expect(sumsubConfigFromEnv({ SUMSUB_TOKEN_TTL_SECS: v } as NodeJS.ProcessEnv).tokenTtlSecs).toBe(want);
  });
  it("switch identity checks on only with both the token and the secret, and the webhook on only with its own secret", () => {
    expect(sumsubReady(cfg())).toBe(true); expect(sumsubReady(sumsubConfigFromEnv({ SUMSUB_APP_TOKEN: "t" } as NodeJS.ProcessEnv))).toBe(false); expect(sumsubReady(sumsubConfigFromEnv({ SUMSUB_SECRET_KEY: "s" } as NodeJS.ProcessEnv))).toBe(false);
    expect(sumsubWebhookReady(cfg())).toBe(true); expect(sumsubWebhookReady(sumsubConfigFromEnv({ SUMSUB_APP_TOKEN: "t", SUMSUB_SECRET_KEY: "s" } as NodeJS.ProcessEnv))).toBe(false);
  });
});

describe("signing a request (Sumsub's App Token scheme)", () => {
  it("is the hex HMAC-SHA256, keyed with the secret, of timestamp + METHOD + path with its query + the body", () => {
    const want = createHmac("sha256", "k").update("1700000000" + "POST" + "/resources/applicants?levelName=a%20b" + '{"x":1}').digest("hex");
    expect(sumsubSignature("k", 1700000000, "post", "/resources/applicants?levelName=a%20b", '{"x":1}')).toBe(want);       // the method is upper-cased
  });
  it("changes with every part it covers, so none can be swapped", () => {
    const base = sumsubSignature("k", 1, "GET", "/p?a=1", "");
    for (const other of [sumsubSignature("k2", 1, "GET", "/p?a=1", ""), sumsubSignature("k", 2, "GET", "/p?a=1", ""), sumsubSignature("k", 1, "POST", "/p?a=1", ""), sumsubSignature("k", 1, "GET", "/p?a=2", ""), sumsubSignature("k", 1, "GET", "/p?a=1", "x")]) expect(other).not.toBe(base);
  });
  it("travels in the three headers Sumsub reads, and never sends the secret itself", () => {
    const h = sumsubHeaders({ appToken: "tok", secretKey: "the-secret-key" }, 1700000000, "GET", "/p");
    expect(Object.keys(h).sort()).toEqual(["Accept", "X-App-Access-Sig", "X-App-Access-Ts", "X-App-Token"]); expect(h["X-App-Token"]).toBe("tok"); expect(h["X-App-Access-Ts"]).toBe("1700000000");
    expect(JSON.stringify(h)).not.toContain("the-secret-key");
  });
});

describe("checking a webhook's signature", () => {
  const body = Buffer.from(JSON.stringify({ type: "applicantReviewed", applicantId: "a1" }));
  const digest = (alg: string, secret = "whsec", raw: Buffer = body) => createHmac(alg, secret).update(raw).digest("hex");
  it("accepts the digest made with the webhook secret, whichever of Sumsub's three algorithms its settings name", () => {
    expect(verifySumsubDigest(body, digest("sha256"), "HMAC_SHA256_HEX", "whsec")).toBe(true);
    expect(verifySumsubDigest(body, digest("sha512"), "HMAC_SHA512_HEX", "whsec")).toBe(true);
    expect(verifySumsubDigest(body, digest("sha1"), "HMAC_SHA1_HEX", "whsec")).toBe(true);
    expect(verifySumsubDigest(body, digest("sha256").toUpperCase(), " hmac_sha256_hex ", "whsec")).toBe(true);        // letter case and stray spaces do not matter
  });
  it("refuses a wrong secret, a changed body (even one byte, or the same JSON re-spaced), and a digest made with a different algorithm than named", () => {
    expect(verifySumsubDigest(body, digest("sha256", "other"), "HMAC_SHA256_HEX", "whsec")).toBe(false);
    expect(verifySumsubDigest(Buffer.from(body.toString().replace("a1", "a2")), digest("sha256"), "HMAC_SHA256_HEX", "whsec")).toBe(false);
    expect(verifySumsubDigest(Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2)), digest("sha256"), "HMAC_SHA256_HEX", "whsec")).toBe(false);   // it signs the exact bytes
    expect(verifySumsubDigest(body, digest("sha1"), "HMAC_SHA256_HEX", "whsec")).toBe(false);
  });
  it("refuses a missing or malformed digest, an unknown algorithm, and any digest at all when no secret is set", () => {
    for (const [dg, alg] of [[undefined, "HMAC_SHA256_HEX"], [digest("sha256"), undefined], ["", "HMAC_SHA256_HEX"], ["zz", "HMAC_SHA256_HEX"], [digest("sha256"), "HMAC_MD5_HEX"], [digest("sha256").slice(0, 10), "HMAC_SHA256_HEX"]] as const) expect(verifySumsubDigest(body, dg, alg, "whsec")).toBe(false);
    expect(verifySumsubDigest(body, digest("sha256", ""), "HMAC_SHA256_HEX", "")).toBe(false);
  });
});

describe("what Sumsub's states mean to us", () => {
  const completed = (reviewAnswer: string, reviewRejectType?: string) => identityStatusFor("completed", { reviewAnswer, reviewRejectType });
  it("maps each review stage", () => {
    expect(identityStatusFor("init")).toBe("in_progress");
    for (const s of ["pending", "prechecked", "queued"]) expect(identityStatusFor(s)).toBe("pending");
    expect(identityStatusFor("onHold")).toBe("on_hold");
  });
  it("maps a completed review by its answer: GREEN passes, RED with RETRY may be tried again, any other RED is final", () => {
    expect(completed("GREEN")).toBe("approved"); expect(completed("RED", "RETRY")).toBe("retry"); expect(completed("RED", "FINAL")).toBe("rejected");
    expect(completed("RED")).toBe("rejected");                       // never invite a retry that Sumsub did not offer
    expect(completed("green")).toBe("approved"); expect(completed("red", "retry")).toBe("retry");
  });
  it("leaves the status alone for anything it does not know, including a completed review with no answer", () => {
    expect(identityStatusFor("somethingNew")).toBeNull(); expect(identityStatusFor(undefined)).toBeNull(); expect(identityStatusFor("completed")).toBeNull(); expect(completed("MAYBE")).toBeNull();
  });
  it("knows which review stage each event type stands for", () => { expect(EVENT_REVIEW_STATUS).toMatchObject({ applicantCreated: "init", applicantReset: "init", applicantPending: "pending", applicantOnHold: "onHold", applicantReviewed: "completed" }); });
});

describe("the client, against a stand-in Sumsub that checks every signature", () => {
  const setup = (over: Partial<ReturnType<typeof cfg>> = {}) => {
    const mock = mockSumsub({ appToken: "sbx:app-token", secretKey: "the-secret-key", levelName: "vink-sponsor", now: () => NOW });
    const client = createSumsubClient({ config: { ...cfg(), ...over }, fetchImpl: mock.fetch, now: () => NOW });
    return { mock, client };
  };
  it("creates an applicant under the level, signed so that Sumsub accepts it", async () => {
    const { mock, client } = setup();
    const r = await client.createApplicant({ externalUserId: "sp-1", email: "a@b.co" });
    expect(r).toMatchObject({ ok: true, applicantId: "app1", externalUserId: "sp-1", reviewStatus: "init" });
    expect(mock.calls[0]).toMatchObject({ method: "POST", path: "/resources/applicants?levelName=vink-sponsor", body: { externalUserId: "sp-1", email: "a@b.co" } });
  });
  it("is refused by Sumsub when signed with the wrong secret or token, and says so without ever repeating a secret", async () => {
    for (const over of [{ secretKey: "not-the-secret" }, { appToken: "someone-else" }]) {
      const { client } = setup(over); const r = await client.createApplicant({ externalUserId: "sp-1" });
      expect(r).toMatchObject({ ok: false, status: 401 }); expect(JSON.stringify(r)).not.toMatch(/the-secret-key|not-the-secret|sbx:app-token|someone-else/);
    }
  });
  it("sends a phone number only when it is in international format (Sumsub could refuse the whole request over a local one)", async () => {
    const { mock, client } = setup();
    await client.createApplicant({ externalUserId: "sp-1", phone: "082 000 0000" }); await client.createApplicant({ externalUserId: "sp-2", phone: "+27 82 000 0000" });
    expect(mock.calls[0].body).not.toHaveProperty("phone"); expect(mock.calls[1].body).toMatchObject({ phone: "+27820000000" });
  });
  it("uses the existing applicant when Sumsub says one already exists for that id (an earlier attempt we did not get to save)", async () => {
    const { mock, client } = setup(); const first = await client.createApplicant({ externalUserId: "sp-1" });
    const again = await client.createApplicant({ externalUserId: "sp-1" });
    expect(again).toMatchObject({ ok: true, applicantId: (first as { applicantId: string }).applicantId }); expect(mock.applicants.size).toBe(1);
  });
  it("issues a short-lived access token for the applicant's browser, and only for an applicant that exists", async () => {
    const { mock, client } = setup(); await client.createApplicant({ externalUserId: "sp-1" });
    const t = await client.accessToken({ externalUserId: "sp-1" });
    expect(t).toMatchObject({ ok: true, expiresInSecs: 900 }); expect((t as { token: string }).token).toMatch(/^_act-/);
    expect(mock.calls.at(-1)).toMatchObject({ path: "/resources/accessTokens/sdk", body: { userId: "sp-1", levelName: "vink-sponsor", ttlInSecs: 900 } });
    expect(await client.accessToken({ externalUserId: "nobody" })).toMatchObject({ ok: false, status: 404 });
  });
  it("reads where a check stands, including Sumsub's answer and reasons", async () => {
    const { mock, client } = setup(); const a = (await client.createApplicant({ externalUserId: "sp-1" })) as { applicantId: string };
    mock.setReview("sp-1", "completed", { reviewAnswer: "RED", reviewRejectType: "RETRY", rejectLabels: ["BAD_PHOTO"], clientComment: "Please retake the photo" });
    expect(await client.status(a.applicantId)).toMatchObject({ ok: true, reviewStatus: "completed", result: { reviewAnswer: "RED", rejectLabels: ["BAD_PHOTO"] } });
  });
  it("turns a failure, a timeout and an unreachable Sumsub into a plain result, never an exception", async () => {
    const { mock, client } = setup(); mock.failNext(503);
    expect(await client.createApplicant({ externalUserId: "sp-1" })).toMatchObject({ ok: false, status: 503, error: "Sumsub answered 503", detail: "Injected failure" });
    mock.hang(); const slow = createSumsubClient({ config: { ...cfg(), timeoutMs: 30 }, fetchImpl: mock.fetch, now: () => NOW });
    expect(await slow.status("app1")).toMatchObject({ ok: false, status: 0, error: "Sumsub did not answer in time" });
    const down = createSumsubClient({ config: cfg(), fetchImpl: (async () => { throw new Error("ECONNREFUSED 10.0.0.1"); }) as typeof fetch });
    const r = await down.status("app1"); expect(r).toMatchObject({ ok: false, status: 0, error: "Sumsub could not be reached" }); expect(JSON.stringify(r)).not.toContain("10.0.0.1");
  });
});

describe("a level for each kind of applicant, and which kinds must have a confirmed identity", () => {
  const withEnv = (extra: Record<string, string>) => sumsubConfigFromEnv({ ...ENV, ...extra } as NodeJS.ProcessEnv);
  it("use the default level unless a kind of applicant has its own (trimmed)", () => {
    const c = withEnv({ SUMSUB_LEVEL_NAME: "vink-default", SUMSUB_LEVEL_BUSINESS: "vink-business", SUMSUB_LEVEL_SPONSORSHIP: "  vink-sponsorship  " });
    expect(levelFor(c, "personal")).toBe("vink-default"); expect(levelFor(c, "business")).toBe("vink-business"); expect(levelFor(c, "corporate")).toBe("vink-default"); expect(levelFor(c, "sponsorship")).toBe("vink-sponsorship");
    expect(PROFILES).toEqual(["personal", "business", "corporate", "sponsorship"]);
  });
  it("require a confirmed identity for accounts and loans (the personal, business and corporate tiers) but not sponsorships, by default", () => {
    const c = cfg(); for (const p of ["personal", "business", "corporate"] as const) expect(isRequired(c, p), p).toBe(true); expect(isRequired(c, "sponsorship")).toBe(false);
  });
  it("can be told which kinds, in any case and with stray spaces, ignoring names it does not know, or none at all", () => {
    expect(withEnv({ SUMSUB_REQUIRED_FOR: " Business , SPONSORSHIP,nonsense,business" }).requiredFor).toEqual(["business", "sponsorship"]);
    expect(isRequired(withEnv({ SUMSUB_REQUIRED_FOR: "sponsorship" }), "sponsorship")).toBe(true); expect(isRequired(withEnv({ SUMSUB_REQUIRED_FOR: "sponsorship" }), "personal")).toBe(false);
    expect(withEnv({ SUMSUB_REQUIRED_FOR: "none" }).requiredFor).toEqual([]); expect(withEnv({ SUMSUB_REQUIRED_FOR: " NONE " }).requiredFor).toEqual([]);
  });
  it("treats a blank, misspelt or unrecognised setting as the default, so an empty line or a typo can never silently switch the requirement off", () => {
    for (const blank of ["", "   ", "personnal", "nonsense", "yes,no"]) expect(withEnv({ SUMSUB_REQUIRED_FOR: blank }).requiredFor, JSON.stringify(blank)).toEqual(["personal", "business", "corporate"]);
    expect(withEnv({}).requiredFor).toEqual(["personal", "business", "corporate"]);
  });
  it("never require anything while the checks are switched off, so a missing setting can never lock staff out of approving", () => {
    const off = sumsubConfigFromEnv({ SUMSUB_REQUIRED_FOR: "personal,business,corporate,sponsorship" } as NodeJS.ProcessEnv);
    expect(sumsubReady(off)).toBe(false); for (const p of PROFILES) expect(isRequired(off, p), p).toBe(false);
  });
});
