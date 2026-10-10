/**
 * Searching department mail with the operators people know from Gmail:
 *   from:pam   to:sales   subject:invoice   label:urgent   has:attachment   is:starred   is:open | answered | closed   is:web | email
 *   after:2026-10-01   before:2026-10-31   "a quoted phrase"   -word (leave out)
 * Anything else is a word that must appear in the sender, subject or message text. All matching is case-insensitive.
 */
export interface Search {
  terms: string[]; exclude: string[]; from: string[]; to: string[]; subject: string[]; label: string[];
  hasAttachment: boolean; is: string[]; after: number | null; before: number | null;
}
export interface Searchable { fromName: string; fromEmail: string; subject: string; text: string; at: string; status: string; starred: boolean; kind: string; hasAttachment: boolean; /** Names of the labels on the message. */ labels: string[] }

const IS_VALUES = new Set(["starred", "open", "unread", "answered", "closed", "web", "email"]);

/** "Re: Fwd: Price list" and "price list" are the same conversation. */
export const normalizeSubject = (s: string) => s.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();

export function parseSearch(q: string): Search {
  const s: Search = { terms: [], exclude: [], from: [], to: [], subject: [], label: [], hasAttachment: false, is: [], after: null, before: null };
  const tokens = [...q.slice(0, 300).matchAll(/(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g)];
  for (const m of tokens) {
    const neg = m[1] === "-", op = m[2]?.toLowerCase(), val = (m[3] ?? m[4] ?? "").trim().toLowerCase();
    if (!val) continue;
    if (op === "from") s.from.push(val);
    else if (op === "to") s.to.push(val);
    else if (op === "subject") s.subject.push(val);
    else if (op === "label") s.label.push(val);
    else if (op === "has") { if (val === "attachment" || val === "attachments") s.hasAttachment = true; }
    else if (op === "is") { if (IS_VALUES.has(val)) s.is.push(val); }
    else if (op === "after" || op === "before") {
      const t = /^\d{4}-\d{2}-\d{2}$/.test(val) ? Date.parse(`${val}T00:00:00Z`) : NaN;
      if (!Number.isNaN(t)) { if (op === "after") s.after = t; else s.before = t; }
    } else {
      const word = op ? `${op}:${val}` : val;                       // an unknown operator is just text
      (neg ? s.exclude : s.terms).push(word);
    }
  }
  return s;
}

export function matchesSearch(s: Search, m: Searchable, toAddr = ""): boolean {
  const who = `${m.fromName} ${m.fromEmail}`.toLowerCase(), subject = m.subject.toLowerCase(), all = `${who} ${subject} ${m.text}`.toLowerCase();
  const at = Date.parse(m.at);
  if (s.from.some((x) => !who.includes(x))) return false;
  if (s.to.some((x) => !toAddr.toLowerCase().includes(x))) return false;
  if (s.subject.some((x) => !subject.includes(x))) return false;
  if (s.label.some((x) => !m.labels.some((l) => l.toLowerCase().includes(x)))) return false;
  if (s.hasAttachment && !m.hasAttachment) return false;
  for (const flag of s.is) {
    if (flag === "starred" && !m.starred) return false;
    if ((flag === "open" || flag === "unread") && m.status !== "open") return false;
    if ((flag === "answered" || flag === "closed") && m.status !== flag) return false;
    if ((flag === "web" || flag === "email") && m.kind !== flag) return false;
  }
  if (s.after !== null && !(at >= s.after)) return false;
  if (s.before !== null && !(at < s.before)) return false;
  if (s.terms.some((x) => !all.includes(x))) return false;
  if (s.exclude.some((x) => all.includes(x))) return false;
  return true;
}

export const isEmptySearch = (s: Search) => !s.terms.length && !s.exclude.length && !s.from.length && !s.to.length && !s.subject.length && !s.label.length && !s.hasAttachment && !s.is.length && s.after === null && s.before === null;
