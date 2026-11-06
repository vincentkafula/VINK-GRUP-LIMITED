import PDFDocument from "pdfkit";
import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, addMonths, daysBetween, flagSort, type Flag } from "./compliance.js";

/**
 * ASSOCIATION FINANCE (docs/ASSOCIATION_COMPLIANCE.md, module 7): the association's own books, in the open.
 *   fee schedule   the approved fees; a member can only be charged a fee that is on it, and a joining or membership fee above the province's cap is refused
 *   receipts       numbered in an unbroken sequence per association; never deleted: a mistake is voided, with a reason, and keeps its number
 *   member ledger  what each member was charged, paid and still owes, with a statement they can be given
 *   expenses       recorded, then approved by named office bearers: two different people above the threshold, and nobody approves their own request
 *   banking        cash received against deposits made, so cash not yet banked is visible
 *   statements     income and expenses by month and year, with the budget alongside
 * Money is whole cents. The VINK wallet ledger (fines and fees collected by the money engine) is separate and untouched. Nothing here moves money: it records what the association says happened, and flags what looks wrong.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const CATEGORIES = ["joining", "membership", "levy", "fine", "other"] as const;
export const METHODS = ["cash", "eft", "card", "other"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const cents = (v: unknown): number => Math.round(Number(v) * 100);                       // NUMERIC comes back from PostgreSQL as text
const rand = (c: number) => `R${(c / 100).toFixed(2)}`;
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const isCents = (v: unknown, min = 1): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= 100_000_000_000;

export function createFinance(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now());
  const log = async (assoc: string, entity: string, entityId: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,$2,$3,$4,$5)`, [assoc, entity, entityId, summary.slice(0, 300), by]); };
  const isMember = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active'`, [assoc, id])).rows.length > 0;
  const feeCap = async (assoc: string): Promise<number | null> => { const r = (await db.query(`SELECT fee_cap_cents FROM association_registration WHERE association_id = $1`, [assoc])).rows[0]; return r?.fee_cap_cents === null || r?.fee_cap_cents === undefined ? null : Number(r.fee_cap_cents); };

  /* ───────────────────────── settings and the fee schedule ───────────────────────── */
  async function settings(assoc: string) { const r = (await db.query(`SELECT approval_threshold_cents FROM finance_settings WHERE association_id = $1`, [assoc])).rows[0]; return { approvalThresholdCents: Number(r?.approval_threshold_cents ?? 500000) }; }
  async function saveSettings(assoc: string, by: string, b: { approvalThresholdCents?: unknown }): Promise<Res<{ approvalThresholdCents: number }>> {
    if (!isCents(b.approvalThresholdCents, 0)) return bad(400, "The approval threshold is an amount of cents");
    await db.query(`INSERT INTO finance_settings (association_id, approval_threshold_cents, updated_at) VALUES ($1,$2, now()) ON CONFLICT (association_id) DO UPDATE SET approval_threshold_cents = EXCLUDED.approval_threshold_cents, updated_at = now()`, [assoc, b.approvalThresholdCents]);
    await log(assoc, "finance_settings", null, `payments of ${rand(b.approvalThresholdCents)} or more need two approvers`, by); return { ok: true, value: await settings(assoc) };
  }
  const feeOf = (r: Row, cap: number | null) => ({ id: String(r.id), kind: String(r.kind), name: String(r.name), amountCents: Number(r.amount_cents), effectiveFrom: dayOf(r.effective_from)!, active: !!r.active, approvedBy: (r.approved_by as string | null) ?? null, overCap: cap !== null && (r.kind === "joining" || r.kind === "membership") && Number(r.amount_cents) > cap });
  async function fees(assoc: string) { const cap = await feeCap(assoc); return (await db.query(`SELECT * FROM fee_schedule WHERE association_id = $1 ORDER BY kind, name, effective_from DESC`, [assoc])).rows.map((r) => feeOf(r, cap)); }
  async function addFee(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; overCap: boolean }>> {
    if (!CATEGORIES.includes(b.kind as never)) return bad(400, "A fee is a joining fee, membership fee, levy, fine or other");
    const name = text(b.name, 100); if (!name) return bad(400, "Give the fee a name");
    if (!isCents(b.amountCents)) return bad(400, "The amount is a whole number of cents, more than nothing");
    if (!isDay(b.effectiveFrom)) return bad(400, "Say the date it applies from (YYYY-MM-DD)");
    const by2 = text(b.approvedBy, 100); if (by2 === false) return bad(400, "The resolution reference is too long");
    const r = (await db.query(`INSERT INTO fee_schedule (association_id, kind, name, amount_cents, effective_from, approved_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [assoc, b.kind, name, b.amountCents, b.effectiveFrom, by2])).rows[0];
    const cap = await feeCap(assoc), over = cap !== null && (b.kind === "joining" || b.kind === "membership") && (b.amountCents as number) > cap;
    await log(assoc, "fee", String(r.id), `${b.kind} fee "${name}" ${rand(b.amountCents as number)} from ${b.effectiveFrom}${over ? " (ABOVE THE CAP)" : ""}`, by); return { ok: true, value: { id: String(r.id), overCap: over } };
  }
  async function setFeeActive(assoc: string, by: string, id: string, active: boolean): Promise<Res<{ id: string }>> {
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`UPDATE fee_schedule SET active = $3 WHERE id = $1 AND association_id = $2 RETURNING name`, [id, assoc, active])).rows[0] : null; if (!r) return bad(404, "Fee not found");
    await log(assoc, "fee", id, `fee "${r.name}" ${active ? "switched on" : "switched off"}`, by); return { ok: true, value: { id } };
  }
  /** Charges members a fee from the schedule. A joining or membership fee above the province's cap is refused; a joining fee is charged to a member only once. */
  async function charge(assoc: string, by: string, b: { feeId?: unknown; memberIds?: unknown; all?: unknown; dueOn?: unknown }): Promise<Res<{ created: number; skipped: number }>> {
    const fee = typeof b.feeId === "string" && UUID.test(b.feeId) ? (await db.query(`SELECT * FROM fee_schedule WHERE id = $1 AND association_id = $2`, [b.feeId, assoc])).rows[0] : null;
    if (!fee) return bad(404, "That fee is not on your schedule"); if (!fee.active) return bad(409, "That fee is switched off"); if (dayOf(fee.effective_from)! > today()) return bad(409, `That fee applies from ${dayOf(fee.effective_from)}`);
    const cap = await feeCap(assoc); if (cap !== null && (fee.kind === "joining" || fee.kind === "membership") && Number(fee.amount_cents) > cap) return bad(400, `That fee (${rand(Number(fee.amount_cents))}) is above the limit of ${rand(cap)} for your province`);
    if (b.dueOn !== undefined && b.dueOn !== null && b.dueOn !== "" && (!isDay(b.dueOn) || (b.dueOn as string) < today())) return bad(400, "Give a due date that is not in the past");
    const due = (b.dueOn as string) || new Date(Date.parse(`${today()}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    let ids: string[];
    if (b.all === true) ids = (await db.query(`SELECT member_id FROM memberships WHERE association_id = $1 AND status = 'active' AND member_role = 'vehicle_owner'`, [assoc])).rows.map((r) => String(r.member_id));
    else { if (!Array.isArray(b.memberIds) || !b.memberIds.length || b.memberIds.length > 500) return bad(400, "Choose the members to charge"); for (const m of b.memberIds) if (!(await isMember(assoc, m))) return bad(400, "Choose only your own members"); ids = [...new Set(b.memberIds as string[])]; }
    let created = 0, skipped = 0;
    for (const m of ids) {
      if (fee.kind === "joining" && (await db.query(`SELECT 1 AS x FROM levies WHERE association_id = $1 AND member_id = $2 AND title = $3`, [assoc, m, fee.name])).rows.length) { skipped++; continue; }
      await db.query(`INSERT INTO levies (association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,$4,$5)`, [assoc, m, fee.name, (Number(fee.amount_cents) / 100).toFixed(2), due]); created++;
    }
    await log(assoc, "charge", String(fee.id), `charged "${fee.name}" ${rand(Number(fee.amount_cents))} to ${created} member${created === 1 ? "" : "s"}${skipped ? ` (${skipped} already charged)` : ""}`, by); return { ok: true, value: { created, skipped } };
  }

  /* ───────────────────────── receipts and the member ledger ───────────────────────── */
  interface LevyState { id: string; memberId: string; title: string; amountCents: number; dueOn: string | null; settled: boolean; receiptsCents: number; legacyPaid: boolean; remainingCents: number }
  async function levyStates(assoc: string, onlyMember?: string): Promise<LevyState[]> {
    const levies = (await db.query(`SELECT id, member_id, title, amount, due_date, paid_at FROM levies WHERE association_id = $1`, [assoc])).rows.filter((l) => !onlyMember || String(l.member_id) === onlyMember);
    const rc = (await db.query(`SELECT levy_id, amount_cents FROM receipts WHERE association_id = $1 AND voided_at IS NULL AND levy_id IS NOT NULL`, [assoc])).rows;
    return levies.map((l) => { const id = String(l.id), amount = cents(l.amount), got = rc.filter((r) => String(r.levy_id) === id).reduce((a, r) => a + Number(r.amount_cents), 0), settled = !!l.paid_at; return { id, memberId: String(l.member_id), title: String(l.title), amountCents: amount, dueOn: dayOf(l.due_date), settled, receiptsCents: got, legacyPaid: settled && got === 0, remainingCents: settled ? 0 : Math.max(0, amount - got) }; });
  }
  /** Records a payment and gives it the next receipt number. A payment against a levy cannot be more than is owed on it; once a levy is paid in full it is marked paid. */
  async function recordReceipt(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; number: number }>> {
    if (!isCents(b.amountCents)) return bad(400, "The amount is a whole number of cents, more than nothing");
    if (!METHODS.includes(b.method as never)) return bad(400, "Say how it was paid: cash, EFT, card or other");
    if (!isDay(b.receivedOn) || (b.receivedOn as string) > today()) return bad(400, "Give the date it was received (not in the future)");
    const note = text(b.note, 200), payer = text(b.payerName, 100); if (note === false || payer === false) return bad(400, "The note or name is too long");
    const memberId = b.memberId === undefined || b.memberId === null || b.memberId === "" ? null : String(b.memberId);
    if (memberId ? !(await isMember(assoc, memberId)) : !payer) return bad(400, memberId ? "Choose one of your members" : "Say who paid: choose a member, or give the payer's name");
    let levy: LevyState | undefined, category = b.category;
    if (b.levyId !== undefined && b.levyId !== null && b.levyId !== "") {
      if (!memberId) return bad(400, "A payment against a levy needs the member");
      levy = (await levyStates(assoc, memberId)).find((l) => l.id === b.levyId); if (!levy) return bad(404, "That levy is not one of that member's");
      if (levy.settled) return bad(409, "That levy is already paid"); if ((b.amountCents as number) > levy.remainingCents) return bad(409, `That is more than is owed on that levy (${rand(levy.remainingCents)})`);
      if (category === undefined) { const fee = (await db.query(`SELECT kind FROM fee_schedule WHERE association_id = $1 AND name = $2 ORDER BY effective_from DESC`, [assoc, levy.title])).rows[0]; category = fee?.kind ?? "levy"; }
    }
    if (!CATEGORIES.includes(category as never)) return bad(400, "Say what it is for: a joining fee, membership fee, levy, fine or other");
    for (let attempt = 0; attempt < 5; attempt++) {
      const n = Number((await db.query(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM receipts WHERE association_id = $1`, [assoc])).rows[0].n);
      try {
        const r = (await db.query(`INSERT INTO receipts (association_id, number, member_id, payer_name, levy_id, category, amount_cents, method, received_on, note, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [assoc, n, memberId, payer, levy?.id ?? null, category, b.amountCents, b.method, b.receivedOn, note, by])).rows[0];
        if (levy && levy.receiptsCents + (b.amountCents as number) >= levy.amountCents) await db.query(`UPDATE levies SET paid_at = now() WHERE id = $1 AND paid_at IS NULL`, [levy.id]);
        await log(assoc, "receipt", String(r.id), `receipt ${n}: ${rand(b.amountCents as number)} ${b.method}${levy ? ` for "${levy.title}"` : ""}`, by); return { ok: true, value: { id: String(r.id), number: n } };
      } catch (e) { if (!/unique|duplicate/i.test(e instanceof Error ? e.message : "") || attempt === 4) throw e; }          // another receipt took that number a moment ago: take the next
    }
    return bad(409, "Could not number the receipt: try again");
  }
  /** A receipt is never deleted. Voiding it keeps its number and says why; the levy it paid becomes unpaid again if it no longer adds up. */
  async function voidReceipt(assoc: string, by: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the receipt is being voided");
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM receipts WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!r) return bad(404, "Receipt not found"); if (r.voided_at) return bad(409, "That receipt is already voided");
    await db.query(`UPDATE receipts SET voided_at = now(), void_reason = $2 WHERE id = $1`, [id, why]);
    if (r.levy_id) { const l = (await levyStates(assoc)).find((x) => x.id === String(r.levy_id)); if (l && l.receiptsCents < l.amountCents) await db.query(`UPDATE levies SET paid_at = NULL WHERE id = $1`, [r.levy_id]); }      // this levy was paid by receipts (a levy already paid is never receipted against), so if they no longer add up it is unpaid again
    await log(assoc, "receipt", id, `receipt ${r.number} voided: ${why}`, by); return { ok: true, value: { id } };
  }
  async function receipts(assoc: string, o: { from?: string; to?: string; memberId?: string } = {}) {
    const rows = (await db.query(`SELECT r.*, u.name AS member FROM receipts r LEFT JOIN users u ON u.id = r.member_id WHERE r.association_id = $1 ORDER BY r.number DESC LIMIT 1000`, [assoc])).rows;
    return rows.filter((r) => (!o.from || dayOf(r.received_on)! >= o.from) && (!o.to || dayOf(r.received_on)! <= o.to) && (!o.memberId || String(r.member_id) === o.memberId)).map((r) => ({ id: String(r.id), number: Number(r.number), member: (r.member as string | null) ?? (r.payer_name as string | null), memberId: (r.member_id as string | null) ?? null, category: String(r.category), amountCents: Number(r.amount_cents), method: String(r.method), receivedOn: dayOf(r.received_on)!, note: (r.note as string | null) ?? null, voided: !!r.voided_at, voidReason: (r.void_reason as string | null) ?? null }));
  }
  /** Each member's account: charged, paid (by receipt, or marked paid with no receipt), what is owed and how much of it is overdue. */
  async function memberLedger(assoc: string, onDay = today()) {
    const members = (await db.query(`SELECT m.member_id, u.name FROM memberships m JOIN users u ON u.id = m.member_id WHERE m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' ORDER BY u.name`, [assoc])).rows;
    const states = await levyStates(assoc), rc = (await db.query(`SELECT member_id, levy_id, amount_cents FROM receipts WHERE association_id = $1 AND voided_at IS NULL`, [assoc])).rows;
    return members.map((m) => {
      const id = String(m.member_id), mine = states.filter((l) => l.memberId === id), unallocated = rc.filter((r) => String(r.member_id) === id && !r.levy_id).reduce((a, r) => a + Number(r.amount_cents), 0);
      const charged = mine.reduce((a, l) => a + l.amountCents, 0), paidByReceipt = mine.reduce((a, l) => a + Math.min(l.receiptsCents, l.amountCents), 0), legacy = mine.filter((l) => l.legacyPaid).reduce((a, l) => a + l.amountCents, 0), owed = mine.reduce((a, l) => a + l.remainingCents, 0);
      const overdue = mine.filter((l) => !l.settled && l.dueOn && l.dueOn < onDay).reduce((a, l) => a + l.remainingCents, 0), oldest = mine.filter((l) => !l.settled && l.dueOn && l.dueOn < onDay).map((l) => l.dueOn!).sort()[0] ?? null;
      return { memberId: id, name: String(m.name), chargedCents: charged, paidCents: paidByReceipt + legacy, paidWithoutReceiptCents: legacy, unallocatedCents: unallocated, owedCents: owed, balanceCents: owed - unallocated, overdueCents: overdue, oldestOverdueOn: oldest, daysOverdue: oldest ? daysBetween(oldest, onDay) : 0 };
    });
  }
  async function memberStatement(assoc: string, memberId: string) {
    if (!(await isMember(assoc, memberId))) return bad(404, "That member was not found") as Fail;
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [memberId])).rows[0]?.name ?? ""), states = await levyStates(assoc, memberId), rows = await receipts(assoc, { memberId });
    const lines: { date: string; kind: "charge" | "receipt" | "void"; ref: string; description: string; amountCents: number; balanceCents: number }[] = [];
    const events = [...states.map((l) => ({ date: l.dueOn ?? "0000-00-00", order: 0, kind: "charge" as const, ref: "", description: l.title, amountCents: l.amountCents + 0 })), ...rows.map((r) => ({ date: r.receivedOn, order: 1, kind: r.voided ? "void" as const : "receipt" as const, ref: `R-${String(r.number).padStart(6, "0")}`, description: `${r.category}${r.voided ? ` (voided: ${r.voidReason})` : ""}`, amountCents: r.amountCents }))].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    let bal = 0; for (const e of events) { if (e.kind === "charge") bal += e.amountCents; else if (e.kind === "receipt") bal -= e.amountCents; lines.push({ date: e.date === "0000-00-00" ? "" : e.date, kind: e.kind, ref: e.ref, description: e.description, amountCents: e.amountCents, balanceCents: bal }); }
    return { ok: true, value: { member: name, lines, openLevies: states.filter((l) => !l.settled && l.remainingCents > 0).sort((x, y) => (x.dueOn ?? "").localeCompare(y.dueOn ?? "")).map((l) => ({ id: l.id, title: l.title, remainingCents: l.remainingCents, dueOn: l.dueOn })), owedCents: states.reduce((a, l) => a + l.remainingCents, 0), note: states.some((l) => l.legacyPaid) ? "Some levies are marked paid without a receipt. Their payment is not shown above." : null } } as Res<{ member: string; lines: typeof lines; openLevies: { id: string; title: string; remainingCents: number; dueOn: string | null }[]; owedCents: number; note: string | null }>;
  }

  /* ───────────────────────── expenses, banking and budgets ───────────────────────── */
  const expOf = (e: Row, ap: Row[]) => ({ id: String(e.id), incurredOn: dayOf(e.incurred_on)!, category: String(e.category), payee: String(e.payee), amountCents: Number(e.amount_cents), description: (e.description as string | null) ?? null, requestedBy: String(e.requested_by), status: String(e.status), requiredApprovals: Number(e.required_approvals), rejectedReason: (e.rejected_reason as string | null) ?? null, createdAt: new Date(e.created_at as string).toISOString(), approvals: ap.filter((a) => String(a.expense_id) === String(e.id)).map((a) => ({ officeBearerId: String(a.office_bearer_id), name: String(a.approver_name), at: new Date(a.approved_at as string).toISOString() })) });
  async function expenses(assoc: string, status?: string) {
    const rows = (await db.query(`SELECT * FROM expenses WHERE association_id = $1 ORDER BY incurred_on DESC, created_at DESC LIMIT 500`, [assoc])).rows.filter((e) => !status || e.status === status), ap = (await db.query(`SELECT a.* FROM expense_approvals a JOIN expenses e ON e.id = a.expense_id WHERE e.association_id = $1`, [assoc])).rows;
    return rows.map((e) => expOf(e, ap));
  }
  /** Records a payment the association wants to make or has made. At or above the threshold it needs two different office bearers to approve; below it, one. */
  async function addExpense(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; requiredApprovals: number }>> {
    if (!isDay(b.incurredOn) || (b.incurredOn as string) > today()) return bad(400, "Give the date of the expense (not in the future)");
    const category = text(b.category, 60), payee = text(b.payee, 100), by2 = text(b.requestedBy, 100), desc = text(b.description, 300); if (!category || !payee) return bad(400, "Give the category and who is being paid"); if (!by2) return bad(400, "Say who asked for it"); if (desc === false) return bad(400, "The description is too long");
    if (!isCents(b.amountCents)) return bad(400, "The amount is a whole number of cents, more than nothing");
    const need = (b.amountCents as number) >= (await settings(assoc)).approvalThresholdCents ? 2 : 1;
    const r = (await db.query(`INSERT INTO expenses (association_id, incurred_on, category, payee, amount_cents, description, requested_by, required_approvals) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [assoc, b.incurredOn, category, payee, b.amountCents, desc, by2, need])).rows[0];
    await log(assoc, "expense", String(r.id), `expense ${rand(b.amountCents as number)} to ${payee} (${category}) needs ${need} approval${need === 1 ? "" : "s"}`, by); return { ok: true, value: { id: String(r.id), requiredApprovals: need } };
  }
  /** An office bearer's approval, recorded by the association. Their term must not have ended, they cannot approve what they asked for, and the same person cannot approve twice. */
  async function approveExpense(assoc: string, by: string, id: string, officeBearerId: unknown): Promise<Res<{ status: string; approvals: number }>> {
    const e = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM expenses WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!e) return bad(404, "Expense not found"); if (e.status !== "pending") return bad(409, `That expense is already ${e.status}`);
    const ob = typeof officeBearerId === "string" && UUID.test(officeBearerId) ? (await db.query(`SELECT * FROM office_bearers WHERE id = $1 AND association_id = $2`, [officeBearerId, assoc])).rows[0] : null; if (!ob) return bad(400, "Choose one of your office bearers");
    if (ob.term_end && dayOf(ob.term_end)! < today()) return bad(400, `${ob.name}'s term as ${ob.office} ended on ${dayOf(ob.term_end)}`);
    if (String(ob.name).trim().toLowerCase() === String(e.requested_by).trim().toLowerCase()) return bad(400, "Nobody can approve what they asked for themselves");
    if ((await db.query(`SELECT 1 AS x FROM expense_approvals WHERE expense_id = $1 AND office_bearer_id = $2`, [id, ob.id])).rows.length) return bad(409, `${ob.name} has already approved this`);
    await db.query(`INSERT INTO expense_approvals (expense_id, office_bearer_id, approver_name) VALUES ($1,$2,$3)`, [id, ob.id, ob.name]);
    const n = Number((await db.query(`SELECT COUNT(*) AS n FROM expense_approvals WHERE expense_id = $1`, [id])).rows[0].n), done = n >= Number(e.required_approvals);
    if (done) await db.query(`UPDATE expenses SET status = 'approved', decided_at = now() WHERE id = $1`, [id]);
    await log(assoc, "expense", id, `${ob.name} (${ob.office}) approved ${rand(Number(e.amount_cents))} to ${e.payee}${done ? ": now approved" : ""}`, by); return { ok: true, value: { status: done ? "approved" : "pending", approvals: n } };
  }
  async function rejectExpense(assoc: string, by: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why it is being rejected");
    const e = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM expenses WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!e) return bad(404, "Expense not found"); if (e.status !== "pending") return bad(409, `That expense is already ${e.status}`);
    await db.query(`UPDATE expenses SET status = 'rejected', rejected_reason = $2, decided_at = now() WHERE id = $1`, [id, why]); await log(assoc, "expense", id, `rejected ${rand(Number(e.amount_cents))} to ${e.payee}: ${why}`, by); return { ok: true, value: { id } };
  }
  async function addDeposit(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!isDay(b.depositedOn) || (b.depositedOn as string) > today()) return bad(400, "Give the date it was banked (not in the future)"); if (!isCents(b.amountCents)) return bad(400, "The amount is a whole number of cents, more than nothing");
    const ref = text(b.reference, 80), note = text(b.note, 200); if (ref === false || note === false) return bad(400, "The reference or note is too long");
    const r = (await db.query(`INSERT INTO bank_deposits (association_id, deposited_on, amount_cents, reference, note) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [assoc, b.depositedOn, b.amountCents, ref, note])).rows[0]; await log(assoc, "deposit", String(r.id), `banked ${rand(b.amountCents as number)} on ${b.depositedOn}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function deposits(assoc: string) { return (await db.query(`SELECT * FROM bank_deposits WHERE association_id = $1 ORDER BY deposited_on DESC, created_at DESC LIMIT 500`, [assoc])).rows.map((d) => ({ id: String(d.id), depositedOn: dayOf(d.deposited_on)!, amountCents: Number(d.amount_cents), reference: (d.reference as string | null) ?? null, note: (d.note as string | null) ?? null })); }
  /** Cash received against cash banked. Deposits are taken to cover the oldest cash first, so the date of the oldest cash not yet banked is known. */
  async function cash(assoc: string, onDay = today()) {
    const received = (await db.query(`SELECT received_on, amount_cents FROM receipts WHERE association_id = $1 AND voided_at IS NULL AND method = 'cash'`, [assoc])).rows.map((r) => ({ on: dayOf(r.received_on)!, cents: Number(r.amount_cents) })).sort((a, b) => a.on.localeCompare(b.on)), banked = (await db.query(`SELECT amount_cents FROM bank_deposits WHERE association_id = $1`, [assoc])).rows.reduce((a, d) => a + Number(d.amount_cents), 0);
    let left = banked, oldest: string | null = null, unbanked = 0; for (const r of received) { const used = Math.min(left, r.cents); left -= used; if (r.cents - used > 0) { unbanked += r.cents - used; oldest ??= r.on; } }
    const total = received.reduce((a, r) => a + r.cents, 0);
    return { cashReceivedCents: total, bankedCents: banked, onHandCents: total - banked, unbankedCents: unbanked, oldestUnbankedOn: oldest, oldestUnbankedDays: oldest ? daysBetween(oldest, onDay) : null, overBankedCents: Math.max(0, banked - total) };
  }
  async function setBudget(assoc: string, by: string, b: { year?: unknown; category?: unknown; amountCents?: unknown }): Promise<Res<{ ok: true }>> {
    if (!Number.isInteger(b.year) || (b.year as number) < 2000 || (b.year as number) > 2100) return bad(400, "Give the year"); const cat = text(b.category, 60); if (!cat) return bad(400, "Give the category"); if (!isCents(b.amountCents, 0)) return bad(400, "The budget is an amount of cents");
    await db.query(`INSERT INTO budgets (association_id, year, category, amount_cents) VALUES ($1,$2,$3,$4) ON CONFLICT (association_id, year, category) DO UPDATE SET amount_cents = EXCLUDED.amount_cents`, [assoc, b.year, cat, b.amountCents]); await log(assoc, "budget", null, `${b.year} budget for ${cat}: ${rand(b.amountCents as number)}`, by); return { ok: true, value: { ok: true } };
  }
  async function budgets(assoc: string, year: number) { return (await db.query(`SELECT category, amount_cents FROM budgets WHERE association_id = $1 AND year = $2 ORDER BY category`, [assoc, year])).rows.map((r) => ({ category: String(r.category), amountCents: Number(r.amount_cents) })); }

  /* ───────────────────────── statements and the overview ───────────────────────── */
  /** Income (receipts, not voided) and expenses (approved only) for a month ("2026-10") or a year, with the budget alongside for a year. */
  async function statement(assoc: string, o: { month?: string; year?: number }): Promise<Res<Record<string, unknown>>> {
    const month = o.month && /^\d{4}-\d{2}$/.test(o.month) ? o.month : null, year = month ? Number(month.slice(0, 4)) : Number.isInteger(o.year) ? (o.year as number) : null; if (!year) return bad(400, "Give a month (2026-10) or a year");
    const inRange = (d: string) => (month ? d.startsWith(month) : d.startsWith(String(year)));
    const rc = (await receipts(assoc)).filter((r) => !r.voided && inRange(r.receivedOn)), ex = (await expenses(assoc, "approved")).filter((e) => inRange(e.incurredOn));
    const sum = (rows: { category: string; amountCents: number }[]) => { const m = new Map<string, number>(); for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amountCents); return [...m].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => a.category.localeCompare(b.category)); };
    const income = sum(rc), spent = sum(ex), totalIn = rc.reduce((a, r) => a + r.amountCents, 0), totalOut = ex.reduce((a, e) => a + e.amountCents, 0), base = { period: month ?? String(year), income, expenses: spent, incomeCents: totalIn, expensesCents: totalOut, netCents: totalIn - totalOut };
    if (month) return { ok: true, value: base };
    const months = Array.from({ length: 12 }, (_, i) => { const m = `${year}-${String(i + 1).padStart(2, "0")}`, i1 = rc.filter((r) => r.receivedOn.startsWith(m)).reduce((a, r) => a + r.amountCents, 0), e1 = ex.filter((e) => e.incurredOn.startsWith(m)).reduce((a, e) => a + e.amountCents, 0); return { month: m, incomeCents: i1, expensesCents: e1, netCents: i1 - e1 }; });
    const bud = await budgets(assoc, year), actual = new Map([...income, ...spent].map((x) => [x.category, x.amountCents])), cats = [...new Set([...bud.map((b) => b.category), ...income.map((x) => x.category), ...spent.map((x) => x.category)])].sort((x, y) => x.localeCompare(y));
    return { ok: true, value: { ...base, months, budget: cats.map((c) => { const b = bud.find((x) => x.category === c)?.amountCents ?? null, a = actual.get(c) ?? 0; return { category: c, budgetCents: b, actualCents: a, varianceCents: b === null ? null : a - b }; }) } };
  }
  async function summary(assoc: string, onDay = today()) {
    const [st, fs, led, ex, ca] = [await settings(assoc), await fees(assoc), await memberLedger(assoc, onDay), await expenses(assoc), await cash(assoc, onDay)];
    const flags: Flag[] = [], month = onDay.slice(0, 7), rc = await receipts(assoc);
    for (const f of fs) if (f.active && f.overCap) flags.push({ id: `fin:cap:${f.id}`, category: "finance", severity: "high", message: `The ${f.kind} fee "${f.name}" (${rand(f.amountCents)}) is above the limit for your province`, subject: f.name, dueOn: null });
    const legacy = led.reduce((a, m) => a + (m.paidWithoutReceiptCents > 0 ? 1 : 0), 0), legacyAmt = led.reduce((a, m) => a + m.paidWithoutReceiptCents, 0); if (legacy) flags.push({ id: "fin:noreceipt", category: "finance", severity: "medium", message: `${legacy} member${legacy === 1 ? " has" : "s have"} levies marked paid with no receipt (${rand(legacyAmt)}): issue receipts so every payment can be shown`, subject: "Receipts", dueOn: null });
    for (const e of ex.filter((x) => x.status === "pending")) { const age = daysBetween(dayOf(e.createdAt)!, onDay); if (age >= 14) flags.push({ id: `fin:pending:${e.id}`, category: "finance", severity: "medium", message: `${rand(e.amountCents)} to ${e.payee} has been waiting for approval for ${age} days (${e.approvals.length} of ${e.requiredApprovals} approvals)`, subject: e.payee, dueOn: null }); }
    const overdue = led.filter((m) => m.daysOverdue > 90); if (overdue.length) flags.push({ id: "fin:overdue", category: "finance", severity: "low", message: `${overdue.length} member${overdue.length === 1 ? " owes" : "s owe"} levies more than 90 days overdue (${rand(overdue.reduce((a, m) => a + m.overdueCents, 0))})`, subject: "Member accounts", dueOn: null });
    if (ca.oldestUnbankedDays !== null && ca.oldestUnbankedDays > 30) flags.push({ id: "fin:cash", category: "finance", severity: ca.oldestUnbankedDays > 60 ? "high" : "medium", message: `${rand(ca.unbankedCents)} of cash has not been banked, the oldest from ${ca.oldestUnbankedOn} (${ca.oldestUnbankedDays} days)`, subject: "Cash", dueOn: ca.oldestUnbankedOn });
    if (ca.overBankedCents > 0) flags.push({ id: "fin:overbanked", category: "finance", severity: "low", message: `More has been banked (${rand(ca.bankedCents)}) than cash receipts recorded (${rand(ca.cashReceivedCents)}): some cash payments may not have a receipt`, subject: "Cash", dueOn: null });
    const since = new Date(Date.parse(`${onDay}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10), voids = rc.filter((r) => r.voided && r.receivedOn >= since).length; if (voids >= 3) flags.push({ id: "fin:voids", category: "finance", severity: "low", message: `${voids} receipts were voided in the last 30 days`, subject: "Receipts", dueOn: null });
    if (!fs.some((f) => f.active) && (rc.length || led.some((m) => m.chargedCents > 0))) flags.push({ id: "fin:noschedule", category: "finance", severity: "low", message: "Members have been charged or have paid, but no approved fee schedule is recorded", subject: "Fee schedule", dueOn: null });
    const mi = rc.filter((r) => !r.voided && r.receivedOn.startsWith(month)).reduce((a, r) => a + r.amountCents, 0), me = ex.filter((e) => e.status === "approved" && e.incurredOn.startsWith(month)).reduce((a, e) => a + e.amountCents, 0);
    return { today: onDay, settings: st, cash: ca, measures: { collectedThisMonthCents: mi, expensesThisMonthCents: me, netThisMonthCents: mi - me, owedByMembersCents: led.reduce((a, m) => a + m.owedCents, 0), overdueCents: led.reduce((a, m) => a + m.overdueCents, 0), membersOverdue: led.filter((m) => m.overdueCents > 0).length, pendingExpenses: ex.filter((e) => e.status === "pending").length }, flags: flags.sort(flagSort) };
  }
  /** A numbered receipt as a one-page PDF. A voided receipt says so across its face, so it cannot be passed off as valid. */
  async function receiptPdf(assoc: string, id: string): Promise<Res<Buffer>> {
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT r.*, u.name AS member, a.name AS association FROM receipts r JOIN users a ON a.id = r.association_id LEFT JOIN users u ON u.id = r.member_id WHERE r.id = $1 AND r.association_id = $2`, [id, assoc])).rows[0] : null; if (!r) return bad(404, "Receipt not found");
    const number = `R-${String(r.number).padStart(6, "0")}`, voided = !!r.voided_at, buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A5", margin: 40, compress: false, info: { Title: `Receipt ${number}`, Author: String(r.association) } }), parts: Buffer[] = [];
      doc.on("data", (c: Buffer) => parts.push(c)); doc.on("end", () => resolve(Buffer.concat(parts))); doc.on("error", reject);
      doc.font("Helvetica-Bold", 16).fillColor("#111111").text(String(r.association), 40, 40); doc.font("Helvetica-Bold", 22).text(`Receipt ${number}`, 40, doc.y + 6);
      doc.font("Helvetica", 11).fillColor("#333333"); const rows: [string, string][] = [["Date received", dayOf(r.received_on)!], ["Received from", String(r.member ?? r.payer_name ?? "")], ["Amount", rand(Number(r.amount_cents))], ["Paid by", String(r.method)], ["For", String(r.category)]]; if (r.note) rows.push(["Note", String(r.note)]);
      doc.moveDown(0.8); for (const [k, v] of rows) { const y = doc.y; doc.font("Helvetica", 10).fillColor("#666666").text(k, 40, y, { width: 100 }); doc.font("Helvetica-Bold", 11).fillColor("#111111").text(v, 145, y, { width: 220 }); doc.y = y + 20; }
      if (voided) { doc.moveDown(0.5).font("Helvetica-Bold", 20).fillColor("#B91C1C").text("VOID", 40, doc.y); doc.font("Helvetica", 10).text(`This receipt was voided: ${r.void_reason}`, 40, doc.y + 2, { width: 320 }); }
      doc.moveDown(1).font("Helvetica", 8).fillColor("#666666").text("Receipts are numbered in sequence and are never deleted. A receipt that is voided keeps its number and says so.", 40, doc.y, { width: 320 }); doc.end();
    });
    return { ok: true, value: buf };
  }
  return { settings, saveSettings, receiptPdf, fees, addFee, setFeeActive, charge, recordReceipt, voidReceipt, receipts, memberLedger, memberStatement, expenses, addExpense, approveExpense, rejectExpense, addDeposit, deposits, cash, setBudget, budgets, statement, summary };
}
export type Finance = ReturnType<typeof createFinance>;
