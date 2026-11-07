import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, flagSort, createCompliance, type Flag } from "./compliance.js";
import { createFinance } from "./finance.js";
import { createRouteControl } from "./routeControl.js";
import { validateSaId } from "./saIdValidator.js";

/**
 * THE MEMBER REGISTER (module 2) AND OWNER FORMALISATION (module 10) (docs/ASSOCIATION_COMPLIANCE.md).
 *   Membership is voluntary under the NLTA, so the association must be able to show exactly WHO is a member (their legal identity, card, standing, any membership of another association) and keep the operators on its routes who are NOT members apart.
 *   The taxi industry is a SARS priority and SANTACO is pushing corporatisation: the association tracks each owner's business and employer registrations so it can show progress towards formal employment.
 * It records what the owner has told the association and reports it. It TRACKS AND REPORTS ONLY: filing tax and registering as an employer are the owner's own duties, and nothing here is tax or labour advice. ID and tax numbers are returned masked, and never written to the change history.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const ENTITY = ["individual", "company", "cc", "partnership", "trust", "other"] as const, STANDING = ["active", "suspended", "terminated"] as const, BUSINESS = ["unknown", "sole_proprietor", "company", "cc", "partnership", "trust", "other"] as const, FILING = ["unknown", "up_to_date", "overdue", "not_applicable"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const mask = (v: unknown, keep = 4) => (typeof v === "string" && v.length > keep + 1 ? `${"•".repeat(v.length - keep)}${v.slice(-keep)}` : null);
const plate = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** A column's value as it should be compared and shown: dates as days, everything else as it is. */
const val = (col: string, v: unknown) => (col.endsWith("_on") ? dayOf(v) : v ?? null);
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export function createMembers(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now()), comp = createCompliance(db, now), fin = createFinance(db, now), routes = createRouteControl(db, now);
  const log = async (assoc: string, entity: string, entityId: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,$2,$3,$4,$5)`, [assoc, entity, entityId, summary.slice(0, 300), by]); };
  const members = async (assoc: string) => (await db.query(`SELECT m.member_id, m.responded_at, m.created_at, u.name, u.email FROM memberships m JOIN users u ON u.id = m.member_id WHERE m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' ORDER BY u.name`, [assoc])).rows;
  const isOwnerMember = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active' AND member_role = 'vehicle_owner'`, [assoc, id])).rows.length > 0;

  /* ───────────────────────── the member register ───────────────────────── */
  async function register(assoc: string, onDay = today()) {
    const ms = await members(assoc), regs = (await db.query(`SELECT * FROM member_register WHERE association_id = $1`, [assoc])).rows, vehicles = await comp.vehicles(assoc, onDay), ledger = await fin.memberLedger(assoc, onDay);
    const cases = (await db.query(`SELECT subject_id, closed_on FROM disciplinary_cases WHERE association_id = $1 AND subject_id IS NOT NULL`, [assoc])).rows, since = new Date(`${shift(onDay, -30)}T00:00:00Z`).getTime();
    const sessions = (await db.query(`SELECT ls.vehicle_id, ls.started_at FROM loading_sessions ls JOIN token_routes r ON r.id = ls.route_id WHERE r.association_id = $1 AND ls.status IN ('loading','closed')`, [assoc])).rows.filter((s) => new Date(s.started_at as string).getTime() >= since);
    const flags: Flag[] = [], rows = ms.map((m) => {
      const id = String(m.member_id), r = regs.find((x) => String(x.member_id) === id), vs = vehicles.filter((v) => v.ownerId === id), led = ledger.find((x) => x.memberId === id), mine = cases.filter((c) => String(c.subject_id) === id);
      const standing = String(r?.standing ?? "active"), name = String(m.name), trips = sessions.filter((s) => vs.some((v) => v.id === String(s.vehicle_id))).length, dual = (r?.dual_member_of as string | null) ?? null, consent = !!r?.dual_consent, entity = String(r?.entity_type ?? "individual");
      if (dual && !consent) flags.push({ id: `members:dual:${id}`, category: "members", severity: "medium", message: `${name} is also a member of ${dual}, and no consent is recorded`, subject: name, dueOn: null });
      if (standing !== "active" && trips > 0) flags.push({ id: `members:standing:${id}`, category: "members", severity: "high", message: `${name} is ${standing}, but their vehicles ran ${trips} trip${trips === 1 ? "" : "s"} on your routes in the last 30 days`, subject: name, dueOn: null });
      if (!r?.id_number) flags.push({ id: `members:identity:${id}`, category: "members", severity: "low", message: `No ID or company number is on record for ${name}`, subject: name, dueOn: null });
      return { memberId: id, name, email: String(m.email), joinedOn: dayOf(m.responded_at ?? m.created_at)!, membershipClass: "member", legalName: (r?.legal_name as string | null) ?? null, entityType: entity, idNumberMasked: mask(r?.id_number), phone: (r?.phone as string | null) ?? null, cardNumber: (r?.card_number as string | null) ?? null, standing, standingReason: (r?.standing_reason as string | null) ?? null, standingChangedOn: dayOf(r?.standing_changed_on), dualMemberOf: dual, dualConsent: consent, notes: (r?.notes as string | null) ?? null, vehicles: vs.map((v) => ({ id: v.id, registration: v.registration, licence: v.licence.status })), owedCents: led?.owedCents ?? 0, overdueCents: led?.overdueCents ?? 0, daysOverdue: led?.daysOverdue ?? 0, disciplinaryCases: { open: mine.filter((c) => !c.closed_on).length, closed: mine.filter((c) => !!c.closed_on).length }, recentTrips: trips };
    });
    const nm = await nonMembers(assoc), observed = (await routes.report(assoc, onDay)).routes.flatMap((r) => r.nonMemberOperators.map((o) => ({ ...o, route: r.name }))), listed = new Set(nm.filter((n) => !n.endedOn).map((n) => plate(n.vehicleRegistration))), unregistered = [...new Map(observed.filter((o) => !listed.has(plate(o.registration))).map((o) => [plate(o.registration), o])).values()];
    if (unregistered.length) flags.push({ id: "members:nonmember:unregistered", category: "members", severity: "low", message: `${unregistered.length} vehicle${unregistered.length === 1 ? "" : "s"} from outside the association operated on your routes in the last 30 days and ${unregistered.length === 1 ? "is" : "are"} not in your register of non-member operators`, subject: "Non-member operators", dueOn: null });
    return { today: onDay, members: rows, nonMembers: nm, unregisteredOperators: unregistered.map((o) => ({ registration: o.registration, owner: o.owner, route: o.route, trips: o.trips })), measures: { members: rows.length, suspended: rows.filter((r) => r.standing === "suspended").length, terminated: rows.filter((r) => r.standing === "terminated").length, identityRecordedPercent: pct(rows.filter((r) => r.idNumberMasked).length, rows.length), dualMembers: rows.filter((r) => r.dualMemberOf).length, activeNonMembers: nm.filter((n) => !n.endedOn).length }, flags: flags.sort(flagSort) };
  }
  /** Saves what the association holds about a member. Only the fields sent change. The ID number is checked against the entity type (a real South African ID for an individual), a card number belongs to one member only, and suspending or terminating a member needs a reason. */
  async function saveMember(assoc: string, by: string, memberId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!(await isOwnerMember(assoc, memberId))) return bad(404, "That member was not found");
    const cur = (await db.query(`SELECT * FROM member_register WHERE association_id = $1 AND member_id = $2`, [assoc, memberId])).rows[0] ?? {}, next: Record<string, unknown> = {};
    if (b.entityType !== undefined) { if (!ENTITY.includes(b.entityType as never)) return bad(400, "A member is an individual, company, close corporation, partnership, trust or other"); next.entity_type = b.entityType; }
    for (const [k, col, max] of [["legalName", "legal_name", 120], ["dualMemberOf", "dual_member_of", 120], ["notes", "notes", 300], ["standingReason", "standing_reason", 200]] as [string, string, number][]) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${k} is too long (at most ${max} characters)`); next[col] = t; }
    const entity = String(next.entity_type ?? cur.entity_type ?? "individual");
    if (b.idNumber !== undefined) { if (b.idNumber === null || b.idNumber === "") next.id_number = null; else if (typeof b.idNumber !== "string") return bad(400, "That is not a valid ID or company number"); else { const v = b.idNumber.replace(/\s/g, ""); if (entity === "individual" ? !validateSaId(v)?.valid : !/^[A-Za-z0-9/\-]{4,30}$/.test(v)) return bad(400, entity === "individual" ? "That is not a valid South African ID number" : "That is not a valid company or registration number"); next.id_number = v; } }
    else if (b.entityType !== undefined && cur.id_number && (entity === "individual" ? !validateSaId(String(cur.id_number))?.valid : false)) return bad(400, "The number on record is not a South African ID: change it as well");
    if (b.phone !== undefined) { if (b.phone === null || b.phone === "") next.phone = null; else { const p = typeof b.phone === "string" ? b.phone.replace(/[\s-]/g, "") : ""; if (!/^\+?\d{9,15}$/.test(p)) return bad(400, "Give a phone number with its digits, for example +27821234567"); next.phone = p; } }
    if (b.cardNumber !== undefined) { const c = text(b.cardNumber, 40); if (c === false) return bad(400, "The card number is too long"); if (c && (await db.query(`SELECT member_id FROM member_register WHERE association_id = $1 AND lower(card_number) = $2 AND member_id <> $3`, [assoc, c.toLowerCase(), memberId])).rows.length) return bad(409, "That card number belongs to another member"); next.card_number = c; }
    if (b.dualConsent !== undefined) { if (typeof b.dualConsent !== "boolean") return bad(400, "Consent is yes or no"); next.dual_consent = b.dualConsent; }
    if (b.standing !== undefined) {
      if (!STANDING.includes(b.standing as never)) return bad(400, "A member is active, suspended or terminated"); const reason = next.standing_reason !== undefined ? next.standing_reason : cur.standing_reason;
      if (b.standing !== "active" && !reason) return bad(400, "Say why the member is " + b.standing); next.standing = b.standing; if (b.standing === "active") next.standing_reason = null; if (b.standing !== cur.standing) next.standing_changed_on = today();
    }
    const before = { entity_type: "individual", standing: "active", dual_consent: false, ...cur } as Record<string, unknown>, merged = { ...before, ...next } as Record<string, unknown>; if (!merged.dual_member_of) merged.dual_consent = false;
    if (!Object.keys(next).length) return bad(400, "Nothing to change");
    await db.query(`INSERT INTO member_register (association_id, member_id, legal_name, entity_type, id_number, phone, card_number, standing, standing_reason, standing_changed_on, dual_member_of, dual_consent, notes, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
                    ON CONFLICT (association_id, member_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, entity_type = EXCLUDED.entity_type, id_number = EXCLUDED.id_number, phone = EXCLUDED.phone, card_number = EXCLUDED.card_number, standing = EXCLUDED.standing, standing_reason = EXCLUDED.standing_reason, standing_changed_on = EXCLUDED.standing_changed_on, dual_member_of = EXCLUDED.dual_member_of, dual_consent = EXCLUDED.dual_consent, notes = EXCLUDED.notes, updated_at = now()`,
      [assoc, memberId, merged.legal_name ?? null, merged.entity_type, merged.id_number ?? null, merged.phone ?? null, merged.card_number ?? null, merged.standing, merged.standing_reason ?? null, merged.standing_changed_on ?? null, merged.dual_member_of ?? null, !!merged.dual_consent, merged.notes ?? null]);
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [memberId])).rows[0]?.name ?? "");
    for (const k of Object.keys(next)) if (k !== "standing_changed_on" && JSON.stringify(val(k, before[k])) !== JSON.stringify(next[k] ?? null)) await log(assoc, "member", memberId, `${name}: ${k === "id_number" ? "ID or company number changed" : k === "phone" ? "phone changed" : `${k} ${before[k] ?? "(empty)"} → ${next[k] ?? "(empty)"}`}`, by);
    return { ok: true, value: { id: memberId } };
  }

  /* ───────────────────────── operators who are not members ───────────────────────── */
  const nmOf = (r: Row) => ({ id: String(r.id), name: String(r.name), phone: (r.phone as string | null) ?? null, vehicleRegistration: String(r.vehicle_registration), routeLabel: (r.route_label as string | null) ?? null, notedOn: dayOf(r.noted_on)!, notes: (r.notes as string | null) ?? null, endedOn: dayOf(r.ended_on) });
  async function nonMembers(assoc: string) { return (await db.query(`SELECT * FROM non_member_operators WHERE association_id = $1 ORDER BY noted_on DESC, created_at DESC LIMIT 500`, [assoc])).rows.map(nmOf); }
  /** Records an operator on the association's routes who is not a member. A vehicle that belongs to a member cannot be entered here, and one vehicle is listed once while it is active. */
  async function addNonMember(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const name = text(b.name, 100), reg = text(b.vehicleRegistration, 20), route = text(b.routeLabel, 120), notes = text(b.notes, 300); if (!name) return bad(400, "Give the operator's name"); if (!reg) return bad(400, "Give the vehicle's registration"); if ([route, notes].some((x) => x === false)) return bad(400, "A field is too long");
    let phone: string | null = null; if (b.phone !== undefined && b.phone !== null && b.phone !== "") { const p = typeof b.phone === "string" ? b.phone.replace(/[\s-]/g, "") : ""; if (!/^\+?\d{9,15}$/.test(p)) return bad(400, "Give a phone number with its digits, for example +27821234567"); phone = p; }
    if (!isDay(b.notedOn) || (b.notedOn as string) > today()) return bad(400, "Give the date it was noted (not in the future)"); const rg = plate(reg as string);
    const mine = (await comp.vehicles(assoc, today())).find((v) => plate(v.registration) === rg); if (mine) return bad(409, `${mine.registration} belongs to your member ${mine.owner}`);
    if ((await nonMembers(assoc)).some((n) => !n.endedOn && plate(n.vehicleRegistration) === rg)) return bad(409, "That vehicle is already in your register of non-member operators");
    const r = (await db.query(`INSERT INTO non_member_operators (association_id, name, phone, vehicle_registration, route_label, noted_on, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [assoc, name, phone, rg, route, b.notedOn, notes])).rows[0]; await log(assoc, "non_member", String(r.id), `non-member operator ${name} (${rg}) recorded`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function endNonMember(assoc: string, by: string, id: string, endedOn: unknown): Promise<Res<{ id: string }>> {
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM non_member_operators WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] : null; if (!r) return bad(404, "Operator not found"); if (r.ended_on) return bad(409, "That entry has already ended");
    if (!isDay(endedOn) || (endedOn as string) < dayOf(r.noted_on)! || (endedOn as string) > today()) return bad(400, "Give the date they stopped operating (after it was noted, not in the future)"); await db.query(`UPDATE non_member_operators SET ended_on = $2 WHERE id = $1`, [id, endedOn]); await log(assoc, "non_member", id, `non-member operator ${r.name} (${r.vehicle_registration}) ended on ${endedOn}`, by); return { ok: true, value: { id } };
  }

  /* ───────────────────────── owner formalisation ───────────────────────── */
  /** Saves what an owner has told the association about their business and employer registrations. A SARS tax reference is ten digits. */
  async function saveBusiness(assoc: string, by: string, ownerId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!(await isOwnerMember(assoc, ownerId))) return bad(404, "That owner was not found");
    const cur = (await db.query(`SELECT * FROM owner_business WHERE association_id = $1 AND owner_id = $2`, [assoc, ownerId])).rows[0] ?? {}, next: Record<string, unknown> = {};
    if (b.businessType !== undefined) { if (!BUSINESS.includes(b.businessType as never)) return bad(400, "A business is a sole proprietor, company, close corporation, partnership, trust or other"); next.business_type = b.businessType; }
    if (b.filingStatus !== undefined) { if (!FILING.includes(b.filingStatus as never)) return bad(400, "Tax filing is up to date, overdue, not applicable or not known"); next.filing_status = b.filingStatus; }
    for (const [k, col] of [["taxRegistered", "tax_registered"], ["uifEmployer", "uif_employer"], ["coidaEmployer", "coida_employer"], ["sdlRegistered", "sdl_registered"]] as [string, string][]) if (b[k] !== undefined) { if (typeof b[k] !== "boolean") return bad(400, `${k} is yes or no`); next[col] = b[k]; }
    if (b.registrationNo !== undefined) { const t = text(b.registrationNo, 40); if (t === false) return bad(400, "The registration number is too long"); next.registration_no = t; }
    if (b.taxNumber !== undefined) { if (b.taxNumber === null || b.taxNumber === "") next.tax_number = null; else { const t = typeof b.taxNumber === "string" ? b.taxNumber.replace(/\s/g, "") : ""; if (!/^\d{10}$/.test(t)) return bad(400, "A SARS tax reference number is ten digits"); next.tax_number = t; } }
    if (b.checkedOn !== undefined) { if (b.checkedOn !== null && b.checkedOn !== "" && (!isDay(b.checkedOn) || (b.checkedOn as string) > today())) return bad(400, "Give the date it was checked (not in the future)"); next.checked_on = b.checkedOn || null; }
    if (b.notes !== undefined) { const t = text(b.notes, 300); if (t === false) return bad(400, "The notes are too long"); next.notes = t; }
    if (!Object.keys(next).length) return bad(400, "Nothing to change");
    const before = { business_type: "unknown", filing_status: "unknown", tax_registered: false, uif_employer: false, coida_employer: false, sdl_registered: false, ...cur } as Record<string, unknown>, m = { ...before, ...next } as Record<string, unknown>;
    await db.query(`INSERT INTO owner_business (association_id, owner_id, business_type, registration_no, tax_number, tax_registered, filing_status, uif_employer, coida_employer, sdl_registered, checked_on, notes, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
                    ON CONFLICT (association_id, owner_id) DO UPDATE SET business_type = EXCLUDED.business_type, registration_no = EXCLUDED.registration_no, tax_number = EXCLUDED.tax_number, tax_registered = EXCLUDED.tax_registered, filing_status = EXCLUDED.filing_status, uif_employer = EXCLUDED.uif_employer, coida_employer = EXCLUDED.coida_employer, sdl_registered = EXCLUDED.sdl_registered, checked_on = EXCLUDED.checked_on, notes = EXCLUDED.notes, updated_at = now()`,
      [assoc, ownerId, m.business_type, m.registration_no ?? null, m.tax_number ?? null, !!m.tax_registered, m.filing_status, !!m.uif_employer, !!m.coida_employer, !!m.sdl_registered, m.checked_on ?? null, m.notes ?? null]);
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [ownerId])).rows[0]?.name ?? "");
    for (const k of Object.keys(next)) if (JSON.stringify(val(k, before[k])) !== JSON.stringify(next[k] ?? null)) await log(assoc, "owner_business", ownerId, `${name}: ${k === "tax_number" ? "tax number changed" : `${k} ${before[k] ?? "(empty)"} → ${next[k] ?? "(empty)"}`}`, by);
    return { ok: true, value: { id: ownerId } };
  }
  /** Each owner's business and employer registrations beside the drivers they employ, with what stands out. It reports; it does not advise. */
  async function formalisation(assoc: string, onDay = today()) {
    const ms = await members(assoc), biz = (await db.query(`SELECT * FROM owner_business WHERE association_id = $1`, [assoc])).rows, links = (await db.query(`SELECT od.owner_id, od.driver_id FROM owner_drivers od JOIN memberships m ON m.member_id = od.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' WHERE od.status = 'active'`, [assoc])).rows, regs = (await db.query(`SELECT * FROM driver_register`)).rows, flags: Flag[] = [];
    const rows = ms.map((m) => {
      const id = String(m.member_id), b = biz.find((x) => String(x.owner_id) === id), name = String(m.name), drivers = links.filter((l) => String(l.owner_id) === id).map((l) => regs.find((r) => String(r.driver_id) === String(l.driver_id)) ?? {}), n = drivers.length;
      const formal = drivers.filter((r) => r.employment_status === "employed" && r.contract_on_file && r.uif_registered && r.coida_registered).length, cash = drivers.filter((r) => r.pay_basis === "cash" && !r.contract_on_file).length, type = String(b?.business_type ?? "unknown"), uif = !!b?.uif_employer, coida = !!b?.coida_employer, sdl = !!b?.sdl_registered, filing = String(b?.filing_status ?? "unknown");
      if (type === "unknown") flags.push({ id: `formal:type:${id}`, category: "formalisation", severity: "low", message: `${name}'s business type and registrations have not been recorded`, subject: name, dueOn: null });
      if (n > 0 && !uif) flags.push({ id: `formal:uif:${id}`, category: "formalisation", severity: "medium", message: `${name} has ${n} driver${n === 1 ? "" : "s"} on record but is not recorded as registered with UIF as an employer`, subject: name, dueOn: null });
      if (n > 0 && !coida) flags.push({ id: `formal:coida:${id}`, category: "formalisation", severity: "medium", message: `${name} has ${n} driver${n === 1 ? "" : "s"} on record but is not recorded as registered with COIDA as an employer`, subject: name, dueOn: null });
      if (n > 0 && !sdl) flags.push({ id: `formal:sdl:${id}`, category: "formalisation", severity: "low", message: `${name} is not recorded as registered for the Skills Development Levy (it applies only to employers above a payroll threshold)`, subject: name, dueOn: null });
      if (filing === "overdue") flags.push({ id: `formal:filing:${id}`, category: "formalisation", severity: "medium", message: `${name} has reported that their tax filing is overdue`, subject: name, dueOn: null });
      if (cash > 0) flags.push({ id: `formal:cash:${id}`, category: "formalisation", severity: "low", message: `${cash} of ${name}'s ${n} drivers ${cash === 1 ? "is" : "are"} paid in cash with no contract on file`, subject: name, dueOn: null });
      return { ownerId: id, name, businessType: type, registrationNo: (b?.registration_no as string | null) ?? null, taxNumberMasked: mask(b?.tax_number, 3), taxRegistered: !!b?.tax_registered, filingStatus: filing, uifEmployer: uif, coidaEmployer: coida, sdlRegistered: sdl, checkedOn: dayOf(b?.checked_on), notes: (b?.notes as string | null) ?? null, drivers: n, driversFormal: formal, driversPaidCashNoContract: cash };
    });
    const nd = rows.reduce((a, r) => a + r.drivers, 0), nf = rows.reduce((a, r) => a + r.driversFormal, 0);
    return { today: onDay, owners: rows, measures: { owners: rows.length, businessRecordedPercent: pct(rows.filter((r) => r.businessType !== "unknown").length, rows.length), taxRegisteredPercent: pct(rows.filter((r) => r.taxRegistered).length, rows.length), employersRegisteredPercent: pct(rows.filter((r) => r.drivers > 0 && r.uifEmployer && r.coidaEmployer).length, rows.filter((r) => r.drivers > 0).length), drivers: nd, driversFormal: nf, driversFormalPercent: pct(nf, nd) }, flags: flags.sort(flagSort) };
  }
  return { register, saveMember, nonMembers, addNonMember, endNonMember, saveBusiness, formalisation };
}
export type Members = ReturnType<typeof createMembers>;
