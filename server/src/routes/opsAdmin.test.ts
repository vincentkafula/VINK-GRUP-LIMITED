import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaLedgerPort, type LedgerPort } from "../services/moneyEngine.js";
import { createOpsMonitor, WebhookSink, type AlertMessage, type AlertSink } from "../services/opsMonitor.js";
import { createSchemeSettlement, readSettlementFile, toCents, type SchemeSettlement } from "../services/schemeSettlement.js";
import { evaluateGoLive, confirmItem, withdrawItem, liveStartBlockers, MANUAL_ITEMS } from "../payments/goLive.js";
import { resolvePaymentsConfig } from "../payments/config.js";
import { createOpsAdminRouter } from "./opsAdminRouter.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(90), USER = id(5);
const HEAD = "authorisation_id,type,amount,currency,settled_on,reference\n";
let db: Db, ledger: LedgerPort, settlement: SchemeSettlement, clock = new Date("2026-10-08T10:00:00Z");
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any
const spend = (auth: string, o: { amount?: number; reversed?: number; status?: string; created?: Date } = {}) =>
  db.query(`INSERT INTO token_card_spend (card_id, user_id, currency, provider, authorisation_id, amount_cents, reversed_cents, channel, status, created_at) VALUES ($1,$2,'ZAR','paymentology',$3,$4,$5,'pos',$6,$7)`,
    [id(70), USER, auth, o.amount ?? 12_550, o.reversed ?? 0, o.status ?? "approved", o.created ?? clock]);

beforeEach(async () => {
  process.env.MANSHYA_DB_PATH = ":memory:";
  const mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb(); ledger = manshyaLedgerPort(mod as never);
  settlement = createSchemeSettlement(db, () => clock);
  clock = new Date("2026-10-08T10:00:00Z");
});

describe("settlement file reading", () => {
  it("reads amounts exactly and reports the first bad row", () => {
    expect(toCents("125.5")).toBe(12_550); expect(toCents("0.07")).toBe(7); expect(toCents("1e3")).toBeNull(); expect(toCents("-1")).toBeNull(); expect(toCents("1.234")).toBeNull();
    const ok = readSettlementFile(`${HEAD}A1,purchase,125.50,zar,2026-10-07,R1\n"A,2",refund,"3.00",ZAR,2026-10-07,`);
    expect(ok).toEqual({ lines: [{ authorisationId: "A1", type: "purchase", amountCents: 12_550, currency: "ZAR", settledOn: "2026-10-07", reference: "R1" }, { authorisationId: "A,2", type: "refund", amountCents: 300, currency: "ZAR", settledOn: "2026-10-07", reference: "" }] });
    expect(readSettlementFile(`${HEAD}A1,sale,1.00,ZAR,2026-10-07,`)).toEqual({ error: "Line 2: the type must be purchase or refund" });
    expect(readSettlementFile(`${HEAD}A1,purchase,1.00,ZAR,07/10/2026,`)).toMatchObject({ error: expect.stringContaining("YYYY-MM-DD") });
    expect(readSettlementFile("a,b\n1,2")).toMatchObject({ error: expect.stringContaining("missing the column") });
    expect(readSettlementFile("authorisation_id,kind,value,ccy,day\nA1,purchase,1.00,ZAR,2026-10-07", { type: "kind", amount: "value", currency: "ccy", settled_on: "day" })).toHaveProperty("lines");   // the bank's own column names can be mapped
  });
});

describe("settlement matching", () => {
  it("matches what VINK approved, flags the rest, and ignores a repeated line or file", async () => {
    await spend("T1:R1"); await spend("T2:R1", { amount: 5_000 }); await spend("T3:R1", { status: "declined" }); await spend("T4:R1", { amount: 10_000, reversed: 4_000, status: "approved" });
    const csv = HEAD + [
      "T1:R1,purchase,125.50,ZAR,2026-10-07,S1",       // matches
      "T2:R1,purchase,50.01,ZAR,2026-10-07,S2",        // one cent out
      "T3:R1,purchase,10.00,ZAR,2026-10-07,S3",        // VINK declined it
      "GHOST:R1,purchase,10.00,ZAR,2026-10-07,S4",     // VINK never saw it
      "T1:R1,purchase,125.50,USD,2026-10-07,S5",       // wrong currency
      "T4:R1,purchase,100.00,ZAR,2026-10-07,S6",
      "T4:R1,refund,40.00,ZAR,2026-10-08,S7",          // exactly what was reversed
      "T4:R1,refund,1.00,ZAR,2026-10-08,S8",           // more than was reversed
      "T1:R1,purchase,125.50,ZAR,2026-10-07,S1",       // the same line again
    ].join("\n");
    const r = await settlement.importFile({ provider: "paymentology", filename: "day1.csv", csv, by: null });
    expect(r).toMatchObject({ ok: true, summary: { lines: 9, matched: 3, duplicates: 1, exceptions: 5 } });
    expect((await settlement.exceptions()).map((e) => `${e.authorisationId}:${e.result}`).sort()).toEqual(["GHOST:R1:unknown_purchase", "T1:R1:currency_mismatch", "T2:R1:amount_mismatch", "T3:R1:declined_purchase", "T4:R1:refund_exceeds"]);
    expect((await q(`SELECT authorisation_id FROM token_card_spend WHERE settled_at IS NOT NULL ORDER BY authorisation_id`)).map((x) => x.authorisation_id)).toEqual(["T1:R1", "T4:R1"]);
    expect(await settlement.importFile({ provider: "paymentology", filename: "again.csv", csv, by: null })).toMatchObject({ ok: false, status: 409 });
    expect(await settlement.importFile({ provider: "Bad Name", filename: "x.csv", csv: HEAD + "A,purchase,1.00,ZAR,2026-10-07,", by: null })).toMatchObject({ ok: false, status: 400 });
    expect((await settlement.files())[0]).toMatchObject({ filename: "day1.csv", lines: 9, matched: 3, exceptions: 5 });
  });

  it("an exception needs a written note to be closed, and a closed one stops being reported", async () => {
    await settlement.importFile({ provider: "paymentology", filename: "f.csv", csv: HEAD + "GHOST:R1,purchase,10.00,ZAR,2026-10-07,S4", by: null });
    const [e] = await settlement.exceptions();
    expect(await settlement.resolveException(e.id, null, "short")).toBe(false);
    expect(await settlement.resolveException(e.id, null, "Bank confirmed it was a test card, ticket 4411")).toBe(true);
    expect(await settlement.exceptions()).toEqual([]);
    expect(await settlement.resolveException(e.id, null, "Bank confirmed it was a test card, ticket 4411")).toBe(false);
  });
});

describe("the monitor", () => {
  const sink = () => { const sent: AlertMessage[] = []; const s: AlertSink = { name: "test", send: async (m) => { sent.push(m); } }; return { sent, s }; };
  const exceptionCsv = HEAD + "GHOST:R1,purchase,10.00,ZAR,2026-10-07,S4";

  it("tells a person once, reminds hourly while a problem stays, and says when it clears", async () => {
    const { sent, s } = sink(); const mon = createOpsMonitor({ db, ledger, sinks: [s], now: () => clock });
    await mon.check(); expect(sent).toEqual([]);                                                                       // nothing wrong, nothing sent
    await settlement.importFile({ provider: "paymentology", filename: "f.csv", csv: exceptionCsv, by: null });
    await mon.check(); expect(sent.map((m) => `${m.severity}:${m.code}`)).toEqual(["problem:card_settlement_exceptions"]);
    clock = new Date(clock.getTime() + 10 * 60_000); await mon.check(); expect(sent.length).toBe(1);                   // told already
    clock = new Date(clock.getTime() + 55 * 60_000); await mon.check(); expect(sent.length).toBe(2); expect(sent[1].title).toMatch(/^Still open/);
    const [e] = await settlement.exceptions(); await settlement.resolveException(e.id, null, "Reviewed with the bank, ref 77");
    await mon.check(); expect(sent[2]).toMatchObject({ severity: "resolved", code: "card_settlement_exceptions" });
    await mon.check(); expect(sent.length).toBe(3);
    expect((await mon.state())[0]).toMatchObject({ code: "card_settlement_exceptions", resolvedAt: expect.any(String) });
  });

  it("does not lose an alert when the destination is down: it tries again at the next check", async () => {
    let down = true; const got: AlertMessage[] = [];
    const flaky: AlertSink = { name: "flaky", send: async (m) => { if (down) throw new Error("503"); got.push(m); } };
    const mon = createOpsMonitor({ db, ledger, sinks: [flaky], now: () => clock });
    await settlement.importFile({ provider: "paymentology", filename: "f.csv", csv: exceptionCsv, by: null });
    await mon.check(); expect(got).toEqual([]);
    clock = new Date(clock.getTime() + 60_000); down = false; await mon.check(); expect(got.length).toBe(1);
  });

  it("flags a run of declined card purchases, and approved purchases the bank has not settled", async () => {
    const { sent, s } = sink(); const mon = createOpsMonitor({ db, ledger, sinks: [s], now: () => clock });
    for (let i = 0; i < 12; i++) await spend(`D${i}:R1`, { status: "declined", created: new Date(clock.getTime() - 60_000) });
    for (let i = 0; i < 10; i++) await spend(`A${i}:R1`, { created: new Date(clock.getTime() - 60_000) });
    const r = await mon.check(); expect(r.issues.map((i) => i.code)).toContain("card_declines_high");
    expect(sent.find((m) => m.code === "card_declines_high")?.severity).toBe("attention");
    await settlement.importFile({ provider: "paymentology", filename: "f.csv", csv: HEAD + "A0:R1,purchase,125.50,ZAR,2026-10-07,S1", by: null });
    clock = new Date(clock.getTime() + 6 * 24 * 3600_000);
    expect((await mon.check()).issues.map((i) => i.code)).toContain("card_purchases_unsettled");
  });

  it("the webhook sink posts Slack-style text and refuses a non-https address", async () => {
    let body = ""; const f = (async (_u: string, i: RequestInit) => { body = String(i.body); return new Response("ok"); }) as unknown as typeof fetch;
    await new WebhookSink("https://hooks.example.test/x", f).send({ severity: "problem", code: "c", title: "T", text: "hello" });
    expect(JSON.parse(body).text).toContain("hello");
    expect(() => new WebhookSink("http://hooks.example.test/x")).toThrow(/https/);
    await expect(new WebhookSink("https://hooks.example.test/x", (async () => new Response("no", { status: 500 })) as unknown as typeof fetch).send({ severity: "problem", code: "c", title: "T", text: "x" })).rejects.toThrow(/500/);
  });
});

describe("the go-live gate", () => {
  const cfg = resolvePaymentsConfig({});
  const ctx = { cfg, fastSecretSet: false, alertSinks: 0, reconcileClean: true };

  it("is not ready until every manual item is confirmed with evidence, and every automatic item holds", async () => {
    let g = await evaluateGoLive(db, ctx);
    expect(g.ready).toBe(false); expect(g.items.filter((i) => i.kind === "manual").length).toBe(MANUAL_ITEMS.length); expect(g.items.every((i) => !i.ok || i.key === "reconciliation_clean")).toBe(true);
    expect(await confirmItem(db, "legal_structure", { id: ADMIN, name: "Admin" }, "ok")).toMatchObject({ ok: false });                          // no evidence
    expect(await confirmItem(db, "payments_mode_live", { id: ADMIN, name: "Admin" }, "forced by hand please")).toMatchObject({ ok: false });    // automatic items cannot be ticked
    for (const it of MANUAL_ITEMS) expect(await confirmItem(db, it.key, { id: null, name: "Vincent" }, `Evidence on file: ${it.key}`)).toEqual({ ok: true });
    g = await evaluateGoLive(db, ctx);
    expect(g.items.filter((i) => i.kind === "manual").every((i) => i.ok && i.confirmedBy === "Vincent")).toBe(true);
    expect(g.ready).toBe(false); expect(g.items.filter((i) => !i.ok).map((i) => i.key).sort()).toEqual(["alerts_configured", "card_endpoint_secured", "issuing_provider_real", "payments_mode_live", "payout_provider_real"]);
    expect(await withdrawItem(db, "legal_structure")).toBe(true); expect(await withdrawItem(db, "legal_structure")).toBe(false);
    expect((await evaluateGoLive(db, ctx)).items.find((i) => i.key === "legal_structure")?.ok).toBe(false);
  });

  it("does not ask for a payout provider when payouts to outside cards are off (money leaves with the VINK card only)", async () => {
    const item = async (c: typeof cfg) => (await evaluateGoLive(db, { cfg: c, fastSecretSet: true, alertSinks: 1, reconcileClean: true })).items.find((i) => i.key === "payout_provider_real")!;
    expect(await item({ ...cfg, externalPayouts: true })).toMatchObject({ ok: false });
    expect(await item({ ...cfg, externalPayouts: false })).toMatchObject({ ok: true, detail: expect.stringContaining("VINK card only") });
    expect(await item({ ...cfg, externalPayouts: true, cardPayoutProvider: "visa_direct_live" as never })).toMatchObject({ ok: true });
  });

  it("is ready only when everything holds together, and sandbox start-up is never blocked", async () => {
    for (const it of MANUAL_ITEMS) await confirmItem(db, it.key, { id: null, name: "V" }, `Evidence on file: ${it.key}`);
    const live = { ...cfg, mode: "live" as const, issuingProvider: "paymentology" as const, cardPayoutProvider: "visa_direct_live" as never };
    expect((await evaluateGoLive(db, { cfg: live, fastSecretSet: true, alertSinks: 1, reconcileClean: true })).ready).toBe(true);
    expect((await evaluateGoLive(db, { cfg: live, fastSecretSet: true, alertSinks: 1, reconcileClean: false })).ready).toBe(false);
    expect(await liveStartBlockers(db, { cfg, fastSecretSet: false, alertSinks: 0 })).toEqual([]);                                             // sandbox
    const blockers = await liveStartBlockers(db, { cfg: { ...live, issuingProvider: "mock" }, fastSecretSet: false, alertSinks: 0 });
    expect(blockers.join("|")).toMatch(/issuing provider/); expect(blockers.join("|")).toMatch(/secret/);
  });
});

describe("admin routes", () => {
  let server: Server, url = "";
  beforeEach(async () => {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'admin','Admin','a@x.test','superadmin')`, [ADMIN]);
    const app = express(); app.use((req, _r, next) => { req.user = { userId: ADMIN, username: "admin", role: "superadmin" }; next(); });
    app.use("/ops", createOpsAdminRouter({ db, ledger, monitor: createOpsMonitor({ db, ledger, sinks: [], now: () => clock }), settlement, gateContext: () => ({ cfg: resolvePaymentsConfig({}), fastSecretSet: false, alertSinks: 0 }) }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const call = async (path: string, method = "GET", body?: unknown) => { const r = await fetch(url + "/ops" + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: (await r.json()) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any

  it("confirms a gate item with a note, imports a settlement file and closes an exception", async () => {
    expect((await call("/go-live")).body).toMatchObject({ success: true, ready: false });
    expect((await call("/go-live/legal_structure/confirm", "POST", { note: "x" })).status).toBe(400);
    expect((await call("/go-live/legal_structure/confirm", "POST", { note: "Opinion letter dated 2026-10-01, folder Legal/2" })).status).toBe(200);
    expect((await call("/go-live")).body.items.find((i: { key: string }) => i.key === "legal_structure")).toMatchObject({ ok: true, confirmedBy: "admin" });
    expect((await call("/go-live/legal_structure", "DELETE")).status).toBe(200);
    expect((await call("/settlement/import", "POST", { provider: "paymentology", filename: "f.csv", csv: HEAD + "GHOST:R1,purchase,10.00,ZAR,2026-10-07,S4" })).body).toMatchObject({ lines: 1, exceptions: 1 });
    expect((await call("/settlement/import", "POST", { provider: "paymentology" })).status).toBe(400);
    const ex = (await call("/settlement/exceptions")).body.exceptions; expect(ex.length).toBe(1);
    expect((await call(`/settlement/exceptions/${ex[0].id}/resolve`, "POST", { note: "Test card, bank ticket 4411" })).status).toBe(200);
    expect((await call("/health")).body).toMatchObject({ success: true, ok: true, destinations: [] });
    expect((await call("/check", "POST")).body).toMatchObject({ success: true });
  });
});
