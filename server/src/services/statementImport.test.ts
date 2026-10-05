import { describe, it, expect } from "vitest";
import { parseCsv, parseAmountCents, readStatement } from "./statementImport.js";
import { checkReadiness } from "../config/readiness.js";
import { validatePooled, createPooledStore } from "../portal/pooledAccounts.js";
import { allPortalsDb } from "../portal/testDb.js";
import { DEFAULT_ZA, DEFAULT_ZM } from "../config/countryConfig.js";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, semicolons and Windows line endings", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("a;b\n1;2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseAmountCents", () => {
  it("understands the ways banks write money", () => {
    expect(parseAmountCents("1234.56")).toBe(123456); expect(parseAmountCents("1,234.56")).toBe(123456); expect(parseAmountCents("1 234,56")).toBe(123456);
    expect(parseAmountCents("R 250.00")).toBe(25000); expect(parseAmountCents("K1,500")).toBe(150000); expect(parseAmountCents("7.5")).toBe(750); expect(parseAmountCents("100")).toBe(10000);
    expect(parseAmountCents("-50.00")).toBe(-5000); expect(parseAmountCents("(50.00)")).toBe(-5000); expect(parseAmountCents("50.00-")).toBe(-5000);
  });
  it("refuses what is not an amount", () => { for (const bad of ["", "abc", "1.234.5x", "1,2,3", "--5"]) expect(parseAmountCents(bad)).toBeNull(); });
});

describe("readStatement", () => {
  const csv = "Date,Ref,Narrative,Amount,Dr/Cr,Ccy\n2026-10-01,BNK0001,VKR123456785 thanks,250.00,CR,ZAR\n2026-10-01,BNK0002,fee,-5.00,DR,ZAR\n2026-10-02,BNK0003,VKK123456786,\"1,000.00\",CR,ZMW\n2026-10-02,x,bad ref,10.00,CR,ZAR\n2026-10-02,BNK0005,wrong,abc,CR,ZAR\n";
  const m = { bankRef: "Ref", reference: "Narrative", amount: "Amount", currency: "Ccy", direction: "Dr/Cr" };
  it("keeps credits, skips debits, and reports bad rows by number", () => {
    const r = readStatement(csv, m, "ZAR"); if ("error" in r) throw new Error(r.error);
    expect(r.lines.map((l) => [l.bankRef, l.amountCents, l.currency])).toEqual([["BNK0001", 25000, "ZAR"], ["BNK0003", 100000, "ZMW"]]);
    expect(r.skipped).toBe(1); expect(r.problems.map((p) => p.row)).toEqual([5, 6]);
  });
  it("uses the default currency when there is no currency column, and a debit marker flips a positive amount", () => {
    const r = readStatement("Ref,Memo,Amt,Type\nB-0001,ref,10.00,Debit\nB-0002,ref,10.00,Credit\n", { bankRef: "Ref", reference: "Memo", amount: "Amt", direction: "Type" }, "ZMW"); if ("error" in r) throw new Error(r.error);
    expect(r.lines).toEqual([expect.objectContaining({ bankRef: "B-0002", currency: "ZMW", amountCents: 1000 })]); expect(r.skipped).toBe(1);
  });
  it("refuses a missing column, an empty file and an oversized file", () => {
    expect(readStatement(csv, { ...m, amount: "Nope" }, "ZAR")).toMatchObject({ error: expect.stringMatching(/no column called/) });
    expect(readStatement(csv, { ...m, bankRef: "" }, "ZAR")).toMatchObject({ error: expect.stringMatching(/every required/) });
    expect(readStatement("only,a,header\n", m, "ZAR")).toMatchObject({ error: expect.stringMatching(/no data/) });
    expect(readStatement("x".repeat(1_000_001), m, "ZAR")).toMatchObject({ error: expect.stringMatching(/too large/) });
  });
});

describe("go-live readiness", () => {
  const ctx = { pooledAccounts: { in_person: false, online: false }, bankFeedConfigured: false, ratesFresh: true, reserveCents: 0 };
  it("a fresh Zambia draft lists what is missing, and the bank feed does not block", () => {
    const r = checkReadiness(DEFAULT_ZM, ctx);
    expect(r.ready).toBe(false);
    expect(r.items.filter((i) => i.blocking && !i.ok).map((i) => i.id)).toEqual(["partner_ref", "licence", "pooled_in_person", "pooled_online"]);
    expect(r.items.find((i) => i.id === "bank_credits")).toMatchObject({ ok: false, blocking: false });
  });
  it("is ready once the details are in", () => {
    const filled = { ...DEFAULT_ZM, partner: { bank: "Absa Bank Zambia", accountRef: "REF-1", integration: null }, regulator: { name: "Bank of Zambia", licenceRef: "BoZ/123" } };
    expect(checkReadiness(filled, { ...ctx, pooledAccounts: { in_person: true, online: true } })).toMatchObject({ ready: true, blockers: 0 });
  });
  it("open routes need current rates and instant credit needs its reserve", () => {
    const open = { ...DEFAULT_ZA, partner: { bank: "B", accountRef: "R", integration: null }, regulator: { name: "R", licenceRef: "L" }, corridors: DEFAULT_ZA.corridors.map((c) => ({ ...c, enabled: true })), instantCredit: { ...DEFAULT_ZA.instantCredit, enabled: true, reserveCents: 100_000 } };
    const c = { ...ctx, pooledAccounts: { in_person: true, online: true }, ratesFresh: false };
    expect(checkReadiness(open, c).items.filter((i) => !i.ok && i.blocking).map((i) => i.id)).toEqual(["fx", "reserve"]);
    expect(checkReadiness(open, { ...c, ratesFresh: true, reserveCents: 100_000 }).ready).toBe(true);
  });
  it("a missing fee rule blocks", () => {
    const noFees = { ...DEFAULT_ZA, partner: { bank: "B", accountRef: "R", integration: null }, regulator: { name: "R", licenceRef: "L" }, fees: { ...DEFAULT_ZA.fees, rules: DEFAULT_ZA.fees.rules.filter((r) => r.appliesTo.txn !== "payout") } };
    expect(checkReadiness(noFees, { ...ctx, pooledAccounts: { in_person: true, online: true } }).items.find((i) => i.id === "fees")).toMatchObject({ ok: false, blocking: true });
  });
});

describe("pooled account details", () => {
  const good = { pool: "in_person", currency: "ZMW", accountNumber: "1234 5678 90", holder: "Vink Pool", bank: "Absa Bank Zambia", type: "Business" };
  it("validates", () => {
    expect(validatePooled(good)).toMatchObject({ ok: true, value: { accountNumber: "1234567890" } });
    for (const bad of [{ pool: "x" }, { currency: "USD" }, { accountNumber: "12" }, { holder: "<b>" }, { bank: "" }, { type: "Joint" }]) expect(validatePooled({ ...good, ...bad })).toMatchObject({ ok: false });
  });
  it("kwacha accounts are kept apart from rand, and an account set here replaces the environment variable for rand", async () => {
    const db = allPortalsDb();
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ('00000000-0000-0000-0000-000000000001','a','a','a@x','superadmin')`);
    const env = { PAYMENT_CHANNEL_ACCOUNTS: JSON.stringify({ in_person: { accountNumber: "111111111", holder: "Env Holder", bank: "Env Bank", type: "Business" } }) } as unknown as NodeJS.ProcessEnv;
    const s = createPooledStore(db, env); await s.refresh();
    expect(s.forCurrency("ZAR").in_person?.holder).toBe("Env Holder"); expect(s.forCurrency("ZMW")).toEqual({});
    await s.set((validatePooled(good) as { ok: true; value: never }).value, null);
    expect(s.forCurrency("ZMW").in_person).toMatchObject({ accountNumber: "1234567890", bank: "Absa Bank Zambia" }); expect(s.forCurrency("ZAR").in_person?.holder).toBe("Env Holder");
    await s.set((validatePooled({ ...good, currency: "ZAR", holder: "Set Here" }) as { ok: true; value: never }).value, null);
    expect(s.forCurrency("ZAR").in_person?.holder).toBe("Set Here");
    expect(await s.remove("in_person", "ZAR")).toBe(true); expect(await s.remove("in_person", "ZAR")).toBe(false);
    expect(s.forCurrency("ZAR").in_person?.holder).toBe("Env Holder");
  });
});
