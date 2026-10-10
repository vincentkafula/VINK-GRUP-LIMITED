import { useEffect, useState, useCallback, useRef } from "react";
import { MessageCircle, ArrowLeft, Send, Check, CheckCheck, AlertTriangle, Clock } from "lucide-react";
import { when } from "./ui";
import { adminClient } from "./adminApi";

/**
 * Customer chat on WhatsApp, for the people who manage a department: choose a department, then the chat, and answer. The same department-first layout as Department mail.
 * The list and the open chat refresh by themselves every 15 seconds. WhatsApp lets VINK write freely only for 24 hours after the customer's last message; after that the
 * server uses the approved template, or says why it cannot.
 */
interface Dept { key: string; name: string; waiting: number }
interface Conv { id: string; waId: string; name: string; department: string; status: "open" | "answered" | "closed"; optedIn: boolean; lastAt: string; lastPreview: string; windowOpen: boolean }
interface Msg { id: string; direction: "in" | "out"; body: string; status: string; error: string | null; by: string; at: string }

const COLOR = "#16A34A";
const FILTERS: { key: string; label: string }[] = [{ key: "open", label: "Waiting" }, { key: "answered", label: "Answered" }, { key: "closed", label: "Closed" }, { key: "", label: "All" }];
const REFRESH_MS = 15_000;
const phone = (waId: string) => `+${waId}`;

export function WhatsAppPanel() {
  const call = useRef(adminClient("/api/admin/whatsapp")).current;
  const [depts, setDepts] = useState<Dept[] | null>(null);
  const [dept, setDept] = useState("");
  const [filter, setFilter] = useState("open");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conv; messages: Msg[] } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const loadDepts = useCallback(async () => { const r = await call<{ departments: Dept[] }>("/summary"); if ("error" in r) setLoadErr(r.error); else { setLoadErr(""); setDepts(r.data.departments); } }, [call]);
  const loadConvs = useCallback(async () => {
    if (!dept) return;
    const r = await call<{ conversations: Conv[] }>(`/conversations?department=${encodeURIComponent(dept)}${filter ? `&status=${filter}` : ""}`);
    if ("error" in r) setLoadErr(r.error); else setConvs(r.data.conversations);
  }, [call, dept, filter]);
  const loadThread = useCallback(async () => {
    if (!open) return;
    const r = await call<{ conversation: Conv; messages: Msg[] }>(`/conversations/${open}`);
    if ("error" in r) setErr(r.error); else setThread(r.data);
  }, [call, open]);

  useEffect(() => { loadDepts(); }, [loadDepts]);
  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { setThread(null); loadThread(); }, [loadThread]);
  useEffect(() => { const t = setInterval(() => { loadDepts(); loadConvs(); loadThread(); }, REFRESH_MS); return () => clearInterval(t); }, [loadDepts, loadConvs, loadThread]);
  // a single department is opened for the person, as in Department mail
  useEffect(() => { if (!dept && depts && depts.length === 1) setDept(depts[0].key); }, [depts, dept]);

  const choose = (key: string) => { setDept(key); setOpen(null); setThread(null); setConvs([]); setFilter("open"); setErr(""); };
  const refreshAll = () => { loadDepts(); loadConvs(); loadThread(); };
  async function send() {
    if (!open || !text.trim()) return; setBusy(true); setErr("");
    const r = await call(`/conversations/${open}/reply`, { method: "POST", body: { body: text } }); setBusy(false);
    if ("error" in r) { setErr(r.error); return; } setText(""); refreshAll();
  }
  async function setStatus(status: string) { if (!open) return; const r = await call(`/conversations/${open}/status`, { method: "POST", body: { status } }); if ("error" in r) setErr(r.error); refreshAll(); }
  async function move(department: string) { if (!open || !department) return; const r = await call(`/conversations/${open}/department`, { method: "POST", body: { department } }); if ("error" in r) setErr(r.error); else { setOpen(null); setThread(null); } refreshAll(); }

  const cur = depts?.find((d) => d.key === dept);
  const tick = (m: Msg) => m.status === "failed" ? <AlertTriangle className="h-3 w-3 text-[#B3261E]" aria-label="Not delivered" /> : m.status === "read" ? <CheckCheck className="h-3 w-3 text-[#2563EB]" aria-label="Read" /> : m.status === "delivered" ? <CheckCheck className="h-3 w-3" aria-label="Delivered" /> : m.status === "sent" ? <Check className="h-3 w-3" aria-label="Sent" /> : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-fg"><MessageCircle className="h-6 w-6" style={{ color: COLOR }} /> WhatsApp</h1>
        <p className="max-w-3xl text-sm text-fg-muted">Chats from customers who message VINK on WhatsApp. They choose a department from a menu, and the chat appears in that department's list for the people who manage it.</p>
      </div>
      {loadErr && <p role="alert" className="text-sm font-semibold text-[#B3261E]">{loadErr}</p>}

      {!dept ? (
        <section aria-label="Choose a department">
          <h2 className="mb-2 text-sm font-bold text-fg">Choose a department</h2>
          {depts === null ? <p className="text-sm text-fg-muted">Loading…</p> : depts.length === 0 ? <p className="text-sm text-fg-muted">You do not manage a department yet, so there are no chats for you.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{depts.map((d) => (
              <li key={d.key}><button type="button" aria-label={`Open ${d.name}`} onClick={() => choose(d.key)} className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-4 text-left hover:border-[#16A34A]">
                <span className="font-semibold text-fg">{d.name}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={d.waiting > 0 ? { background: COLOR, color: "#fff" } : { background: "#F1F5F9", color: "#475569" }}>{d.waiting > 0 ? `${d.waiting} waiting` : "None waiting"}</span>
              </button></li>))}</ul>)}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <section aria-label="Chats" className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line p-3">
              {(depts?.length ?? 0) > 1 && <button type="button" aria-label="All departments" onClick={() => choose("")} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface-2"><ArrowLeft className="h-3.5 w-3.5" /> All</button>}
              <p aria-label="Department" className="font-bold text-fg">{cur?.name ?? dept}</p>
            </div>
            <div role="tablist" aria-label="Chat filter" className="flex gap-1 border-b border-line p-2">{FILTERS.map((x) => (
              <button key={x.key || "all"} role="tab" aria-selected={filter === x.key} onClick={() => { setFilter(x.key); setOpen(null); }} className="rounded-full px-3 py-1 text-xs font-semibold" style={filter === x.key ? { background: COLOR, color: "#fff" } : { color: "var(--vk-fg-muted)" }}>{x.label}</button>))}</div>
            {convs.length === 0 ? <p className="p-4 text-sm text-fg-muted">No chats here.</p> : (
              <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">{convs.map((c) => (
                <li key={c.id}><button type="button" onClick={() => { setOpen(c.id); setErr(""); }} aria-current={open === c.id} className={`w-full p-3 text-left hover:bg-surface-2 ${open === c.id ? "bg-surface-2" : ""}`}>
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-fg">{c.name || phone(c.waId)}</span>{c.status === "open" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR }} aria-label="Waiting for a reply" />}</span>
                  <span className="block truncate text-xs text-fg-muted">{c.lastPreview}</span><span className="text-[10px] text-fg-subtle">{when(c.lastAt)}</span>
                </button></li>))}</ul>)}
          </section>

          <section aria-label="Chat" className="flex min-h-[320px] flex-col rounded-xl border border-line bg-surface">
            {!thread ? <p className="p-6 text-sm text-fg-muted">{open ? "Loading…" : "Choose a chat to read it."}</p> : (<>
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1"><p className="truncate font-bold text-fg">{thread.conversation.name || phone(thread.conversation.waId)}</p><p className="text-xs text-fg-muted">{phone(thread.conversation.waId)}{thread.conversation.optedIn ? " · gets alerts" : ""}</p></div>
                <select aria-label="Move to department" value="" onChange={(e) => move(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1 text-xs"><option value="">Move to…</option>{(depts ?? []).filter((d) => d.key !== dept && d.key !== "unrouted").map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
                {thread.conversation.status === "closed" ? <button type="button" onClick={() => setStatus("open")} className="rounded-lg border border-line px-3 py-1 text-xs font-bold">Reopen</button> : <button type="button" onClick={() => setStatus("closed")} className="rounded-lg border border-line px-3 py-1 text-xs font-bold">Close chat</button>}
              </div>
              <ol aria-label="Messages" className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: "50vh" }}>{thread.messages.map((m) => (
                <li key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm" style={m.direction === "out" ? { background: "#DCF8C6", color: "#14301C" } : { background: "var(--vk-surface-2)", color: "var(--vk-fg)" }}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">{m.direction === "out" && m.by ? `${m.by} · ` : ""}{when(m.at)} {m.direction === "out" && tick(m)}</p>
                    {m.error && <p className="text-[10px] text-[#B3261E]">{m.error}</p>}
                  </div>
                </li>))}</ol>
              {!thread.conversation.windowOpen && <p role="note" className="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-[#FEF3C7] p-2 text-xs text-[#92400E]"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The customer last wrote more than 24 hours ago. WhatsApp only allows an approved template message now; it opens the chat again.</p>}
              {err && <p role="alert" className="mx-3 mb-2 text-sm font-semibold text-[#B3261E]">{err}</p>}
              <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <textarea aria-label="Reply" rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Write a reply" className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send reply" className="inline-flex items-center gap-1 self-end rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: COLOR }}><Send className="h-4 w-4" /> Send</button>
              </form>
            </>)}
          </section>
        </div>)}
    </div>
  );
}
