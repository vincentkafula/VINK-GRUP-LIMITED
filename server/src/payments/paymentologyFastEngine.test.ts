import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createPaymentologyFastRouter } from "./paymentologyFast.js";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("../manshya/core");

/**
 * Card purchases on a VINK BANK ACCOUNT card, through the processor's own message format, with the real banking engine behind it (not a stand-in). The token service knows nothing about
 * these cards, as for any bank card. Before this, the processor route answered "14" (not ours) to every such card and silently dropped every reversal of one.
 */
const servers: Server[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise<void>((ok) => s.close(() => ok())); });
const noTokens = { authorise: async () => null, reverse: async () => null, isActive: async () => null };

async function setup(o: { engine?: boolean; tokens?: any } = {}) {
  const mn = createManshya(); const m = mn.services.createMerchant("Card Co"), a = mn.services.createBankAccount(m.id, "Main", "current");
  mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -2_000_000 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 2_000_000 }])).immediate();
  const card = mn.cards.order(m, { accountId: a.id }); mn.cards.activate(m, card.id); mn.cards.linkProviderCard(m, card.id, "paymentology", "555");
  const app = express(); app.use("/p", createPaymentologyFastRouter({ tokens: o.tokens ?? noTokens, ...(o.engine === false ? {} : { engine: mn.cards }), secret: "s3cret" }));
  const srv: Server = await new Promise((ok) => { const x = app.listen(0, "127.0.0.1", () => ok(x)); }); servers.push(srv); const port = (srv.address() as AddressInfo).port;
  const post = async (body: unknown) => { const r = await fetch(`http://127.0.0.1:${port}/p/fast`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "s3cret" }, body: JSON.stringify(body) }); const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null }; };
  const auth = (tid: string, rid: string, rand: number, over: any = {}) => post({ Message_Type: "0100", TID: tid, RID: rid, Billing_Amount: rand, Spend_Type: "POS", ISO_MSG: { DE2: "555" }, Merchant_Name: "Shoprite", ...over });
  const reverse = (tid: string, rid: string, rand?: number) => post({ Message_Type: "0400", TID: tid, RID: rid, ...(rand === undefined ? {} : { Billing_Amount: rand }), ISO_MSG: { DE2: "555" } });
  const balance = () => mn.ledger.balance(`bank:${a.id}`);
  const tx = () => mn.db.prepare("SELECT status, amount, reversed FROM card_transactions ORDER BY created_at, rowid").all();
  return { mn, m, a, card, auth, reverse, post, balance, tx };
}

describe("a bank-account card through the processor route", () => {
  it("approves a purchase, takes the money, and answers a retry of the same message without taking it twice", async () => {
    const { auth, balance, tx } = await setup(); expect((await auth("T1", "R1", 12.5)).json).toEqual({ Message_Type: "0110", TID: "T1", RID: "R1", DE39: "00" }); expect(balance()).toBe(2_000_000 - 1250);
    expect((await auth("T1", "R1", 12.5)).json.DE39).toBe("00"); expect(balance()).toBe(2_000_000 - 1250); expect(tx()).toHaveLength(1);
  });
  it("declines with the right code: no funds (51), over the daily limit (61), blocked card (62), a card that is not ours (14), and an unreadable amount (30)", async () => {
    const { auth, mn, m, card, balance } = await setup();
    expect((await auth("T2", "R1", 5000.01)).json.DE39).toBe("61");                                                      // over the R5 000 daily limit
    expect((await auth("T3", "R1", 999_999)).json.DE39).toMatch(/^(51|61)$/); expect((await auth("T4", "R1", 1, { ISO_MSG: { DE2: "999" } })).json.DE39).toBe("14"); expect((await auth("T5", "R1", 1, { Billing_Amount: "abc" })).json.DE39).toBe("30");
    mn.cards.block(m, card.id, "lost"); expect((await auth("T6", "R1", 1)).json.DE39).toBe("62"); expect(balance()).toBe(2_000_000);                         // nothing moved on any decline
  });
  it("answers a card check with no amount: live (00), blocked (62), not ours (14)", async () => {
    const { post, mn, m, card } = await setup(); const check = (c: string) => post({ Message_Type: "0100", TID: "C1", RID: "R1", Billing_Amount: 0, ISO_MSG: { DE2: c } });
    expect((await check("555")).json.DE39).toBe("00"); expect((await check("999")).json.DE39).toBe("14"); mn.cards.block(m, card.id, "lost"); expect((await check("555")).json.DE39).toBe("62");
  });
  it("lets the token service decide a token card first, and leaves the bank engine out of it", async () => {
    const asked: string[] = []; const tokens = { authorise: async (a: any) => { asked.push(a.providerCardId); return a.providerCardId === "111" ? { approved: true, replayed: false } : null; }, reverse: async () => null, isActive: async () => null };
    const { post, balance } = await setup({ tokens }); const r = await post({ Message_Type: "0100", TID: "K1", RID: "R1", Billing_Amount: 10, ISO_MSG: { DE2: "111" } });
    expect(r.json.DE39).toBe("00"); expect(asked).toEqual(["111"]); expect(balance()).toBe(2_000_000);                                                       // a token card's purchase is not charged to a bank account
  });
  it("is declined as 'not ours' without the engine wired in, which is exactly what used to happen to every bank card", async () => {
    const { auth, balance } = await setup({ engine: false }); expect((await auth("T1", "R1", 10)).json.DE39).toBe("14"); expect(balance()).toBe(2_000_000);
  });
});

describe("the processor reverses a purchase on a bank-account card", () => {
  it("returns the whole purchase, marks it reversed, and the books still reconcile", async () => {
    const { auth, reverse, balance, tx, mn } = await setup(); await auth("T1", "R1", 100); expect(balance()).toBe(2_000_000 - 10_000);
    expect((await reverse("T1", "R2")).json).toEqual({ Message_Type: "0410", TID: "T1", RID: "R2", DE39: "00" });
    expect(balance()).toBe(2_000_000); expect(tx()).toEqual([{ status: "reversed", amount: 10_000, reversed: 10_000 }]); expect(mn.recon.run(new Date(), "t")).toMatchObject({ ok: true, exceptions: 0 });
  });
  it("counts a retried reversal once, and never returns more than was taken however many reversals arrive", async () => {
    const { auth, reverse, balance, tx, mn } = await setup(); await auth("T1", "R1", 100);
    await reverse("T1", "R2", 25); expect(balance()).toBe(2_000_000 - 7_500); const again = await reverse("T1", "R2", 25); expect(again.json.DE39).toBe("00"); expect(balance()).toBe(2_000_000 - 7_500);                                // the same message again: nothing more
    await reverse("T1", "R3", 500); expect(balance()).toBe(2_000_000); await reverse("T1", "R4", 10); await reverse("T1", "R5"); expect(balance()).toBe(2_000_000);                      // too much is capped at what was left; later ones return nothing
    expect(tx()).toEqual([{ status: "reversed", amount: 10_000, reversed: 10_000 }]); expect(mn.recon.run(new Date(), "t").ok).toBe(true);
  });
  it("answers a reversal for a purchase it never saw, and changes nothing", async () => {
    const { reverse, balance, mn } = await setup(); expect((await reverse("NOPE", "R9")).json.DE39).toBe("00"); expect(balance()).toBe(2_000_000); expect(mn.db.prepare("SELECT COUNT(*) n FROM journals WHERE kind='card_reversal'").get().n).toBe(0);
  });
  it("only reverses the purchase on that thread, not another one for the same amount", async () => {
    const { auth, reverse, balance, tx } = await setup(); await auth("T1", "R1", 50); await auth("T2", "R1", 50); await reverse("T2", "R2");
    expect(balance()).toBe(2_000_000 - 5_000); expect(tx().map((t: any) => t.status)).toEqual(["approved", "reversed"]);
  });
  it("gives the limit back: a reversed purchase no longer counts against the daily limit", async () => {
    const { auth, reverse, balance } = await setup(); await auth("T1", "R1", 4000); expect((await auth("T2", "R1", 4000)).json.DE39).toBe("61");                                // R5 000 a day: a second R4 000 does not fit
    await reverse("T1", "R2"); expect((await auth("T3", "R1", 4000)).json.DE39).toBe("00"); expect(balance()).toBe(2_000_000 - 400_000);                                      // once the first is returned, it does
  });
  it("counts only what is still spent against the limit when a purchase is partly reversed", async () => {
    const { auth, reverse, balance } = await setup(); await auth("T1", "R1", 4000); await reverse("T1", "R2", 3000);                                                          // R1 000 is still spent of the R5 000 a day
    expect((await auth("T2", "R1", 3500)).json.DE39).toBe("00"); expect(balance()).toBe(2_000_000 - 100_000 - 350_000); expect((await auth("T3", "R1", 500.01)).json.DE39).toBe("61");      // R1 000 + R3 500 = R4 500, so R500.01 more is over
  });
  it("tells the customer what was returned, and a partly reversed purchase stays approved", async () => {
    const { auth, reverse, tx, mn, m } = await setup(); await auth("T1", "R1", 100); await reverse("T1", "R2", 40);
    expect(tx()).toEqual([{ status: "approved", amount: 10_000, reversed: 4_000 }]); const notes = mn.db.prepare("SELECT title, body FROM notifications WHERE merchant_id=? AND type='card'").all(m.id); expect(notes).toEqual([{ title: "Card purchase reversed", body: "R 40.00 was returned to your account (Shoprite)." }]);
  });
});
