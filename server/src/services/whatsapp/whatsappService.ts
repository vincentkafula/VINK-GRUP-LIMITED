import type { Db } from "../../portal/common.js";
import { saDay, isUniqueViolation } from "../../portal/common.js";
import { publicDepartments, departmentByKey } from "../../config/departments.js";
import { waReady, type WaClient, type WaConfig } from "./cloud.js";

/**
 * Customer chat on WhatsApp.
 *
 * A person messages VINK's WhatsApp number (or taps the Chat on WhatsApp button or scans the QR code on the website). The first message gets a menu of the departments;
 * the number they reply with chooses the department, and from then on the chat is in that department's queue in the Management Panel, where the people who manage the
 * department answer. A message outside office hours (Monday to Friday 08:00 to 17:00, South African time) gets one polite "we are away" reply a day.
 *
 * WhatsApp lets a business write freely only for 24 hours after the customer's last message. After that a reply must start from an approved message template
 * (WHATSAPP_REOPEN_TEMPLATE); without one the panel says the window has closed. Alerts to customers (receipts, card alerts) are sent as templates and only to people who
 * have opted in by sending START; STOP turns them off.
 */
export type WaStatus = "open" | "answered" | "closed";
export interface WaConversation { id: string; waId: string; name: string; department: string; status: WaStatus; optedIn: boolean; lastAt: string; lastPreview: string; windowOpen: boolean; waiting: boolean }
export interface WaMessage { id: string; direction: "in" | "out"; body: string; kind: string; status: string; error: string | null; by: string; at: string }
export interface WaUser { userId: string; role: string; username?: string }
export type WaOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
export interface DeptRef { key: string; name: string }

const WINDOW_MS = 24 * 3_600_000;
const bad = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const preview = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160);

export const inOfficeHours = (d: Date) => { const sa = new Date(d.getTime() + 2 * 3_600_000); const day = sa.getUTCDay(), h = sa.getUTCHours(); return day >= 1 && day <= 5 && h >= 8 && h < 17; };

export function createWhatsAppService(deps: { db: Db; wa: WaClient; config: WaConfig; departmentsFor: (u: { userId: string; role: string }) => Promise<DeptRef[]>; now?: () => Date }) {
  const { db, wa, config } = deps, now = deps.now ?? (() => new Date());
  const menuDepartments = () => publicDepartments();

  const toConv = (r: Record<string, unknown>): WaConversation => {
    const last = r.last_inbound_at ? new Date(String(r.last_inbound_at)).getTime() : 0;
    return { id: String(r.id), waId: String(r.wa_id), name: String(r.name), department: r.department ? String(r.department) : "unrouted", status: String(r.status) as WaStatus, optedIn: r.opted_in === true || r.opted_in === "t",
      lastAt: new Date(String(r.last_at)).toISOString(), lastPreview: String(r.last_preview), windowOpen: last > 0 && now().getTime() - last < WINDOW_MS, waiting: String(r.status) === "open" };
  };

  /** Records a message we sent (or tried to send) in a conversation. */
  async function record(convId: string, dir: "in" | "out", body: string, o: { kind?: string; waId?: string | null; status?: string; error?: string | null; by?: string | null; byName?: string; at?: Date } = {}): Promise<boolean> {
    try {
      await db.query(`INSERT INTO wa_messages (id, conversation_id, direction, body, kind, wa_message_id, status, error, by_user, by_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [crypto.randomUUID(), convId, dir, body.slice(0, 4096), o.kind ?? "text", o.waId ?? null, o.status ?? (dir === "in" ? "received" : "sent"), o.error ?? null, o.by ?? null, o.byName ?? (dir === "out" ? "VINK" : ""), o.at ?? now()]);
      return true;
    } catch (e) { if (isUniqueViolation(e)) return false; throw e; }
  }
  /** An automatic reply: sent, and kept in the chat so staff can see what the customer was told. */
  async function autoSay(conv: { id: string; waId: string }, body: string): Promise<void> {
    const r = await wa.sendText(conv.waId, body);
    await record(conv.id, "out", body, { waId: r.ok ? r.id : null, status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error, byName: "VINK (automatic)" });
  }

  const menuText = () => {
    const list = menuDepartments().map((d, i) => `${i + 1}. ${d.name}`).join("\n");
    return `Welcome to VINK.\nReply with a number to choose who you would like to chat with:\n\n${list}\n\nReply START to get payment and card alerts here on WhatsApp, or STOP to turn them off. Reply MENU at any time to choose again.\n\nVINK is not yet in full operation; everything is a preview until launch.`;
  };

  /** One message from a customer. Returns false for a message already seen (Meta sends some twice). */
  async function onInbound(a: { waId: string; name: string; body: string; kind: string; waMessageId: string; at: Date }): Promise<boolean> {
    const waId = a.waId.replace(/\D+/g, ""); if (!waId) return false;
    let row = (await db.query(`SELECT * FROM wa_conversations WHERE wa_id = $1`, [waId])).rows[0];
    if (!row) {
      const id = crypto.randomUUID();
      await db.query(`INSERT INTO wa_conversations (id, wa_id, name, state, status, last_inbound_at, last_at, last_preview, created_at) VALUES ($1,$2,$3,'menu','open',$4,$4,$5,$6)`, [id, waId, a.name.slice(0, 80), a.at, preview(a.body), now()]);
      row = (await db.query(`SELECT * FROM wa_conversations WHERE id = $1`, [id])).rows[0];
    }
    const fresh = await record(String(row.id), "in", a.body, { kind: a.kind, waId: a.waMessageId, at: a.at });
    if (!fresh) return false;
    await db.query(`UPDATE wa_conversations SET last_inbound_at = $2, last_at = $2, last_preview = $3, name = CASE WHEN $4 <> '' THEN $4 ELSE name END, status = 'open' WHERE id = $1`, [row.id, a.at, preview(a.body), a.name.slice(0, 80)]);
    void wa.markRead(a.waMessageId);
    const conv = { id: String(row.id), waId };
    const text = a.body.trim();

    if (/^stop$/i.test(text)) { await db.query(`UPDATE wa_conversations SET opted_in = false WHERE id = $1`, [conv.id]); await autoSay(conv, "You will no longer get alerts from VINK on WhatsApp. Reply START to turn them on again."); return true; }
    if (/^start$/i.test(text)) { await db.query(`UPDATE wa_conversations SET opted_in = true WHERE id = $1`, [conv.id]); await autoSay(conv, "You will now get payment and card alerts from VINK on WhatsApp. Reply STOP at any time to turn them off."); return true; }
    if (/^(menu|0)$/i.test(text)) { await db.query(`UPDATE wa_conversations SET department = NULL, state = 'menu' WHERE id = $1`, [conv.id]); await autoSay(conv, menuText()); return true; }

    if (!row.department) {
      const n = /^\d{1,2}$/.test(text) ? Number(text) : 0, picked = n >= 1 ? menuDepartments()[n - 1] : undefined;
      if (!picked) { await autoSay(conv, menuText()); return true; }
      await db.query(`UPDATE wa_conversations SET department = $2, state = 'active' WHERE id = $1`, [conv.id, picked.key]);
      await autoSay(conv, `You are now chatting with ${picked.name}. Please tell us how we can help and someone will reply here.${inOfficeHours(now()) ? "" : "\n\nWe are away right now. Our team answers Monday to Friday, 08:00 to 17:00 (South African time), and will reply when they are back."}`);
      return true;
    }
    if (!inOfficeHours(now()) && row.closed_notice_on !== saDay(now())) {
      await db.query(`UPDATE wa_conversations SET closed_notice_on = $2 WHERE id = $1`, [conv.id, saDay(now())]);
      await autoSay(conv, "Thanks for your message. We are away right now. Our team answers Monday to Friday, 08:00 to 17:00 (South African time), and will reply when they are back.");
    }
    return true;
  }

  /** Everything Meta posts to the webhook: new messages, and delivery updates for the ones we sent. */
  async function handleWebhook(payload: unknown): Promise<{ messages: number; statuses: number }> {
    let messages = 0, statuses = 0;
    const entries = Array.isArray((payload as { entry?: unknown[] })?.entry) ? (payload as { entry: unknown[] }).entry : [];
    for (const e of entries) for (const ch of (Array.isArray((e as { changes?: unknown[] })?.changes) ? (e as { changes: unknown[] }).changes : [])) {
      const v = ((ch as { value?: Record<string, unknown> })?.value ?? {}) as { contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: Record<string, unknown>[]; statuses?: { id?: string; status?: string; errors?: { title?: string }[] }[] };
      const names = new Map((v.contacts ?? []).map((c) => [String(c.wa_id ?? ""), String(c.profile?.name ?? "")]));
      for (const m of v.messages ?? []) {
        const type = String(m.type ?? "text"), from = String(m.from ?? "");
        const body = type === "text" ? String((m.text as { body?: string })?.body ?? "")
          : type === "button" ? String((m.button as { text?: string })?.text ?? "")
          : type === "interactive" ? String(((m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } })?.button_reply?.title ?? (m.interactive as { list_reply?: { title?: string } })?.list_reply?.title) ?? "")
          : `[${type === "image" || type === "audio" || type === "video" || type === "document" || type === "sticker" || type === "location" || type === "contacts" ? type : "message"} received: open WhatsApp to see it]`;
        if (!from || !body.trim()) continue;
        const at = new Date(Number(m.timestamp) * 1000);
        if (await onInbound({ waId: from, name: names.get(from) ?? "", body, kind: type, waMessageId: String(m.id ?? crypto.randomUUID()), at: Number.isNaN(at.getTime()) ? now() : at })) messages++;
      }
      for (const s of v.statuses ?? []) {
        if (!s.id || !s.status) continue; statuses++;
        await db.query(`UPDATE wa_messages SET status = $2, error = $3 WHERE wa_message_id = $1 AND direction = 'out'`, [s.id, s.status, s.status === "failed" ? String(s.errors?.[0]?.title ?? "Not delivered").slice(0, 200) : null]);
      }
    }
    return { messages, statuses };
  }

  // ── The people who answer ──────────────────────────────────────────────────

  async function allowed(user: WaUser, department?: string): Promise<DeptRef[] | null> {
    const own = await deps.departmentsFor(user);
    if (department && !own.some((d) => d.key === department)) return null;
    return department ? own.filter((d) => d.key === department) : own;
  }

  async function summary(user: WaUser): Promise<{ key: string; name: string; waiting: number }[]> {
    const out = [];
    for (const d of await deps.departmentsFor(user)) {
      const n = Number((await db.query(d.key === "unrouted" ? `SELECT COUNT(*) AS n FROM wa_conversations WHERE department IS NULL AND status = 'open'` : `SELECT COUNT(*) AS n FROM wa_conversations WHERE department = $1 AND status = 'open'`, d.key === "unrouted" ? [] : [d.key])).rows[0].n);
      out.push({ key: d.key, name: d.name, waiting: n });
    }
    return out;
  }

  async function list(user: WaUser, f: { department?: string; status?: string } = {}): Promise<WaOutcome<WaConversation[]>> {
    const depts = await allowed(user, f.department || undefined);
    if (!depts) return bad(403, "You do not manage this department's chats");
    const keys = depts.map((d) => d.key);
    const rows = (await db.query(`SELECT * FROM wa_conversations ORDER BY last_at DESC LIMIT 500`)).rows
      .filter((r: Record<string, unknown>) => keys.includes(r.department ? String(r.department) : "unrouted") && (!f.status || r.status === f.status));
    return { ok: true, value: rows.slice(0, 100).map(toConv) };
  }

  async function mine(user: WaUser, id: string): Promise<{ row: Record<string, unknown> } | { err: { ok: false; status: number; error: string } }> {
    const row = (await db.query(`SELECT * FROM wa_conversations WHERE id = $1`, [id])).rows[0];
    if (!row) return { err: bad(404, "No such chat") };
    if (!(await allowed(user, row.department ? String(row.department) : "unrouted"))) return { err: bad(403, "You do not manage this department's chats") };
    return { row };
  }

  async function get(user: WaUser, id: string): Promise<WaOutcome<{ conversation: WaConversation; messages: WaMessage[] }>> {
    const m = await mine(user, id); if ("err" in m) return m.err;
    const msgs = (await db.query(`SELECT * FROM wa_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 200`, [id])).rows.reverse().map((r: Record<string, unknown>): WaMessage => ({ id: String(r.id), direction: String(r.direction) as "in" | "out", body: String(r.body), kind: String(r.kind), status: String(r.status), error: r.error ? String(r.error) : null, by: String(r.by_name), at: new Date(String(r.created_at)).toISOString() }));
    return { ok: true, value: { conversation: toConv(m.row), messages: msgs } };
  }

  async function reply(user: WaUser, id: string, bodyIn: unknown): Promise<WaOutcome<{ status: string }>> {
    const m = await mine(user, id); if ("err" in m) return m.err;
    const body = typeof bodyIn === "string" ? bodyIn.trim() : ""; if (!body || body.length > 4000) return bad(400, "Write your reply (up to 4000 characters)");
    if (!waReady(config)) return bad(503, "WhatsApp is not set up yet");
    const conv = toConv(m.row); const by = user.username ?? "staff";
    let r;
    if (conv.windowOpen) r = await wa.sendText(conv.waId, body);
    else if (config.reopenTemplate) r = await wa.sendTemplate(conv.waId, config.reopenTemplate, config.reopenLanguage, [conv.name || "there"]);
    else return bad(409, "This customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template message now. Ask the administrator to set WHATSAPP_REOPEN_TEMPLATE.");
    await record(id, "out", conv.windowOpen ? body : `[Template ${config.reopenTemplate}] ${body}`, { waId: r.ok ? r.id : null, status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error, by: user.userId, byName: by });
    if (!r.ok) return bad(502, "The message could not be sent right now. Nothing was delivered; try again.");
    await db.query(`UPDATE wa_conversations SET status = 'answered', last_at = $2, last_preview = $3 WHERE id = $1`, [id, now(), preview(body)]);
    return { ok: true, value: { status: "answered" } };
  }

  async function setStatus(user: WaUser, id: string, status: unknown): Promise<WaOutcome<{ status: string }>> {
    if (status !== "open" && status !== "answered" && status !== "closed") return bad(400, "Choose open, answered or closed");
    const m = await mine(user, id); if ("err" in m) return m.err;
    await db.query(`UPDATE wa_conversations SET status = $2 WHERE id = $1`, [id, status]); return { ok: true, value: { status } };
  }

  /** Moves a chat to another department the person manages (or any department, for a Super Administrator). */
  async function transfer(user: WaUser, id: string, department: unknown): Promise<WaOutcome<{ department: string }>> {
    const m = await mine(user, id); if ("err" in m) return m.err;
    const dept = departmentByKey(String(department ?? "")); if (!dept) return bad(400, "Choose a department");
    if (!["owner", "superadmin"].includes(user.role) && !(await allowed(user, dept.key))) return bad(403, "You can move a chat only to a department you manage");
    await db.query(`UPDATE wa_conversations SET department = $2, state = 'active', status = 'open' WHERE id = $1`, [id, dept.key]);
    return { ok: true, value: { department: dept.key } };
  }

  /**
   * An alert to a customer from an approved template (a payment receipt, a card alert). Only for a person who has opted in by sending START; returns what happened.
   * Other server code calls this when it has something to tell a customer.
   */
  async function notify(a: { to: string; template: string; language?: string; params?: string[] }): Promise<WaOutcome<{ id: string }>> {
    const waId = a.to.replace(/\D+/g, "");
    const row = (await db.query(`SELECT * FROM wa_conversations WHERE wa_id = $1`, [waId])).rows[0];
    if (!row || !(row.opted_in === true || row.opted_in === "t")) return bad(409, "This customer has not opted in to WhatsApp alerts (they send START to our WhatsApp number)");
    if (!/^[a-z0-9_]{1,512}$/.test(a.template)) return bad(400, "That is not a valid template name");
    const r = await wa.sendTemplate(waId, a.template, a.language ?? "en", a.params ?? []);
    await record(String(row.id), "out", `[Template ${a.template}] ${(a.params ?? []).join(" | ")}`.slice(0, 500), { kind: "template", waId: r.ok ? r.id : null, status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error, byName: "VINK (alert)" });
    return r.ok ? { ok: true, value: { id: r.id } } : bad(502, r.error);
  }

  return { onInbound, handleWebhook, summary, list, get, reply, setStatus, transfer, notify, menuText };
}
export type WhatsAppService = ReturnType<typeof createWhatsAppService>;
