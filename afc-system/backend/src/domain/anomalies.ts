import type { Db, Tx } from "../db";
import { audit, SYSTEM } from "./audit";
import type { FeedHub } from "./events";
import { bumpVersion } from "./settings";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface AnomalyInput { kind: string; severity: Severity; cardUid?: string; deviceId?: string; txnId?: string; detail: string }

/**
 * Things that should not happen but do get reported: a balance that does not follow from the ledger, two taps claiming the same card counter
 * (a cloned card or a replayed record), a gap in a device's sequence. They are recorded and shown to staff, never silently fixed.
 * A card that collects `autoBlockAt` unresolved HIGH anomalies within 24 hours is blocked automatically and goes on the hotlist.
 */
export async function raiseAnomaly(db: Db | Tx, hub: FeedHub | undefined, a: AnomalyInput, autoBlockAt = 3): Promise<void> {
  await db.anomaly.create({ data: a });
  hub?.publish({ type: "anomaly", at: new Date().toISOString(), kind: a.kind, severity: a.severity, cardUid: a.cardUid, deviceId: a.deviceId, detail: a.detail });
  if (a.severity !== "HIGH" || !a.cardUid) return;
  const since = new Date(Date.now() - 24 * 3600_000);
  const highs = await db.anomaly.count({ where: { cardUid: a.cardUid, severity: "HIGH", resolvedAt: null, createdAt: { gte: since } } });
  if (highs >= autoBlockAt) {
    const done = await db.card.updateMany({ where: { uid: a.cardUid, status: "ACTIVE" }, data: { status: "BLOCKED", blockedReason: `Blocked automatically after ${highs} serious reconciliation problems` } });
    if (done.count) {
      await bumpVersion(db, "hotlistVersion");
      await audit(db, SYSTEM, "card.autoblock", a.cardUid, { highs });
    }
  }
}
