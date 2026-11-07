import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay } from "./compliance.js";
import { createFinance } from "./finance.js";

/**
 * THE OWNER'S ASSOCIATION (docs/OWNER_DASHBOARD.md, slice B): what an owner sees of each association they belong to, built on the association's own records so there is one source of truth.
 *   profile     the association, the owner's membership status and card number, their standing, the routes on their licences, what they owe, and their membership documents
 *   statement   every charge and receipt, with a running balance, and what is still open
 *   receipts    the association's numbered receipts to this owner (never deleted: a voided one says so)
 *   claim       "I have paid": the owner tells the association what they paid, how and when. The association checks its own bank and CONFIRMS it, which issues a numbered receipt, or rejects it with a reason.
 * The platform holds no money here. A claim is a record, not a payment; nothing counts as paid until the association has confirmed it. An owner sees only their own account, and only for associations they are an active member of.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const METHODS = ["eft", "cash", "other"] as const;
export const MAX_CLAIM_CENTS = 10_000_000, MAX_OPEN_CLAIMS = 20;
export const MEMBERSHIP_DOCUMENT_KINDS = ["letter_of_recommendation", "membership_certificate", "membership_card"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const rand = (c: number) => `R${(c / 100).toFixed(2)}`;

export function createOwnerAssociation(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now()), fin = createFinance(db, now);
  const membership = async (owner: string, assoc: unknown) => (typeof assoc === "string" && UUID.test(assoc) ? (await db.query(`SELECT * FROM memberships WHERE association_id = $1 AND member_id = $2 AND member_role = 'vehicle_owner' AND status = 'active'`, [assoc, owner])).rows[0] ?? null : null);
  const claimOf = (c: Row) => ({ id: String(c.id), associationId: String(c.association_id), levyId: (c.levy_id as string | null) ?? null, amountCents: Number(c.amount_cents), paidOn: dayOf(c.paid_on)!, method: String(c.method), reference: (c.reference as string | null) ?? null, note: (c.note as string | null) ?? null, status: String(c.status), decidedAt: c.decided_at ? new Date(c.decided_at as string).toISOString() : null, decisionNote: (c.decision_note as string | null) ?? null, receiptId: (c.receipt_id as string | null) ?? null });

  /** Every association the owner belongs to (or has asked to join), with what they need to see of each. */
  async function profile(owner: string) {
    const ms = (await db.query(`SELECT m.*, a.name AS association FROM memberships m JOIN users a ON a.id = m.association_id WHERE m.member_id = $1 AND m.member_role = 'vehicle_owner' AND m.status IN ('active','pending') ORDER BY a.name`, [owner])).rows, day = today();
    const licences = (await db.query(`SELECT ol.condition_route, ol.valid_until FROM operating_licences ol JOIN vehicles v ON v.id = ol.vehicle_id WHERE v.owner_id = $1`, [owner])).rows.filter((l) => l.condition_route && dayOf(l.valid_until)! >= day), routes = [...new Set(licences.map((l) => String(l.condition_route)))].sort();
    const docs = (await db.query(`SELECT id, kind, reference, expires_on FROM compliance_documents WHERE owner_id = $1 AND vehicle_id IS NULL`, [owner])).rows.filter((d) => (MEMBERSHIP_DOCUMENT_KINDS as readonly string[]).includes(String(d.kind))).map((d) => ({ id: String(d.id), kind: String(d.kind), reference: (d.reference as string | null) ?? null, expiresOn: dayOf(d.expires_on) }));
    const out = [];
    for (const m of ms) {
      const assoc = String(m.association_id), active = m.status === "active", reg = (await db.query(`SELECT registration_number, province FROM association_registration WHERE association_id = $1`, [assoc])).rows[0], mr = (await db.query(`SELECT card_number, standing, standing_reason FROM member_register WHERE association_id = $1 AND member_id = $2`, [assoc, owner])).rows[0];
      const led = active ? (await fin.memberLedger(assoc, day)).find((x) => x.memberId === owner) : undefined, claims = (await db.query(`SELECT 1 AS x FROM dues_claims WHERE owner_id = $1 AND association_id = $2 AND status = 'claimed'`, [owner, assoc])).rows.length;
      out.push({ associationId: assoc, name: String(m.association), status: String(m.status), requestedBy: String(m.requested_by), joinedOn: active ? dayOf(m.responded_at ?? m.created_at) : null, registrationNumber: (reg?.registration_number as string | null) ?? null, province: (reg?.province as string | null) ?? null, membershipNumber: (mr?.card_number as string | null) ?? null, standing: String(mr?.standing ?? "active"), standingReason: (mr?.standing_reason as string | null) ?? null, routes: active ? routes : [], ledger: led ? { chargedCents: led.chargedCents, paidCents: led.paidCents, owedCents: led.owedCents, overdueCents: led.overdueCents, daysOverdue: led.daysOverdue, unallocatedCents: led.unallocatedCents } : null, pendingClaims: claims });
    }
    return { associations: out, documents: docs };
  }
  async function statement(owner: string, assoc: string): Promise<Res<Record<string, unknown>>> {
    if (!(await membership(owner, assoc))) return bad(404, "You are not a member of that association"); const r = await fin.memberStatement(assoc, owner); if (!r.ok) return bad(404, "That account was not found");
    const claims = (await db.query(`SELECT * FROM dues_claims WHERE owner_id = $1 AND association_id = $2 ORDER BY created_at DESC LIMIT 100`, [owner, assoc])).rows.map(claimOf); return { ok: true, value: { ...(r.value as Record<string, unknown>), claims } };
  }
  async function receipts(owner: string, assoc: string): Promise<Res<{ receipts: { id: string; number: string; receivedOn: string; category: string; amountCents: number; method: string; voided: boolean; voidReason: string | null }[] }>> {
    if (!(await membership(owner, assoc))) return bad(404, "You are not a member of that association");
    return { ok: true, value: { receipts: (await fin.receipts(assoc, { memberId: owner })).map((r: any) => ({ id: r.id, number: `R-${String(r.number).padStart(6, "0")}`, receivedOn: r.receivedOn, category: r.category, amountCents: r.amountCents, method: r.method, voided: !!r.voided, voidReason: r.voidReason ?? null })) } };
  }
  /** The association's own receipt PDF, for a receipt issued to THIS owner only. */
  async function receiptPdf(owner: string, assoc: string, id: string): Promise<Res<Buffer>> {
    if (!(await membership(owner, assoc))) return bad(404, "You are not a member of that association"); const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT member_id FROM receipts WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null;
    if (!r || String(r.member_id) !== owner) return bad(404, "That receipt was not found"); return fin.receiptPdf(assoc, id);
  }

  /* ───────────────────────── "I have paid" ───────────────────────── */
  /** An owner tells their association they have paid. A retry with the same client reference returns the first claim. It is NOT a payment until the association confirms it. */
  async function claim(owner: string, b: Record<string, unknown>): Promise<Res<{ id: string; duplicate: boolean }>> {
    const ref = text(b.clientRef, 64); if (ref === false) return bad(400, "The reference is too long");
    if (ref) { const dup = (await db.query(`SELECT id FROM dues_claims WHERE owner_id = $1 AND client_ref = $2`, [owner, ref])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), duplicate: true } }; }
    if (!(await membership(owner, b.associationId))) return bad(404, "You are not a member of that association"); const assoc = String(b.associationId);
    if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > MAX_CLAIM_CENTS) return bad(400, `The amount is a whole number of cents, up to ${rand(MAX_CLAIM_CENTS)}`);
    if (!METHODS.includes(b.method as never)) return bad(400, "Say how you paid: EFT, cash or other"); if (!isDay(b.paidOn) || (b.paidOn as string) > today() || (b.paidOn as string) < shift(today(), -400)) return bad(400, "Give the date you paid (not in the future, and within the last 400 days)");
    const reference = text(b.reference, 60), note = text(b.note, 200); if (reference === false || note === false) return bad(400, "The reference or note is too long");
    if ((await db.query(`SELECT 1 AS x FROM dues_claims WHERE owner_id = $1 AND association_id = $2 AND status = 'claimed'`, [owner, assoc])).rows.length >= MAX_OPEN_CLAIMS) return bad(409, "You already have many payments waiting for the association to confirm");
    let levy: string | null = null;
    if (b.levyId !== undefined && b.levyId !== null && b.levyId !== "") {
      const st = await fin.memberStatement(assoc, owner), open = st.ok ? (st.value as any).openLevies.find((l: any) => l.id === b.levyId) : null; if (!open) return bad(404, "That is not one of your open charges");
      const waiting = (await db.query(`SELECT amount_cents FROM dues_claims WHERE owner_id = $1 AND levy_id = $2 AND status = 'claimed'`, [owner, open.id])).rows.reduce((a, c) => a + Number(c.amount_cents), 0);
      if ((b.amountCents as number) + waiting > Number(open.remainingCents)) return bad(409, `That is more than is still owed on that charge (${rand(Number(open.remainingCents) - waiting)}${waiting ? `, with ${rand(waiting)} already waiting to be confirmed` : ""})`); levy = String(open.id);
    }
    const r = (await db.query(`INSERT INTO dues_claims (owner_id, association_id, levy_id, amount_cents, paid_on, method, reference, note, client_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [owner, assoc, levy, b.amountCents, b.paidOn, b.method, reference, note, ref])).rows[0]; return { ok: true, value: { id: String(r.id), duplicate: false } };
  }
  async function claims(owner: string) { const names = new Map((await db.query(`SELECT id, name FROM users`)).rows.map((u) => [String(u.id), String(u.name)])); return (await db.query(`SELECT * FROM dues_claims WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 200`, [owner])).rows.map((c) => ({ ...claimOf(c), association: names.get(String(c.association_id)) ?? "" })); }
  async function withdraw(owner: string, id: string): Promise<Res<{ id: string }>> {
    const c = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM dues_claims WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!c) return bad(404, "That payment was not found"); if (c.status !== "claimed") return bad(409, `That payment has already been ${c.status}`);
    await db.query(`UPDATE dues_claims SET status = 'withdrawn', decided_at = $2 WHERE id = $1`, [id, now().toISOString()]); return { ok: true, value: { id } };
  }

  /* ───────────────────────── the association's side ───────────────────────── */
  /** What members say they have paid and the association has not yet checked. */
  async function pending(assoc: string) {
    const names = new Map((await db.query(`SELECT id, name FROM users`)).rows.map((u) => [String(u.id), String(u.name)])), levies = new Map((await db.query(`SELECT id, title FROM levies WHERE association_id = $1`, [assoc])).rows.map((l) => [String(l.id), String(l.title)]));
    return (await db.query(`SELECT * FROM dues_claims WHERE association_id = $1 AND status = 'claimed' ORDER BY created_at`, [assoc])).rows.map((c) => ({ ...claimOf(c), member: names.get(String(c.owner_id)) ?? "", memberId: String(c.owner_id), levy: c.levy_id ? levies.get(String(c.levy_id)) ?? null : null }));
  }
  /** Confirms a member's claim after checking the association's own bank: issues the numbered receipt (against the charge when there is one) and marks the claim confirmed. If the receipt cannot be issued (say the charge was settled meanwhile) nothing changes and the reason is returned. */
  async function confirm(assoc: string, by: string, id: string, b: Record<string, unknown> = {}): Promise<Res<{ id: string; receiptId: string; number: number }>> {
    const c = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM dues_claims WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!c) return bad(404, "That payment was not found"); if (c.status !== "claimed") return bad(409, `That payment has already been ${c.status}`);
    const note = text(b.note, 200); if (note === false) return bad(400, "The note is too long");
    const r = await fin.recordReceipt(assoc, by, { memberId: String(c.owner_id), ...(c.levy_id ? { levyId: String(c.levy_id) } : { category: "other" }), amountCents: Number(c.amount_cents), method: c.method, receivedOn: dayOf(c.paid_on), note: `Confirmed from the member's own report${c.reference ? ` (reference ${c.reference})` : ""}${note ? `: ${note}` : ""}`.slice(0, 200) }); if (!r.ok) return r;
    await db.query(`UPDATE dues_claims SET status = 'confirmed', decided_by = $2, decided_at = $3, decision_note = $4, receipt_id = $5 WHERE id = $1`, [id, by, now().toISOString(), note, r.value.id]); return { ok: true, value: { id, receiptId: r.value.id, number: r.value.number } };
  }
  async function reject(assoc: string, by: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the payment is not being accepted"); const c = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM dues_claims WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!c) return bad(404, "That payment was not found"); if (c.status !== "claimed") return bad(409, `That payment has already been ${c.status}`);
    await db.query(`UPDATE dues_claims SET status = 'rejected', decided_by = $2, decided_at = $3, decision_note = $4 WHERE id = $1`, [id, by, now().toISOString(), why]); return { ok: true, value: { id } };
  }
  return { profile, statement, receipts, receiptPdf, claim, claims, withdraw, pending, confirm, reject };
}
export type OwnerAssociation = ReturnType<typeof createOwnerAssociation>;
