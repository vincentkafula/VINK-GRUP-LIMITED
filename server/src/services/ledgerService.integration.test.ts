import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Integration tests -- require a real Postgres (DATABASE_URL set) since
// postTransaction() does real multi-statement transactions with row
// locking that can't be meaningfully faked with a mock. Skipped entirely
// when no DATABASE_URL is present (e.g. running `npm test` locally with
// no Postgres reachable) -- runs for real against docker-compose.yml's
// postgres service, and in CI via the postgres service container wired
// into .github/workflows/ci.yml's backend job.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("ledgerService (integration, requires DATABASE_URL)", () => {
  let pool: typeof import("../db/pool.js").pool;
  let ledger: typeof import("./ledgerService.js");
  let userId: string;
  let accountA: string;
  let accountB: string;

  beforeAll(async () => {
    const poolModule = await import("../db/pool.js");
    pool = poolModule.pool;
    ledger = await import("./ledgerService.js");

    const { migrateAndSeed } = await import("../db/migrate.js");
    await migrateAndSeed();

    if (!pool) throw new Error("DATABASE_URL is set but pool is null — check db/pool.ts");

    // Use an existing seeded user for the FK, and create two fresh test
    // accounts under it so this test file's data is easy to distinguish
    // from and doesn't collide with anything else in the seeded DB.
    const userRow = await pool.query(`SELECT id FROM users LIMIT 1`);
    userId = userRow.rows[0].id;

    const acctA = await pool.query(
      `INSERT INTO accounts (user_id, account_number, account_type, currency) VALUES ($1, $2, 'current', 'ZAR') RETURNING id`,
      [userId, `TEST-A-${Date.now()}`]
    );
    accountA = acctA.rows[0].id;
    const acctB = await pool.query(
      `INSERT INTO accounts (user_id, account_number, account_type, currency) VALUES ($1, $2, 'current', 'ZAR') RETURNING id`,
      [userId, `TEST-B-${Date.now()}`]
    );
    accountB = acctB.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    // Clean up in FK order: entries -> balances -> transactions -> accounts.
    await pool.query(`DELETE FROM ledger_entries WHERE account_id IN ($1, $2)`, [accountA, accountB]);
    await pool.query(`DELETE FROM account_balances WHERE account_id IN ($1, $2)`, [accountA, accountB]);
    await pool.query(`DELETE FROM accounts WHERE id IN ($1, $2)`, [accountA, accountB]);
    await pool.end();
  });

  it("posts a balanced transfer and updates both accounts' cached balances", async () => {
    const key = `test-transfer-${Date.now()}-${Math.random()}`;
    const txn = await ledger.postTransaction({
      idempotencyKey: key,
      transactionType: "p2p_transfer",
      entries: [
        { accountId: accountA, amountCents: -5000, currency: "ZAR" },
        { accountId: accountB, amountCents: 5000, currency: "ZAR" },
      ],
      reference: "vitest integration test",
    });

    expect(txn.entries).toHaveLength(2);
    expect(txn.status).toBe("posted");

    const balanceA = await ledger.getBalance(accountA);
    const balanceB = await ledger.getBalance(accountB);
    expect(balanceA?.balanceCents).toBe(-5000);
    expect(balanceB?.balanceCents).toBe(5000);

    // Ground truth check -- the whole point of the design: the cache
    // must always match a direct sum of ledger_entries.
    expect(await ledger.recomputeBalance(accountA)).toBe(balanceA?.balanceCents);
    expect(await ledger.recomputeBalance(accountB)).toBe(balanceB?.balanceCents);
  });

  it("is idempotent — replaying the same key returns the original result and posts nothing new", async () => {
    const key = `test-idempotent-${Date.now()}-${Math.random()}`;
    const input = {
      idempotencyKey: key,
      transactionType: "p2p_transfer" as const,
      entries: [
        { accountId: accountA, amountCents: -1000, currency: "ZAR" as const },
        { accountId: accountB, amountCents: 1000, currency: "ZAR" as const },
      ],
    };

    const first = await ledger.postTransaction(input);
    const balanceAfterFirst = await ledger.getBalance(accountA);

    const second = await ledger.postTransaction(input);
    const balanceAfterSecond = await ledger.getBalance(accountA);

    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    // Balance must be unchanged by the replay -- if this ever fails, it
    // means a retry double-processed money, which is the single worst
    // possible bug this whole module exists to prevent.
    expect(balanceAfterSecond?.balanceCents).toBe(balanceAfterFirst?.balanceCents);
  });

  it("rejects a reused idempotency key with different entries as a conflict, not a silent replay", async () => {
    const key = `test-conflict-${Date.now()}-${Math.random()}`;
    await ledger.postTransaction({
      idempotencyKey: key,
      transactionType: "p2p_transfer",
      entries: [
        { accountId: accountA, amountCents: -100, currency: "ZAR" },
        { accountId: accountB, amountCents: 100, currency: "ZAR" },
      ],
    });

    await expect(
      ledger.postTransaction({
        idempotencyKey: key, // same key
        transactionType: "p2p_transfer",
        entries: [
          { accountId: accountA, amountCents: -200, currency: "ZAR" }, // different amount
          { accountId: accountB, amountCents: 200, currency: "ZAR" },
        ],
      })
    ).rejects.toThrow(/reused key/);
  });

  it("paginates entry history newest-first via listEntries", async () => {
    const before = await ledger.getBalance(accountA);
    const seqBefore = before?.lastEntrySeq ?? 0;

    for (let i = 0; i < 3; i++) {
      await ledger.postTransaction({
        idempotencyKey: `test-page-${Date.now()}-${i}-${Math.random()}`,
        transactionType: "adjustment",
        entries: [
          { accountId: accountA, amountCents: 1, currency: "ZAR" },
          { accountId: accountB, amountCents: -1, currency: "ZAR" },
        ],
      });
    }

    const entries = await ledger.listEntries(accountA, { limit: 3 });
    expect(entries).toHaveLength(3);
    // Newest first -- sequence numbers should be strictly descending.
    expect(entries[0].sequenceNo).toBeGreaterThan(entries[1].sequenceNo);
    expect(entries[1].sequenceNo).toBeGreaterThan(entries[2].sequenceNo);
    expect(entries[0].sequenceNo).toBeGreaterThan(seqBefore);
  });

  it("handles two simultaneous first-ever transactions to a brand-new account without a primary-key error", async () => {
    if (!pool) throw new Error("unreachable: beforeAll would have thrown");
    // Regression test for the race fixed in postTransaction: two
    // transactions both reaching the "no balance row yet" branch at the
    // same time for an account that has never been posted to before.
    const freshAccount = await pool.query(
      `INSERT INTO accounts (user_id, account_number, account_type, currency) VALUES ($1, $2, 'current', 'ZAR') RETURNING id`,
      [userId, `TEST-RACE-${Date.now()}`]
    );
    const freshAccountId = freshAccount.rows[0].id;

    try {
      const [r1, r2] = await Promise.all([
        ledger.postTransaction({
          idempotencyKey: `race-1-${Date.now()}-${Math.random()}`,
          transactionType: "adjustment",
          entries: [
            { accountId: freshAccountId, amountCents: 100, currency: "ZAR" },
            { accountId: accountB, amountCents: -100, currency: "ZAR" },
          ],
        }),
        ledger.postTransaction({
          idempotencyKey: `race-2-${Date.now()}-${Math.random()}`,
          transactionType: "adjustment",
          entries: [
            { accountId: freshAccountId, amountCents: 200, currency: "ZAR" },
            { accountId: accountB, amountCents: -200, currency: "ZAR" },
          ],
        }),
      ]);

      // Both must succeed (neither should throw a primary-key violation),
      // and the final balance must reflect both -- not one silently lost.
      expect(r1.status).toBe("posted");
      expect(r2.status).toBe("posted");
      const finalBalance = await ledger.getBalance(freshAccountId);
      expect(finalBalance?.balanceCents).toBe(300);
      expect(await ledger.recomputeBalance(freshAccountId)).toBe(300);
    } finally {
      await pool.query(`DELETE FROM ledger_entries WHERE account_id = $1`, [freshAccountId]);
      await pool.query(`DELETE FROM account_balances WHERE account_id = $1`, [freshAccountId]);
      await pool.query(`DELETE FROM accounts WHERE id = $1`, [freshAccountId]);
    }
  });
});

// This suite runs for real -- both via `docker compose up` locally, and
// in CI (.github/workflows/ci.yml's backend job has a postgres service
// container and passes DATABASE_URL to `npm run test`). It only skips
// when neither of those is true, e.g. running `npm test` locally with
// no Postgres reachable.
