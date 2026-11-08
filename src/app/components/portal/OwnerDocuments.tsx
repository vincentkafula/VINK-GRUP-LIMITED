import { useState } from "react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls } from "./ui";
import { FileButton } from "./AssociationFinance";

/**
 * Attach a photo or PDF (docs/OWNER_DASHBOARD.md, slice C2): the letter of recommendation, membership papers, roadworthy and insurance certificates, licence copies.
 * Made for a phone on a poor connection: a big photo is made smaller on the phone BEFORE it is sent, and the file goes as it is, not wrapped in anything bigger. Files are stored encrypted, checked for viruses, and only the owner can read them. They are sent as downloads and never opened in the page.
 * Each file shows honestly whether an antivirus has checked it: "not checked" is not the same as "safe".
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
export const KIND_TEXT: Record<string, string> = { letter_of_recommendation: "Letter of recommendation", membership_certificate: "Membership certificate", membership_card: "Membership card", roadworthy: "Roadworthy certificate", insurance: "Insurance", operating_licence: "Operating licence", licence_disc: "Licence disc", driver_agreement: "Driver agreement", other: "Other" };
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024, SHRINK_ABOVE_BYTES = 1_200_000, SHRINK_TO_PIXELS = 1600;
const ACCEPT = "application/pdf,image/jpeg,image/png";
interface StoredFile { id: string; kind: string; filename: string; mime: string; sizeBytes: number; vehicleId: string | null; scanStatus: string; scanDetail: string | null; uploadedOn: string }
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Makes a big photo smaller before it is sent: the longest side to 1 600 pixels, as a JPEG. Anything else, or anything that cannot be shrunk here, is sent as it is. Never returns something bigger than it was given. */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file), scale = Math.min(1, SHRINK_TO_PIXELS / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d"); if (!ctx) return file; ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8)); if (!blob || blob.size >= file.size) return file; return new File([blob], file.name.replace(/\.[A-Za-z0-9]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export function DocumentFiles({ title, kinds, vehicleId, hint }: { title: string; kinds: string[]; vehicleId?: string; hint?: string }) {
  const path = `/files${vehicleId ? `?vehicleId=${vehicleId}` : ""}`, [load, reload] = useLoad<{ files: StoredFile[]; usage: { storageAvailable: boolean; files: number; maxFiles: number } }>(() => call(path), [path]);
  const [kind, setKind] = useState(kinds[0]), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [erasing, setErasing] = useState<string | null>(null);
  const send = async (picked: File | undefined) => {
    if (!picked) return; setMsg(null); if (!/^(application\/pdf|image\/(jpeg|png))$/.test(picked.type)) return setMsg({ ok: false, text: "Only PDF, JPEG or PNG files can be added." });
    setBusy(true);
    try {
      const f = await shrinkImage(picked); if (f.size > MAX_UPLOAD_BYTES) { setMsg({ ok: false, text: `That file is too large (${size(f.size)}). The most is 5 MB: take the photo again a little further away, or send a smaller file.` }); return; }
      const qs = new URLSearchParams({ filename: f.name, kind, ...(vehicleId ? { vehicleId } : {}) }), res = await authFetch(`${API_BASE}/api/portal/owner/files?${qs}`, { method: "POST", headers: { "Content-Type": f.type }, body: f }), b = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: b.error ?? `It could not be saved (${res.status}).` }); return; }
      setMsg({ ok: true, text: b.duplicate ? "You already have this file." : "Saved." }); reload();
    } catch { setMsg({ ok: false, text: "We could not reach the server. Check your connection and try again: a file needs a connection to be sent." }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-lg border border-line p-4 text-sm text-fg" aria-label={title}>
      <h4 className="text-xs font-bold uppercase text-fg-muted">{title}</h4>
      <Status load={load}>{({ files, usage }) => {
        const mine = files.filter((f) => kinds.includes(f.kind));
        return (
          <>
            {!usage.storageAvailable && <p role="alert" className="text-bad">Document storage is not switched on yet, so files cannot be added. The administrator needs to set it up.</p>}
            {mine.length === 0 ? <Empty>No files attached yet.</Empty> : (
              <ul className="space-y-2">{mine.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                  <span><b>{f.filename}</b> · {KIND_TEXT[f.kind] ?? f.kind} · {size(f.sizeBytes)} · added {f.uploadedOn} · {f.scanStatus === "clean" ? "Checked by an antivirus" : "Not checked by an antivirus"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <FileButton segment="owner" path={`/files/${f.id}`} filename={f.filename} label={`Download ${f.filename}`} />
                    {erasing === f.id ? <ActionButton small label={`Yes, erase ${f.filename}`} color="#C8102E" onRun={async () => { const r = await call(`/files/${f.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; setErasing(null); reload(); return undefined; }} /> : <button type="button" className="text-xs underline" onClick={() => setErasing(f.id)}>{`Delete ${f.filename}`}</button>}
                  </span>
                </li>))}</ul>)}
            {usage.storageAvailable && (
              <div className="space-y-2">
                {kinds.length > 1 && <label className="block"><span className="text-xs text-fg-muted">What is it?</span><select aria-label={`Kind of file for ${title}`} className={inputCls + " mt-1 w-60 py-3"} value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k} value={k}>{KIND_TEXT[k] ?? k}</option>)}</select></label>}
                <div className="flex flex-wrap gap-3">
                  <label className="px-4 py-3 rounded-lg text-sm font-bold text-white cursor-pointer" style={{ background: COLOR, opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Choose a file"}<input type="file" className="sr-only" aria-label={`Choose a file for ${title}`} accept={ACCEPT} disabled={busy} onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ""; }} /></label>
                  <label className="px-4 py-3 rounded-lg text-sm font-bold border border-line cursor-pointer">Take a photo<input type="file" className="sr-only" aria-label={`Take a photo for ${title}`} accept="image/*" capture="environment" disabled={busy} onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ""; }} /></label>
                </div>
                <p className="text-xs text-fg-subtle">PDF, JPEG or PNG, up to 5 MB. {hint ?? ""} Big photos are made smaller on your phone first, to save your data. Files are kept private and encrypted. A file needs a connection to be sent.</p>
              </div>)}
            {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-ok" : "text-bad"}>{msg.text}</p>}
          </>);
      }}</Status>
    </div>
  );
}
