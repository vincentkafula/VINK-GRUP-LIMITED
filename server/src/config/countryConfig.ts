/**
 * Country configuration: one versioned, approval-gated profile per country (South Africa, Zambia). Everything that differs between
 * countries lives here; code reads it and never hard-codes a rate, limit, currency or partner (see docs/payments/ZA_ZM_CONFIGURATION_GUIDE.md).
 *
 * All money values are integers in minor units (cents, ngwee), and their names end in `Cents`, so a unit mistake cannot hide.
 */

export type CountryCode = "ZA" | "ZM";
export const COUNTRIES: readonly CountryCode[] = ["ZA", "ZM"];
export type KycTier = "basic" | "standard" | "full" | "business";
export const KYC_TIERS: readonly KycTier[] = ["basic", "standard", "full", "business"];

export interface FeeRule {
  id: string;
  /** What the rule applies to. A missing key (or "*") matches anything. */
  appliesTo: { txn: string; payerType?: string; payeeType?: string; rail?: string; tier?: KycTier | "*" };
  calc:
    | { type: "flat"; amountCents: number }
    | { type: "percent_plus_flat"; pct: number; flatCents: number }
    | { type: "tiered"; tiers: { upToCents: number | null; flatCents: number }[] };
  minCents?: number | null; maxCents?: number | null;
  /** Who bears the fee. */
  payer?: "payer" | "payee" | "platform";
  waive?: boolean;
}

export interface CountryConfig {
  country: CountryCode;
  currency: { code: string; minorUnits: number };
  timezone: string;
  mode: "sandbox" | "live";
  partner: { bank: string | null; accountRef: string | null; integration: string | null };
  regulator: { name: string; licenceRef: string | null };
  /** AFC (taxi tap-to-pay) behaviour. */
  afc: {
    platformFee: { flatCents: number; deviceShareCents: number; cardShareCents: number };
    /** Share of the platform's own fee that goes to the terminal's investor (0.10 = 10%). Not a share of the fare. */
    investorPctOfFee: number;
    /** A tap without a PIN must be BELOW this amount. */
    noPinBelowCents: number;
    noPinDailyCumulativeCents: number;
    noPinConsecutiveTaps: number;
    /** In sandbox, a received tap is confirmed automatically so the whole pipeline can be exercised. Never applies in live mode. */
    sandboxAutoConfirm: boolean;
  };
  trip: { tapsPerTrip: number; partialTrip: "carry_over" };
  marshalFee: { amountCents: number; payer: "driver"; payee: "marshal"; noMarshalLogged: "accrue_to_association" };
  payouts: { cutoff: string; minPayoutCents: number; salaryRetryDays: number; retryMinutes: number[] };
  limits: {
    tiers: Record<KycTier, { balanceCents: number; dailyInCents: number; dailyOutCents: number }>;
    atmDailyCents: Record<"basic" | "standard" | "full", number>;
    posDailyCents: Record<"basic" | "standard" | "full", number>;
    onlineDailyCents: Record<"basic" | "standard" | "full", number>;
    /** When true the platform refuses payments above these limits. Off keeps today's behaviour (the Banking module's own flat limits only). */
    enforce?: boolean;
  };
  fees: { scheduleId: string; rules: FeeRule[] };
  instantCredit: { enabled: boolean; reserveCents: number; reserveRatioMax: number; perDepositCents: Record<"basic" | "standard" | "full", number> };
  corridors: { id: string; from: CountryCode; to: CountryCode; enabled: boolean; perTransactionCents: number; perDayCents: number; perMonthCents: number; fxMarginPct: number; feeFlatCents: number; quoteTtlSeconds: number }[];
  data: { residency: CountryCode; retentionYears: number };
}

const rands = (n: number) => Math.round(n * 100);

const TIER_LIMITS = (k: number): CountryConfig["limits"] => ({
  tiers: {
    basic: { balanceCents: rands(1500 * k), dailyInCents: rands(1500 * k), dailyOutCents: rands(1000 * k) },
    standard: { balanceCents: rands(10000 * k), dailyInCents: rands(10000 * k), dailyOutCents: rands(5000 * k) },
    full: { balanceCents: rands(50000 * k), dailyInCents: rands(50000 * k), dailyOutCents: rands(25000 * k) },
    business: { balanceCents: rands(250000 * k), dailyInCents: rands(250000 * k), dailyOutCents: rands(100000 * k) },
  },
  atmDailyCents: { basic: rands(1000 * k), standard: rands(3000 * k), full: rands(10000 * k) },
  posDailyCents: { basic: rands(2000 * k), standard: rands(10000 * k), full: rands(30000 * k) },
  onlineDailyCents: { basic: rands(1000 * k), standard: rands(5000 * k), full: rands(20000 * k) },
});

/** The current behaviour of the platform, expressed as configuration. This is the baseline South Africa profile (version 1). */
export const DEFAULT_ZA: CountryConfig = {
  country: "ZA", currency: { code: "ZAR", minorUnits: 2 }, timezone: "Africa/Johannesburg", mode: "sandbox",
  partner: { bank: "Bank Zero", accountRef: null, integration: null }, regulator: { name: "SARB / PASA", licenceRef: null },
  afc: {
    platformFee: { flatCents: 100, deviceShareCents: 50, cardShareCents: 50 }, investorPctOfFee: 0.1,
    noPinBelowCents: 4000, noPinDailyCumulativeCents: 12000, noPinConsecutiveTaps: 5, sandboxAutoConfirm: true,
  },
  trip: { tapsPerTrip: 16, partialTrip: "carry_over" },
  marshalFee: { amountCents: 2000, payer: "driver", payee: "marshal", noMarshalLogged: "accrue_to_association" },
  payouts: { cutoff: "17:00", minPayoutCents: 5000, salaryRetryDays: 3, retryMinutes: [1, 5, 30, 120] },
  limits: TIER_LIMITS(1),
  fees: {
    scheduleId: "ZA-2026-01",
    rules: [
      { id: "afc_tap", appliesTo: { txn: "afc_tap" }, calc: { type: "flat", amountCents: 100 }, minCents: 100, maxCents: 100 },
      { id: "pos_card", appliesTo: { txn: "card_pos" }, calc: { type: "percent_plus_flat", pct: 0.025, flatCents: 0 } },
      { id: "online_card", appliesTo: { txn: "card_online" }, calc: { type: "percent_plus_flat", pct: 0.029, flatCents: 100 } },
      { id: "atm", appliesTo: { txn: "atm" }, calc: { type: "flat", amountCents: 1000 } },
      { id: "transfer_out", appliesTo: { txn: "transfer_out" }, calc: { type: "tiered", tiers: [{ upToCents: 50000, flatCents: 500 }, { upToCents: null, flatCents: 850 }] } },
      { id: "payout", appliesTo: { txn: "payout" }, calc: { type: "flat", amountCents: 850 } },
      { id: "deposit", appliesTo: { txn: "deposit" }, calc: { type: "flat", amountCents: 0 } },
    ],
  },
  instantCredit: { enabled: false, reserveCents: 0, reserveRatioMax: 3, perDepositCents: { basic: 50000, standard: 300000, full: 2000000 } },
  corridors: [{ id: "ZA-ZM", from: "ZA", to: "ZM", enabled: false, perTransactionCents: 500000, perDayCents: 1000000, perMonthCents: 3000000, fxMarginPct: 0.01, feeFlatCents: 5000, quoteTtlSeconds: 60 }],
  data: { residency: "ZA", retentionYears: 5 },
};

/** A first Zambia profile (illustrative values, marked draft). Amounts are in ngwee. */
export const DEFAULT_ZM: CountryConfig = {
  ...DEFAULT_ZA, country: "ZM", currency: { code: "ZMW", minorUnits: 2 }, timezone: "Africa/Lusaka",
  partner: { bank: "Absa Bank Zambia", accountRef: null, integration: null }, regulator: { name: "Bank of Zambia", licenceRef: null },
  afc: { platformFee: { flatCents: 100, deviceShareCents: 50, cardShareCents: 50 }, investorPctOfFee: 0.1, noPinBelowCents: 5000, noPinDailyCumulativeCents: 15000, noPinConsecutiveTaps: 5, sandboxAutoConfirm: true },
  marshalFee: { amountCents: 2000, payer: "driver", payee: "marshal", noMarshalLogged: "accrue_to_association" },
  fees: { scheduleId: "ZM-2026-01", rules: DEFAULT_ZA.fees.rules },
  corridors: [{ id: "ZM-ZA", from: "ZM", to: "ZA", enabled: false, perTransactionCents: 500000, perDayCents: 1000000, perMonthCents: 3000000, fxMarginPct: 0.01, feeFlatCents: 5000, quoteTtlSeconds: 60 }],
  data: { residency: "ZM", retentionYears: 5 },
};

/* ───────────────────────── validation ───────────────────────── */
const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Returns every problem found, as readable messages with the path of the setting. An empty list means the profile is valid. */
export function validateConfig(input: unknown, country?: CountryCode): string[] {
  const e: string[] = [];
  if (!isObj(input)) return ["The configuration must be an object."];
  const c = input as Record<string, any>;
  const need = (ok: boolean, msg: string) => { if (!ok) e.push(msg); };

  need(c.country === "ZA" || c.country === "ZM", "country must be ZA or ZM.");
  if (country) need(c.country === country, `country must be ${country} for this profile.`);
  need(isObj(c.currency) && typeof c.currency.code === "string" && /^[A-Z]{3}$/.test(c.currency.code) && c.currency.minorUnits === 2, "currency must be { code: three capital letters, minorUnits: 2 }.");
  if (c.country === "ZA") need(c.currency?.code === "ZAR", "South Africa must use ZAR."); else if (c.country === "ZM") need(c.currency?.code === "ZMW", "Zambia must use ZMW.");
  need(typeof c.timezone === "string" && c.timezone.length > 3, "timezone is required.");
  need(c.mode === "sandbox" || c.mode === "live", "mode must be sandbox or live.");
  need(isObj(c.partner) && ["bank", "accountRef", "integration"].every((k) => c.partner[k] === null || typeof c.partner[k] === "string"), "partner needs bank, accountRef and integration (text or null).");
  need(isObj(c.regulator) && typeof c.regulator.name === "string" && c.regulator.name.length > 0, "regulator.name is required.");

  const afc = c.afc;
  if (!isObj(afc)) e.push("afc settings are missing.");
  else {
    const pf = afc.platformFee;
    need(isObj(pf) && isInt(pf.flatCents) && isInt(pf.deviceShareCents) && isInt(pf.cardShareCents) && pf.deviceShareCents + pf.cardShareCents === pf.flatCents, "afc.platformFee: the device and card parts must add up to the flat fee.");
    need(typeof afc.investorPctOfFee === "number" && afc.investorPctOfFee >= 0 && afc.investorPctOfFee <= 1, "afc.investorPctOfFee must be between 0 and 1.");
    need(isInt(afc.noPinBelowCents, 0, 10_000_000), "afc.noPinBelowCents must be a whole number of cents.");
    need(isInt(afc.noPinDailyCumulativeCents) && afc.noPinDailyCumulativeCents >= afc.noPinBelowCents, "afc.noPinDailyCumulativeCents must be at least the per-tap limit.");
    need(isInt(afc.noPinConsecutiveTaps, 1, 100), "afc.noPinConsecutiveTaps must be 1 to 100.");
    need(typeof afc.sandboxAutoConfirm === "boolean", "afc.sandboxAutoConfirm must be true or false.");
    need(!(c.mode === "live" && afc.sandboxAutoConfirm === true), "A live profile cannot auto-confirm taps (afc.sandboxAutoConfirm must be false).");
  }
  need(isObj(c.trip) && isInt(c.trip.tapsPerTrip, 1, 200) && c.trip.partialTrip === "carry_over", "trip needs tapsPerTrip (1 to 200) and partialTrip 'carry_over'.");
  need(isObj(c.marshalFee) && isInt(c.marshalFee.amountCents, 0, 1_000_000) && c.marshalFee.payer === "driver" && c.marshalFee.payee === "marshal" && c.marshalFee.noMarshalLogged === "accrue_to_association", "marshalFee needs amountCents, payer 'driver', payee 'marshal', noMarshalLogged 'accrue_to_association'.");
  need(isObj(c.payouts) && /^\d{2}:\d{2}$/.test(String(c.payouts.cutoff)) && isInt(c.payouts.minPayoutCents) && isInt(c.payouts.salaryRetryDays, 0, 14) && Array.isArray(c.payouts.retryMinutes) && c.payouts.retryMinutes.every((m: unknown) => isInt(m, 1, 10080)), "payouts needs cutoff HH:MM, minPayoutCents, salaryRetryDays and retryMinutes.");

  const lim = c.limits;
  if (!isObj(lim) || !isObj(lim.tiers)) e.push("limits.tiers is missing.");
  else {
    for (const t of KYC_TIERS) { const x = lim.tiers[t]; need(isObj(x) && isInt(x.balanceCents) && isInt(x.dailyInCents) && isInt(x.dailyOutCents), `limits.tiers.${t} needs balanceCents, dailyInCents and dailyOutCents.`); }
    for (const k of ["atmDailyCents", "posDailyCents", "onlineDailyCents"] as const) for (const t of ["basic", "standard", "full"]) need(isObj(lim[k]) && isInt(lim[k][t]), `limits.${k}.${t} must be a whole number of cents.`);
    need(lim.enforce === undefined || typeof lim.enforce === "boolean", "limits.enforce must be true or false.");
    // A higher tier must never be more restricted than a lower one.
    const order = ["basic", "standard", "full"] as const;
    for (let i = 1; i < order.length; i++) { const a = lim.tiers?.[order[i - 1]], b = lim.tiers?.[order[i]]; if (isObj(a) && isObj(b)) need(b.balanceCents >= a.balanceCents && b.dailyOutCents >= a.dailyOutCents, `limits.tiers.${order[i]} must allow at least as much as ${order[i - 1]}.`); }
  }

  const fees = c.fees;
  if (!isObj(fees) || typeof fees.scheduleId !== "string" || !Array.isArray(fees.rules) || fees.rules.length === 0) e.push("fees needs a scheduleId and at least one rule.");
  else {
    const seen = new Set<string>();
    for (const [i, r] of (fees.rules as unknown[]).entries()) {
      const at = `fees.rules[${i}]`;
      if (!isObj(r) || typeof r.id !== "string" || !isObj(r.appliesTo) || typeof r.appliesTo.txn !== "string" || !isObj(r.calc)) { e.push(`${at} needs id, appliesTo.txn and calc.`); continue; }
      need(!seen.has(r.id), `${at}: duplicate rule id '${r.id}'.`); seen.add(r.id);
      const k = r.calc;
      if (k.type === "flat") need(isInt(k.amountCents), `${at}: flat amountCents must be a whole number of cents.`);
      else if (k.type === "percent_plus_flat") need(typeof k.pct === "number" && k.pct >= 0 && k.pct <= 0.5 && isInt(k.flatCents), `${at}: pct must be 0 to 0.5 and flatCents whole cents.`);
      else if (k.type === "tiered") {
        const t = k.tiers;
        need(Array.isArray(t) && t.length > 0 && t.every((x: any) => isObj(x) && isInt(x.flatCents) && (x.upToCents === null || isInt(x.upToCents))) && t.at(-1)?.upToCents === null, `${at}: tiers need whole-cent amounts and the last tier must have upToCents null.`);
        if (Array.isArray(t)) { const ups = t.slice(0, -1).map((x: any) => x.upToCents); need(ups.every((u: number, j: number) => j === 0 || u > ups[j - 1]), `${at}: tier limits must increase.`); }
      } else e.push(`${at}: calc.type must be flat, percent_plus_flat or tiered.`);
      if (r.minCents != null && r.maxCents != null) need(isInt(r.minCents) && isInt(r.maxCents) && r.minCents <= r.maxCents, `${at}: minCents must not exceed maxCents.`);
    }
  }

  const ic = c.instantCredit;
  need(isObj(ic) && typeof ic.enabled === "boolean" && isInt(ic.reserveCents) && typeof ic.reserveRatioMax === "number" && ic.reserveRatioMax >= 0 && ic.reserveRatioMax <= 10 && isObj(ic.perDepositCents), "instantCredit needs enabled, reserveCents, reserveRatioMax (0 to 10) and perDepositCents.");
  if (isObj(ic) && ic.enabled === true) need(ic.reserveCents > 0, "Instant credit cannot be enabled without a funded risk reserve.");

  need(Array.isArray(c.corridors) && c.corridors.every((x: any) => isObj(x) && typeof x.id === "string" && COUNTRIES.includes(x.from) && COUNTRIES.includes(x.to) && x.from !== x.to && typeof x.enabled === "boolean" && isInt(x.perTransactionCents) && isInt(x.perDayCents) && isInt(x.perMonthCents) && x.perTransactionCents <= x.perDayCents && x.perDayCents <= x.perMonthCents && typeof x.fxMarginPct === "number" && x.fxMarginPct >= 0 && x.fxMarginPct < 0.2 && isInt(x.feeFlatCents) && isInt(x.quoteTtlSeconds, 5, 600)), "each corridor needs from/to (different countries), enabled, limits that rise (transaction <= day <= month), fxMarginPct below 20%, feeFlatCents and quoteTtlSeconds (5 to 600).");
  need(isObj(c.data) && COUNTRIES.includes(c.data.residency) && isInt(c.data.retentionYears, 1, 30), "data needs residency (ZA or ZM) and retentionYears.");
  return e;
}

/* ───────────────────────── difference between two profiles ───────────────────────── */
export interface Change { path: string; before: unknown; after: unknown }
/** Every setting that differs, as a flat list (arrays of rules are compared by value). Used for review and for the audit log. */
export function diffConfig(a: unknown, b: unknown, path = ""): Change[] {
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffConfig((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, before: a, after: b }];
}

/** Country for a currency code (taps carry a currency, not a country). */
export const countryForCurrency = (code: string | null | undefined): CountryCode => (code === "ZMW" ? "ZM" : "ZA");
