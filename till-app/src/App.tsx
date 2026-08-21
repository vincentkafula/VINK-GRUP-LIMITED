import { useEffect, useState } from "react";
import { ShoppingCart, Settings, History, CheckCircle2, XCircle, Plus, Minus, Trash2, Banknote, CreditCard, Loader2, DownloadCloud, AlertTriangle } from "lucide-react";
import { startCardListener, stopCardListener, isReaderReady, isNativeReaderAvailable, onCardTapped, type CardTapEvent } from "./services/cardReader";
import { fetchProducts, submitSale, sendHeartbeat, type Product, type SaleItemInput } from "./services/api";

type Screen = "setup" | "checkout" | "history";
interface CartLine { product: Product | null; name: string; quantity: number; unitPrice: number }
interface LocalSaleRecord { id: string; total: number; paymentMethod: string; itemCount: number; timestamp: string }

const STORAGE_KEY_SERIAL = "vink_till_serial";
const STORAGE_KEY_APIKEY = "vink_till_apikey";
const STORAGE_KEY_HISTORY = "vink_till_history";

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [serial, setSerial] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [paired, setPaired] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; releaseNotes: string | null; mandatory: boolean } | null>(null);

  useEffect(() => {
    const s = localStorage.getItem(STORAGE_KEY_SERIAL);
    const k = localStorage.getItem(STORAGE_KEY_APIKEY);
    if (s && k) { setSerial(s); setApiKey(k); setPaired(true); setScreen("checkout"); }
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
    setSerial(s); setApiKey(k); setPaired(true); setScreen("checkout");
  };

  const handleUnpair = () => {
    localStorage.removeItem(STORAGE_KEY_SERIAL);
    localStorage.removeItem(STORAGE_KEY_APIKEY);
    setSerial(""); setApiKey(""); setPaired(false); setScreen("setup");
  };

  return (
    <div className="min-h-screen bg-[#065F46] text-white flex flex-col" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[#065F46] bg-white text-sm">V</span>
        <div><p className="font-black text-[15px] leading-tight">VINK Till</p><p className="text-[10px] text-white/40">Point of Sale</p></div>
      </header>

      {updateInfo && (
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: "rgba(52,211,153,0.15)", borderBottom: "1px solid rgba(52,211,153,0.3)" }}>
          <DownloadCloud className="w-4 h-4 shrink-0" style={{ color: "#34D399" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold">Update available -- v{updateInfo.version}</p>
            {updateInfo.releaseNotes && <p className="text-[11px] text-white/60 truncate">{updateInfo.releaseNotes}</p>}
          </div>
          <button onClick={() => window.open(updateInfo.downloadUrl, "_system")} className="shrink-0 px-3 py-1.5 rounded-lg text-[11.5px] font-bold" style={{ background: "#34D399", color: "#065F46" }}>Install</button>
          {!updateInfo.mandatory && <button onClick={() => setUpdateInfo(null)} className="shrink-0 text-white/40 text-[11px]">Later</button>}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {screen === "setup" && <SetupScreen onPair={handlePair} />}
        {screen === "checkout" && paired && <CheckoutScreen serial={serial} apiKey={apiKey} />}
        {screen === "history" && <HistoryScreen />}
      </main>

      {paired && (
        <nav className="flex border-t border-white/10">
          <button onClick={() => setScreen("checkout")} className="flex-1 flex flex-col items-center gap-1 py-3" style={{ color: screen === "checkout" ? "#34D399" : "rgba(255,255,255,0.5)" }}>
            <ShoppingCart className="w-5 h-5" /><span className="text-[11px] font-semibold">Checkout</span>
          </button>
          <button onClick={() => setScreen("history")} className="flex-1 flex flex-col items-center gap-1 py-3" style={{ color: screen === "history" ? "#34D399" : "rgba(255,255,255,0.5)" }}>
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
    <div className="flex flex-col items-center justify-center h-full text-center p-5">
      <span className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/10 mb-5"><ShoppingCart className="w-8 h-8" /></span>
      <h1 className="text-xl font-black mb-1.5">Pair this till</h1>
      <p className="text-[13px] text-white/50 mb-6 max-w-xs leading-relaxed">Enter the serial number and API key your administrator gave you when this device was registered.</p>
      <div className="w-full max-w-xs space-y-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5 text-left">Terminal Serial</label>
          <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="e.g. TILL-CT-00012" className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm outline-none focus:border-white/40 placeholder:text-white/30" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5 text-left">API Key</label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Provided at registration" className="w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm outline-none focus:border-white/40 placeholder:text-white/30" />
        </div>
        <button onClick={() => serial.trim() && apiKey.trim() && onPair(serial.trim(), apiKey.trim())} disabled={!serial.trim() || !apiKey.trim()}
          className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-40" style={{ background: "#34D399", color: "#065F46" }}>
          Pair till
        </button>
      </div>
    </div>
  );
}

function CheckoutScreen({ serial, apiKey }: { serial: string; apiKey: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [stage, setStage] = useState<"browse" | "payment" | "cardWaiting" | "receipt">("browse");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [readerReady, setReaderReady] = useState(false);

  useEffect(() => {
    fetchProducts(serial, apiKey).then(res => {
      if (res.success && res.data) setProducts(res.data);
      else setLoadError(res.error ?? "Could not load products");
    });
    isReaderReady().then(setReaderReady);
  }, [serial, apiKey]);

  const subtotal = +cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0).toFixed(2);

  function addToCart(p: Product) {
    setCart(prev => {
      const existing = prev.find(l => l.product?.id === p.id);
      if (existing) return prev.map(l => l.product?.id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product: p, name: p.name, quantity: 1, unitPrice: p.price }];
    });
  }
  function changeQty(index: number, delta: number) {
    setCart(prev => prev.map((l, i) => i === index ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l).filter(l => l.quantity > 0));
  }
  function removeLine(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  async function completeSale(paymentMethod: "cash" | "card", cardEvent?: CardTapEvent) {
    const items: SaleItemInput[] = cart.map(l => ({ productId: l.product?.id ?? null, productName: l.name, quantity: l.quantity, unitPrice: l.unitPrice }));
    const res = await submitSale(serial, apiKey, {
      items, paymentMethod,
      maskedPan: cardEvent?.maskedPan ?? null, scheme: cardEvent?.scheme ?? null,
      cardholderVerification: cardEvent?.cardholderVerification ?? null, emvCryptogramRef: cardEvent?.emvCryptogramRef ?? null,
    });
    if (res.success && res.data) {
      saveToHistory({ id: res.data.saleId, total: res.data.total, paymentMethod, itemCount: cart.reduce((s, l) => s + l.quantity, 0), timestamp: res.data.createdAt });
      setResult({ ok: true, message: `Sale of R${res.data.total.toFixed(2)} recorded (${paymentMethod}).` });
    } else {
      setResult({ ok: false, message: res.error ?? "Could not record the sale." });
    }
    setStage("receipt");
  }

  async function handleCardPayment() {
    setStage("cardWaiting");
    const off = onCardTapped(async (event) => { off(); stopCardListener(); await completeSale("card", event); });
    const startRes = await startCardListener();
    if (!startRes.started) {
      off();
      setResult({ ok: false, message: startRes.error ?? "Could not start the card reader." });
      setStage("receipt");
    }
  }

  function newSale() {
    setCart([]);
    setResult(null);
    setStage("browse");
  }

  if (stage === "receipt") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-5">
        {result?.ok ? <CheckCircle2 className="w-14 h-14 text-emerald-300 mb-3" /> : <XCircle className="w-14 h-14 text-red-400 mb-3" />}
        <p className="font-bold text-[15px] mb-1">{result?.ok ? "Sale complete" : "Not recorded"}</p>
        <p className="text-[13px] text-white/60 mb-6 max-w-xs">{result?.message}</p>
        <button onClick={newSale} className="px-6 py-3 rounded-xl font-bold text-sm" style={{ background: "#34D399", color: "#065F46" }}>New sale</button>
      </div>
    );
  }

  if (stage === "cardWaiting") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-5">
        <span className="w-20 h-20 rounded-full flex items-center justify-center mb-4 animate-pulse" style={{ background: "rgba(52,211,153,0.2)" }}>
          <Loader2 className="w-9 h-9 animate-spin" style={{ color: "#34D399" }} />
        </span>
        <p className="text-lg font-black mb-1">Tap card now</p>
        <p className="text-[13px] text-white/50 mb-6">R{subtotal.toFixed(2)}</p>
        <button onClick={() => { stopCardListener(); setStage("payment"); }} className="text-[13px] font-semibold text-white/50 underline">Cancel</button>
      </div>
    );
  }

  if (stage === "payment") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">Total due</p>
        <p className="text-5xl font-black mb-8">R{subtotal.toFixed(2)}</p>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={() => completeSale("cash")} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2" style={{ background: "#34D399", color: "#065F46" }}>
            <Banknote className="w-5 h-5" /> Cash
          </button>
          <button onClick={handleCardPayment} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 border-2 border-white/20 text-white">
            <CreditCard className="w-5 h-5" /> Card
          </button>
          {!readerReady && <p className="text-[11px] text-amber-300 flex items-center justify-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Card reader not yet integrated for this hardware</p>}
        </div>
        <button onClick={() => setStage("browse")} className="mt-6 text-[13px] font-semibold text-white/50 underline">Back to cart</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {loadError && <p className="text-[12.5px] text-red-300 mb-3">{loadError}</p>}
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1">Products</p>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {products.map(p => (
            <button key={p.id} onClick={() => addToCart(p)} className="rounded-xl p-3.5 text-left" style={{ background: "rgba(255,255,255,0.08)" }}>
              <p className="text-[13px] font-bold truncate">{p.name}</p>
              <p className="text-[13px] text-emerald-300 font-bold mt-0.5">R{p.price.toFixed(2)}</p>
            </button>
          ))}
          {products.length === 0 && !loadError && <p className="col-span-2 text-center text-white/40 text-sm py-8">No products in the catalog yet</p>}
        </div>

        {cart.length > 0 && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1">Cart</p>
            <div className="space-y-2">
              {cart.map((line, i) => (
                <div key={i} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate">{line.name}</p>
                    <p className="text-[11.5px] text-white/40">R{line.unitPrice.toFixed(2)} each</p>
                  </div>
                  <button onClick={() => changeQty(i, -1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="text-[13px] font-bold w-5 text-center">{line.quantity}</span>
                  <button onClick={() => changeQty(i, 1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeLine(i)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {cart.length > 0 && (
        <div className="p-4 border-t border-white/10">
          <button onClick={() => setStage("payment")} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2" style={{ background: "#34D399", color: "#065F46" }}>
            Charge R{subtotal.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}

function saveToHistory(record: LocalSaleRecord) {
  const existing: LocalSaleRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]");
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([record, ...existing].slice(0, 100)));
}

function HistoryScreen() {
  const [history, setHistory] = useState<LocalSaleRecord[]>([]);
  useEffect(() => { setHistory(JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]")); }, []);

  if (!history.length) {
    return <div className="flex flex-col items-center justify-center h-full text-center text-white/40 p-5"><History className="w-10 h-10 mb-3" /><p className="text-sm">No sales yet</p></div>;
  }

  return (
    <div className="space-y-2.5 p-4">
      {history.map(r => (
        <div key={r.id} className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="min-w-0">
            <p className="text-[14px] font-bold">R{r.total.toFixed(2)}</p>
            <p className="text-[11px] text-white/40 capitalize">{r.paymentMethod} · {r.itemCount} item{r.itemCount !== 1 ? "s" : ""} · {new Date(r.timestamp).toLocaleString()}</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>
      ))}
    </div>
  );
}
