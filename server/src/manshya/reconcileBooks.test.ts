import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");
const { mockBills } = require("./core/gateways");
const { COVERED } = require("./core/reconcileBooks");
import { tampering } from "./tamper";

/** A bill provider that refuses one number, so a failed purchase (taken, then returned) is part of the history. */
const bills = () => ({ ...mockBills(), async purchase(a: any) { if (a.recipient === "0820000000") throw new Error("provider down"); return mockBills().purchase(a); } });

/** A busy, honest history that touches every subsystem the engine reconciles. */
async function everything() {
  const mn = tampering(createManshya({ bills: bills() }));
  const m = mn.services.createMerchant("Books Co");
  const main = mn.services.createBankAccount(m.id, "Main", "current"), other = mn.services.createBankAccount(m.id, "Other", "current");
  const fund = (acct: any, amount: number) => mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -amount }, { account: `bank:${acct.id}`, merchant: m.id, kind: "bank", amount, floor: undefined }])).immediate();
  fund(main, 50_000_000); fund(other, 1_000_000);
  const phone = "0821234567";

  await mn.banking.buy(m, { productId: "airtime", recipient: phone, amount: 5000, accountId: main.id }, "bank");
  await expect(mn.banking.buy(m, { productId: "airtime", recipient: "0820000000", amount: 7000, accountId: main.id }, "bank")).rejects.toThrow();     // taken, then returned
  const sent = await Promise.all([1, 2, 3].map((i) => mn.payments2.cashSend(m, { fromAccountId: main.id, amount: 10_000 * i, phone: `082000000${i}` })));
  mn.payments2.cashCollect({ phone: "0820000001", code: sent[0].code }); mn.payments2.cashCancel(m, sent[1].id);                                       // collected, cancelled, one still waiting
  mn.payments2.receiveInbound({ accountNumber: main.number, amount: 250_000, railRef: "rail-1", currency: "ZAR", sender: "Other Bank" });
  const cur = Object.keys(mn.config.fx.rates)[0], q = mn.payments2.fxQuote(m, { currency: cur, foreignAmount: 10_000 });
  await mn.payments2.sendInternational(m, { fromAccountId: main.id, quoteId: q.id, beneficiary: { name: "Ann", country: "US", swift: "CHASUS33", account: "12345678" }, purpose: "Family support" });
  await mn.extras.vehicleRenew(m, { plate: "CA12345", accountId: main.id });
  const card = mn.cards.order(m, { accountId: main.id }); mn.cards.activate(m, card.id);
  mn.cards.authorize(m, { cardId: card.id, amount: 25_000, channel: "chip" });                                                                         // approved
  mn.cards.authorize(m, { cardId: card.id, amount: 600_000, channel: "chip" });                                                                        // declined (over the daily limit): nothing moves
  mn.cards.linkProviderCard(m, card.id, "paymentology", "555");                                                                                         // a purchase through the processor, partly reversed
  mn.cards.authoriseFromProvider({ provider: "paymentology", authorisationId: "T9:R1", providerCardId: "555", amount: 20_000, channel: "chip" }); mn.cards.reverseFromProvider({ provider: "paymentology", threadId: "T9", amountCents: 5_000, reversalId: "R2" });
  const pay = await mn.services.createPayment(m, { amount: 200_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r1", customer: { name: "A", email: "a@b.co" } });
  const won = mn.admin.openDispute({ paymentId: pay.id, amount: 20_000 }, "t"), lost = mn.admin.openDispute({ paymentId: pay.id, amount: 30_000 }, "t"), open = mn.admin.openDispute({ paymentId: pay.id, amount: 10_000 }, "t");
  mn.admin.resolveDispute(won.id, "merchant", "t"); mn.admin.resolveDispute(lost.id, "customer", "t");
  const pol = mn.insurance.buy(m, { product: "funeral", cover: 1_000_000, accountId: main.id, beneficiary: "Spouse" });
  mn.insurance.runPremiums(new Date(Date.now() + 40 * 864e5));
  const clm = mn.insurance.claim(m, { policyId: pol.id, cause: "accident", amount: 300_000, description: "Accident" }); mn.insurance.decide(clm.id, { decision: "approve" });
  const app = mn.credit.apply(m, { product: "term_loan", requested: 1_000_000, termMonths: 12, accountId: main.id }); mn.credit.adminDecide(app.id, { decision: "approve", offeredLimit: 1_000_000 });
  const fac = mn.credit.accept(m, app.id); mn.credit.repay(m, fac.id, { amount: 100_000, accountId: main.id }); mn.credit.runDue(new Date(Date.now() + 40 * 864e5));
  const goal = mn.banking.createGoal(m, { name: "Rainy day", target: 1_000_000 }); mn.banking.deposit(m, goal.id, { amount: 50_000, fromAccountId: main.id }); mn.banking.withdraw(m, goal.id, { amount: 10_000, toAccountId: main.id });
  return { mn, m, main, other, pay, open, pol, clm, fac, card, sent, q };
}
const problems = (mn: any) => { const r = mn.recon.run(new Date(), "test"); return { run: r, checks: mn.recon.detail(r.id).items.map((i: any) => i.check) as string[], items: mn.recon.detail(r.id).items }; };
const wipe = (mn: any, kind: string, ref: string) => { mn.db.prepare("DELETE FROM entries WHERE journal_id IN (SELECT id FROM journals WHERE kind=? AND ref=?)").run(kind, ref); mn.db.prepare("DELETE FROM journals WHERE kind=? AND ref=?").run(kind, ref); };
/** Posts a journal that moves `amount` from a system account to another, for a record that does not exist. */
const ghost = (mn: any, kind: string, ref: string) => mn.db.transaction(() => mn.ledger.post(kind, [{ account: "sys:ghost_a", kind: "system", amount: -100 }, { account: "sys:ghost_b", kind: "system", amount: 100 }], { ref })).immediate();

describe("a healthy history reconciles clean", () => {
  it("across payments, bills (one failed), cash (collected, cancelled, waiting), bank credits, international, vehicle, cards, disputes (won, lost, open), insurance, credit and savings", async () => {
    const { mn } = await everything(); const p = problems(mn);
    expect(p.items, JSON.stringify(p.items)).toEqual([]); expect(p.run).toMatchObject({ ok: true, exceptions: 0 });
  });
  it("still reconciles clean after the monthly jobs run and a cash voucher expires", async () => {
    const { mn } = await everything(); const later = new Date(Date.now() + 5 * 864e5);
    mn.payments2.runCash(later); mn.runDue(later); const p = problems(mn); expect(p.items, JSON.stringify(p.items)).toEqual([]);
  });
});

describe("each check notices what it is for", () => {
  it("a bill with no posting, a different amount, a failed bill that was not returned, and a reversal on a bill that did not fail", async () => {
    const { mn } = await everything(); const ok = mn.db.prepare("SELECT id FROM bill_purchases WHERE status='completed'").get().id, bad = mn.db.prepare("SELECT id FROM bill_purchases WHERE status='failed'").get().id;
    mn.db.prepare("UPDATE bill_purchases SET amount=amount+1 WHERE id=?").run(ok); expect(problems(mn).checks).toContain("bill_amount_mismatch"); mn.db.prepare("UPDATE bill_purchases SET amount=amount-1 WHERE id=?").run(ok);
    mn.db.prepare("UPDATE bill_purchases SET status='completed' WHERE id=?").run(bad); expect(problems(mn).checks).toContain("bill_reversed_but_not_failed"); mn.db.prepare("UPDATE bill_purchases SET status='failed' WHERE id=?").run(bad);
    wipe(mn, "bill_reversal", bad); expect(problems(mn).checks).toContain("bill_reversal_missing");
    wipe(mn, "bill", ok); expect(problems(mn).checks).toContain("bill_not_posted");
  });
  it("a posting for a record that is not on file, for every kind that has records", async () => {
    const { mn } = await everything();
    for (const [kind, label] of [["bill", "bill"], ["cash_send", "cash"], ["card", "card"], ["inbound", "inbound"], ["international", "international"], ["vehicle", "vehicle"], ["dispute_hold", "dispute"], ["premium", "policy"], ["claim", "claim"], ["credit_draw", "credit"], ["goal", "savings"], ["debit_order", "debit_order"]] as const) {
      ghost(mn, kind, `ghost-${kind}`); expect(problems(mn).checks, kind).toContain(`${label}_orphan_journal`);
    }
  });
  it("cash that was collected but not paid out, cash still marked waiting that has gone, and an escrow account that does not match what is waiting", async () => {
    const { mn, sent } = await everything(); wipe(mn, "cash_collect", sent[0].id); expect(problems(mn).checks).toContain("cash_collect_missing");
    mn.db.prepare("UPDATE cash_vouchers SET status='active' WHERE id=?").run(sent[1].id); const c = problems(mn).checks; expect(c).toContain("cash_settled_but_active"); expect(c).toContain("cash_escrow_mismatch");
  });
  it("a card purchase approved but never posted, and one declined but posted", async () => {
    const { mn } = await everything(); const a = mn.db.prepare("SELECT id FROM card_transactions WHERE status='approved'").get().id, d = mn.db.prepare("SELECT id FROM card_transactions WHERE status='declined'").get().id;
    ghost(mn, "card", d); expect(problems(mn).checks).toContain("card_declined_but_posted"); wipe(mn, "card", d); wipe(mn, "card", a); expect(problems(mn).checks).toContain("card_not_posted");
  });
  it("an inbound credit and an international payment recorded for a different amount than was posted, and an international payment that failed but was not returned", async () => {
    const { mn } = await everything(); mn.db.prepare("UPDATE inbound_credits SET amount=amount+5").run(); mn.db.prepare("UPDATE international_payments SET zar_amount=zar_amount+5").run(); const c = problems(mn).checks;
    expect(c).toContain("inbound_amount_mismatch"); expect(c).toContain("international_amount_mismatch");
    mn.db.prepare("UPDATE international_payments SET zar_amount=zar_amount-5, status='failed'").run(); expect(problems(mn).checks).toContain("international_reversal_missing");
  });
  it("a vehicle renewal that was never posted", async () => { const { mn } = await everything(); const id = mn.db.prepare("SELECT id FROM vehicle_renewals").get().id; wipe(mn, "vehicle", id); expect(problems(mn).checks).toContain("vehicle_not_posted"); });
  it("disputes: a hold that does not match, a won dispute that was never released, a lost one with no fee, a settled one still open, and an account that does not match the open disputes", async () => {
    const { mn, open } = await everything(); const won = mn.db.prepare("SELECT id FROM disputes WHERE status='won'").get().id, lost = mn.db.prepare("SELECT id FROM disputes WHERE status='lost'").get().id;
    mn.db.prepare("UPDATE disputes SET amount=amount+1 WHERE id=?").run(open.id); let c = problems(mn).checks; expect(c).toContain("dispute_hold_mismatch"); expect(c).toContain("disputes_account_mismatch"); mn.db.prepare("UPDATE disputes SET amount=amount-1 WHERE id=?").run(open.id);
    wipe(mn, "dispute_release", won); expect(problems(mn).checks).toContain("dispute_release_mismatch"); wipe(mn, "chargeback_fee", lost); expect(problems(mn).checks).toContain("dispute_fee_missing");
    mn.db.prepare("UPDATE disputes SET status='open' WHERE id=?").run(lost); expect(problems(mn).checks).toContain("dispute_settled_but_open");
  });
  it("insurance: a policy with no premium, a paid claim that does not match, a claim paid that is not marked paid, and claims that add up to more than the cover", async () => {
    const { mn, pol, clm } = await everything(); mn.db.prepare("UPDATE claims SET paid=paid+1 WHERE id=?").run(clm.id); expect(problems(mn).checks).toContain("claim_payout_mismatch"); mn.db.prepare("UPDATE claims SET paid=paid-1 WHERE id=?").run(clm.id);
    mn.db.prepare("UPDATE policies SET cover=1 WHERE id=?").run(pol.id); expect(problems(mn).checks).toContain("claims_exceed_cover"); mn.db.prepare("UPDATE policies SET cover=1000000 WHERE id=?").run(pol.id);
    mn.db.prepare("UPDATE claims SET status='declined' WHERE id=?").run(clm.id); expect(problems(mn).checks).toContain("claim_paid_but_not_marked"); wipe(mn, "premium", pol.id); expect(problems(mn).checks).toContain("policy_premium_not_posted");
  });
  it("credit: a term loan that was accepted but never paid out", async () => { const { mn, fac } = await everything(); mn.db.prepare("DELETE FROM entries WHERE journal_id IN (SELECT id FROM journals WHERE kind='credit_draw' AND ref=?)").run(fac.id); mn.db.prepare("DELETE FROM journals WHERE kind='credit_draw' AND ref=?").run(fac.id); expect(problems(mn).checks).toContain("loan_payout_missing"); });
  it("names the merchant and says what is wrong in words, so the daily alert can be acted on", async () => {
    const { mn, m } = await everything(); const id = mn.db.prepare("SELECT id FROM bill_purchases WHERE status='completed'").get().id; mn.db.prepare("UPDATE bill_purchases SET amount=amount+1 WHERE id=?").run(id);
    const item = problems(mn).items.find((i: any) => i.check === "bill_amount_mismatch"); expect(item).toMatchObject({ ref: id, merchant_id: m.id }); expect(item.detail).toMatch(/Bill payment is 5001 cents on record but 5000 cents was posted/);
  });
});

describe("card reversals", () => {
  it("are checked: what is recorded as reversed must be what was returned, never more than the purchase, and a fully reversed purchase must say so", async () => {
    const { mn } = await everything(); const id = mn.db.prepare("SELECT id FROM card_transactions WHERE reversed > 0").get().id;
    mn.db.prepare("UPDATE card_transactions SET reversed = reversed + 1 WHERE id=?").run(id); expect(problems(mn).checks).toContain("card_reversal_mismatch"); mn.db.prepare("UPDATE card_transactions SET reversed = reversed - 1 WHERE id=?").run(id);
    mn.db.prepare("UPDATE card_transactions SET status='reversed' WHERE id=?").run(id); expect(problems(mn).checks).toContain("card_status_mismatch"); mn.db.prepare("UPDATE card_transactions SET status='approved' WHERE id=?").run(id);
    mn.db.prepare("UPDATE card_transactions SET reversed = 99999999 WHERE id=?").run(id); expect(problems(mn).checks).toContain("card_over_reversed");
  });
  it("are noticed when the money was returned but the purchase does not say so, and when a reversal is posted for a purchase that is not on file", async () => {
    const { mn } = await everything(); const id = mn.db.prepare("SELECT id FROM card_transactions WHERE reversed > 0").get().id; mn.db.prepare("UPDATE card_transactions SET reversed = 0 WHERE id=?").run(id);
    expect(problems(mn).checks).toContain("card_reversal_mismatch"); mn.db.prepare("UPDATE card_transactions SET reversed = 5000 WHERE id=?").run(id); ghost(mn, "card_reversal", "ghost-purchase"); expect(problems(mn).checks).toContain("card_orphan_journal");
  });
});

describe("every kind of money movement is accounted for", () => {
  const dir = join(__dirname, "core");
  const source = readdirSync(dir).filter((f) => f.endsWith(".js") && !/^reconcile/.test(f)).map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);
  const posted = new Set<string>(); const dynamic: string[] = [];
  for (const [f, s] of source) for (const m of s.matchAll(/ledger\.post\(\s*([^,)]+)/g)) { const a = m[1].trim(); const lit = /^['"`]([a-z_]+)['"`]$/.exec(a); if (lit) posted.add(lit[1]); else dynamic.push(`${f}: ledger.post(${a}`); }
  it("has no posting whose kind is worked out at run time, which no check could know about", () => { expect(dynamic).toEqual([]); });
  it("lists, for every kind of posting the engine makes, how it is reconciled: add a kind and this fails until you decide", () => {
    expect([...posted].filter((k) => !(k in COVERED)).sort(), "kinds posted but not listed in reconcileBooks.js COVERED").toEqual([]);
  });
  it("does not list a kind the engine no longer posts, so the list cannot go stale", () => { expect(Object.keys(COVERED).filter((k) => !posted.has(k) && !["reversal"].includes(k)).sort()).toEqual([]); });
});
