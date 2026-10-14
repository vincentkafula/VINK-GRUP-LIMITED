import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Category, FareTable } from "./fare/types";
import type { TapKind, DenyReason } from "./fare/engine";

/** One tap as the validator reports it. `id` is the idempotency key: the server stores each id at most once, however often it is sent. */
export interface SyncTransaction {
  id: string;
  deviceId: string;
  /** Per-device counter, strictly increasing; gaps show a lost transaction. */
  deviceSeq: number;
  cardUid: string;
  result: "ok" | "denied";
  kind?: TapKind;
  denyReason?: DenyReason | "CARD_BLOCKED" | "INVALID_CARD" | "READ_ERROR";
  routeId: number;
  stopId: number;
  /** Cents taken from the card in this tap (penalty included). */
  fare: number;
  penalty: number;
  balanceBefore: number;
  balanceAfter: number;
  /** The card's own tap counter after this tap. */
  cardCounter: number;
  category: Category;
  tappedAt: string;
  fareTableVersion: number;
  /** True if the device could not reach the server when this tap happened. */
  offline: boolean;
}

export interface SyncRequest {
  deviceId: string;
  batch: SyncTransaction[];
  hotlistVersion: number;
  fareTableVersion: number;
  profilesVersion: number;
}

export interface SyncRejection { id: string; reason: string }
export interface SyncResponse {
  accepted: string[];
  duplicates: string[];
  rejected: SyncRejection[];
  serverTime: string;
  /** Present when the device's copy is out of date. */
  hotlist?: { version: number; uids: string[] };
  fareTable?: FareTable;
  profiles?: { version: number; cards: { uid: string; category: Category }[] };
}

/* ───────── request signing ───────── */

export const sha256Hex = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** HMAC-SHA256 over `timestamp.nonce.sha256(body)`: binds the signature to this exact body and moment. */
export function signRequest(secret: Buffer, timestamp: number, nonce: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${sha256Hex(body)}`).digest("hex");
}

export function verifySignature(secret: Buffer, timestamp: number, nonce: string, body: string, signature: string): boolean {
  const want = Buffer.from(signRequest(secret, timestamp, nonce, body), "hex");
  const got = Buffer.from(/^[0-9a-f]{64}$/i.test(signature) ? signature : "", "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * A device's signing secret is derived, not stored: HMAC(serverMasterKey, "afc-device|id|rotation"). Nothing secret sits in the database;
 * revoking a device (or a stolen one) means bumping its rotation number, which makes the old secret useless.
 */
export const deviceSecret = (master: Buffer, deviceId: string, rotation: number): Buffer =>
  createHmac("sha256", master).update(`afc-device|${deviceId}|${rotation}`).digest();

export const MAX_CLOCK_SKEW_SECONDS = 300;
