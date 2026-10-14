import { uuid } from "../crypto/prims";
import type { KeyProvider } from "../keys";
import type { SyncTransaction } from "../sync";
import { decodeTicket, markTicketUsed, publicKeyFromHex, readTicket, verifyTicket, type TicketRead } from "../ticket/ticket";
import type { UltralightIo } from "../ticket/ultralight";
import type { Feedback, TapStore } from "./types";
import { deviceTagOf, type TapOutcome } from "./tapProcessor";

export interface TicketDeps {
  keys: KeyProvider;               // needs the TICKET master key: it derives each card's write password
  store: TapStore;
  feedback: Feedback;
  deviceId: string;
  place: () => { routeId: number; stopId: number };
  now?: () => number;
}

/**
 * One tap of a single-trip Ultralight ticket. Everything is checked from the card and the device's own copy of the public keys, so it works offline:
 *
 *   blocked card?  genuine (signature, bound to this card's UID)?  right route?  inside its dates?  not already used (on the card AND on this device)?
 *
 * then the card is written "used" (password-protected write, time first, flag last) and read back. A device only holds the public key, so it can check
 * a ticket but never make one. A copied ticket whose original was used on THIS device is caught by the local record; one used elsewhere is caught
 * when the server sees the same ticket number twice (flagged HIGH). A card pulled away mid-write is allowed one more try on this device.
 */
export class TicketProcessor {
  constructor(private readonly d: TicketDeps) {}
  private now() { return (this.d.now ?? (() => Math.floor(Date.now() / 1000)))(); }

  async handle(io: UltralightIo): Promise<TapOutcome> {
    const { store, feedback } = this.d;
    const { routeId, stopId } = this.d.place();
    let read: TicketRead;
    try { read = await readTicket(io); }
    catch { feedback.fail("Tap again"); return { status: "retry", message: "The ticket could not be read" }; }
    const uidHex = read.uid.toString("hex");
    const known = store.ticketKeys();

    const record = (over: Partial<SyncTransaction>): SyncTransaction => ({
      id: uuid(), deviceId: this.d.deviceId, deviceSeq: store.nextSeq(), cardUid: uidHex, result: "denied", routeId, stopId, fare: 0, penalty: 0, balanceBefore: 0, balanceAfter: 0, cardCounter: 0,
      category: "adult", tappedAt: new Date(this.now() * 1000).toISOString(), fareTableVersion: store.fareTableVersion, offline: !store.online, ...over,
    });
    const deny = (reason: NonNullable<SyncTransaction["denyReason"]>, message: string, ticketId?: number): TapOutcome => {
      store.enqueue(record({ denyReason: reason, ticketId }));
      feedback.fail(message);
      return { status: "denied", reason, message };
    };

    if (known.size === 0) { feedback.fail("Tickets not set up yet"); return { status: "unconfigured", message: "No ticket keys yet: waiting for the first sync" }; }
    if (store.isHotlisted(uidHex)) return deny("CARD_BLOCKED", "Card blocked");

    const t = read.ticket ?? decodeTicket(read.data);
    const keyHex = t ? known.get(t.keyId) : undefined;
    if (read.blank || !t || !keyHex) return deny("INVALID_TICKET", "Not a valid ticket");
    let genuine = false;
    try { genuine = verifyTicket(publicKeyFromHex(keyHex), read.data, read.signature, read.uid); } catch { genuine = false; }
    if (!genuine) return deny("INVALID_TICKET", "Not a valid ticket");

    const now = this.now();
    if (store.isVoided(t.ticketId)) return deny("TICKET_VOID", "Ticket cancelled", t.ticketId);
    if (t.routeId !== 0 && t.routeId !== routeId) return deny("TICKET_WRONG_ROUTE", "Wrong route", t.ticketId);
    if (now < t.validFrom) return deny("TICKET_NOT_YET_VALID", "Not valid yet", t.ticketId);
    if (now > t.validUntil) return deny("TICKET_EXPIRED", "Ticket expired", t.ticketId);
    if (read.used) return deny("TICKET_USED", "Ticket already used", t.ticketId);
    if (store.ticketUse(t.ticketId)?.completed) return deny("TICKET_USED", "Ticket already used", t.ticketId);

    store.startTicketUse(t.ticketId);
    await store.durable();
    try { await markTicketUsed(io, this.d.keys, now, deviceTagOf(this.d.deviceId)); }
    catch { feedback.fail("Tap again, hold still"); return { status: "retry", message: "The card was removed before the ticket could be marked used" }; }
    store.completeTicketUse(t.ticketId);

    const txn = record({ result: "ok", kind: "ticket", ticketId: t.ticketId });
    store.enqueue(txn);
    await store.durable();
    const offset = (store.fareTable()?.utcOffsetMinutes ?? 120) * 60;
    const until = new Date((t.validUntil + offset) * 1000).toISOString().slice(11, 16);
    feedback.success(`Ticket OK · valid until ${until}`);
    return { status: "charged", txn, message: "Ticket accepted" };
  }
}
