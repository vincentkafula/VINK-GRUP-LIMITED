import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { validateSaId } from "./saIdValidator.js";
import { createLicenceRules, isProvince, yearsText } from "./licenceRules.js";

/**
 * ASSOCIATION COMPLIANCE (docs/ASSOCIATION_COMPLIANCE.md): the registers every other control reads from, and the rules that turn them into warnings.
 *   registration   the association's own registration, its constitution and code, and its office bearers
 *   vehicles       each vehicle and what is held about it; the operating licence follows the VEHICLE and its owner, not membership, so it is stored per vehicle
 *   licences       valid / expired / application lodged / none. An application is NOT a licence: a vehicle with only an application lodged counts as unlicensed
 *   drivers        identity, permit, employer and vehicle, and employment formalities. Drivers are employed by owners, not by the association
 *   the overview   the headline share of vehicles and drivers that are legal today, the flags, the expiries coming at 180, 90 and 30 days, and a monthly trend
 * Everything here is the association's own record. The system never decides that a vehicle is licensed: it reports what has been entered, and says plainly when nothing has.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const DAY = /^\d{4}-\d{2}-\d{2}$/, UUID = /^[0-9a-f-]{36}$/i;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export function addYears(day: string, years: number): string { const d = new Date(`${day}T00:00:00Z`); const m = d.getUTCMonth(); d.setUTCFullYear(d.getUTCFullYear() + years); if (d.getUTCMonth() !== m) d.setUTCDate(0); return d.toISOString().slice(0, 10); }
export function addMonths(day: string, months: number): string { const d = new Date(`${day}T00:00:00Z`), dom = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(dom, last)); return d.toISOString().slice(0, 10); }

/** How near an expiry is: past, within 30, 90 or 180 days (the recommended alert schedule), or comfortably away; or not on record at all. */
export type Band = "missing" | "expired" | "30" | "90" | "180" | "ok";
export function expiryBand(expiresOn: string | null, today: string): { band: Band; days: number | null } {
  if (!expiresOn) return { band: "missing", days: null };
  const days = daysBetween(today, expiresOn);
  return { band: days < 0 ? "expired" : days <= 30 ? "30" : days <= 90 ? "90" : days <= 180 ? "180" : "ok", days };
}
export type LicenceStatus = "valid" | "expired" | "application_lodged" | "not_yet_valid" | "none";
/** A vehicle is licensed only if a licence on file covers today. A pending application does not make it so: it is reported separately, as unlicensed. */
export function licenceStatus(licences: { validFrom: string; validUntil: string }[], pendingApplication: boolean, today: string): { status: LicenceStatus; validUntil: string | null } {
  const covering = licences.filter((l) => l.validFrom <= today && l.validUntil >= today).sort((a, b) => b.validUntil.localeCompare(a.validUntil))[0];
  if (covering) return { status: "valid", validUntil: covering.validUntil };
  const latest = [...licences].sort((a, b) => b.validUntil.localeCompare(a.validUntil))[0] ?? null;
  if (pendingApplication) return { status: "application_lodged", validUntil: latest?.validUntil ?? null };
  if (!latest) return { status: "none", validUntil: null };
  return { status: latest.validFrom > today ? "not_yet_valid" : "expired", validUntil: latest.validUntil };
}

export type Severity = "high" | "medium" | "low";
export interface Flag { id: string; category: string; severity: Severity; message: string; subject: string; dueOn: string | null }
const SEV: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
export const flagSort = (a: Flag, b: Flag) => SEV[a.severity] - SEV[b.severity] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id);
const STATUSES = ["conditional", "provisional", "full", "suspended"] as const;
const TRI = ["unknown", "none", "installed"] as const, RECAP = ["unknown", "not_applicable", "applied", "completed", "scrapped"] as const, VSTATE = ["active", "off_road", "replaced"] as const;
const EMPLOY = ["unknown", "employed", "contractor", "owner_driver"] as const, PAY = ["unknown", "salary", "daily_rate", "commission", "cash", "other"] as const;
const DOC_KINDS = ["registration_certificate", "constitution", "code_of_conduct", "other"] as const;
/** Optional text: null when not given, the trimmed text when fine, false when it was given but is not text or is too long. */
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const maskId = (v: unknown) => (typeof v === "string" && v.length >= 5 ? `${"•".repeat(v.length - 4)}${v.slice(-4)}` : null);

export interface VehicleView { id: string; registration: string; make: string | null; model: string | null; seats: number | null; ownerId: string; owner: string; driver: string | null; compliance: Record<string, unknown>; licence: { status: LicenceStatus; validUntil: string | null; current: Record<string, unknown> | null; all: Record<string, unknown>[] }; applications: Record<string, unknown>[]; roadworthy: { band: Band; days: number | null }; insurance: { band: Band; days: number | null }; flags: Flag[] }
export interface DriverView { id: string; name: string; email: string; idNumberMasked: string | null; vehicle: string | null; vehicleId: string | null; employers: string[]; member: boolean; permit: { number: string | null; expiresOn: string | null; band: Band; days: number | null }; licence: { code: string | null; expiresOn: string | null; band: Band; days: number | null }; register: Record<string, unknown>; flags: Flag[] }

export function createCompliance(db: Db, now: () => Date = () => new Date()) {
  const rules = createLicenceRules(db, now);
  const today = () => saDay(now());
  const log = async (assoc: string, entity: string, entityId: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,$2,$3,$4,$5)`, [assoc, entity, entityId, summary.slice(0, 300), by]); };
  const isMemberOwner = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active' AND member_role = 'vehicle_owner'`, [assoc, id])).rows.length > 0;
  const isMember = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active'`, [assoc, id])).rows.length > 0;

  /* ───────────────────────── the association's registration ───────────────────────── */
  const REG_DEFAULT = { status: "conditional", registrationNumber: null, registrar: null, province: null, conditionalSince: null, conditionalLimitMonths: 12, registeredOn: null, certificateIssuedOn: null, renewalDueOn: null, minMembersRequired: null, constitutionVersion: null, constitutionDated: null, constitutionLodgedVersion: null, constitutionLodgedOn: null, codeVersion: null, codeDated: null, feeCapCents: null, notes: null, electionIntervalMonths: null, disciplineLimitDays: 90 };
  const regOf = (r: Row | undefined) => !r ? { ...REG_DEFAULT, recorded: false } : { recorded: true, status: String(r.status), registrationNumber: (r.registration_number as string | null) ?? null, registrar: (r.registrar as string | null) ?? null, province: (r.province as string | null) ?? null, conditionalSince: dayOf(r.conditional_since), conditionalLimitMonths: Number(r.conditional_limit_months), registeredOn: dayOf(r.registered_on), certificateIssuedOn: dayOf(r.certificate_issued_on), renewalDueOn: dayOf(r.renewal_due_on), minMembersRequired: r.min_members_required === null ? null : Number(r.min_members_required), constitutionVersion: (r.constitution_version as string | null) ?? null, constitutionDated: dayOf(r.constitution_dated), constitutionLodgedVersion: (r.constitution_lodged_version as string | null) ?? null, constitutionLodgedOn: dayOf(r.constitution_lodged_on), codeVersion: (r.code_version as string | null) ?? null, codeDated: dayOf(r.code_dated), feeCapCents: r.fee_cap_cents === null ? null : Number(r.fee_cap_cents), notes: (r.notes as string | null) ?? null, electionIntervalMonths: r.election_interval_months === null || r.election_interval_months === undefined ? null : Number(r.election_interval_months), disciplineLimitDays: Number(r.discipline_limit_days ?? 90) };
  async function memberCount(assoc: string): Promise<number> { return Number((await db.query(`SELECT COUNT(*) AS n FROM memberships WHERE association_id = $1 AND status = 'active' AND member_role = 'vehicle_owner'`, [assoc])).rows[0].n); }
  async function registration(assoc: string) { return { ...regOf((await db.query(`SELECT * FROM association_registration WHERE association_id = $1`, [assoc])).rows[0]), memberCount: await memberCount(assoc) }; }
  const DAY_FIELDS: [string, string][] = [["conditionalSince", "conditional_since"], ["registeredOn", "registered_on"], ["certificateIssuedOn", "certificate_issued_on"], ["renewalDueOn", "renewal_due_on"], ["constitutionDated", "constitution_dated"], ["constitutionLodgedOn", "constitution_lodged_on"], ["codeDated", "code_dated"]];
  const TEXT_FIELDS: [string, string, number][] = [["registrationNumber", "registration_number", 60], ["registrar", "registrar", 120], ["province", "province", 60], ["constitutionVersion", "constitution_version", 40], ["constitutionLodgedVersion", "constitution_lodged_version", 40], ["codeVersion", "code_version", 40], ["notes", "notes", 500]];
  /** Records what the association's registrar has told it. Only the fields sent change; every change is written to the change history. */
  async function saveRegistration(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<Awaited<ReturnType<typeof registration>>>> {
    const before = await registration(assoc), next: Record<string, unknown> = {};
    if (b.status !== undefined) { if (!STATUSES.includes(b.status as never)) return bad(400, "Registration is conditional, provisional, full or suspended"); next.status = b.status; }
    for (const [k] of DAY_FIELDS) if (b[k] !== undefined) { if (b[k] !== null && b[k] !== "" && !isDay(b[k])) return bad(400, `Give ${k} as YYYY-MM-DD`); next[k] = b[k] === "" ? null : b[k]; }
    for (const [k, , max] of TEXT_FIELDS) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${k} is too long (at most ${max} characters)`); next[k] = t; }
    if (b.minMembersRequired !== undefined) { if (b.minMembersRequired !== null && (!Number.isInteger(b.minMembersRequired) || (b.minMembersRequired as number) < 0 || (b.minMembersRequired as number) > 100_000)) return bad(400, "The minimum number of members is a whole number"); next.minMembersRequired = b.minMembersRequired; }
    if (b.conditionalLimitMonths !== undefined) { if (!Number.isInteger(b.conditionalLimitMonths) || (b.conditionalLimitMonths as number) < 1 || (b.conditionalLimitMonths as number) > 120) return bad(400, "How long registration may stay conditional is 1 to 120 months"); next.conditionalLimitMonths = b.conditionalLimitMonths; }
    if (b.feeCapCents !== undefined) { if (b.feeCapCents !== null && (!Number.isInteger(b.feeCapCents) || (b.feeCapCents as number) < 0)) return bad(400, "The fee cap is an amount of cents"); next.feeCapCents = b.feeCapCents; }
    if (b.electionIntervalMonths !== undefined) { if (b.electionIntervalMonths !== null && (!Number.isInteger(b.electionIntervalMonths) || (b.electionIntervalMonths as number) < 1 || (b.electionIntervalMonths as number) > 120)) return bad(400, "How often elections are held is 1 to 120 months"); next.electionIntervalMonths = b.electionIntervalMonths; }
    if (b.disciplineLimitDays !== undefined) { if (!Number.isInteger(b.disciplineLimitDays) || (b.disciplineLimitDays as number) < 7 || (b.disciplineLimitDays as number) > 730) return bad(400, "How long a disciplinary case may stay open is 7 to 730 days"); next.disciplineLimitDays = b.disciplineLimitDays; }
    const merged = { ...before, ...next } as Record<string, unknown>;
    await db.query(`INSERT INTO association_registration (association_id, status, registration_number, registrar, province, conditional_since, conditional_limit_months, registered_on, certificate_issued_on, renewal_due_on, min_members_required, constitution_version, constitution_dated, constitution_lodged_version, constitution_lodged_on, code_version, code_dated, fee_cap_cents, notes, election_interval_months, discipline_limit_days, updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
                    ON CONFLICT (association_id) DO UPDATE SET status = EXCLUDED.status, registration_number = EXCLUDED.registration_number, registrar = EXCLUDED.registrar, province = EXCLUDED.province, conditional_since = EXCLUDED.conditional_since, conditional_limit_months = EXCLUDED.conditional_limit_months,
                      registered_on = EXCLUDED.registered_on, certificate_issued_on = EXCLUDED.certificate_issued_on, renewal_due_on = EXCLUDED.renewal_due_on, min_members_required = EXCLUDED.min_members_required, constitution_version = EXCLUDED.constitution_version, constitution_dated = EXCLUDED.constitution_dated,
                      constitution_lodged_version = EXCLUDED.constitution_lodged_version, constitution_lodged_on = EXCLUDED.constitution_lodged_on, code_version = EXCLUDED.code_version, code_dated = EXCLUDED.code_dated, fee_cap_cents = EXCLUDED.fee_cap_cents, notes = EXCLUDED.notes, election_interval_months = EXCLUDED.election_interval_months, discipline_limit_days = EXCLUDED.discipline_limit_days, updated_at = now()`,
      [assoc, merged.status, merged.registrationNumber ?? null, merged.registrar ?? null, merged.province ?? null, merged.conditionalSince ?? null, merged.conditionalLimitMonths, merged.registeredOn ?? null, merged.certificateIssuedOn ?? null, merged.renewalDueOn ?? null, merged.minMembersRequired ?? null, merged.constitutionVersion ?? null, merged.constitutionDated ?? null, merged.constitutionLodgedVersion ?? null, merged.constitutionLodgedOn ?? null, merged.codeVersion ?? null, merged.codeDated ?? null, merged.feeCapCents ?? null, merged.notes ?? null, merged.electionIntervalMonths ?? null, merged.disciplineLimitDays ?? 90]);
    for (const k of Object.keys(next)) if (JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(next[k] ?? null)) await log(assoc, "registration", null, `${k}: ${(before as Record<string, unknown>)[k] ?? "(empty)"} → ${next[k] ?? "(empty)"}`, by);
    return { ok: true, value: await registration(assoc) };
  }

  /* ───────────────────────── office bearers, documents, acceptances ───────────────────────── */
  const bearerOf = (r: Row) => ({ id: String(r.id), memberId: (r.member_id as string | null) ?? null, name: String(r.name), office: String(r.office), termStart: dayOf(r.term_start), termEnd: dayOf(r.term_end) });
  async function officeBearers(assoc: string) { return (await db.query(`SELECT * FROM office_bearers WHERE association_id = $1 ORDER BY office, name`, [assoc])).rows.map(bearerOf); }
  async function addOfficeBearer(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const name = text(b.name, 120), office = text(b.office, 80); if (!name || !office) return bad(400, "Give the person's name and the office they hold");
    for (const k of ["termStart", "termEnd"]) if (b[k] !== undefined && b[k] !== null && b[k] !== "" && !isDay(b[k])) return bad(400, `Give ${k} as YYYY-MM-DD`);
    const start = b.termStart || null, end = b.termEnd || null; if (start && end && end < start) return bad(400, "A term ends after it starts");
    if (b.memberId !== undefined && b.memberId !== null && !(await isMember(assoc, b.memberId))) return bad(400, "Choose one of your members");
    const r = (await db.query(`INSERT INTO office_bearers (association_id, member_id, name, office, term_start, term_end) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [assoc, b.memberId ?? null, name, office, start, end])).rows[0];
    await log(assoc, "office_bearer", String(r.id), `added ${name} as ${office}${end ? `, term ends ${end}` : ""}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function updateOfficeBearer(assoc: string, by: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const cur = (await db.query(`SELECT * FROM office_bearers WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0]; if (!cur) return bad(404, "Office bearer not found");
    for (const k of ["termStart", "termEnd"]) if (b[k] !== undefined && b[k] !== null && b[k] !== "" && !isDay(b[k])) return bad(400, `Give ${k} as YYYY-MM-DD`);
    const start = b.termStart === undefined ? dayOf(cur.term_start) : b.termStart || null, end = b.termEnd === undefined ? dayOf(cur.term_end) : b.termEnd || null; if (start && end && end < start) return bad(400, "A term ends after it starts");
    await db.query(`UPDATE office_bearers SET term_start = $2, term_end = $3 WHERE id = $1`, [id, start, end]); await log(assoc, "office_bearer", id, `${cur.name} (${cur.office}): term ${start ?? "?"} to ${end ?? "?"}`, by); return { ok: true, value: { id } };
  }
  async function removeOfficeBearer(assoc: string, by: string, id: string): Promise<Res<{ id: string }>> {
    const r = (await db.query(`DELETE FROM office_bearers WHERE id = $1 AND association_id = $2 RETURNING name, office`, [id, assoc])).rows[0]; if (!r) return bad(404, "Office bearer not found");
    await log(assoc, "office_bearer", id, `removed ${r.name} (${r.office})`, by); return { ok: true, value: { id } };
  }
  const docOf = (r: Row) => ({ id: String(r.id), kind: String(r.kind), title: String(r.title), reference: (r.reference as string | null) ?? null, version: (r.version as string | null) ?? null, datedOn: dayOf(r.dated_on), expiresOn: dayOf(r.expires_on), heldAt: (r.held_at as string | null) ?? null });
  async function documents(assoc: string) { return (await db.query(`SELECT * FROM association_documents WHERE association_id = $1 ORDER BY kind, dated_on DESC`, [assoc])).rows.map(docOf); }
  async function addDocument(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!DOC_KINDS.includes(b.kind as never)) return bad(400, "Choose the certificate, constitution, code of conduct or other");
    const title = text(b.title, 120); if (!title) return bad(400, "Give the document a title");
    for (const k of ["datedOn", "expiresOn"]) if (b[k] !== undefined && b[k] !== null && b[k] !== "" && !isDay(b[k])) return bad(400, `Give ${k} as YYYY-MM-DD`);
    const ref = text(b.reference, 80), ver = text(b.version, 40), held = text(b.heldAt, 160); if (ref === false || ver === false || held === false) return bad(400, "A reference, version or place is too long");
    const r = (await db.query(`INSERT INTO association_documents (association_id, kind, title, reference, version, dated_on, expires_on, held_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [assoc, b.kind, title, ref, ver, b.datedOn || null, b.expiresOn || null, held])).rows[0];
    await log(assoc, "document", String(r.id), `recorded ${b.kind}: ${title}${ver ? ` (version ${ver})` : ""}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function removeDocument(assoc: string, by: string, id: string): Promise<Res<{ id: string }>> {
    const r = (await db.query(`DELETE FROM association_documents WHERE id = $1 AND association_id = $2 RETURNING title`, [id, assoc])).rows[0]; if (!r) return bad(404, "Document not found");
    await log(assoc, "document", id, `removed ${r.title}`, by); return { ok: true, value: { id } };
  }
  /** A member's signed acceptance of a version of the constitution and code. */
  async function recordAcceptance(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ ok: true }>> {
    if (!(await isMemberOwner(assoc, b.memberId))) return bad(400, "Choose one of your members");
    const version = text(b.version, 40); if (!version) return bad(400, "Say which version of the constitution was accepted");
    if (!isDay(b.acceptedOn) || (b.acceptedOn as string) > today()) return bad(400, "Give the date it was accepted (not in the future)");
    const ref = text(b.reference, 80); if (ref === false) return bad(400, "The reference is too long");
    await db.query(`INSERT INTO member_acceptances (association_id, member_id, constitution_version, accepted_on, reference) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (association_id, member_id, constitution_version) DO UPDATE SET accepted_on = EXCLUDED.accepted_on, reference = EXCLUDED.reference`, [assoc, b.memberId, version, b.acceptedOn, ref]);
    await log(assoc, "acceptance", String(b.memberId), `acceptance of version ${version} on ${b.acceptedOn}`, by); return { ok: true, value: { ok: true } };
  }
  /** Who has signed the current version, and who has not. */
  async function acceptances(assoc: string) {
    const reg = await registration(assoc), members = (await db.query(`SELECT m.member_id, u.name FROM memberships m JOIN users u ON u.id = m.member_id WHERE m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' ORDER BY u.name`, [assoc])).rows;
    const done = (await db.query(`SELECT member_id, constitution_version, accepted_on, reference FROM member_acceptances WHERE association_id = $1`, [assoc])).rows;
    const cur = reg.constitutionVersion;
    return { constitutionVersion: cur, members: members.map((m) => { const mine = done.filter((d) => String(d.member_id) === String(m.member_id)), c = mine.find((d) => d.constitution_version === cur); return { memberId: String(m.member_id), name: String(m.name), acceptedCurrent: !!c, acceptedOn: c ? dayOf(c.accepted_on) : null, versionsAccepted: mine.map((d) => String(d.constitution_version)) }; }) };
  }

  /* ───────────────────────── the vehicle register and operating licences ───────────────────────── */
  const OWN = `JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner'`;
  async function ownVehicle(assoc: string, id: unknown): Promise<Row | null> { return typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT v.* FROM vehicles v ${OWN} WHERE v.id = $2`, [assoc, id])).rows[0] ?? null : null; }
  async function vehicleViews(assoc: string, onDay: string): Promise<VehicleView[]> {
    const vs = (await db.query(`SELECT v.id, v.registration, v.make, v.model, v.seats, v.owner_id, v.driver_id, o.name AS owner, d.name AS driver FROM vehicles v ${OWN} JOIN users o ON o.id = v.owner_id LEFT JOIN users d ON d.id = v.driver_id ORDER BY v.registration`, [assoc])).rows;
    const comp = (await db.query(`SELECT c.* FROM vehicle_compliance c JOIN vehicles v ON v.id = c.vehicle_id ${OWN}`, [assoc])).rows, lic = (await db.query(`SELECT l.* FROM operating_licences l JOIN vehicles v ON v.id = l.vehicle_id ${OWN}`, [assoc])).rows, apps = (await db.query(`SELECT a.* FROM licence_applications a JOIN vehicles v ON v.id = a.vehicle_id ${OWN} ORDER BY a.lodged_on DESC`, [assoc])).rows;
    const byId = new Map(vs.map((v) => [String(v.id), v])), out: VehicleView[] = [];
    const licOfVeh = (id: string) => lic.filter((l) => String(l.vehicle_id) === id).map((l) => ({ id: String(l.id), licenceNumber: String(l.licence_number), authority: (l.authority as string | null) ?? null, holder: (l.holder_name as string | null) ?? null, validFrom: dayOf(l.valid_from)!, validUntil: dayOf(l.valid_until)!, route: (l.condition_route as string | null) ?? null, area: (l.condition_area as string | null) ?? null, times: (l.condition_times as string | null) ?? null, province: (l.province as string | null) ?? null }));
    const statusOf = (id: string) => { const all = licOfVeh(id), pending = apps.some((a) => String(a.vehicle_id) === id && a.outcome === "pending"); return { all, ...licenceStatus(all, pending, onDay) }; };
    for (const v of vs) {
      const id = String(v.id), c = comp.find((x) => String(x.vehicle_id) === id), l = statusOf(id), flags: Flag[] = [], reg = String(v.registration);
      const cx = { vin: (c?.vin as string | null) ?? null, roadworthyExpiry: dayOf(c?.roadworthy_expiry), roadworthyRef: (c?.roadworthy_ref as string | null) ?? null, insurer: (c?.insurer as string | null) ?? null, policyNumber: (c?.policy_number as string | null) ?? null, insuranceExpiry: dayOf(c?.insurance_expiry), tracker: String(c?.tracker ?? "unknown"), camera: String(c?.camera ?? "unknown"), signageNote: (c?.signage_note as string | null) ?? null, recapStatus: String(c?.recap_status ?? "unknown"), state: String(c?.state ?? "active"), replacedBy: (c?.replaced_by as string | null) ?? null, replacedByRegistration: c?.replaced_by ? String(byId.get(String(c.replaced_by))?.registration ?? "") || null : null, replacementNote: (c?.replacement_note as string | null) ?? null };
      const rw = expiryBand(cx.roadworthyExpiry, onDay), ins = expiryBand(cx.insuranceExpiry, onDay), active = cx.state === "active";
      if (active) {
        if (l.status === "none") flags.push({ id: `veh:${id}:nolicence`, category: "licence", severity: "high", message: `${reg} has no operating licence on file`, subject: reg, dueOn: null });
        else if (l.status === "application_lodged") flags.push({ id: `veh:${id}:applonly`, category: "licence", severity: "high", message: `${reg} has only a licence application lodged: it counts as unlicensed until the licence is granted`, subject: reg, dueOn: null });
        else if (l.status === "expired") flags.push({ id: `veh:${id}:licexpired`, category: "licence", severity: "high", message: `${reg}'s operating licence expired on ${l.validUntil}`, subject: reg, dueOn: l.validUntil });
        else if (l.status === "not_yet_valid") flags.push({ id: `veh:${id}:licfuture`, category: "licence", severity: "high", message: `${reg}'s licence is not valid until a later date`, subject: reg, dueOn: l.validUntil });
        else { const b = expiryBand(l.validUntil, onDay); if (b.band !== "ok") flags.push({ id: `veh:${id}:licexpiring`, category: "licence", severity: b.band === "30" ? "high" : "medium", message: `${reg}'s operating licence expires in ${b.days} days (${l.validUntil})`, subject: reg, dueOn: l.validUntil }); }
        if (rw.band === "missing") flags.push({ id: `veh:${id}:rwmissing`, category: "vehicle", severity: "medium", message: `${reg} has no roadworthy certificate on record`, subject: reg, dueOn: null });
        else if (rw.band === "expired") flags.push({ id: `veh:${id}:rwexpired`, category: "vehicle", severity: "high", message: `${reg}'s roadworthy certificate expired on ${cx.roadworthyExpiry}`, subject: reg, dueOn: cx.roadworthyExpiry });
        else if (rw.band !== "ok") flags.push({ id: `veh:${id}:rwexpiring`, category: "vehicle", severity: rw.band === "30" ? "medium" : "low", message: `${reg}'s roadworthy certificate expires in ${rw.days} days (${cx.roadworthyExpiry})`, subject: reg, dueOn: cx.roadworthyExpiry });
        if (ins.band === "missing") flags.push({ id: `veh:${id}:insmissing`, category: "vehicle", severity: "medium", message: `${reg} has no insurance on record`, subject: reg, dueOn: null });
        else if (ins.band === "expired") flags.push({ id: `veh:${id}:insexpired`, category: "vehicle", severity: "high", message: `${reg}'s insurance expired on ${cx.insuranceExpiry}`, subject: reg, dueOn: cx.insuranceExpiry });
        else if (ins.band !== "ok") flags.push({ id: `veh:${id}:insexpiring`, category: "vehicle", severity: ins.band === "30" ? "medium" : "low", message: `${reg}'s insurance expires in ${ins.days} days (${cx.insuranceExpiry})`, subject: reg, dueOn: cx.insuranceExpiry });
      }
      if (cx.state === "replaced" && cx.replacedBy && statusOf(cx.replacedBy).status !== "valid") flags.push({ id: `veh:${id}:replacement`, category: "licence", severity: "medium", message: `${reg} was replaced by ${cx.replacedByRegistration ?? "another vehicle"}, which has no valid licence yet: the licence must be amended`, subject: reg, dueOn: null });
      for (const x of l.all) { const rule = await rules.forProvince(x.province); if (addYears(x.validFrom, rule.maxYears) < x.validUntil) flags.push({ id: `veh:${id}:licspan:${x.id}`, category: "data", severity: "low", message: `${reg}'s licence ${x.licenceNumber} is recorded as lasting more than ${yearsText(rule.maxYears)}${x.province ? ` (the limit set for ${x.province})` : ""}: check the dates`, subject: reg, dueOn: null }); }
      out.push({ id, registration: reg, make: (v.make as string | null) ?? null, model: (v.model as string | null) ?? null, seats: v.seats === null ? null : Number(v.seats), ownerId: String(v.owner_id), owner: String(v.owner), driver: (v.driver as string | null) ?? null, compliance: cx, licence: { status: l.status, validUntil: l.validUntil, current: l.all.find((x) => x.validUntil === l.validUntil) ?? null, all: l.all }, applications: apps.filter((a) => String(a.vehicle_id) === id).map((a) => ({ id: String(a.id), kind: String(a.kind), reference: (a.reference as string | null) ?? null, authority: (a.authority as string | null) ?? null, lodgedOn: dayOf(a.lodged_on), outcome: String(a.outcome), outcomeOn: dayOf(a.outcome_on), note: (a.note as string | null) ?? null })), roadworthy: rw, insurance: ins, flags });
    }
    return out;
  }
  async function vehicles(assoc: string, onDay = today()) { return vehicleViews(assoc, onDay); }
  /** Saves what is held about a vehicle: only the fields sent change, every change is logged. The vehicle must belong to one of the association's active owner members. */
  async function saveVehicle(assoc: string, by: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(assoc, vehicleId); if (!v) return bad(404, "That vehicle is not one of your members' vehicles");
    const cur = (await db.query(`SELECT * FROM vehicle_compliance WHERE vehicle_id = $1`, [vehicleId])).rows[0] ?? {}, next: Record<string, unknown> = {};
    for (const [k, col, max] of [["vin", "vin", 30], ["roadworthyRef", "roadworthy_ref", 80], ["insurer", "insurer", 100], ["policyNumber", "policy_number", 80], ["signageNote", "signage_note", 200], ["replacementNote", "replacement_note", 200]] as [string, string, number][]) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${k} is too long (at most ${max} characters)`); next[col] = t; }
    for (const [k, col] of [["roadworthyExpiry", "roadworthy_expiry"], ["insuranceExpiry", "insurance_expiry"]] as [string, string][]) if (b[k] !== undefined) { if (b[k] !== null && b[k] !== "" && !isDay(b[k])) return bad(400, `Give ${k} as YYYY-MM-DD`); next[col] = b[k] || null; }
    for (const [k, col, allowed] of [["tracker", "tracker", TRI], ["camera", "camera", TRI], ["recapStatus", "recap_status", RECAP], ["state", "state", VSTATE]] as [string, string, readonly string[]][]) if (b[k] !== undefined) { if (!allowed.includes(String(b[k]))) return bad(400, `${k} must be one of: ${allowed.join(", ")}`); next[col] = b[k]; }
    if (b.replacedBy !== undefined) { if (b.replacedBy !== null && (b.replacedBy === vehicleId || !(await ownVehicle(assoc, b.replacedBy)))) return bad(400, "Choose another of your members' vehicles as the replacement"); next.replaced_by = b.replacedBy; }
    const merged = { ...cur, ...next } as Record<string, unknown>;
    if (merged.state === "replaced" && !merged.replaced_by && !merged.replacement_note) return bad(400, "Say which vehicle replaced it, or note the replacement request");
    await db.query(`INSERT INTO vehicle_compliance (vehicle_id, vin, roadworthy_expiry, roadworthy_ref, insurer, policy_number, insurance_expiry, tracker, camera, signage_note, recap_status, state, replaced_by, replacement_note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
                    ON CONFLICT (vehicle_id) DO UPDATE SET vin = EXCLUDED.vin, roadworthy_expiry = EXCLUDED.roadworthy_expiry, roadworthy_ref = EXCLUDED.roadworthy_ref, insurer = EXCLUDED.insurer, policy_number = EXCLUDED.policy_number, insurance_expiry = EXCLUDED.insurance_expiry, tracker = EXCLUDED.tracker, camera = EXCLUDED.camera,
                      signage_note = EXCLUDED.signage_note, recap_status = EXCLUDED.recap_status, state = EXCLUDED.state, replaced_by = EXCLUDED.replaced_by, replacement_note = EXCLUDED.replacement_note, updated_at = now()`,
      [vehicleId, merged.vin ?? null, merged.roadworthy_expiry ?? null, merged.roadworthy_ref ?? null, merged.insurer ?? null, merged.policy_number ?? null, merged.insurance_expiry ?? null, merged.tracker ?? "unknown", merged.camera ?? "unknown", merged.signage_note ?? null, merged.recap_status ?? "unknown", merged.state ?? "active", merged.replaced_by ?? null, merged.replacement_note ?? null]);
    for (const k of Object.keys(next)) { const was = k.endsWith("_expiry") ? dayOf(cur[k]) : cur[k] ?? null; if (JSON.stringify(was ?? null) !== JSON.stringify(next[k] ?? null)) await log(assoc, "vehicle", vehicleId, `${v.registration}: ${k} ${was ?? "(empty)"} → ${next[k] ?? "(empty)"}`, by); }
    return { ok: true, value: { id: vehicleId } };
  }
  /** Records an operating licence for a vehicle. A licence lasts at most seven years, and is stored per vehicle, whatever the membership. */
  async function addLicence(assoc: string, by: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(assoc, vehicleId); if (!v) return bad(404, "That vehicle is not one of your members' vehicles");
    const number = text(b.licenceNumber, 60); if (!number) return bad(400, "Give the licence number");
    if (!isDay(b.validFrom) || !isDay(b.validUntil)) return bad(400, "Give the dates the licence is valid from and until (YYYY-MM-DD)");
    if ((b.validUntil as string) < (b.validFrom as string)) return bad(400, "A licence is valid until after it starts");
    let province: string | null = null; if (b.province !== undefined && b.province !== null && b.province !== "") { if (!isProvince(b.province)) return bad(400, "Choose one of the nine provinces"); province = b.province; }
    const rule = await rules.forProvince(province); if (addYears(b.validFrom as string, rule.maxYears) < (b.validUntil as string)) return bad(400, `An operating licence lasts at most ${yearsText(rule.maxYears)}${province ? ` in ${province}` : ""} under the limit set in this system${rule.verified ? "" : " (not yet verified with the Provincial Regulatory Entity)"}: check the dates`);
    const auth = text(b.authority, 120), holder = text(b.holder, 120), route = text(b.route, 200), area = text(b.area, 200), times = text(b.times, 200); if ([auth, holder, route, area, times].some((x) => x === false)) return bad(400, "A field is too long");
    if ((await db.query(`SELECT 1 AS x FROM operating_licences WHERE vehicle_id = $1 AND licence_number = $2`, [vehicleId, number])).rows.length) return bad(409, "That licence number is already recorded for this vehicle");
    const r = (await db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, authority, holder_name, valid_from, valid_until, condition_route, condition_area, condition_times, province) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [vehicleId, number, auth, holder, b.validFrom, b.validUntil, route, area, times, province])).rows[0];
    await log(assoc, "licence", String(r.id), `${v.registration}: licence ${number} valid ${b.validFrom} to ${b.validUntil}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  async function removeLicence(assoc: string, by: string, id: string): Promise<Res<{ id: string }>> {
    const l = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT l.licence_number, l.vehicle_id FROM operating_licences l WHERE l.id = $1`, [id])).rows[0] : null;
    if (!l || !(await ownVehicle(assoc, String(l.vehicle_id)))) return bad(404, "Licence not found");
    await db.query(`DELETE FROM operating_licences WHERE id = $1`, [id]); await log(assoc, "licence", id, `removed licence ${l.licence_number}`, by); return { ok: true, value: { id } };
  }
  async function addApplication(assoc: string, by: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(assoc, vehicleId); if (!v) return bad(404, "That vehicle is not one of your members' vehicles");
    if (!["new", "renewal", "transfer", "amendment"].includes(String(b.kind))) return bad(400, "An application is new, a renewal, a transfer or an amendment");
    if (!isDay(b.lodgedOn) || (b.lodgedOn as string) > today()) return bad(400, "Give the date it was lodged (not in the future)");
    const ref = text(b.reference, 80), auth = text(b.authority, 120), note = text(b.note, 300); if ([ref, auth, note].some((x) => x === false)) return bad(400, "A field is too long");
    const r = (await db.query(`INSERT INTO licence_applications (vehicle_id, kind, reference, authority, lodged_on, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [vehicleId, b.kind, ref, auth, b.lodgedOn, note])).rows[0];
    await log(assoc, "licence_application", String(r.id), `${v.registration}: ${b.kind} application lodged ${b.lodgedOn}${ref ? ` (${ref})` : ""}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  /** Closes a pending application: granted, refused or withdrawn. A grant does not by itself make the vehicle licensed: the licence itself must be recorded. */
  async function setApplicationOutcome(assoc: string, by: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const a = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM licence_applications WHERE id = $1`, [id])).rows[0] : null; const v = a ? await ownVehicle(assoc, String(a.vehicle_id)) : null;
    if (!a || !v) return bad(404, "Application not found");
    if (a.outcome !== "pending") return bad(409, "That application already has an outcome");
    if (!["granted", "refused", "withdrawn"].includes(String(b.outcome))) return bad(400, "The outcome is granted, refused or withdrawn");
    if (!isDay(b.outcomeOn) || (b.outcomeOn as string) > today() || (b.outcomeOn as string) < dayOf(a.lodged_on)!) return bad(400, "Give the date of the outcome (after it was lodged, not in the future)");
    await db.query(`UPDATE licence_applications SET outcome = $2, outcome_on = $3 WHERE id = $1`, [id, b.outcome, b.outcomeOn]); await log(assoc, "licence_application", id, `${v.registration}: application ${b.outcome} on ${b.outcomeOn}`, by); return { ok: true, value: { id } };
  }

  /* ───────────────────────── the driver register ───────────────────────── */
  async function driverViews(assoc: string, onDay: string): Promise<DriverView[]> {
    const members = (await db.query(`SELECT m.member_id FROM memberships m WHERE m.association_id = $1 AND m.status = 'active' AND m.member_role = 'driver'`, [assoc])).rows.map((r) => String(r.member_id));
    const links = (await db.query(`SELECT od.driver_id, od.owner_id, o.name AS owner FROM owner_drivers od JOIN memberships m ON m.member_id = od.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' JOIN users o ON o.id = od.owner_id WHERE od.status = 'active'`, [assoc])).rows;
    const ids = [...new Set([...members, ...links.map((l) => String(l.driver_id))])]; if (!ids.length) return [];
    const users = (await db.query(`SELECT id, name, email FROM users WHERE role = 'driver'`)).rows.filter((u) => ids.includes(String(u.id))), prof = (await db.query(`SELECT * FROM driver_profiles`)).rows, reg = (await db.query(`SELECT * FROM driver_register`)).rows;
    const veh = (await db.query(`SELECT v.id, v.registration, v.driver_id FROM vehicles v ${OWN} WHERE v.driver_id IS NOT NULL`, [assoc])).rows;
    const out: DriverView[] = [];
    for (const u of users.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const id = String(u.id), p = prof.find((x) => String(x.user_id) === id), r = reg.find((x) => String(x.driver_id) === id), v = veh.find((x) => String(x.driver_id) === id), employers = [...new Set(links.filter((l) => String(l.driver_id) === id).map((l) => String(l.owner)))];
      const pe = dayOf(p?.pdp_expiry), le = dayOf(p?.licence_expiry), pb = expiryBand(pe, onDay), lb = expiryBand(le, onDay), flags: Flag[] = [], name = String(u.name), reg1 = { employmentStatus: String(r?.employment_status ?? "unknown"), contractOnFile: !!r?.contract_on_file, payBasis: String(r?.pay_basis ?? "unknown"), uifRegistered: !!r?.uif_registered, coidaRegistered: !!r?.coida_registered, cleanRecordConfirmed: !!r?.clean_record_confirmed, trainingNote: (r?.training_note as string | null) ?? null, state: String(r?.state ?? "active"), stateReason: (r?.state_reason as string | null) ?? null };
      const assigned = !!v;
      if (!p?.pdp_number || pb.band === "missing") flags.push({ id: `drv:${id}:nopermit`, category: "driver", severity: assigned ? "high" : "medium", message: `${name} has no professional driving permit (PrDP) on record${assigned ? ` and is assigned to ${v!.registration}` : ""}`, subject: name, dueOn: null });
      else if (pb.band === "expired") flags.push({ id: `drv:${id}:permitexpired`, category: "driver", severity: assigned ? "high" : "medium", message: `${name}'s PrDP expired on ${pe}${assigned ? ` and they are assigned to ${v!.registration}` : ""}`, subject: name, dueOn: pe });
      else if (pb.band !== "ok") flags.push({ id: `drv:${id}:permitexpiring`, category: "driver", severity: pb.band === "30" ? "medium" : "low", message: `${name}'s PrDP expires in ${pb.days} days (${pe})`, subject: name, dueOn: pe });
      if (lb.band === "expired") flags.push({ id: `drv:${id}:licexpired`, category: "driver", severity: assigned ? "high" : "medium", message: `${name}'s driver's licence expired on ${le}`, subject: name, dueOn: le });
      else if (lb.band === "30" || lb.band === "90") flags.push({ id: `drv:${id}:licexpiring`, category: "driver", severity: lb.band === "30" ? "medium" : "low", message: `${name}'s driver's licence expires in ${lb.days} days (${le})`, subject: name, dueOn: le });
      if (!employers.length) flags.push({ id: `drv:${id}:noemployer`, category: "driver", severity: "medium", message: `${name} has no employing owner on record`, subject: name, dueOn: null });
      if (reg1.state === "suspended" && assigned) flags.push({ id: `drv:${id}:suspended`, category: "driver", severity: "high", message: `${name} is suspended but is still assigned to ${v!.registration}`, subject: name, dueOn: null });
      if (reg1.employmentStatus === "employed" && (!reg1.uifRegistered || !reg1.coidaRegistered)) flags.push({ id: `drv:${id}:formalities`, category: "formalisation", severity: "medium", message: `${name} is recorded as employed but is not registered for ${[!reg1.uifRegistered ? "UIF" : "", !reg1.coidaRegistered ? "COIDA" : ""].filter(Boolean).join(" and ")}`, subject: name, dueOn: null });
      out.push({ id, name, email: String(u.email), idNumberMasked: maskId(r?.id_number), vehicle: v ? String(v.registration) : null, vehicleId: v ? String(v.id) : null, employers, member: members.includes(id), permit: { number: (p?.pdp_number as string | null) ?? null, expiresOn: pe, ...pb }, licence: { code: (p?.licence_code as string | null) ?? null, expiresOn: le, ...lb }, register: reg1, flags });
    }
    return out;
  }
  async function drivers(assoc: string, onDay = today()) { return driverViews(assoc, onDay); }
  async function saveDriver(assoc: string, by: string, driverId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const d = (await driverViews(assoc, today())).find((x) => x.id === driverId); if (!d) return bad(404, "That driver is not one of yours");
    const cur = (await db.query(`SELECT * FROM driver_register WHERE driver_id = $1`, [driverId])).rows[0] ?? {}, next: Record<string, unknown> = {};
    if (b.idNumber !== undefined) { if (b.idNumber === null || b.idNumber === "") next.id_number = null; else { const v = typeof b.idNumber === "string" ? validateSaId(b.idNumber) : null; if (!v || !v.valid) return bad(400, "That is not a valid South African ID number"); next.id_number = (b.idNumber as string).replace(/\s/g, ""); } }
    for (const [k, col, allowed] of [["employmentStatus", "employment_status", EMPLOY], ["payBasis", "pay_basis", PAY], ["state", "state", ["active", "suspended"]]] as [string, string, readonly string[]][]) if (b[k] !== undefined) { if (!allowed.includes(String(b[k]))) return bad(400, `${k} must be one of: ${allowed.join(", ")}`); next[col] = b[k]; }
    for (const [k, col] of [["contractOnFile", "contract_on_file"], ["uifRegistered", "uif_registered"], ["coidaRegistered", "coida_registered"], ["cleanRecordConfirmed", "clean_record_confirmed"]] as [string, string][]) if (b[k] !== undefined) { if (typeof b[k] !== "boolean") return bad(400, `${k} is yes or no`); next[col] = b[k]; }
    for (const [k, col, max] of [["trainingNote", "training_note", 300], ["stateReason", "state_reason", 200]] as [string, string, number][]) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${k} is too long`); next[col] = t; }
    const merged = { ...cur, ...next } as Record<string, unknown>;
    if (merged.state === "suspended" && !merged.state_reason) return bad(400, "Say why the driver is suspended");
    await db.query(`INSERT INTO driver_register (driver_id, id_number, employment_status, contract_on_file, pay_basis, uif_registered, coida_registered, clean_record_confirmed, training_note, state, state_reason, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
                    ON CONFLICT (driver_id) DO UPDATE SET id_number = EXCLUDED.id_number, employment_status = EXCLUDED.employment_status, contract_on_file = EXCLUDED.contract_on_file, pay_basis = EXCLUDED.pay_basis, uif_registered = EXCLUDED.uif_registered, coida_registered = EXCLUDED.coida_registered, clean_record_confirmed = EXCLUDED.clean_record_confirmed, training_note = EXCLUDED.training_note, state = EXCLUDED.state, state_reason = EXCLUDED.state_reason, updated_at = now()`,
      [driverId, merged.id_number ?? null, merged.employment_status ?? "unknown", !!merged.contract_on_file, merged.pay_basis ?? "unknown", !!merged.uif_registered, !!merged.coida_registered, !!merged.clean_record_confirmed, merged.training_note ?? null, merged.state ?? "active", merged.state_reason ?? null]);
    for (const k of Object.keys(next)) if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(next[k] ?? null)) await log(assoc, "driver", driverId, `${d.name}: ${k === "id_number" ? "ID number changed" : `${k} ${cur[k] ?? "(empty)"} → ${next[k] ?? "(empty)"}`}`, by);
    return { ok: true, value: { id: driverId } };
  }
  /**
   * May this driver be put on a vehicle of this owner? Checked for every association the owner is an active member of that has switched "block drivers without a valid permit" on: the driver must have a PrDP that has
   * not expired and must not be suspended. Returns a reason when not, or null.
   */
  async function assignmentBlock(ownerId: string, driverId: string, onDay = today()): Promise<string | null> {
    const assocs = (await db.query(`SELECT m.association_id FROM memberships m WHERE m.member_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner'`, [ownerId])).rows.map((r) => String(r.association_id));
    for (const a of assocs) {
      if (!(await db.query(`SELECT enforce_prdp FROM association_settings WHERE association_id = $1`, [a])).rows[0]?.enforce_prdp) continue;
      const p = (await db.query(`SELECT pdp_number, pdp_expiry FROM driver_profiles WHERE user_id = $1`, [driverId])).rows[0], r = (await db.query(`SELECT state, state_reason FROM driver_register WHERE driver_id = $1`, [driverId])).rows[0];
      if (r?.state === "suspended") return `That driver is suspended${r.state_reason ? ` (${r.state_reason})` : ""}`;
      if (!p?.pdp_number || !p.pdp_expiry) return "That driver has no professional driving permit (PrDP) on record, which is needed to carry passengers for income";
      if (dayOf(p.pdp_expiry)! < onDay) return `That driver's professional driving permit (PrDP) expired on ${dayOf(p.pdp_expiry)}`;
    }
    return null;
  }

  /* ───────────────────────── the overview ───────────────────────── */
  async function registrationFlags(assoc: string, onDay: string): Promise<Flag[]> {
    const r = await registration(assoc), f: Flag[] = [], name = "Registration";
    if (!r.recorded) { f.push({ id: "reg:none", category: "registration", severity: "high", message: "The association's registration has not been recorded yet", subject: name, dueOn: null }); }
    else {
      if (r.status === "suspended") f.push({ id: "reg:suspended", category: "registration", severity: "high", message: "Registration is suspended", subject: name, dueOn: null });
      if (r.status === "conditional" && r.conditionalSince) { const limit = addMonths(r.conditionalSince, r.conditionalLimitMonths); if (limit < onDay) f.push({ id: "reg:conditional", category: "registration", severity: "high", message: `Registration has been conditional since ${r.conditionalSince}, longer than the ${r.conditionalLimitMonths} months allowed here`, subject: name, dueOn: limit }); }
      if (r.status === "conditional" && !r.conditionalSince) f.push({ id: "reg:conditionalnodate", category: "registration", severity: "low", message: "Registration is conditional, but the date it became conditional is not recorded", subject: name, dueOn: null });
      if (r.minMembersRequired !== null && r.memberCount < r.minMembersRequired) f.push({ id: "reg:minmembers", category: "registration", severity: "high", message: `Membership (${r.memberCount}) is below the required minimum of ${r.minMembersRequired}`, subject: name, dueOn: null });
      if (r.constitutionVersion && r.constitutionVersion !== r.constitutionLodgedVersion) f.push({ id: "reg:constitution", category: "registration", severity: "medium", message: `The constitution (version ${r.constitutionVersion}) has changed since the version last lodged${r.constitutionLodgedVersion ? ` (${r.constitutionLodgedVersion})` : ""}`, subject: name, dueOn: null });
      const rn = expiryBand(r.renewalDueOn, onDay); if (rn.band === "expired") f.push({ id: "reg:renewal", category: "registration", severity: "high", message: `Registration renewal was due on ${r.renewalDueOn}`, subject: name, dueOn: r.renewalDueOn }); else if (rn.band !== "ok" && rn.band !== "missing") f.push({ id: "reg:renewal", category: "registration", severity: rn.band === "30" ? "high" : "medium", message: `Registration renewal is due in ${rn.days} days (${r.renewalDueOn})`, subject: name, dueOn: r.renewalDueOn });
    }
    const docs = await documents(assoc);
    for (const [kind, label] of [["registration_certificate", "registration certificate"], ["constitution", "signed constitution"], ["code_of_conduct", "code of conduct"]] as const) if (!docs.some((d) => d.kind === kind)) f.push({ id: `reg:doc:${kind}`, category: "registration", severity: "medium", message: `No ${label} is recorded as held`, subject: name, dueOn: null });
    for (const d of docs) { const b = expiryBand(d.expiresOn, onDay); if (b.band === "expired") f.push({ id: `reg:docexp:${d.id}`, category: "registration", severity: "medium", message: `${d.title} expired on ${d.expiresOn}`, subject: name, dueOn: d.expiresOn }); }
    for (const o of await officeBearers(assoc)) { const b = expiryBand(o.termEnd, onDay); if (b.band === "expired") f.push({ id: `reg:term:${o.id}`, category: "governance", severity: "high", message: `${o.name}'s term as ${o.office} ended on ${o.termEnd}: an election or renewal is overdue`, subject: o.name, dueOn: o.termEnd }); else if (b.band === "30" || b.band === "90") f.push({ id: `reg:term:${o.id}`, category: "governance", severity: b.band === "30" ? "medium" : "low", message: `${o.name}'s term as ${o.office} ends in ${b.days} days (${o.termEnd})`, subject: o.name, dueOn: o.termEnd }); }
    if (r.constitutionVersion) { const a = await acceptances(assoc), missing = a.members.filter((m) => !m.acceptedCurrent).length; if (missing) f.push({ id: "reg:acceptances", category: "registration", severity: "medium", message: `${missing} member${missing === 1 ? " has" : "s have"} not signed the current constitution (version ${r.constitutionVersion})`, subject: name, dueOn: null }); }
    return f;
  }
  /**
   * The compliance overview for an association on a day: how many vehicles and drivers are legal today (a vehicle counts only with a licence that covers today: an application lodged does not), every flag in order of seriousness,
   * and the expiries coming up. Nothing here is guessed: it reports what is on record, and counts a missing record as missing.
   */
  async function summary(assoc: string, onDay = today()) {
    const [vs, ds, regFlags, reg] = [await vehicleViews(assoc, onDay), await driverViews(assoc, onDay), await registrationFlags(assoc, onDay), await registration(assoc)];
    const active = vs.filter((v) => v.compliance.state === "active"), by = (s: LicenceStatus) => active.filter((v) => v.licence.status === s).length, licensed = by("valid");
    const permitValid = ds.filter((d) => d.permit.band !== "missing" && d.permit.band !== "expired"), flags = [...regFlags, ...vs.flatMap((v) => v.flags), ...ds.flatMap((d) => d.flags)].sort(flagSort);
    const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
    const expiries: { kind: string; subject: string; expiresOn: string; days: number; band: Band }[] = [];
    for (const v of active) { for (const [kind, on] of [["Operating licence", v.licence.status === "valid" || v.licence.status === "expired" ? v.licence.validUntil : null], ["Roadworthy certificate", v.compliance.roadworthyExpiry as string | null], ["Insurance", v.compliance.insuranceExpiry as string | null]] as const) { if (!on) continue; const b = expiryBand(on, onDay); if (b.band !== "ok" && b.band !== "missing") expiries.push({ kind, subject: v.registration, expiresOn: on, days: b.days!, band: b.band }); } }
    for (const d of ds) for (const [kind, e] of [["Professional driving permit", d.permit], ["Driver's licence", d.licence]] as const) if (e.expiresOn && e.band !== "ok" && e.band !== "missing") expiries.push({ kind, subject: d.name, expiresOn: e.expiresOn, days: e.days!, band: e.band });
    expiries.sort((a, b) => a.days - b.days);
    return { today: onDay, measures: { vehicles: active.length, vehiclesLicensed: licensed, licensedPercent: pct(licensed, active.length), applicationOnly: by("application_lodged"), expired: by("expired") + by("not_yet_valid"), noLicence: by("none"), drivers: ds.length, driversWithValidPermit: permitValid.length, validPermitPercent: pct(permitValid.length, ds.length), driversWithoutEmployer: ds.filter((d) => !d.employers.length).length, members: reg.memberCount, minMembersRequired: reg.minMembersRequired, registrationStatus: reg.status }, flags, flagCounts: { high: flags.filter((f) => f.severity === "high").length, medium: flags.filter((f) => f.severity === "medium").length, low: flags.filter((f) => f.severity === "low").length }, expiries };
  }
  /** Records this month's picture (overwriting earlier days of the month, so the month holds its latest figures). */
  async function snapshot(assoc: string, onDay = today()): Promise<{ month: string; vehicles: number; licensed: number; drivers: number; driversValid: number }> {
    const s = await summary(assoc, onDay), month = onDay.slice(0, 7), row = { month, vehicles: s.measures.vehicles, licensed: s.measures.vehiclesLicensed, drivers: s.measures.drivers, driversValid: s.measures.driversWithValidPermit };
    await db.query(`INSERT INTO compliance_trend (association_id, month, vehicles, licensed, drivers, drivers_valid) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (association_id, month) DO UPDATE SET vehicles = EXCLUDED.vehicles, licensed = EXCLUDED.licensed, drivers = EXCLUDED.drivers, drivers_valid = EXCLUDED.drivers_valid`, [assoc, month, row.vehicles, row.licensed, row.drivers, row.driversValid]);
    return row;
  }
  async function snapshotAll(onDay = today()): Promise<number> { const rows = (await db.query(`SELECT id FROM users WHERE role = 'association'`)).rows; for (const r of rows) await snapshot(String(r.id), onDay); return rows.length; }
  async function trend(assoc: string, months = 12) {
    return (await db.query(`SELECT month, vehicles, licensed, drivers, drivers_valid FROM compliance_trend WHERE association_id = $1 ORDER BY month DESC LIMIT $2`, [assoc, Math.min(Math.max(months, 1), 60)])).rows.reverse().map((r) => ({ month: String(r.month), vehicles: Number(r.vehicles), licensed: Number(r.licensed), licensedPercent: Number(r.vehicles) ? Math.round((Number(r.licensed) / Number(r.vehicles)) * 1000) / 10 : null, drivers: Number(r.drivers), driversValid: Number(r.drivers_valid), validPermitPercent: Number(r.drivers) ? Math.round((Number(r.drivers_valid) / Number(r.drivers)) * 1000) / 10 : null }));
  }
  async function changes(assoc: string, o: { entity?: string; limit?: number } = {}) {
    const rows = (await db.query(`SELECT c.entity, c.entity_id, c.summary, c.changed_at, u.name AS by FROM register_changes c LEFT JOIN users u ON u.id = c.changed_by WHERE c.association_id = $1 ORDER BY c.changed_at DESC LIMIT $2`, [assoc, Math.min(Math.max(o.limit ?? 100, 1), 500)])).rows;
    return rows.filter((r) => !o.entity || r.entity === o.entity).map((r) => ({ entity: String(r.entity), entityId: (r.entity_id as string | null) ?? null, summary: String(r.summary), at: new Date(r.changed_at as string).toISOString(), by: (r.by as string | null) ?? null }));
  }
  return { registration, saveRegistration, officeBearers, addOfficeBearer, updateOfficeBearer, removeOfficeBearer, documents, addDocument, removeDocument, recordAcceptance, acceptances, vehicles, saveVehicle, addLicence, removeLicence, addApplication, setApplicationOutcome, drivers, saveDriver, assignmentBlock, summary, snapshot, snapshotAll, trend, changes, log };
}
export type Compliance = ReturnType<typeof createCompliance>;
