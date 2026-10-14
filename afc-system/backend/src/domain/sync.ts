import { CATEGORIES, type FareTable, type SyncResponse, type SyncTransaction } from "@afc/shared";
import { z } from "zod";
import type { Db, Tx } from "../db";
import { isUniqueViolation } from "../db";
import { raiseAnomaly } from "./anomalies";
import { currentFareVersion, publishedFareTable } from "./fares";
import { cardAccount, cardBalance, postJournal, routeRevenue } from "./ledger";
import type { FeedHub } from "./events";
import { getVersion } from "./settings";
import { voidedTicketList } from "./tickets";

const uid = z.string().regex(/^[0-9a-f]{14}$/);
export const txnSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  deviceId: z.string().min(3).max(32),
  deviceSeq: z.number().int().min(0),
  cardUid: uid,
  result: z.enum(["ok", "denied"]),
  kind: z.enum(["flat", "tap_in", "tap_out", "penalty_tap_in", "ticket"]).optional(),
  ticketId: z.number().int().min(1).optional(),
  denyReason: z.enum(["UNKNOWN_ROUTE", "UNKNOWN_STOP", "DUPLICATE_TAP", "INSUFFICIENT_FUNDS", "CARD_BLOCKED", "INVALID_CARD", "READ_ERROR", "INVALID_TICKET", "TICKET_USED", "TICKET_EXPIRED", "TICKET_NOT_YET_VALID", "TICKET_WRONG_ROUTE", "TICKET_VOID"]).optional(),
  routeId: z.number().int().min(0).max(65535),
  stopId: z.number().int().min(0).max(65535),
  fare: z.number().int().min(0).max(1_000_000),
  penalty: z.number().int().min(0).max(1_000_000),
  balanceBefore: z.number().int().min(0).max(10_000_000),
  balanceAfter: z.number().int().min(0).max(10_000_000),
  cardCounter: z.number().int().min(0).max(4_294_967_295),
  category: z.enum(CATEGORIES),
  tappedAt: z.string().datetime(),
  fareTableVersion: z.number().int().min(0),
  offline: z.boolean(),
}) satisfies z.ZodType<SyncTransaction>;

export const syncSchema = z.object({
  deviceId: z.string().min(3).max(32),
  batch: z.array(z.unknown()).max(500),
  hotlistVersion: z.number().int().min(-1),
  fareTableVersion: z.number().int().min(0),
  profilesVersion: z.number().int().min(-1),
  ticketKeysVersion: z.number().int().min(0).optional(),
  voidedVersion: z.number().int().min(0).optional(),
});

export interface SyncDeps { db: Db; hub?: FeedHub; autoBlockAt: number; now?: () => Date }
type One = "accepted" | "duplicate" | { rejected: string };

/** The most a single tap on this route could legitimately take: the dearest fare at the dearest time of day, plus a penalty for an unfinished trip. */
function fareCeiling(table: FareTable, routeId: number): number {
  const r = table.routes.find((x) => x.id === routeId);
  if (!r) return Number.POSITIVE_INFINITY;
  const peak = Math.max(10000, ...table.timeRules.map((t) => t.multiplierBp)) / 10000;
  const base = r.fare.mode === "flat" ? r.fare.flatAmount : r.fare.maxFare;
  const penalty = Math.max(0, ...table.routes.map((x) => (x.fare.mode === "zone" ? x.fare.maxFare : 0)));
  return Math.ceil(base * peak) + penalty;
}

export async function processBatch(deps: SyncDeps, deviceId: string, rawBatch: unknown[]): Promise<Pick<SyncResponse, "accepted" | "duplicates" | "rejected">> {
  const accepted: string[] = [], duplicates: string[] = [], rejected: { id: string; reason: string }[] = [];
  const tables = new Map<number, FareTable | null>();
  const parsed: SyncTransaction[] = [];
  for (const item of rawBatch) {
    const p = txnSchema.safeParse(item);
    const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "?";
    if (!p.success) rejected.push({ id, reason: "malformed: " + p.error.issues[0]?.message });
    else if (p.data.deviceId !== deviceId) rejected.push({ id, reason: "this transaction belongs to another device" });
    else parsed.push(p.data);
  }
  parsed.sort((a, b) => a.deviceSeq - b.deviceSeq || a.tappedAt.localeCompare(b.tappedAt));

  const device = await deps.db.device.findUnique({ where: { id: deviceId } });
  let lastSeq = device?.lastSeq ?? 0;
  let seqGapNoted = false;
  for (const t of parsed) {
    if (!seqGapNoted && lastSeq > 0 && t.deviceSeq > lastSeq + 1 && t.deviceSeq !== 0) {
      seqGapNoted = true;
      await raiseAnomaly(deps.db, deps.hub, { kind: "DEVICE_SEQ_GAP", severity: "LOW", deviceId, detail: `Device sent #${t.deviceSeq} after #${lastSeq}: ${t.deviceSeq - lastSeq - 1} transaction(s) may be missing` }, deps.autoBlockAt);
    }
    let r: One;
    try {
      r = await deps.db.$transaction((tx) => processOne(deps, tx, tables, t), { timeout: 15_000 });
    } catch (e) {
      if (isUniqueViolation(e)) r = "duplicate";               // two retries of the same batch raced each other
      else { r = { rejected: "server error: " + (e instanceof Error ? e.message.slice(0, 120) : "unknown") }; }
    }
    if (r === "accepted") { accepted.push(t.id); lastSeq = Math.max(lastSeq, t.deviceSeq); }
    else if (r === "duplicate") { duplicates.push(t.id); lastSeq = Math.max(lastSeq, t.deviceSeq); }
    else rejected.push({ id: t.id, reason: r.rejected });
  }
  await deps.db.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date(), lastSeq } });
  return { accepted, duplicates, rejected };
}

async function processOne(deps: SyncDeps, tx: Tx, tables: Map<number, FareTable | null>, t: SyncTransaction): Promise<One> {
  const now = (deps.now ?? (() => new Date()))();
  if (await tx.txn.findUnique({ where: { id: t.id }, select: { id: true } })) return "duplicate";
  const tappedAt = new Date(t.tappedAt);
  if (tappedAt.getTime() > now.getTime() + 10 * 60_000) return { rejected: "the tap is dated in the future" };

  let card = await tx.card.findUnique({ where: { uid: t.cardUid } });
  if (!card) {
    card = await tx.card.create({ data: { uid: t.cardUid, holderName: null, issuedBy: "auto: first seen on a device" } });
    await raiseAnomaly(tx, deps.hub, { kind: "UNREGISTERED_CARD", severity: "MEDIUM", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail: "A card that passed the key check is not in the card registry" }, deps.autoBlockAt);
  }

  const row = await tx.txn.create({
    data: {
      id: t.id, deviceId: t.deviceId, deviceSeq: t.deviceSeq, cardUid: t.cardUid, result: t.result, kind: t.kind, denyReason: t.denyReason,
      routeId: t.routeId, stopId: t.stopId, fare: t.fare, penalty: t.penalty, balanceBefore: t.balanceBefore, balanceAfter: t.balanceAfter,
      cardCounter: t.cardCounter, category: t.category, tappedAt, fareTableVersion: t.fareTableVersion, offline: t.offline, ticketId: t.ticketId,
    },
  });

  if (t.result === "denied") {
    if (t.denyReason === "INVALID_CARD") await raiseAnomaly(tx, deps.hub, { kind: "CARD_AUTH_FAILED", severity: "MEDIUM", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail: "A card was presented that did not pass the key check" }, deps.autoBlockAt);
    if (t.denyReason === "INVALID_TICKET") await raiseAnomaly(tx, deps.hub, { kind: "TICKET_INVALID_PRESENTED", severity: "MEDIUM", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail: "A ticket was presented that failed the signature check (forged, altered, or copied to another card)" }, deps.autoBlockAt);
    if (t.denyReason === "TICKET_USED") await raiseAnomaly(tx, deps.hub, { kind: "TICKET_REUSE_ATTEMPT", severity: "LOW", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail: "A used ticket was presented again" }, deps.autoBlockAt);
    if (t.denyReason === "CARD_BLOCKED") await raiseAnomaly(tx, deps.hub, { kind: "BLOCKED_CARD_PRESENTED", severity: "LOW", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail: "A blocked card was presented" }, deps.autoBlockAt);
    deps.hub?.publish({ type: "tap", at: tappedAt.toISOString(), deviceId: t.deviceId, cardUid: t.cardUid, result: "denied", denyReason: t.denyReason, routeId: t.routeId, stopId: t.stopId, fare: 0, balanceAfter: t.balanceAfter, offline: t.offline });
    return "accepted";
  }

  // ───── a single-trip ticket was used: its fare was booked when it was sold, so the only thing to do here is to use it up, once ─────
  if (t.kind === "ticket") {
    const raiseT = (kind: string, detail: string) => raiseAnomaly(tx, deps.hub, { kind, severity: "HIGH", cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail }, deps.autoBlockAt);
    const ticket = t.ticketId ? await tx.ticket.findUnique({ where: { id: t.ticketId } }) : null;
    if (!ticket) await raiseT("UNKNOWN_TICKET", `A device used ticket ${t.ticketId ?? "?"}, which was never sold`);
    else if (ticket.cardUid !== t.cardUid) await raiseT("TICKET_UID_MISMATCH", `Ticket ${ticket.id} was sold for another card`);
    else {
      const used = await tx.ticket.updateMany({ where: { id: ticket.id, status: "ISSUED" }, data: { status: "USED", usedAt: tappedAt, usedDevice: t.deviceId } });
      if (used.count === 0) await raiseT("DUPLICATE_TICKET", `Ticket ${ticket.id} was already ${ticket.status === "USED" ? "used on " + (ticket.usedDevice ?? "a device") : ticket.status.toLowerCase()}: a copied ticket or a replayed record`);
    }
    deps.hub?.publish({ type: "tap", at: tappedAt.toISOString(), deviceId: t.deviceId, cardUid: t.cardUid, result: "ok", kind: "ticket", routeId: t.routeId, stopId: t.stopId, fare: 0, balanceAfter: 0, offline: t.offline });
    return "accepted";
  }

  // ───── a completed tap: the card has really been debited, so the books must follow ─────
  const raise = (kind: string, severity: "LOW" | "MEDIUM" | "HIGH", detail: string) =>
    raiseAnomaly(tx, deps.hub, { kind, severity, cardUid: t.cardUid, deviceId: t.deviceId, txnId: t.id, detail }, deps.autoBlockAt);

  if (t.balanceBefore - t.fare !== t.balanceAfter) await raise("TXN_ARITHMETIC", "HIGH", `Device reported ${t.balanceBefore} - ${t.fare} = ${t.balanceAfter}`);

  if (!tables.has(t.fareTableVersion)) tables.set(t.fareTableVersion, await publishedFareTable(tx, t.fareTableVersion));
  const table = tables.get(t.fareTableVersion);
  if (table && t.fare > fareCeiling(table, t.routeId)) await raise("FARE_OUT_OF_RANGE", "HIGH", `A fare of ${t.fare} cents is above anything route ${t.routeId} can charge`);

  // A second tap claiming a counter value we already have is a cloned card, a leaked key or a replayed record. Keep it for investigation, do not post it.
  const clash = await tx.txn.findFirst({ where: { cardUid: t.cardUid, cardCounter: t.cardCounter, result: "ok", NOT: { id: t.id } }, select: { id: true, deviceId: true } });
  if (clash && t.cardCounter > 0) {
    await raise("DUPLICATE_COUNTER", "HIGH", `Card counter ${t.cardCounter} was already used by transaction ${clash.id} on ${clash.deviceId}`);
    return "accepted";
  }

  const expectedBefore = await cardBalance(tx, t.cardUid);
  const inOrder = t.cardCounter > card.lastCounter;
  if (inOrder) {
    if (card.lastCounter > 0 && t.cardCounter > card.lastCounter + 1) await raise("COUNTER_GAP", "LOW", `Counter jumped from ${card.lastCounter} to ${t.cardCounter}: taps from other devices may not have arrived yet`);
    if (expectedBefore !== t.balanceBefore) {
      const delta = t.balanceBefore - expectedBefore;
      const everToppedUp = (await tx.topup.count({ where: { cardUid: t.cardUid } })) > 0;
      await raise("BALANCE_MISMATCH", delta > 0 && !everToppedUp && expectedBefore === 0 ? "HIGH" : "MEDIUM",
        `Card showed ${t.balanceBefore} cents before this tap, the books say ${expectedBefore} (${delta > 0 ? "+" : ""}${delta})`);
    }
  }

  // The physical card is the truth. If the books are short of what the card had, catch them up (and say so) before taking the fare.
  // In order, the card's own balance is taken as the truth. Out of order (another device's tap arrived late) only the shortfall needed to take
  // this fare is added, because the books may legitimately be ahead of or behind this one tap.
  const target = inOrder ? Math.max(t.balanceBefore, t.fare) : t.fare;
  if (target > expectedBefore) {
    const deficit = target - expectedBefore;
    await postJournal(tx, { kind: "CATCH_UP", ref: t.id, memo: "Card held more than the books showed", lines: [{ account: cardAccount(t.cardUid), amount: deficit }, { account: "adjustment", amount: -deficit }] });
    await raise("LEDGER_BEHIND_CARD", "MEDIUM", `Books were ${deficit} cents short of what the card had; caught up`);
  }
  let journalId: string | undefined;
  if (t.fare > 0) {
    journalId = await postJournal(tx, { kind: "FARE", ref: t.id, memo: `${t.kind ?? "fare"} route ${t.routeId}`, lines: [{ account: cardAccount(t.cardUid), amount: -t.fare }, { account: routeRevenue(t.routeId), amount: t.fare }] });
  }
  await tx.txn.update({ where: { id: row.id }, data: { journalId } });
  if (inOrder) await tx.card.update({ where: { uid: t.cardUid }, data: { lastCounter: t.cardCounter, lastTapAt: tappedAt } });
  deps.hub?.publish({ type: "tap", at: tappedAt.toISOString(), deviceId: t.deviceId, cardUid: t.cardUid, result: "ok", kind: t.kind, routeId: t.routeId, stopId: t.stopId, fare: t.fare, balanceAfter: t.balanceAfter, offline: t.offline });
  return "accepted";
}

/** What the device needs back: fresh copies of anything that changed since the versions it reports. */
export async function syncExtras(db: Db, report: { hotlistVersion: number; fareTableVersion: number; profilesVersion: number; ticketKeysVersion?: number; voidedVersion?: number }, ticketKeys?: SyncResponse["ticketKeys"]): Promise<Pick<SyncResponse, "hotlist" | "fareTable" | "profiles" | "ticketKeys" | "voidedTickets">> {
  const out: Pick<SyncResponse, "hotlist" | "fareTable" | "profiles" | "ticketKeys" | "voidedTickets"> = {};
  const voided = await voidedTicketList(db);
  if ((report.voidedVersion ?? 0) !== voided.version) out.voidedTickets = voided;
  if (ticketKeys && (report.ticketKeysVersion ?? 0) !== ticketKeys.version) out.ticketKeys = ticketKeys;
  const [hv, pv, fv] = await Promise.all([getVersion(db, "hotlistVersion"), getVersion(db, "profilesVersion"), currentFareVersion(db)]);
  if (report.hotlistVersion !== hv) {
    const cards = await db.card.findMany({ where: { status: { in: ["BLOCKED", "LOST", "EXPIRED"] } }, select: { uid: true } });
    out.hotlist = { version: hv, uids: cards.map((c) => c.uid) };
  }
  if (report.profilesVersion !== pv) {
    const cards = await db.card.findMany({ where: { category: { not: "adult" }, status: "ACTIVE" }, select: { uid: true, category: true } });
    out.profiles = { version: pv, cards: cards.map((c) => ({ uid: c.uid, category: c.category })) };
  }
  if (report.fareTableVersion !== fv && fv > 0) out.fareTable = (await publishedFareTable(db)) ?? undefined;
  return out;
}
