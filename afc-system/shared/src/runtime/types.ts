import type { Category, FareTable } from "../fare/types";
import type { SyncTransaction } from "../sync";

/** What the passenger sees and hears. Implemented per device: console, Raspberry Pi LEDs and buzzer, the P18Q's screen, LEDs and beeper. */
export interface Feedback {
  success(message: string): void;
  fail(message: string): void;
  /** Card detected, working on it. */
  busy(): void;
}

/** A fare the device has started to take but has not seen confirmed (see TapProcessor). */
export interface Intent { uid: string; txnId: string; expectedCounter: number; balanceBefore: number; fare: number; txn: SyncTransaction; createdAt: number }

/**
 * The device's own memory. Every operation is synchronous so the tap flow reads like the steps it is; durability is a separate, awaited call:
 * `durable()` resolves once everything written so far would survive a power cut. A SQLite store (fsync on every write) resolves at once; a store
 * on a platform without synchronous disk access (the P18Q web view) writes to a journal and resolves when the journal has reached storage.
 * The tap flow awaits it at the two moments it matters: after writing an intent (before touching the card's balance) and after queueing a tap.
 */
export interface TapStore {
  durable(): Promise<void>;
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
  nextSeq(): number;

  readonly hotlistVersion: number;
  readonly profilesVersion: number;
  readonly fareTableVersion: number;
  readonly ticketKeysVersion: number;
  readonly voidedVersion: number;
  readonly online: boolean;
  setOnline(v: boolean): void;

  enqueue(t: SyncTransaction): void;
  pending(limit?: number): SyncTransaction[];
  pendingCount(): number;
  markSent(ids: string[]): void;
  markRejected(id: string, reason: string): void;
  trimSent(olderThanMs?: number): void;

  putIntent(i: Intent): void;
  getIntent(uid: string): Intent | undefined;
  deleteIntent(uid: string): void;
  openIntents(): number;

  setHotlist(version: number, uids: string[]): void;
  isHotlisted(uid: string): boolean;
  setProfiles(version: number, cards: { uid: string; category: Category }[]): void;
  categoryOf(uid: string): Category;
  setFareTable(t: FareTable): void;
  fareTable(): FareTable | undefined;

  setTicketKeys(version: number, keys: { id: number; publicKey: string }[]): void;
  ticketKeys(): Map<number, string>;
  ticketUse(id: number): { completed: boolean } | undefined;
  startTicketUse(id: number): void;
  completeTicketUse(id: number): void;
  setVoidedTickets(version: number, ids: number[]): void;
  isVoided(id: number): boolean;
}
