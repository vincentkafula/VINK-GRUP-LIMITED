import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness";
import { cardAccount, cardBalance, LedgerError, postJournal } from "../src/domain/ledger";
import { SYSTEM } from "../src/domain/audit";
import { cancelTopup, confirmLoad, createTopupOrder, directLoad, TOPUP_MAX } from "../src/domain/topups";
import { registerCard } from "../src/domain/cards";

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

const UID = "04a1b2c3d4e5f6";   // seeded with R100.00

describe("the ledger is enforced by the database", () => {
  it("seeded cards start with the balance the personalisation wrote", async () => {
    expect(await cardBalance(h.db, UID)).toBe(10_000);
    expect(await cardBalance(h.db, "04a1b2c3d4e5f9")).toBe(500);
  });

  it("refuses an unbalanced journal in the application", async () => {
    await expect(h.db.$transaction((tx) => postJournal(tx, { kind: "X", lines: [{ account: "a", amount: 5 }, { account: "b", amount: -4 }] }))).rejects.toBeInstanceOf(LedgerError);
    await expect(h.db.$transaction((tx) => postJournal(tx, { kind: "X", lines: [{ account: "a", amount: 1.5 }, { account: "b", amount: -1.5 }] }))).rejects.toMatchObject({ code: "BAD_AMOUNT" });
  });

  it("refuses an unbalanced journal even when written straight to the database", async () => {
    await expect(h.db.$transaction(async (tx) => {
      const j = await tx.journal.create({ data: { kind: "HACK" } });
      await tx.posting.create({ data: { journalId: j.id, account: "x", amount: 100 } });
    })).rejects.toThrow(/unbalanced/);
  });

  it("never lets posted rows be changed or deleted, even by direct SQL", async () => {
    await expect(h.db.$executeRaw`UPDATE "Posting" SET amount = amount + 1`).rejects.toThrow(/immutable/);
    await expect(h.db.$executeRaw`DELETE FROM "Posting"`).rejects.toThrow(/immutable/);
    await expect(h.db.$executeRaw`UPDATE "Journal" SET memo = 'edited'`).rejects.toThrow(/immutable/);
    await expect(h.db.$executeRaw`TRUNCATE "Posting", "Journal" CASCADE`).rejects.toThrow(/immutable/);
  });

  it("a card cannot be taken below zero", async () => {
    await expect(h.db.$transaction((tx) => postJournal(tx, { kind: "FARE", lines: [{ account: cardAccount("04a1b2c3d4e5f9"), amount: -501 }, { account: "revenue:route:2", amount: 501 }] }))).rejects.toMatchObject({ code: "NEGATIVE_BALANCE" });
    expect(await cardBalance(h.db, "04a1b2c3d4e5f9")).toBe(500);
    await expect(h.db.$executeRaw`INSERT INTO "Journal"(id, kind) VALUES ('j_neg', 'T')`).resolves.toBeDefined();
  });

  it("concurrent postings to one card never lose an update or overdraw", async () => {
    const uid = "04aaaaaaaaaaa1";
    await registerCard(h.db, SYSTEM, { uid, initialBalance: 1000 });
    const spend = () => h.db.$transaction((tx) => postJournal(tx, { kind: "FARE", lines: [{ account: cardAccount(uid), amount: -300 }, { account: "revenue:route:2", amount: 300 }] }));
    const results = await Promise.allSettled([spend(), spend(), spend(), spend(), spend()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await cardBalance(h.db, uid)).toBe(100);
  });

  it("the sum of every posting in the ledger is zero", async () => {
    const [{ s }] = await h.db.$queryRaw<{ s: bigint }[]>`SELECT COALESCE(SUM(amount), 0) AS s FROM "Posting"`;
    expect(Number(s)).toBe(0);
  });
});

describe("top-ups", () => {
  const card = () => registerCard(h.db, SYSTEM, { uid: "04" + Math.random().toString(16).slice(2, 14).padEnd(12, "0"), initialBalance: 0 });

  it("a paid order sits as 'prepaid' until the card is loaded, then moves onto the card", async () => {
    const c = await card();
    const { topup } = await createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 5000, method: "MOBILE_MONEY", reference: "MM-1" });
    expect(topup.status).toBe("PENDING_LOAD");
    expect(await cardBalance(h.db, c.uid)).toBe(0);
    const [{ pending }] = await h.db.$queryRaw<{ pending: bigint }[]>`SELECT COALESCE(SUM(amount),0) AS pending FROM "Posting" WHERE account = 'prepaid:pending'`;
    expect(Number(pending)).toBeGreaterThanOrEqual(5000);
    await confirmLoad(h.db, SYSTEM, topup.id);
    expect(await cardBalance(h.db, c.uid)).toBe(5000);
  });

  it("the same provider reference can never credit twice, however often it is sent", async () => {
    const c = await card();
    const a = await createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 2000, method: "MOBILE_MONEY", reference: "MM-DUP" });
    const b = await createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 2000, method: "MOBILE_MONEY", reference: "MM-DUP" });
    expect(b.replay).toBe(true); expect(b.topup.id).toBe(a.topup.id);
    await expect(createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 3000, method: "MOBILE_MONEY", reference: "MM-DUP" })).rejects.toMatchObject({ code: "reference_reused" });
    const raced = await Promise.all([1, 2, 3].map(() => createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 700, method: "CASH", reference: "RC-RACE" })));
    expect(new Set(raced.map((r) => r.topup.id)).size).toBe(1);
  });

  it("loading twice puts the money on the card once", async () => {
    const c = await card();
    const { topup } = await createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 1500, method: "CASH", reference: "RC-ONCE" });
    const first = await confirmLoad(h.db, SYSTEM, topup.id);
    const second = await confirmLoad(h.db, SYSTEM, topup.id);
    expect(first.already).toBe(false); expect(second.already).toBe(true);
    expect(await cardBalance(h.db, c.uid)).toBe(1500);
  });

  it("an order can be cancelled before loading, and the money goes back out of 'prepaid'", async () => {
    const c = await card();
    const { topup } = await createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 1000, method: "CASH", reference: "RC-CAN" });
    await cancelTopup(h.db, SYSTEM, topup.id);
    await expect(confirmLoad(h.db, SYSTEM, topup.id)).rejects.toMatchObject({ code: "not_pending" });
    await expect(cancelTopup(h.db, SYSTEM, topup.id)).rejects.toMatchObject({ code: "not_pending" });
    expect(await cardBalance(h.db, c.uid)).toBe(0);
  });

  it("enforces amount limits, the card ceiling, and blocked cards", async () => {
    const c = await card();
    await expect(createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 499, method: "CASH", reference: "r1" })).rejects.toMatchObject({ code: "bad_amount" });
    await expect(createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: TOPUP_MAX + 1, method: "CASH", reference: "r2" })).rejects.toMatchObject({ code: "bad_amount" });
    for (let i = 0; i < 2; i++) await directLoad(h.db, SYSTEM, { cardUid: c.uid, amount: TOPUP_MAX, method: "CASH", reference: "fill" + i });
    await expect(directLoad(h.db, SYSTEM, { cardUid: c.uid, amount: TOPUP_MAX, method: "CASH", reference: "fill3" })).rejects.toMatchObject({ code: "over_limit" });   // R4 000 + R2 000 is over the R5 000 ceiling
    await expect(directLoad(h.db, SYSTEM, { cardUid: c.uid, amount: 100_000, method: "CASH", reference: "fill4" })).resolves.toBeDefined();   // exactly R5 000
  });

  it("a blocked card cannot be topped up", async () => {
    const c = await card();
    await h.db.card.update({ where: { uid: c.uid }, data: { status: "BLOCKED" } });
    await expect(createTopupOrder(h.db, SYSTEM, { cardUid: c.uid, amount: 1000, method: "CASH", reference: "RC-BLK" })).rejects.toMatchObject({ code: "card_not_active" });
  });

  it("direct load by an agent terminal posts straight to the card and flags a balance the terminal disagrees with", async () => {
    const c = await card();
    const ok = await directLoad(h.db, SYSTEM, { cardUid: c.uid, amount: 2500, method: "CASH", reference: "RC-D1", deviceId: "AGENT-1" }, { cardBalanceAfter: 2500 });
    expect(ok.topup.status).toBe("LOADED");
    await directLoad(h.db, SYSTEM, { cardUid: c.uid, amount: 1000, method: "CASH", reference: "RC-D2" }, { cardBalanceAfter: 9999 });
    const a = await h.db.anomaly.findMany({ where: { cardUid: c.uid, kind: "LOAD_BALANCE_MISMATCH" } });
    expect(a).toHaveLength(1);
    expect(await cardBalance(h.db, c.uid)).toBe(3500);
  });
});
