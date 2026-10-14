import { ACCESS } from "./constants";

/**
 * How an AFC fare card is laid out. One DESFire application holds everything; three AES keys, each derived from the master key
 * for this one card (see KeyProvider), each good for one job:
 *
 *   key 0  ADMIN   application master: creates files, changes keys. Only the personalisation station uses it.
 *   key 1  DEBIT   validators: read the balance and tap record, take a fare, write the tap record. Cannot add money.
 *   key 2  CREDIT  top-up agents: add money, read the balance. Cannot write the tap record.
 *
 * A stolen validator can take fares from cards it can reach but can never add money, and a top-up terminal never needs the spending key.
 * (DESFire value files cannot give "read only" to a key that may not also debit, so inspection uses a validator in inspect mode.)
 */
export const AFC_AID = Buffer.from([0x4b, 0x56, 0x01]);
export const SYSTEM_IDENTIFIER = Buffer.from("AFC-VINK1", "ascii");

export const KEY = { ADMIN: 0, DEBIT: 1, CREDIT: 2 } as const;
export type KeyRole = keyof typeof KEY;
export const KEY_COUNT = 3;

export const FILE = { BALANCE: 1, STATE: 2 } as const;

/** Balance limits in cents: never below zero, never above R 5 000.00 on one card. */
export const BALANCE_MIN = 0;
export const BALANCE_MAX = 500_000;

/** Application key settings: master key changeable, configuration changeable, keys changed with the application master key. */
export const APP_KEY_SETTINGS = 0x09;
export const AES_FLAG = 0x80;

/**
 * Access rights per file as (Read, Write, ReadWrite, Change).
 * Balance: GetValue and Debit need Read, Write or ReadWrite; Credit needs Write or ReadWrite.
 *          Read = DEBIT key, Write = CREDIT key, ReadWrite = nobody, Change = ADMIN.
 * Tap record: read and written by the DEBIT key only.
 */
export const BALANCE_ACCESS = { read: KEY.DEBIT, write: KEY.CREDIT, readWrite: ACCESS.DENY, change: KEY.ADMIN };
export const STATE_ACCESS = { read: KEY.DEBIT, write: KEY.DEBIT, readWrite: KEY.DEBIT, change: KEY.ADMIN };

export const accessBytes = (a: { read: number; write: number; readWrite: number; change: number }) =>
  Buffer.from([((a.readWrite & 0xf) << 4) | (a.change & 0xf), ((a.read & 0xf) << 4) | (a.write & 0xf)]);

/** The tap record kept on the card (file 2, 16 bytes). Lets a validator work out tap-out fares and block quick re-taps with no network. */
export const STATE_SIZE = 16;
export interface CardState {
  version: number;
  /** false = not on a trip, true = tapped in and not yet out. */
  inTrip: boolean;
  tapInEpoch: number;
  routeId: number;
  boardStopId: number;
  /** Counts every successful tap on this card; the server uses it to spot cloned or replayed cards. */
  counter: number;
  /** Low 16 bits of the device number that wrote the record. */
  deviceTag: number;
}

export function encodeState(s: CardState): Buffer {
  const b = Buffer.alloc(STATE_SIZE);
  b[0] = s.version; b[1] = s.inTrip ? 1 : 0;
  b.writeUInt32LE(s.tapInEpoch >>> 0, 2); b.writeUInt16LE(s.routeId, 6); b.writeUInt16LE(s.boardStopId, 8);
  b.writeUInt32LE(s.counter >>> 0, 10); b.writeUInt16LE(s.deviceTag & 0xffff, 14);
  return b;
}
export function decodeState(b: Buffer): CardState {
  if (b.length !== STATE_SIZE) throw new Error("tap record has the wrong size");
  return { version: b[0], inTrip: b[1] === 1, tapInEpoch: b.readUInt32LE(2), routeId: b.readUInt16LE(6), boardStopId: b.readUInt16LE(8), counter: b.readUInt32LE(10), deviceTag: b.readUInt16LE(14) };
}
export const EMPTY_STATE: CardState = { version: 1, inTrip: false, tapInEpoch: 0, routeId: 0, boardStopId: 0, counter: 0, deviceTag: 0 };
