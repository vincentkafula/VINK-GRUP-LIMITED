import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import type { MailFile } from "./MailAttachments";

/** Types and the small client shared by the Department mail screens (MailPanel, MailMessage, MailCompose, MailSettings). */
export interface Dept { key: string; name: string; address: string; open: number; drafts?: number; scheduled?: number }
export interface Label { id: string; name: string; color: string }
export interface Item { kind: "web" | "email"; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string; starred?: boolean; folder?: string; snoozedUntil?: string | null; labels?: Label[]; spamReason?: string | null }
export interface Draft { id: string; department: string; to: string; subject: string; body: string; bodyHtml?: string | null; replyKind: "web" | "email" | null; replyId: string | null; attachments: MailFile[]; updatedAt: string }
export interface Detail extends Item {
  text: string; html?: string | null; attachments?: MailFile[];
  thread?: { kind: "web" | "email"; id: string; subject: string; preview: string; at: string }[]; draft?: Draft | null;
  replies: { id: string; to: string; subject: string; body: string; bodyHtml?: string | null; status: string; by: string; at: string; attachments?: MailFile[] }[];
}
export interface Template { id: string; department: string; name: string; subject: string; bodyHtml: string }
export interface Scheduled { id: string; department: string; to: string; subject: string; preview: string; sendAt: string; status: string; error: string | null; by: string; replyKind: "web" | "email" | null; replyId: string | null; attachments: number }
export type Box = "inbox" | "starred" | "snoozed" | "drafts" | "scheduled" | "sent" | "spam" | "trash";
export type Call = ReturnType<typeof mailClient>;

/** The same small client the portals use (see portal/ui.tsx), pointed at /api/mail. */
export function mailClient() {
  const base = `${API_BASE}/api/mail`;
  return async function call<T = Record<string, never>>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}

/** The mailbox colours: a navy sidebar, blue for the main action and the open box, white and soft blue-grey elsewhere. */
export const COLOR = "#2F6BFF";
export const NAVY = "#0F2A52";
export const NAVY_ACTIVE = "#24509E";
const AVATARS = ["#2F6BFF", "#10B981", "#8B5CF6", "#EF4444", "#F59E0B", "#06B6D4", "#EC4899", "#64748B"];
/** The same colour for the same person, every time. */
export const avatarColor = (name: string) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATARS[h % AVATARS.length]; };
export const initialOf = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();

/** The time of a message in a list: the clock time today, "Yesterday", the weekday this week, otherwise the date. (South African time.) */
export function listTime(iso: string, now: Date = new Date()): string {
  const tz = "Africa/Johannesburg", day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const d = new Date(iso);
  if (day(d) === day(now)) return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (day(d) === day(new Date(now.getTime() - 86400_000))) return "Yesterday";
  const age = (now.getTime() - d.getTime()) / 86400_000;
  if (age > 0 && age < 6) return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  const sameYear = d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric" }) === now.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric" });
  return d.toLocaleDateString("en-ZA", { timeZone: tz, day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
export const STATUS_LABEL: Record<string, string> = { open: "Open", answered: "Answered", closed: "Closed", sent: "Sent", failed: "Not sent", pending: "Waiting", sending: "Sending" };

/** Plain text to HTML paragraphs (an old draft or template that was saved as text). */
export const textToHtml = (t: string) => t.split(/\n/).map((l) => `<div>${l.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!) || "<br>"}</div>`).join("");

/** Ready-made times for Snooze and Schedule send: in an hour, this afternoon, tomorrow morning, next Monday morning. */
export function quickTimes(now: Date): { label: string; at: Date }[] {
  const at = (d: Date, h: number) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const out: { label: string; at: Date }[] = [{ label: "In 1 hour", at: new Date(now.getTime() + 3600_000) }];
  const afternoon = at(now, 16); if (afternoon.getTime() - now.getTime() > 2 * 3600_000) out.push({ label: "This afternoon (16:00)", at: afternoon });
  const tomorrow = at(new Date(now.getTime() + 86400_000), 8); out.push({ label: "Tomorrow morning (08:00)", at: tomorrow });
  const monday = new Date(now); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); out.push({ label: "Monday morning (08:00)", at: at(monday, 8) });
  return out;
}
export const whenLong = (d: Date) => d.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
/** A value for <input type="datetime-local"> in the person's own time. */
export const localInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Desktop notifications of new mail: on only when the person has switched them on here and the browser has allowed them. */
export const NOTIFY_KEY = "vink.mail.notify";
export const notificationsOn = () => { try { return localStorage.getItem(NOTIFY_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { return false; } };
/** Tells the person when the number of waiting messages has gone up since the last look. Returns whether it notified. */
export function notifyIfMore(before: number | null, after: number): boolean {
  if (before === null || after <= before || !notificationsOn()) return false;
  const n = after - before;
  try { new Notification("VINK department mail", { body: n === 1 ? "1 new message is waiting." : `${n} new messages are waiting.`, tag: "vink-mail" }); return true; } catch { return false; }
}
