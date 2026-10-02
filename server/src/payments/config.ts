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
  /** Credentials for the selected real provider, taken from the SANDBOX_ or LIVE_ variable set matching `mode`. Null for "mock". */
  paymentology: ProviderCredentials | null;
}

const ISSUERS: IssuingProviderName[] = ["mock", "paymentology"];
const ACQUIRERS: AcquiringProviderName[] = ["mock"];

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

  // Credentials are looked up by mode: SANDBOX_PAYMENTOLOGY_* in sandbox, LIVE_PAYMENTOLOGY_* in live. Never the other set.
  const paymentology = issuing === "paymentology" ? credsFor(`${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY`, env) : null;

  const problems: string[] = [];
  if (issuing === "paymentology" && !paymentology) {
    problems.push(`ISSUING_PROVIDER=paymentology needs ${mode === "live" ? "LIVE" : "SANDBOX"}_PAYMENTOLOGY_BASE_URL, _API_KEY and _WEBHOOK_SECRET.`);
  }
  if (mode === "live") {
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
  return { mode, issuingProvider: issuing, acquiringProvider: acquiring, paymentology };
}

/** Manshya core calls its sandbox "test" (it prefixes API keys mk_test_ / mk_live_). */
export const coreMode = (m: PaymentsMode): "test" | "live" => (m === "live" ? "live" : "test");
