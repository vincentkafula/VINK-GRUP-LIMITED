import fs from "fs";
import type { VisaAuthConfig } from "../config.js";
import { xPayAuthenticator, twoWayAuthenticator, type VisaAuthenticator, type VisaTls } from "./visaHttp.js";

/**
 * Reads PEM material that may be given as: the PEM text itself (literal "\n" sequences allowed, as many secret stores
 * flatten newlines), the base64 of a PEM file, or a path to a PEM file. The value is never logged.
 */
export function loadPem(source: string, what: string): string {
  const v = source.trim();
  let pem: string;
  if (v.includes("-----BEGIN")) pem = v.replace(/\\n/g, "\n");
  else if (!v.includes("\n") && v.length < 4096 && fs.existsSync(v)) pem = fs.readFileSync(v, "utf8");
  else {
    pem = Buffer.from(v, "base64").toString("utf8");
    if (!pem.includes("-----BEGIN")) throw new Error(`${what} is not PEM text, base64 PEM, or a readable file path.`);
  }
  if (!pem.includes("-----BEGIN")) throw new Error(`${what} does not contain a PEM block.`);
  return pem;
}

/** Builds the request authenticator and (for two-way SSL) the client certificate from configuration. */
export function buildVisaAuth(auth: VisaAuthConfig): { authenticate: VisaAuthenticator; tls?: VisaTls } {
  if (auth.kind === "x_pay") return { authenticate: xPayAuthenticator(auth.apiKey, auth.sharedSecret) };
  const key = loadPem(auth.key, "SANDBOX_VISA_CLIENT_KEY");
  if (/ENCRYPTED PRIVATE KEY|Proc-Type: 4,ENCRYPTED/.test(key)) throw new Error("SANDBOX_VISA_CLIENT_KEY is passphrase-protected; supply an unencrypted key (or decrypt it) so it can be loaded from the secret store.");
  return {
    authenticate: twoWayAuthenticator(auth.apiKey, auth.userId && auth.password ? { userId: auth.userId, password: auth.password } : undefined),
    tls: { cert: loadPem(auth.cert, "SANDBOX_VISA_CLIENT_CERT"), key, ...(auth.ca ? { ca: loadPem(auth.ca, "SANDBOX_VISA_CA") } : {}) },
  };
}
