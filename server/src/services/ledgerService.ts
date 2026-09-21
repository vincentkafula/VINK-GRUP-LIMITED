import { pool, hasDb } from "../db/pool.js";
import type { PoolClient } from "pg";

/**
 * The Ledger Service — the ONLY module in this codebase permitted to
 * INSERT into ledger_entries. Every money movement, regardless of which
 * route or feature initiates it, goes through postTransaction() here.
 *
 * Design: plans/architecture/01-ledger-design.md
 * Component diagram: plans/architecture/02-c4-diagrams.md
 * Threat model: plans/architecture/05-threat-model.md (Tampering section)
 *
 * Enforcement today is at this layer (application code) only — the
 * REVOKE UPDATE, DELETE ON ledger_entries FROM <app_role> statement
 * documented in schema.sql is not yet wired into deploy, since it
 * requires the app to connect as a dedicated Postgres role rather than
 * the default superuser Railway provisions. TODO(verify): confirm
 * Railway's Postgres plugin supports creating additional roles before
 * committing to that as the enforcement mechanism, or evaluate row-level
 * security as an alternative. Until then, "one writer" is a code-review
 * / architecture rule, not yet a database-enforced guarantee.
 *
 * Phase 3, Stage 1 (additive) of the migration plan: nothing in the
 * running app calls this yet. It exists and is unit-tested in isolation
 * before anything depends on it being correct.
 */

export type Currency = "ZAR" | "USD" | "EUR" | "GBP" | "NGN" | "KES";
export type TransactionType = "p2p_transfer" | "card_payment" | "afc_settlement" | "fee" | "refund" | "adjustment";

export interface LedgerEntryInput {
  accountId: string;
  amountCents: number; // positive = credit, negative = debit
  currency: Currency;
}

export interface PostTransactionInput {
  idempotencyKey: string;
  transactionType: TransactionType;
  entries: LedgerEntryInput[];
  initiatedBy?: string;
  reference?: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  amountCents: number;
  currency: Currency;
  sequenceNo: number;
  createdAt: string;
}

export interface LedgerTransaction {
  id: string;
  transactionType: TransactionType;
  status: "posted" | "reversed";
  reference: string | null;
  entries: LedgerEntry[];
  createdAt: string;
  replayed?: boolean;
}

export class LedgerError extends Error {
  constructor(message: string, public code: "VALIDATION" | "IDEMPOTENCY_CONFLICT" | "NO_DB") {
    super(message);
    this.name = "LedgerError";
  }
}

/** Validates the double-entry invariant before anything touches the DB:
 *  at least 2 entries, and every currency present sums to exactly 0.
 *  This is deliberately checked in application code AND would be caught
 *  by any bug in the caller before a single query runs — cheap
 *  insurance against ever writing an unbalanced transaction. */
export function validateEntries(entries: LedgerEntryInput[]): void {
  if (entries.length < 2) {
    throw new LedgerError("A ledger transaction must have at least 2 entries (double-entry, not single-entry)", "VALIDATION");
  }
  const sumsByCurrency = new Map<Currency, number>();
  for (const e of entries) {
    if (!Number.isInteger(e.amountCents) || e.amountCents === 0) {
      throw new LedgerError(`amountCents must be a non-zero integer (got ${e.amountCents}) — minor units only, never a float`, "VALIDATION");
    }
    sumsByCurrency.set(e.currency, (sumsByCurrency.get(e.currency) ?? 0) + e.amountCents);
  }
  for (const [currency, sum] of sumsByCurrency) {
    if (sum !== 0) {
      throw new LedgerError(`Entries for ${currency} sum to ${sum}, must sum to exactly 0`, "VALIDATION");
    }
  }
}

/**
 * Posts a double-entry transaction. Idempotent: calling this again with
 * the same idempotencyKey returns the original result (marked
 * `replayed: true`) without writing anything new. Calling it again with
 * the same key but a DIFFERENT set of entries throws IDEMPOTENCY_CONFLICT
 * — that's a client bug (key reuse across genuinely different requests),
 * not a valid replay, and must not silently return the wrong transaction.
 */
export async function postTransaction(input: PostTransactionInput): Promise<LedgerTransaction> {
  if (!hasDb || !pool) throw new LedgerError("Database not configured", "NO_DB");
  validateEntries(input.entries);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency check happens inside the transaction (not before it)
    // so a concurrent duplicate request can't slip through between the
    // check and the insert — the unique index on ledger_transactions
    // .idempotency_key is the actual guarantee; this check is the fast
    // path that avoids a wasted round-trip for the common case.
    const existingTxn = await client.query(
      `SELECT id FROM ledger_transactions WHERE idempotency_key = $1`,
      [input.idempotencyKey]
    );
    if (existingTxn.rows.length > 0) {
      const existingId = existingTxn.rows[0].id as string;
      const existingEntries = await client.query(
        `SELECT te.amount_cents, te.currency, te.account_id FROM ledger_entries te WHERE te.transaction_id = $1 ORDER BY te.sequence_no`,
        [existingId]
      );
      const sameShape =
        existingEntries.rows.length === input.entries.length &&
        input.entries.every(e =>
          existingEntries.rows.some(r =>
            r.account_id === e.accountId && Number(r.amount_cents) === e.amountCents && r.currency === e.currency
          )
        );
      if (!sameShape) {
        await client.query("ROLLBACK");
        throw new LedgerError(
          `Idempotency key ${input.idempotencyKey} was already used for a transaction with different entries — reused key, not a valid replay`,
          "IDEMPOTENCY_CONFLICT"
        );
      }
      const full = await fetchTransaction(client, existingId);
      await client.query("COMMIT");
      return { ...full, replayed: true };
    }

    const txnResult = await client.query(
      `INSERT INTO ledger_transactions (idempotency_key, transaction_type, status, initiated_by, reference, posted_at)
       VALUES ($1, $2, 'posted', $3, $4, now()) RETURNING id, created_at`,
      [input.idempotencyKey, input.transactionType, input.initiatedBy ?? null, input.reference ?? null]
    );
    const transactionId = txnResult.rows[0].id as string;

    for (const entry of input.entries) {
      // sequence_no is per-account monotonic — SELECT ... FOR UPDATE on
      // account_balances both locks the row against concurrent posts to
      // the same account (preventing a lost-update race on the cache)
      // and gives us the next sequence number in the same round-trip.
      let balanceRow = await client.query(
        `SELECT balance_cents, last_entry_seq FROM account_balances WHERE account_id = $1 FOR UPDATE`,
        [entry.accountId]
      );
      if (balanceRow.rows.length === 0) {
        // First entry ever for this account. ON CONFLICT DO NOTHING
        // handles the race where two transactions post to the same
        // brand-new account simultaneously — both reach here with 0
        // rows found (neither sees the other's uncommitted insert),
        // both attempt the insert, one wins, the other's insert
        // no-ops instead of failing on the primary-key constraint. The
        // re-SELECT ... FOR UPDATE afterward is what actually
        // serializes them: the loser blocks on the winner's row lock,
        // then reads the winner's real last_entry_seq once it commits.
        await client.query(
          `INSERT INTO account_balances (account_id, balance_cents, available_cents, pending_cents, last_entry_seq) VALUES ($1, 0, 0, 0, 0)
           ON CONFLICT (account_id) DO NOTHING`,
          [entry.accountId]
        );
        balanceRow = await client.query(
          `SELECT balance_cents, last_entry_seq FROM account_balances WHERE account_id = $1 FOR UPDATE`,
          [entry.accountId]
        );
      }
      const nextSeq = ((balanceRow.rows[0]?.last_entry_seq as number) ?? 0) + 1;

      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, amount_cents, currency, sequence_no)
         VALUES ($1, $2, $3, $4, $5)`,
        [transactionId, entry.accountId, entry.amountCents, entry.currency, nextSeq]
      );

      await client.query(
        `UPDATE account_balances
         SET balance_cents = balance_cents + $1, available_cents = available_cents + $1,
             last_entry_at = now(), last_entry_seq = $2
         WHERE account_id = $3`,
        [entry.amountCents, nextSeq, entry.accountId]
      );
    }

    await client.query(
      `INSERT INTO idempotency_keys (key, scope, resulted_in_transaction_id) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [input.idempotencyKey, input.transactionType, transactionId]
    );

    const full = await fetchTransaction(client, transactionId);
    await client.query("COMMIT");
    return full;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function fetchTransaction(client: PoolClient, transactionId: string): Promise<LedgerTransaction> {
  const txn = await client.query(
    `SELECT id, transaction_type, status, reference, created_at FROM ledger_transactions WHERE id = $1`,
    [transactionId]
  );
  const entries = await client.query(
    `SELECT id, transaction_id, account_id, amount_cents, currency, sequence_no, created_at
     FROM ledger_entries WHERE transaction_id = $1 ORDER BY sequence_no`,
    [transactionId]
  );
  const t = txn.rows[0];
  return {
    id: t.id,
    transactionType: t.transaction_type,
    status: t.status,
    reference: t.reference,
    createdAt: t.created_at,
    entries: entries.rows.map(e => ({
      id: e.id,
      transactionId: e.transaction_id,
      accountId: e.account_id,
      amountCents: Number(e.amount_cents),
      currency: e.currency,
      sequenceNo: Number(e.sequence_no),
      createdAt: e.created_at,
    })),
  };
}

/** Reads the cached balance — the fast path for dashboards. This is a
 *  derived value, not the source of truth; see recomputeBalance() for
 *  the recovery path if it's ever suspected to have drifted. */
export async function getBalance(accountId: string): Promise<{ balanceCents: number; availableCents: number; pendingCents: number; lastEntrySeq: number } | null> {
  if (!hasDb || !pool) throw new LedgerError("Database not configured", "NO_DB");
  const { rows } = await pool.query(
    `SELECT balance_cents, available_cents, pending_cents, last_entry_seq FROM account_balances WHERE account_id = $1`,
    [accountId]
  );
  if (rows.length === 0) return null;
  return {
    balanceCents: Number(rows[0].balance_cents),
    availableCents: Number(rows[0].available_cents),
    pendingCents: Number(rows[0].pending_cents),
    lastEntrySeq: Number(rows[0].last_entry_seq),
  };
}

/** Recomputes a balance directly from ledger_entries, bypassing the
 *  cache entirely — the reconciliation/recovery path described in
 *  01-ledger-design.md and the migration plan's Stage 2 reconciliation
 *  job. Source of truth, always correct, deliberately not the fast path
 *  (a full SUM scan per call doesn't belong on a dashboard's hot path). */
export async function recomputeBalance(accountId: string): Promise<number> {
  if (!hasDb || !pool) throw new LedgerError("Database not configured", "NO_DB");
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger_entries WHERE account_id = $1`,
    [accountId]
  );
  return Number(rows[0].total);
}

/** Paginated entry history for one account, newest first. `before` is a
 *  sequence_no cursor, matching the OpenAPI contract. */
export async function listEntries(accountId: string, opts: { limit?: number; before?: number } = {}): Promise<LedgerEntry[]> {
  if (!hasDb || !pool) throw new LedgerError("Database not configured", "NO_DB");
  const limit = Math.min(opts.limit ?? 50, 200);
  const params: unknown[] = [accountId];
  let cursorClause = "";
  if (opts.before !== undefined) {
    params.push(opts.before);
    cursorClause = `AND sequence_no < $${params.length}`;
  }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, transaction_id, account_id, amount_cents, currency, sequence_no, created_at
     FROM ledger_entries WHERE account_id = $1 ${cursorClause}
     ORDER BY sequence_no DESC LIMIT $${params.length}`,
    params
  );
  return rows.map(e => ({
    id: e.id,
    transactionId: e.transaction_id,
    accountId: e.account_id,
    amountCents: Number(e.amount_cents),
    currency: e.currency,
    sequenceNo: Number(e.sequence_no),
    createdAt: e.created_at,
  }));
}
