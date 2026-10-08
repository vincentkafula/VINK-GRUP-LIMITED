import { useCallback, useEffect, useRef, useState } from "react";
import { Nfc, CheckCircle2, XCircle, WifiOff, Settings, Loader2 } from "lucide-react";
import { API_BASE } from "../services/config";
import { usePageTitle } from "./ds";

/**
 * The VINK card reader, for the driver's phone or tablet. It runs in the browser (open /reader on an Android phone with Chrome and NFC), reads the VINK card's
 * chip number with Web NFC, and asks the server to take the route fare in tokens. The server decides the fare; this screen only names the route and the card.
 *
 * The device proves who it is with the serial number and API key it was registered with (kept in this browser only). A tap that loses the connection is
 * NEVER assumed paid or unpaid: it can be retried, and the same tap reference means the passenger is charged at most once.
 */
interface Creds { serial: string; apiKey: string }
interface RouteRow { id: string; name: string; fareCents: number; currency: string }
type Outcome =
  | { kind: "paid"; fareCents: number; balanceCents: number; route: string; ms: number; replayed: boolean; last4: string }
  | { kind: "declined"; message: string; code: string; last4: string }
  | { kind: "offline"; last4: string; key: string; card: string };
interface Tap { at: string; label: string; ok: boolean }

const CREDS_KEY = "vink-reader-device", ROUTE_KEY = "vink-reader-route";
const rand = (cents: number) => `R ${(cents / 100).toFixed(2)}`;
const readCreds = (): Creds | null => { try { const v = JSON.parse(localStorage.getItem(CREDS_KEY) ?? "null"); return v?.serial && v?.apiKey ? v : null; } catch { return null; } };
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `tap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const cleanCardNumber = (s: string) => s.replace(/[\s:-]/g, "").toUpperCase();

export function TokenReader({ isOpen }: { isOpen: boolean }) {
  usePageTitle(isOpen ? "VINK card reader" : "");
  const [creds, setCreds] = useState<Creds | null>(readCreds);
  const [routes, setRoutes] = useState<RouteRow[] | null>(null);
  const [routeId, setRouteId] = useState<string>(() => { try { return localStorage.getItem(ROUTE_KEY) ?? ""; } catch { return ""; } });
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [taps, setTaps] = useState<Tap[]>([]);
  const [manual, setManual] = useState("");
  const [nfc, setNfc] = useState<"unsupported" | "off" | "on" | "denied">("off");
  const last = useRef<{ card: string; at: number }>({ card: "", at: 0 });
  const credsRef = useRef(creds); credsRef.current = creds;
  const routeRef = useRef(routeId); routeRef.current = routeId;

  const headers = (c: Creds, key?: string) => ({ "Content-Type": "application/json", "x-terminal-serial": c.serial, "x-terminal-api-key": c.apiKey, ...(key ? { "idempotency-key": key } : {}) });

  const loadRoutes = useCallback(async () => {
    const c = credsRef.current; if (!c) return;
    setLoadError("");
    try {
      const r = await fetch(`${API_BASE}/api/terminal/token/routes`, { headers: headers(c) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(b.error ?? "This device could not sign in."); setRoutes(null); return; }
      setRoutes(b.routes ?? []);
      if (b.routes?.length && !b.routes.some((x: RouteRow) => x.id === routeRef.current)) setRouteId(b.routes[0].id);
    } catch { setLoadError("No connection. Check the data or Wi-Fi and try again."); }
  }, []);
  useEffect(() => { if (isOpen && creds) void loadRoutes(); }, [isOpen, creds, loadRoutes]);
  useEffect(() => { try { if (routeId) localStorage.setItem(ROUTE_KEY, routeId); } catch { /* storage may be blocked */ } }, [routeId]);

  const charge = useCallback(async (rawCard: string, retryKey?: string) => {
    const c = credsRef.current, route = routeRef.current, card = cleanCardNumber(rawCard);
    if (!c || !route || !card) return;
    const now = Date.now();
    if (!retryKey && last.current.card === card && now - last.current.at < 3000) return;             // the chip is often read several times in one tap
    last.current = { card, at: now };
    const key = retryKey ?? newKey(), last4 = card.slice(-4), started = performance.now();
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/terminal/token/tap`, { method: "POST", headers: headers(c, key), body: JSON.stringify({ cardNumber: card, routeId: route }) });
      const b = await r.json().catch(() => ({}));
      const ms = Math.round(performance.now() - started);
      if (r.ok && b.success) {
        setOutcome({ kind: "paid", fareCents: b.data.fareCents, balanceCents: b.data.balanceCents, route: b.data.route, ms, replayed: !!b.data.replayed, last4 });
        setTaps((t) => [{ at: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }), label: `${rand(b.data.fareCents)} · card ${last4}`, ok: true }, ...t].slice(0, 6));
        navigator.vibrate?.(120);
      } else {
        setOutcome({ kind: "declined", message: b.error ?? "The payment was refused.", code: b.code ?? "error", last4 });
        setTaps((t) => [{ at: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }), label: `${b.error ?? "Refused"} · card ${last4}`, ok: false }, ...t].slice(0, 6));
        navigator.vibrate?.([200, 80, 200]);
      }
    } catch {
      setOutcome({ kind: "offline", last4, key, card });
    } finally { setBusy(false); }
  }, []);

  const startNfc = async () => {
    const W = window as unknown as { NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null; onreadingerror: (() => void) | null } };
    if (!W.NDEFReader) { setNfc("unsupported"); return; }
    try {
      const reader = new W.NDEFReader();
      await reader.scan();
      reader.onreading = (e) => { if (e.serialNumber) void charge(e.serialNumber); };
      reader.onreadingerror = () => setOutcome({ kind: "declined", message: "The card could not be read. Hold it flat against the back of the phone.", code: "read", last4: "" });
      setNfc("on");
    } catch (e) { setNfc((e as { name?: string }).name === "NotAllowedError" ? "denied" : "unsupported"); }
  };

  if (!isOpen) return null;
  const route = routes?.find((r) => r.id === routeId);

  if (!creds) return <Setup onSave={(c) => { localStorage.setItem(CREDS_KEY, JSON.stringify(c)); setCreds(c); }} />;

  return (
    <div data-theme-light className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-fg" aria-label="VINK card reader">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h1 className="text-lg font-bold">VINK card reader</h1>
        <button type="button" onClick={() => { localStorage.removeItem(CREDS_KEY); setCreds(null); setRoutes(null); setOutcome(null); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-fg-muted hover:bg-surface-2"><Settings className="size-4" aria-hidden="true" /> Change device</button>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        {loadError && <div role="alert" className="rounded-xl border border-bad bg-bad-bg p-3 text-sm text-bad">{loadError} <button type="button" onClick={() => void loadRoutes()} className="font-semibold underline">Try again</button></div>}

        <section aria-label="Route">
          <p className="mb-2 text-sm font-semibold text-fg-muted">Route for this trip</p>
          {routes === null ? <p className="text-sm text-fg-muted">Loading routes…</p> : routes.length === 0 ? <p className="rounded-xl border border-line bg-surface p-3 text-sm">No routes yet. Ask your association to set the route fares.</p> : (
            <div className="grid gap-2">{routes.map((r) => (
              <button key={r.id} type="button" onClick={() => setRouteId(r.id)} aria-pressed={r.id === routeId}
                className={"flex min-h-14 items-center justify-between rounded-xl border-2 px-4 text-left text-base font-semibold " + (r.id === routeId ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface text-fg")}>
                <span>{r.name}</span><span>{rand(r.fareCents)}</span>
              </button>))}</div>)}
        </section>

        <section aria-label="Read a card" className="rounded-2xl border border-line bg-surface p-4">
          {nfc === "on" ? <p className="flex items-center gap-2 text-sm font-medium text-ok"><Nfc className="size-5" aria-hidden="true" /> Reader is on. Ask the passenger to tap the card on the back of this phone.</p> : (
            <>
              <button type="button" onClick={() => void startNfc()} disabled={!route} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-brand-fg disabled:opacity-50"><Nfc className="size-5" aria-hidden="true" /> Start reading cards</button>
              {nfc === "unsupported" && <p className="mt-2 text-sm text-warn">This phone or browser cannot read cards. Use Chrome on an Android phone with NFC, or type the card number below.</p>}
              {nfc === "denied" && <p className="mt-2 text-sm text-warn">NFC permission was refused. Allow it in the browser settings, then try again.</p>}
            </>)}
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void charge(manual); setManual(""); }}>
            <label className="flex-1"><span className="sr-only">Card number</span><input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type the card number" autoComplete="off" className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-base" /></label>
            <button type="submit" disabled={!route || !manual.trim() || busy} className="min-h-12 rounded-xl border-2 border-brand px-4 font-semibold text-crimson-text disabled:opacity-50">Charge</button>
          </form>
        </section>

        <section aria-live="assertive" aria-label="Result" className="min-h-44">
          {busy && <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-8 text-lg"><Loader2 className="size-6 animate-spin" aria-hidden="true" /> Taking payment…</div>}
          {!busy && outcome?.kind === "paid" && (
            <div className="rounded-2xl p-6 text-center text-white" style={{ background: "#10784a" }}>
              <CheckCircle2 className="mx-auto size-12" aria-hidden="true" />
              <p className="mt-2 text-4xl font-bold">{rand(outcome.fareCents)}</p>
              <p className="text-lg">{outcome.replayed ? "Already paid for this tap" : "Paid"} · {outcome.route}</p>
              <p className="mt-1 text-sm opacity-90">Card {outcome.last4} · balance {rand(outcome.balanceCents)} · {(outcome.ms / 1000).toFixed(1)} s</p>
            </div>)}
          {!busy && outcome?.kind === "declined" && (
            <div className="rounded-2xl p-6 text-center text-white" style={{ background: "#a31c2a" }}>
              <XCircle className="mx-auto size-12" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{outcome.code === "insufficient_tokens" ? "Not enough tokens" : "Not paid"}</p>
              <p className="text-base">{outcome.message}{outcome.last4 ? ` (card ${outcome.last4})` : ""}</p>
              {outcome.code === "insufficient_tokens" && <p className="mt-1 text-sm opacity-90">Ask the passenger to buy tokens or pay another way.</p>}
            </div>)}
          {!busy && outcome?.kind === "offline" && (
            <div className="rounded-2xl p-6 text-center text-white" style={{ background: "#8a5a00" }}>
              <WifiOff className="mx-auto size-12" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">No connection</p>
              <p className="text-base">We could not tell whether card {outcome.last4} was charged. Tap Try again: the passenger is charged at most once.</p>
              <button type="button" onClick={() => void charge(outcome.card, outcome.key)} className="mt-3 min-h-12 rounded-xl bg-white px-6 text-base font-semibold" style={{ color: "#5c3a00" }}>Try again</button>
            </div>)}
          {!busy && !outcome && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-fg-muted">Waiting for a card…</p>}
        </section>

        {taps.length > 0 && (
          <section aria-label="Recent taps"><p className="mb-2 text-sm font-semibold text-fg-muted">Recent taps</p>
            <ul className="space-y-1">{taps.map((t, i) => <li key={i} className="flex justify-between rounded-lg bg-surface px-3 py-2 text-sm"><span>{t.at}</span><span className={t.ok ? "text-ok" : "text-bad"}>{t.label}</span></li>)}</ul>
          </section>)}
      </main>
    </div>
  );
}

function Setup({ onSave }: { onSave: (c: Creds) => void }) {
  const [serial, setSerial] = useState(""); const [apiKey, setApiKey] = useState("");
  return (
    <div data-theme-light className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-bg p-6 text-fg">
      <form className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6" onSubmit={(e) => { e.preventDefault(); if (serial.trim() && apiKey.trim()) onSave({ serial: serial.trim(), apiKey: apiKey.trim() }); }}>
        <h1 className="text-xl font-bold">Set up this card reader</h1>
        <p className="text-sm text-fg-muted">Enter the serial number and API key you were given when this device was registered. They are kept on this phone only.</p>
        <label className="block"><span className="text-sm font-semibold">Device serial number</span><input value={serial} onChange={(e) => setSerial(e.target.value)} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-bg px-3" /></label>
        <label className="block"><span className="text-sm font-semibold">API key</span><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-bg px-3" /></label>
        <button type="submit" disabled={!serial.trim() || !apiKey.trim()} className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-brand-fg disabled:opacity-50">Save and continue</button>
      </form>
    </div>
  );
}
