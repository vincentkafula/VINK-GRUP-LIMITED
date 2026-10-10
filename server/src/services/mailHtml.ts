import sanitizeHtml from "sanitize-html";

/**
 * The text of an email that staff write in the rich-text editor. The browser sends HTML; the server never trusts it: it is cleaned here to a small set of tags
 * (paragraphs, bold, italic, underline, lists, links, quotes) before it is stored or sent, and a plain-text version is made for mail programs that show only text.
 */
export const MAX_HTML = 100_000;

export function cleanOutgoingHtml(html: unknown): string {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html.slice(0, MAX_HTML * 2), {
    allowedTags: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "a", "blockquote", "h2", "h3", "hr"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: { a: (_t, attribs) => ({ tagName: "a", attribs: { href: attribs.href ?? "", target: "_blank", rel: "noopener noreferrer" } }) },
  }).slice(0, MAX_HTML).trim();
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };

/** Plain text from (already cleaned) HTML: line breaks where blocks end, "- " for list items, links as "text (address)". */
export function htmlToText(html: string): string {
  return html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => { const t = label.replace(/<[^>]+>/g, "").trim(); return !t || t === href ? href : `${t} (${href})`; })
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|div|h2|h3|blockquote)>/gi, "\n").replace(/<\/(ul|ol)>/gi, "\n\n").replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => entities[m] ?? m)
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The message of a plain-text email shown as HTML (line breaks kept). */
export const textToHtml = (text: string) => `<p style="white-space:pre-wrap;margin:0 0 12px">${text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)}</p>`;
