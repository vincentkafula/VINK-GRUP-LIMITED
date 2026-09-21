import { pool, hasDb } from "../db/pool.js";
import { postTransaction, recomputeBalance, type Currency } from "./ledgerService.js";
import { bankDb } from "../data/bankingStore.js";
import type { BankAccount } from "../types/banking.js";

/**
 * Stage 2 of plans/architecture/03-migration-plan.md: shadow writes.
 *
 * The in-memory store (server/src/data/bankingStore.ts) remains the
 * source of truth that bankAccounts.ts/bankPayments.ts read from and
 * return to clients -- nothing about the live API response changes in
 * this stage. This module's job is purely to mirror every new
 * transaction into the ledger tables from Phase 3 Stage 1, so that by
 * the time Stage 3 (cutover) happens, the ledger already has real data
 * to cut over to, not an empty schema.
 *
 * Everything here is best-effort and non-blocking by design: a failure
 * writing to the ledger must never break the in-memory operation that's
 * still the actual product behavior. Errors are logged loudly (this is
 * exactly what the observation period in Stage 2 exists to catch) but
 * swallowed rather than thrown back to the route handler.
 */

const SUSPENSE_ACCOUNT_NUMBER = "VNK-SUSPENSE-0001";

/** The platform suspense account: the standard double-entry accounting
 *  answer to "the other side of a one-sided operation" -- fees taken
 *  from a transfer, money leaving via an external rail (SWIFT/SEPA),
 *  or a driver instant payout being credited from outside the
 *  ledger's own accounts. Real banks use exactly this pattern rather
 *  than inventing a fake counterparty for every such case. Owned by
 *  the seeded treasury-role user, since treasury is who'd actually
 *  reconcile this account's balance against real-world fee income /
 *  external settlement in a production system. */
let suspenseAccountId: string | null = null;

async function getSuspenseAccountId(): Promise<string | null> {
  if (!hasDb || !pool) return null;
  if (suspenseAccountId) return suspenseAccountId;

  const existing = await pool.query(`SELECT id FROM accounts WHERE account_number = $1`, [SUSPENSE_ACCOUNT_NUMBER]);
  if (existing.rows.length > 0) {
    suspenseAccountId = existing.rows[0].id;
    return suspenseAccountId;
  }

  const treasuryUser = bankDb.users.find(u => u.role === "treasury");
  if (!treasuryUser) {
    console.error("[ledgerShadow] No treasury-role user in bankDb.users -- cannot create suspense account. Shadow writes involving fees/external transfers/payouts will be skipped until this is fixed.");
    return null;
  }

  // The treasury user themselves must exist as a users row in Postgres
  // for the FK on accounts.user_id -- ensured the same lazy way as any
  // other bank account below.
  const treasuryUserId = await ensureLedgerUser(treasuryUser.id, treasuryUser.email, `${treasuryUser.firstName} ${treasuryUser.lastName}`);
  if (!treasuryUserId) return null;

  const created = await pool.query(
    `INSERT INTO accounts (user_id, account_number, account_type, currency, status)
     VALUES ($1, $2, 'treasury', 'ZAR', 'active')
     ON CONFLICT (account_number) DO UPDATE SET account_number = EXCLUDED.account_number
     RETURNING id`,
    [treasuryUserId, SUSPENSE_ACCOUNT_NUMBER]
  );
  suspenseAccountId = created.rows[0].id;
  return suspenseAccountId;
}

/** In-memory bankDb.users ids are not real Postgres users rows -- the
 *  real `users` table (used by the marketplace/auth modules) is a
 *  separate population entirely, with its own required columns
 *  (username unique, name, email -- none of which bankDb.users
 *  guarantees the same shape for). Lazily creates a minimal row keyed
 *  by a derived, guaranteed-unique username, so the FK on
 *  accounts.user_id has something real to point at, without pretending
 *  this is a full identity migration (that's its own, separate piece
 *  of work, not bundled into the ledger shadow-write). */
const userIdCache = new Map<string, string>();

async function ensureLedgerUser(bankUserId: string, email: string, displayName: string): Promise<string | null> {
  if (!hasDb || !pool) return null;
  const cached = userIdCache.get(bankUserId);
  if (cached) return cached;

  // email has no unique constraint on this table, so it can't be the
  // ON CONFLICT target -- a derived username (which IS unique) is used
  // instead, and doubles as the idempotent key for repeated calls.
  const username = `ledger-shadow-${bankUserId}`;

  const existing = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (existing.rows.length > 0) {
    userIdCache.set(bankUserId, existing.rows[0].id);
    return existing.rows[0].id;
  }

  // password_hash is deliberately unusable -- this row can't actually
  // log in through it; real auth still goes through the existing users
  // population. It exists only to satisfy the FK on accounts.user_id.
  const created = await pool.query(
    `INSERT INTO users (username, password_hash, role, name, email) VALUES ($1, 'unusable-ledger-shadow-placeholder', 'customer', $2, $3)
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [username, displayName, email]
  );
  userIdCache.set(bankUserId, created.rows[0].id);
  return created.rows[0].id;
}

const accountIdCache = new Map<string, string>();

/** Read-only lookup by account number -- unlike ensureLedgerAccount,
 *  never creates anything. Used by the Stage 3 read cutover in
 *  bankAccounts.ts: if an account has never been shadow-written to (or
 *  backfilled), there's genuinely no ledger data for it yet, and the
 *  caller should fall back to the in-memory balance rather than get a
 *  freshly-created, misleadingly-zero ledger account. */
export async function findLedgerAccountId(accountNumber: string): Promise<string | null> {
  if (!hasDb || !pool) return null;
  const { rows } = await pool.query(`SELECT id FROM accounts WHERE account_number = $1`, [accountNumber]);
  return rows.length > 0 ? rows[0].id : null;
}

/** Lazily creates (or finds) the ledger `accounts` row corresponding to
 *  an in-memory BankAccount, keyed by account_number so repeated calls
 *  for the same account are idempotent. */
async function ensureLedgerAccount(acct: BankAccount): Promise<string | null> {
  if (!hasDb || !pool) return null;
  const cached = accountIdCache.get(acct.id);
  if (cached) return cached;

  const existing = await pool.query(`SELECT id FROM accounts WHERE account_number = $1`, [acct.accountNumber]);
  if (existing.rows.length > 0) {
    accountIdCache.set(acct.id, existing.rows[0].id);
    return existing.rows[0].id;
  }

  const bankUser = bankDb.users.find(u => u.id === acct.userId);
  if (!bankUser) {
    console.error(`[ledgerShadow] No bankDb user found for account ${acct.id} (userId ${acct.userId}) -- skipping shadow write for this account.`);
    return null;
  }
  const ledgerUserId = await ensureLedgerUser(bankUser.id, bankUser.email, `${bankUser.firstName} ${bankUser.lastName}`);
  if (!ledgerUserId) return null;

  const created = await pool.query(
    `INSERT INTO accounts (user_id, account_number, iban, account_type, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_number) DO UPDATE SET account_number = EXCLUDED.account_number
     RETURNING id`,
    [ledgerUserId, acct.accountNumber, acct.iban || null, acct.type, acct.currency, acct.status]
  );
  accountIdCache.set(acct.id, created.rows[0].id);
  return created.rows[0].id;
}

/** Mirrors bankPayments.ts's POST / (general transfer) into the ledger.
 *  Models the fee correctly as a real entry to the suspense account,
 *  not as money that silently disappears -- unlike the in-memory
 *  version, which debits the sender for amount+fee but only credits
 *  the recipient for amount, with no accounting for where the fee
 *  cents went. */
export async function shadowWriteTransfer(params: {
  fromAccount: BankAccount;
  toAccount: BankAccount | null;
  amount: number; // Rand, as the in-memory store uses -- converted to cents here, at the one boundary where the old and new representations meet
  fee: number;
  currency: Currency;
  reference: string;
}): Promise<void> {
  if (!hasDb || !pool) return;
  try {
    const fromId = await ensureLedgerAccount(params.fromAccount);
    if (!fromId) return;

    const amountCents = Math.round(params.amount * 100);
    const feeCents = Math.round(params.fee * 100);

    const entries: { accountId: string; amountCents: number; currency: Currency }[] = [];

    if (params.toAccount) {
      const toId = await ensureLedgerAccount(params.toAccount);
      if (!toId) return;
      entries.push({ accountId: fromId, amountCents: -(amountCents + feeCents), currency: params.currency });
      entries.push({ accountId: toId, amountCents, currency: params.currency });
      if (feeCents > 0) {
        const suspenseId = await getSuspenseAccountId();
        if (suspenseId) entries.push({ accountId: suspenseId, amountCents: feeCents, currency: params.currency });
        else return; // can't balance the transaction without it -- skip rather than post something wrong
      }
    } else {
      // External transfer (no toAccount -- money leaves the platform via
      // SWIFT/SEPA/etc.) -- the whole amount+fee is the "other side,"
      // absorbed by suspense until real processor settlement data
      // exists to post against instead.
      const suspenseId = await getSuspenseAccountId();
      if (!suspenseId) return;
      entries.push({ accountId: fromId, amountCents: -(amountCents + feeCents), currency: params.currency });
      entries.push({ accountId: suspenseId, amountCents: amountCents + feeCents, currency: params.currency });
    }

    await postTransaction({
      idempotencyKey: `shadow-transfer-${params.reference}`,
      transactionType: "p2p_transfer",
      entries,
      reference: params.reference,
    });
  } catch (err) {
    console.error("[ledgerShadow] Failed to shadow-write transfer (in-memory operation already succeeded and is unaffected):", err);
  }
}

/** Mirrors bankPayments.ts's POST /instant-payout. One-sided in the
 *  in-memory model (credits the driver, debits nothing) -- the
 *  suspense account is the honest double-entry answer until this is
 *  connected to the real AFC settlement source it represents (Stage 3
 *  onward, extending terminalRouter.ts per 03-migration-plan.md). */
export async function shadowWriteInstantPayout(params: {
  account: BankAccount;
  amount: number;
  reference: string;
}): Promise<void> {
  if (!hasDb || !pool) return;
  try {
    const acctId = await ensureLedgerAccount(params.account);
    const suspenseId = await getSuspenseAccountId();
    if (!acctId || !suspenseId) return;

    const amountCents = Math.round(params.amount * 100);
    await postTransaction({
      idempotencyKey: `shadow-payout-${params.reference}`,
      transactionType: "adjustment",
      entries: [
        { accountId: acctId, amountCents, currency: "ZAR" },
        { accountId: suspenseId, amountCents: -amountCents, currency: "ZAR" },
      ],
      reference: params.reference,
    });
  } catch (err) {
    console.error("[ledgerShadow] Failed to shadow-write instant payout (in-memory operation already succeeded and is unaffected):", err);
  }
}

/**
 * One-time backfill: seeds a ledger account + an opening-balance entry
 * for every in-memory bank account, so the ledger's balances match the
 * in-memory ones at the moment this runs, not from zero. Safe to run
 * more than once -- idempotent per account via a fixed idempotency key
 * derived from the account number, so a re-run just no-ops for accounts
 * already backfilled.
 */
export async function backfillLedgerFromInMemoryStore(): Promise<{ accountsBackfilled: number; skipped: number }> {
  if (!hasDb || !pool) return { accountsBackfilled: 0, skipped: 0 };
  const suspenseId = await getSuspenseAccountId();
  if (!suspenseId) return { accountsBackfilled: 0, skipped: bankDb.accounts.length };

  let backfilled = 0;
  let skipped = 0;
  for (const acct of bankDb.accounts) {
    const acctId = await ensureLedgerAccount(acct);
    if (!acctId) { skipped++; continue; }

    const openingCents = Math.round(acct.balance * 100);
    if (openingCents === 0) { backfilled++; continue; } // nothing to post for a zero-balance account

    try {
      await postTransaction({
        idempotencyKey: `backfill-opening-balance-${acct.accountNumber}`,
        transactionType: "adjustment",
        entries: [
          { accountId: acctId, amountCents: openingCents, currency: acct.currency as Currency },
          { accountId: suspenseId, amountCents: -openingCents, currency: acct.currency as Currency },
        ],
        reference: `Backfill opening balance for ${acct.accountNumber}`,
      });
      backfilled++;
    } catch (err) {
      console.error(`[ledgerShadow] Backfill failed for account ${acct.accountNumber}:`, err);
      skipped++;
    }
  }
  return { accountsBackfilled: backfilled, skipped };
}

/**
 * Reconciliation check: compares the in-memory balance (still the
 * authoritative source through Stage 2/3) against the ledger's own
 * recomputed balance (summed directly from ledger_entries, not the
 * account_balances cache) for every account that has a ledger
 * counterpart. This is the safety net the migration plan calls for --
 * proving the ledger tracks reality correctly BEFORE anything reads
 * from it. A non-empty mismatches array here means the shadow-write
 * logic has a bug and Stage 3 (cutover) must not proceed.
 */
export async function reconcileBalances(): Promise<{
  checked: number;
  mismatches: { accountNumber: string; inMemoryCents: number; ledgerCents: number; diffCents: number }[];
}> {
  if (!hasDb || !pool) return { checked: 0, mismatches: [] };
  const mismatches: { accountNumber: string; inMemoryCents: number; ledgerCents: number; diffCents: number }[] = [];
  let checked = 0;

  for (const acct of bankDb.accounts) {
    const acctId = accountIdCache.get(acct.id);
    if (!acctId) continue; // never shadow-written yet (e.g. no transactions posted for it) -- nothing to reconcile
    checked++;
    const inMemoryCents = Math.round(acct.balance * 100);
    const ledgerCents = await recomputeBalance(acctId);
    if (inMemoryCents !== ledgerCents) {
      mismatches.push({ accountNumber: acct.accountNumber, inMemoryCents, ledgerCents, diffCents: inMemoryCents - ledgerCents });
    }
  }
  return { checked, mismatches };
}
