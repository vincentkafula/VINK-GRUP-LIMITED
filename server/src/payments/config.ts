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

  const validation = (env.ACCOUNT_VALIDATION_PROVIDER ?? "mock").trim().toLowerCase() as AccountValidationProviderName;
  if (!VALIDATORS.includes(validation)) throw new Error(`ACCOUNT_VALIDATION_PROVIDER must be one of ${VALIDATORS.join(", ")}, got "${validation}".`);
  const bin = env.SANDBOX_VISA_ACQUIRING_BIN?.trim(), country = env.SANDBOX_VISA_ACQUIRER_COUNTRY?.trim(), idCode = env.SANDBOX_VISA_ACCEPTOR_ID_CODE?.trim();
  const visaPav = validation === "visa_pav" && visaAuth && bin && country && idCode
    ? { baseUrl: env.SANDBOX_VISA_BASE_URL?.trim() || "https://sandbox.api.visa.com", auth: visaAuth, acquiringBin: bin, acquirerCountryCode: country,
        acceptorName: env.SANDBOX_VISA_ACCEPTOR_NAME?.trim() || "VINK", acceptorIdCode: idCode, terminalId: env.SANDBOX_VISA_TERMINAL_ID?.trim() || "00000001" }
    : null;

  // Credentials are looked up by mode: SANDBOX_PAYMENTOLOGY_* in sandbox, LIVE_PAYMENTOLOGY_* in live. Never the other set.
  const paymentology = issuing === "paymentology" ? credsFor(`${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY`, env) : null;

  const problems: string[] = [];
  if (issuing === "paymentology" && !paymentology) {
    problems.push(`ISSUING_PROVIDER=paymentology needs ${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY_BASE_URL, _API_KEY and _WEBHOOK_SECRET.`);
  }
  problems.push(...authProblems);

  if (validation === "visa_pav" && !visaPav) problems.push("ACCOUNT_VALIDATION_PROVIDER=visa_pav needs SANDBOX_VISA_ACQUIRING_BIN, SANDBOX_VISA_ACQUIRER_COUNTRY (3-digit ISO numeric) and SANDBOX_VISA_ACCEPTOR_ID_CODE.");

  if (mode === "live") {
    if (validation !== "mock") problems.push("Live mode cannot use the Visa PAV sandbox provider (it needs an acquiring BIN from an acquirer; none is set up).");
    problems.push("Live mode has no card-servicing provider yet: visa_dps is sandbox-only and live cards go through the BIN sponsor (Paymentology), whose servicing adapter is not built.");
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
  return { mode, issuingProvider: issuing, acquiringProvider: acquiring, cardServicingProvider: servicing, visaDps, accountValidationProvider: validation, visaPav, paymentology };
}

/** VINK core calls its sandbox "test" (it prefixes API keys mk_test_ / mk_live_). */
export const coreMode = (m: PaymentsMode): "test" | "live" => (m === "live" ? "live" : "test");
