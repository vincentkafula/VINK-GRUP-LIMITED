import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { departmentByKey } from "../config/departments.js";
import { saDay, isUniqueViolation } from "../portal/common.js";
import { BENEFITS, AWARD_STAGES, PAYMENT_KINDS, CATEGORIES, type AwardStage } from "../config/sponsorship.js";
import { clean, oneLine, esc, round2, money, labelOf, toRand, iso, asJson } from "./sponsorshipUtil.js";
import { awardLetterPdf, agreementPdf, type AwardDocData } from "./sponsorshipDocs.js";

/**
 * What VINK has awarded, and what has been done about it.
 *
 *  1. Staff award an amount to an approved application: never more than was asked for, and above the approval limit only a Super Administrator may.
 *  2. They send the award letter and the agreement (PDFs, by email) and the application moves to "agreement pending". The agreement is signed outside this
 *     system, so staff mark it signed: this is a record that it was signed, not an electronic signature.
 *  3. Once it is signed: milestones can be ticked off and payments recorded. Payments are never more than the award in all.
 *  4. The final report (see sponsorshipFollowUp.ts) completes the award.
 */
type Bad = { ok: false; status: number; error: string };
const bad = (status: number, error: string): Bad => ({ ok: false, status, error });
const HEAD_OFFICE = "8 Rose Street, Cape Town CBD, State House Building, Cape Town 8001";
const DEPARTMENT_KEY = "sponsorships";

const validDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

export function createSponsorshipAwards(deps: {
  db: Db; mail: EmailSender; now?: () => Date; pdfCompress?: boolean;
  /** Moves an application on (the main service's setStatus), so sending the agreement moves it to "agreement pending" with the usual history and email. */
  setStatus: (ref: string, i: { status: string; reason: string; applicantMessage?: string; by: string }) => Promise<{ ok: true } | Bad>;
}) {
  const { db, mail } = deps;
  const now = deps.now ?? (() => new Date());
  const dept = () => departmentByKey(DEPARTMENT_KEY)!;
  const today = () => saDay(now());

  const appRow = async (ref: string) => (await db.query(`SELECT id, ref, status, applicant_name, organisation, email, currency, amount_requested, project_title, country, province, details FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
  const awardRow = async (applicationId: string) => (await db.query(`SELECT * FROM sponsorship_awards WHERE application_id = $1`, [applicationId])).rows[0];

  /** The award with its milestones, payments and what is left. */
  async function bundle(a: Record<string, unknown>) {
    const ms = (await db.query(`SELECT id, title, due_date, status, done_at, note FROM sponsorship_milestones WHERE award_id = $1 ORDER BY created_at`, [a.id])).rows;
    const ps = (await db.query(`SELECT id, kind, amount, paid_on, reference, note, recorded_by, created_at FROM sponsorship_payments WHERE award_id = $1 ORDER BY paid_on, created_at`, [a.id])).rows;
    const disbursed = round2(ps.reduce((t, p) => t + Number(p.amount), 0));
    const stage = String(a.stage) as AwardStage;
    return {
      id: String(a.id), amount: Number(a.amount), currency: String(a.currency), amountZar: a.amount_zar === null || a.amount_zar === undefined ? null : Number(a.amount_zar), conditions: a.conditions ? String(a.conditions) : null,
      stage, stageLabel: AWARD_STAGES[stage] ?? stage, agreementSentAt: a.agreement_sent_at ? iso(a.agreement_sent_at) : null, agreementSignedAt: a.agreement_signed_at ? iso(a.agreement_signed_at) : null,
      signedOn: a.signed_on ? String(a.signed_on) : null, agreementNote: a.agreement_note ? String(a.agreement_note) : null, createdAt: iso(a.created_at),
      milestones: ms.map((m) => ({ id: String(m.id), title: String(m.title), dueDate: m.due_date ? String(m.due_date).slice(0, 10) : null, status: String(m.status), doneAt: m.done_at ? iso(m.done_at) : null, note: m.note ? String(m.note) : null }))
        .sort((x, y) => (x.dueDate ?? "9999").localeCompare(y.dueDate ?? "9999")),
      payments: ps.map((p) => ({ id: String(p.id), kind: String(p.kind), kindLabel: labelOf(PAYMENT_KINDS, String(p.kind)), amount: Number(p.amount), paidOn: String(p.paid_on).slice(0, 10), reference: p.reference ? String(p.reference) : null, note: p.note ? String(p.note) : null, recordedBy: String(p.recorded_by), createdAt: iso(p.created_at) })),
      disbursed, remaining: round2(Number(a.amount) - disbursed),
    };
  }
  async function forApplication(applicationId: string) { const a = await awardRow(applicationId); return a ? bundle(a) : null; }
  /** The bare award (id, stage, amount, currency) for the other services. */
  async function stageOf(applicationId: string) { const a = await awardRow(applicationId); return a ? { id: String(a.id), stage: String(a.stage) as AwardStage, amount: Number(a.amount), currency: String(a.currency), signed: !!a.agreement_signed_at } : null; }

  // ── the award ───────────────────────────────────────────────────────────
  async function award(ref: string, input: { amount?: unknown; conditions?: unknown }, by: string, ctx: { limitZar: number | null }): Promise<{ ok: true; award: Awaited<ReturnType<typeof bundle>> } | Bad> {
    const app = await appRow(ref);
    if (!app) return bad(404, "Application not found");
    if (!["approved", "agreement_pending"].includes(String(app.status))) return bad(409, "Approve the application before awarding an amount");
    const amount = typeof input.amount === "number" ? round2(input.amount) : typeof input.amount === "string" && input.amount.trim() !== "" ? round2(Number(input.amount.replace(/[\s,]/g, ""))) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) return bad(400, "Enter the amount awarded");
    const asked = Number(app.amount_requested), cur = String(app.currency);
    if (amount > asked) return bad(400, `The award cannot be more than the ${money(asked, cur)} that was asked for`);
    const existing = await awardRow(String(app.id));
    if (existing?.agreement_sent_at) return bad(409, "The agreement has already been sent, so the award can no longer be changed");
    const conv = await toRand(db, amount, cur);
    if (ctx.limitZar !== null && (!conv || conv.zar > ctx.limitZar)) return bad(403, `Awards above R${ctx.limitZar.toLocaleString("en-ZA")} need a Super Administrator${conv ? "" : " (this amount could not be converted to rand)"}`);
    const conditions = clean(input.conditions, 3000) || null;
    if (existing) {
      const upd = await db.query(`UPDATE sponsorship_awards SET amount = $2, currency = $3, amount_zar = $4, conditions = $5, updated_at = $6 WHERE id = $1 AND agreement_sent_at IS NULL RETURNING id`, [existing.id, amount, cur, conv?.zar ?? null, conditions, now()]);
      if (!upd.rows.length) return bad(409, "The agreement has already been sent, so the award can no longer be changed");
    } else {
      try { await db.query(`INSERT INTO sponsorship_awards (id, application_id, amount, currency, amount_zar, conditions, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`, [crypto.randomUUID(), app.id, amount, cur, conv?.zar ?? null, conditions, by, now()]); }
      catch (e) { if (isUniqueViolation(e)) return bad(409, "Someone has just made an award for this application. Reload it to see it."); throw e; }   // the database allows one award per application
    }
    return { ok: true, award: (await forApplication(String(app.id)))! };
  }

  // ── the documents ───────────────────────────────────────────────────────
  async function docData(app: Record<string, unknown>, a: Awaited<ReturnType<typeof bundle>>): Promise<AwardDocData> {
    const d = asJson<Record<string, unknown>>(app.details); const dp = dept();
    return {
      ref: String(app.ref), issuedOn: today(), organisation: String(app.organisation), applicantName: String(app.applicant_name), contactPerson: String(d.contactPerson ?? app.applicant_name), email: String(app.email),
      projectTitle: String(app.project_title), startDate: String(d.startDate ?? ""), endDate: String(d.endDate ?? ""), location: [d.city, app.province, app.country].filter(Boolean).join(", "),
      amount: a.amount, currency: a.currency, conditions: a.conditions, milestones: a.milestones.map((m) => ({ title: m.title, dueDate: m.dueDate })),
      benefits: (Array.isArray(d.benefits) ? (d.benefits as string[]) : []).map((b) => labelOf(BENEFITS, b)), benefitsValue: String(d.benefitsValue ?? ""), department: { name: dp.name, address: dp.address }, headOffice: HEAD_OFFICE,
    };
  }
  /** The award letter or the agreement as a PDF, for staff to read before anything is sent. */
  async function document(ref: string, which: "letter" | "agreement"): Promise<{ ok: true; filename: string; data: Buffer } | Bad> {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const a = await forApplication(String(app.id)); if (!a) return bad(404, "No award has been made for this application yet");
    const data = await docData(app, a);
    return which === "letter" ? { ok: true, filename: `Award letter ${ref}.pdf`, data: await awardLetterPdf(data, { compress: deps.pdfCompress }) } : { ok: true, filename: `Sponsorship agreement ${ref}.pdf`, data: await agreementPdf(data, { compress: deps.pdfCompress }) };
  }

  // ── the agreement ───────────────────────────────────────────────────────
  async function agreement(ref: string, action: unknown, input: { note?: unknown; signedOn?: unknown }, by: string): Promise<{ ok: true; award: Awaited<ReturnType<typeof bundle>> } | Bad> {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const raw = await awardRow(String(app.id)); if (!raw) return bad(409, "Make an award before sending the agreement");
    if (raw.stage !== "agreement_pending") return bad(409, "This agreement has already been signed");
    const note = clean(input.note, 500) || null;
    if (action === "send") {
      if (!["approved", "agreement_pending"].includes(String(app.status))) return bad(409, "The application is not approved");
      const a = await bundle(raw); const data = await docData(app, a); const dp = dept();
      const [letter, agr] = await Promise.all([awardLetterPdf(data, { compress: deps.pdfCompress }), agreementPdf(data, { compress: deps.pdfCompress })]);
      const text = `Hello ${data.contactPerson},\n\nVINK has approved a sponsorship of ${money(a.amount, a.currency)} for "${data.projectTitle}". Your award letter and the sponsorship agreement are attached.\n\nPlease read the agreement, sign it and return it to ${dp.address}. Payments are made after it is signed.\n\nFor your safety, never send us a password, PIN or card number by email.`;
      const html = `<p>Hello ${esc(data.contactPerson)},</p><p>VINK has approved a sponsorship of <b>${esc(money(a.amount, a.currency))}</b> for &ldquo;${esc(data.projectTitle)}&rdquo;. Your award letter and the sponsorship agreement are attached.</p><p>Please read the agreement, sign it and return it to ${esc(dp.address)}. Payments are made after it is signed.</p><p>For your safety, never send us a password, PIN or card number by email.</p>`;
      try {
        await mail.send({ to: String(app.email), subject: `Your sponsorship award and agreement (${ref})`, text, html, from: `VINK ${dp.name} <${dp.address}>`, replyTo: dp.address,
          attachments: [{ filename: `Award letter ${ref}.pdf`, content: letter, contentType: "application/pdf" }, { filename: `Sponsorship agreement ${ref}.pdf`, content: agr, contentType: "application/pdf" }] });
      } catch (e) { return bad(502, `The email could not be sent (${e instanceof Error ? e.message.slice(0, 120) : "mail error"}). Nothing was changed: try again.`); }
      await db.query(`UPDATE sponsorship_awards SET agreement_sent_at = $2, agreement_note = COALESCE($3, agreement_note), updated_at = $2 WHERE id = $1`, [raw.id, now(), note]);
      if (app.status === "approved") await deps.setStatus(ref, { status: "agreement_pending", reason: "Award letter and agreement sent", applicantMessage: "Your award letter and sponsorship agreement have been emailed to you. Please sign the agreement and return it.", by });
      return { ok: true, award: (await forApplication(String(app.id)))! };
    }
    if (action === "signed") {
      if (!raw.agreement_sent_at) return bad(409, "Send the agreement before marking it signed");
      const signedOn = input.signedOn === undefined || input.signedOn === "" ? today() : input.signedOn;
      if (!validDay(signedOn)) return bad(400, "Enter the date it was signed");
      if (signedOn > today()) return bad(400, "The agreement cannot have been signed in the future");
      const sig = await db.query(`UPDATE sponsorship_awards SET stage = 'active', agreement_signed_at = $2, signed_on = $3, agreement_note = COALESCE($4, agreement_note), updated_at = $2 WHERE id = $1 AND stage = 'agreement_pending' RETURNING id`, [raw.id, now(), signedOn, note]);
      if (!sig.rows.length) return bad(409, "This agreement has already been signed");
      return { ok: true, award: (await forApplication(String(app.id)))! };
    }
    return bad(400, "Choose send or signed");
  }

  // ── milestones ──────────────────────────────────────────────────────────
  async function addMilestone(ref: string, input: { title?: unknown; dueDate?: unknown }) {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const a = await awardRow(String(app.id)); if (!a) return bad(409, "Make an award first");
    const title = oneLine(input.title, 120); if (title.length < 2) return bad(400, "Give the milestone a name");
    const due = input.dueDate === undefined || input.dueDate === "" || input.dueDate === null ? null : input.dueDate;
    if (due !== null && !validDay(due)) return bad(400, "Enter a valid due date");
    await db.query(`INSERT INTO sponsorship_milestones (id, award_id, title, due_date, created_at) VALUES ($1,$2,$3,$4,$5)`, [crypto.randomUUID(), a.id, title, due, now()]);
    return { ok: true as const, award: (await forApplication(String(app.id)))! };
  }
  async function updateMilestone(ref: string, id: string, input: { title?: unknown; dueDate?: unknown; status?: unknown; note?: unknown }) {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const a = await awardRow(String(app.id)); if (!a) return bad(409, "Make an award first");
    const m = (await db.query(`SELECT id FROM sponsorship_milestones WHERE id = $1 AND award_id = $2`, [id, a.id])).rows[0]; if (!m) return bad(404, "Milestone not found");
    const sets: string[] = [], p: unknown[] = [id];
    const set = (col: string, v: unknown) => { p.push(v); sets.push(`${col} = $${p.length}`); };
    if (input.title !== undefined) { const t = oneLine(input.title, 120); if (t.length < 2) return bad(400, "Give the milestone a name"); set("title", t); }
    if (input.dueDate !== undefined) { if (input.dueDate !== null && input.dueDate !== "" && !validDay(input.dueDate)) return bad(400, "Enter a valid due date"); set("due_date", input.dueDate === "" ? null : input.dueDate); }
    if (input.note !== undefined) set("note", clean(input.note, 300) || null);
    if (input.status !== undefined) {
      if (input.status !== "pending" && input.status !== "done") return bad(400, "A milestone is pending or done");
      set("status", input.status); set("done_at", input.status === "done" ? now() : null);
    }
    if (sets.length) await db.query(`UPDATE sponsorship_milestones SET ${sets.join(", ")} WHERE id = $1`, p);
    return { ok: true as const, award: (await forApplication(String(app.id)))! };
  }
  async function deleteMilestone(ref: string, id: string) {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const a = await awardRow(String(app.id)); if (!a) return bad(409, "Make an award first");
    const r = await db.query(`DELETE FROM sponsorship_milestones WHERE id = $1 AND award_id = $2 RETURNING id`, [id, a.id]);
    if (!r.rows.length) return bad(404, "Milestone not found");
    return { ok: true as const, award: (await forApplication(String(app.id)))! };
  }

  // ── payments ────────────────────────────────────────────────────────────
  /** Records money (or goods or services) given. Only after the agreement is signed, and never more than the award in all. */
  async function addPayment(ref: string, input: { kind?: unknown; amount?: unknown; paidOn?: unknown; reference?: unknown; note?: unknown }, by: string) {
    const app = await appRow(ref); if (!app) return bad(404, "Application not found");
    const raw = await awardRow(String(app.id)); if (!raw) return bad(409, "Make an award first");
    if (raw.stage === "agreement_pending") return bad(409, "Payments are recorded after the agreement is signed");
    const kind = String(input.kind); if (!PAYMENT_KINDS.some((k) => k.id === kind)) return bad(400, "Choose payment or products, equipment or services");
    const amount = typeof input.amount === "number" ? round2(input.amount) : typeof input.amount === "string" && input.amount.trim() !== "" ? round2(Number(input.amount.replace(/[\s,]/g, ""))) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) return bad(400, "Enter the amount");
    const paidOn = input.paidOn === undefined || input.paidOn === "" ? today() : input.paidOn;
    if (!validDay(paidOn)) return bad(400, "Enter the date it was paid"); if (paidOn > today()) return bad(400, "A payment cannot be dated in the future");
    // The gate: one UPDATE that adds the amount to what has been paid only if the award can still cover it. Postgres checks that condition again after waiting for any
    // other payment on the same award, so however many people record at the same instant, together they can never pay out more than was awarded.
    const gate = await db.query(`UPDATE sponsorship_awards SET paid_total = paid_total + $2, updated_at = $3 WHERE id = $1 AND paid_total + $2 <= amount RETURNING id`, [raw.id, amount, now()]);
    if (!gate.rows.length) { const b = await bundle(raw); return bad(400, `That is more than is left of the award: ${money(Math.max(0, b.amount - Number((await awardRow(String(app.id)))!.paid_total)), b.currency)}`); }
    try {
      await db.query(`INSERT INTO sponsorship_payments (id, award_id, kind, amount, paid_on, reference, note, recorded_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [crypto.randomUUID(), raw.id, kind, amount, paidOn, oneLine(input.reference, 60) || null, clean(input.note, 300) || null, by, now()]);
    } catch (e) { await db.query(`UPDATE sponsorship_awards SET paid_total = paid_total - $2 WHERE id = $1`, [raw.id, amount]).catch(() => undefined); throw e; }   // nothing was recorded, so hand the room back
    return { ok: true as const, award: (await forApplication(String(app.id)))! };
  }

  /** Called when the final report is accepted. */
  async function markCompleted(applicationId: string) { await db.query(`UPDATE sponsorship_awards SET stage = 'completed', updated_at = $2 WHERE application_id = $1 AND stage = 'active'`, [applicationId, now()]); }

  // ── what the applicant sees ─────────────────────────────────────────────
  /** Only once the agreement has been sent: until then staff may still be changing it. The internal note is never shown. */
  async function applicantView(applicationId: string) {
    const raw = await awardRow(applicationId); if (!raw || !raw.agreement_sent_at) return null;
    const a = await bundle(raw);
    return { amount: a.amount, currency: a.currency, conditions: a.conditions, stage: a.stage, stageLabel: a.stageLabel, signedOn: a.signedOn, milestones: a.milestones.map((m) => ({ title: m.title, dueDate: m.dueDate, status: m.status })), paid: a.disbursed, remaining: a.remaining };
  }

  // ── the budget ──────────────────────────────────────────────────────────
  /** Requested, approved, committed and paid out, in rand where an amount could be worked out, with every award and its milestones. */
  async function budget() {
    const apps = (await db.query(`SELECT id, ref, status, organisation, project_title, category, currency, amount_zar FROM sponsorship_applications`)).rows;
    const awards = (await db.query(`SELECT * FROM sponsorship_awards`)).rows;
    const pays = (await db.query(`SELECT award_id, amount FROM sponsorship_payments`)).rows;
    const ms = (await db.query(`SELECT award_id, due_date, status FROM sponsorship_milestones`)).rows;
    const appOf = new Map(apps.map((x) => [String(x.id), x]));
    const sum = (xs: (number | null)[]) => round2(xs.reduce<number>((t, v) => t + (v ?? 0), 0));
    const lines = awards.map((a) => {
      const app = appOf.get(String(a.application_id))!; const paid = round2(pays.filter((p) => String(p.award_id) === String(a.id)).reduce((t, p) => t + Number(p.amount), 0));
      const ratio = a.amount_zar !== null && a.amount_zar !== undefined && Number(a.amount) > 0 ? Number(a.amount_zar) / Number(a.amount) : null;
      const mine = ms.filter((m) => String(m.award_id) === String(a.id));
      return {
        ref: String(app.ref), organisation: String(app.organisation), project: String(app.project_title), category: labelOf(CATEGORIES, String(app.category)), stage: String(a.stage), stageLabel: AWARD_STAGES[String(a.stage) as AwardStage],
        currency: String(a.currency), awarded: Number(a.amount), awardedZar: a.amount_zar === null || a.amount_zar === undefined ? null : Number(a.amount_zar), paid, paidZar: ratio === null ? null : round2(paid * ratio), remaining: round2(Number(a.amount) - paid),
        milestonesDone: mine.filter((m) => m.status === "done").length, milestonesTotal: mine.length, overdue: mine.filter((m) => m.status === "pending" && m.due_date && String(m.due_date).slice(0, 10) < today()).length,
      };
    });
    const committed = lines.filter((l) => l.stage !== "agreement_pending");
    return {
      totals: {
        requestedZar: sum(apps.map((x) => (x.amount_zar === null || x.amount_zar === undefined ? null : Number(x.amount_zar)))),
        approvedZar: sum(lines.map((l) => l.awardedZar)), committedZar: sum(committed.map((l) => l.awardedZar)), paidZar: sum(lines.map((l) => l.paidZar)),
        awards: lines.length, notConverted: lines.filter((l) => l.awardedZar === null).length + apps.filter((x) => x.amount_zar === null || x.amount_zar === undefined).length,
      },
      awards: lines.sort((x, y) => x.organisation.localeCompare(y.organisation)),
    };
  }

  return { forApplication, stageOf, award, document, agreement, addMilestone, updateMilestone, deleteMilestone, addPayment, markCompleted, applicantView, budget };
}
export type SponsorshipAwards = ReturnType<typeof createSponsorshipAwards>;
