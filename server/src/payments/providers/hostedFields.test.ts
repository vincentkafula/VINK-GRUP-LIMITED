import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../../portal/testDb.js";
import type { Db } from "../../portal/driverRoutes.js";
import { manshyaLedgerPort } from "../../services/moneyEngine.js";
import { createTokenService, type TokenService } from "../../services/tokenService.js";
import { DEFAULT_ZA } from "../../config/countryConfig.js";
import { MockCardRail, MOCK_CARD_SCENARIOS } from "./mockCardRail.js";
import { SandboxHostedFields, createSandboxVaultRouter } from "./hostedFields.js";
import { pinClock, unpinClock } from "../../testClock.js";

const USER = "00000000-0000-0000-0000-000000000009", OTHER = "00000000-0000-0000-0000-000000000010";
const reader = { active: async () => ({ version: 1, config: DEFAULT_ZA }), invalidate() {} } as never;
const TEST_PANS = new Set(MOCK_CARD_SCENARIOS.map((c) => c.pan));
let db: Db, rail: MockCardRail, hosted: SandboxHostedFields, tokens: TokenService, server: Server, url = "", clockMs = Date.now();

beforeEach(async () => {
  pinClock("2026-10-05T06:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  const mod = (await import("../../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb(); rail = new MockCardRail(); clockMs = new Date("2026-10-05T06:00:00Z").getTime();
  hosted = new SandboxHostedFields(rail, TEST_PANS, () => clockMs);
  for (const [u, n] of [[USER, "Pax Rider"], [OTHER, "Sam Other"]]) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'personal')`, [u, n, `${n.split(" ")[0]}@x.test`]);
  tokens = createTokenService({ db, ledger: manshyaLedgerPort(mod as never), reader, rail: { name: "mock", vault: rail, payout: rail }, hosted });
  const app = express(); app.use("/vault", createSandboxVaultRouter(hosted, ["https://www.vink.co.za"]));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { unpinClock(); await new Promise<void>((ok) => server.close(() => ok())); });

const submit = async (sessionId: string, body: Record<string, unknown>) => { const r = await fetch(`${url}/vault/submit/${sessionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any
const good = { pan: "4111 1111 1111 1111", expiry: "12/34", name: "Pax Rider" };
const start = async (u = USER) => { const r = await tokens.startCardSession(u); if (!r.ok) throw new Error(r.error); return r.value; };

describe("secure card entry (hosted fields)", () => {
  it("adds a card from a finished session: the API only ever sees the session id, and the card is stored as a token", async () => {
    const s = await start(); expect(s.fieldsUrl).toBe(`/api/payments/sandbox-vault/fields/${s.sessionId}`);
    expect(await submit(s.sessionId, good)).toMatchObject({ status: 200, body: { ok: true, last4: "1111" } });
    const r = await tokens.addPayoutCardFromSession(USER, s.sessionId);
    expect(r).toMatchObject({ ok: true, value: { last4: "1111", brand: "visa", status: "verified" } });
    const rows = (await db.query(`SELECT * FROM token_payout_cards`)).rows;
    expect(rows.length).toBe(1); expect(JSON.stringify(rows)).not.toContain("4111111111111111");
    expect(await tokens.addPayoutCardFromSession(USER, s.sessionId)).toMatchObject({ ok: false, status: 409 });         // a session works once
  });

  it("a session belongs to the user it was made for, expires, and is refused after too many attempts", async () => {
    const s = await start();
    await submit(s.sessionId, good);
    expect(await tokens.addPayoutCardFromSession(OTHER, s.sessionId)).toMatchObject({ ok: false, status: 409 });         // someone else cannot collect it
    expect(await tokens.addPayoutCardFromSession(USER, s.sessionId)).toMatchObject({ ok: true });                       // and it was not used up by the failed try
    const e = await start(); clockMs += 11 * 60_000;
    expect((await submit(e.sessionId, good)).body).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    const t = await start();
    for (let i = 0; i < 5; i++) await submit(t.sessionId, { ...good, pan: "1234" });
    expect((await submit(t.sessionId, good)).body.error).toMatch(/Too many attempts/);
    expect(await tokens.addPayoutCardFromSession(USER, t.sessionId)).toMatchObject({ ok: false });
  });

  it("applies the same rules as typing the number: test cards only, debit only, name checked, three cards at most", async () => {
    const s1 = await start();
    expect((await submit(s1.sessionId, { ...good, pan: "4012888888881881" })).body.error).toMatch(/test cards/i);         // a real-looking number is refused inside the vault form
    expect((await submit(s1.sessionId, { ...good, expiry: "01/20" })).body.error).toMatch(/expired|valid/);
    const cr = await start(); await submit(cr.sessionId, { ...good, pan: "4242424242424242" });
    expect(await tokens.addPayoutCardFromSession(USER, cr.sessionId)).toMatchObject({ ok: false, status: 409, code: "not_debit" });
    const nm = await start(); await submit(nm.sessionId, { ...good, name: "Someone Else" });
    expect(await tokens.addPayoutCardFromSession(USER, nm.sessionId)).toMatchObject({ ok: true, value: { status: "needs_review" } });
    for (const pan of ["5555555555554444", "5200828282828210"]) { const s = await start(); await submit(s.sessionId, { ...good, pan }); expect((await tokens.addPayoutCardFromSession(USER, s.sessionId)).ok).toBe(true); }
    expect(await tokens.startCardSession(USER)).toMatchObject({ ok: false, status: 409 });
    expect(await tokens.addPayoutCardFromSession(USER, "x".repeat(30))).toMatchObject({ ok: false });
  });

  it("when live, a typed card number is refused outright and only the secure form works", async () => {
    const live = createTokenService({ db, ledger: tokens as never, reader, rail: { name: "mock", vault: rail, payout: rail }, hosted, acceptRawCardNumbers: false } as never);
    expect(await live.addPayoutCard(USER, { primaryAccountNumber: "4111111111111111", expiry: "12/34", cardholderName: "Pax Rider" })).toMatchObject({ ok: false, status: 403, code: "card_fields_required" });
    expect(live.cardEntry()).toEqual({ hosted: true, raw: false });
    expect(tokens.cardEntry()).toEqual({ hosted: true, raw: true });
    const none = createTokenService({ db, ledger: tokens as never, reader, rail: { name: "mock", vault: rail, payout: rail } } as never);
    expect(await none.startCardSession(USER)).toMatchObject({ ok: false, status: 501, code: "hosted_unavailable" });
  });

  it("serves the card form only to the listed sites, with no card number in the page, and rejects a bad session id", async () => {
    const s = await start();
    const page = await fetch(`${url}/vault/fields/${s.sessionId}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors https://www.vink.co.za");
    expect(page.headers.get("x-frame-options")).toBeNull(); expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text(); expect(html).toContain(s.sessionId); expect(html).toContain("vink-card-complete");
    expect((await fetch(`${url}/vault/fields/bad`)).status).toBe(404);
    expect((await fetch(`${url}/vault/fields/${"a".repeat(30)}%3Cscript%3E`)).status).toBe(404);
  });
});
