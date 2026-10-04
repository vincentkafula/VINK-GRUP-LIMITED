import { describe, it, expect, beforeEach } from "vitest";
import { evaluateTap, type TapInput } from "./tapPolicy.js";
import { createConfigReader, ensureBaselineProfiles } from "../config/configService.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";

const NOW = new Date("2026-10-07T10:00:00Z");
const T = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const tap = (over: Partial<TapInput> = {}): TapInput => ({ terminalId: T, maskedPan: "**** **** **** 4242", scheme: "visa", amount: 15, currency: "ZAR", cardholderVerification: "contactless_no_cvm", ...over });

describe("evaluateTap (country profile applied to a tap)", () => {
  let db: Db, reader: ReturnType<typeof createConfigReader>;
  beforeEach(async () => { db = allPortalsDb(); await ensureBaselineProfiles(db); reader = createConfigReader(db, 0); });
  const record = (amount: number, cvm: string, status = "confirmed", at = "2026-10-07T08:00:00Z") =>
    db.query(`INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, cardholder_verification, status, received_at) VALUES ($1,'**** **** **** 4242','visa',$2,$3,$4,$5)`, [T, amount, cvm, status, at]);

  it("approves a small tap without PIN, splits it from the profile, and confirms it automatically in sandbox", async () => {
    const d = await evaluateTap(db, reader, tap(), NOW, "sandbox");
    expect(d).toMatchObject({ decline: null, status: "confirmed", country: "ZA", profileVersion: 1 });
    expect(d.split).toMatchObject({ vinkFeeTotal: 1, investorShare: 0.1, ownerSettlement: 14 });
  });

  it("leaves the tap 'received' (not confirmed) in live mode, and when the profile does not auto-confirm", async () => {
    expect((await evaluateTap(db, reader, tap(), NOW, "live")).status).toBe("received");
    const noAuto = { ...DEFAULT_ZA, afc: { ...DEFAULT_ZA.afc, sandboxAutoConfirm: false } };
    await db.query(`UPDATE country_profiles SET config = $1 WHERE country_code = 'ZA'`, [JSON.stringify(noAuto)]);
    expect((await evaluateTap(db, reader, tap(), NOW, "sandbox")).status).toBe("received");
  });

  it("declines R40 or more without a PIN (and says so), but a PIN tap of any size is fine", async () => {
    expect(await evaluateTap(db, reader, tap({ amount: 40 }), NOW, "sandbox")).toMatchObject({ status: "declined", decline: { code: "pin_required" } });
    expect((await evaluateTap(db, reader, tap({ amount: 39.99 }), NOW, "sandbox")).decline).toBeNull();
    expect((await evaluateTap(db, reader, tap({ amount: 400, cardholderVerification: "pin" }), NOW, "sandbox")).decline).toBeNull();
  });

  it("counts this card's no-PIN taps today: the daily total is enforced", async () => {
    for (let i = 0; i < 3; i++) await record(39, "contactless_no_cvm");                            // R117 so far today
    expect(await evaluateTap(db, reader, tap({ amount: 5 }), NOW, "sandbox")).toMatchObject({ decline: { code: "no_pin_daily_limit" } });   // R122 > R120
    expect((await evaluateTap(db, reader, tap({ amount: 3 }), NOW, "sandbox")).decline).toBeNull();                                         // R120 exactly
    expect((await evaluateTap(db, reader, tap({ amount: 5, maskedPan: "**** **** **** 9999" }), NOW, "sandbox")).decline).toBeNull();      // a different card
    await db.query(`UPDATE terminal_taps SET received_at = '2026-10-05T08:00:00Z'`);                                                       // yesterday does not count
    expect((await evaluateTap(db, reader, tap({ amount: 5 }), NOW, "sandbox")).decline).toBeNull();
  });

  it("asks for a PIN after too many no-PIN taps in a row, and a PIN tap resets the run", async () => {
    for (let i = 0; i < 5; i++) await record(2, "contactless_no_cvm", "confirmed", `2026-10-07T0${3 + i}:00:00Z`);
    expect(await evaluateTap(db, reader, tap({ amount: 2 }), NOW, "sandbox")).toMatchObject({ decline: { code: "no_pin_consecutive_limit" } });
    await record(2, "pin", "confirmed", "2026-10-07T09:00:00Z");
    expect((await evaluateTap(db, reader, tap({ amount: 2 }), NOW, "sandbox")).decline).toBeNull();
  });

  it("declined taps do not count towards the limits", async () => {
    for (let i = 0; i < 6; i++) await record(39, "contactless_no_cvm", "declined");
    expect((await evaluateTap(db, reader, tap({ amount: 20 }), NOW, "sandbox")).decline).toBeNull();
  });

  it("uses Zambia's profile for kwacha taps (its own limit and currency)", async () => {
    await db.query(`UPDATE country_profiles SET status = 'active' WHERE country_code = 'ZM'`);
    reader.invalidate();
    expect((await evaluateTap(db, reader, tap({ currency: "ZMW", amount: 49.99 }), NOW, "sandbox"))).toMatchObject({ country: "ZM", decline: null });
    expect(await evaluateTap(db, reader, tap({ currency: "ZMW", amount: 50 }), NOW, "sandbox")).toMatchObject({ decline: { code: "pin_required" } });
  });

  it("works without a database (local development): baseline rules, no card history", async () => {
    const d = await evaluateTap(null, createConfigReader(null), tap({ amount: 10 }), NOW, "sandbox");
    expect(d).toMatchObject({ decline: null, status: "confirmed", profileVersion: 0 });
  });
});
