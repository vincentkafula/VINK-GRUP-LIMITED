import { useEffect, useState } from "react";
import { X, Store, Plus, ShieldCheck, ShieldOff, ShieldAlert, Copy, CheckCircle2, RefreshCw, Package, Receipt } from "lucide-react";
import { getBankToken } from "../services/bankingApi";

/**
 * Admin-facing management for the retail POS and till/POS systems --
 * the missing piece flagged at the end of both prior commits: the
 * backend for merchants/products/terminals/sales was real, but nothing
 * in the web app called any of it. This is that UI, following the
 * exact same proven pattern as TerminalManagementViewer.tsx (tab
 * switcher, status badges, one-time API key reveal on registration).
 */

interface Merchant { id: string; owner_id: string; business_name: string; registered_at: string }
interface Product { id: string; merchant_id: string; name: string; sku: string | null; price: number; stock_qty: number | null; active: boolean }
interface RetailTerminal { id: string; serial: string; model: string; status: "active" | "inactive" | "revoked"; merchant_id: string | null; app_version: string | null; battery_pct: number | null; last_seen_at: string | null; registered_at: string }
interface TillTerminal extends RetailTerminal {}
interface RetailTransaction { id: string; terminal_id: string; amount: number; vink_fee_amount: number; merchant_settlement: number; received_at: string }
interface Sale { id: string; terminal_id: string; total: number; payment_method: string; vink_fee_amount: number; merchant_settlement: number; created_at: string; items: { product_name: string; quantity: number; line_total: number }[] }

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

const STATUS_STYLE: Record<RetailTerminal["status"], { bg: string; color: string; icon: any; label: string }> = {
  active: { bg: "#E9F7EF", color: "#059669", icon: ShieldCheck, label: "Active" },
  inactive: { bg: "#F3F4F6", color: "#6B7280", icon: ShieldOff, label: "Inactive" },
  revoked: { bg: "#FEE2E2", color: "#DC2626", icon: ShieldAlert, label: "Revoked" },
};

type Tab = "merchants" | "products" | "retailTerminals" | "tillTerminals" | "sales";

interface Props { isOpen: boolean; onClose: () => void }

export function RetailTillManagementViewer({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("merchants");
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [retailTerminals, setRetailTerminals] = useState<RetailTerminal[]>([]);
  const [tillTerminals, setTillTerminals] = useState<TillTerminal[]>([]);
  const [transactions, setTransactions] = useState<RetailTransaction[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddMerchant, setShowAddMerchant] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showRegisterRetail, setShowRegisterRetail] = useState(false);
  const [showRegisterTill, setShowRegisterTill] = useState(false);
  const [assigningTerminal, setAssigningTerminal] = useState<{ terminal: RetailTerminal; kind: "retail" | "till" } | null>(null);

  const token = () => getBankToken() ?? "";
  const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

  async function loadAll(t: Tab) {
    setLoading(true);
    setError(null);
    try {
      if (t === "merchants") {
        const res = await fetch(`${API_BASE}/api/retail/merchants`, { headers: authHeaders() });
        const json = await res.json();
        if (json.success) setMerchants(json.data); else setError(json.error);
      } else if (t === "products") {
        const res = await fetch(`${API_BASE}/api/till/admin/products`, { headers: authHeaders() });
        const json = await res.json();
        if (json.success) setProducts(json.data); else setError(json.error);
      } else if (t === "retailTerminals") {
        const res = await fetch(`${API_BASE}/api/retail/terminals`, { headers: authHeaders() });
        const json = await res.json();
        if (json.success) setRetailTerminals(json.data); else setError(json.error);
      } else if (t === "tillTerminals") {
        const res = await fetch(`${API_BASE}/api/till/terminals`, { headers: authHeaders() });
        const json = await res.json();
        if (json.success) setTillTerminals(json.data); else setError(json.error);
      } else if (t === "sales") {
        const [txnRes, saleRes] = await Promise.all([
          fetch(`${API_BASE}/api/retail/transactions`, { headers: authHeaders() }),
          fetch(`${API_BASE}/api/till/sales`, { headers: authHeaders() }),
        ]);
        const txnJson = await txnRes.json();
        const saleJson = await saleRes.json();
        if (txnJson.success) setTransactions(txnJson.data);
        if (saleJson.success) setSales(saleJson.data);
        if (!txnJson.success) setError(txnJson.error);
        else if (!saleJson.success) setError(saleJson.error);
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isOpen) loadAll(tab); }, [isOpen, tab]);

  async function updateTerminalStatus(kind: "retail" | "till", id: string, status: RetailTerminal["status"]) {
    try {
      const res = await fetch(`${API_BASE}/api/${kind}/terminals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        if (kind === "retail") setRetailTerminals(ts => ts.map(t => t.id === id ? json.data : t));
        else setTillTerminals(ts => ts.map(t => t.id === id ? json.data : t));
      } else setError(json.error);
    } catch {
      setError("Could not reach the server");
    }
  }

  if (!isOpen) return null;

  const merchantName = (id: string | null) => merchants.find(m => m.id === id)?.business_name ?? "Unassigned";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.55)" }}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 flex items-start justify-between border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-[17px] font-black text-gray-900 flex items-center gap-2"><Store className="w-5 h-5" /> Retail &amp; Till Management</p>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Merchants, products, retail card terminals, tills, and sales -- connected to the same real banking accounts.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-gray-100 sticky top-[73px] bg-white z-10 overflow-x-auto">
          {([["merchants", "Merchants"], ["products", "Products"], ["retailTerminals", "Retail Terminals"], ["tillTerminals", "Till Terminals"], ["sales", "Sales & Transactions"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className="px-3.5 py-2 text-[12.5px] font-bold rounded-t-lg whitespace-nowrap"
              style={tab === key ? { color: "#1E3A8A", borderBottom: "2px solid #1E3A8A" } : { color: "#9CA3AF" }}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => loadAll(tab)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-gray-500 hover:text-gray-700">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {tab === "merchants" && <button onClick={() => setShowAddMerchant(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#1E3A8A" }}><Plus className="w-4 h-4" /> Add merchant</button>}
            {tab === "products" && <button onClick={() => setShowAddProduct(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#1E3A8A" }}><Plus className="w-4 h-4" /> Add product</button>}
            {tab === "retailTerminals" && <button onClick={() => setShowRegisterRetail(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#1E3A8A" }}><Plus className="w-4 h-4" /> Register terminal</button>}
            {tab === "tillTerminals" && <button onClick={() => setShowRegisterTill(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#1E3A8A" }}><Plus className="w-4 h-4" /> Register till</button>}
          </div>

          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-[12.5px]">{error}</div>}

          {tab === "merchants" && (
            merchants.length === 0 && !loading ? <EmptyState icon={Store} label="No merchants yet" /> : (
              <div className="space-y-2.5">
                {merchants.map(m => (
                  <div key={m.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-700"><Store className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900">{m.business_name}</p>
                      <p className="text-[11.5px] text-gray-400 font-mono">{m.owner_id} · registered {new Date(m.registered_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "products" && (
            products.length === 0 && !loading ? <EmptyState icon={Package} label="No products yet" /> : (
              <div className="space-y-2.5">
                {products.map(p => (
                  <div key={p.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-700"><Package className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900">{p.name} {!p.active && <span className="text-[10px] font-bold text-gray-400 ml-1">INACTIVE</span>}</p>
                      <p className="text-[11.5px] text-gray-400">{merchantName(p.merchant_id)} {p.sku ? `· SKU ${p.sku}` : ""} {p.stock_qty !== null ? `· ${p.stock_qty} in stock` : ""}</p>
                    </div>
                    <p className="text-[14px] font-bold text-gray-900">R{p.price.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "retailTerminals" && (
            retailTerminals.length === 0 && !loading ? <EmptyState icon={ShieldCheck} label="No retail terminals registered yet" /> : (
              <div className="space-y-2.5">
                {retailTerminals.map(t => {
                  const s = STATUS_STYLE[t.status];
                  return (
                    <div key={t.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
                      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}><s.icon className="w-5 h-5" /></span>
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[13.5px] font-bold text-gray-900 font-mono">{t.serial}</p>
                        <p className="text-[11.5px] text-gray-400">{t.model} · {merchantName(t.merchant_id)} {t.battery_pct !== null ? `· ${t.battery_pct}% battery` : ""}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setAssigningTerminal({ terminal: t, kind: "retail" })} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Assign merchant</button>
                        {t.status !== "active" && <button onClick={() => updateTerminalStatus("retail", t.id, "active")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">Activate</button>}
                        {t.status !== "revoked" && <button onClick={() => updateTerminalStatus("retail", t.id, "revoked")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-red-200 text-red-600 hover:bg-red-50">Revoke</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === "tillTerminals" && (
            tillTerminals.length === 0 && !loading ? <EmptyState icon={ShieldCheck} label="No till terminals registered yet" /> : (
              <div className="space-y-2.5">
                {tillTerminals.map(t => {
                  const s = STATUS_STYLE[t.status];
                  return (
                    <div key={t.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
                      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}><s.icon className="w-5 h-5" /></span>
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[13.5px] font-bold text-gray-900 font-mono">{t.serial}</p>
                        <p className="text-[11.5px] text-gray-400">{t.model} · {merchantName(t.merchant_id)} {t.battery_pct !== null ? `· ${t.battery_pct}% battery` : ""}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setAssigningTerminal({ terminal: t, kind: "till" })} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Assign merchant</button>
                        {t.status !== "active" && <button onClick={() => updateTerminalStatus("till", t.id, "active")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">Activate</button>}
                        {t.status !== "revoked" && <button onClick={() => updateTerminalStatus("till", t.id, "revoked")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-red-200 text-red-600 hover:bg-red-50">Revoke</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === "sales" && (
            (transactions.length === 0 && sales.length === 0 && !loading) ? <EmptyState icon={Receipt} label="No sales or transactions yet" /> : (
              <div className="space-y-2.5">
                {sales.map(s => (
                  <div key={s.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-700"><Receipt className="w-4 h-4" /></span>
                      <p className="text-[13.5px] font-bold text-gray-900">R{s.total.toFixed(2)}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold capitalize" style={{ background: s.payment_method === "cash" ? "#F3F4F6" : "#EFF6FF", color: s.payment_method === "cash" ? "#6B7280" : "#2563EB" }}>{s.payment_method}</span>
                      <p className="text-[11px] text-gray-400 ml-auto">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                    <p className="text-[11.5px] text-gray-400 ml-11">{s.items.map(i => `${i.quantity}x ${i.product_name}`).join(", ")} {s.vink_fee_amount > 0 && `· VINK fee R${s.vink_fee_amount.toFixed(2)}`}</p>
                  </div>
                ))}
                {transactions.map(t => (
                  <div key={t.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-700"><Receipt className="w-4 h-4" /></span>
                    <p className="text-[13.5px] font-bold text-gray-900">R{t.amount.toFixed(2)}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ background: "#EFF6FF", color: "#2563EB" }}>card</span>
                    <p className="text-[11px] text-gray-400 ml-auto">VINK fee R{t.vink_fee_amount.toFixed(2)} · {new Date(t.received_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {showAddMerchant && <AddMerchantModal onClose={() => setShowAddMerchant(false)} onSaved={() => { setShowAddMerchant(false); loadAll("merchants"); }} token={token()} />}
      {showAddProduct && <AddProductModal merchants={merchants} onClose={() => setShowAddProduct(false)} onSaved={() => { setShowAddProduct(false); loadAll("products"); }} token={token()} />}
      {showRegisterRetail && <RegisterModal kind="retail" onClose={() => setShowRegisterRetail(false)} onRegistered={() => { setShowRegisterRetail(false); loadAll("retailTerminals"); }} token={token()} />}
      {showRegisterTill && <RegisterModal kind="till" onClose={() => setShowRegisterTill(false)} onRegistered={() => { setShowRegisterTill(false); loadAll("tillTerminals"); }} token={token()} />}
      {assigningTerminal && <AssignMerchantModal terminal={assigningTerminal.terminal} kind={assigningTerminal.kind} merchants={merchants} onClose={() => setAssigningTerminal(null)} onSaved={() => { setAssigningTerminal(null); loadAll(assigningTerminal.kind === "retail" ? "retailTerminals" : "tillTerminals"); }} token={token()} />}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return <div className="text-center py-12 text-gray-400"><Icon className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">{label}</p></div>;
}

function AddMerchantModal({ onClose, onSaved, token }: { onClose: () => void; onSaved: () => void; token: string }) {
  const [ownerId, setOwnerId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/retail/merchants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ownerId: ownerId.trim(), businessName: businessName.trim() }),
      });
      const json = await res.json();
      if (json.success) onSaved(); else setError(json.error ?? "Could not add merchant");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-black text-gray-900 mb-1">Add merchant</h3>
        <p className="text-[12.5px] text-gray-400 mb-4">Connects to the same real VINK banking account this owner already has -- not a separate account system.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Owner account ID</label>
            <input value={ownerId} onChange={e => setOwnerId(e.target.value)} placeholder="UUID" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Business name</label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Corner Shop" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
          </div>
        </div>
        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving || !ownerId.trim() || !businessName.trim()} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: "#1E3A8A" }}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ merchants, onClose, onSaved, token }: { merchants: Merchant[]; onClose: () => void; onSaved: () => void; token: string }) {
  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? "");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/till/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantId, name: name.trim(), sku: sku.trim() || undefined, price: parseFloat(price), stockQty: stockQty.trim() ? parseInt(stockQty, 10) : undefined }),
      });
      const json = await res.json();
      if (json.success) onSaved(); else setError(json.error ?? "Could not add product");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  const priceValid = !isNaN(parseFloat(price)) && parseFloat(price) >= 0;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-black text-gray-900 mb-4">Add product</h3>
        {merchants.length === 0 ? (
          <p className="text-[12.5px] text-amber-600">Add a merchant first -- a product needs one to belong to.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Merchant</label>
              <select value={merchantId} onChange={e => setMerchantId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none bg-white">
                {merchants.map(m => <option key={m.id} value={m.id}>{m.business_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Product name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bread" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Price (R)</label>
                <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="0.00" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Stock (optional)</label>
                <input value={stockQty} onChange={e => setStockQty(e.target.value)} type="number" placeholder="Unlimited" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">SKU (optional)</label>
              <input value={sku} onChange={e => setSku(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
            </div>
          </div>
        )}
        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving || !merchantId || !name.trim() || !priceValid} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: "#1E3A8A" }}>{saving ? "Saving..." : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

function RegisterModal({ kind, onClose, onRegistered, token }: { kind: "retail" | "till"; onClose: () => void; onRegistered: () => void; token: string }) {
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState(kind === "retail" ? "Retail POS" : "Till Device");
  const [result, setResult] = useState<{ serial: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/${kind}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ serial, model }),
      });
      const json = await res.json();
      if (json.success) setResult(json.data); else setError(json.error ?? "Could not register terminal");
    } catch {
      setError("Could not reach the server");
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={result ? undefined : onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        {!result ? (
          <>
            <h3 className="text-[16px] font-black text-gray-900 mb-4">Register {kind === "retail" ? "retail terminal" : "till"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Serial number</label>
                <input value={serial} onChange={e => setSerial(e.target.value)} placeholder={kind === "retail" ? "e.g. RETAIL-CT-00012" : "e.g. TILL-CT-00012"} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Model</label>
                <input value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
            </div>
            {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
            <div className="flex gap-2.5 mt-5">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
              <button onClick={handleRegister} disabled={!serial.trim()} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-40" style={{ background: "#1E3A8A" }}>Register</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-[16px] font-black text-gray-900 mb-1">Terminal registered</h3>
            <p className="text-[12.5px] text-amber-600 font-semibold mb-4">This API key is shown once. Copy it now -- it cannot be retrieved again after you close this.</p>
            <div className="rounded-xl bg-gray-50 p-4 space-y-3">
              <div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Serial</p><p className="text-[13px] font-mono font-bold text-gray-900">{result.serial}</p></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">API Key</p>
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-mono text-gray-900 break-all flex-1">{result.apiKey}</p>
                  <button onClick={() => { navigator.clipboard.writeText(result.apiKey); setCopied(true); }} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={onRegistered} className="w-full mt-5 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: "#1E3A8A" }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

function AssignMerchantModal({ terminal, kind, merchants, onClose, onSaved, token }: { terminal: RetailTerminal; kind: "retail" | "till"; merchants: Merchant[]; onClose: () => void; onSaved: () => void; token: string }) {
  const [merchantId, setMerchantId] = useState(terminal.merchant_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/${kind}/terminals/${terminal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantId: merchantId || undefined }),
      });
      const json = await res.json();
      if (json.success) onSaved(); else setError(json.error ?? "Could not save");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-black text-gray-900 mb-1">Assign merchant</h3>
        <p className="text-[12.5px] text-gray-400 mb-4 font-mono">{terminal.serial}</p>
        {merchants.length === 0 ? (
          <p className="text-[12.5px] text-amber-600">No merchants yet -- add one in the Merchants tab first.</p>
        ) : (
          <select value={merchantId} onChange={e => setMerchantId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none bg-white">
            <option value="">-- Unassigned --</option>
            {merchants.map(m => <option key={m.id} value={m.id}>{m.business_name}</option>)}
          </select>
        )}
        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: "#1E3A8A" }}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
