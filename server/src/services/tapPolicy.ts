import type { Db } from "../portal/driverRoutes.js";
import { saDay, saDayStart } from "../portal/common.js";
import { calculateRevenueSplit, type RevenueSplit } from "./revenueSplitService.js";
import { countryForCurrency, type CountryCode, type CountryConfig } from "../config/countryConfig.js";
import { checkNoPin } from "../config/feeEngine.js";
import type { ConfigReader } from "../config/configService.js";

/**
 * What the platform decides about a tap BEFORE it is recorded, using the active profile of the country the tap belongs to (by currency):
 *   1. the no-PIN rule (per-tap limit, daily total per card, consecutive taps) for contactless taps without a PIN;
 *   2. the revenue split (the platform fee, the investor's share of that fee, the owner side's remainder);
 *   3. whether the tap is confirmed at once. Only in SANDBOX, only when the profile says so (afc.sandboxAutoConfirm): so the whole pipeline
 *      (settlement, trips, marshal fee, agreements) can be exercised. In live mode a tap stays "received" until a real authorisation confirms it.
 *
 * The card is identified by masked number + scheme. That is only the last four digits, so two cards can collide; the processor's card token
 * should replace it when the real issuing integration exists. The daily and consecutive checks are therefore best-effort and err on the side of
 * asking for a PIN.
 */
export interface TapInput { terminalId: string; maskedPan: string | null; scheme: string | null; amount: number; currency: string; cardholderVerification: string | null }
export interface TapDecision {
  country: CountryCode; profileVersion: number; config: CountryConfig;
  decline: { code: string; message: string } | null;
  split: RevenueSplit; status: "confirmed" | "received" | "declined";
}

export async function evaluateTap(db: Db | null, reader: ConfigReader, t: TapInput, now: Date = new Date(), paymentsMode: string = process.env.PAYMENTS_MODE ?? "sandbox"): Promise<TapDecision> {
  const country = countryForCurrency(t.currency);
  const active = await reader.active(country);
  const cfg = active.config;
  const split = calculateRevenueSplit(t.amount, cfg.afc);
  const amountCents = Math.round(t.amount * 100);

  if (t.cardholderVerification === "contactless_no_cvm") {
    let state = { todayNoPinCents: 0, consecutiveNoPin: 0 };
    if (db && t.maskedPan) {
      const since = saDayStart(saDay(now));
      const today = (await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM terminal_taps WHERE masked_pan = $1 AND COALESCE(scheme, '') = COALESCE($2, '') AND cardholder_verification = 'contactless_no_cvm'
            AND status IN ('received','processing','confirmed') AND received_at >= $3`, [t.maskedPan, t.scheme, since])).rows[0];
      const recent = (await db.query(
        `SELECT cardholder_verification AS cvm FROM terminal_taps WHERE masked_pan = $1 AND COALESCE(scheme, '') = COALESCE($2, '') AND status <> 'declined' ORDER BY received_at DESC LIMIT $3`,
        [t.maskedPan, t.scheme, cfg.afc.noPinConsecutiveTaps + 1])).rows;
      let run = 0; for (const r of recent) { if (r.cvm === "contactless_no_cvm") run++; else break; }
      state = { todayNoPinCents: Math.round(Number(today?.s ?? 0) * 100), consecutiveNoPin: run };
    }
    const verdict = checkNoPin(cfg.afc, amountCents, state);
    if (!verdict.ok) return { country, profileVersion: active.version, config: cfg, decline: { code: verdict.code, message: verdict.message }, split, status: "declined" };
  }

  const autoConfirm = cfg.mode === "sandbox" && cfg.afc.sandboxAutoConfirm && paymentsMode === "sandbox";
  return { country, profileVersion: active.version, config: cfg, decline: null, split, status: autoConfirm ? "confirmed" : "received" };
}
