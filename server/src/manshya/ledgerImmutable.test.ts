import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");
const { LEDGER_GUARDS } = require("./core/db");

const REFUSED = /The ledger cannot be edited: post a reversing journal instead/;
async function books(opts: any = {}) {
  const mn = createManshya(opts); const m = mn.services.createMerchant("Ledger Co"); const a = mn.services.createBankAccount(m.id, "Main", "current"), b = mn.services.createBankAccount(m.id, "Savings", "savings");
  mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -100_000 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 100_000 }])).immediate();
  const pay = await mn.services.createPayment(m, { amount: 50_000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "r1", customer: { name: "A", email: "a@b.co" } });
  await mn.services.refundPayment(m, pay.id, { amount: 5_000 }); await mn.services.transfer(m, { type: "own", fromAccountId: a.id, toAccountId: b.id, amount: 20_000 });
  return { mn, m, a, b, pay };
}

describe("the ledger is append-only", () => {
  it("refuses to change the amount of a posted entry, to delete one, or to move it to another journal or account", async () => {
    const { mn } = await books(); const e = mn.db.prepare("SELECT id, journal_id FROM entries LIMIT 1").get();
    for (const sql of ["UPDATE entries SET amount = amount + 1", "UPDATE entries SET account_id = 'sys:fees' WHERE id = " + e.id, "UPDATE entries SET journal_id = 'x' WHERE id = " + e.id, "DELETE FROM entries WHERE id = " + e.id, "DELETE FROM entries"]) expect(() => mn.db.exec(sql), sql).toThrow(REFUSED);
  });
  it("refuses to delete a journal, or to change what it says it is, its reference, its note or its date", async () => {
    const { mn } = await books();
    for (const sql of ["DELETE FROM journals", "UPDATE journals SET kind = 'deposit'", "UPDATE journals SET ref = 'other'", "UPDATE journals SET memo = 'edited'", "UPDATE journals SET created_at = '2001-01-01'", "UPDATE journals SET mode = 'live'"]) expect(() => mn.db.exec(sql), sql).toThrow(REFUSED);
  });
  it("changes nothing when it refuses: the books are exactly as they were and still balance", async () => {
    const { mn } = await books(); const before = mn.db.prepare("SELECT COUNT(*) n, SUM(amount) s, SUM(ABS(amount)) a FROM entries").get(); try { mn.db.exec("DELETE FROM entries"); } catch { /* refused */ }
    expect(mn.db.prepare("SELECT COUNT(*) n, SUM(amount) s, SUM(ABS(amount)) a FROM entries").get()).toEqual(before); expect(before.s).toBe(0); expect(mn.recon.run(new Date(), "t").ok).toBe(true);
  });
  it("still lets everything legitimate through: payments, refunds, transfers, reversals, and the mode tag every new journal receives", async () => {
    const { mn, m, a, pay } = await books(); expect(mn.db.prepare("SELECT COUNT(*) n FROM journals WHERE mode IS NULL").get().n).toBe(0);                    // the tagging trigger still works
    mn.db.transaction(() => { const id = mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -500 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 500 }]); mn.ledger.post("reversal", [{ account: "sys:external_in", kind: "system", amount: 500 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: -500 }], { ref: id }); }).immediate();
    expect(mn.db.prepare("SELECT mode FROM journals ORDER BY rowid DESC LIMIT 1").get().mode).toBe("sandbox"); expect(pay.id).toBeTruthy(); expect(mn.recon.run(new Date(), "t").ok).toBe(true);
  });
  it("has all four guards, and they are the ones named for lifting", async () => {
    const { mn } = await books(); const have = mn.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((r: any) => r.name);
    expect([...LEDGER_GUARDS].sort()).toEqual(["ledger_entries_no_delete", "ledger_entries_no_update", "ledger_journals_no_delete", "ledger_journals_no_update"]); for (const g of LEDGER_GUARDS) expect(have).toContain(g);
  });
  it("is still in force after the application restarts on the same database file, and protects a database that existed before the guards did", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-")), file = join(dir, "v.db");
    try {
      const first = await books({ dbPath: file }); first.mn.db.exec("DROP TRIGGER ledger_entries_no_update; DROP TRIGGER ledger_entries_no_delete; DROP TRIGGER ledger_journals_no_delete; DROP TRIGGER ledger_journals_no_update");     // an older database: no guards
      first.mn.db.exec("UPDATE entries SET amount = amount WHERE id = 1"); first.mn.db.close();
      const second = createManshya({ dbPath: file }); expect(() => second.db.exec("DELETE FROM entries"), "after restart").toThrow(REFUSED); expect(() => second.db.exec("UPDATE entries SET amount = 0"), "after restart").toThrow(REFUSED); second.db.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("can only be lifted deliberately, by name, which is what an audit of the database would show", async () => {
    const { mn } = await books(); expect(() => mn.db.exec("DELETE FROM entries")).toThrow(); mn.db.exec("DROP TRIGGER ledger_entries_no_update"); expect(() => mn.db.exec("UPDATE entries SET amount = amount")).not.toThrow(); expect(() => mn.db.exec("DELETE FROM entries")).toThrow();       // lifting one guard lifts only that one
  });
});
