import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon, RemoveFormatting } from "lucide-react";

/**
 * The rich-text box for writing an email: bold, italic, underline, bullet and numbered lists, links, and "clear formatting". It keeps only what an email needs:
 * everything typed or pasted is cleaned (DOMPurify) here, and again on the server before anything is stored or sent.
 * The value is HTML; an empty box is "".
 */
const TAGS = ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "a", "blockquote", "h2", "h3", "hr"];
export const cleanHtml = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ["href", "target", "rel"], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i });

/** True when there is no text in the HTML (a box that only holds line breaks counts as empty). */
export const isEmptyHtml = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent!.replace(/ /g, " ").trim() === ""; };

/** A web, mail or phone address for a link, or "" if it is anything else. A bare "vink.co.za" is taken as https. */
export function linkAddress(raw: string): string {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(t)) return `mailto:${t}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return "";
}

export interface EditorHandle { insertHtml: (html: string) => void; setHtml: (html: string) => void; focus: () => void }

export const MailEditor = forwardRef<EditorHandle, { value: string; onChange: (html: string) => void; ariaLabel: string; placeholder?: string; minHeight?: number }>(function MailEditor({ value, onChange, ariaLabel, placeholder, minHeight = 150 }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  const emit = () => { const html = box.current ? cleanHtml(box.current.innerHTML) : ""; last.current = isEmptyHtml(html) ? "" : html; onChange(last.current); };

  // the box is filled once, and again only when the value is changed from outside (a template, a draft), never while the person is typing
  useEffect(() => { if (box.current && value !== last.current) { box.current.innerHTML = cleanHtml(value); last.current = value; } }, [value]);
  useEffect(() => { if (box.current) box.current.innerHTML = cleanHtml(value); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  const exec = (cmd: string, arg?: string) => { box.current?.focus(); document.execCommand?.(cmd, false, arg); emit(); };
  useImperativeHandle(ref, () => ({
    insertHtml: (html) => { box.current?.focus(); if (document.execCommand) document.execCommand("insertHTML", false, cleanHtml(html)); else if (box.current) box.current.innerHTML += cleanHtml(html); emit(); },
    setHtml: (html) => { if (box.current) { box.current.innerHTML = cleanHtml(html); emit(); } },
    focus: () => box.current?.focus(),
  }));

  const addLink = () => {
    const raw = window.prompt("Link address (for example https://www.vink.co.za, or an email address)", "https://");
    if (raw === null) return;
    const href = linkAddress(raw);
    if (!href) { window.alert("That is not a web, email or phone address."); return; }
    exec("createLink", href);
    box.current?.querySelectorAll("a").forEach((a) => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); });
    emit();
  };
  const tool = (label: string, icon: React.ReactNode, run: () => void) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={run} className="p-1.5 rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">{icon}</button>
  );
  const empty = isEmptyHtml(value);

  return (
    <div className="rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-[#8B0000]/30">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 border-b border-line px-1.5 py-1">
        {tool("Bold", <Bold className="w-4 h-4" />, () => exec("bold"))}
        {tool("Italic", <Italic className="w-4 h-4" />, () => exec("italic"))}
        {tool("Underline", <Underline className="w-4 h-4" />, () => exec("underline"))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {tool("Bulleted list", <List className="w-4 h-4" />, () => exec("insertUnorderedList"))}
        {tool("Numbered list", <ListOrdered className="w-4 h-4" />, () => exec("insertOrderedList"))}
        {tool("Add link", <LinkIcon className="w-4 h-4" />, addLink)}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {tool("Clear formatting", <RemoveFormatting className="w-4 h-4" />, () => exec("removeFormat"))}
      </div>
      <div className="relative">
        {empty && placeholder && <span className="pointer-events-none absolute left-3 top-2 text-sm text-fg-muted">{placeholder}</span>}
        <div ref={box} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={ariaLabel} spellCheck
          onInput={emit} onBlur={emit}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData("text/html"), text = e.clipboardData.getData("text/plain");
            const clean = html ? cleanHtml(html) : cleanHtml(text.split(/\n/).map((l) => `<div>${l.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!) || "<br>"}</div>`).join(""));
            if (document.execCommand) document.execCommand("insertHTML", false, clean); else if (box.current) box.current.innerHTML += clean;
            emit();
          }}
          className="px-3 py-2 text-sm text-fg outline-none overflow-y-auto [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_a]:text-[#8B0000]" style={{ minHeight, maxHeight: 420 }} />
      </div>
    </div>
  );
});
