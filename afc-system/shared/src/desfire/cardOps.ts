import type { KeyProvider } from "../keys";
import { COMM } from "./constants";
import { DesfireSession } from "./session";
import {
  AES_FLAG, AFC_AID, APP_KEY_SETTINGS, BALANCE_ACCESS, BALANCE_MAX, BALANCE_MIN, CardState, EMPTY_STATE, FILE, KEY, KEY_COUNT, STATE_ACCESS, STATE_SIZE,
  accessBytes, decodeState, encodeState,
} from "./layout";

export interface PersonalizeOptions {
  initialBalance?: number;
  /** The card's current master key. A factory card has sixteen zero bytes. A re-personalised card has its diversified PICC key. */
  currentPiccKey?: Buffer;
  /** Wipe an existing AFC application first. */
  reformat?: boolean;
}

/**
 * Prepares a blank (or re-used) DESFire card for fares: creates the application, the balance and tap-record files, replaces the factory
 * keys with this card's own diversified keys, then proves it by reading the balance back with the validator key.
 * Sequence matters: application keys first, the card master key last, so a failure part-way leaves a card that can still be reset.
 */
export async function personalizeCard(session: DesfireSession, uid: Buffer, keys: KeyProvider, o: PersonalizeOptions = {}): Promise<{ uid: string; balance: number }> {
  const initial = o.initialBalance ?? 0;
  if (!Number.isInteger(initial) || initial < BALANCE_MIN || initial > BALANCE_MAX) throw new Error("Initial balance is outside the allowed range");
  const factory = o.currentPiccKey ?? Buffer.alloc(16);
  const zeros = Buffer.alloc(16);

  await session.selectApplication(Buffer.alloc(3));
  await session.authenticate(0, factory);
  if (o.reformat) await session.formatCard();
  await session.createApplication(AFC_AID, APP_KEY_SETTINGS, AES_FLAG | KEY_COUNT);

  await session.selectApplication(AFC_AID);
  await session.authenticate(KEY.ADMIN, zeros);
  await session.createValueFile({ fileNo: FILE.BALANCE, comm: COMM.MACED, access: accessBytes(BALANCE_ACCESS), lower: BALANCE_MIN, upper: BALANCE_MAX, initial });
  await session.createBackupFile({ fileNo: FILE.STATE, comm: COMM.MACED, access: accessBytes(STATE_ACCESS), size: STATE_SIZE });

  const debit = await keys.cardKey(uid, "DEBIT"), credit = await keys.cardKey(uid, "CREDIT"), admin = await keys.cardKey(uid, "ADMIN");
  await session.changeKey(KEY.DEBIT, debit, 1, zeros);
  await session.changeKey(KEY.CREDIT, credit, 1, zeros);
  await session.changeKey(KEY.ADMIN, admin, 1);               // the key this session used: ends the session

  await session.selectApplication(Buffer.alloc(3));
  await session.authenticate(0, factory);
  await session.changeKey(0, await keys.cardKey(uid, "PICC"), 1, undefined, true);

  // prove it: the validator key must now read what we wrote
  await session.selectApplication(AFC_AID);
  await session.authenticate(KEY.DEBIT, debit);
  const balance = await session.getValue(FILE.BALANCE);
  if (balance !== initial) throw new Error(`Verification failed: the card reports ${balance} cents, expected ${initial}`);
  return { uid: uid.toString("hex"), balance };
}

/** Reads the balance and tap record with the validator (DEBIT) key. Leaves the session authenticated for chargeFare. */
export async function openCardForFare(session: DesfireSession, uid: Buffer, keys: KeyProvider): Promise<{ balance: number; state: CardState }> {
  await session.selectApplication(AFC_AID);
  await session.authenticate(KEY.DEBIT, await keys.cardKey(uid, "DEBIT"));
  const balance = await session.getValue(FILE.BALANCE);
  const raw = await session.readData(FILE.STATE, 0, STATE_SIZE);
  const state = raw[0] === 0 ? { ...EMPTY_STATE } : decodeState(raw);
  return { balance, state };
}

/**
 * Takes the fare and writes the new tap record in ONE transaction: both change together at commit, or neither does.
 * Throws if the card leaves the field before the commit; check the outcome with openCardForFare on the next tap if the commit itself was sent.
 */
export async function chargeFare(session: DesfireSession, amount: number, newState: CardState): Promise<void> {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Invalid fare");
  if (amount > 0) await session.debit(FILE.BALANCE, amount);
  await session.writeData(FILE.STATE, 0, encodeState(newState));
  await session.commit();
}

/** Adds money with the CREDIT key and returns the new balance. */
export async function topUpCard(session: DesfireSession, uid: Buffer, keys: KeyProvider, amount: number): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid top-up amount");
  await session.selectApplication(AFC_AID);
  await session.authenticate(KEY.CREDIT, await keys.cardKey(uid, "CREDIT"));
  await session.credit(FILE.BALANCE, amount);
  await session.commit();
  return session.getValue(FILE.BALANCE);
}

/** Reads the balance only, with the CREDIT key (for kiosks that sit with the top-up terminal). */
export async function readBalanceWithCreditKey(session: DesfireSession, uid: Buffer, keys: KeyProvider): Promise<number> {
  await session.selectApplication(AFC_AID);
  await session.authenticate(KEY.CREDIT, await keys.cardKey(uid, "CREDIT"));
  return session.getValue(FILE.BALANCE);
}
