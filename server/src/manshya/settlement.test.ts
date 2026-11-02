import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");

/**
 * What a driver takes on a VINK Tap card machine goes STRAIGHT INTO A VINK BANK ACCOUNT, not into the payments balance to wait for a payout. Online (VINK Pay) payments are unchanged.
 */
const servers: Server[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise<void>((ok) => s.close(() => ok())); });

function shop(o: { accounts?: [string, string][] } = {}) {
  const mn = createManshya(); const m = mn.services.createMerchant("Taxi Driver");
  mn.db.prepare("DELETE FROM bank_accounts WHERE merchant_id=?").run(m.id);                                   // every merchant starts with a default account; start from none so each test has exactly the accounts it names
  const accts = (o.accounts ?? [["Main", "current"]]).map(([n, k]) => mn.services.createBankAccount(m.id, { name: n, kind: k }));
  const device = mn.services.createDevice(m, { name: "Hilux tap" });
  const tap = (amount: number, reference = "fare") => mn.services.createPayment(m, { channel: "pos", deviceId: device.id, amount, method: "card", paymentToken: "tok_visa", reference });
  const online = (amount: number) => mn.services.createPayment(m, { channel: "online", amount, method: "card", paymentToken: "tok_visa", reference: "web", customer: { name: "A", email: "a@b.co" } });
  const bank = (a: any) => mn.ledger.balance(`bank:${a.id}`), bal = () => mn.services.balance(m), row = (id: string) => mn.db.prepare("SELECT * FROM payments WHERE id=?").get(id);
  const fund = (a: any, amount: number) => mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -amount }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount }])).immediate();
  const recon = () => { const r = mn.recon.run(new Date(), "t"); return { ok: r.ok, checks: mn.recon.detail(r.id).items.map((i: any) => i.check) as string[] }; };
  return { mn, m, accts, device, tap, online, bank, bal, row, recon, fund };
}

describe("card machine money goes into the VINK bank account", () => {
  it("credits the bank account with what the driver keeps, holds the reserve back, takes the fee, and puts nothing in the payments balance", async () => {
    const { tap, accts, bank, bal, row } = shop(); const p = await tap(10_000); const retained = bal().retained;
    expect(p.status).toBe("paid"); expect(bank(accts[0]) + retained + p.fee).toBe(10_000); expect(bank(accts[0])).toBeGreaterThan(0); expect(retained).toBeGreaterThan(0); expect(bal().available).toBe(0);
    expect(row(p.id).settled_to).toBe(accts[0].id);
  });
  it("leaves online payments exactly as they were: into the payments balance, awaiting a payout", async () => {
    const { online, accts, bank, bal, row } = shop(); const p = await online(10_000);
    expect(bal().available).toBeGreaterThan(0); expect(bank(accts[0])).toBe(0); expect(row(p.id).settled_to).toBeNull();
  });
  it("keeps the money in the payments balance, never lost, when there is no VINK bank account yet, and sends the next payment to the account once one exists", async () => {
    const { mn, m, tap, bal, bank, recon } = shop({ accounts: [] }); expect(mn.services.getSettlement(m)).toMatchObject({ mode: "payments_balance", account: null }); const first = await tap(10_000); expect(bal().available).toBeGreaterThan(0); const before = bal().available; expect(mn.db.prepare("SELECT settled_to FROM payments WHERE id=?").get(first.id).settled_to).toBeNull();
    const a = mn.services.createBankAccount(m.id, { name: "Main" }); await tap(5_000, "second"); expect(bank(a)).toBeGreaterThan(0); expect(bal().available).toBe(before); expect(recon()).toMatchObject({ ok: true });
  });
  it("uses the account the driver chose, not just the first, and remembers it", async () => {
    const { mn, m, tap, accts, bank } = shop({ accounts: [["Main", "current"], ["Takings", "current"]] }); expect(mn.services.getSettlement(m)).toMatchObject({ mode: "bank_account", chosen: false, account: { id: accts[0].id } });
    expect(mn.services.setSettlement(m, { accountId: accts[1].id })).toMatchObject({ chosen: true, account: { id: accts[1].id, name: "Takings" } }); await tap(10_000); expect(bank(accts[1])).toBeGreaterThan(0); expect(bank(accts[0])).toBe(0);
  });
  it("prefers a current account to a savings account when the driver has not chosen", async () => {
    const { mn, m, accts } = shop({ accounts: [["Rainy day", "savings"], ["Main", "current"]] }); expect(mn.services.getSettlement(m).account.id).toBe(accts[1].id);
  });
  it("lets only one of the driver's own accounts be chosen, and says what is wrong with anything else", async () => {
    const { mn, m, accts } = shop(); const other = mn.services.createMerchant("Someone else"), theirs = mn.services.createBankAccount(other.id, { name: "Theirs" });
    for (const bad of [theirs.id, "nope", "", undefined, 42, null]) expect(() => mn.services.setSettlement(m, { accountId: bad as any }), String(bad)).toThrow(); expect(mn.services.getSettlement(m).account.id).toBe(accts[0].id);
  });
  it("falls back to the first account if the chosen one has gone, so money still has somewhere to go", async () => {
    const { mn, m, accts, tap, bank } = shop({ accounts: [["Main", "current"], ["Takings", "current"]] }); mn.services.setSettlement(m, { accountId: accts[1].id }); mn.db.prepare("DELETE FROM bank_accounts WHERE id=?").run(accts[1].id);
    await tap(10_000); expect(bank(accts[0])).toBeGreaterThan(0);
  });
});

describe("refunds and disputes come back from where the money went", () => {
  it("refunds a card machine payment from the bank account, in part and then in full", async () => {
    const { mn, m, tap, accts, bank, row, recon, fund } = shop(); const p = await tap(10_000); fund(accts[0], 100_000); const after = bank(accts[0]);        // (a full refund returns the customer's whole R100, more than the R87.75 the driver received, so other money has to be there)
    await mn.services.refundPayment(m, p.id, { amount: 2_000 }); expect(bank(accts[0])).toBe(after - 2_000); await mn.services.refundPayment(m, p.id); expect(bank(accts[0])).toBe(after - 10_000); expect(row(p.id).status).toBe("refunded"); expect(recon()).toMatchObject({ ok: true });
  });
  it("takes a refund from the account the money went to even after the driver chooses a different one", async () => {
    const { mn, m, tap, accts, bank } = shop({ accounts: [["Main", "current"], ["Takings", "current"]] }); const p = await tap(10_000); const after = bank(accts[0]); mn.services.setSettlement(m, { accountId: accts[1].id });
    await mn.services.refundPayment(m, p.id, { amount: 1_000 }); expect(bank(accts[0])).toBe(after - 1_000); expect(bank(accts[1])).toBe(0);
  });
  it("refuses a refund the bank account cannot cover, and changes nothing", async () => {
    const { mn, m, tap, accts, bank, row } = shop({ accounts: [["Main", "current"], ["Other", "current"]] }); const p = await tap(10_000); const money = bank(accts[0]);
    mn.db.transaction(() => mn.ledger.post("transfer", [{ account: `bank:${accts[0].id}`, merchant: m.id, kind: "bank", amount: -money }, { account: `bank:${accts[1].id}`, merchant: m.id, kind: "bank", amount: money }])).immediate();      // the driver has spent it
    await expect(mn.services.refundPayment(m, p.id, { amount: 1_000 })).rejects.toThrow(); expect(row(p.id)).toMatchObject({ refunded: 0, status: "paid" }); expect(bank(accts[0])).toBe(0);
  });
  it("holds a disputed amount in the bank account, gives it back when the dispute is won, and charges the chargeback and its fee to it when it is lost", async () => {
    const { mn, tap, accts, bank, recon, fund } = shop(); const p = await tap(10_000); fund(accts[0], 100_000); const start = bank(accts[0]);
    const won = mn.admin.openDispute({ paymentId: p.id, amount: 2_000 }, "t"); expect(bank(accts[0])).toBe(start - 2_000); mn.admin.resolveDispute(won.id, "merchant", "t"); expect(bank(accts[0])).toBe(start);
    const lost = mn.admin.openDispute({ paymentId: p.id, amount: 3_000 }, "t"); mn.admin.resolveDispute(lost.id, "customer", "t"); expect(bank(accts[0])).toBe(start - 3_000 - mn.config.chargebackFee); expect(recon()).toMatchObject({ ok: true });
  });
  it("still takes an online payment's refund and dispute from the payments balance", async () => {
    const { mn, m, online, bal, accts, bank } = shop(); const p = await online(10_000); const a = bal().available; await mn.services.refundPayment(m, p.id, { amount: 1_000 }); expect(bal().available).toBe(a - 1_000); expect(bank(accts[0])).toBe(0);
  });
});

describe("reconciliation of where the money went", () => {
  it("gives every new merchant a default VINK bank account, so card machine money always has somewhere to go", async () => {
    const mn = createManshya(); const m = mn.services.createMerchant("Brand new"); const accts = mn.services.listAccounts(m); expect(accts).toHaveLength(1); expect(mn.services.getSettlement(m)).toMatchObject({ mode: "bank_account", account: { id: accts[0].id } });
    const d = mn.services.createDevice(m, { name: "x" }); const p = await mn.services.createPayment(m, { channel: "pos", deviceId: d.id, amount: 10_000, method: "card", paymentToken: "tok_visa", reference: "f" }); expect(mn.ledger.balance(`bank:${accts[0].id}`)).toBeGreaterThan(0); expect(p.status).toBe("paid");
  });
  it("is clean for card machine and online payments together", async () => { const { tap, online, recon } = shop(); await tap(10_000); await online(5_000); await tap(2_500, "x"); expect(recon()).toMatchObject({ ok: true, checks: [] }); });
  it("notices a payment that says its money went to an account where nothing was posted, to another account, or nowhere", async () => {
    const { mn, tap, accts, recon } = shop({ accounts: [["Main", "current"], ["Takings", "current"]] }); const p = await tap(10_000);
    mn.db.prepare("UPDATE payments SET settled_to=? WHERE id=?").run(accts[1].id, p.id); expect(recon().checks).toContain("payment_settlement_mismatch");
    mn.db.prepare("UPDATE payments SET settled_to=NULL WHERE id=?").run(p.id); expect(recon().checks).toContain("payment_settlement_mismatch");
  });
  it("notices an online payment that claims to have settled to a bank account it never reached", async () => {
    const { mn, online, accts, recon } = shop(); const p = await online(10_000); mn.db.prepare("UPDATE payments SET settled_to=? WHERE id=?").run(accts[0].id, p.id); expect(recon().checks).toContain("payment_settlement_mismatch");
  });
});

describe("the settlement routes", () => {
  async function api() {
    let mn: any; mn = createManshya({ authenticate: async (req: any) => ({ merchantId: req.get("x-who") || "a", role: "owner", actor: "t", accountKind: req.get("x-kind") || "business" }) });
    for (const id of ["a", "b"]) { mn.services.createMerchant(id, { id }); mn.db.prepare("DELETE FROM bank_accounts WHERE merchant_id=?").run(id); }       // (each starts with a default account; the test names its own)
    const A1 = mn.services.createBankAccount("a", { name: "Main" }), A2 = mn.services.createBankAccount("a", { name: "Takings" }), B1 = mn.services.createBankAccount("b", { name: "Theirs" });
    const app = express(); app.use(express.json()); app.use("/v", mn.router); const srv: Server = await new Promise((ok) => { const x = app.listen(0, "127.0.0.1", () => ok(x)); }); servers.push(srv);
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v`;
    const call = async (method: string, path: string, body?: unknown, who = "a", kind = "business") => { const r = await fetch(base + path, { method, headers: { "x-who": who, "x-kind": kind, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
    return { call, A1, A2, B1 };
  }
  it("shows where card machine money goes, lets it be changed to another of the driver's own accounts, and reports it on the card machine dashboard", async () => {
    const { call, A1, A2 } = await api(); expect((await call("GET", "/pos/settlement")).body).toMatchObject({ mode: "bank_account", chosen: false, account: { id: A1.id } });
    expect(await call("PUT", "/pos/settlement", { accountId: A2.id })).toMatchObject({ status: 200, body: { chosen: true, account: { id: A2.id } } }); expect((await call("GET", "/dashboard/pos")).body.settlement).toMatchObject({ account: { id: A2.id } });
  });
  it("refuses another person's account, and a missing one, and a personal account can use it too", async () => {
    const { call, B1, A1 } = await api(); expect((await call("PUT", "/pos/settlement", { accountId: B1.id })).status).toBe(404); expect((await call("PUT", "/pos/settlement", {})).status).toBe(400);
    expect((await call("GET", "/pos/settlement", undefined, "a", "personal")).status).toBe(200); expect((await call("PUT", "/pos/settlement", { accountId: A1.id }, "a", "personal")).status).toBe(200);
    expect((await call("GET", "/pos/settlement", undefined, "b")).body.account.id).toBe(B1.id);                                  // each sees only their own
  });
});
