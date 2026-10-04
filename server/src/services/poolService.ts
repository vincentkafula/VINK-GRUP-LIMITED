import { randomInt } from "node:crypto";
import type { Db } from "../portal/driverRoutes.js";
import { isUniqueViolation } from "../portal/common.js";
import { systemAccounts, type Engine, type LedgerPort } from "./moneyEngine.js";
import type { ConfigReader } from "../config/configService.js";
import { countryForCurrency, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit } from "../config/riskRules.js";

/**
 * Virtual accounts on a pooled bank account.
 *
 * The bank holds ONE real account per channel (in-person, online) that the platform already has. Each user gets a payment reference per currency and
 * pool. A customer pays into the pooled account quoting that reference; when the bank's credit is recorded here it is matched to the user and credited to
 * their platform account. The bank's own reference for the credit (`bankRef`) makes it exactly-once: recording the same line twice does nothing.
 * A credit whose reference matches nobody (or whose owner has no verified account) is kept as "unmatched" for a person to resolve; nothing is guessed.
 */
export type Pool = "in_person" | "online";
export const POOLS: Pool[] = ["in_person", "online"];
export const POOL_LABEL: Record<Pool, string> = { in_person: "In-Person Payment", online: "Online Payment" };
const CUR_CHAR: Record<string, string> = { ZAR: "R", ZMW: "K" };

const luhnDigit = (digits: string) => {
  let sum = 0;
  for (let i = digits.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) { let d = Number(digits[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return String((10 - (sum % 10)) % 10);
};
/** VK + R (rand) or K (kwacha) + 8 random digits + a check digit, so a mistyped reference is caught before it can match another user. */
export function newReference(currency: string): string {
  const body = Array.from({ length: 8 }, () => String(randomInt(0, 10))).join("");
  return `VK${CUR_CHAR[currency] ?? "X"}${body}${luhnDigit(body)}`;
}
export const normaliseReference = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function referenceLooksValid(ref: string): boolean {
  const m = /^VK([RK])(\d{8})(\d)$/.exec(normaliseReference(ref));
  return !!m && luhnDigit(m[2]) === m[3];
}

export interface VirtualAccount { id: string; currency: string; pool: Pool; reference: string; status: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> };

export async function ensureVirtualAccount(database: Db, userId: string, currency: string, pool: Pool): Promise<VirtualAccount> {
  const db = database as unknown as Loose;
  const find = async () => (await db.query(`SELECT id, currency, pool, reference, status FROM virtual_accounts WHERE user_id = $1 AND currency = $2 AND pool = $3`, [userId, currency, pool])).rows[0] as VirtualAccount | undefined;
  const have = await find(); if (have) return have;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await db.query(`INSERT INTO virtual_accounts (user_id, currency, pool, reference) VALUES ($1,$2,$3,$4)`, [userId, currency, pool, newReference(currency)]); break; }
    catch (e) { if (!isUniqueViolation(e)) throw e; if (await find()) break; }              // the same user raced us, or the reference collided: look again, or try a new reference
  }
  const made = await find(); if (!made) throw new Error("Could not create a virtual account");
  return made;
}

export type CreditResult = { status: "credited" | "unmatched" | "duplicate"; creditId: string; reason?: string; userId?: string };

export interface PoolDeps { db: Db; ledger: LedgerPort; engine: Pick<Engine, "partyOf">; reader: ConfigReader; now?: () => Date }

/** Records a credit the bank reported on the pooled account. Safe to call again with the same bankRef. */
export async function recordPoolCredit(d: PoolDeps, c: { bankRef: string; reference: string; amountCents: number; currency: string; by: string | null }): Promise<CreditResult> {
  const db = d.db as unknown as Loose, { ledger } = d;
  if (!/^[A-Za-z0-9._\-/]{4,64}$/.test(c.bankRef)) throw new Error("The bank's reference must be 4 to 64 letters, numbers or . _ - /");
  if (!Number.isInteger(c.amountCents) || c.amountCents <= 0 || c.amountCents > 100_000_000_000) throw new Error("The amount must be a whole number of cents above zero");
  if (!(c.currency in CUR_CHAR)) throw new Error("The currency must be ZAR or ZMW");
  const existing = (await db.query(`SELECT id, status, reason, user_id FROM pool_credits WHERE bank_ref = $1`, [c.bankRef])).rows[0];
  if (existing) return { status: existing.status === "credited" ? "duplicate" : "unmatched", creditId: existing.id, reason: existing.reason ?? undefined };
  let id: string;
  try {
    id = (await db.query(`INSERT INTO pool_credits (bank_ref, reference, amount_cents, currency, status, recorded_by) VALUES ($1,$2,$3,$4,'unmatched',$5) RETURNING id`, [c.bankRef, normaliseReference(c.reference), c.amountCents, c.currency, c.by])).rows[0].id;
  } catch (e) { if (isUniqueViolation(e)) return recordPoolCredit(d, c); throw e; }          // a concurrent call recorded it: answer from that record
  return settleCredit(d, String(id), c.by);
}

/** Tries to credit a stored (unmatched) line. Used for a new line and when staff re-match an old one. */
export async function settleCredit(d: PoolDeps, creditId: string, by: string | null): Promise<CreditResult> {
  const db = d.db as unknown as Loose, { ledger } = d;
  const c = (await db.query(`SELECT * FROM pool_credits WHERE id = $1`, [creditId])).rows[0];
  if (!c) throw new Error("No such credit");
  if (c.status === "credited") return { status: "duplicate", creditId };
  const hold = async (reason: string): Promise<CreditResult> => { await db.query(`UPDATE pool_credits SET reason = $2 WHERE id = $1`, [creditId, reason]); return { status: "unmatched", creditId, reason }; };
  const currency = String(c.currency), amount = Number(c.amount_cents);
  if (!referenceLooksValid(c.reference)) return hold("The reference is not a valid platform reference (mistyped or missing).");
  const va = (await db.query(`SELECT user_id, currency, status FROM virtual_accounts WHERE reference = $1`, [c.reference])).rows[0];
  if (!va) return hold("No account has this reference.");
  if (va.status !== "active") return hold("The account with this reference is closed.");
  if (va.currency !== currency) return hold(`The reference belongs to a ${va.currency} account but the credit is in ${currency}.`);
  const party = await d.engine.partyOf(va.user_id, currency);
  if (!party) return hold("The account holder has no verified linked account yet.");
  const cfg = (await d.reader.active(countryForCurrency(currency))).config;
  if (cfg.limits.enforce) {
    const tier: KycTier = "standard";
    const usedToday = Number((await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM pool_credits WHERE user_id = $1 AND status = 'credited' AND credited_at >= $2`, [va.user_id, new Date((d.now?.() ?? new Date()).getTime() - 24 * 3600_000)])).rows[0].s);
    const v = checkTierLimit(cfg, tier, { channel: "transfer_in", amountCents: amount, usedTodayCents: usedToday, balanceCents: d.ledger.balance(party.account) });
    if (!v.ok) return hold(v.message);
  }
  const res = ledger.post(`pool:${c.bank_ref}`, "pool_credit", [
    { account: systemAccounts(currency).externalIn, kind: "system", amount: -amount }, { account: party.account, merchant: party.userId, kind: "bank", amount },
  ], `Bank credit ${c.bank_ref} (${c.reference})`);
  if (res === "insufficient") return hold("The ledger refused the posting.");
  await db.query(`UPDATE pool_credits SET status = 'credited', user_id = $2, reason = NULL, credited_at = now(), recorded_by = COALESCE(recorded_by, $3) WHERE id = $1`, [creditId, va.user_id, by]);
  return { status: "credited", creditId, userId: va.user_id };
}
