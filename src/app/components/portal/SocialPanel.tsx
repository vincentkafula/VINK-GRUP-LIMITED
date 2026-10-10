import { useState } from "react";
import { Facebook, Instagram, AtSign, Send, CalendarClock, Megaphone, RotateCw, X as XIcon, Rocket, ShoppingBag } from "lucide-react";
import { useLoad, Status, inputCls, when } from "./ui";
import { adminClient } from "./adminApi";

/**
 * Social media, for Super Administrators and people approved for "Social Media Management": write a post once and send it to Facebook, Instagram and Threads, now or later,
 * and see what each network answered. Super Administrators also switch on the automatic posts: the launch countdown and the new Ballylife products.
 */
type Network = "facebook" | "instagram" | "threads";
const NETS: { key: Network; label: string; icon: React.ReactNode }[] = [
  { key: "facebook", label: "Facebook", icon: <Facebook className="h-4 w-4" /> },
  { key: "instagram", label: "Instagram", icon: <Instagram className="h-4 w-4" /> },
  { key: "threads", label: "Threads", icon: <AtSign className="h-4 w-4" /> },
];
const KINDS: { key: string; label: string }[] = [{ key: "manual", label: "General post" }, { key: "blog", label: "New blog post" }, { key: "offer", label: "New offer" }, { key: "career", label: "Job opening" }];
interface Outcome { ok: boolean; id?: string; error?: string }
interface Post { id: string; kind: string; text: string; link: string | null; imageUrl: string | null; networks: Network[]; status: string; scheduledAt: string; results: Partial<Record<Network, Outcome>>; createdBy: string; auto: boolean }
interface Auto { enabled: boolean; networks: Network[] }
interface Status_ { configured: Record<Network, boolean>; auto: { launch: Auto; products: Auto }; launchDate: string; daysToLaunch: number; productFeed: boolean }

const COLOR = "#7C3AED";
const STATE: Record<string, { label: string; bg: string; fg: string }> = {
  posted: { label: "Posted", bg: "#DCFCE7", fg: "#166534" }, partial: { label: "Some networks failed", bg: "#FEF3C7", fg: "#92400E" }, failed: { label: "Failed", bg: "#FEE2E2", fg: "#991B1B" },
  scheduled: { label: "Scheduled", bg: "#DBEAFE", fg: "#1E40AF" }, posting: { label: "Posting…", bg: "#E0E7FF", fg: "#3730A3" }, cancelled: { label: "Cancelled", bg: "#F1F5F9", fg: "#475569" },
};

export function SocialPanel({ isSuper = false }: { isSuper?: boolean }) {
  const call = adminClient("/api/admin/social");
  const [status, reloadStatus] = useLoad<Status_ & { success: boolean }>(() => call("/status"));
  const [posts, reloadPosts] = useLoad<{ posts: Post[] }>(() => call("/posts"));
  const [f, setF] = useState({ kind: "manual", text: "", link: "", imageUrl: "", networks: [] as Network[], scheduleAt: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (n: Network) => set("networks", f.networks.includes(n) ? f.networks.filter((x) => x !== n) : [...f.networks, n]);
  const ready = status.state === "ready" ? status.data.configured : { facebook: false, instagram: false, threads: false };

  async function submit() {
    setBusy(true); setMsg({});
    const r = await call<{ post: Post }>("/posts", { method: "POST", body: { kind: f.kind, text: f.text, link: f.link || null, imageUrl: f.imageUrl || null, networks: f.networks, scheduleAt: f.scheduleAt ? new Date(f.scheduleAt).toISOString() : undefined } });
    setBusy(false);
    if ("error" in r) { setMsg({ error: r.error }); return; }
    const p = r.data.post;
    setMsg({ ok: p.status === "scheduled" ? `Scheduled for ${when(p.scheduledAt)}.` : p.status === "posted" ? "Posted." : p.status === "partial" ? "Posted to some networks. See the result below." : "The networks did not take it. See the reason below." });
    if (p.status !== "failed") setF({ kind: f.kind, text: "", link: "", imageUrl: "", networks: f.networks, scheduleAt: "" });
    reloadPosts();
  }
  async function act(p: Post, what: "retry" | "cancel") { const r = await call(`/posts/${p.id}/${what}`, { method: "POST" }); setMsg("error" in r ? { error: r.error } : {}); reloadPosts(); }
  async function saveAuto(key: "launch" | "products", a: Auto) { const r = await call("/auto", { method: "PUT", body: { [key]: a } }); setMsg("error" in r ? { error: r.error } : { ok: "Saved." }); reloadStatus(); }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-fg">Social media</h1>
        <p className="max-w-3xl text-sm text-fg-muted">Write a post once and send it to Facebook, Instagram and Threads, now or at a time you choose. Instagram needs a picture, and does not make links clickable.</p>
      </div>

      <Status load={status}>{(s) => (
        <p className="flex flex-wrap items-center gap-2 text-xs" aria-label="Connected accounts">
          {NETS.map((n) => <span key={n.key} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold" style={s.configured[n.key] ? { background: "#DCFCE7", color: "#166534" } : { background: "#F1F5F9", color: "#475569" }}>{n.icon} {n.label}: {s.configured[n.key] ? "connected" : "not set up"}</span>)}
          <span className="text-fg-muted">{s.daysToLaunch >= 0 ? `${s.daysToLaunch} days to launch (${s.launchDate})` : "VINK has launched"}</span>
        </p>
      )}</Status>

      <section aria-label="Write a post" className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-fg"><Megaphone className="h-4 w-4" style={{ color: COLOR }} /> New post</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-fg-muted">What is it about
            <select aria-label="Kind of post" value={f.kind} onChange={(e) => set("kind", e.target.value)} className={`${inputCls} mt-1`}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-fg-muted">Send it at (leave empty to post now)
            <input aria-label="Send at" type="datetime-local" value={f.scheduleAt} onChange={(e) => set("scheduleAt", e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-fg-muted md:col-span-2">The post
            <textarea aria-label="Post text" rows={4} maxLength={2000} value={f.text} onChange={(e) => set("text", e.target.value)} className={`${inputCls} mt-1`} placeholder="What do you want to say?" />
            <span className="text-[11px] font-normal">{f.text.length}/2000. Threads shows the first 500 characters.</span>
          </label>
          <label className="text-xs font-semibold text-fg-muted">Link (optional)
            <input aria-label="Link" value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://vink.co.za/..." className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-fg-muted">Picture address (needed for Instagram)
            <input aria-label="Picture address" value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://.../picture.jpg" className={`${inputCls} mt-1`} />
          </label>
        </div>
        <fieldset className="mt-3 flex flex-wrap items-center gap-3"><legend className="sr-only">Networks</legend>
          {NETS.map((n) => (
            <label key={n.key} className={`inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm ${ready[n.key] ? "text-fg" : "text-fg-subtle opacity-60"}`}>
              <input type="checkbox" aria-label={n.label} disabled={!ready[n.key]} checked={f.networks.includes(n.key)} onChange={() => toggle(n.key)} /> {n.icon} {n.label}
            </label>))}
        </fieldset>
        {msg.error && <p role="alert" className="mt-3 text-sm font-semibold text-[#B3261E]">{msg.error}</p>}
        {msg.ok && <p role="status" className="mt-3 text-sm font-semibold text-[#166534]">{msg.ok}</p>}
        <button type="button" disabled={busy || !f.text.trim() || !f.networks.length} onClick={submit} className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: COLOR }}>
          {f.scheduleAt ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}{busy ? "Working…" : f.scheduleAt ? "Schedule post" : "Post now"}
        </button>
      </section>

      {isSuper && status.state === "ready" && (
        <section aria-label="Automatic posts" className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold text-fg">Automatic posts</h2>
          <p className="mb-3 text-xs text-fg-muted">These post by themselves, once a day at most, and only to the networks you tick. They are off until you switch them on.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <AutoCard icon={<Rocket className="h-4 w-4" />} title="Launch countdown" text={`The days left before VINK launches (${status.data.launchDate}): every day in the last 30 days, then weekly, then monthly. Posted at 08:00 South African time.`}
              value={status.data.auto.launch} ready={ready} onSave={(a) => saveAuto("launch", a)} />
            <AutoCard icon={<ShoppingBag className="h-4 w-4" />} title="New Ballylife products" text={status.data.productFeed ? "Up to two new products a day from the Ballylife shop, announced as a VINK Group company's products. Posted from 10:00." : "Needs BALLYLIFE_FEED_URL (the address of the Ballylife product list) in the server settings first."}
              value={status.data.auto.products} ready={ready} disabled={!status.data.productFeed} onSave={(a) => saveAuto("products", a)} />
          </div>
        </section>)}

      <section aria-label="Recent posts">
        <h2 className="mb-2 text-sm font-bold text-fg">Recent posts</h2>
        <Status load={posts}>{({ posts: list }) => list.length === 0 ? <p className="text-sm text-fg-muted">Nothing has been posted yet.</p> : (
          <ul className="space-y-2">{list.map((p) => { const st = STATE[p.status] ?? STATE.failed; return (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-fg-muted">{p.kind}{p.auto ? " · automatic" : ""} · {p.status === "scheduled" ? `at ${when(p.scheduledAt)}` : when(p.scheduledAt)} · {p.createdBy}</span>
                <span className="ml-auto flex gap-2">
                  {(p.status === "failed" || p.status === "partial") && <button type="button" onClick={() => act(p, "retry")} className="inline-flex items-center gap-1 text-xs font-bold underline"><RotateCw className="h-3 w-3" /> Try again</button>}
                  {p.status === "scheduled" && <button type="button" onClick={() => act(p, "cancel")} className="inline-flex items-center gap-1 text-xs font-bold underline"><XIcon className="h-3 w-3" /> Cancel</button>}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg">{p.text}</p>
              {p.link && <p className="truncate text-xs text-fg-muted">{p.link}</p>}
              <ul className="mt-2 flex flex-wrap gap-2 text-[11px]">{p.networks.map((n) => { const r = p.results[n]; return (
                <li key={n} className="rounded-full px-2 py-0.5" style={r?.ok ? { background: "#DCFCE7", color: "#166534" } : r ? { background: "#FEE2E2", color: "#991B1B" } : { background: "#F1F5F9", color: "#475569" }} title={r?.error}>
                  {NETS.find((x) => x.key === n)!.label}: {r?.ok ? "posted" : r ? `failed. ${r.error}` : "waiting"}</li>); })}</ul>
            </li>); })}</ul>)}</Status>
      </section>
    </div>
  );
}

function AutoCard({ icon, title, text, value, ready, onSave, disabled }: { icon: React.ReactNode; title: string; text: string; value: Auto; ready: Record<Network, boolean>; onSave: (a: Auto) => void; disabled?: boolean }) {
  const [a, setA] = useState<Auto>(value);
  const toggle = (n: Network) => setA({ ...a, networks: a.networks.includes(n) ? a.networks.filter((x) => x !== n) : [...a.networks, n] });
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-fg">{icon} {title}</p>
      <p className="mt-1 text-xs text-fg-muted">{text}</p>
      <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-fg"><input type="checkbox" aria-label={`${title} on`} disabled={disabled} checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} /> Switched on</label>
      <div className="mt-2 flex flex-wrap gap-2">{NETS.map((n) => <label key={n.key} className={`inline-flex items-center gap-1.5 text-xs ${ready[n.key] ? "text-fg" : "text-fg-subtle opacity-60"}`}><input type="checkbox" aria-label={`${title}: ${n.label}`} disabled={!ready[n.key] || disabled} checked={a.networks.includes(n.key)} onChange={() => toggle(n.key)} /> {n.label}</label>)}</div>
      <button type="button" disabled={disabled} onClick={() => onSave(a)} className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: COLOR }}>Save</button>
    </div>
  );
}
