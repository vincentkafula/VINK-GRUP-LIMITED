import { useEffect, useRef, useState, type DragEvent } from "react";
import { Paperclip, Download, X, AlertTriangle, FileText, ShieldCheck, ShieldAlert, Eye } from "lucide-react";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";

/**
 * Files in department mail: the attachments of a message (download), and the files a person adds to an email they are writing (upload, then send).
 * The limits are the server's (services/mailFiles.ts), repeated here so a person is told before a big file is uploaded.
 */
export interface MailFile { id: string; filename: string; contentType: string; size: number; status: string; risky: boolean; /** clean | infected | suspicious | unscanned */ scan: string; scanDetail: string | null; contentId: string | null }
const MB = 1024 * 1024;
export const LIMITS = { file: 50 * MB, files: 5, total: 60 * MB, attach: 15 * MB };
/** Pictures the panel will show: the common safe formats, not too big, and not infected. (SVG is left out: it can carry script.) */
export const MAX_INLINE_IMAGE = 5 * MB;
export const isPreviewableImage = (f: Pick<MailFile, "contentType" | "size" | "scan" | "status">) => /^image\/(png|jpe?g|gif|webp)$/i.test(f.contentType) && f.size <= MAX_INLINE_IMAGE && f.scan !== "infected" && f.status !== "toolarge";

export const sizeText = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

/** What the virus check found, in a few words. Nothing is shown for a file nobody has checked yet, except a quiet note. */
export function ScanBadge({ file }: { file: Pick<MailFile, "scan" | "scanDetail"> }) {
  if (file.scan === "infected") return <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold" style={{ color: "#DC2626" }}><ShieldAlert className="w-3 h-3" /> Blocked: {file.scanDetail ?? "virus found"}</span>;
  if (file.scan === "suspicious") return <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold" style={{ color: "#B45309" }}><ShieldAlert className="w-3 h-3" /> Suspicious: {file.scanDetail ?? "be careful"}</span>;
  if (file.scan === "clean") return <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold" style={{ color: "#047857" }}><ShieldCheck className="w-3 h-3" /> Checked, no virus found</span>;
  return <span className="shrink-0 text-[10px] text-fg-muted">not checked by an antivirus</span>;
}

/** Files being added to an email: uploaded one by one, kept privately on the server until the email is sent. */
export function useAttachments() {
  const [files, setFiles] = useState<MailFile[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const total = files.reduce((n, f) => n + f.size, 0);

  const add = async (list: FileList | File[]) => {
    setError("");
    const incoming = [...list];
    if (files.length + incoming.length > LIMITS.files) { setError(`You can attach up to ${LIMITS.files} files to one email.`); return; }
    if (total + incoming.reduce((n, f) => n + f.size, 0) > LIMITS.total) { setError(`The files together can be up to ${sizeText(LIMITS.total)}.`); return; }
    for (const f of incoming) {
      if (f.size === 0) { setError(`${f.name} is empty.`); continue; }
      if (f.size > LIMITS.file) { setError(`${f.name} is larger than ${sizeText(LIMITS.file)}.`); continue; }
      setBusy((n) => n + 1);
      try {
        const res = await authFetch(`${API_BASE}/api/mail/uploads?name=${encodeURIComponent(f.name)}&type=${encodeURIComponent(f.type || "application/octet-stream")}`,
          { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: f });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) setError(body.error ?? `${f.name} could not be uploaded.`);
        else setFiles((cur) => [...cur, body.file as MailFile]);
      } catch { setError(`${f.name} could not be uploaded. Please try again.`); }
      finally { setBusy((n) => n - 1); }
    }
  };
  const remove = async (id: string) => {
    setFiles((cur) => cur.filter((f) => f.id !== id));
    try { await authFetch(`${API_BASE}/api/mail/uploads/${id}`, { method: "DELETE" }); } catch { /* it is thrown away after a day anyway */ }
  };
  const clear = () => { setFiles([]); setError(""); };
  return { files, busy, error, total, add, remove, clear, ids: files.map((f) => f.id) };
}
export type Attachments = ReturnType<typeof useAttachments>;

/** "Attach files": a button and a drop area, the files added so far, and what will happen if they are big. */
export function AttachPicker({ att }: { att: Attachments }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void att.add(e.dataTransfer.files); };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} className="rounded-lg p-2.5 space-y-2" style={{ border: `1px dashed ${over ? "#8B0000" : "var(--vk-line)"}`, background: over ? "rgba(139,0,0,0.04)" : "transparent" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border border-line text-fg hover:bg-surface-2"><Paperclip className="w-3.5 h-3.5" /> Attach files</button>
        <input ref={input} type="file" multiple aria-label="Attach files" className="hidden" onChange={(e) => { if (e.target.files?.length) void att.add(e.target.files); e.target.value = ""; }} />
        <span className="text-[11px] text-fg-muted">or drop them here · up to {LIMITS.files} files, {sizeText(LIMITS.file)} each</span>
        {att.busy > 0 && <span className="text-[11px] font-semibold text-fg-muted" role="status">Uploading…</span>}
      </div>
      {att.files.length > 0 && (
        <ul className="space-y-1">{att.files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-xs rounded-md px-2 py-1" style={{ background: "var(--vk-bg)" }}>
            <FileText className="w-3.5 h-3.5 shrink-0 text-fg-muted" />
            <span className="truncate text-fg font-medium">{f.filename}</span><span className="text-fg-muted shrink-0">{sizeText(f.size)}</span>
            {f.risky && <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold" style={{ color: "#B45309" }}><AlertTriangle className="w-3 h-3" /> can run on a computer</span>}
            <ScanBadge file={f} />
            <button type="button" onClick={() => void att.remove(f.id)} aria-label={`Remove ${f.filename}`} className="ml-auto p-0.5 rounded hover:bg-surface-2"><X className="w-3.5 h-3.5" /></button>
          </li>))}</ul>)}
      {att.total > LIMITS.attach && <p className="text-[11px]" style={{ color: "#B45309" }}>These files are over {sizeText(LIMITS.attach)} together, so they are sent as download links (valid for 7 days) instead of attachments.</p>}
      {att.error && <p role="alert" className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>{att.error}</p>}
    </div>
  );
}

/** Downloads a file through the signed-in session and hands it to the browser as a download. */
async function downloadFile(f: MailFile): Promise<string> {
  if (f.risky && !window.confirm(`"${f.filename}" is a type of file that can run on a computer. Only open it if you know and trust where it came from. Download it?`)) return "";
  try {
    const res = await authFetch(`${API_BASE}/api/mail/files/${f.id}`);
    if (!res.ok) { const body = await res.json().catch(() => ({})); return body.error ?? `The file could not be downloaded (${res.status}).`; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "";
  } catch { return "We could not reach the server. Please try again."; }
}

/** The attachments of a message, each with a Download button. */
export function AttachmentList({ files, label = "Attachments" }: { files: MailFile[] | undefined; label?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => () => { Object.values(previews).forEach((u) => URL.revokeObjectURL(u)); }, [previews]);
  if (!files || files.length === 0) return null;
  const preview = async (f: MailFile) => {
    setBusy(f.id); setError("");
    try {
      const res = await authFetch(`${API_BASE}/api/mail/files/${f.id}`);
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body.error ?? `The picture could not be loaded (${res.status}).`); }
      else { const url = URL.createObjectURL(new Blob([await res.blob()], { type: f.contentType })); setPreviews((cur) => ({ ...cur, [f.id]: url })); }
    } catch { setError("We could not reach the server. Please try again."); }
    setBusy("");
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-fg flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> {label} ({files.length})</p>
      <ul className="space-y-1">{files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
          <FileText className="w-4 h-4 shrink-0 text-fg-muted" />
          <span className="truncate text-fg font-medium">{f.filename}</span><span className="text-fg-muted shrink-0">{sizeText(f.size)}</span>
          {f.risky && <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold" style={{ color: "#B45309" }}><AlertTriangle className="w-3 h-3" /> can run on a computer</span>}
          <ScanBadge file={f} />
          {isPreviewableImage(f) && !previews[f.id] && <button type="button" disabled={busy === f.id} onClick={() => void preview(f)} aria-label={`Preview ${f.filename}`} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md font-bold border border-line text-fg hover:bg-surface-2 disabled:opacity-50"><Eye className="w-3.5 h-3.5" /> Preview</button>}
          {f.status === "toolarge"
            ? <span className="ml-auto text-[10px] text-fg-muted">too large to keep</span>
            : f.scan === "infected" ? null
            : <button type="button" disabled={busy === f.id} onClick={async () => { setBusy(f.id); setError(""); setError(await downloadFile(f)); setBusy(""); }} aria-label={`Download ${f.filename}`}
                className={`${isPreviewableImage(f) && !previews[f.id] ? "" : "ml-auto "}inline-flex items-center gap-1 px-2 py-1 rounded-md font-bold border border-line text-fg hover:bg-surface-2 disabled:opacity-50`}><Download className="w-3.5 h-3.5" /> {busy === f.id ? "Downloading…" : "Download"}</button>}
        </li>))}</ul>
      {files.filter((f) => previews[f.id]).map((f) => <img key={f.id} src={previews[f.id]} alt={f.filename} className="max-h-64 max-w-full rounded-lg border border-line" />)}
      {error && <p role="alert" className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}
