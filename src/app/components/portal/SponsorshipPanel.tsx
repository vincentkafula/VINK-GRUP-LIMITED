import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquareReply, Search } from "lucide-react";
import { useLoad, Status, ActionButton, Empty, inputCls, rand, day } from "./ui";
import { call, getData, send, fetchFile, type Me, type Row, type Summary, type Budget, type Weights } from "./sponsorshipApi";
import { SponsorshipDetail } from "./SponsorshipDetail";
import { Pill, toneOf } from "./sponsorshipUi";
import { STATUS_LABELS, CATEGORIES, REVIEW_CRITERIA, MAX_WEIGHT, DEFAULT_WEIGHTS, SCORE_MAX, weightedScore, type StatusId, type CriterionId } from "../../data/sponsorship";

/**
 * Sponsorships, for the people who work on them: the applications and where each stands, who is looking after it, how it scored, what was decided and awarded, what has
 * been paid, and the reports. Allowed: Super Administrators and people approved for the "Sponsorships and Partnerships" section (the server decides; this only hides what
 * a person cannot use). Money is for finance staff and Super Administrators; the settings are for Super Administrators.
 */
const COLOR = "#C8102E";
type View = "applications" | "reports" | "budget" | "settings";
const money = (n: number | null) => (n === null ? "No rand figure" : rand(n));

export function SponsorshipPanel() {
  const [me] = useLoad<Me>(() => getData<Me>("/me"));
  const [view, setView] = useState<View>("applications");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-fg">Sponsorships</h1>
        <p className="text-fg-muted text-sm max-w-3xl">Applications for sponsorship, from the first look to the final report. Scores help people decide; they never approve or decline anything.</p>
      </div>
      <Status load={me}>{(m) => (
        <>
          {(() => {
            // Each person is shown only what they can use: reviewers the applications and reports, finance staff the budget, Super Administrators the settings.
            const tabs = ([["applications", "Applications", m.canReview], ["reports", "Reports", m.canReview], ["budget", "Budget", m.isFinance], ["settings", "Settings", m.isSuper]] as const).filter(([, , show]) => show);
            const current: View | undefined = tabs.some(([id]) => id === view) ? view : tabs[0]?.[0];
            if (!current) return <Empty>You are not approved to work on sponsorships.</Empty>;
            return (
              <>
                {!open && (
                  <div role="tablist" aria-label="Sponsorship sections" className="flex flex-wrap gap-2">
                    {tabs.map(([id, label]) => (
                      <button key={id} role="tab" aria-selected={current === id} type="button" onClick={() => setView(id)} className="bg-surface rounded-lg px-3 py-1.5 text-sm font-bold border border-line" style={current === id ? { background: "var(--vkd-fg)", color: "var(--vk-surface)", borderColor: "var(--vkd-fg)" } : { background: "var(--vk-surface)", color: "var(--vk-fg)" }}>{label}</button>))}
                  </div>)}
                {open ? <SponsorshipDetail refNo={open} me={m} onBack={() => setOpen(null)} />
                  : current === "applications" ? <Applications me={m} onOpen={setOpen} />
                  : current === "reports" ? <Reports />
                  : current === "budget" ? <BudgetView />
                  : <SettingsView me={m} />}
              </>
            );
          })()}
        </>)}
      </Status>
    </div>
  );
}

// ── the list ────────────────────────────────────────────────────────────────
const PAGE = 25;
function Applications({ me, onOpen }: { me: Me; onOpen: (ref: string) => void }) {
  const [status, setStatus] = useState(""), [assigned, setAssigned] = useState(""), [q, setQ] = useState(""), [typed, setTyped] = useState(""), [page, setPage] = useState(0);
  useEffect(() => { const t = setTimeout(() => { setQ(typed); setPage(0); }, 300); return () => clearTimeout(t); }, [typed]);
  const [load] = useLoad<{ total: number; applications: Row[] }>(() => call(`/?${new URLSearchParams({ ...(status && { status }), ...(assigned && { assigned }), ...(q && { q }), limit: String(PAGE), offset: String(page * PAGE) })}`), [status, assigned, q, page]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[1fr_200px_200px]">
        <label className="relative block"><span className="sr-only">Search applications</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-fg-subtle" aria-hidden="true" />
          <input className={`${inputCls} pl-9`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by reference, organisation, project or email" /></label>
        <label><span className="sr-only">Status</span><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Every status</option>{(Object.keys(STATUS_LABELS) as StatusId[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
        <label><span className="sr-only">Looked after by</span><select className={inputCls} value={assigned} onChange={(e) => { setAssigned(e.target.value); setPage(0); }}><option value="">Anyone</option><option value="me">Assigned to me ({me.name})</option><option value="none">Not assigned</option></select></label>
      </div>
      <Status load={load}>{({ total, applications }) => applications.length === 0 ? <Empty>No applications match.</Empty> : (
        <>
          <ul className="space-y-2" aria-label="Applications">{applications.map((a) => (
            <li key={a.ref}>
              <button type="button" onClick={() => onOpen(a.ref)} className="w-full rounded-xl border border-line bg-surface p-3 text-left hover:border-[var(--vk-brand)] focus-visible:outline focus-visible:outline-2">
                <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-fg-muted">{a.ref}</span><Pill tone={toneOf(a.status)}>{a.statusLabel}</Pill>
                  {a.replied && <Pill tone="warn"><MessageSquareReply className="mr-1 h-3 w-3" aria-hidden="true" />Replied</Pill>}</span>
                <span className="mt-1 block font-bold text-fg">{a.projectTitle}</span>
                <span className="block text-sm text-fg-muted">{a.organisation} · {CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category} · {a.province ?? a.country}</span>
                <span className="mt-1 flex flex-wrap gap-x-4 text-xs text-fg-muted"><span>{a.currency} {a.amountRequested.toLocaleString("en-ZA")}{a.currency !== "ZAR" && ` (${money(a.amountZar)})`}</span><span>Sent {day(a.createdAt)}</span><span>{a.assignedName ? `Looked after by ${a.assignedName}` : "Not assigned"}</span></span>
              </button>
            </li>))}</ul>
          <div className="flex items-center justify-between text-sm text-fg-muted">
            <span>{page * PAGE + 1}–{page * PAGE + applications.length} of {total}</span>
            <span className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button>
              <button type="button" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-bold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </span>
          </div>
        </>)}</Status>
    </div>
  );
}

// ── reports ─────────────────────────────────────────────────────────────────
function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</p><p className="text-xl font-black text-fg">{value}</p>{note && <p className="text-[11px] text-fg-muted">{note}</p>}</div>;
}
function Table({ title, rows, unit }: { title: string; rows: { id: string; label: string; count: number; requestedZar?: number; awardedZar?: number }[]; unit?: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4"><h3 className="mb-2 text-sm font-black text-fg">{title}</h3>
      {rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase text-fg-subtle"><th className="py-1 font-bold">{title.replace(/^By /, "")}</th><th className="py-1 text-right font-bold">Applications</th>{unit && <><th className="py-1 text-right font-bold">Requested</th><th className="py-1 text-right font-bold">Awarded</th></>}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5 text-fg">{r.label}</td><td className="py-1.5 text-right text-fg">{r.count}</td>{unit && <><td className="py-1.5 text-right text-fg-muted">{rand(r.requestedZar ?? 0)}</td><td className="py-1.5 text-right text-fg-muted">{rand(r.awardedZar ?? 0)}</td></>}</tr>)}</tbody></table>)}
    </section>
  );
}
function Reports() {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
  const [load] = useLoad<Summary>(() => getData<Summary>(`/reports/summary${qs ? `?${qs}` : ""}`), [from, to]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-xs font-bold text-fg">From</span><input type="date" aria-label="From" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block"><span className="text-xs font-bold text-fg">To</span><input type="date" aria-label="To" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <ActionButton label="Download spreadsheet" color="var(--vk-surface)" className="bg-surface !text-fg border border-line" onRun={async () => { const r = await fetchFile(`/reports/export.csv${qs ? `?${qs}` : ""}`, { save: "sponsorship-applications.csv" }); if (r) return { error: r.error }; return { message: "Downloaded." }; }} />
      </div>
      <Status load={load}>{(s) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Applications" value={s.total} /><Stat label="Requested" value={rand(s.totals.requestedZar)} note={s.totals.notConverted ? `${s.totals.notConverted} could not be converted to rand` : undefined} />
            <Stat label="Awarded" value={rand(s.totals.awardedZar)} /><Stat label="Paid out" value={rand(s.totals.disbursedZar)} />
          </div>
          <p className="text-sm text-fg-muted">{s.scores.reviewed ? `${s.scores.reviewed} application${s.scores.reviewed === 1 ? " has" : "s have"} been scored, averaging ${s.scores.average}%.` : "No application has been scored yet."}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="By status" rows={s.byStatus} /><Table title="By category" rows={s.byCategory} unit /><Table title="By place" rows={s.byLocation} unit /><Table title="By month" rows={s.byMonth} unit />
          </div>
        </>)}</Status>
    </div>
  );
}

// ── the budget ──────────────────────────────────────────────────────────────
function BudgetView() {
  const [load] = useLoad<Budget>(() => getData<Budget>("/budget"));
  return (
    <Status load={load}>{(b) => (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Asked for" value={rand(b.totals.requestedZar)} note="every application" /><Stat label="Approved" value={rand(b.totals.approvedZar)} note={`${b.totals.awards} award${b.totals.awards === 1 ? "" : "s"}`} />
          <Stat label="Committed" value={rand(b.totals.committedZar)} note="agreement signed" /><Stat label="Paid out" value={rand(b.totals.paidZar)} />
        </div>
        {b.totals.notConverted > 0 && <p className="text-sm text-fg-muted">{b.totals.notConverted} amount{b.totals.notConverted === 1 ? "" : "s"} could not be converted to rand and {b.totals.notConverted === 1 ? "is" : "are"} left out of these totals.</p>}
        {b.awards.length === 0 ? <Empty>No awards yet.</Empty> : (
          <ul className="space-y-2" aria-label="Awards">{b.awards.map((a) => (
            <li key={a.ref} className="rounded-xl border border-line bg-surface p-3">
              <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-fg-muted">{a.ref}</span><Pill tone={a.stage === "completed" ? "ok" : a.stage === "active" ? "plain" : "warn"}>{a.stageLabel}</Pill>{a.overdue > 0 && <Pill tone="bad">{a.overdue} milestone{a.overdue === 1 ? "" : "s"} overdue</Pill>}</p>
              <p className="font-bold text-fg">{a.project}</p><p className="text-sm text-fg-muted">{a.organisation} · {a.category}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-fg-muted"><span>Awarded {a.currency} {a.awarded.toLocaleString("en-ZA")}</span><span>Paid {a.currency} {a.paid.toLocaleString("en-ZA")}</span><span>Left {a.currency} {a.remaining.toLocaleString("en-ZA")}</span><span>Milestones {a.milestonesDone}/{a.milestonesTotal}</span></p>
            </li>))}</ul>)}
      </div>)}</Status>
  );
}

// ── settings ────────────────────────────────────────────────────────────────
function SettingsView({ me }: { me: Me }) {
  const [load, reload] = useLoad<Weights>(() => getData<Weights>("/settings"));
  const [w, setW] = useState<Record<CriterionId, number>>(me.settings.weights);
  const [limit, setLimit] = useState(me.settings.approvalLimitZar === null ? "" : String(me.settings.approvalLimitZar));
  useEffect(() => { if (load.state === "ready") { setW(load.data.weights); setLimit(load.data.approvalLimitZar === null ? "" : String(load.data.approvalLimitZar)); } }, [load]);
  const example = weightedScore(Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.id, SCORE_MAX])), w);
  return (
    <form className="max-w-2xl space-y-5 rounded-xl border border-line bg-surface p-4" onSubmit={(e) => e.preventDefault()} aria-label="Sponsorship settings">
      <section>
        <h2 className="text-base font-black text-fg">How much each thing counts</h2>
        <p className="mb-3 text-sm text-fg-muted">A reviewer scores each criterion from 0 to {SCORE_MAX}. A weight says how much it counts toward the total (0 counts for nothing, {MAX_WEIGHT} for the most). Until you change them every criterion counts the same.</p>
        <div className="grid gap-3 sm:grid-cols-2">{REVIEW_CRITERIA.map((c) => (
          <label key={c.id} className="block"><span className="text-xs font-bold text-fg">{c.label}</span>
            <input type="number" min={0} max={MAX_WEIGHT} step={0.5} className={inputCls} aria-label={`Weight for ${c.label}`} value={w[c.id]} onChange={(e) => setW({ ...w, [c.id]: Number(e.target.value) })} /></label>))}</div>
        <p className="mt-2 text-xs text-fg-muted">{example === null ? "Give at least one criterion a weight above 0." : "A perfect score on everything is always 100%."} <button type="button" className="underline" onClick={() => setW({ ...DEFAULT_WEIGHTS })}>Count them all equally</button></p>
      </section>
      <section>
        <h2 className="text-base font-black text-fg">Approval limit</h2>
        <p className="mb-2 text-sm text-fg-muted">Above this amount in rand, only a Super Administrator can approve an application or make an award. Leave it empty for no limit.</p>
        <label className="block max-w-xs"><span className="text-xs font-bold text-fg">Limit (R)</span><input inputMode="decimal" className={inputCls} aria-label="Approval limit" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" /></label>
      </section>
      <ActionButton label="Save settings" color={COLOR} onRun={async () => {
        const n = limit.trim() === "" ? null : Number(limit.replace(/[\s,]/g, ""));
        const r = await send("PUT", "/settings", { weights: w, approvalLimitZar: n }); if ("error" in r) return { error: r.error };
        reload(); return { message: "Saved." };
      }} />
    </form>
  );
}
