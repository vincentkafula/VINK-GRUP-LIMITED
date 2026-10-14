import { EventEmitter } from "node:events";

/** In-process fan-out for the dashboard's live feed. (With more than one API instance, replace with Postgres LISTEN/NOTIFY or Redis pub/sub.) */
export type FeedEvent =
  | { type: "tap"; at: string; deviceId: string; cardUid: string; result: "ok" | "denied"; kind?: string; denyReason?: string; routeId: number; stopId: number; fare: number; balanceAfter: number; offline: boolean }
  | { type: "anomaly"; at: string; kind: string; severity: string; cardUid?: string; deviceId?: string; detail: string }
  | { type: "device"; at: string; deviceId: string; status: string }
  | { type: "topup"; at: string; cardUid: string; amount: number; method: string };

export class FeedHub {
  private readonly em = new EventEmitter();
  constructor() { this.em.setMaxListeners(200); }
  publish(e: FeedEvent): void { this.em.emit("event", e); }
  subscribe(fn: (e: FeedEvent) => void): () => void { this.em.on("event", fn); return () => this.em.off("event", fn); }
}
