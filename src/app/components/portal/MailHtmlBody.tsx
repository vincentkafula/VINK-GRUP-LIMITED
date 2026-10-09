import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ImageOff } from "lucide-react";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import { isPreviewableImage, type MailFile } from "./MailAttachments";

/**
 * An incoming email shown the way it was written, but safely. The HTML comes from the open internet, so it goes through four layers:
 *  1. DOMPurify removes scripts, forms, frames, objects, SVG, base/meta/link tags and every event handler;
 *  2. we then drop pictures from the internet (they are how senders learn that a message was opened) unless the person chooses to show them, replace cid: pictures
 *     with the files that came with the email, and strip url() from inline styles;
 *  3. the result is put in an iframe with sandbox (no scripts, no cookies, no access to the website) and no referrer;
 *  4. the page inside has its own Content-Security-Policy: nothing may load except pictures from this email (and from the internet only if allowed).
 */
const FORBID_TAGS = ["form", "input", "button", "select", "textarea", "option", "iframe", "frame", "frameset", "object", "embed", "applet", "link", "meta", "base", "script", "noscript", "svg", "math", "audio", "video", "source", "track", "canvas", "dialog", "template", "slot"];
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export interface EmailDocument { doc: string; blockedPictures: number }

/** Cleans an email's HTML and wraps it in the page that goes into the sandboxed frame. cid maps Content-IDs to blob: addresses of the email's own pictures. */
export function buildEmailDocument(html: string, opts: { cid?: Record<string, string>; allowRemotePictures?: boolean } = {}): EmailDocument {
  const cid = opts.cid ?? {};
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS, FORBID_ATTR: ["srcset", "ping", "formaction", "background", "poster"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, WHOLE_DOCUMENT: false, FORCE_BODY: true });
  const tpl = document.createElement("template"); tpl.innerHTML = clean;
  let blocked = 0;
  for (const img of Array.from(tpl.content.querySelectorAll("img"))) {
    const src = (img.getAttribute("src") ?? "").trim();
    const cidMatch = /^cid:(.+)$/i.exec(src);
    if (cidMatch) {
      const key = decodeURIComponent(cidMatch[1]).replace(/[<>\s]/g, "");
      if (cid[key]) { img.setAttribute("src", cid[key]); continue; }
      img.removeAttribute("src"); continue;
    }
    if (SAFE_DATA_IMAGE.test(src)) continue;
    if (/^https:\/\//i.test(src) && opts.allowRemotePictures) { img.setAttribute("referrerpolicy", "no-referrer"); continue; }
    if (/^(https?:)?\/\//i.test(src)) blocked++;
    img.removeAttribute("src");
    if (!img.getAttribute("alt")) img.setAttribute("alt", "[picture blocked]");
  }
  for (const el of Array.from(tpl.content.querySelectorAll("[style]"))) {
    const st = el.getAttribute("style") ?? "";
    if (/url\s*\(|expression\s*\(|@import|behavio(u)?r\s*:/i.test(st)) el.setAttribute("style", st.replace(/url\s*\([^)]*\)/gi, "none").replace(/expression\s*\([^)]*\)|@import[^;]*;?|behavio(u)?r\s*:[^;]*;?/gi, ""));
  }
  for (const st of Array.from(tpl.content.querySelectorAll("style"))) st.textContent = (st.textContent ?? "").replace(/@import[^;]*;?/gi, "").replace(/url\s*\([^)]*\)/gi, "none");
  for (const a of Array.from(tpl.content.querySelectorAll("a"))) {
    const href = (a.getAttribute("href") ?? "").trim();
    if (!/^(https?:|mailto:|tel:)/i.test(href)) a.removeAttribute("href");
    a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer nofollow");
  }
  const csp = `default-src 'none'; img-src blob: data:${opts.allowRemotePictures ? " https:" : ""}; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'`;
  const body = tpl.innerHTML;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank">`
    + `<style>html{background:#fff}body{margin:12px;font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#8B0000}</style></head><body>${body}</body></html>`;
  return { doc, blockedPictures: blocked };
}

/** Fetches the pictures that came with an email so cid: references can show them. Blob addresses are released when the message is closed. */
function useInlinePictures(files: MailFile[] | undefined): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = (files ?? []).filter((f) => f.contentId && isPreviewableImage(f)).map((f) => `${f.id}:${f.contentId}`).join("|");
  useEffect(() => {
    const made: string[] = []; let cancelled = false;
    const wanted = (files ?? []).filter((f) => f.contentId && isPreviewableImage(f));
    if (!wanted.length) { setMap({}); return; }
    void (async () => {
      const next: Record<string, string> = {};
      for (const f of wanted) {
        try {
          const res = await authFetch(`${API_BASE}/api/mail/files/${f.id}`);
          if (!res.ok) continue;
          const blob = await res.blob();
          const url = URL.createObjectURL(new Blob([blob], { type: f.contentType }));
          made.push(url); next[f.contentId!] = url;
        } catch { /* that picture simply does not show */ }
      }
      if (!cancelled) setMap(next);
    })();
    return () => { cancelled = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [key]);          // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

export function EmailHtml({ html, files }: { html: string; files?: MailFile[] }) {
  const cid = useInlinePictures(files);
  const [remote, setRemote] = useState(false);
  const built = useMemo(() => buildEmailDocument(html, { cid, allowRemotePictures: remote }), [html, cid, remote]);
  return (
    <div className="space-y-1.5">
      {built.blockedPictures > 0 && !remote && (
        <p className="flex items-center gap-2 text-[11px] rounded-md px-2.5 py-1.5" style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}>
          <ImageOff className="w-3.5 h-3.5 shrink-0" /> Pictures from the internet are blocked, because senders use them to see that you opened the email.
          <button type="button" onClick={() => setRemote(true)} className="ml-auto font-bold underline shrink-0">Show pictures</button>
        </p>)}
      <iframe title="Email message" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={built.doc} className="w-full rounded-lg" style={{ height: 420, background: "#fff", border: "1px solid var(--vk-line)", resize: "vertical" }} />
    </div>
  );
}
