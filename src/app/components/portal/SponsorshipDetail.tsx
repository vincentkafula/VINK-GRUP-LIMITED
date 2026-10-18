import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { useLoad, Status, ActionButton, Empty, Field, inputCls, rand, when, day } from "./ui";
import { call, getData, send, fetchFile, type Me, type Detail, type Doc, type Award, type Report } from "./sponsorshipApi";
import { Pill, toneOf } from "./sponsorshipUi";
import { STATUS_LABELS, ORG_TYPES, CATEGORIES, BENEFITS, REVIEW_CRITERIA, SCORE_MAX, PAYMENT_KINDS, weightedScore, type StatusId, type CriterionId } from "../../data/sponsorship";

/** One application, for the people who work on it. Everything here changes things only when a person presses a button and gives a reason where one is needed. */
const COLOR = "#C8102E";
type Tab = "overview" | "review" | "decision" | "award" | "followup";
const labelOf = <T extends { id: string; label: string }>(l: readonly T[], id: string) => l.find((x) => x.id === id)?.label ?? id;
const cur = (n: number, c: string) => `${c} ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const todayIso = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

function Box({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return <section className="rounded-xl border border-line bg-surface p-4"><h3 className="text-sm font-black text-fg">{title}</h3>{note && <p className="mb-2 text-xs text-fg-muted">{note}</p>}<div className="mt-2">{children}</div></section>;
}
const TextArea = ({ label, value, onChange, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) => (
  <label className="block"><span className="text-xs font-bold text-fg">{label}</span><textarea aria-label={label} rows={rows} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />{hint && <span className="text-[11px] text-fg-muted">{hint}</span>}</label>
);

export function SponsorshipDetail({ refNo, me, onBack }: { refNo: string; me: Me; onBack: () => void }) {
  const [load, reload] = useLoad<Detail>(() => getData<Detail>(`/${refNo}`), [refNo]);
  const [tab, setTab] = useState<Tab>("overview");
  const act = (fn: () => Promise<{ error: string } | { data: unknown }>, message: string) => async () => { const r = await fn(); if ("error" in r) return { error: r.error }; reload(); return { message }; };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-fg-muted hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All applications</button>
      <Status load={load}>{(d) => (
        <>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-fg-muted">{d.ref}</span><Pill tone={toneOf(d.status)}>{d.statusLabel}</Pill>{d.award && <Pill tone={d.award.stage === "completed" ? "ok" : "plain"}>Award: {d.award.stageLabel}</Pill>}{d.replied && <Pill tone="warn">The applicant has replied</Pill>}{!d.delivered && <Pill tone="bad">Team email not sent</Pill>}</p>
            <h2 className="text-xl font-black text-fg">{d.projectTitle}</h2>
            <p className="text-sm text-fg-muted">{d.organisation} · {cur(d.amountRequested, d.currency)}{d.currency !== "ZAR" && (d.amountZar === null ? " (no rand figure)" : ` (${rand(d.amountZar)})`)} · sent {when(d.createdAt)}</p>
          </div>
          <div role="tablist" aria-label="Application sections" className="flex flex-wrap gap-2">
            {([["overview", "Overview"], ["review", "Review"], ["decision", "Decision"], ["award", "Award"], ["followup", `Follow-up${d.replies.length + d.reports.length ? ` (${d.replies.length + d.reports.length})` : ""}`]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className="bg-surface rounded-lg px-3 py-1.5 text-sm font-bold border border-line" style={tab === id ? { background: "var(--vkd-fg)", color: "var(--vk-surface)", borderColor: "var(--vkd-fg)" } : { background: "var(--vk-surface)", color: "var(--vk-fg)" }}>{label}</button>))}
          </div>
          {tab === "overview" && <Overview d={d} />}
          {tab === "review" && <Review d={d} me={me} act={act} />}
          {tab === "decision" && <Decision d={d} act={act} />}
          {tab === "award" && <AwardTab d={d} me={me} act={act} />}
          {tab === "followup" && <FollowUp d={d} act={act} />}
        </>)}</Status>
    </div>
  );
}
type Act = (fn: () => Promise<{ error: string } | { data: unknown }>, message: string) => () => Promise<{ error?: string; message?: string }>;

// ── overview ────────────────────────────────────────────────────────────────
function DocList({ docs, refNo }: { docs: Doc[]; refNo: string }) {
  if (docs.length === 0) return <Empty>No files.</Empty>;
  return <ul className="space-y-1.5">{docs.map((x) => (
    <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
      <FileText className="h-4 w-4 text-fg-muted" aria-hidden="true" /><span className="font-medium text-fg">{x.filename}</span><span className="text-xs text-fg-muted">{kb(x.sizeBytes)}</span>
      {x.scanStatus !== "clean" && <Pill tone="warn">Not scanned for viruses</Pill>}
      <ActionButton small label="Download" color="var(--vk-surface-2)" className="bg-surface-2 !text-fg border border-line" onRun={async () => { const r = await fetchFile(`/${refNo}/documents/${x.id}`, { save: x.filename }); if (r) return { error: r.error }; }} />
    </li>))}</ul>;
}
function Overview({ d }: { d: Detail }) {
  const a = d.details as Record<string, string | number | undefined>;
  const long: [string, string | undefined][] = [["Executive summary", a.executiveSummary as string], ["Background and objectives", a.background as string], ["Problem being addressed", a.problem as string], ["Target audience", a.targetAudience as string], ["Implementation plan", a.implementationPlan as string], ["Expected outcomes", a.outcomes as string], ["Why VINK", a.whyVink as string], ["How it aligns with VINK", a.alignment as string], ["Financial controls", a.financialControls as string], ["Value of the partnership", a.benefitsValue as string]];
  const original = d.documents.filter((x) => !x.sourceId);
  return (
    <div className="space-y-4">
      {d.screening.length > 0 && <Box title="For review" note="Notes from the automatic check against VINK's published criteria. The applicant does not see these.">
        <ul className="space-y-1.5">{d.screening.map((s, i) => <li key={i} className="flex gap-2 text-sm text-fg"><Pill tone={s.level === "review" ? "warn" : "plain"}>{s.level === "review" ? "Check" : "Note"}</Pill><span>{s.note}</span></li>)}</ul></Box>}
      <Box title="The applicant"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Applicant" value={d.applicantName} /><Field label="Organisation" value={`${d.organisation} (${labelOf(ORG_TYPES, d.orgType)})`} /><Field label="Contact" value={String(a.contactPerson ?? "")} />
        <Field label="Email" value={<a className="underline" href={`mailto:${d.email}`}>{d.email}</a>} /><Field label="Telephone" value={String(a.phone ?? "")} /><Field label="Registration number" value={String(a.registrationNumber ?? "")} />
        <Field label="Address" value={String(a.physicalAddress ?? "")} /><Field label="Where" value={[a.city, a.province, a.country].filter(Boolean).join(", ")} /><Field label="Website" value={String(a.website ?? "")} />
      </div></Box>
      <Box title="The project"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Category" value={labelOf(CATEGORIES, d.category)} /><Field label="Dates" value={`${a.startDate} to ${a.endDate}`} /><Field label="Beneficiaries" value={Number(a.beneficiaries ?? 0).toLocaleString("en-ZA")} />
        <Field label="Area" value={String(a.geographicArea ?? "")} /><Field label="Offered to VINK" value={(d.details.benefits ?? []).map((b) => labelOf(BENEFITS, b)).join(", ")} /><Field label="Consent given" value={when(d.consentAt)} />
      </div></Box>
      <Box title="The money"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Asking for" value={cur(d.amountRequested, d.currency)} /><Field label="Total budget" value={cur(Number(a.totalBudget ?? 0), d.currency)} /><Field label="Own contribution" value={cur(Number(a.ownContribution ?? 0), d.currency)} /><Field label="Other sponsors" value={cur(Number(a.otherSponsorsAmount ?? 0), d.currency)} />
      </div>
        <ul className="mt-3 space-y-1 text-sm text-fg">{(d.details.expenditure ?? []).map((e, i) => <li key={i} className="flex justify-between gap-4 border-t border-line pt-1"><span>{e.description}</span><span className="text-fg-muted">{cur(e.amount, d.currency)}</span></li>)}</ul></Box>
      <Box title="What they wrote">{long.filter(([, v]) => v).map(([k, v]) => <details key={k} className="border-t border-line py-1.5 first:border-0"><summary className="cursor-pointer text-sm font-bold text-fg">{k}</summary><p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{v}</p></details>)}</Box>
      <Box title="Documents sent with the application"><DocList docs={original} refNo={d.ref} /></Box>
    </div>
  );
}

// ── review ──────────────────────────────────────────────────────────────────
function Review({ d, me, act }: { d: Detail; me: Me; act: Act }) {
  const mine = d.review.reviewers.find((r) => r.reviewerId === me.userId);
  const [scores, setScores] = useState<Record<string, number>>(() => ({ ...(mine?.scores ?? {}) }));
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [staff] = useLoad<{ staff: { id: string; name: string; role: string }[] }>(() => call("/staff"));
  const [who, setWho] = useState(d.assignedTo ?? "");
  const total = weightedScore(scores, d.review.weights);
  const complete = REVIEW_CRITERIA.every((c) => typeof scores[c.id] === "number");
  return (
    <div className="space-y-4">
      <Box title="Looked after by">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-xs font-bold text-fg">Assign to</span>
            <select aria-label="Assign to" className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Nobody</option>{staff.state === "ready" && staff.data.staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <ActionButton label="Save" color={COLOR} onRun={act(() => send("POST", `/${d.ref}/assign`, { userId: who || null }), "Saved.")} />
        </div>
      </Box>
      <Box title="Your scores" note={`Score each from 0 to ${SCORE_MAX}. Scores help people decide. They never approve or decline an application.`}>
        <div className="grid gap-3 sm:grid-cols-2">{REVIEW_CRITERIA.map((c) => (
          <label key={c.id} className="block"><span className="text-xs font-bold text-fg">{c.label} <span className="font-normal text-fg-muted">(counts {d.review.weights[c.id as CriterionId]})</span></span>
            <select aria-label={c.label} className={inputCls} value={scores[c.id] ?? ""} onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })}><option value="" disabled>Choose…</option>{Array.from({ length: SCORE_MAX + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>))}</div>
        <div className="mt-3"><TextArea label="Comment" value={comment} onChange={setComment} /></div>
        <p className="mt-2 text-sm text-fg">{complete && total !== null ? <>Your total: <strong>{total}%</strong></> : "Score every criterion to see your total."}</p>
        <div className="mt-2">{complete ? <ActionButton label={mine ? "Replace my scores" : "Save my scores"} color={COLOR} onRun={act(() => send("PUT", `/${d.ref}/score`, { scores, comment }), "Saved.")} /> : null}</div>
      </Box>
      <Box title="Everyone's scores">
        {d.review.reviewers.length === 0 ? <Empty>Nobody has scored this application yet.</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-[11px] uppercase text-fg-subtle"><th className="py-1 font-bold">Reviewer</th>{REVIEW_CRITERIA.map((c) => <th key={c.id} className="py-1 text-center font-bold" title={c.label}>{c.label.split(" ")[0]}</th>)}<th className="py-1 text-right font-bold">Total</th></tr></thead>
              <tbody>{d.review.reviewers.map((r) => <tr key={r.reviewerId} className="border-t border-line align-top"><td className="py-1.5 text-fg">{r.reviewerName}{r.comment && <span className="block text-xs text-fg-muted">{r.comment}</span>}</td>{REVIEW_CRITERIA.map((c) => <td key={c.id} className="py-1.5 text-center text-fg">{r.scores[c.id]}</td>)}<td className="py-1.5 text-right font-bold text-fg">{r.total}%</td></tr>)}</tbody></table></div>
            <p className="mt-2 text-sm text-fg">Average of {d.review.reviewers.length} reviewer{d.review.reviewers.length === 1 ? "" : "s"}: <strong>{d.review.average}%</strong></p>
          </>)}
      </Box>
    </div>
  );
}

// ── decision ────────────────────────────────────────────────────────────────
function Decision({ d, act }: { d: Detail; act: Act }) {
  const [to, setTo] = useState<string>(d.nextStatuses[0] ?? "");
  const [reason, setReason] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { setTo(d.nextStatuses[0] ?? ""); }, [d.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = to === "approved" && !d.mayApprove;
  return (
    <div className="space-y-4">
      <Box title="Where it stands">
        <p className="flex flex-wrap items-center gap-2"><Pill tone={toneOf(d.status)}>{d.statusLabel}</Pill>{d.statusMessage && <span className="text-sm text-fg-muted">Told to the applicant: &ldquo;{d.statusMessage}&rdquo;</span>}</p>
      </Box>
      <Box title="Move it on" note="Every change needs a reason. It is kept in the history and the applicant never sees it. The message to the applicant is optional, except when you ask for more information.">
        {d.nextStatuses.length === 0 ? <Empty>There is nothing further to do from here.</Empty> : (
          <form className="space-y-3 max-w-2xl" onSubmit={(e) => e.preventDefault()} aria-label="Change status">
            <label className="block"><span className="text-xs font-bold text-fg">Move to</span><select aria-label="Move to" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>{d.nextStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s as StatusId]}</option>)}</select></label>
            <TextArea label="Reason (kept in the history)" value={reason} onChange={setReason} rows={2} />
            <TextArea label={to === "more_information_required" ? "What do you need from the applicant? (they will see this)" : "Message to the applicant (optional)"} value={msg} onChange={setMsg} />
            {blocked ? <p role="alert" className="text-sm text-bad">This amount is above the approval limit. Only a Super Administrator can approve it.</p>
              : <ActionButton label={`Move to “${STATUS_LABELS[to as StatusId] ?? to}”`} color={COLOR} onRun={act(async () => { const r = await send("POST", `/${d.ref}/status`, { status: to, reason, applicantMessage: msg || undefined }); if (!("error" in r)) { setReason(""); setMsg(""); } return r; }, "Done. The applicant has been told.")} />}
          </form>)}
      </Box>
      <Box title="History"><ol className="space-y-2">{[...d.history].reverse().map((h, i) => (
        <li key={i} className="border-t border-line pt-2 first:border-0 first:pt-0 text-sm"><p className="text-fg"><strong>{STATUS_LABELS[h.toStatus as StatusId] ?? h.toStatus}</strong>{h.fromStatus && <span className="text-fg-muted"> from {STATUS_LABELS[h.fromStatus as StatusId] ?? h.fromStatus}</span>} <span className="text-xs text-fg-muted">· {when(h.at)}</span></p>
          <p className="text-xs text-fg-muted">Reason: {h.reason}</p>{h.applicantMessage && <p className="text-xs text-fg-muted">Told to the applicant: {h.applicantMessage}</p>}</li>))}</ol></Box>
    </div>
  );
}

// ── the award ───────────────────────────────────────────────────────────────
function AwardTab({ d, me, act }: { d: Detail; me: Me; act: Act }) {
  const aw = d.award;
  const open = ["approved", "agreement_pending"].includes(d.status);
  const [amount, setAmount] = useState(aw ? String(aw.amount) : String(d.amountRequested)), [cond, setCond] = useState(aw?.conditions ?? "");
  const [note, setNote] = useState(""), [signedOn, setSignedOn] = useState(todayIso());
  useEffect(() => { if (aw) { setAmount(String(aw.amount)); setCond(aw.conditions ?? ""); } }, [aw?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const editable = !aw || !aw.agreementSentAt;
  return (
    <div className="space-y-4">
      {!aw && !open && <Empty>Approve the application before awarding an amount.</Empty>}
      {(aw || open) && (
        <Box title={aw ? `Awarded ${cur(aw.amount, aw.currency)}` : "Make an award"} note={aw ? `${aw.stageLabel}${aw.signedOn ? ` on ${day(aw.signedOn)}` : ""}` : `Never more than the ${cur(d.amountRequested, d.currency)} that was asked for.`}>
          {editable ? (
            <form className="max-w-2xl space-y-3" onSubmit={(e) => e.preventDefault()} aria-label="Award">
              <label className="block max-w-xs"><span className="text-xs font-bold text-fg">Amount awarded ({d.currency})</span><input aria-label="Amount awarded" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <TextArea label="Conditions" value={cond} onChange={setCond} hint="Shown in the award letter and the agreement." />
              <ActionButton label={aw ? "Save the award" : "Make the award"} color={COLOR} onRun={act(() => send("POST", `/${d.ref}/award`, { amount, conditions: cond }), "Saved.")} />
            </form>) : aw.conditions ? <p className="whitespace-pre-wrap text-sm text-fg">{aw.conditions}</p> : <Empty>No conditions.</Empty>}
        </Box>)}
      {aw && (
        <>
          <Box title="Award letter and agreement" note="The agreement is a template. VINK's legal advisers must add and review the legal terms before anyone signs it.">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton small label="Read the award letter" color="var(--vk-surface-2)" className="bg-surface-2 !text-fg border border-line" onRun={async () => { const r = await fetchFile(`/${d.ref}/award/letter.pdf`, { open: true }); if (r) return { error: r.error }; }} />
              <ActionButton small label="Read the agreement" color="var(--vk-surface-2)" className="bg-surface-2 !text-fg border border-line" onRun={async () => { const r = await fetchFile(`/${d.ref}/award/agreement.pdf`, { open: true }); if (r) return { error: r.error }; }} />
            </div>
            {aw.stage === "agreement_pending" && (
              <div className="mt-4 space-y-3 max-w-2xl">
                <p className="text-sm text-fg">{aw.agreementSentAt ? `Sent on ${when(aw.agreementSentAt)}. Waiting for the signed copy.` : "Not sent yet. Sending emails both PDFs to the applicant and moves the application to “Agreement pending”."}</p>
                <TextArea label="Note (kept for staff only)" value={note} onChange={setNote} rows={2} />
                <ActionButton label={aw.agreementSentAt ? "Send them again" : "Send the award letter and agreement"} color={COLOR} onRun={act(() => send("POST", `/${d.ref}/agreement`, { action: "send", note: note || undefined }), "Sent.")} />
                {aw.agreementSentAt && (
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs text-fg-muted">The agreement is signed outside this system. Marking it signed is a record that you were told it was signed. It is not an electronic signature.</p>
                    <label className="mt-2 block max-w-xs"><span className="text-xs font-bold text-fg">Date it was signed</span><input aria-label="Date signed" type="date" max={todayIso()} className={inputCls} value={signedOn} onChange={(e) => setSignedOn(e.target.value)} /></label>
                    <div className="mt-2"><ActionButton label="Mark the agreement signed" color={COLOR} onRun={act(() => send("POST", `/${d.ref}/agreement`, { action: "signed", signedOn, note: note || undefined }), "Marked signed. Payments can now be recorded.")} /></div>
                  </div>)}
              </div>)}
          </Box>
          <Milestones d={d} aw={aw} act={act} />
          <Payments d={d} aw={aw} me={me} act={act} />
        </>)}
    </div>
  );
}
function Milestones({ d, aw, act }: { d: Detail; aw: Award; act: Act }) {
  const [title, setTitle] = useState(""), [due, setDue] = useState("");
  return (
    <Box title="Milestones" note="What has to happen, and by when. Tick one off when it is done.">
      {aw.milestones.length === 0 ? <Empty>No milestones yet.</Empty> : <ul className="space-y-1.5">{aw.milestones.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${m.title} done`} checked={m.status === "done"} onChange={() => act(() => send("POST", `/${d.ref}/milestones/${m.id}`, { status: m.status === "done" ? "pending" : "done" }), "Updated.")()} />
            <span className={m.status === "done" ? "text-fg-muted line-through" : "text-fg"}>{m.title}</span></label>
          <span className="text-xs text-fg-muted">{m.dueDate ? `due ${day(m.dueDate)}` : "no date"}{m.status === "pending" && m.dueDate && m.dueDate < todayIso() ? " · overdue" : ""}</span>
          <button type="button" aria-label={`Remove ${m.title}`} className="ml-auto text-fg-muted hover:text-bad" onClick={() => act(() => send("DELETE", `/${d.ref}/milestones/${m.id}`), "Removed.")()}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
        </li>))}</ul>}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} aria-label="Add a milestone">
        <label className="block flex-1 min-w-[200px]"><span className="text-xs font-bold text-fg">Milestone</span><input aria-label="Milestone name" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="text-xs font-bold text-fg">Due</span><input aria-label="Milestone due date" type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <ActionButton label="Add" color={COLOR} onRun={act(async () => { const r = await send("POST", `/${d.ref}/milestones`, { title, dueDate: due || undefined }); if (!("error" in r)) { setTitle(""); setDue(""); } return r; }, "Added.")} />
      </form>
    </Box>
  );
}
function Payments({ d, aw, me, act }: { d: Detail; aw: Award; me: Me; act: Act }) {
  const [f, setF] = useState({ kind: "cash", amount: "", paidOn: todayIso(), reference: "", note: "" });
  return (
    <Box title="Payments" note={`${cur(aw.disbursed, aw.currency)} of ${cur(aw.amount, aw.currency)} paid. ${cur(aw.remaining, aw.currency)} left.`}>
      {aw.payments.length === 0 ? <Empty>Nothing has been paid yet.</Empty> : <ul className="space-y-1.5">{aw.payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-line pt-1.5 text-sm first:border-0 first:pt-0"><strong className="text-fg">{cur(p.amount, aw.currency)}</strong><span className="text-fg-muted">{p.kindLabel}</span><span className="text-xs text-fg-muted">{day(p.paidOn)}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</span></li>))}</ul>}
      {aw.stage === "agreement_pending" ? <p className="mt-3 text-sm text-fg-muted">Payments can be recorded once the agreement is signed.</p>
        : me.isFinance ? (
          <form className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()} aria-label="Record a payment">
            <label className="block"><span className="text-xs font-bold text-fg">What was given</span><select aria-label="Kind of payment" className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{PAYMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
            <label className="block"><span className="text-xs font-bold text-fg">Amount ({aw.currency})</span><input aria-label="Payment amount" inputMode="decimal" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-bold text-fg">Date</span><input aria-label="Payment date" type="date" max={todayIso()} className={inputCls} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-bold text-fg">Reference</span><input aria-label="Payment reference" className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></label>
            <div className="sm:col-span-2 lg:col-span-4"><ActionButton label="Record the payment" color={COLOR} onRun={act(async () => { const r = await send("POST", `/${d.ref}/payments`, f); if (!("error" in r)) setF({ ...f, amount: "", reference: "", note: "" }); return r; }, "Recorded.")} /></div>
          </form>) : <p className="mt-3 text-sm text-fg-muted">Only finance staff and Super Administrators can record payments.</p>}
    </Box>
  );
}

// ── follow-up ───────────────────────────────────────────────────────────────
function ReportCard({ d, r, act }: { d: Detail; r: Report; act: Act }) {
  const [note, setNote] = useState("");
  const docs = d.documents.filter((x) => x.sourceId === r.id);
  return (
    <article className="rounded-lg border border-line p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2"><Pill tone={r.status === "accepted" ? "ok" : r.status === "returned" ? "warn" : "plain"}>{r.statusLabel}</Pill><span className="text-xs text-fg-muted">sent {when(r.createdAt)}</span></p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="People reached" value={r.beneficiaries.toLocaleString("en-ZA")} /><Field label="Spent" value={cur(r.spent, d.award?.currency ?? d.currency)} /></div>
      <div className="mt-2 space-y-2"><Field label="What was delivered" value={<span className="whitespace-pre-wrap">{r.summary}</span>} /><Field label="What was achieved" value={<span className="whitespace-pre-wrap">{r.outcomes}</span>} /><Field label="How the money was spent" value={r.expenditureNotes ?? ""} />
        {Object.entries(r.benefitsDelivered).map(([id, v]) => <Field key={id} label={`Promised: ${labelOf(BENEFITS, id)}`} value={v} />)}{r.challenges && <Field label="Challenges" value={r.challenges} />}</div>
      <div className="mt-2"><p className="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle">Evidence</p><DocList docs={docs} refNo={d.ref} /></div>
      {r.status === "submitted" ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3"><TextArea label="Note to the applicant (needed to return it)" value={note} onChange={setNote} rows={2} />
          <span className="flex flex-wrap gap-2"><ActionButton label="Accept the report" color={COLOR} onRun={act(() => send("POST", `/${d.ref}/reports/${r.id}/review`, { decision: "accepted", note: note || undefined }), "Accepted. The award is complete.")} />
            <ActionButton label="Return it for changes" color="var(--vk-surface-2)" className="bg-surface-2 !text-fg border border-line" onRun={act(() => send("POST", `/${d.ref}/reports/${r.id}/review`, { decision: "returned", note }), "Returned.")} /></span></div>
      ) : r.reviewNote && <p className="mt-2 text-xs text-fg-muted">Your note: {r.reviewNote}</p>}
    </article>
  );
}
function FollowUp({ d, act }: { d: Detail; act: Act }) {
  return (
    <div className="space-y-4">
      <Box title="Replies to your questions">{d.replies.length === 0 ? <Empty>The applicant has not replied.</Empty> : <ul className="space-y-3">{d.replies.map((r) => (
        <li key={r.id} className="rounded-lg border border-line p-3 text-sm"><p className="text-xs text-fg-muted">{when(r.at)}</p><p className="whitespace-pre-wrap text-fg">{r.message}</p><div className="mt-2"><DocList docs={d.documents.filter((x) => x.sourceId === r.id)} refNo={d.ref} /></div></li>))}</ul>}
        {d.status === "more_information_required" && d.replied && <p className="mt-3 text-sm text-fg-muted">They have answered. Move the application on from the Decision tab when you have read it.</p>}</Box>
      <Box title="Final report">{d.reports.length === 0 ? <Empty>No final report yet. The applicant can send one once the agreement is signed.</Empty> : <div className="space-y-3">{[...d.reports].reverse().map((r) => <ReportCard key={r.id} d={d} r={r} act={act} />)}</div>}</Box>
    </div>
  );
}
