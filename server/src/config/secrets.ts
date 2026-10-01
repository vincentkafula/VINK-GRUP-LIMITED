import crypto from "crypto";

/**
 * Secrets and seeded-account passwords come from the environment, never from source code.
 * Everything here is a pure function of the env passed in, so it can be tested.
 */

/** The old built-in fallback. It is public (it was committed), so it must never be accepted in production. */
export const KNOWN_DEV_JWT_SECRET = "vink-mvno-dev-secret-change-in-prod";

export const isProduction = (env: NodeJS.ProcessEnv = process.env): boolean => env.NODE_ENV === "production";

/**
 * The key tokens are signed with.
 * - Production: JWT_SECRET is required and must not be the old public default; the server refuses to start otherwise
 *   (a forgeable signing key means anyone can mint an owner token). A short secret only logs a warning.
 * - Elsewhere: JWT_SECRET if set, else a random key for this process (tokens simply stop working on restart).
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = console.warn): string {
  const s = env.JWT_SECRET?.trim();
  if (isProduction(env)) {
    if (!s) throw new Error("JWT_SECRET is not set. Refusing to start in production without a signing secret (e.g. `openssl rand -hex 64`).");
    if (s === KNOWN_DEV_JWT_SECRET) throw new Error("JWT_SECRET is the old public default. Set a new random secret before starting in production.");
    if (s.length < 32) warn("[security] JWT_SECRET is shorter than 32 characters. Rotate it to a random value of at least 32.");
    return s;
  }
  if (s) return s;
  warn("[security] JWT_SECRET not set; using a random key for this process (sign-ins will not survive a restart).");
  return crypto.randomBytes(48).toString("hex");
}

const devGenerated = new Map<string, string>();

/**
 * Password for a seeded account (ADMIN, OWNER, NOC1, BILLING1, CUSTOMER1), from SEED_PASSWORD_<NAME>.
 * - Set: used as given (must be at least 12 characters).
 * - Unset in production: null, so the account is NOT created with a guessable password.
 * - Unset elsewhere: a random password for this process, printed once to the console so a developer can sign in.
 */
export function seedPassword(name: string, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log): string | null {
  const v = env[`SEED_PASSWORD_${name.toUpperCase()}`];
  if (v) {
    if (v.length < 12) throw new Error(`SEED_PASSWORD_${name.toUpperCase()} must be at least 12 characters.`);
    return v;
  }
  if (isProduction(env)) return null;
  let p = devGenerated.get(name);
  if (!p) {
    p = crypto.randomBytes(12).toString("base64url");
    devGenerated.set(name, p);
    log(`[dev] seeded account "${name.toLowerCase()}" has a random password for this run: ${p}  (set SEED_PASSWORD_${name.toUpperCase()} to choose one)`);
  }
  return p;
}

export const BCRYPT_ROUNDS = Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12);
