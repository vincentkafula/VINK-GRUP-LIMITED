import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { DEFAULT_ZA, DEFAULT_ZM, diffConfig, validateConfig, countryForCurrency, type CountryConfig } from "./countryConfig.js";
import { createConfigAdminRouter, createConfigReader, ensureBaselineProfiles } from "./configService.js";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const mutate = (fn: (c: any) => void, base: CountryConfig = DEFAULT_ZA) => { const c = clone(base) as any; fn(c); return c; };

describe("validateConfig", () => {
  it("accepts the baseline profiles", () => { expect(validateConfig(DEFAULT_ZA, "ZA")).toEqual([]); expect(validateConfig(DEFAULT_ZM, "ZM")).toEqual([]); });

  it("rejects the wrong currency or country", () => {
    expect(validateConfig(mutate((c) => { c.currency.code = "ZMW"; }))).toContain("South Africa must use ZAR.");
    expect(validateConfig(DEFAULT_ZM, "ZA")).toContain("country must be ZA for this profile.");
    expect(validateConfig(mutate((c) => { c.country = "XX"; }))[0]).toMatch(/country must be ZA or ZM/);
    expect(validateConfig("nope")).toEqual(["The configuration must be an object."]);
  });

  it("money is whole cents: fractions, negatives and strings are refused", () => {
    for (const bad of [100.5, -1, "100", null]) expect(validateConfig(mutate((c) => { c.marshalFee.amountCents = bad; })).join(" ")).toMatch(/marshalFee/);
    expect(validateConfig(mutate((c) => { c.afc.noPinBelowCents = 39.99; })).join(" ")).toMatch(/noPinBelowCents/);
  });

  it("the platform fee parts must add up, and the investor share is a fraction", () => {
    expect(validateConfig(mutate((c) => { c.afc.platformFee.cardShareCents = 40; })).join(" ")).toMatch(/add up/);
    expect(validateConfig(mutate((c) => { c.afc.investorPctOfFee = 10; })).join(" ")).toMatch(/between 0 and 1/);
  });

  it("the no-PIN settings are consistent, and a live profile can never auto-confirm taps", () => {
    expect(validateConfig(mutate((c) => { c.afc.noPinDailyCumulativeCents = 100; })).join(" ")).toMatch(/at least the per-tap limit/);
    expect(validateConfig(mutate((c) => { c.mode = "live"; c.afc.sandboxAutoConfirm = true; })).join(" ")).toMatch(/cannot auto-confirm/);
    expect(validateConfig(mutate((c) => { c.mode = "live"; c.afc.sandboxAutoConfirm = false; }))).toEqual([]);
  });

  it("fee rules: unique ids, known calculation types, sensible percentages, tiers that end open and rise", () => {
    expect(validateConfig(mutate((c) => { c.fees.rules.push(clone(c.fees.rules[0])); })).join(" ")).toMatch(/duplicate rule id/);
    expect(validateConfig(mutate((c) => { c.fees.rules[0].calc = { type: "magic" }; })).join(" ")).toMatch(/calc.type/);
    expect(validateConfig(mutate((c) => { c.fees.rules[1].calc.pct = 0.9; })).join(" ")).toMatch(/pct must be 0 to 0.5/);
    expect(validateConfig(mutate((c) => { c.fees.rules[4].calc.tiers = [{ upToCents: 100, flatCents: 1 }]; })).join(" ")).toMatch(/last tier/);
    expect(validateConfig(mutate((c) => { c.fees.rules[4].calc.tiers = [{ upToCents: 500, flatCents: 1 }, { upToCents: 100, flatCents: 2 }, { upToCents: null, flatCents: 3 }]; })).join(" ")).toMatch(/must increase/);
    expect(validateConfig(mutate((c) => { c.fees.rules[0].minCents = 500; c.fees.rules[0].maxCents = 100; })).join(" ")).toMatch(/minCents must not exceed/);
    expect(validateConfig(mutate((c) => { c.fees.rules = []; })).join(" ")).toMatch(/at least one rule/);
  });

  it("a higher KYC tier can never be more restricted than a lower one", () => {
    expect(validateConfig(mutate((c) => { c.limits.tiers.full.balanceCents = 1; })).join(" ")).toMatch(/limits.tiers.full must allow at least as much as standard/);
  });

  it("instant credit cannot be switched on without a funded reserve", () => {
    expect(validateConfig(mutate((c) => { c.instantCredit.enabled = true; c.instantCredit.reserveCents = 0; })).join(" ")).toMatch(/funded risk reserve/);
    expect(validateConfig(mutate((c) => { c.instantCredit.enabled = true; c.instantCredit.reserveCents = 4_000_000; }))).toEqual([]);
  });

  it("corridors: two different countries, limits that rise, a quote lifetime, and a margin below 20%", () => {
    expect(validateConfig(mutate((c) => { c.corridors[0].to = "ZA"; })).join(" ")).toMatch(/corridor/);
    expect(validateConfig(mutate((c) => { c.corridors[0].perDayCents = 1; })).join(" ")).toMatch(/corridor/);
    expect(validateConfig(mutate((c) => { c.corridors[0].fxMarginPct = 0.5; })).join(" ")).toMatch(/corridor/);
    expect(validateConfig(mutate((c) => { c.corridors[0].quoteTtlSeconds = 1; })).join(" ")).toMatch(/corridor/);
  });

  it("reports every problem at once, with the path", () => {
    const p = validateConfig(mutate((c) => { c.trip.tapsPerTrip = 0; c.payouts.cutoff = "5pm"; c.data.retentionYears = 0; }));
    expect(p.length).toBeGreaterThanOrEqual(3);
  });
});

describe("diffConfig", () => {
  it("lists exactly the settings that changed, by path", () => {
    const b = mutate((c) => { c.marshalFee.amountCents = 2500; c.afc.noPinBelowCents = 5000; });
    expect(diffConfig(DEFAULT_ZA, b)).toEqual([{ path: "afc.noPinBelowCents", before: 4000, after: 5000 }, { path: "marshalFee.amountCents", before: 2000, after: 2500 }]);
    expect(diffConfig(DEFAULT_ZA, clone(DEFAULT_ZA))).toEqual([]);
  });
});

describe("baseline values", () => {
  it("South Africa reproduces the platform's existing behaviour; Zambia uses kwacha", () => {
    expect(DEFAULT_ZA.afc).toMatchObject({ platformFee: { flatCents: 100 }, investorPctOfFee: 0.1, noPinBelowCents: 4000 });
    expect(DEFAULT_ZA.trip.tapsPerTrip).toBe(16); expect(DEFAULT_ZA.marshalFee.amountCents).toBe(2000);
    expect(DEFAULT_ZM.currency.code).toBe("ZMW"); expect(DEFAULT_ZM.marshalFee.amountCents).toBe(2000);
    expect(countryForCurrency("ZMW")).toBe("ZM"); expect(countryForCurrency("ZAR")).toBe("ZA"); expect(countryForCurrency(undefined)).toBe("ZA");
  });
});

/* ───────────── the staff lifecycle, on a real SQL engine ───────────── */
describe("country configuration lifecycle (maker-checker)", () => {
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const STAFF = { maker: id(1), a1: id(2), a2: id(3) };
  let server: Server, url = "", db: Db, as = STAFF.maker, reader = createConfigReader(null);

  beforeEach(async () => {
    db = allPortalsDb();
    for (const [i, n] of [[STAFF.maker, "Maker"], [STAFF.a1, "Approver One"], [STAFF.a2, "Approver Two"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'superadmin')`, [i, n, n + "@x.test"]);
    await ensureBaselineProfiles(db);
    reader = createConfigReader(db, 0);
    const app = express(); app.use(express.json());
    app.use((req, _r, next) => { req.user = { userId: as, username: "u", role: "superadmin" }; next(); });
    app.use("/admin", createConfigAdminRouter({ db, reader, approvalsRequired: 2 }));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; as = STAFF.maker;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const call = async (m: string, p: string, b?: unknown) => { const r = await fetch(url + "/admin" + p, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, body: await r.json() as any }; };
  const who = (u: string) => { as = u; };
  const draftWith = async (fn: (c: any) => void, country = "ZA") => {
    const base = clone(country === "ZA" ? DEFAULT_ZA : DEFAULT_ZM) as any; fn(base);
    const d = await call("POST", `/${country}/drafts`, { config: base }); expect(d.status).toBe(201); return d.body.id as string;
  };

  it("simulates a fee without storing anything", async () => {
    const r = await call("POST", "/simulate", { country: "ZA", txn: "card_online", amountCents: 10000 });
    expect(r.body).toMatchObject({ success: true, fee: { feeCents: 390, ruleId: "online_card" } });
    const afc = await call("POST", "/simulate", { country: "ZA", txn: "afc_tap", amountCents: 1500 });
    expect(afc.body.afcSplit).toMatchObject({ feeCents: 100, investorCents: 10, remainderCents: 1400 });
    const bad = clone(DEFAULT_ZA) as any; bad.afc.platformFee.flatCents = -5;
    expect((await call("POST", "/simulate", { config: bad, txn: "afc_tap", amountCents: 1500 })).status).toBe(400);
    expect((await call("POST", "/simulate", { country: "ZA", txn: "x", amountCents: 1.5 })).status).toBe(400);
  });

  it("copies the fees VINK can express into the Banking module when a profile is activated", async () => {
    const seen: string[] = [];
    const target = { fees: { online: { pct: 0.029, fixed: 100 }, pos: { pct: 0.025, fixed: 0 } }, payoutFee: 850 };
    const { syncManshyaFees } = await import("./manshyaFeeSync.js");
    const cfg = clone(DEFAULT_ZA) as any;
    expect(syncManshyaFees(target, cfg)).toEqual([]);
    cfg.fees.rules.find((r: any) => r.id === "payout").calc.amountCents = 900;
    cfg.fees.rules.find((r: any) => r.id === "pos_card").calc.pct = 0.03;
    seen.push(...syncManshyaFees(target, cfg));
    expect(seen).toEqual(["fees.pos", "payoutFee"]); expect(target.payoutFee).toBe(900); expect(target.fees.pos.pct).toBe(0.03);
  });

  it("a live version cannot be activated while the go-live checklist has blockers", async () => {
    const blocked = createConfigAdminRouter({ db, reader, approvalsRequired: 1, readiness: async (cfg) => ({ country: cfg.country, mode: cfg.mode, ready: false, blockers: 1, items: [{ id: "licence", label: "Licence reference", ok: false, blocking: true, hint: "" }] }) });
    const app2 = express(); app2.use(express.json()); app2.use((req, _r, next) => { req.user = { userId: as, username: "u", role: "superadmin" }; next(); }); app2.use("/a", blocked);
    const s2: Server = await new Promise((ok) => { const x = app2.listen(0, "127.0.0.1", () => ok(x)); });
    try {
      const u2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/a`;
      const live = clone(DEFAULT_ZA) as any; live.mode = "live"; live.afc.sandboxAutoConfirm = false;
      const d = await (await fetch(u2 + "/ZA/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: live }) })).json() as any;
      await fetch(u2 + `/profiles/${d.id}/submit`, { method: "POST" });
      who(STAFF.a1); await fetch(u2 + `/profiles/${d.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true }) });
      const r = await fetch(u2 + `/profiles/${d.id}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "I_UNDERSTAND_THIS_MOVES_REAL_MONEY" }) });
      expect(r.status).toBe(409); expect((await r.json() as any).error).toMatch(/not ready to go live: Licence reference/);
      expect((await reader.active("ZA")).config.mode).toBe("sandbox");
      expect(((await (await fetch(u2 + `/profiles/${d.id}/readiness`)).json()) as any).readiness).toMatchObject({ ready: false, blockers: 1 });
    } finally { await new Promise<void>((ok) => s2.close(() => ok())); }
  });

  it("starts with South Africa active (baseline) and Zambia as a draft", async () => {
    const o = (await call("GET", "/")).body;
    expect(o.approvalsRequired).toBe(2);
    expect(o.countries.find((c: any) => c.country === "ZA").active).toMatchObject({ version: 1, status: "active", currency: "ZAR" });
    expect(o.countries.find((c: any) => c.country === "ZM")).toMatchObject({ active: null, inProgress: { version: 1, status: "draft", currency: "ZMW" } });
    expect((await reader.active("ZA")).config.marshalFee.amountCents).toBe(2000); expect((await reader.active("ZA")).fromBaseline).toBe(false);
  });

  it("a change goes draft -> submitted -> two different approvers -> activated, and only then is it used", async () => {
    const draft = await draftWith((c) => { c.marshalFee.amountCents = 2500; });
    expect((await reader.active("ZA")).config.marshalFee.amountCents).toBe(2000);                              // not live yet
    expect((await call("POST", `/profiles/${draft}/decision`, { approve: true })).status).toBe(409);            // not submitted
    expect((await call("POST", `/profiles/${draft}/submit`)).body.status).toBe("pending_approval");
    expect((await call("PUT", `/profiles/${draft}`, { config: DEFAULT_ZA })).status).toBe(409);                  // frozen once submitted
    who(STAFF.maker); expect((await call("POST", `/profiles/${draft}/decision`, { approve: true })).status).toBe(403);   // maker-checker: not the creator
    who(STAFF.a1); expect((await call("POST", `/profiles/${draft}/decision`, { approve: true })).body.status).toBe("pending_approval");
    expect((await call("POST", `/profiles/${draft}/decision`, { approve: true })).status).toBe(409);            // one decision each
    expect((await call("POST", `/profiles/${draft}/activate`)).status).toBe(409);                               // one approval is not enough
    who(STAFF.a2); expect((await call("POST", `/profiles/${draft}/decision`, { approve: true })).body.status).toBe("approved");
    expect((await call("POST", `/profiles/${draft}/activate`)).body.status).toBe("active");
    expect((await reader.active("ZA")).config.marshalFee.amountCents).toBe(2500); expect((await reader.active("ZA")).version).toBe(2);
    const versions = (await call("GET", "/ZA/versions")).body.versions;
    expect(versions.map((v: any) => [v.version, v.status])).toEqual([[2, "active"], [1, "retired"]]);          // history kept
  });

  it("a rejection ends the version, needs a reason, and leaves the active profile untouched", async () => {
    const draft = await draftWith((c) => { c.afc.noPinBelowCents = 9000; });
    await call("POST", `/profiles/${draft}/submit`);
    who(STAFF.a1);
    expect((await call("POST", `/profiles/${draft}/decision`, { approve: false })).status).toBe(400);
    expect((await call("POST", `/profiles/${draft}/decision`, { approve: false, note: "Too high for transit" })).body.status).toBe("rejected");
    expect((await reader.active("ZA")).config.afc.noPinBelowCents).toBe(4000);
    expect((await call("POST", "/ZA/drafts", {})).status).toBe(201);                                              // a new draft can start again
  });

  it("only the creator edits or submits a draft; invalid configurations are refused with every problem listed", async () => {
    const draft = await draftWith(() => {});
    who(STAFF.a1);
    expect((await call("PUT", `/profiles/${draft}`, { config: DEFAULT_ZA })).status).toBe(403);
    expect((await call("POST", `/profiles/${draft}/submit`)).status).toBe(403);
    who(STAFF.maker);
    const bad = await call("PUT", `/profiles/${draft}`, { config: mutate((c) => { c.trip.tapsPerTrip = 0; c.payouts.cutoff = "x"; }) });
    expect(bad.status).toBe(400); expect(bad.body.problems.length).toBeGreaterThanOrEqual(2);
    expect((await call("PUT", `/profiles/${draft}`, { config: mutate((c) => { c.trip.tapsPerTrip = 12; }), note: "twelve" })).status).toBe(200);
    expect((await call("GET", `/profiles/${draft}`)).body.profile.config.trip.tapsPerTrip).toBe(12);
    expect((await call("POST", "/ZA/drafts", {})).status).toBe(409);                                              // one version in progress at a time
  });

  it("shows the reviewers exactly what changed compared with the active version", async () => {
    const draft = await draftWith((c) => { c.marshalFee.amountCents = 3000; c.payouts.salaryRetryDays = 5; });
    const p = (await call("GET", `/profiles/${draft}`)).body;
    expect(p.changesFromActive.map((x: any) => x.path).sort()).toEqual(["marshalFee.amountCents", "payouts.salaryRetryDays"]);
  });

  it("the unowned baseline Zambia draft is adopted by the first staff member who edits it", async () => {
    const zm = (await call("GET", "/ZM/versions")).body.versions[0].id;
    who(STAFF.a1);
    expect((await call("PUT", `/profiles/${zm}`, { config: mutate((c) => { c.marshalFee.amountCents = 2400; }, DEFAULT_ZM) })).status).toBe(200);
    who(STAFF.a2); expect((await call("PUT", `/profiles/${zm}`, { config: DEFAULT_ZM })).status).toBe(403);     // now it belongs to the first one
  });

  it("going live needs the confirmation phrase, and Zambia is activated independently of South Africa", async () => {
    const zm = (await call("GET", "/ZM/versions")).body.versions[0].id;
    expect((await call("PUT", `/profiles/${zm}`, { config: mutate((c) => { c.mode = "live"; c.afc.sandboxAutoConfirm = false; }, DEFAULT_ZM) })).status).toBe(200);
    await call("POST", `/profiles/${zm}/submit`);
    who(STAFF.a1); await call("POST", `/profiles/${zm}/decision`, { approve: true });
    who(STAFF.a2); expect((await call("POST", `/profiles/${zm}/decision`, { approve: true })).body.status).toBe("approved");
    expect((await call("POST", `/profiles/${zm}/activate`, {})).status).toBe(400);
    expect((await call("POST", `/profiles/${zm}/activate`, { confirm: "I_UNDERSTAND_THIS_MOVES_REAL_MONEY" })).body.status).toBe("active");
    expect((await reader.active("ZM")).config.mode).toBe("live");
    expect((await reader.active("ZA")).config.mode).toBe("sandbox");                                              // South Africa untouched
  });

  it("validates without saving", async () => {
    expect((await call("POST", "/validate", { country: "ZA", config: DEFAULT_ZA })).body.errors).toEqual([]);
    expect((await call("POST", "/validate", { country: "ZA", config: mutate((c) => { c.trip.tapsPerTrip = 0; }) })).body.errors.length).toBe(1);
  });

  it("every step is audited", async () => {
    const draft = await draftWith((c) => { c.marshalFee.amountCents = 2200; });
    await call("POST", `/profiles/${draft}/submit`); who(STAFF.a1); await call("POST", `/profiles/${draft}/decision`, { approve: true });
    who(STAFF.a2); await call("POST", `/profiles/${draft}/decision`, { approve: true }); await call("POST", `/profiles/${draft}/activate`);
    const actions = (await call("GET", "/audit")).body.entries.map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["config.draft.create", "config.submit", "config.approve", "config.activate"]));
    const act = (await call("GET", "/audit")).body.entries.find((e: any) => e.action === "config.activate");
    expect(act.details.changed).toContain("marshalFee.amountCents");
  });

  it("the reader falls back to the baseline when there is no database, so nothing breaks", async () => {
    const r = createConfigReader(null);
    expect(await r.active("ZA")).toMatchObject({ fromBaseline: true, version: 0 }); expect((await r.active("ZM")).config.currency.code).toBe("ZMW");
  });
});
