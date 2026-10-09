import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";

/**
 * Operations for owners and superadmins: the go-live gate (what must be true before real money), the system's health and the alerts it has sent, and the
 * sponsor bank's settlement files with the lines that do not match what VINK approved.
 */
interface GateItem { key: string; title: string; kind: "auto" | "manual"; help: string; ok: boolean; detail: string; confirmedBy?: string; confirmedAt?: string; note?: string }
interface Gate { ready: boolean; mode: string; missing: number; items: GateItem[] }
interface Issue { severity: "problem" | "attention"; code: string; message: string; count: number }
interface Health { ok: boolean; checkedAt: string; issues: Issue[]; alerts: { code: string; severity: string; lastSent: string | null; resolvedAt: string | null }[]; destinations: string[] }
interface FileRow { id: string; provider: string; filename: string; lines: number; matched: number; exceptions: number; importedAt: string }
interface Exception { id: string; provider: string; authorisationId: string; type: string; amountCents: number; currency: string; settledOn: string; reference: string; result: string }

function opsClient() {
  const base = `${API_BASE}/api/admin/ops`;
  return async function call<T = Record<string, never>>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}

const COLOR = "#8B0000";
const RESULT_TEXT: Record<string, string> = {
  unknown_purchase: "VINK has no such purchase", amount_mismatch: "Amount differs from what VINK approved", declined_purchase: "VINK declined this purchase",
  refund_exceeds: "Refund is more than VINK reversed", currency_mismatch: "Currency differs", duplicate: "Repeated line",
};
const money = (cents: number, cur: string) => `${cur} ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OpsPanel() {
  const call = opsClient();
  const [gate, reloadGate] = useLoad<Gate>(() => call("/go-live"));
  const [health, reloadHealth] = useLoad<Health>(() => call("/health"));
  const [files, reloadFiles] = useLoad<{ files: FileRow[] }>(() => call("/settlement/files"));
  const [exceptions, reloadExceptions] = useLoad<{ exceptions: Exception[] }>(() => call("/settlement/exceptions"));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("paymentology");
  const [filename, setFilename] = useState("");
  const [csv, setCsv] = useState("");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-fg">Operations</h1>
        <p className="text-fg-muted text-sm">What must be true before real money, how the system is doing, and the sponsor bank's settlement files.</p>
      </div>

      <section aria-label="Go-live gate" className="space-y-3">
        <h2 className="text-base font-black text-fg">Go-live gate</h2>
        <Status load={gate}>{(g) => (
          <>
            <p role="status" className="text-sm font-semibold" style={{ color: g.ready ? "#047857" : "#B45309" }}>
              {g.ready ? "Everything is satisfied. Live mode may start." : `${g.missing} item${g.missing === 1 ? "" : "s"} still to satisfy before live mode can start.`} <span className="font-normal text-fg-muted">The system is in {g.mode} mode.</span>
            </p>
            <p className="text-xs text-fg-muted">Confirm the items only people can do, with a note saying where the evidence is. Do this while the system is still in sandbox mode: live mode checks these when it starts.</p>
            <ul className="space-y-2">{g.items.map((i) => (
              <li key={i.key} className="rounded-lg p-3 text-sm" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                <p className="flex items-start gap-2 text-fg">
                  {i.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#047857" }} /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#B91C1C" }} />}
                  <span><b>{i.title}</b> <span className="text-xs text-fg-muted">· {i.kind === "auto" ? "checked by the system" : "confirmed by a person"} · {i.detail}</span></span>
                </p>
                <p className="text-xs text-fg-muted ml-6">{i.help}</p>
                {i.kind === "manual" && i.ok && (
                  <div className="ml-6 mt-1 flex flex-wrap items-center gap-3 text-xs text-fg">
                    <span>Confirmed by <b>{i.confirmedBy}</b>{i.confirmedAt ? `, ${when(i.confirmedAt)}` : ""}: {i.note}</span>
                    <ActionButton small label="Withdraw" color="#64748B" onRun={async () => { const r = await call(`/go-live/${i.key}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reloadGate(); }} />
                  </div>)}
                {i.kind === "manual" && !i.ok && (
                  <div className="ml-6 mt-2 flex flex-wrap items-end gap-2">
                    <label className="block flex-1 min-w-[14rem]"><span className="text-[11px] text-fg-muted">Where is the evidence? (document reference, ticket or date)</span>
                      <input aria-label={`Evidence for ${i.title}`} className={inputCls + " mt-1"} value={notes[i.key] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [i.key]: e.target.value }))} /></label>
                    <ActionButton small label="Confirm" color={COLOR} onRun={async () => { const r = await call(`/go-live/${i.key}/confirm`, { method: "POST", body: { note: notes[i.key] ?? "" } }); if ("error" in r) return { error: r.error }; setNotes((n) => ({ ...n, [i.key]: "" })); reloadGate(); return { message: "Confirmed." }; }} />
                  </div>)}
              </li>))}</ul>
          </>)}</Status>
      </section>

      <section aria-label="System health" className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-black text-fg">System health and alerts</h2>
          <ActionButton small label="Check now" color={COLOR} onRun={async () => { const r = await call("/check", { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; reloadHealth(); return { message: "Checked." }; }} />
        </div>
        <Status load={health}>{(h) => (
          <>
            <p role="status" className="text-sm font-semibold" style={{ color: h.ok ? "#047857" : "#B91C1C" }}>{h.ok ? "Records and ledger agree." : "There are problems to look at."} <span className="font-normal text-fg-muted">Checked {when(h.checkedAt)}.</span></p>
            <p className="text-xs text-fg-muted">{h.destinations.length ? `Alerts are sent to: ${h.destinations.join(", ")}.` : "No alert destination is set up: alerts are only written to the server log. Set ALERT_WEBHOOK_URL or ALERT_EMAIL_TO."}</p>
            {h.issues.length === 0 ? <Empty>Nothing needs attention.</Empty> : (
              <ul className="space-y-2">{h.issues.map((i) => (
                <li key={i.code} className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: i.severity === "problem" ? "#B91C1C" : "#B45309" }} />
                  <span className="text-fg"><b>{i.severity === "problem" ? "Problem" : "Needs attention"}</b> ({i.count}): {i.message}</span>
                </li>))}</ul>)}
          </>)}</Status>
      </section>

      <section aria-label="Settlement" className="space-y-3">
        <h2 className="text-base font-black text-fg">Sponsor bank settlement</h2>
        <p className="text-xs text-fg-muted">Import the bank's settlement file. Each line is matched to the card purchases VINK approved. Columns: authorisation_id, type (purchase or refund), amount, currency, settled_on (YYYY-MM-DD), reference.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-[11px] text-fg-muted">Provider</span><input aria-label="Provider" className={inputCls + " mt-1 !w-40"} value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">File (CSV)</span>
            <input aria-label="Settlement file" type="file" accept=".csv,text/csv" className="mt-1 text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFilename(f.name); setCsv(await f.text()); } }} /></label>
        </div>
        <label className="block"><span className="text-[11px] text-fg-muted">Or paste the file</span>
          <textarea aria-label="Settlement lines" rows={4} className={inputCls + " mt-1 font-mono text-xs"} value={csv} onChange={(e) => { setCsv(e.target.value); if (!filename) setFilename("pasted.csv"); }} /></label>
        <ActionButton label="Import settlement file" color={COLOR} onRun={async () => {
          const r = await call<{ lines: number; matched: number; duplicates: number; exceptions: number }>("/settlement/import", { method: "POST", body: { provider: provider.trim(), filename: filename || "pasted.csv", csv } });
          if ("error" in r) return { error: r.error };
          setCsv(""); setFilename(""); reloadFiles(); reloadExceptions(); reloadHealth();
          return { message: `${r.data.lines} lines: ${r.data.matched} matched, ${r.data.duplicates} repeated, ${r.data.exceptions} to look at.` };
        }} />
        <Status load={exceptions}>{({ exceptions: list }) => list.length === 0 ? <Empty>No settlement lines need a person.</Empty> : (
          <ul className="space-y-2">{list.map((x) => (
            <li key={x.id} className="rounded-lg p-3 text-sm" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
              <p className="text-fg"><b>{RESULT_TEXT[x.result] ?? x.result}</b> · {x.type} {money(x.amountCents, x.currency)} · {x.authorisationId} · settled {x.settledOn}{x.reference ? ` · ref ${x.reference}` : ""}</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="block flex-1 min-w-[14rem]"><span className="text-[11px] text-fg-muted">What was done about it?</span>
                  <input aria-label={`Note for ${x.authorisationId}`} className={inputCls + " mt-1"} value={resolveNotes[x.id] ?? ""} onChange={(e) => setResolveNotes((n) => ({ ...n, [x.id]: e.target.value }))} /></label>
                <ActionButton small label="Close" color="#64748B" onRun={async () => { const r = await call(`/settlement/exceptions/${x.id}/resolve`, { method: "POST", body: { note: resolveNotes[x.id] ?? "" } }); if ("error" in r) return { error: r.error }; reloadExceptions(); reloadHealth(); }} />
              </div>
            </li>))}</ul>)}</Status>
        <Status load={files}>{({ files: list }) => list.length === 0 ? null : (
          <div>
            <p className="text-xs font-semibold text-fg mb-1">Files imported</p>
            <ul className="text-xs text-fg-muted space-y-1">{list.map((f) => <li key={f.id}>{f.filename} ({f.provider}) · {f.lines} lines · {f.matched} matched · {f.exceptions} to look at · {when(f.importedAt)}</li>)}</ul>
          </div>)}</Status>
      </section>
    </div>
  );
}
