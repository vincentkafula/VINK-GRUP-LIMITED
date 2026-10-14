import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { MAGIC } from "./ticket";

/**
 * Making tickets: Node-only, and only ever on the server. Validators and terminals import ticket.ts (verification) and never this file, so a
 * device cannot sign a ticket even by accident. Import from "@afc/shared/node".
 */
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

export function generateTicketKeyPair(): { privateKeyBase64: string; publicKeyHex: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKeyBase64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"), publicKeyHex: publicKey.export({ format: "der", type: "spki" }).subarray(SPKI.length).toString("hex") };
}
export const privateKeyFromBase64 = (b64: string): KeyObject => createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
/** A private key from a 32-byte seed (development: derive it from a secret so it survives restarts). */
export const privateKeyFromSeed = (seed: Buffer): KeyObject => createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: "der", type: "pkcs8" });
export const publicKeyHexOf = (priv: KeyObject): string => createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(SPKI.length).toString("hex");

export const signTicket = (priv: KeyObject, data: Buffer, uid: Buffer): Buffer => sign(null, Buffer.concat([MAGIC, data, uid]), priv);
