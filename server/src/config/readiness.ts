import type { CountryConfig } from "./countryConfig.js";

/**
 * Is a country ready to go live? A checklist of everything that has to be filled in before real money moves, so details that arrive later (the bank,
 * the licence, the accounts) have an obvious place to be completed, and a profile cannot be switched to live while a blocking item is open.
 * Pure: the caller says what exists (pooled accounts, bank feed, rates, reserve).
 */
export interface ReadinessContext {
  pooledAccounts: { in_person: boolean; online: boolean };
  bankFeedConfigured: boolean;
  ratesFresh: boolean;
  reserveCents: number;
}
export interface ReadinessItem { id: string; label: string; ok: boolean; blocking: boolean; hint: string }
export interface Readiness { country: string; mode: "sandbox" | "live"; ready: boolean; blockers: number; items: ReadinessItem[] }

export function checkReadiness(cfg: CountryConfig, ctx: ReadinessContext): Readiness {
  const cur = cfg.currency.code, has = (txn: string) => cfg.fees.rules.some((r) => r.appliesTo.txn === txn);
  const items: ReadinessItem[] = [
    { id: "partner_bank", label: "Partner bank named", ok: !!cfg.partner.bank?.trim(), blocking: true, hint: "Set partner.bank in the profile." },
    { id: "partner_ref", label: "Account reference from the bank", ok: !!cfg.partner.accountRef?.trim(), blocking: true, hint: "Set partner.accountRef (the reference the bank gives you)." },
    { id: "licence", label: `${cfg.regulator.name} licence or approval reference`, ok: !!cfg.regulator.licenceRef?.trim(), blocking: true, hint: "Set regulator.licenceRef." },
    { id: "pooled_in_person", label: `In-person pooled ${cur} account`, ok: ctx.pooledAccounts.in_person, blocking: true, hint: "Add it under Pooled bank accounts." },
    { id: "pooled_online", label: `Online pooled ${cur} account`, ok: ctx.pooledAccounts.online, blocking: true, hint: "Add it under Pooled bank accounts." },
    { id: "fees", label: "Fees for tap, card, online and payout", ok: ["afc_tap", "card_pos", "card_online", "payout"].every(has), blocking: true, hint: "Every one of these needs a fee rule (a zero fee is a rule too)." },
    { id: "bank_credits", label: "A way to receive the bank's credits", ok: ctx.bankFeedConfigured, blocking: false, hint: "Not blocking: staff can import a bank statement file or record lines by hand. Set BANK_WEBHOOK_SECRET when the bank can send them automatically." },
  ];
  const open = cfg.corridors.filter((c) => c.enabled);
  if (open.length) items.push({ id: "fx", label: "Current exchange rates for the open cross-border routes", ok: ctx.ratesFresh, blocking: true, hint: "Rates are fetched hourly; refresh them under Exchange rates." });
  if (cfg.instantCredit.enabled) items.push({ id: "reserve", label: "Instant-credit reserve funded to its minimum", ok: ctx.reserveCents >= cfg.instantCredit.reserveCents && ctx.reserveCents > 0, blocking: true, hint: "Fund the reserve under Pooled bank accounts." });
  const blockers = items.filter((i) => i.blocking && !i.ok).length;
  return { country: cfg.country, mode: cfg.mode, ready: blockers === 0, blockers, items };
}
