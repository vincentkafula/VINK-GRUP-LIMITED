/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerBusiness, KINDS, type OwnerBusiness } from "./ownerBusiness.js";

/** The owner's business record. Owner O1 and owner O2 each have their own. Clock: 18 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), FM: id(10) };
const NOW = new Date("2026-11-18T08:00:00Z");
let db: Db, b: OwnerBusiness;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const FULL = { kind: "company", tradingName: "Langa Taxi Services", registeredName: "Langa Taxi Services (Pty) Ltd", registrationNumber: "2019/123456/07", vatNumber: "4123456789", phone: "082 123 4567", email: "Accounts@Langa.test", address: "12 Main Road, Langa, Cape Town" };
const save = (o: any = {}, owner = U.O1) => b.save(owner, owner, { ...FULL, ...o });

beforeEach(async () => { db = allPortalsDb(); b = createOwnerBusiness(db, () => NOW); for (const [i, nm] of [[U.O1, "Olu Owner"], [U.O2, "Ona Owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'vehicle_owner')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]); });

describe("saving the record", () => {
  it("keeps what was given, with the phone made into +country digits, the email in lower case and the VAT number without spaces", async () => {
    const r = ok<any>(await save({ vatNumber: "4123 456 789" })); expect(r.business).toEqual({ kind: "company", kindText: "A company", tradingName: "Langa Taxi Services", registeredName: "Langa Taxi Services (Pty) Ltd", registrationNumber: "2019/123456/07", vatNumber: "4123456789", phone: "+27821234567", email: "accounts@langa.test", address: "12 Main Road, Langa, Cape Town", updatedOn: "2026-11-18" }); expect(await b.get(U.O1)).toEqual(r.business); expect(await b.get(U.O2)).toBeNull();
  });
  it("needs only how they trade and a trading name, and leaves everything else empty if it is empty", async () => {
    const r = ok<any>(await b.save(U.O1, U.O1, { kind: "individual", tradingName: "  Olu's Minibus  " })); expect(r.business).toMatchObject({ kind: "individual", kindText: "An individual (sole proprietor)", tradingName: "Olu's Minibus", registeredName: null, registrationNumber: null, vatNumber: null, phone: null, email: null, address: null });
    for (const empty of ["", null, undefined]) expect(ok<any>(await b.save(U.O1, U.O1, { ...FULL, vatNumber: empty, phone: empty, email: empty })).business).toMatchObject({ vatNumber: null, phone: null, email: null });
  });
  it("offers each way of trading in words", async () => { expect(KINDS).toEqual(["individual", "company", "partnership", "other"]); const t = async (kind: string) => ok<any>(await save({ kind })).business.kindText; expect([await t("company"), await t("partnership"), await t("other")]).toEqual(["A company", "A partnership", "Something else"]); });
  it("refuses what is not valid, with a message that says which", async () => {
    for (const [bad, why] of [[{ kind: "charity" }, /how you trade/], [{ kind: undefined }, /how you trade/], [{ tradingName: "" }, /name you trade under/], [{ tradingName: "   " }, /name you trade under/], [{ tradingName: "x".repeat(101) }, /name you trade under/], [{ tradingName: 5 }, /name you trade under/], [{ registeredName: "x".repeat(101) }, /too long/], [{ registrationNumber: "x".repeat(31) }, /too long/], [{ registrationNumber: "<script>" }, /registration number is letters/], [{ vatNumber: "123456789" }, /ten digits and starts with 4/], [{ vatNumber: "3123456789" }, /ten digits and starts with 4/], [{ vatNumber: "41234567890" }, /ten digits and starts with 4/], [{ vatNumber: "4abcdefghi" }, /ten digits and starts with 4/], [{ phone: "nope" }, /phone number/], [{ phone: "021 123 4567" }, /phone number/], [{ email: "nope" }, /valid email/], [{ email: "a@b" }, /valid email/], [{ address: "x".repeat(301) }, /too long/], [{ email: "x".repeat(201) + "@a.co" }, /too long/]] as const) expect(await save(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(await q(`SELECT * FROM owner_business_profile`)).toEqual([]);                  // nothing was kept
  });
  it("accepts a VAT number of the right shape and nothing about the registration number's format beyond safe characters", async () => { expect(ok<any>(await save({ vatNumber: "4000000000" })).business.vatNumber).toBe("4000000000"); expect(ok<any>(await save({ registrationNumber: "K2019/123456/07" })).business.registrationNumber).toBe("K2019/123456/07"); expect(ok<any>(await save({ registrationNumber: "CK 91/12345/23" })).business.registrationNumber).toBe("CK 91/12345/23"); });
  it("keeps no income tax number, ID number or bank detail, however it is offered", async () => {
    ok(await save({ taxNumber: "9876543210", incomeTaxReference: "0123456789", idNumber: "8001015009087", bankAccount: "62012345678", cardNumber: "4242424242424242" })); const row = (await q(`SELECT * FROM owner_business_profile`))[0]; expect(Object.keys(row).sort()).toEqual(["address", "email", "kind", "owner_id", "phone", "registered_name", "registration_number", "trading_name", "updated_at", "updated_by", "vat_number"]); const all = JSON.stringify(row); for (const v of ["9876543210", "0123456789", "8001015009087", "62012345678", "4242424242424242"]) expect(all).not.toContain(v);
  });
});

describe("saving again", () => {
  it("replaces the record, one per owner, and says which fields changed, never their values", async () => {
    const first = ok<any>(await save()); expect(first.changed).toEqual(["kind", "tradingName", "registeredName", "registrationNumber", "vatNumber", "phone", "email", "address"]);
    const second = ok<any>(await save({ tradingName: "Langa Taxis", vatNumber: "4999999999" })); expect(second.changed).toEqual(["tradingName", "vatNumber"]); expect(JSON.stringify(second.changed)).not.toContain("Langa Taxis"); expect(JSON.stringify(second.changed)).not.toContain("4999999999");
    expect(ok<any>(await save({ tradingName: "Langa Taxis", vatNumber: "4999999999" })).changed).toEqual([]); expect((await q(`SELECT COUNT(*) AS n FROM owner_business_profile`))[0].n).toBe(1); expect((await b.get(U.O1))!.tradingName).toBe("Langa Taxis");
  });
  it("records who saved it, and keeps one owner's record from another's", async () => {
    await b.save(U.O1, U.FM, { ...FULL }); expect((await q(`SELECT updated_by FROM owner_business_profile`))[0].updated_by).toBe(U.FM); ok(await save({ tradingName: "Ona Taxis" }, U.O2)); expect((await b.get(U.O1))!.tradingName).toBe("Langa Taxi Services"); expect((await b.get(U.O2))!.tradingName).toBe("Ona Taxis");
  });
  it("deletes the record, and says whether there was one", async () => { ok(await save()); expect(ok<any>(await b.remove(U.O1)).removed).toBe(true); expect(await b.get(U.O1)).toBeNull(); expect(ok<any>(await b.remove(U.O1)).removed).toBe(false); ok(await save({}, U.O2)); expect((await b.get(U.O2))).not.toBeNull(); });
});
