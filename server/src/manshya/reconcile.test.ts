import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("./core");

/** A small, honest history: a payment, a refund, a payout, and a transfer between two accounts. */
async function books() {
  const mn = createManshya();
  const m = mn.services.createMerchant("Recon Co");
  const pay = await mn.services.createPayment(m, { amount: 100_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r1", customer: { name: "A", email: "a@b.co" } });
  await mn.services.refundPayment(m, pay.id, { amount: 10_000 });
  const a = mn.services.createBankAccount(m.id, "Main", "current"), b = mn.services.createBankAccount(m.id, "Savings", "savings");
  mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -50_000 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 50_000 }]))();
  const t = await mn.services.transfer(m, { type: "own", fromAccountId: a.id, toAccountId: b.id, amount: 20_000 });
  return { mn, m, pay, a, b, t };
}
const checks = (r: { items: { check: string }[] }) => r.items.map((i) => i.check);

describe("daily reconciliation", () => {
  it("a clean set of books reconciles", async () => {
    const { mn } = await books();
    const run = mn.recon.run(new Date(), "test");
    expect(run).toMatchObject({ ok: true, exceptions: 0 });
    expect(mn.recon.list().data[0]).toMatchObject({ id: run.id, ok: true });
  });

  it("finds a payment marked paid that was never posted, and one posted for a different amount", async () => {
    const { mn, pay } = await books();
    mn.db.prepare("UPDATE payments SET amount=amount+100 WHERE id=?").run(pay.id);
    expect(checks(mn.recon.detail(mn.recon.run().id))).toContain("payment_not_posted");
    mn.db.prepare("DELETE FROM entries WHERE journal_id IN (SELECT id FROM journals WHERE kind='payment' AND ref=?)").run(pay.id);
    mn.db.prepare("DELETE FROM journals WHERE kind='payment' AND ref=?").run(pay.id);
    const d = mn.recon.detail(mn.recon.run().id);
    expect(d.ok).toBe(false); expect(d.items.some((i: { check: string; ref: string }) => i.check === "payment_not_posted" && i.ref === pay.id)).toBe(true);
  });

  it("finds a refund that does not match what was moved", async () => {
    const { mn, pay } = await books();
    mn.db.prepare("UPDATE payments SET refunded=refunded+500 WHERE id=?").run(pay.id);
    expect(checks(mn.recon.detail(mn.recon.run().id))).toContain("refund_mismatch");
  });

  it("finds an unbalanced journal and books that no longer add up to zero", async () => {
    const { mn, a } = await books();
    const j = mn.db.prepare("SELECT id FROM journals LIMIT 1").get().id;
    mn.db.prepare("INSERT INTO entries(journal_id,account_id,amount) VALUES(?,?,?)").run(j, `bank:${a.id}`, 7);
    const c = checks(mn.recon.detail(mn.recon.run().id));
    expect(c).toContain("journal_unbalanced"); expect(c).toContain("books_not_zero");
  });

  it("finds a customer account that has gone negative", async () => {
    const { mn, a } = await books();
    mn.db.transaction(() => mn.ledger.post("oops", [{ account: `bank:${a.id}`, kind: "bank", merchant: "x", amount: -9_999_999 }, { account: "sys:fees", kind: "system", amount: 9_999_999 }]))();
    expect(checks(mn.recon.detail(mn.recon.run().id))).toContain("negative_balance");
  });

  it("finds a transfer or payout that was accepted without a posting", async () => {
    const { mn, t } = await books();
    mn.db.prepare("DELETE FROM entries WHERE journal_id IN (SELECT id FROM journals WHERE kind='transfer' AND ref=?)").run(t.id);
    mn.db.prepare("DELETE FROM journals WHERE kind='transfer' AND ref=?").run(t.id);
    mn.db.prepare("INSERT INTO payouts(id,merchant_id,gross,fee,net,status,destination_type,created_at) VALUES('po_x','m',1000,500,500,'paid','bank_account',?)").run(new Date().toISOString());
    const c = checks(mn.recon.detail(mn.recon.run().id));
    expect(c).toContain("transfer_not_posted"); expect(c).toContain("payout_not_posted");
  });

  it("flags transfers stuck in processing for more than three days, but not newer ones", async () => {
    const { mn, a } = await books();
    const ins = mn.db.prepare("INSERT INTO transfers(id,merchant_id,from_account,kind,to_ref,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?)");
    mn.db.transaction(() => mn.ledger.post("transfer", [{ account: "sys:fees", kind: "system", amount: 0 }], { ref: "trf_old" }))();
    ins.run("trf_old", "m", a.id, "beneficiary", "x", 0, "processing", new Date(Date.now() - 5 * 864e5).toISOString());
    ins.run("trf_new", "m", a.id, "beneficiary", "x", 0, "processing", new Date().toISOString());
    mn.db.transaction(() => mn.ledger.post("transfer", [{ account: "sys:fees", kind: "system", amount: 0 }], { ref: "trf_new" }))();
    const stuck = mn.recon.detail(mn.recon.run().id).items.filter((i: { check: string }) => i.check === "stuck_processing").map((i: { ref: string }) => i.ref);
    expect(stuck).toEqual(["trf_old"]);
  });

  it("the daily run happens once a day, not every minute, and the scheduler includes it", async () => {
    const { mn } = await books();
    const t0 = new Date("2026-10-14T10:00:00Z");
    expect(mn.recon.runDaily(t0)).toMatchObject({ ok: true });
    expect(mn.recon.runDaily(new Date(t0.getTime() + 60_000))).toEqual({ skipped: true });
    expect(mn.recon.runDaily(new Date(t0.getTime() + 25 * 3600_000))).toMatchObject({ ok: true });
    expect(mn.recon.list().data).toHaveLength(2);
    expect(await mn.runDue(new Date(t0.getTime() + 60 * 3600_000))).toHaveProperty("reconciliation");
  });

  it("dead webhook events are reported but do not fail the day", async () => {
    const { mn, m } = await books();
    mn.db.prepare("INSERT INTO events(id,merchant_id,type,payload,created_at,dead) VALUES('evt_d',?,?,?,?,1)").run(m.id, "payment.paid", "{}", new Date().toISOString());
    const r = mn.recon.run();
    expect(r.ok).toBe(true); expect(checks(mn.recon.detail(r.id))).toEqual(["webhook_dead_letters"]);
  });
});
