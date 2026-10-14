import { createHmac, randomBytes, type KeyObject } from "node:crypto";
import { privateKeyFromBase64, privateKeyFromSeed, publicKeyHexOf } from "@afc/shared/node";
import { z } from "zod";

/**
 * All settings come from the environment. Secrets (JWT_SECRET, DEVICE_KEY_MASTER, the webhook secret) are never committed:
 * set them in your host's secret store. Outside production, missing secrets get fixed development values and a loud warning;
 * in production a missing or weak secret stops the server from starting.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  /** 32 random bytes as 64 hex characters. Device signing secrets are derived from it; losing it means re-issuing every device secret. */
  DEVICE_KEY_MASTER: z.string().regex(/^[0-9a-fA-F]{64}$/, "DEVICE_KEY_MASTER must be 64 hex characters").optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /** Shared secret the mobile-money provider signs webhooks with. Without it the webhook endpoint stays switched off. */
  MOBILE_MONEY_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Which adapter understands the provider's callbacks (see domain/mobileMoney.ts). */
  MOBILE_MONEY_PROVIDER: z.string().default("generic"),
  /** Ed25519 private key (PKCS8 DER, base64) that signs single-trip tickets. Generate with: npm run tickets -- keygen. Keep it only on the server. */
  TICKET_SIGNING_KEY: z.string().optional(),
  TICKET_KEY_ID: z.coerce.number().int().min(1).max(255).default(1),
  /** Old public keys still accepted on tickets already sold, as id:hex,id:hex */
  TICKET_RETIRED_KEYS: z.string().optional(),
  AUTO_BLOCK_HIGH_ANOMALIES: z.coerce.number().int().min(1).default(3),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  /** Sign-in attempts allowed per address per 15 minutes (a separate guard from the per-account lock). */
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  deviceKeyMaster: Buffer;
  corsOrigin: string;
  mobileMoneyWebhookSecret?: string;
  mobileMoneyProvider: string;
  /** Undefined when tickets are not set up (the ticket endpoints then answer 503). */
  ticketSigner?: { keyId: number; privateKey: KeyObject; publicKey: string; retired: { id: number; publicKey: string }[] };
  autoBlockHighAnomalies: number;
  loginMaxFailures: number;
  loginLockMinutes: number;
  loginRateLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = console.warn): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error("Invalid configuration:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  const e = parsed.data;
  const prod = e.NODE_ENV === "production";
  if (prod && (!e.JWT_SECRET || !e.DEVICE_KEY_MASTER)) throw new Error("In production JWT_SECRET and DEVICE_KEY_MASTER must be set.");
  if (prod && e.CORS_ORIGIN === "*") throw new Error("CORS_ORIGIN must name the dashboard's address in production, not *.");
  if (!e.JWT_SECRET) warn("[config] JWT_SECRET not set: using a random secret for this run (everyone is signed out on restart).");
  if (!e.DEVICE_KEY_MASTER) warn("[config] DEVICE_KEY_MASTER not set: using a FIXED DEVELOPMENT value. Never use this outside your own machine.");
  let ticketSigner: Config["ticketSigner"];
  const retired = (e.TICKET_RETIRED_KEYS ?? "").split(",").filter(Boolean).map((p) => { const [id, key] = p.split(":"); if (!/^d+$/.test(id ?? "") || !/^[0-9a-f]{64}$/i.test(key ?? "")) throw new Error("TICKET_RETIRED_KEYS must look like 1:<64 hex>,2:<64 hex>"); return { id: Number(id), publicKey: key.toLowerCase() }; });
  if (e.TICKET_SIGNING_KEY) {
    const privateKey = privateKeyFromBase64(e.TICKET_SIGNING_KEY);
    ticketSigner = { keyId: e.TICKET_KEY_ID, privateKey, publicKey: publicKeyHexOf(privateKey), retired };
  } else if (!prod) {
    warn("[config] TICKET_SIGNING_KEY not set: deriving a ticket key from JWT_SECRET (development only; tickets are checked against it).");
    const privateKey = privateKeyFromSeed(createHmac("sha256", e.JWT_SECRET ?? "dev").update("afc-ticket-dev").digest());
    ticketSigner = { keyId: e.TICKET_KEY_ID, privateKey, publicKey: publicKeyHexOf(privateKey), retired };
  }
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET ?? randomBytes(32).toString("hex"),
    deviceKeyMaster: Buffer.from(e.DEVICE_KEY_MASTER ?? "00".repeat(31) + "01", "hex"),
    corsOrigin: e.CORS_ORIGIN,
    mobileMoneyWebhookSecret: e.MOBILE_MONEY_WEBHOOK_SECRET,
    mobileMoneyProvider: e.MOBILE_MONEY_PROVIDER,
    ticketSigner,
    autoBlockHighAnomalies: e.AUTO_BLOCK_HIGH_ANOMALIES,
    loginMaxFailures: e.LOGIN_MAX_FAILURES,
    loginLockMinutes: e.LOGIN_LOCK_MINUTES,
    loginRateLimit: e.LOGIN_RATE_LIMIT,
  };
}
