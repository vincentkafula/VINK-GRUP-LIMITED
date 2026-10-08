import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./driverRoutes.js";
import { manshyaBankCore } from "./bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, walletLedgerAccount, type Engine, type LedgerPort } from "../services/moneyEngine.js";
import { createTokenService, type TokenService } from "../services/tokenService.js";
import { fundReserve, markCleared } from "../services/poolService.js";
import { createTokenRetailRouter, RETAIL_MAX_CENTS } from "./tokenRoutes.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { pinClock, unpinClock } from "../testClock.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { pax: id(9), nobody: id(10) };
const POS = id(400);
let instant = false;
const reader = { active: async () => ({ version: 1, config: instant ? { ...DEFAULT_ZA, instantCredit: { enabled: true, reserveCents: 1000, reserveRatioMax: 5, perDepositCents: { basic: 500_000, standard: 500_000, full: 500_000 } } } : DEFAULT_ZA }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, tokens: TokenService, server: Server, url = "", ref = "";
const tok = () => ledger.balance(walletLedgerAccount("ZAR", U.pax));

beforeEach(async () => {
  instant = false;
  pinClock("2026-10-05T06:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  for (const [u, name] of [[U.pax, "Pam Mokoena"], [U.nobody, "Nobody Here"]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'personal')`, [u, name, `${name.split(" ")[0].toLowerCase()}@x.test`]);
    core.ensureMerchant(u, name);
  }
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader });
  engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  tokens.bindEngine(engine);
  ref = (await tokens.openWallet(U.pax, "passenger", "ZAR") as { ok: true; value: { accountNumber: string } }).value.accountNumber;
  const app = express();
  app.use("/api/retail/token", createTokenRetailRouter({ db, ledger, engine, reader, authenticate: async (serial, key) => (serial === "POS1" && key === "good" ? { authenticated: true, terminalId: POS } : { authenticated: false, error: "Terminal authentication failed" }) }));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => { unpinClock(); server.close(() => ok()); }));

const post = async (path: string, body: unknown, key = "good") => {
  const r = await fetch(`${url}/api/retail/token${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-retail-serial": "POS1", "x-retail-api-key": key }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
};

describe("buying tokens with cash at a retailer", () => {
  it("shows the cashier only the customer's first name and surname initial", async () => {
    expect(await post("/lookup", { reference: ref })).toMatchObject({ status: 200, body: { holder: "Pam M.", currency: "ZAR" } });
    expect(await post("/lookup", { reference: ref.toLowerCase().replace(/(.{3})/, "$1 ") })).toMatchObject({ status: 200 });        // typed with spaces and lower case
    expect((await post("/lookup", { reference: "VKR000000000" })).status).toBe(404);              // not a valid reference
    expect((await post("/lookup", { reference: ref }, "wrong")).status).toBe(401);
  });

  it("with instant credit on and the reserve funded, the tokens are added at once, and a repeated receipt changes nothing", async () => {
    instant = true; fundReserve({ ledger }, { ref: "RES-0001", currency: "ZAR", amountCents: 1_000_000 });
    const a = await post("/topup", { reference: ref, amountCents: 20_000, receipt: "TILL-0001" });
    expect(a).toMatchObject({ status: 201, body: { status: "credited", holder: "Pam M." } });
    expect(tok()).toBe(20_000);
    expect(await post("/topup", { reference: ref, amountCents: 20_000, receipt: "TILL-0001" })).toMatchObject({ status: 200, body: { status: "credited", replayed: true } });
    expect(tok()).toBe(20_000);
  });

  it("with instant credit off, the top-up waits for the retailer's payment to clear, then the tokens arrive", async () => {
    const a = await post("/topup", { reference: ref, amountCents: 20_000, receipt: "TILL-0002" });
    expect(a).toMatchObject({ status: 202, body: { status: "awaiting_clearing" } });
    expect(tok()).toBe(0);
    const credit = (await db.query(`SELECT id, clearing, status FROM pool_credits`)).rows[0] as { id: string; clearing: string; status: string };
    expect(credit).toMatchObject({ clearing: "pending", status: "awaiting_clearing" });
    await markCleared({ db, ledger, engine, reader }, credit.id, null);
    expect(tok()).toBe(20_000);
  });

  it("refuses a bad receipt, amounts outside R10 to R5 000, and accounts that are not token wallets", async () => {
    expect((await post("/topup", { reference: ref, amountCents: 20_000, receipt: "x" })).status).toBe(400);
    expect((await post("/topup", { reference: ref, amountCents: 999, receipt: "TILL-0003" })).status).toBe(400);
    expect((await post("/topup", { reference: ref, amountCents: RETAIL_MAX_CENTS + 1, receipt: "TILL-0004" })).status).toBe(400);
    expect((await post("/topup", { reference: ref, amountCents: 20.5, receipt: "TILL-0005" })).status).toBe(400);
    const { ensureVirtualAccount } = await import("../services/poolService.js");
    const va = await ensureVirtualAccount(db, U.nobody, "ZAR", "in_person");                                        // a reference, but no token wallet
    expect((await post("/topup", { reference: va.reference, amountCents: 5000, receipt: "TILL-0006" })).status).toBe(404);
    expect((await post("/topup", { reference: ref, amountCents: 5000, receipt: "TILL-0007" }, "wrong")).status).toBe(401);
    expect((await db.query(`SELECT COUNT(*) AS n FROM pool_credits`)).rows[0].n).toBe(0);
  });
});
