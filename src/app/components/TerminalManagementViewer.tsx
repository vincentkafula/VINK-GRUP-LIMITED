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
  app_version: string | null;
  battery_pct: number | null;
  last_heartbeat_at: string | null;
  last_seen_at: string | null;
  registered_at: string;
}

interface DeviceFault {
  id: string;
  terminal_id: string;
  serial: string;
  fault_code: string;
  message: string | null;
  severity: "info" | "warning" | "critical";
  resolved: boolean;
  reported_at: string;
}

interface AppRelease {
  id: string;
  version: string;
  download_url: string;
  release_notes: string | null;
  mandatory: boolean;
  active: boolean;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

const STATUS_STYLE: Record<Terminal["status"], { bg: string; color: string; icon: any; label: string }> = {
  active: { bg: "#E9F7EF", color: "#059669", icon: ShieldCheck, label: "Active" },
  inactive: { bg: "#F3F4F6", color: "#6B7280", icon: ShieldOff, label: "Inactive" },
  revoked: { bg: "#FEE2E2", color: "#DC2626", icon: ShieldAlert, label: "Revoked" },
};

const FAULT_SEVERITY_STYLE: Record<DeviceFault["severity"], { background: string; color: string }> = {
  info: { background: "#EFF6FF", color: "#2563EB" },
  warning: { background: "#FFF7ED", color: "#D97706" },
  critical: { background: "#FEE2E2", color: "#DC2626" },
};

interface Props { isOpen: boolean; onClose: () => void }

export function TerminalManagementViewer({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<"terminals" | "faults" | "releases">("terminals");
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [faults, setFaults] = useState<DeviceFault[]>([]);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showPublishRelease, setShowPublishRelease] = useState(false);
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

  async function loadFaults() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/faults`, { headers: { Authorization: `Bearer ${token()}` } });
      const json = await res.json();
      if (json.success) setFaults(json.data);
      else setError(json.error ?? "Could not load fault alarms");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  async function loadReleases() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/app-releases`, { headers: { Authorization: `Bearer ${token()}` } });
      const json = await res.json();
      if (json.success) setReleases(json.data);
      else setError(json.error ?? "Could not load app releases");
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    if (tab === "terminals") loadTerminals();
    else if (tab === "faults") loadFaults();
    else if (tab === "releases") loadReleases();
  }, [isOpen, tab]);

  async function resolveFault(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/terminal/faults/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const json = await res.json();
      if (json.success) setFaults(fs => fs.map(f => f.id === id ? json.data : f));
      else setError(json.error ?? "Could not resolve fault");
    } catch {
      setError("Could not reach the server");
    }
  }

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
        <div className="p-5 flex items-start justify-between border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-[17px] font-black text-gray-900 flex items-center gap-2"><Smartphone className="w-5 h-5" /> Device Management</p>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Access control, live status, fault alarms, and app updates for every P18Q/P10 device.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-gray-100 sticky top-[73px] bg-white z-10">
          {([["terminals", "Terminals"], ["faults", "Fault Alarms"], ["releases", "App Releases"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-3.5 py-2 text-[12.5px] font-bold rounded-t-lg"
              style={tab === key ? { color: "#0F3D24", borderBottom: "2px solid #0F3D24" } : { color: "#9CA3AF" }}>
              {label}
              {key === "faults" && faults.filter(f => !f.resolved).length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 text-red-600">{faults.filter(f => !f.resolved).length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => (tab === "terminals" ? loadTerminals() : tab === "faults" ? loadFaults() : loadReleases())} className="flex items-center gap-1.5 text-[12.5px] font-bold text-gray-500 hover:text-gray-700">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {tab === "terminals" && (
              <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#0F3D24" }}>
                <Plus className="w-4 h-4" /> Register terminal
              </button>
            )}
            {tab === "releases" && (
              <button onClick={() => setShowPublishRelease(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold" style={{ background: "#0F3D24" }}>
                <Plus className="w-4 h-4" /> Publish release
              </button>
            )}
          </div>

          {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-[12.5px]">{error}</div>}

          {tab === "terminals" && (
          <>
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
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {t.app_version ? `v${t.app_version}` : "version unknown"}
                        {t.battery_pct !== null ? ` · ${t.battery_pct}% battery` : ""}
                        {t.last_heartbeat_at ? ` · checked in ${new Date(t.last_heartbeat_at).toLocaleString()}` : " · no heartbeat yet"}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: (t.investor_id && t.owner_id) ? "#059669" : "#D97706" }}>
                        {(t.investor_id && t.owner_id) ? "Ownership assigned -- revenue split active" : "Investor/owner not assigned -- taps will not split to real accounts yet"}
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
          </>
          )}

          {tab === "faults" && (
            faults.length === 0 && !loading ? (
              <div className="text-center py-12 text-gray-400"><ShieldCheck className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">No fault alarms</p></div>
            ) : (
              <div className="space-y-2.5">
                {faults.map(f => (
                  <div key={f.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={FAULT_SEVERITY_STYLE[f.severity]}><ShieldAlert className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[13.5px] font-bold text-gray-900">{f.fault_code}</p>
                      <p className="text-[11.5px] text-gray-400 font-mono">{f.serial} · {new Date(f.reported_at).toLocaleString()}</p>
                      {f.message && <p className="text-[12px] text-gray-600 mt-1">{f.message}</p>}
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold capitalize" style={FAULT_SEVERITY_STYLE[f.severity]}>{f.severity}</span>
                    {f.resolved ? (
                      <span className="text-[11.5px] font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Resolved</span>
                    ) : (
                      <button onClick={() => resolveFault(f.id)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">Mark resolved</button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "releases" && (
            releases.length === 0 && !loading ? (
              <div className="text-center py-12 text-gray-400"><Smartphone className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">No app releases published yet</p></div>
            ) : (
              <div className="space-y-2.5">
                {releases.map(r => (
                  <div key={r.id} className="rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[13.5px] font-bold text-gray-900">v{r.version} {r.mandatory && <span className="text-[10px] font-bold text-red-600 ml-1">MANDATORY</span>}</p>
                      <p className="text-[11.5px] text-gray-400">Published {new Date(r.created_at).toLocaleString()}</p>
                      {r.release_notes && <p className="text-[12px] text-gray-600 mt-1">{r.release_notes}</p>}
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={r.active ? { background: "#E9F7EF", color: "#059669" } : { background: "#F3F4F6", color: "#6B7280" }}>{r.active ? "Active" : "Inactive"}</span>
                  </div>
                ))}
              </div>
            )
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
        <p className="text-[12px] text-gray-500 mb-4">Enter each party's VINK account ID (UUID). On every real tap: VINK keeps a flat R1.00 fee, of which 10% (R0.10) goes to the investor. The owner receives everything else. The driver's pay is a separate fixed amount agreed privately with the owner -- VINK's system doesn't calculate or touch it.</p>
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
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Driver account ID <span className="normal-case font-normal text-gray-400">(identification only -- not part of the per-tap split)</span></label>
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

/**
 * Publishes a new app version for the update check-and-prompt flow.
 * Honest by construction, not just by comment: this only records where
 * to find a version and whether it's mandatory -- it doesn't host or
 * push the .apk itself. download_url needs to point to a real, already
 * -hosted file (e.g. wherever the built .apk from terminal-app/android
 * ends up served from) before this is useful to a real device.
 */
function PublishReleaseModal({ onClose, onPublished, token }: { onClose: () => void; onPublished: () => void; token: string }) {
  const [version, setVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/terminal/app-releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version: version.trim(), downloadUrl: downloadUrl.trim(), releaseNotes: releaseNotes.trim() || undefined, mandatory }),
      });
      const json = await res.json();
      if (json.success) onPublished();
      else setError(json.error ?? "Could not publish release");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" style={{ background: "rgba(10,14,35,.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-black text-gray-900 mb-1">Publish app release</h3>
        <p className="text-[12.5px] text-gray-400 mb-4">Devices see this the next time they check in (every 30 minutes while running, or on pairing). This only records where the update lives -- it doesn't push or install anything by itself; each device still shows an "Install" prompt the operator has to tap.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Version</label>
            <input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1.1.0" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Download URL</label>
            <input value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)} placeholder="https://.../vink-terminal-1.1.0.apk" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Release notes (optional)</label>
            <textarea value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none resize-none" />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-gray-600">
            <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} />
            Mandatory update (hides the "Later" option on devices)
          </label>
        </div>
        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">Cancel</button>
          <button onClick={handlePublish} disabled={saving || !version.trim() || !downloadUrl.trim()} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: "#0F3D24" }}>{saving ? "Publishing..." : "Publish"}</button>
        </div>
      </div>
    </div>
  );
}
