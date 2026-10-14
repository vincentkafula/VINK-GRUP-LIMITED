"use client";
import { useEffect, useRef, useState } from "react";
import { feedUrl, rand } from "@/lib/api";
import { Badge } from "./ui";

interface FeedEvent { type: string; at?: string; deviceId?: string; cardUid?: string; result?: string; kind?: string; denyReason?: string; fare?: number; balanceAfter?: number; offline?: boolean; routeId?: number; severity?: string; detail?: string; amount?: number; method?: string; status?: string }

/** Taps and alerts as they happen. Reconnects by itself if the connection drops. */
export function LiveFeed({ onEvent }: { onEvent?: (e: FeedEvent) => void }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "down">("connecting");
  const cb = useRef(onEvent); cb.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
    const open = () => {
      setState("connecting");
      ws = new WebSocket(feedUrl());
      ws.onopen = () => setState("live");
      ws.onmessage = (m) => {
        const e = JSON.parse(String(m.data)) as FeedEvent;
        if (e.type === "hello") return;
        setEvents((old) => [e, ...old].slice(0, 40)); cb.current?.(e);
      };
      ws.onclose = (c) => { setState("down"); if (!stopped && c.code !== 4401) timer = setTimeout(open, 3000); };
    };
    open();
    return () => { stopped = true; clearTimeout(timer); ws?.close(); };
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <span className={`inline-block h-2 w-2 rounded-full ${state === "live" ? "bg-emerald-500" : state === "connecting" ? "bg-amber-400" : "bg-red-500"}`} />
        {state === "live" ? "Live" : state === "connecting" ? "Connecting…" : "Disconnected: retrying"}
      </div>
      {events.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">Waiting for the next tap…</p> : (
        <ul className="divide-y divide-slate-100 text-sm" aria-live="polite">
          {events.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              {e.type === "tap" && (<><span className="font-mono text-xs">{e.cardUid?.slice(-8)}</span><span className="flex-1 text-slate-600">{e.deviceId} · {e.result === "ok" ? `${e.kind?.replace("_", " ")} ${rand(e.fare ?? 0)}` : `refused: ${e.denyReason?.replace(/_/g, " ").toLowerCase()}`}{e.offline ? " · offline" : ""}</span><Badge>{e.result ?? ""}</Badge></>)}
              {e.type === "anomaly" && (<><span className="font-medium text-amber-700">Alert</span><span className="flex-1 text-slate-600">{e.detail}</span><Badge>{e.severity ?? ""}</Badge></>)}
              {e.type === "topup" && (<><span className="font-mono text-xs">{e.cardUid?.slice(-8)}</span><span className="flex-1 text-slate-600">Top-up {rand(e.amount ?? 0)} ({e.method?.toLowerCase().replace("_", " ")})</span><Badge>LOADED</Badge></>)}
              {e.type === "device" && (<><span className="font-medium">Device</span><span className="flex-1 text-slate-600">{e.deviceId}</span><Badge>{e.status ?? ""}</Badge></>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
