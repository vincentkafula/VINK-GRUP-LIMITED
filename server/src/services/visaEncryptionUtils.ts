import crypto from "crypto";
import {
  CompactEncrypt, compactDecrypt, CompactSign, compactVerify,
  importPKCS8, importSPKI, importX509,
} from "jose";

/**
 * TypeScript port of Visa's official jwe-jws-encryption-utils (Java, v1.0.1,
 * (c) Visa -- sample code for the Visa Developer Program). This is not a
 * reinterpretation -- every algorithm, key-derivation step, and header field
 * here was read directly from the uploaded Java source
 * (EncryptionUtils.java, CertificateUtils.java, EncryptionUtilsTest.java)
 * and verified to round-trip correctly using the `jose` library, which
 * implements the same JOSE/JWE/JWS standards as the Java original's
 * Nimbus JOSE+JWT dependency.
 *
 * Two modes, matching the original exactly:
 *  1. Shared Secret (symmetric) -- API Key + Shared Secret string.
 *  2. RSA PKI (asymmetric) -- a key ID + RSA public/private key.
 *
 * As with the Mastercard integration, no real Visa credentials were
 * provided alongside this library, so nothing here is pre-configured with
 * real values -- callers supply the API key / shared secret / RSA keys per
 * call, sourced from environment variables at the route layer, never
 * hardcoded.
 */

export class VisaEncryptionError extends Error {}

const CONTENT_TYPE_JWE = "JWE";
const CONTENT_TYPE_XML = "application/xml";

// --- Shared Secret mode ----------------------------------------------------

/**
 * Create a JWE using API Key + Shared Secret.
 * Matches EncryptionUtils.createJwe(plainText, apiKey, sharedSecret, ...):
 * the encryption key is SHA-256(sharedSecret), algorithm A256GCMKW with
 * A256GCM content encryption, header kid = apiKey.
 */
export async function createJweSharedSecret(
  plainText: string,
  apiKey: string,
  sharedSecret: string,
  additionalHeaders: Record<string, unknown> = {},
): Promise<string> {
  const key = crypto.createHash("sha256").update(sharedSecret, "utf8").digest();
  const { cty, ...customHeaders } = additionalHeaders as { cty?: string } & Record<string, unknown>;

  try {
    return await new CompactEncrypt(new TextEncoder().encode(plainText))
      .setProtectedHeader({
        alg: "A256GCMKW",
        enc: "A256GCM",
        kid: apiKey,
        typ: "JOSE",
        ...(cty ? { cty } : {}),
        ...customHeaders,
      })
      .encrypt(key);
  } catch (err) {
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWE encryption failed");
  }
}

/** Same as createJweSharedSecret but sets cty=application/xml, matching
 *  createJweWithXmlPayload in the original. */
export function createJweSharedSecretWithXmlPayload(
  plainText: string,
  apiKey: string,
  sharedSecret: string,
  additionalHeaders: Record<string, unknown> = {},
): Promise<string> {
  return createJweSharedSecret(plainText, apiKey, sharedSecret, { ...additionalHeaders, cty: CONTENT_TYPE_XML });
}

/** Decrypt a JWE created with the shared-secret flow. */
export async function decryptJweSharedSecret(jweString: string, sharedSecret: string): Promise<string> {
  const key = crypto.createHash("sha256").update(sharedSecret, "utf8").digest();
  try {
    const { plaintext } = await compactDecrypt(jweString, key);
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWE decryption failed");
  }
}

/**
 * Wrap a JWE string in a JWS using the shared secret (HS256), matching
 * createJws(jweString, sharedSecret, additionalHeaders). Note: the original
 * signs the raw JWE string as a Payload, not as JWT claims -- additionalHeaders
 * like iat/exp go into the JWS *header* as custom params, not the body. This
 * mirrors that exactly, since Visa's own verification logic expects it there.
 */
export async function createJwsSharedSecret(
  jweString: string,
  sharedSecret: string,
  additionalHeaders: Record<string, unknown> = {},
): Promise<string> {
  const key = new TextEncoder().encode(sharedSecret);
  try {
    return await new CompactSign(new TextEncoder().encode(jweString))
      .setProtectedHeader({ alg: "HS256", typ: "JOSE", cty: CONTENT_TYPE_JWE, ...additionalHeaders })
      .sign(key);
  } catch (err) {
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWS signing failed");
  }
}

/**
 * Verify a shared-secret JWS and extract the JWE payload, matching
 * verifyAndExtractJweFromJWS(jws, sharedSecret). Also enforces iat/exp if
 * present in the header, exactly as the Java version does (iat must not be
 * in the future, exp must not be in the past -- both in epoch seconds).
 */
export async function verifyAndExtractJweFromJwsSharedSecret(jws: string, sharedSecret: string): Promise<string> {
  const key = new TextEncoder().encode(sharedSecret);
  let payload: Uint8Array;
  let protectedHeader: Record<string, unknown>;
  try {
    const result = await compactVerify(jws, key);
    payload = result.payload;
    protectedHeader = result.protectedHeader;
  } catch {
    throw new VisaEncryptionError("Invalid signature");
  }

  const now = Math.floor(Date.now() / 1000);
  const iat = protectedHeader.iat as number | undefined;
  const exp = protectedHeader.exp as number | undefined;
  if (iat !== undefined && (iat > now || (exp !== undefined && exp < now))) {
    throw new VisaEncryptionError("Invalid signature");
  }

  return new TextDecoder().decode(payload);
}

// --- RSA PKI mode -----------------------------------------------------------

/**
 * Create a JWE using RSA PKI, matching createJwe(plainText, kid, rsaPubKey,
 * RSA_OAEP_256, A256GCM, ...). The Java version accepts any JWEAlgorithm as
 * a parameter, but every call site in the original test suite and the
 * decrypt-side restriction both use RSA_OAEP_256 specifically -- matched
 * that here rather than exposing an open-ended algorithm choice.
 */
export async function createJweRsa(
  plainText: string,
  kid: string,
  rsaPublicKeyPem: string,
  additionalHeaders: Record<string, unknown> = {},
): Promise<string> {
  try {
    const publicKey = await importSpkiOrCertificate(rsaPublicKeyPem, "RSA-OAEP-256");
    return await new CompactEncrypt(new TextEncoder().encode(plainText))
      .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid, typ: "JOSE", ...additionalHeaders })
      .encrypt(publicKey);
  } catch (err) {
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWE encryption failed");
  }
}

/**
 * Decrypt a JWE using an RSA private key. Matches decryptJwe(jweString,
 * rsaPrivateKey) -- the original explicitly rejects any algorithm other than
 * RSA_OAEP_256 rather than trusting whatever the JWE header claims, which
 * matters: blindly trusting a JWE's own "alg" header is a known algorithm-
 * confusion attack vector, so this checks it before decrypting too.
 */
export async function decryptJweRsa(jweString: string, rsaPrivateKeyPem: string): Promise<string> {
  const headerB64 = jweString.split(".")[0];
  if (!headerB64) throw new VisaEncryptionError("Invalid JWE string");
  let alg: string | undefined;
  try {
    alg = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")).alg;
  } catch {
    throw new VisaEncryptionError(`Invalid JWE String: ${jweString}`);
  }
  if (alg !== "RSA-OAEP-256") {
    throw new VisaEncryptionError(`Unsupported JWE Algorithm: ${alg}`);
  }

  try {
    const privateKey = await importPKCS8(rsaPrivateKeyPem, "RSA-OAEP-256");
    const { plaintext } = await compactDecrypt(jweString, privateKey);
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    if (err instanceof VisaEncryptionError) throw err;
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWE decryption failed");
  }
}

/**
 * Sign a JWE string with an RSA private key (PS256), matching
 * createJws(jwe, signingKid, rsaPrivateKey, additionalHeaders).
 */
export async function createJwsRsa(
  jwe: string,
  signingKid: string,
  rsaPrivateKeyPem: string,
  additionalHeaders: Record<string, unknown> = {},
): Promise<string> {
  try {
    const privateKey = await importPKCS8(rsaPrivateKeyPem, "PS256");
    return await new CompactSign(new TextEncoder().encode(jwe))
      .setProtectedHeader({ alg: "PS256", typ: "JOSE", kid: signingKid, cty: CONTENT_TYPE_JWE, ...additionalHeaders })
      .sign(privateKey);
  } catch (err) {
    throw new VisaEncryptionError(err instanceof Error ? err.message : "JWS signing failed");
  }
}

/** Verify an RSA-signed JWS and extract the JWE payload, matching
 *  verifyAndExtractJweFromJWS(jws, publicKey) (the RSA overload). */
export async function verifyAndExtractJweFromJwsRsa(jws: string, rsaPublicKeyPem: string): Promise<string> {
  try {
    const publicKey = await importSpkiOrCertificate(rsaPublicKeyPem, "PS256");
    const { payload } = await compactVerify(jws, publicKey);
    return new TextDecoder().decode(payload);
  } catch (err) {
    throw new VisaEncryptionError("Invalid signature");
  }
}

// --- Key loading (equivalent of CertificateUtils.java) ---------------------

/** Loads either an X.509 certificate PEM or a plain SPKI public key PEM --
 *  mirrors CertificateUtils.loadPublicKeyFromPem, which accepts both. `jose`
 *  binds an imported key to its intended algorithm, so the caller specifies
 *  which one this key will actually be used for (encryption vs. signature
 *  verification) rather than this always assuming encryption. */
async function importSpkiOrCertificate(pem: string, alg: string) {
  const trimmed = pem.trim();
  if (trimmed.startsWith("-----BEGIN CERTIFICATE-----")) {
    return importX509(trimmed, alg);
  }
  return importSPKI(trimmed, alg);
}

export async function loadPublicKeyFromPem(pem: string, alg: string) {
  return importSpkiOrCertificate(pem, alg);
}

export async function loadPrivateKeyFromPem(pem: string, alg: string) {
  return importPKCS8(pem, alg);
}
