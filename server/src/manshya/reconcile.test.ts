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

describe("settlement files", () => {
  async function withRefs() {
    const s = await books();
    s.mn.db.prepare("UPDATE payments SET gateway_ref='gw_100' WHERE id=?").run(s.pay.id);
    return s;
  }
  const today = new Date().toISOString().slice(0, 10);

  it("matches a provider file against our payments and reports each kind of difference", async () => {
    const { mn, pay, m } = await withRefs();
    const p2 = await mn.services.createPayment(m, { amount: 5_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r2", customer: { name: "B", email: "b@c.co" } });
    mn.db.prepare("UPDATE payments SET gateway_ref='gw_200' WHERE id=?").run(p2.id);
    const csv = ["Reference,Amount,Date", `gw_100,1000.00,${today}`, `gw_200,49.00,${today}`, `gw_999,10.00,${today}`, `gw_100,1000.00,${today}`].join("\n");
    const r = mn.recon.matchSettlement({ kind: "acquirer", csv, source: "Test PSP" }, "tester");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatchObject({ rows: 4, matched: 1, amount_mismatch: 1, not_in_our_records: 1, duplicate_in_file: 1, matched_total: 100_000 });
    const by = (b: string) => r.items.filter((i: { bucket: string }) => i.bucket === b);
    expect(by("amount_mismatch")[0]).toMatchObject({ ref: "gw_200", file_amount: 4_900, our_amount: 5_000 });
    expect(by("not_in_our_records")[0].ref).toBe("gw_999");
    expect(pay.id).toBeTruthy();
  });

  it("reports what we recorded that the file does not mention (inside the file's dates)", async () => {
    const { mn, m } = await withRefs();
    const p2 = await mn.services.createPayment(m, { amount: 5_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r3", customer: { name: "B", email: "b@c.co" } });
    mn.db.prepare("UPDATE payments SET gateway_ref='gw_300' WHERE id=?").run(p2.id);
    const r = mn.recon.matchSettlement({ kind: "acquirer", csv: `Reference,Amount,Date\ngw_100,1000.00,${today}` });
    expect(r.items.map((i: { bucket: string; ref: string }) => [i.bucket, i.ref])).toEqual([["missing_from_file", "gw_300"]]);
  });

  it("recognises column names the provider uses when told, and amounts in cents", async () => {
    const { mn } = await withRefs();
    const r = mn.recon.matchSettlement({ kind: "acquirer", csv: "Txn,Settled\ngw_100,100000", columns: { ref: "Txn", amount: "Settled" }, amountUnit: "cents" });
    expect(r).toMatchObject({ ok: true, summary: { matched: 1, matched_total: 100_000 } });
    expect(() => mn.recon.matchSettlement({ kind: "acquirer", csv: "Foo,Bar\nx,1" })).toThrow(/foo, bar/);
  });

  it("matches the bank's payout statement against our payouts and transfers", async () => {
    const { mn, m, t } = await withRefs();
    mn.db.prepare("INSERT INTO payouts(id,merchant_id,gross,fee,net,status,destination_type,rail_ref,created_at) VALUES('po_1',?,100000,500,99500,'paid','bank_account','rail_p1',?)").run(m.id, new Date().toISOString());
    mn.db.prepare("UPDATE transfers SET rail_ref='rail_t1' WHERE id=?").run(t.id);
    const r = mn.recon.matchSettlement({ kind: "bank", csv: `reference,amount\nrail_p1,-995.00\nrail_t1,200.00\nrail_zzz,5.00` });
    expect(r.summary).toMatchObject({ matched: 2, not_in_our_records: 1 });
  });

  it("refuses the same file twice, an unknown kind and an oversized file", async () => {
    const { mn } = await withRefs();
    const csv = "Reference,Amount\ngw_100,1000.00";
    mn.recon.matchSettlement({ kind: "acquirer", csv });
    expect(() => mn.recon.matchSettlement({ kind: "acquirer", csv })).toThrow(/already been imported/);
    expect(() => mn.recon.matchSettlement({ kind: "other", csv })).toThrow(/kind/);
    expect(() => mn.recon.matchSettlement({ kind: "acquirer", csv: "a,b\n" + "x,1\n".repeat(100_000) })).toThrow(/up to/i);
  });

  it("stores each import with its items so it can be read back later", async () => {
    const { mn } = await withRefs();
    const r = mn.recon.matchSettlement({ kind: "acquirer", csv: "Reference,Amount\ngw_zzz,1.00" });
    expect(mn.recon.listSettlements().data[0]).toMatchObject({ id: r.id, ok: false });
    expect(mn.recon.settlementDetail(r.id).items[0]).toMatchObject({ bucket: "not_in_our_records", ref: "gw_zzz" });
  });
});

describe("alerts and dead letters", () => {
  it("emails the operations address once for a new problem, not again for the same problem, and again after a clean day", async () => {
    const sent: { subject: string; body: string }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildRecon } = require("./core/reconcile");
    const { mn, pay } = await books();
    const recon = buildRecon({ db: mn.db, notify: (subject: string, body: string) => sent.push({ subject, body }) });
    mn.db.prepare("UPDATE payments SET refunded=refunded+500 WHERE id=?").run(pay.id);
    const day = (n: number) => new Date(Date.parse("2026-10-14T10:00:00Z") + n * 864e5);
    recon.runDaily(day(0));
    expect(sent).toHaveLength(1); expect(sent[0].subject).toMatch(/1 exception/); expect(sent[0].body).toContain("refund_mismatch");
    recon.runDaily(day(1)); expect(sent).toHaveLength(1);                                   // same problem, no repeat
    mn.db.prepare("UPDATE payments SET refunded=refunded-500 WHERE id=?").run(pay.id);
    recon.runDaily(day(2)); expect(sent).toHaveLength(1);                                   // clean day: nothing to say, alert re-armed
    mn.db.prepare("UPDATE payments SET refunded=refunded+500 WHERE id=?").run(pay.id);
    recon.runDaily(day(3)); expect(sent).toHaveLength(2);
  });

  it("a manual run does not send email", async () => {
    const sent: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildRecon } = require("./core/reconcile");
    const { mn, pay } = await books();
    mn.db.prepare("UPDATE payments SET refunded=refunded+500 WHERE id=?").run(pay.id);
    buildRecon({ db: mn.db, notify: (...a: unknown[]) => sent.push(a) }).run(new Date(), "someone");
    expect(sent).toHaveLength(0);
  });

  it("lists dead webhook events across merchants and replays one for the back office", async () => {
    const { mn, m } = await books();
    mn.db.prepare("UPDATE merchants SET webhook_url=NULL WHERE id=?").run(m.id);
    mn.db.prepare("INSERT INTO events(id,merchant_id,type,payload,created_at,dead,attempts,last_error) VALUES('evt_x',?,?,?,?,1,8,'HTTP 503')").run(m.id, "payment.paid", "{}", new Date().toISOString());
    expect(mn.events.listDead()[0]).toMatchObject({ id: "evt_x", merchant: "Recon Co", last_error: "HTTP 503" });
    expect(await mn.events.replayAny("evt_x")).toBe("skipped");           // no webhook address any more: nothing to send to
    expect(await mn.events.replayAny("nope")).toBeNull();
  });
});
