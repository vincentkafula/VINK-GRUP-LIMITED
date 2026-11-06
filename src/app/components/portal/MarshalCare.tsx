import { useState } from "react";
import { Siren, AlertTriangle, Clock, MessageSquare, IdCard } from "lucide-react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";
import { sendOrQueue, useOutbox, clearRejected } from "./offlineQueue";
import { useT } from "./i18n";
import { PdfButton } from "./MarshalPay";

/**
 * What looks after the marshal beyond their pay (docs/MARSHAL_COMMISSION.md): their shifts and hours, a one-tap safety report, a voice to the association, their work record and cover, a proof-of-income letter,
 * and drawing commission already earned. Everything that matters at a rank with poor signal (a shift, a safety report, a complaint, a query) is kept on the phone and sent when the signal returns.
 */
const COLOR = "#C8102E";
const call = portalClient("marshal");
const money = (cents: number) => rand(cents / 100);
const QUEUED = "Saved on your phone. It will send when you have signal.";
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60)} min`;
const FLAGS: Record<string, string> = { over_shift_limit: "Longer than the agreed shift", no_break_noted: "No break noted" };
const STATUS_TEXT: Record<string, string> = { proposed: "Waiting for approval", approved: "Approved", rejected: "Not approved" };
const localInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;

interface Rank { id: string; name: string }
function useRanks(): Rank[] { const [l] = useLoad<{ ranks: Rank[] }>(() => call("/ranks")); return l.state === "ready" ? l.data.ranks ?? [] : []; }

/* ───────────────────────── waiting to send ───────────────────────── */
export function OutboxBar() {
  const o = useOutbox(call), t = useT();
  if (!o.waiting.length && !o.refused.length) return null;
  return (
    <div className="space-y-2 mb-4">
      {o.waiting.length > 0 && <div role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg flex flex-wrap items-center justify-between gap-2"><span>{t("Waiting to send")}: <b>{o.waiting.length}</b> ({o.waiting.map((w) => w.label).join(", ")})</span><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} onClick={() => { void o.sendNow(); }}>{t("Send")}</button></div>}
      {o.refused.length > 0 && (
        <div role="alert" className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-fg">
          <p className="font-bold">These could not be sent, because the server refused them:</p>
          <ul className="list-disc pl-5">{o.refused.map((r, i) => <li key={i}>{r.label}: {r.error}</li>)}</ul>
          <button type="button" className="underline text-xs mt-1" onClick={() => clearRejected()}>Dismiss</button>
        </div>)}
    </div>
  );
}

/* ───────────────────────── shifts and hours ───────────────────────── */
interface Shift { id: string; rank: string; startedAt: string; endedAt: string | null; inProgress: boolean; workedMinutes: number; breakMinutes: number; source: string; status: string; corrected: boolean; note: string | null; flags: string[] }
interface Week { week: string; minutes: number; limit: number; over: boolean }

function CorrectForm({ s, onDone }: { s: Shift; onDone: () => void }) {
  const [f, setF] = useState({ start: localInput(s.startedAt), end: localInput(s.endedAt), brk: String(s.breakMinutes), why: "" });
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <Field label="Started"><input type="datetime-local" aria-label="Started" className={inputCls + " mt-1"} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
      <Field label="Ended"><input type="datetime-local" aria-label="Ended" className={inputCls + " mt-1"} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
      <Field label="Break (minutes)"><input aria-label="Break (minutes)" className={inputCls + " mt-1 !w-20"} inputMode="numeric" value={f.brk} onChange={(e) => setF({ ...f, brk: e.target.value })} /></Field>
      <Field label="Why are the times different? (needed if you change them)"><input aria-label="Why" className={inputCls + " mt-1 w-56"} maxLength={200} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} /></Field>
      <ActionButton small label="Save" color={COLOR} onRun={async () => {
        const body: Record<string, unknown> = {}; if (f.start !== localInput(s.startedAt)) body.startedAt = new Date(f.start).toISOString(); if (f.end !== localInput(s.endedAt) && f.end) body.endedAt = new Date(f.end).toISOString();
        if (f.brk !== String(s.breakMinutes)) body.breakMinutes = Number(f.brk); if (f.why.trim()) body.note = f.why.trim();
        const r = await call(`/shifts/${s.id}`, { method: "PUT", body }); if ("error" in r) return { error: r.error }; onDone(); return { message: "Saved. Your association will approve it again." };
      }} />
    </div>
  );
}

export function ShiftsScreen() {
  const t = useT(), ranks = useRanks();
  const [load, reload] = useLoad<{ shifts: Shift[]; weeks: Week[] }>(() => call("/shifts"));
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState({ rank: "", start: "", end: "", brk: "0", note: "" });
  return (
    <div className="space-y-4">
      <SectionPanel title={t("My shifts")}>
        <div className="p-4 space-y-3">
          <Status load={load}>{({ shifts, weeks }) => (
            <>
              {weeks.map((w) => <p key={w.week} className={`text-sm ${w.over ? "font-bold text-fg" : "text-fg-muted"}`}>Week of {w.week}: {hm(w.minutes)}{w.over ? `, over the agreed ${hm(w.limit)}` : ` of the agreed ${hm(w.limit)}`}</p>)}
              {shifts.length === 0 ? <Empty>No shifts in the last two weeks. They appear from the queue and departures you record.</Empty> : (
                <ul className="space-y-3">{shifts.map((s) => (
                  <li key={s.id} className="text-sm text-fg border-b border-line/60 pb-2">
                    <div className="flex flex-wrap justify-between gap-2"><span><b>{when(s.startedAt)}</b> · {s.rank}{s.inProgress ? " · in progress" : ""}</span><span className="font-bold">{hm(s.workedMinutes)}</span></div>
                    <div className="text-xs text-fg-muted">{t(STATUS_TEXT[s.status] ?? s.status)}{s.corrected ? " · corrected by you" : ""}{s.source === "manual" ? " · added by you" : ""}{s.breakMinutes ? ` · break ${s.breakMinutes} min` : ""}{s.flags.length ? ` · ${s.flags.map((x) => FLAGS[x] ?? x).join(", ")}` : ""}</div>
                    <button type="button" className="text-xs underline text-fg-muted" aria-expanded={editing === s.id} onClick={() => setEditing(editing === s.id ? null : s.id)}>{t("Correct")}</button>
                    {editing === s.id && <CorrectForm s={s} onDone={reload} />}
                  </li>))}</ul>)}
            </>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title={t("Add a shift")}>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="Rank"><select aria-label="Shift rank" className={inputCls + " mt-1 w-44"} value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })}><option value="">Choose</option>{ranks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Started"><input type="datetime-local" aria-label="Shift started" className={inputCls + " mt-1"} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ended"><input type="datetime-local" aria-label="Shift ended" className={inputCls + " mt-1"} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Break (minutes)"><input aria-label="Shift break" className={inputCls + " mt-1 !w-20"} inputMode="numeric" value={f.brk} onChange={(e) => setF({ ...f, brk: e.target.value })} /></Field>
          <Field label="What was it?"><input aria-label="Shift note" className={inputCls + " mt-1 w-56"} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <ActionButton small label={t("Save")} color={COLOR} onRun={async () => {
            const r = await sendOrQueue(call, { method: "POST", path: "/shifts", label: "Shift", body: { rankId: f.rank, startedAt: f.start ? new Date(f.start).toISOString() : "", endedAt: f.end ? new Date(f.end).toISOString() : "", breakMinutes: Number(f.brk) || 0, note: f.note } });
            if (r.status === "error") return { error: r.error }; setF({ ...f, start: "", end: "", note: "" }); if (r.status === "sent") reload(); return { message: r.status === "queued" ? t(QUEUED) : t("Sent.") };
          }} />
        </div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── safety ───────────────────────── */
const INCIDENTS: [string, string][] = [["threat", "Threat"], ["fight", "Fight"], ["robbery", "Robbery"], ["overcrowding", "Overcrowding"], ["injury", "Injury"], ["other", "Other"]];
/** Shrinks a photo to a small JPEG (under about 100 KB) so it can be sent over a weak connection. Returns null when the browser cannot. */
export async function shrinkPhoto(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file), scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d"); if (!g) return null; g.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.7, 0.55, 0.4, 0.3]) { const u = c.toDataURL("image/jpeg", q); if (u.length < 120_000) return u; }
    return null;
  } catch { return null; }
}
export function SafetyScreen() {
  const t = useT(), ranks = useRanks();
  const [rank, setRank] = useState(""), [type, setType] = useState<string | null>(null), [note, setNote] = useState(""), [photo, setPhoto] = useState<string | null>(null), [photoMsg, setPhotoMsg] = useState("");
  const [done, setDone] = useState<string | null>(null);              // the confirmation stays after the form clears, so the marshal knows it went
  const [mine, reload] = useLoad<{ incidents: { id: string; rank: string; type: string; occurredAt: string; status: string }[] }>(() => call("/incidents"));
  const rankId = rank || (ranks.length === 1 ? ranks[0].id : "");
  return (
    <div className="space-y-4">
      <SectionPanel title={t("Report a problem at the rank")} action={<Siren className="w-4 h-4 text-fg-muted" aria-hidden />}>
        <div className="p-4 space-y-3">
          {done && <p role="status" className="text-sm font-bold text-ok">{done}</p>}
          {ranks.length > 1 && <Field label="Which rank?"><select aria-label="Incident rank" className={inputCls + " mt-1 w-48"} value={rank} onChange={(e) => setRank(e.target.value)}><option value="">Choose</option>{ranks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="What happened">{INCIDENTS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => { setType(k); setDone(null); }} className={`px-3 py-3 rounded-lg text-sm font-bold border ${type === k ? "text-white" : "text-fg border-line"}`} style={type === k ? { background: COLOR, borderColor: COLOR } : undefined}>{t(l)}</button>))}</div>
          {type && (
            <div className="space-y-2">
              <Field label={t("Note (optional)")}><input aria-label="Incident note" className={inputCls + " mt-1"} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Field label={t("Photo (optional)")}><input aria-label="Incident photo" type="file" accept="image/*" className="mt-1 text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) { setPhoto(null); setPhotoMsg(""); return; } const u = await shrinkPhoto(f); setPhoto(u); setPhotoMsg(u ? "Photo ready." : "That photo could not be made small enough, so it will not be sent."); }} /></Field>
              {photoMsg && <p className="text-xs text-fg-muted">{photoMsg}</p>}
              <ActionButton label={t("Send report")} color={COLOR} onRun={async () => {
                if (!rankId) return { error: "Choose which rank" };
                const r = await sendOrQueue(call, { method: "POST", path: "/incidents", label: "Safety report", body: { rankId, type, note: note || undefined, photo: photo || undefined } });
                if (r.status === "error") return { error: r.error }; setType(null); setNote(""); setPhoto(null); setPhotoMsg(""); if (r.status === "sent") reload();
                setDone(r.status === "queued" ? t(QUEUED) : "Reported. Your association has been told."); return undefined;
              }} />
            </div>)}
        </div>
      </SectionPanel>
      <SectionPanel title={t("My reports")}>
        <div className="p-4"><Status load={mine}>{({ incidents }) => incidents.length === 0 ? <Empty>You have not reported anything.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{incidents.map((i) => <li key={i.id}>{when(i.occurredAt)} · {i.rank} · <b>{t(INCIDENTS.find(([k]) => k === i.type)?.[1] ?? i.type)}</b> · <span className="text-fg-muted">{i.status === "new" ? "Sent" : i.status === "acknowledged" ? "Seen by your association" : "Closed"}</span></li>)}</ul>)}</Status></div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── my voice ───────────────────────── */
const CATEGORIES: [string, string][] = [["pay", "Pay"], ["hours", "Hours"], ["safety", "Safety"], ["queue", "Queue"], ["conditions", "Conditions"], ["benefits", "Benefits"], ["other", "Other"]];
export function VoiceScreen() {
  const t = useT(), [cat, setCat] = useState("pay"), [msg, setMsg] = useState("");
  const [load, reload] = useLoad<{ grievances: { id: string; category: string; message: string; status: string; response: string | null; respondedBy: string | null; createdAt: string }[] }>(() => call("/grievances"));
  return (
    <div className="space-y-4">
      <SectionPanel title={t("Tell your association something")} action={<MessageSquare className="w-4 h-4 text-fg-muted" aria-hidden />}>
        <div className="p-4 space-y-3">
          <Field label={t("What is it about?")}><select aria-label="Complaint about" className={inputCls + " mt-1 w-48"} value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></Field>
          <Field label="What is the matter? (5 to 500 characters)"><textarea aria-label="Complaint text" className={inputCls + " mt-1 min-h-[5rem]"} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
          <ActionButton label={t("Send")} color={COLOR} onRun={async () => {
            const r = await sendOrQueue(call, { method: "POST", path: "/grievances", label: "Complaint", body: { category: cat, message: msg } });
            if (r.status === "error") return { error: r.error }; setMsg(""); if (r.status === "sent") reload(); return { message: r.status === "queued" ? t(QUEUED) : "Sent. Your association will answer here." };
          }} />
        </div>
      </SectionPanel>
      <SectionPanel title="What I have raised">
        <div className="p-4"><Status load={load}>{({ grievances }) => grievances.length === 0 ? <Empty>You have not raised anything.</Empty> : (
          <ul className="space-y-3 text-sm text-fg">{grievances.map((g) => (
            <li key={g.id} className="border-b border-line/60 pb-2"><div className="flex flex-wrap justify-between gap-2"><span><b>{t(CATEGORIES.find(([k]) => k === g.category)?.[1] ?? g.category)}</b>: {g.message}</span><span className="font-bold">{g.status === "open" ? "Waiting for an answer" : g.status === "under_review" ? "Being looked at" : g.status === "resolved" ? "Resolved" : "Closed"}</span></div>
              <div className="text-xs text-fg-muted">{when(g.createdAt)}{g.response ? ` · ${g.respondedBy ?? "Your association"}: ${g.response}` : ""}</div></li>))}</ul>)}</Status></div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── my record ───────────────────────── */
interface Record_ { marshalNumber: string | null; startDate: string | null; tenureDays: number; totalTrips: number; ranks: { rank: string; trips: number; first: string; last: string }[]; earningsByMonth: { month: string; earnedCents: number; deductionsCents: number; netCents: number; trips: number }[]; verified: boolean; missing: string[] }
interface Letter { id: string; number: string; monthsCovered: number; from: string; to: string; issuedAt: string; verificationCode: string; intact: boolean; months: { month: string; payslips: number; trips: number; earnedCents: number; deductionsCents: number; netCents: number }[]; totals: { earnedCents: number; deductionsCents: number; netCents: number; trips: number }; note: string }
const BENEFIT_NAMES: Record<string, string> = { uif: "UIF", injury_cover: "Injury cover", savings: "Savings scheme", funeral: "Funeral cover" };
const BENEFIT_STATUS: Record<string, string> = { registered: "Registered", pending: "Pending", not_registered: "Not registered" };

function LetterView({ id }: { id: string }) {
  const [load] = useLoad<{ letter: Letter }>(() => call(`/income-letters/${id}`), [id]);
  return (
    <Status load={load}>{({ letter: l }) => {
      const text = `Proof of income ${l.number}, verification code ${l.verificationCode}. ${l.from} to ${l.to}. Total net ${money(l.totals.netCents)} over ${l.monthsCovered} months. The association can confirm this letter.`;
      return (
        <div className="space-y-3 text-sm text-fg">
          <p className="font-bold">Letter {l.number} · code {l.verificationCode}</p>
          {!l.intact && <p role="alert" className="text-bad">A payslip behind this letter has changed since it was made. Make a new letter.</p>}
          <table className="w-full"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1">Month</th><th className="text-right">Trips</th><th className="text-right">Earned</th><th className="text-right">Net</th></tr></thead>
            <tbody>{l.months.map((m) => <tr key={m.month} className="border-b border-line/60"><td className="py-1">{m.month}</td><td className="text-right">{m.trips}</td><td className="text-right">{money(m.earnedCents)}</td><td className="text-right">{money(m.netCents)}</td></tr>)}</tbody></table>
          <p>Total over {l.monthsCovered} months: earned <b>{money(l.totals.earnedCents)}</b>, net <b>{money(l.totals.netCents)}</b>.</p>
          <div className="flex flex-wrap items-center gap-3"><PdfButton id={l.id} number={l.number} kind="income-letters" /><a className="px-3 py-2 rounded-lg text-sm font-bold border border-line text-fg" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a></div>
          <p className="text-[11px] text-fg-subtle">{l.note}</p>
        </div>);
    }}</Status>
  );
}

export function MyRecordScreen() {
  const t = useT();
  const [rec] = useLoad<{ record: Record_ }>(() => call("/work-record"));
  const [ben] = useLoad<{ benefits: { kind: string; status: string; reference: string | null; contributedCents: number | null }[]; contributions: { uifCents: number; stokvelCents: number; associationFeeCents: number } }>(() => call("/benefits"));
  const [prof, reloadProf] = useLoad<{ consents: { purpose: string; granted: boolean }[] }>(() => call("/profile"));
  const [letters, reloadLetters] = useLoad<{ letters: { id: string; number: string; months: number; issuedAt: string }[] }>(() => call("/income-letters"));
  const [months, setMonths] = useState("3"), [open, setOpen] = useState<string | null>(null);
  const consent = prof.state === "ready" ? prof.data.consents.find((c) => c.purpose === "income_letter")?.granted ?? false : false;
  return (
    <div className="space-y-4">
      <SectionPanel title={t("Work record")} action={<IdCard className="w-4 h-4 text-fg-muted" aria-hidden />}>
        <div className="p-4"><Status load={rec}>{({ record: r }) => (
          <div className="space-y-3 text-sm text-fg">
            <div className="grid gap-3 sm:grid-cols-3"><StatCard label={t("Started working")} value={r.startDate ?? "Not recorded"} icon={<Clock className="w-5 h-5" />} color={COLOR} /><StatCard label={t("Trips handled")} value={String(r.totalTrips)} icon={<AlertTriangle className="w-5 h-5" />} color={COLOR} /><StatCard label="Marshal number" value={r.marshalNumber ?? "None yet"} icon={<IdCard className="w-5 h-5" />} color={COLOR} /></div>
            <p>{r.verified ? <b>{t("Verified")}: your start date, consent and payslips are all on record.</b> : <span>{t("Not yet verified")}: still needed: {r.missing.join(", ")}.</span>}</p>
            {r.ranks.length > 0 && <ul className="space-y-1">{r.ranks.map((k) => <li key={k.rank}>{k.rank}: {k.trips} trips ({k.first} to {k.last})</li>)}</ul>}
            {r.earningsByMonth.length > 0 && <table className="w-full"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1">Month</th><th className="text-right">Trips</th><th className="text-right">Earned</th><th className="text-right">Net</th></tr></thead><tbody>{r.earningsByMonth.map((m) => <tr key={m.month} className="border-b border-line/60"><td className="py-1">{m.month}</td><td className="text-right">{m.trips}</td><td className="text-right">{money(m.earnedCents)}</td><td className="text-right">{money(m.netCents)}</td></tr>)}</tbody></table>}
          </div>)}</Status></div>
      </SectionPanel>
      <SectionPanel title={t("Cover and benefits")}>
        <div className="p-4"><Status load={ben}>{({ benefits }) => (
          <ul className="space-y-2 text-sm text-fg">{benefits.map((b) => <li key={b.kind} className="flex flex-wrap justify-between gap-2"><span>{BENEFIT_NAMES[b.kind] ?? b.kind}{b.reference ? ` (${b.reference})` : ""}</span><span className="font-bold">{t(BENEFIT_STATUS[b.status] ?? b.status)}{b.contributedCents !== null ? ` · paid in so far ${money(b.contributedCents)}` : ""}</span></li>)}</ul>)}</Status>
          <p className="text-[11px] text-fg-subtle mt-2">What you have paid in is read from your issued payslips. Savings and funeral contributions are shown together.</p></div>
      </SectionPanel>
      <SectionPanel title={t("Proof of income")}>
        <div className="p-4 space-y-3 text-sm text-fg">
          <p>A letter from your issued payslips that a bank or landlord can check with your association. It is not a certificate of employment.</p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={consent} onChange={async (e) => { await call("/consents/income_letter", { method: "PUT", body: { granted: e.target.checked } }); reloadProf(); }} /><span>I agree that a letter showing my earnings may be made and shared by me.</span></label>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Covering"><select aria-label="Months" className={inputCls + " mt-1 w-36"} value={months} onChange={(e) => setMonths(e.target.value)}><option value="3">The last 3 months</option><option value="6">The last 6 months</option></select></Field>
            <ActionButton label={t("Create letter")} color={COLOR} onRun={async () => { const r = await call<{ letter: Letter }>("/income-letters", { method: "POST", body: { months: Number(months) } }); if ("error" in r) return { error: r.error }; reloadLetters(); if (r.data.letter?.id) setOpen(r.data.letter.id); return { message: "Letter made." }; }} />
          </div>
          <Status load={letters}>{({ letters: ls }) => ls.length === 0 ? null : <ul className="space-y-1">{ls.map((l) => <li key={l.id} className="flex flex-wrap justify-between gap-2"><span>{l.number} · {l.months} months · {when(l.issuedAt)}</span><button type="button" className="underline text-xs" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? t("Close") : t("Open")}</button></li>)}</ul>}</Status>
          {open && <div className="rounded-lg border border-line p-4"><LetterView id={open} /></div>}
        </div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── drawing earned commission ───────────────────────── */
export function CashOutCard() {
  const t = useT(), [load, reload] = useLoad<{ enabled: boolean; availableCents: number; outstandingCents: number; maxCents: number; capBp: number }>(() => call("/cash-out"));
  const [amount, setAmount] = useState("");
  if (load.state !== "ready" || !load.data.enabled) return null;
  const c = load.data;
  return (
    <SectionPanel title={t("Cash-out")}>
      <div className="p-4 space-y-3 text-sm text-fg">
        <p aria-live="polite">{t("You can draw up to")} <b>{money(c.maxCents)}</b> now. Earned and safe to draw: {money(c.availableCents)} ({c.capBp / 100}% of it may be drawn).{c.outstandingCents > 0 ? ` Already drawn and still to come off your payslip: ${money(c.outstandingCents)}.` : ""}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Amount (R)"><input aria-label="Cash-out amount" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <ActionButton label={t("Draw")} color={COLOR} onRun={async () => { const r = await call<{ reference: string; amountCents: number }>("/cash-out", { method: "POST", body: { amountCents: Math.round(Number(amount.replace(",", ".")) * 100) } }); if ("error" in r) return { error: r.error }; setAmount(""); reload(); return { message: `${r.data.reference}: ${money(r.data.amountCents)} will be paid to you by your association, and comes off your next payslip.` }; }} />
        </div>
        <p className="text-[11px] text-fg-subtle">Only commission on trips whose fee has been paid can be drawn. It is a payment now of money you have earned, taken back from your next payslip, and is not a loan with interest.</p>
      </div>
    </SectionPanel>
  );
}
