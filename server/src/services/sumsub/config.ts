/**
 * Sumsub (identity verification) settings, from the environment. Nothing here is a secret in source code.
 *   SUMSUB_APP_TOKEN          the App Token from the Sumsub dashboard (Dev space > App tokens)
 *   SUMSUB_SECRET_KEY         the Secret key shown once with that token; signs every request we make
 *   SUMSUB_WEBHOOK_SECRET     the secret set on the webhook in the dashboard; checks every event Sumsub sends us
 *   SUMSUB_LEVEL_NAME         the verification level (which documents and checks) used unless a kind of applicant has its own; default "basic-kyc-level"
 *   SUMSUB_LEVEL_<PROFILE>    a level for one kind of applicant: PERSONAL, BUSINESS, CORPORATE (account and loan applications of that tier) or SPONSORSHIP
 *   SUMSUB_REQUIRED_FOR       which kinds of applicant must have a confirmed identity before staff can approve them, as a comma list of
 *                             personal, business, corporate, sponsorship, or the word "none". Blank or unrecognised means the default: personal,business,corporate. It only applies while checks are on.
 *   SUMSUB_LEVEL_KYB          the verification level for a COMPANY (KYB: company documents, directors and owners). There is no default: without it business verification stays off,
 *                             because a level made for a person cannot verify a company
 *   SUMSUB_KYB_REQUIRED_FOR   which kinds of application must have a verified business before approval: business, corporate (comma list) or the word "none". Blank or unrecognised
 *                             means the default, business,corporate. Only applies while business verification is on.
 *   SUMSUB_BASE_URL           default https://api.sumsub.com (the sandbox uses the same address with a sandbox token)
 */
export const PROFILES = ["personal", "business", "corporate", "sponsorship"] as const;
export type Profile = (typeof PROFILES)[number];
/** The kinds of application that are made by a business: they can have the business itself verified as well as the person applying. */
export const KYB_PROFILES = ["business", "corporate"] as const;

export interface SumsubConfig {
  appToken: string; secretKey: string; webhookSecret: string; levelName: string; levels: Partial<Record<Profile, string>>; requiredFor: Profile[]; kybLevel: string; kybRequiredFor: Profile[]; baseUrl: string; tokenTtlSecs: number; timeoutMs: number;
}

export function sumsubConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SumsubConfig {
  const base = (env.SUMSUB_BASE_URL?.trim() || "https://api.sumsub.com").replace(/\/+$/, "");
  const ttl = Number(env.SUMSUB_TOKEN_TTL_SECS);
  const levels: Partial<Record<Profile, string>> = {};
  for (const p of PROFILES) { const v = env[`SUMSUB_LEVEL_${p.toUpperCase()}`]?.trim(); if (v) levels[p] = v; }
  // The requirement is only ever switched off by saying "none". Blank, a typo or any name we do not know falls back to the default, so a slip can never silently disable it.
  const given = (env.SUMSUB_REQUIRED_FOR ?? "").trim().toLowerCase();
  const named = given.split(",").map((x) => x.trim()).filter((x): x is Profile => (PROFILES as readonly string[]).includes(x));
  const requiredFor: Profile[] = given === "none" ? [] : named.length ? [...new Set(named)] : ["personal", "business", "corporate"];
  const kybGiven = (env.SUMSUB_KYB_REQUIRED_FOR ?? "").trim().toLowerCase();
  const kybNamed = kybGiven.split(",").map((x) => x.trim()).filter((x): x is Profile => (KYB_PROFILES as readonly string[]).includes(x));
  const kybRequiredFor: Profile[] = kybGiven === "none" ? [] : kybNamed.length ? [...new Set(kybNamed)] : ["business", "corporate"];
  return {
    appToken: env.SUMSUB_APP_TOKEN?.trim() ?? "", secretKey: env.SUMSUB_SECRET_KEY?.trim() ?? "", webhookSecret: env.SUMSUB_WEBHOOK_SECRET?.trim() ?? "",
    levelName: env.SUMSUB_LEVEL_NAME?.trim() || "basic-kyc-level", levels, requiredFor, kybLevel: env.SUMSUB_LEVEL_KYB?.trim() ?? "", kybRequiredFor, baseUrl: base,
    tokenTtlSecs: Number.isFinite(ttl) && ttl >= 60 && ttl <= 86_400 ? Math.floor(ttl) : 900, timeoutMs: 15_000,
  };
}

/** Identity checks are on when we can sign requests to Sumsub. */
export const sumsubReady = (c: SumsubConfig) => !!(c.appToken && c.secretKey && c.levelName && /^https?:\/\//.test(c.baseUrl));
/** We can only trust events from Sumsub when a webhook secret is set. */
export const sumsubWebhookReady = (c: SumsubConfig) => !!c.webhookSecret;
/** The Sumsub level for a kind of applicant: its own if one is set, else the default. */
export const levelFor = (c: SumsubConfig, profile: Profile): string => c.levels[profile] ?? c.levelName;
/** Must this kind of applicant have a confirmed identity before approval? (Only while checks are on: nothing is ever blocked by a feature that is switched off.) */
export const isRequired = (c: SumsubConfig, profile: Profile): boolean => sumsubReady(c) && c.requiredFor.includes(profile);

/** Business verification (KYB) is on when identity checks are on AND a company level has been set. */
export const kybReady = (c: SumsubConfig) => sumsubReady(c) && !!c.kybLevel;
/** Does an application of this kind have a business to verify? */
export const isBusinessProfile = (p: Profile): boolean => (KYB_PROFILES as readonly string[]).includes(p);
/** Must the business behind this kind of application be verified before approval? (Only while business verification is on.) */
export const isKybRequired = (c: SumsubConfig, profile: Profile): boolean => kybReady(c) && c.kybRequiredFor.includes(profile);
