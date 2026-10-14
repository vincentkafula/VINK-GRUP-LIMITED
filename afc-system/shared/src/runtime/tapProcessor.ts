import { uuid } from "../crypto/prims";
import { chargeFare, openCardForFare } from "../desfire/cardOps";
import { STATUS } from "../desfire/constants";
import type { CardState } from "../desfire/layout";
import { DesfireError, DesfireSession, type Transceiver } from "../desfire/session";
import { evaluateTap, type DenyReason } from "../fare/engine";
import type { KeyProvider } from "../keys";
import { formatRand } from "../money";
import type { SyncTransaction } from "../sync";
import type { Feedback, TapStore } from "./types";

export type TapOutcome =
  | { status: "charged"; txn: SyncTransaction; message: string }
  | { status: "already_paid"; txn: SyncTransaction; message: string }
  | { status: "denied"; reason: SyncTransaction["denyReason"]; message: string }
  | { status: "retry"; message: string }
  | { status: "unconfigured"; message: string };

export interface TapDeps {
  keys: KeyProvider;
  store: TapStore;
  feedback: Feedback;
  deviceId: string;
  /** Current route and stop (the stop can change while the vehicle moves). */
  place: () => { routeId: number; stopId: number };
  now?: () => number;                   // epoch seconds
}

export const deviceTagOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return h; };

/**
 * One card tap, start to finish. The order of the steps is what keeps money safe:
 *
 *  1. hotlist check   (before touching the card)
 *  2. prove the card is ours: authenticate with its own diversified key; a UID alone is never trusted
 *  3. work out the fare from the card's balance and tap record, using the local fare table (works offline)
 *  4. WRITE AN INTENT to disk: "I am about to take this fare; the card's counter will become N"
 *  5. debit + new tap record + commit, as one atomic transaction on the card
 *  6. on success: turn the intent into a queued transaction.
 *     If the card is pulled away, or the reply is lost AFTER the commit was sent, the outcome is unknown. The intent stays. The next time the
 *     card is read, its counter says what really happened: counter == N means the fare WAS taken (the passenger is not charged again and the
 *     transaction is recorded), counter < N means it was not (the intent is dropped and the tap is processed normally).
 */
export class TapProcessor {
  constructor(private readonly d: TapDeps) {}
  private now() { return (this.d.now ?? (() => Math.floor(Date.now() / 1000)))(); }

  async handle(uid: Buffer, transceiver: Transceiver): Promise<TapOutcome> {
    const { store, feedback } = this.d;
    const uidHex = uid.toString("hex");
    const table = store.fareTable();
    if (!table) { feedback.fail("Not configured yet"); return { status: "unconfigured", message: "No fare table yet: waiting for the first sync" }; }
    const { routeId, stopId } = this.d.place();
    feedback.busy();

    const record = (over: Partial<SyncTransaction>): SyncTransaction => ({
      id: uuid(), deviceId: this.d.deviceId, deviceSeq: store.nextSeq(), cardUid: uidHex, result: "denied", routeId, stopId, fare: 0, penalty: 0,
      balanceBefore: 0, balanceAfter: 0, cardCounter: 0, category: store.categoryOf(uidHex), tappedAt: new Date(this.now() * 1000).toISOString(),
      fareTableVersion: table.version, offline: !store.online, ...over,
    });
    const deny = (reason: NonNullable<SyncTransaction["denyReason"]>, message: string, extra: Partial<SyncTransaction> = {}): TapOutcome => {
      store.enqueue(record({ denyReason: reason, ...extra }));
      feedback.fail(message);
      return { status: "denied", reason, message };
    };

    if (store.isHotlisted(uidHex)) return deny("CARD_BLOCKED", "Card blocked");

    const session = new DesfireSession(transceiver);
    let open: { balance: number; state: CardState };
    try {
      open = await openCardForFare(session, uid, this.d.keys);
    } catch (e) {
      if (e instanceof DesfireError) return deny("INVALID_CARD", "Card not recognised");      // wrong keys, no fare application, damaged data
      feedback.fail("Tap again"); return { status: "retry", message: "The card moved away while it was being read" };
    }

    // an earlier attempt on this card whose result we never saw
    const pending = store.getIntent(uidHex);
    if (pending) {
      if (open.state.counter === pending.expectedCounter) {
        store.deleteIntent(uidHex);
        store.enqueue({ ...pending.txn, balanceAfter: open.balance });
        await store.durable();
        feedback.success(`Already paid ${formatRand(pending.fare)} · Bal ${formatRand(open.balance)}`);
        return { status: "already_paid", txn: pending.txn, message: "The earlier tap had worked; not charged again" };
      }
      store.deleteIntent(uidHex);                                                               // it never reached the card
    }

    const category = store.categoryOf(uidHex);
    const decision = evaluateTap({ table, routeId, stopId, now: this.now(), category, balance: open.balance, state: open.state, deviceTag: deviceTagOf(this.d.deviceId) });
    if (!decision.ok) return deny(decision.reason as DenyReason, decision.message, { balanceBefore: open.balance, balanceAfter: open.balance, cardCounter: open.state.counter });

    const txn = record({
      result: "ok", kind: decision.kind, fare: decision.fare, penalty: decision.penalty, balanceBefore: open.balance, balanceAfter: open.balance - decision.fare,
      cardCounter: decision.newState.counter, category,
    });
    store.putIntent({ uid: uidHex, txnId: txn.id, expectedCounter: decision.newState.counter, balanceBefore: open.balance, fare: decision.fare, txn, createdAt: Date.now() });
    await store.durable();                                    // the intent must reach storage BEFORE the card's balance is touched
    try {
      await chargeFare(session, decision.fare, decision.newState);
    } catch (e) {
      if (e instanceof DesfireError && e.status === STATUS.BOUNDARY_ERROR) {                  // the card disagrees about the balance: nothing was taken
        store.deleteIntent(uidHex);
        return deny("INSUFFICIENT_FUNDS", "Balance too low", { balanceBefore: open.balance, balanceAfter: open.balance, cardCounter: open.state.counter });
      }
      if (e instanceof DesfireError && e.status !== STATUS.INTEGRITY_ERROR) { store.deleteIntent(uidHex); feedback.fail("Tap again"); return { status: "retry", message: "The card refused the update" }; }
      feedback.fail("Tap again — hold the card still");                                     // outcome unknown: the intent stays until the card is read again
      return { status: "retry", message: "The card was removed before the result was known" };
    }
    store.deleteIntent(uidHex);
    store.enqueue(txn);
    await store.durable();
    feedback.success(decision.message);
    return { status: "charged", txn, message: decision.message };
  }
}
