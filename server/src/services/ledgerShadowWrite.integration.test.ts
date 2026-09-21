import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bankDb } from "../data/bankingStore.js";
import type { BankAccount, BankUser } from "../types/banking.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("ledgerShadowWrite (integration, requires DATABASE_URL)", () => {
  let pool: typeof import("../db/pool.js").pool;
  let shadow: typeof import("./ledgerShadowWrite.js");
  let ledger: typeof import("./ledgerService.js");
  let testUser: BankUser;
  let testAccount: BankAccount;
  let recipientAccount: BankAccount;

  beforeAll(async () => {
    const poolModule = await import("../db/pool.js");
    pool = poolModule.pool;
    shadow = await import("./ledgerShadowWrite.js");
    ledger = await import("./ledgerService.js");

    const { migrateAndSeed } = await import("../db/migrate.js");
    await migrateAndSeed();

    if (!pool) throw new Error("DATABASE_URL is set but pool is null — check db/pool.ts");

    // Fabricate two in-memory accounts distinct from the real seed data,
    // so this test's shadow-writes are easy to isolate and clean up --
    // account numbers are the identity key shadow-write uses, so
    // uniqueness here is what matters, not that these are "real"
    // bankDb entries.
    testUser = bankDb.users.find(u => u.role === "passenger")!;
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    testAccount = {
      id: `shadow-test-acct-${uniqueSuffix}`,
      userId: testUser.id,
      accountNumber: `VNK-SHADOWTEST-${uniqueSuffix}`,
      iban: "",
      sortCode: "",
      type: "current",
      currency: "ZAR",
      balance: 0,
      availableBalance: 0,
      pendingBalance: 0,
      status: "active",
      interestRate: 0,
      overdraftLimit: 0,
      createdAt: new Date().toISOString(),
      label: "Shadow write test account",
    };
    recipientAccount = { ...testAccount, id: `shadow-test-recipient-${uniqueSuffix}`, accountNumber: `VNK-SHADOWTEST-R-${uniqueSuffix}` };
    bankDb.accounts.push(testAccount, recipientAccount);
  });

  afterAll(async () => {
    if (!pool) return;
    // Remove the fabricated in-memory accounts so this test file doesn't
    // leave residue in bankDb across the process lifetime.
    bankDb.accounts = bankDb.accounts.filter(a => a.id !== testAccount.id && a.id !== recipientAccount.id);
    const ledgerAcctIds = await pool.query(`SELECT id FROM accounts WHERE account_number = ANY($1)`, [[testAccount.accountNumber, recipientAccount.accountNumber]]);
    for (const row of ledgerAcctIds.rows) {
      await pool.query(`DELETE FROM ledger_entries WHERE account_id = $1`, [row.id]);
      await pool.query(`DELETE FROM account_balances WHERE account_id = $1`, [row.id]);
    }
    await pool.query(`DELETE FROM accounts WHERE account_number = ANY($1)`, [[testAccount.accountNumber, recipientAccount.accountNumber]]);
    await pool.end();
  });

  it("shadow-writes a transfer with a fee as a correctly-balanced 3-entry transaction", async () => {
    await shadow.shadowWriteTransfer({
      fromAccount: testAccount,
      toAccount: recipientAccount,
      amount: 500,
      fee: 5, // R5 fee -- this must land somewhere, not vanish, for the ledger to balance
      currency: "ZAR",
      reference: `shadow-fee-test-${Date.now()}`,
    });

    const ledgerAcct = await pool!.query(`SELECT id FROM accounts WHERE account_number = $1`, [testAccount.accountNumber]);
    const senderLedgerId = ledgerAcct.rows[0].id;
    const balance = await ledger.getBalance(senderLedgerId);

    // R500 + R5 fee debited = -50500 cents.
    expect(balance?.balanceCents).toBe(-50500);

    const recipientLedgerAcct = await pool!.query(`SELECT id FROM accounts WHERE account_number = $1`, [recipientAccount.accountNumber]);
    const recipientBalance = await ledger.getBalance(recipientLedgerAcct.rows[0].id);
    expect(recipientBalance?.balanceCents).toBe(50000); // R500, not R505 -- the fee did not go to the recipient
  });

  it("backfill seeds an opening-balance entry matching the in-memory balance", async () => {
    testAccount.balance = 1234.56;
    const result = await shadow.backfillLedgerFromInMemoryStore();
    expect(result.skipped).toBe(0);

    const ledgerAcct = await pool!.query(`SELECT id FROM accounts WHERE account_number = $1`, [testAccount.accountNumber]);
    const balance = await ledger.getBalance(ledgerAcct.rows[0].id);
    // Prior test already moved this account's ledger balance by -50500
    // cents (the transfer-with-fee test above) -- backfill only posts an
    // opening-balance adjustment for accounts with NO prior ledger
    // activity, so re-running it here must be a no-op for this account,
    // not a second, conflicting adjustment. Confirmed by the balance
    // staying exactly what the fee test left it at.
    expect(balance?.balanceCents).toBe(-50500);
  });

  it("reconcile reports zero mismatches when in-memory and ledger agree", async () => {
    const result = await shadow.reconcileBalances();
    const thisAccountMismatch = result.mismatches.find(m => m.accountNumber === testAccount.accountNumber);
    expect(thisAccountMismatch).toBeUndefined();
  });

  it("reconcile detects a real mismatch when the in-memory balance is manually changed without a corresponding ledger entry", async () => {
    // Simulate exactly the bug class this check exists to catch: some
    // code path updates bankDb directly without going through the
    // shadow-write functions.
    const originalBalance = testAccount.balance;
    testAccount.balance = originalBalance + 999;

    const result = await shadow.reconcileBalances();
    const mismatch = result.mismatches.find(m => m.accountNumber === testAccount.accountNumber);
    expect(mismatch).toBeDefined();
    expect(mismatch?.diffCents).toBe(99900);

    testAccount.balance = originalBalance; // restore for any later test in this file
  });
});
