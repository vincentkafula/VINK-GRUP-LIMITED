/**
 * One switch for everything that touches money: PAYMENTS_MODE=sandbox|live (default sandbox).
 *
 * Going live is deliberately hard. Live mode is refused at startup unless ALL of these hold, and
 * every problem is reported at once:
 *   - NODE_ENV=production
 *   - PAYMENTS_LIVE_ENABLED=I_UNDERSTAND_THIS_MOVES_REAL_MONEY   (the explicit extra flag)
 *   - PAYMENTS_LIVE_APPROVED_BY=<name of the person who signed off docs/payments/GO_LIVE_CHECKLIST.md>
 *   - ISSUING_PROVIDER / ACQUIRING_PROVIDER are real providers, not "mock"
 *   - the selected provider's live credentials and webhook secret are set, and its base URL is https
 * Sandbox and live credentials use different variable names, so one can never be picked up for the other.
 */

export type PaymentsMode = "sandbox" | "live";
export type IssuingProviderName = "mock" | "paymentology";
export type AcquiringProviderName = "mock";
/** Looks after existing cards. visa_dps = Visa DPS Card and Account Services, SANDBOX ONLY (live cards go through the BIN sponsor, Paymentology). */
export type CardServicingProviderName = "mock" | "visa_dps";
/** Checks a card is valid. visa_pav = Visa Payment Account Validation, SANDBOX ONLY. */
export type AccountValidationProviderName = "mock" | "visa_pav";

/**
 * Sends money to a holder's own debit card (cash-outs and refunds). mock = the bundled sandbox rail; visa_direct = Visa Direct push-to-card, SANDBOX ONLY.
 * Mastercard Send is not built: it needs Mastercard's API documentation, a partner id and signing keys, which are not available here and must not be guessed.
 */
export type CardPayoutProviderName = "mock" | "visa_direct";

export const LIVE_ENABLE_PHRASE = "I_UNDERSTAND_THIS_MOVES_REAL_MONEY";

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
}

export interface PaymentsConfig {
  mode: PaymentsMode;
  issuingProvider: IssuingProviderName;
  acquiringProvider: AcquiringProviderName;
  cardServicingProvider: CardServicingProviderName;
  accountValidationProvider: AccountValidationProviderName;
  /** Visa PAV settings (acquirer details are required by the API), only when accountValidationProvider is visa_pav. */
  visaPav: { baseUrl: string; auth: VisaAuthConfig; acquiringBin: string; acquirerCountryCode: string; acceptorName: string; acceptorIdCode: string; terminalId: string } | null;
  /** Visa sandbox settings, only when cardServicingProvider is visa_dps. */
  visaDps: { baseUrl: string; auth: VisaAuthConfig; programType: "debit" | "prepaid" } | null;
  /** Pays cash-outs and refunds to the holder's own debit card. */
  cardPayoutProvider: CardPayoutProviderName;
  /**
   * Whether token holders may be paid to an outside debit card (cash-outs and refunds). TOKEN_EXTERNAL_PAYOUTS=on|off. The default is on in the sandbox and OFF in live mode:
   * VINK's rule is that the pool's money leaves with the holder's VINK card (a cash machine or a shop), so live mode needs no payout provider unless this is switched on.
   */
  externalPayouts: boolean;
  /** Visa Direct sandbox settings, only when cardPayoutProvider is visa_direct. */
  visaDirect: { baseUrl: string; auth: VisaAuthConfig; acquiringBin: string; acquirerCountryCode: string; sender: { accountNumber: string; name: string; countryCode: string; city?: string; address?: string }; cardAcceptor: { name: string; idCode: string; terminalId: string; city: string; country: string }; vaultKey: string; extraTestPans: string[] } | null;
  /** Paymentology card settings (client id, card product, parent account, brand), when all are set. */
  /** One card product per brand. Empty until the card settings are set. */
  paymentologyProgrammes: Partial<Record<"visa" | "mastercard", { clientId: number; cardProductId: number; imageName: string; parentAccountId: number; currencyNumeric: string; cardBrand: "visa" | "mastercard" }>>;
  /** Credentials for the selected real provider, taken from the SANDBOX_ or LIVE_ variable set matching `mode`. Null for "mock". */
  paymentology: ProviderCredentials | null;
}

/**
 * How we authenticate to the Visa developer APIs. SANDBOX_VISA_AUTH = x_pay (default) or two_way_ssl.
 * - x_pay:       SANDBOX_VISA_API_KEY + SANDBOX_VISA_SHARED_SECRET
 * - two_way_ssl: SANDBOX_VISA_API_KEY + a client certificate and private key (PEM text, base64 of the PEM, or a file path),
 *                optional SANDBOX_VISA_CA (PEM) and an optional active project user (SANDBOX_VISA_USER_ID / SANDBOX_VISA_PASSWORD) for Basic auth.
 * Certificate material is only referenced here; it is read when the provider is built (providers/visaAuth.ts), never logged.
 */
export type VisaAuthConfig =
  | { kind: "x_pay"; apiKey: string; sharedSecret: string }
  | { kind: "two_way_ssl"; apiKey: string; cert: string; key: string; ca?: string; userId?: string; password?: string };

function visaAuthFrom(env: NodeJS.ProcessEnv, problems: string[]): VisaAuthConfig | null {
  const kind = (env.SANDBOX_VISA_AUTH ?? "x_pay").trim().toLowerCase();
  const apiKey = env.SANDBOX_VISA_API_KEY?.trim();
  if (kind === "x_pay") {
    const sharedSecret = env.SANDBOX_VISA_SHARED_SECRET?.trim();
    if (!apiKey || !sharedSecret) { problems.push("SANDBOX_VISA_AUTH=x_pay needs SANDBOX_VISA_API_KEY and SANDBOX_VISA_SHARED_SECRET."); return null; }
    return { kind: "x_pay", apiKey, sharedSecret };
  }
  if (kind === "two_way_ssl") {
    const cert = env.SANDBOX_VISA_CLIENT_CERT?.trim(), key = env.SANDBOX_VISA_CLIENT_KEY?.trim();
    if (!apiKey || !cert || !key) { problems.push("SANDBOX_VISA_AUTH=two_way_ssl needs SANDBOX_VISA_API_KEY, SANDBOX_VISA_CLIENT_CERT and SANDBOX_VISA_CLIENT_KEY."); return null; }
    const userId = env.SANDBOX_VISA_USER_ID?.trim(), password = env.SANDBOX_VISA_PASSWORD?.trim();
    if (!!userId !== !!password) { problems.push("SANDBOX_VISA_USER_ID and SANDBOX_VISA_PASSWORD must be set together."); return null; }
    return { kind: "two_way_ssl", apiKey, cert, key, ca: env.SANDBOX_VISA_CA?.trim() || undefined, userId, password };
  }
  problems.push(`SANDBOX_VISA_AUTH must be x_pay or two_way_ssl, got "${kind}".`);
  return null;
}

const ISSUERS: IssuingProviderName[] = ["mock", "paymentology"];
const ACQUIRERS: AcquiringProviderName[] = ["mock"];
const SERVICERS: CardServicingProviderName[] = ["mock", "visa_dps"];
const VALIDATORS: AccountValidationProviderName[] = ["mock", "visa_pav"];

function credsFor(prefix: string, env: NodeJS.ProcessEnv): ProviderCredentials | null {
  const baseUrl = env[`${prefix}_BASE_URL`]?.trim(), apiKey = env[`${prefix}_API_KEY`]?.trim(), webhookSecret = env[`${prefix}_WEBHOOK_SECRET`]?.trim();
  return baseUrl && apiKey && webhookSecret ? { baseUrl, apiKey, webhookSecret } : null;
}

export function resolvePaymentsConfig(env: NodeJS.ProcessEnv = process.env): PaymentsConfig {
  const rawMode = (env.PAYMENTS_MODE ?? "sandbox").trim().toLowerCase();
  if (rawMode !== "sandbox" && rawMode !== "live") throw new Error(`PAYMENTS_MODE must be "sandbox" or "live", got "${env.PAYMENTS_MODE}".`);
  const mode: PaymentsMode = rawMode;

  const issuing = (env.ISSUING_PROVIDER ?? "mock").trim().toLowerCase() as IssuingProviderName;
  const acquiring = (env.ACQUIRING_PROVIDER ?? "mock").trim().toLowerCase() as AcquiringProviderName;
  if (!ISSUERS.includes(issuing)) throw new Error(`ISSUING_PROVIDER must be one of ${ISSUERS.join(", ")}, got "${issuing}".`);
  if (!ACQUIRERS.includes(acquiring)) throw new Error(`ACQUIRING_PROVIDER must be one of ${ACQUIRERS.join(", ")}, got "${acquiring}".`);

  const servicing = (env.CARD_SERVICING_PROVIDER ?? "mock").trim().toLowerCase() as CardServicingProviderName;
  if (!SERVICERS.includes(servicing)) throw new Error(`CARD_SERVICING_PROVIDER must be one of ${SERVICERS.join(", ")}, got "${servicing}".`);
  const programType = (env.SANDBOX_VISA_PROGRAM_TYPE ?? "debit").trim().toLowerCase();
  if (programType !== "debit" && programType !== "prepaid") throw new Error('SANDBOX_VISA_PROGRAM_TYPE must be "debit" or "prepaid".');
  const authProblems: string[] = [];
  const visaAuth = servicing === "visa_dps" || env.ACCOUNT_VALIDATION_PROVIDER?.trim().toLowerCase() === "visa_pav" ? visaAuthFrom(env, authProblems) : null;
  const visaDps = servicing === "visa_dps" && visaAuth
    ? { baseUrl: env.SANDBOX_VISA_BASE_URL?.trim() || "https://sandbox.api.visa.com", auth: visaAuth, programType: programType as "debit" | "prepaid" }
    : null;

  const payoutRaw = (env.CARD_PAYOUT_PROVIDER ?? "mock").trim().toLowerCase();
  if (payoutRaw === "mastercard_send") throw new Error("CARD_PAYOUT_PROVIDER=mastercard_send is not built: Mastercard Send needs Mastercard's API documentation, a partner id and signing keys. Use mock or visa_direct.");
  if (payoutRaw !== "mock" && payoutRaw !== "visa_direct") throw new Error(`CARD_PAYOUT_PROVIDER must be mock or visa_direct, got "${payoutRaw}".`);
  const payout: CardPayoutProviderName = payoutRaw;
  const payoutAuth = payout === "visa_direct" ? (visaAuth ?? visaAuthFrom(env, authProblems)) : null;
  const vd = (k: string) => env[`SANDBOX_VISA_DIRECT_${k}`]?.trim();
  const vaultKey = env.SANDBOX_CARD_VAULT_KEY?.trim();
  const visaDirect = payout === "visa_direct" && payoutAuth && vd("ACQUIRING_BIN") && vd("ACQUIRER_COUNTRY") && vd("SENDER_ACCOUNT") && vd("ACCEPTOR_ID_CODE") && vaultKey
    ? {
        baseUrl: env.SANDBOX_VISA_BASE_URL?.trim() || "https://sandbox.api.visa.com", auth: payoutAuth, acquiringBin: vd("ACQUIRING_BIN")!, acquirerCountryCode: vd("ACQUIRER_COUNTRY")!,
        sender: { accountNumber: vd("SENDER_ACCOUNT")!, name: vd("SENDER_NAME") || "VINK", countryCode: vd("SENDER_COUNTRY") || "ZAF", city: vd("SENDER_CITY") || "Cape Town", address: vd("SENDER_ADDRESS") },
        cardAcceptor: { name: vd("ACCEPTOR_NAME") || "VINK", idCode: vd("ACCEPTOR_ID_CODE")!, terminalId: vd("TERMINAL_ID") || "00000001", city: vd("ACCEPTOR_CITY") || "Cape Town", country: vd("ACCEPTOR_COUNTRY") || "ZAF" },
        vaultKey, extraTestPans: (vd("TEST_PANS") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      }
    : null;

  const validation = (env.ACCOUNT_VALIDATION_PROVIDER ?? "mock").trim().toLowerCase() as AccountValidationProviderName;
  if (!VALIDATORS.includes(validation)) throw new Error(`ACCOUNT_VALIDATION_PROVIDER must be one of ${VALIDATORS.join(", ")}, got "${validation}".`);
  const bin = env.SANDBOX_VISA_ACQUIRING_BIN?.trim(), country = env.SANDBOX_VISA_ACQUIRER_COUNTRY?.trim(), idCode = env.SANDBOX_VISA_ACCEPTOR_ID_CODE?.trim();
  const visaPav = validation === "visa_pav" && visaAuth && bin && country && idCode
    ? { baseUrl: env.SANDBOX_VISA_BASE_URL?.trim() || "https://sandbox.api.visa.com", auth: visaAuth, acquiringBin: bin, acquirerCountryCode: country,
        acceptorName: env.SANDBOX_VISA_ACCEPTOR_NAME?.trim() || "VINK", acceptorIdCode: idCode, terminalId: env.SANDBOX_VISA_TERMINAL_ID?.trim() || "00000001" }
    : null;

  // Credentials are looked up by mode: SANDBOX_PAYMENTOLOGY_* in sandbox, LIVE_PAYMENTOLOGY_* in live. Never the other set.
  const paymentology = issuing === "paymentology" ? credsFor(`${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY`, env) : null;

  const pm = (k: string) => env[`${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY_${k}`]?.trim();
  const int = (v: string | undefined) => (v && /^\d{1,15}$/.test(v) && Number(v) > 0 ? Number(v) : null);
  // One card product per brand. SANDBOX_PAYMENTOLOGY_VISA_* and _MASTERCARD_* (CARD_PRODUCT_ID, IMAGE_NAME, PARENT_ACCOUNT_ID) give one product each;
  // the older single set (CARD_PRODUCT_ID, IMAGE_NAME, PARENT_ACCOUNT_ID, CARD_BRAND) still works for one brand. CLIENT_ID and CURRENCY_NUMERIC are shared.
  const paymentologyProgrammes: PaymentsConfig["paymentologyProgrammes"] = {};
  if (issuing === "paymentology" && paymentology && int(pm("CLIENT_ID"))) {
    const currencyNumeric = /^\d{3}$/.test(pm("CURRENCY_NUMERIC") ?? "") ? pm("CURRENCY_NUMERIC")! : "710";
    const legacy = pm("CARD_BRAND")?.toLowerCase();
    for (const brand of ["visa", "mastercard"] as const) {
      const key = brand.toUpperCase();
      const useLegacy = legacy === brand && !pm(`${key}_CARD_PRODUCT_ID`);
      const product = int(pm(useLegacy ? "CARD_PRODUCT_ID" : `${key}_CARD_PRODUCT_ID`)), image = pm(useLegacy ? "IMAGE_NAME" : `${key}_IMAGE_NAME`), parent = int(pm(useLegacy ? "PARENT_ACCOUNT_ID" : `${key}_PARENT_ACCOUNT_ID`));
      if (product && image && parent) paymentologyProgrammes[brand] = { clientId: int(pm("CLIENT_ID"))!, cardProductId: product, imageName: image, parentAccountId: parent, currencyNumeric, cardBrand: brand };
    }
  }

  const problems: string[] = [];
  if (issuing === "paymentology" && !paymentology) {
    problems.push(`ISSUING_PROVIDER=paymentology needs ${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY_BASE_URL, _API_KEY and _WEBHOOK_SECRET.`);
  }
  problems.push(...authProblems);

  if (validation === "visa_pav" && !visaPav) problems.push("ACCOUNT_VALIDATION_PROVIDER=visa_pav needs SANDBOX_VISA_ACQUIRING_BIN, SANDBOX_VISA_ACQUIRER_COUNTRY (3-digit ISO numeric) and SANDBOX_VISA_ACCEPTOR_ID_CODE.");

  if (payout === "visa_direct" && !visaDirect) problems.push("CARD_PAYOUT_PROVIDER=visa_direct needs the Visa credentials (SANDBOX_VISA_AUTH and its keys), SANDBOX_VISA_DIRECT_ACQUIRING_BIN, SANDBOX_VISA_DIRECT_ACQUIRER_COUNTRY (3-digit ISO numeric), SANDBOX_VISA_DIRECT_SENDER_ACCOUNT, SANDBOX_VISA_DIRECT_ACCEPTOR_ID_CODE and SANDBOX_CARD_VAULT_KEY (16 or more characters).");

  const extRaw = env.TOKEN_EXTERNAL_PAYOUTS?.trim().toLowerCase();
  if (extRaw && extRaw !== "on" && extRaw !== "off") problems.push('TOKEN_EXTERNAL_PAYOUTS must be "on" or "off".');
  const externalPayouts = extRaw ? extRaw === "on" : mode !== "live";

  if (mode === "live") {
    if (externalPayouts) problems.push("Live mode has no card payout provider yet: the bundled rail and Visa Direct are sandbox-only, and paying to a real card needs the BIN sponsor's tokenised push-to-card service, whose adapter is not built. Set TOKEN_EXTERNAL_PAYOUTS=off to let money leave only with the VINK card.");
    if (validation !== "mock") problems.push("Live mode cannot use the Visa PAV sandbox provider (it needs an acquiring BIN from an acquirer; none is set up).");
    if (servicing === "visa_dps") problems.push("Live mode cannot use CARD_SERVICING_PROVIDER=visa_dps: it is sandbox-only. Live cards are issued and switched on and off through Paymentology.");
    if (env.NODE_ENV !== "production") problems.push("Live mode needs NODE_ENV=production.");
    if (env.PAYMENTS_LIVE_ENABLED !== LIVE_ENABLE_PHRASE) problems.push(`Live mode needs PAYMENTS_LIVE_ENABLED=${LIVE_ENABLE_PHRASE}.`);
    if (!env.PAYMENTS_LIVE_APPROVED_BY?.trim()) problems.push("Live mode needs PAYMENTS_LIVE_APPROVED_BY (who signed off docs/payments/GO_LIVE_CHECKLIST.md).");
    if (issuing === "mock") problems.push("Live mode cannot use ISSUING_PROVIDER=mock.");
    if (acquiring === "mock") problems.push("Live mode cannot use ACQUIRING_PROVIDER=mock (no real acquiring provider is implemented yet).");
    if (paymentology && !/^https:\/\//i.test(paymentology.baseUrl)) problems.push("The live provider base URL must be https.");
  }

  if (problems.length) {
    throw new Error(`Payments configuration refused:\n  - ${problems.join("\n  - ")}`);
  }
  return { mode, issuingProvider: issuing, acquiringProvider: acquiring, cardServicingProvider: servicing, visaDps, accountValidationProvider: validation, visaPav, cardPayoutProvider: payout, visaDirect, paymentologyProgrammes, paymentology, externalPayouts };
}

/** VINK core calls its sandbox "test" (it prefixes API keys mk_test_ / mk_live_). */
export const coreMode = (m: PaymentsMode): "test" | "live" => (m === "live" ? "live" : "test");
