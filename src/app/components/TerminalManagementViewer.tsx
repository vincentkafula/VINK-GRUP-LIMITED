import { useEffect, useState } from "react";
import { X, Smartphone, Plus, ShieldCheck, ShieldOff, ShieldAlert, Copy, CheckCircle2, RefreshCw } from "lucide-react";
import { getBankToken } from "../services/bankingApi";

/**
 * Admin-facing terminal access control. This is the concrete answer to
 * "admin of the website must control who use those apps functionally":
 * a terminal only authenticates successfully (see
 * server/src/services/terminalAuth.ts's authenticateTerminal()) while
 * its status is 'active'. Setting it to 'inactive' or 'revoked' here
 * immediately blocks that physical device's next tap submission --
 * this screen is the real lever, not a cosmetic list.
 *
 * Same principle applies to any other separately-installed app (the
 * terminal app today; any future standalone app the same way) --
 * "installed separately, but integrated with the website" means the
 * app authenticates against this same backend and this same admin
 * surface controls its access, rather than each separate app inventing
 * its own disconnected account system.
 */

interface Terminal {
  id: string;
  serial: string;
  model: string;
  status: "active" | "inactive" | "revoked";
  assigned_driver: string | null;
  investor_id: string | null;
  owner_id: string | null;
  driver_id: string | null;
  association_id: string | null;
  last_seen_at: string | null;
  registered_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

const STATUS_STYLE: Record<Terminal["status"], { bg: string; color: string; icon: any; label: string }> = {
  active: { bg: "#E9F7EF", color: "#059669", icon: ShieldCheck, label: "Active" },
  inactive: { bg: "#F3F4F6", color: "#6B7280", icon: ShieldOff, label: "Inactive" },
  revoked: { bg: "#FEE2E2", color: "#DC2626", icon: ShieldAlert, label: "Revoked" },
};

interface Props { isOpen: boolean; onClose: () => void }

export function TerminalManagementViewer({ isOpen, onClose }: Props) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [assigningTerminal, setAssigningTerminal] = useState<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = () => getBankToken() ?? "";

  async function loadTerminals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/terminals`, { headers: { Authorization: `Bearer ${token()}` } });
      const json = await res.json();
      if (json.success) setTerminals(json.data);
      else setError(json.error ?? "Could not load terminals");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isOpen) loadTerminals(); }, [isOpen]);

  async function updateStatus(id: string, status: Terminal["status"]) {
    try {
      const res = await fetch(`${API_BASE}/api/terminal/terminals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) setTerminals(ts => ts.map(t => t.id === id ? json.data : t));
      else setError(json.error ?? "Could not update terminal");
    } catch {
      setError("Could not reach the server");
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.55)" }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 flex items-start justify-between border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <p className="text-[17px] font-black text-gray-900 flex items-center gap-2"><Smartphone className="w-5 h-5" /> Terminal Access Control</p>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Every registered P18Q device, and who's allowed to use it right now.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={loadTerminals} className="flex items-center gap-1.5 text-[12.5px] font-bold text-gray-500 hover:text-gray-700">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#0F3D24" }}>
              <Plus className="w-4 h-4" /> Register terminal
            </button>
          </div>

          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-[12.5px]">{error}</div>}

          {terminals.length === 0 && !loading ? (
            <div className="text-center py-12 text-gray-400"><Smartphone className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">No terminals registered yet</p></div>
          ) : (
            <div className="space-y-2.5">
              {terminals.map(t => {
                const s = STATUS_STYLE[t.status];
                return (
                  <div key={t.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}><s.icon className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[13.5px] font-bold text-gray-900 font-mono">{t.serial}</p>
                      <p className="text-[11.5px] text-gray-400">{t.model} {t.assigned_driver ? `· ${t.assigned_driver}` : ""} {t.last_seen_at ? `· last seen ${new Date(t.last_seen_at).toLocaleString()}` : "· never connected"}</p>
                      <p className="text-[11px] mt-1" style={{ color: (t.investor_id && t.owner_id && t.driver_id) ? "#059669" : "#D97706" }}>
                        {(t.investor_id && t.owner_id && t.driver_id) ? "Ownership assigned -- revenue split active" : "Ownership not fully assigned -- taps will not split to real accounts yet"}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setAssigningTerminal(t)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50">Assign ownership</button>
                      {t.status !== "active" && <button onClick={() => updateStatus(t.id, "active")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">Activate</button>}
                      {t.status !== "inactive" && <button onClick={() => updateStatus(t.id, "inactive")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">Deactivate</button>}
                      {t.status !== "revoked" && <button onClick={() => updateStatus(t.id, "revoked")} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-red-200 text-red-600 hover:bg-red-50">Revoke</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showRegister && <RegisterTerminalModal onClose={() => setShowRegister(false)} onRegistered={() => { setShowRegister(false); loadTerminals(); }} token={token()} />}
      {assigningTerminal && <AssignOwnershipModal terminal={assigningTerminal} onClose={() => setAssigningTerminal(null)} onSaved={() => { setAssigningTerminal(null); loadTerminals(); }} token={token()} />}
    </div>
  );
}

function RegisterTerminalModal({ onClose, onRegistered, token }: { onClose: () => void; onRegistered: () => void; token: string }) {
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("P18Q Bus Validator");
  const [result, setResult] = useState<{ serial: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ serial, model }),
      });
      const json = await res.json();
      if (json.success) setResult(json.data);
      else setError(json.error ?? "Could not register terminal");
    } catch {
      setError("Could not reach the server");
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={result ? undefined : onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        {!result ? (
          <>
            <h3 className="text-[16px] font-black text-gray-900 mb-1">Register a new terminal</h3>
            <p className="text-[12.5px] text-gray-400 mb-4">This is the only step required before a device buyer can pair the standalone terminal app to this unit.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Serial number</label>
                <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="e.g. P18Q-CT-00847" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Model</label>
                <input value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
              </div>
            </div>
            {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
            <div className="flex gap-2.5 mt-5">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
              <button onClick={handleRegister} disabled={!serial.trim()} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-40" style={{ background: "#0F3D24" }}>Register</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-[16px] font-black text-gray-900 mb-1">Terminal registered</h3>
            <p className="text-[12.5px] text-amber-600 font-semibold mb-4">This API key is shown once. Copy it now and give it to whoever is setting up the device -- it cannot be retrieved again after you close this.</p>
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
            <button onClick={onRegistered} className="w-full mt-5 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: "#0F3D24" }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Assigns the ownership chain (investor/owner/driver/association) that
 * makes the real multi-party revenue split in POST /api/terminal/tap
 * possible at all -- without these, a tap's split is calculated but has
 * no real account to credit. Takes raw user IDs (UUIDs) rather than a
 * search/autocomplete picker -- a real first version of this admin flow,
 * not a placeholder, but a search-by-name picker is a reasonable follow-up
 * once there's a "list users by role" endpoint to back it with.
 */
function AssignOwnershipModal({ terminal, onClose, onSaved, token }: { terminal: Terminal; onClose: () => void; onSaved: () => void; token: string }) {
  const [investorId, setInvestorId] = useState(terminal.investor_id ?? "");
  const [ownerId, setOwnerId] = useState(terminal.owner_id ?? "");
  const [driverId, setDriverId] = useState(terminal.driver_id ?? "");
  const [associationId, setAssociationId] = useState(terminal.association_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/terminals/${terminal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          investorId: investorId.trim() || undefined,
          ownerId: ownerId.trim() || undefined,
          driverId: driverId.trim() || undefined,
          associationId: associationId.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) onSaved();
      else setError(json.error ?? "Could not save ownership assignment");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-black text-gray-900 mb-1">Assign ownership</h3>
        <p className="text-[12.5px] text-gray-400 mb-4 font-mono">{terminal.serial}</p>
        <p className="text-[12px] text-gray-500 mb-4">Enter each party's VINK account ID (UUID). This determines who a real tap on this device actually pays -- 75% of the fare (after VINK's flat fee) to the driver, 15% to the owner, 10% to the investor.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Investor account ID</label>
            <input value={investorId} onChange={e => setInvestorId(e.target.value)} placeholder="UUID" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Owner account ID</label>
            <input value={ownerId} onChange={e => setOwnerId(e.target.value)} placeholder="UUID" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Driver account ID</label>
            <input value={driverId} onChange={e => setDriverId(e.target.value)} placeholder="UUID" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Association account ID <span className="normal-case font-normal text-gray-400">(reporting only -- not part of the per-tap split)</span></label>
            <input value={associationId} onChange={e => setAssociationId(e.target.value)} placeholder="UUID" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none font-mono" />
          </div>
        </div>
        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: "#0F3D24" }}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
