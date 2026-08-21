import { useEffect, useState } from "react";
import { X, LayoutGrid, ShieldAlert, RefreshCw, Smartphone, Store, ShoppingCart, CheckCircle2, AlertTriangle, Receipt } from "lucide-react";
import { getBankToken } from "../services/bankingApi";

/**
 * Single-pane-of-glass overview across every device fleet in the VINK
 * ecosystem -- taxi AFC terminals (za.co.vink.terminal), retail card
 * machines (za.co.vink.retailpos), and till devices (za.co.vink.till).
 * All three are genuinely separate Google Play Console listings (own
 * package IDs, own APKs), but all connect to this one real backend --
 * this view is that shared connection made visible in one place,
 * rather than needing to open TerminalManagementViewer.tsx and
 * RetailTillManagementViewer.tsx separately to get the full picture.
 * Aggregates real data from the same endpoints those two viewers
 * already use -- this component adds no new backend capability, only
 * a unified view across what already exists.
 */

interface FleetSummary {
  label: string;
  icon: any;
  color: string;
  total: number;
  active: number;
  inactive: number;
  revoked: number;
  unresolvedFaults: number;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

interface Props { isOpen: boolean; onClose: () => void; onOpenTerminalManagement?: () => void; onOpenRetailTillManagement?: () => void }

export function ControlCentreViewer({ isOpen, onClose, onOpenTerminalManagement, onOpenRetailTillManagement }: Props) {
  const [fleets, setFleets] = useState<FleetSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ label: string; icon: any; color: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = () => getBankToken() ?? "";
  const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

  function summarize(label: string, icon: any, color: string, terminals: any[], faults: any[]): FleetSummary {
    return {
      label, icon, color,
      total: terminals.length,
      active: terminals.filter(t => t.status === "active").length,
      inactive: terminals.filter(t => t.status === "inactive").length,
      revoked: terminals.filter(t => t.status === "revoked").length,
      unresolvedFaults: faults.filter(f => !f.resolved).length,
    };
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [
        taxiTerminals, taxiFaults,
        retailTerminals, retailFaults,
        tillTerminals, tillFaults,
        taps, transactions, sales,
      ] = await Promise.all([
        fetch(`${API_BASE}/api/terminal/terminals`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/terminal/faults`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/retail/terminals`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/retail/faults`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/till/terminals`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/till/faults`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/terminal/taps`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/retail/transactions`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE}/api/till/sales`, { headers: authHeaders() }).then(r => r.json()),
      ]);

      const firstError = [taxiTerminals, taxiFaults, retailTerminals, retailFaults, tillTerminals, tillFaults, taps, transactions, sales]
        .find(r => r.success === false);
      if (firstError) setError(firstError.error ?? "Could not load one or more fleets");

      setFleets([
        summarize("Taxi AFC Terminals", Smartphone, "#0F3D24", taxiTerminals.data ?? [], taxiFaults.data ?? []),
        summarize("Retail Card Machines", Store, "#1E3A8A", retailTerminals.data ?? [], retailFaults.data ?? []),
        summarize("Till Devices", ShoppingCart, "#065F46", tillTerminals.data ?? [], tillFaults.data ?? []),
      ]);

      setRecentActivity([
        { label: "Taxi taps", icon: Receipt, color: "#0F3D24", count: (taps.data ?? []).length },
        { label: "Retail transactions", icon: Receipt, color: "#1E3A8A", count: (transactions.data ?? []).length },
        { label: "Till sales", icon: Receipt, color: "#065F46", count: (sales.data ?? []).length },
      ]);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isOpen) loadAll(); }, [isOpen]);

  if (!isOpen) return null;

  const totalDevices = fleets.reduce((s, f) => s + f.total, 0);
  const totalUnresolvedFaults = fleets.reduce((s, f) => s + f.unresolvedFaults, 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.55)" }}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 flex items-start justify-between border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-[17px] font-black text-gray-900 flex items-center gap-2"><LayoutGrid className="w-5 h-5" /> Control Centre</p>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Every device fleet, one backend. Each app is a separate Google Play Console listing, all connected here.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={loadAll} className="flex items-center gap-1.5 text-[12.5px] font-bold text-gray-500 hover:text-gray-700">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <div className="flex items-center gap-3 text-[12px] font-bold text-gray-500">
              <span>{totalDevices} devices total</span>
              {totalUnresolvedFaults > 0 && (
                <span className="flex items-center gap-1" style={{ color: "#DC2626" }}><AlertTriangle className="w-3.5 h-3.5" /> {totalUnresolvedFaults} unresolved faults</span>
              )}
            </div>
          </div>

          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-[12.5px]">{error}</div>}

          <div className="grid md:grid-cols-3 gap-3 mb-6">
            {fleets.map(f => (
              <div key={f.label} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: f.color + "18", color: f.color }}><f.icon className="w-4 h-4" /></span>
                  <p className="text-[13px] font-bold text-gray-900">{f.label}</p>
                </div>
                <p className="text-2xl font-black text-gray-900 mb-2">{f.total}</p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> {f.active} active</span>
                  <span className="text-gray-400">{f.inactive} inactive</span>
                  <span className="text-red-500">{f.revoked} revoked</span>
                </div>
                {f.unresolvedFaults > 0 && (
                  <p className="text-[11px] font-bold text-red-600 mt-2 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {f.unresolvedFaults} unresolved fault{f.unresolvedFaults !== 1 ? "s" : ""}</p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Recent activity (most recent 200 per fleet)</p>
          <div className="grid md:grid-cols-3 gap-3 mb-6">
            {recentActivity.map(a => (
              <div key={a.label} className="rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.color + "18", color: a.color }}><a.icon className="w-4 h-4" /></span>
                <div><p className="text-lg font-black text-gray-900">{a.count}</p><p className="text-[11px] text-gray-400">{a.label}</p></div>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5">
            {onOpenTerminalManagement && (
              <button onClick={onOpenTerminalManagement} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[12.5px] font-bold text-gray-700 hover:bg-gray-50">
                Manage taxi terminals →
              </button>
            )}
            {onOpenRetailTillManagement && (
              <button onClick={onOpenRetailTillManagement} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[12.5px] font-bold text-gray-700 hover:bg-gray-50">
                Manage retail &amp; till →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
