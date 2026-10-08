import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, walletLedgerAccount, type LedgerPort } from "./moneyEngine.js";
import { createTokenService, type TokenService } from "./tokenService.js";
import { createCrossBorder, type CrossBorder } from "./crossBorderService.js";
import { recordPoolCredit } from "./poolService.js";
import { DEFAULT_ZA, DEFAULT_ZM, type CountryConfig } from "../config/countryConfig.js";
import { MockCardRail } from "../payments/providers/mockCardRail.js";
import { pinClock, unpinClock } from "../testClock.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { sam: id(5), zee: id(6) };
const open = (c: CountryConfig): CountryConfig => ({ ...c, corridors: c.corridors.map((k) => ({ ...k, enabled: true })) });
const reader = { active: async (c: string) => ({ version: 1, config: open(c === "ZM" ? DEFAULT_ZM : DEFAULT_ZA) }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, tokens: TokenService, xb: CrossBorder;
beforeEach(async () => {
  pinClock("2026-10-05T10:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  for (const [u, name] of [[U.sam, "Sam"], [U.zee, "Zee"]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'personal')`, [u, name, `${name.toLowerCase()}@x.test`]);
    core.ensureMerchant(u, name);
  }
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader, rail: (() => { const m = new MockCardRail(); return { name: "mock", vault: m, payout: m }; })() });
  const engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  xb = createCrossBorder({ db, ledger, engine, reader, now: () => new Date() });
  await xb.setRate("ZAR", "ZMW", 1.5, null); await xb.setRate("ZMW", "ZAR", 0.6, null);
  await tokens.openWallet(U.sam, "passenger", "ZAR"); await tokens.openWallet(U.zee, "passenger", "ZMW");
  const w = await tokens.wallet(U.sam, "ZAR");
  await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: "SAM-TOPUP-1", reference: w!.accountNumber!, amountCents: 100_000, currency: "ZAR", by: null });
});
afterEach(() => unpinClock());

describe("tokens across the border", () => {
  it("a passenger in South Africa sends rand tokens to a holder in Zambia who receives kwacha tokens, with no bank account involved", async () => {
    const q = await xb.quote(U.sam, { recipientEmail: "zee@x.test", amountCents: 20_000, corridorId: "ZA-ZM" });
    expect(q.ok).toBe(true); if (!q.ok) return;
    const done = await xb.confirm(U.sam, q.value.id);
    expect(done.ok && done.value.status).toBe("completed");
    expect(ledger.balance(walletLedgerAccount("ZAR", U.sam))).toBe(80_000);
    expect(ledger.balance(walletLedgerAccount("ZMW", U.zee))).toBe(q.value.receiveCents);
    expect(q.value.receiveCents).toBeGreaterThan(0);
    const again = await xb.confirm(U.sam, q.value.id);                                       // confirming twice pays once
    expect(again.ok && again.value.status).toBe("completed");
    expect(ledger.balance(walletLedgerAccount("ZMW", U.zee))).toBe(q.value.receiveCents);
  });

  it("is refused when the sender has too few tokens, and nothing moves", async () => {
    const q = await xb.quote(U.sam, { recipientEmail: "zee@x.test", amountCents: 20_000, corridorId: "ZA-ZM" });
    if (!q.ok) throw new Error("quote");
    await tokens.addPayoutCard(U.sam, { primaryAccountNumber: "4111111111111111", expiry: "12/34", cardholderName: "Sam Sam" });
    await tokens.requestCashOut(U.sam, { currency: "ZAR", amountCents: 95_000, by: U.sam });            // most of the tokens are paid out to the card
    const r = await xb.confirm(U.sam, q.value.id);
    expect(r.ok).toBe(false);
    expect(ledger.balance(walletLedgerAccount("ZMW", U.zee))).toBe(0);
  });
});
