import { useState } from "react";
import type { IdentityStaff, IdentityStage } from "../services/identityStaff";

/**
 * Confirming that a real person is applying, as a reviewer sees it on an application. The identity documents are held by Sumsub, not by VINK. When this kind of application REQUIRES a
 * confirmed identity, approval is refused until Sumsub has confirmed it; an owner or Super Administrator can allow approval anyway with a written reason, which is kept with their name.
 * The two actions return an error message, or null when they worked.
 */
const STAGE: Record<IdentityStage, { color: string; bg: string; label: string }> = {
  not_started: { color: "var(--vk-fg-muted)", bg: "var(--vk-surface-2)", label: "Not started" }, in_progress: { color: "var(--vk-fg-muted)", bg: "var(--vk-surface-2)", label: "Started, not finished" },
  pending: { color: "var(--vk-fg-muted)", bg: "var(--vk-surface-2)", label: "Being checked" }, on_hold: { color: "var(--vk-warn)", bg: "var(--vk-warn-bg)", label: "On hold at Sumsub" },
  approved: { color: "var(--vk-ok)", bg: "var(--vk-ok-bg)", label: "Confirmed" }, retry: { color: "var(--vk-warn)", bg: "var(--vk-warn-bg)", label: "Not confirmed: may try again" },
  rejected: { color: "var(--vk-bad)", bg: "var(--vk-bad-bg)", label: "Not confirmed: final" },
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—");
/** The same stages in words about a BUSINESS (verified, not confirmed). */
const STAGE_BUSINESS: Partial<Record<IdentityStage, { label: string }>> = { approved: { label: "Verified" }, retry: { label: "Not verified: may try again" }, rejected: { label: "Not verified: final" } };
const Label = ({ children }: { children: React.ReactNode }) => <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">{children}</p>;

/** `business`: the panel is for the BUSINESS behind the application (KYB) rather than the person applying: its words change, its actions are the same. */
export function AdminIdentityPanel({ identity: i, canOverride, business = false, onRefresh, onOverride }: { identity: IdentityStaff; canOverride: boolean; business?: boolean; onRefresh: () => Promise<string | null>; onOverride: (reason: string) => Promise<string | null> }) {
  const [busy, setBusy] = useState<"" | "refresh" | "override">(""), [error, setError] = useState(""), [reason, setReason] = useState("");
  const run = async (what: "refresh" | "override", fn: () => Promise<string | null>) => { setBusy(what); setError(""); const e = await fn(); setBusy(""); if (e) setError(e); else if (what === "override") setReason(""); };
  const st = { ...STAGE[i.status], ...(business ? STAGE_BUSINESS[i.status] : {}) };
  const noun = business ? "business" : "identity", done = business ? "verified" : "confirmed";
  const blocked = i.requirement === "required" && !i.confirmed && !i.override;
  return (
    <div className="rounded-xl border border-line p-4 space-y-3" aria-label={business ? "Business verification" : "Identity check"}>
      <div className="flex flex-wrap items-center justify-between gap-2"><Label>{business ? "Business verification (Sumsub KYB)" : "Identity check (Sumsub)"}</Label>
        {!i.enabled && i.status === "not_started" ? null : <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: st.color, background: st.bg }}>{st.label}</span>}</div>
      {!i.enabled && i.status === "not_started" ? <p className="text-sm text-fg-muted">Identity checks are not switched on.</p> : <>
        <p className="text-xs text-fg-muted">{business ? "Done by Sumsub: the company documents and the details of its directors and owners are held by Sumsub, not by VINK." : "Done by Sumsub: the ID document and selfie are held by Sumsub, not by VINK."}</p>
        {i.requirement === "required" && <p className="text-sm font-semibold text-fg">{i.confirmed ? `Required, and ${done}.` : i.override ? "Required, but approval was allowed without it (below)." : `Required: this application cannot be approved until the ${noun} is ${done}.`}</p>}
        {i.requirement === "recommended" && <p className="text-sm text-fg-muted">Recommended. Approval is not blocked.</p>}
        {i.status !== "not_started" && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-fg-subtle">Sumsub's answer</p><p className="font-semibold text-fg">{i.reviewAnswer === "GREEN" ? "Passed" : i.reviewAnswer === "RED" ? "Not passed" : "No answer yet"}</p></div>
            <div><p className="text-xs text-fg-subtle">Another try</p><p className="font-semibold text-fg">{i.reviewAnswer !== "RED" ? "Not applicable" : i.rejectType === "RETRY" ? "Yes, they may try again" : "No, this is final"}</p></div>
            <div><p className="text-xs text-fg-subtle">Times submitted</p><p className="font-semibold text-fg">{i.attempts}</p></div>
            <div><p className="text-xs text-fg-subtle">Agreed to the check</p><p className="font-semibold text-fg">{when(i.consentAt)}</p></div>
          </div>)}
        {i.rejectLabels.length > 0 && <div><p className="text-xs text-fg-subtle">Sumsub's reasons (the applicant does not see these)</p><ul className="mt-1 flex flex-wrap gap-1.5">{i.rejectLabels.map((l) => <li key={l} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg">{l}</li>)}</ul></div>}
        {i.moderationComment && <div><p className="text-xs text-fg-subtle">Sumsub's note for staff</p><p className="whitespace-pre-wrap text-sm text-fg">{i.moderationComment}</p></div>}
        {i.override && <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-fg"><strong>{business ? "Approval allowed without a verified business" : "Approval allowed without a confirmed identity"}</strong> by {i.override.by} on {when(i.override.at)}: “{i.override.reason}”</p>}
        {i.applicantId && <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy !== ""} onClick={() => void run("refresh", onRefresh)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg disabled:opacity-50">{busy === "refresh" ? "Asking Sumsub…" : "Refresh from Sumsub"}</button>
          {i.caseUrl && <a href={i.caseUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-fg underline">Open the full case in Sumsub</a>}
        </div>}
        {canOverride && blocked && (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <Label>{business ? "Allow approval without a verified business" : "Allow approval without a confirmed identity"}</Label>
            <p className="text-xs text-fg-muted">{business ? "Only if you have verified the business another way (for example a registry search)." : "Only if you have confirmed who the applicant is another way."} Your name and this reason are kept on record.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} aria-label={business ? "Why approval may go ahead without a verified business" : "Why approval may go ahead without a confirmed identity"} placeholder="Why (at least 10 characters)…" className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none" />
            <button type="button" disabled={busy !== "" || reason.trim().length < 10} onClick={() => void run("override", () => onOverride(reason.trim()))} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" style={{ background: "var(--vk-bad)" }}>{busy === "override" ? "Saving…" : "Allow approval anyway"}</button>
          </div>)}
        {error && <p className="text-sm font-semibold" role="alert" style={{ color: "var(--vk-bad)" }}>{error}</p>}
      </>}
    </div>
  );
}
