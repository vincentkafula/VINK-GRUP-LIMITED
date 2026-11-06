import { useCallback, useEffect, useState } from "react";
import type { Call } from "./ui";

/**
 * Changes a marshal makes with no signal are kept on the phone and sent when it returns, safely: every change carries a reference the server remembers, so a change sent twice happens once.
 * Only a failure to REACH the server queues a change; a server that answers with a refusal is an answer, shown to the marshal, never retried. A change that is refused when it is finally sent is kept in a
 * "could not be sent" list so it is never silently lost.
 */
const KEY = "vink.marshal.outbox.v1", REJECTED = "vink.marshal.outbox.rejected.v1", EVENT = "vink-outbox-changed";
export interface OutboxItem { ref: string; method: string; path: string; body: Record<string, unknown>; label: string; at: string }
export interface Rejected { label: string; error: string; at: string }
const UNREACHABLE = "We could not reach the server";
const isUnreachable = (error: string) => error.startsWith(UNREACHABLE);

function read<T>(key: string): T[] { try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function write(key: string, v: unknown[]) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked: the change is then not kept, and the marshal is told */ } window.dispatchEvent(new Event(EVENT)); }

export const pending = (): OutboxItem[] => read<OutboxItem>(KEY).filter((i) => i && typeof i.ref === "string" && typeof i.path === "string");
export const rejected = (): Rejected[] => read<Rejected>(REJECTED);
export const clearRejected = () => write(REJECTED, []);
export const newRef = (prefix = "m"): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type SendResult<T> = { status: "sent"; data: T } | { status: "queued"; ref: string } | { status: "error"; error: string };
/** Sends a change; if the server cannot be reached it is saved on the phone to be sent later. The body always carries a clientRef. */
export async function sendOrQueue<T = Record<string, unknown>>(call: Call, req: { method: string; path: string; body: Record<string, unknown>; label: string }): Promise<SendResult<T>> {
  const body = { ...req.body, clientRef: typeof req.body.clientRef === "string" ? req.body.clientRef : newRef() }, ref = body.clientRef as string;
  const queue = (): SendResult<T> => { write(KEY, [...pending(), { ref, method: req.method, path: req.path, body, label: req.label, at: new Date().toISOString() }]); return { status: "queued", ref }; };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return queue();
  const r = await call<T>(req.path, { method: req.method, body });
  if ("data" in r) return { status: "sent", data: r.data };
  return isUnreachable(r.error) ? queue() : { status: "error", error: r.error };
}
/** Sends what is waiting, oldest first, stopping at the first failure to reach the server. Safe to call at any time and from more than one place. */
let flushing = false;
export async function flush(call: Call): Promise<{ sent: number; remaining: number; refused: number }> {
  if (flushing) return { sent: 0, remaining: pending().length, refused: 0 };
  flushing = true; let sent = 0, refused = 0;
  try {
    for (const item of pending()) {
      const r = await call(item.path, { method: item.method, body: item.body });
      if ("error" in r && isUnreachable(r.error)) break;
      write(KEY, pending().filter((i) => i.ref !== item.ref));
      if ("error" in r) { refused++; write(REJECTED, [...rejected(), { label: item.label, error: r.error, at: new Date().toISOString() }].slice(-20)); } else sent++;
    }
  } finally { flushing = false; }
  return { sent, remaining: pending().length, refused };
}
/** The count of waiting changes and the refused ones, kept up to date, with sending when the phone comes back online and every 30 seconds. */
export function useOutbox(call: Call) {
  const [state, setState] = useState(() => ({ waiting: pending(), refused: rejected() }));
  const refresh = useCallback(() => setState({ waiting: pending(), refused: rejected() }), []);
  const send = useCallback(async () => { if (pending().length) { await flush(call); refresh(); } }, [call, refresh]);
  useEffect(() => {
    window.addEventListener(EVENT, refresh); window.addEventListener("online", send); void send(); const t = setInterval(() => { void send(); }, 30_000);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("online", send); clearInterval(t); };
  }, [refresh, send]);
  return { ...state, sendNow: send };
}
