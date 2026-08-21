import { useEffect, useState } from "react";
import { CreditCard, Settings, History, CheckCircle2, XCircle, Wifi, WifiOff, Loader2, DownloadCloud, AlertTriangle } from "lucide-react";
import { startCardListener, stopCardListener, isReaderReady, isNativeReaderAvailable, onCardTapped, type CardTapEvent } from "./services/cardReader";
import { submitTransaction, sendHeartbeat } from "./services/api";

/**
 * VINK Retail POS -- standalone card-payment app for small retail
 * merchants. Genuinely separate from both the main VINK consumer app
 * and the taxi terminal app: different hardware (vendor unconfirmed,
 * no SDK integrated yet -- see services/cardReader.ts), different
 * ownership model (a merchant, not investor/owner/driver/association),
 * different fee model (2.5% of the transaction). Connects to the same
 * real VINK banking system via server/src/routes/retailRouter.ts.
 */

type Screen = "setup" | "ready" | "history";
interface LocalTransactionRecord { id: string; amount: number; scheme: string | null; maskedPan: string | null; status: "submitted" | "failed"; timestamp: string }

const STORAGE_KEY_SERIAL = "vink_retail_serial";
const STORAGE_KEY_APIKEY = "vink_retail_apikey";
const STORAGE_KEY_HISTORY = "vink_retail_history";

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [serial, setSerial] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [paired, setPaired] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; releaseNotes: string | null; mandatory: boolean } | null>(null);

  useEffect(() => {
    const s = localStorage.getItem(STORAGE_KEY_SERIAL);
    const k = localStorage.getItem(STORAGE_KEY_APIKEY);
    if (s && k) {
      setSerial(s);
      setApiKey(k);
      setPaired(true);
      setScreen("ready");
    }
  }, []);

  useEffect(() => {
    if (!paired) return;
    const check = async () => {
      const res = await sendHeartbeat(serial, apiKey, __APP_VERSION__);
      if (res.success && res.data?.updateAvailable && res.data.downloadUrl && res.data.latestVersion) {
        setUpdateInfo({ version: res.data.latestVersion, downloadUrl: res.data.downloadUrl, releaseNotes: res.data.releaseNotes, mandatory: res.data.mandatory });
      }
    };
    check();
    const interval = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [paired, serial, apiKey]);

  const handlePair = (s: string, k: string) => {
    localStorage.setItem(STORAGE_KEY_SERIAL, s);
    localStorage.setItem(STORAGE_KEY_APIKEY, k);
    setSerial(s);
    setApiKey(k);
    setPaired(true);
    setScreen("ready");
  };

  const handleUnpair = () => {
    localStorage.removeItem(STORAGE_KEY_SERIAL);
    localStorage.removeItem(STORAGE_KEY_APIKEY);
    setSerial("");
    setApiKey("");
    setPaired(false);
    setScreen("setup");
  };

  return (
    <div className="min-h-screen bg-[#1E3A8A] text-white flex flex-col" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[#1E3A8A] bg-white text-sm">V</span>
        <div><p className="font-black text-[15px] leading-tight">VINK Retail POS</p><p className="text-[10px] text-white/40">Card Payments</p></div>
      </header>

      {updateInfo && (
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: "rgba(96,165,250,0.15)", borderBottom: "1px solid rgba(96,165,250,0.3)" }}>
          <DownloadCloud className="w-4 h-4 shrink-0" style={{ color: "#60A5FA" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold">Update available -- v{updateInfo.version}</p>
            {updateInfo.releaseNotes && <p className="text-[11px] text-white/60 truncate">{updateInfo.releaseNotes}</p>}
          </div>
          <button
            onClick={() => window.open(updateInfo.downloadUrl, "_system")}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11.5px] font-bold"
            style={{ background: "#60A5FA", color: "#1E3A8A" }}
          >
            Install
          </button>
          {!updateInfo.mandatory && (
            <button onClick={() => setUpdateInfo(null)} className="shrink-0 text-white/40 text-[11px]">Later</button>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-5">
        {screen === "setup" && <SetupScreen onPair={handlePair} />}
        {screen === "ready" && paired && <ReadyScreen serial={serial} apiKey={apiKey} />}
        {screen === "history" && <HistoryScreen />}
      </main>

      {paired && (
        <nav className="flex border-t border-white/10">
          <button onClick={() => setScreen("ready")} className="flex-1 flex flex-col items-center gap-1 py-3" style={{ color: screen === "ready" ? "#60A5FA" : "rgba(255,255,255,0.5)" }}>
            <CreditCard className="w-5 h-5" /><span className="text-[11px] font-semibold">Accept Payment</span>
          </button>
          <button onClick={() => setScreen("history")} className="flex-1 flex flex-col items-center gap-1 py-3" style={{ color: screen === "history" ? "#60A5FA" : "rgba(255,255,255,0.5)" }}>
            <History className="w-5 h-5" /><span className="text-[11px] font-semibold">History</span>
          </button>
          <button onClick={handleUnpair} className="flex-1 flex flex-col items-center gap-1 py-3 text-white/50">
            <Settings className="w-5 h-5" /><span className="text-[11px] font-semibold">Re-pair</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function SetupScreen({ onPair }: { onPair: (serial: string, apiKey: string) => void }) {
  const [serial, setSerial] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <span className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/10 mb-5"><CreditCard className="w-8 h-8" /></span>
      <h1 className="text-xl font-black mb-1.5">Pair this terminal</h1>
      <p className="text-[13px] text-white/50 mb-6 max-w-xs leading-relaxed">
        Enter the serial number and API key your administrator gave you when this device was registered. This app can't register a new terminal itself -- registration happens through a VINK administrator.
      </p>
      <div className="w-full max-w-xs space-y-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5 text-left">Terminal Serial</label>
          <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="e.g. RETAIL-CT-00012" className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm outline-none focus:border-white/40 placeholder:text-white/30" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5 text-left">API Key</label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Provided at registration" className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm outline-none focus:border-white/40 placeholder:text-white/30" />
        </div>
        <button
          onClick={() => serial.trim() && apiKey.trim() && onPair(serial.trim(), apiKey.trim())}
          disabled={!serial.trim() || !apiKey.trim()}
          className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 transition-opacity"
          style={{ background: "#60A5FA", color: "#1E3A8A" }}
        >
          Pair terminal
        </button>
      </div>
    </div>
  );
}

function ReadyScreen({ serial, apiKey }: { serial: string; apiKey: string }) {
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [readerReady, setReaderReady] = useState(false);
  const [amount, setAmount] = useState("");
  const [listening, setListening] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setNativeAvailable(isNativeReaderAvailable());
    isReaderReady().then(setReaderReady);
    const off = onCardTapped(handleTap);
    return () => { off(); stopCardListener(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTap(event: CardTapEvent) {
    setListening(false);
    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      setResult({ ok: false, message: "No amount was set before the tap -- nothing submitted." });
      return;
    }
    const res = await submitTransaction(serial, apiKey, {
      maskedPan: event.maskedPan, scheme: event.scheme, cardholderVerification: event.cardholderVerification,
      emvCryptogramRef: event.emvCryptogramRef, amount: purchaseAmount, currency: "ZAR",
    });
    saveToHistory({ id: res.data?.transactionId ?? crypto.randomUUID(), amount: purchaseAmount, scheme: event.scheme, maskedPan: event.maskedPan, status: res.success ? "submitted" : "failed", timestamp: new Date().toISOString() });
    setResult(res.success ? { ok: true, message: `Payment of R${purchaseAmount.toFixed(2)} recorded.` } : { ok: false, message: res.error ?? "Could not submit the payment to the server." });
    setAmount("");
  }

  async function handleAccept() {
    setResult(null);
    setStartError(null);
    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) { setStartError("Enter an amount first."); return; }
    const res = await startCardListener();
    if (!res.started) { setStartError(res.error ?? "Could not start the card reader."); return; }
    setListening(true);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="rounded-xl p-3.5 flex items-center gap-2.5 mb-5" style={{ background: readerReady ? "rgba(255,255,255,0.08)" : "rgba(251,191,36,0.12)" }}>
        {readerReady ? <Wifi className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" style={{ color: "#FBBF24" }} />}
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold truncate">{serial}</p>
          <p className="text-[11px] text-white/50">
            {!nativeAvailable ? "Not running on a device." : readerReady ? "Card reader ready" : "Card reader not yet integrated -- see cardReader.ts"}
          </p>
        </div>
      </div>

      {!listening && !result && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <label className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">Amount (ZAR)</label>
          <div className="flex items-center gap-1 mb-6">
            <span className="text-3xl font-black text-white/40">R</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className="w-40 bg-transparent text-5xl font-black outline-none placeholder:text-white/20" />
          </div>
          {startError && <p className="text-[12.5px] text-red-300 mb-3 text-center max-w-xs">{startError}</p>}
          <button onClick={handleAccept} className="w-full max-w-xs py-4 rounded-2xl font-black text-base" style={{ background: "#60A5FA", color: "#1E3A8A" }}>
            Accept Payment
          </button>
        </div>
      )}

      {listening && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <span className="w-20 h-20 rounded-full flex items-center justify-center mb-4 animate-pulse" style={{ background: "rgba(96,165,250,0.2)" }}>
            <Loader2 className="w-9 h-9 animate-spin" style={{ color: "#60A5FA" }} />
          </span>
          <p className="text-lg font-black mb-1">Tap card now</p>
          <p className="text-[13px] text-white/50 mb-6">R{parseFloat(amount || "0").toFixed(2)}</p>
          <button onClick={() => { stopCardListener(); setListening(false); }} className="text-[13px] font-semibold text-white/50 underline">Cancel</button>
        </div>
      )}

      {result && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {result.ok ? <CheckCircle2 className="w-14 h-14 text-emerald-400 mb-3" /> : <XCircle className="w-14 h-14 text-red-400 mb-3" />}
          <p className="font-bold text-[15px] mb-1">{result.ok ? "Payment recorded" : "Not recorded"}</p>
          <p className="text-[13px] text-white/60 mb-6 max-w-xs">{result.message}</p>
          <button onClick={() => setResult(null)} className="px-6 py-3 rounded-xl font-bold text-sm" style={{ background: "#60A5FA", color: "#1E3A8A" }}>New payment</button>
        </div>
      )}
    </div>
  );
}

function saveToHistory(record: LocalTransactionRecord) {
  const existing: LocalTransactionRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]");
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([record, ...existing].slice(0, 100)));
}

function HistoryScreen() {
  const [history, setHistory] = useState<LocalTransactionRecord[]>([]);
  useEffect(() => { setHistory(JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]")); }, []);

  if (!history.length) {
    return <div className="flex flex-col items-center justify-center h-full text-center text-white/40"><History className="w-10 h-10 mb-3" /><p className="text-sm">No payments yet</p></div>;
  }

  return (
    <div className="space-y-2.5">
      {history.map(r => (
        <div key={r.id} className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="min-w-0">
            <p className="text-[14px] font-bold">R{r.amount.toFixed(2)}</p>
            <p className="text-[11px] text-white/40">{r.scheme ?? "unknown"} {r.maskedPan ?? ""} · {new Date(r.timestamp).toLocaleString()}</p>
          </div>
          {r.status === "submitted" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
        </div>
      ))}
    </div>
  );
}
