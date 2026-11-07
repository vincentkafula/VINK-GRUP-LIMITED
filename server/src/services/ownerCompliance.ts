import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, daysBetween, addYears } from "./compliance.js";
import { createLicenceRules, isProvince, yearsText, type LicenceRule } from "./licenceRules.js";

/**
 * THE OWNER'S LICENCE AND COMPLIANCE CENTRE (docs/OWNER_DASHBOARD.md, slice C1).
 * For each vehicle: the operating licence, the roadworthy certificate, the licence disc, the insurance, and (when a driver is assigned) the driver's licence and PrDP, each with a status, how many days are left, and a reminder at the days the owner chose (90, 60, 30 and 7 by default).
 *   valid     more days left than the longest reminder
 *   due       within the longest reminder, not yet expired
 *   expired   the day has passed
 *   missing   nothing has been recorded: this counts AGAINST the score, because a document you have not recorded is one you cannot show
 * A vehicle is RED when anything has expired, AMBER when anything is due or missing, GREEN otherwise. The score is the share of the vehicle's required documents that are valid.
 * The records are the SAME ones the association sees for its members' vehicles (vehicle_compliance and operating_licences): the owner edits their own, the association reads them, so there is one truth.
 * A driver's licence and PrDP dates are what the driver recorded in their own profile: the owner reads them for their active drivers (dates only, never the numbers) and cannot change them.
 * Licence length follows the province's rule from `licence_rules`: configuration, not law, and the screens say whether it has been verified.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const DEFAULT_REMINDER_DAYS = [90, 60, 30, 7];
export type ItemKind = "licence" | "roadworthy" | "disc" | "insurance" | "driver_licence" | "prdp";
export type ItemStatus = "valid" | "due" | "expired" | "missing";
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
export interface Item { key: string; kind: ItemKind; label: string; expiresOn: string | null; daysLeft: number | null; status: ItemStatus; detail: string | null }
export interface Flag { id: string; severity: "high" | "medium" | "low"; message: string; subject: string }

/** The status of one expiry date against the reminder days. */
export function itemStatus(expiresOn: string | null, onDay: string, reminderDays: number[]): { status: ItemStatus; daysLeft: number | null } {
  if (!expiresOn) return { status: "missing", daysLeft: null }; const left = daysBetween(onDay, expiresOn); if (left < 0) return { status: "expired", daysLeft: left };
  return { status: left <= Math.max(...reminderDays, 0) ? "due" : "valid", daysLeft: left };
}
/** The reminder band a date is in today: the smallest chosen number of days that is still at least as many as are left, or 0 once it has expired. Null while it is further off than the longest reminder. Each band is a separate reminder, so each can be seen and read once. */
export function reminderBand(daysLeft: number | null, reminderDays: number[]): number | null {
  if (daysLeft === null) return null; if (daysLeft < 0) return 0; const ge = reminderDays.filter((d) => d >= daysLeft).sort((a, b) => a - b); return ge.length ? ge[0] : null;
}

export function createOwnerCompliance(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now()), rules = createLicenceRules(db, now);
  const ownVehicle = async (owner: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM vehicles WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] ?? null : null);
  async function reminderDays(owner: string): Promise<number[]> {
    const r = (await db.query(`SELECT reminder_days FROM owner_compliance_settings WHERE owner_id = $1`, [owner])).rows[0]; const d = String(r?.reminder_days ?? DEFAULT_REMINDER_DAYS.join(",")).split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return d.length ? [...new Set(d)].sort((a, b) => b - a) : DEFAULT_REMINDER_DAYS;
  }
  /** The days before an expiry the owner wants to be reminded: one to six whole numbers from 1 to 365. */
  async function setReminderDays(owner: string, days: unknown): Promise<Res<{ reminderDays: number[] }>> {
    if (!Array.isArray(days) || days.length < 1 || days.length > 6 || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 365)) return bad(400, "Give between one and six reminder times, each a whole number of days from 1 to 365"); const sorted = [...new Set(days as number[])].sort((a, b) => b - a);
    await db.query(`INSERT INTO owner_compliance_settings (owner_id, reminder_days, updated_at) VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO UPDATE SET reminder_days = EXCLUDED.reminder_days, updated_at = EXCLUDED.updated_at`, [owner, sorted.join(","), now().toISOString()]); return { ok: true, value: { reminderDays: sorted } };
  }

  /** Every vehicle with its documents, status, score and flags, the fleet's totals, and the reminders that are due now. */
  async function centre(owner: string, onDay = today()) {
    const days = await reminderDays(owner), ruleList = await rules.list(), vs = (await db.query(`SELECT v.*, u.name AS driver_name FROM vehicles v LEFT JOIN users u ON u.id = v.driver_id WHERE v.owner_id = $1 ORDER BY v.registration`, [owner])).rows;
    const ids = vs.map((v) => String(v.id)), cx = new Map((await db.query(`SELECT * FROM vehicle_compliance`)).rows.filter((r) => ids.includes(String(r.vehicle_id))).map((r) => [String(r.vehicle_id), r])), lic = (await db.query(`SELECT * FROM operating_licences ORDER BY valid_until DESC`)).rows.filter((l) => ids.includes(String(l.vehicle_id)));
    const dp = new Map((await db.query(`SELECT user_id, licence_expiry, pdp_expiry FROM driver_profiles`)).rows.map((r) => [String(r.user_id), r])), linked = new Set((await db.query(`SELECT driver_id FROM owner_drivers WHERE owner_id = $1 AND status = 'active'`, [owner])).rows.map((r) => String(r.driver_id)));
    const ruleFor = (p: string | null): LicenceRule => ruleList.find((r) => r.province === p) ?? ruleList.find((r) => r.province === "*") ?? { province: "*", maxYears: 7, verified: false, note: null };
    const vehicles = [], flags: Flag[] = [], reminders: { key: string; itemKey: string; vehicleId: string; registration: string; label: string; expiresOn: string; daysLeft: number; band: number; title: string }[] = [];
    for (const v of vs) {
      const id = String(v.id), reg = String(v.registration), c = cx.get(id), mine = lic.filter((l) => String(l.vehicle_id) === id), current = mine.find((l) => dayOf(l.valid_from)! <= onDay && dayOf(l.valid_until)! >= onDay) ?? mine.find((l) => dayOf(l.valid_until)! >= onDay) ?? mine[0] ?? null;
      const mk = (kind: ItemKind, label: string, expiresOn: string | null, detail: string | null = null): Item => ({ key: `${kind}:${id}`, kind, label, expiresOn, ...itemStatus(expiresOn, onDay, days), detail });
      const items: Item[] = [
        mk("licence", current ? `Operating licence ${current.licence_number}` : "Operating licence", dayOf(current?.valid_until), current ? [current.province, current.condition_route].filter(Boolean).join(" · ") || null : "No licence is recorded for this vehicle"),
        mk("roadworthy", "Roadworthy certificate", dayOf(c?.roadworthy_expiry), (c?.roadworthy_ref as string | null) ?? null), mk("disc", "Licence disc", dayOf(v.disc_expiry)), mk("insurance", "Insurance", dayOf(c?.insurance_expiry), [c?.insurer, c?.policy_number].filter(Boolean).join(" · ") || null),
      ];
      const driver = v.driver_id ? String(v.driver_id) : null; if (driver) { const d = linked.has(driver) ? dp.get(driver) : undefined, name = String(v.driver_name ?? "the driver"); items.push(mk("driver_licence", `Driving licence of ${name}`, dayOf(d?.licence_expiry), linked.has(driver) ? "As recorded by the driver" : "This driver is not one of your active drivers"), mk("prdp", `PrDP of ${name}`, dayOf(d?.pdp_expiry), linked.has(driver) ? "As recorded by the driver" : "This driver is not one of your active drivers")); }
      const valid = items.filter((i) => i.status === "valid").length, score = Math.round((valid / items.length) * 100), status = items.some((i) => i.status === "expired") ? "red" : items.some((i) => i.status === "due" || i.status === "missing") ? "amber" : "green";
      for (const i of items) {
        if (i.status === "expired") flags.push({ id: `cc:expired:${i.key}`, severity: "high", message: `${reg}: ${i.label} expired on ${i.expiresOn}`, subject: reg }); else if (i.status === "due") flags.push({ id: `cc:due:${i.key}`, severity: i.daysLeft! <= Math.min(...days) ? "high" : "medium", message: `${reg}: ${i.label} expires in ${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"} (${i.expiresOn})`, subject: reg }); else if (i.status === "missing") flags.push({ id: `cc:missing:${i.key}`, severity: "low", message: `${reg}: ${i.label} has not been recorded`, subject: reg });
        const band = reminderBand(i.daysLeft, days); if (band !== null && i.expiresOn) reminders.push({ key: `cc:${i.key}:${i.expiresOn}:${band}`, itemKey: i.key, vehicleId: id, registration: reg, label: i.label, expiresOn: i.expiresOn, daysLeft: i.daysLeft!, band, title: i.daysLeft! < 0 ? `${reg}: ${i.label} has expired` : `${reg}: ${i.label} expires in ${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"}` });
      }
      const licences = mine.map((l) => { const rule = ruleFor((l.province as string | null) ?? null), long = addYears(dayOf(l.valid_from)!, rule.maxYears) < dayOf(l.valid_until)!; if (long) flags.push({ id: `cc:licspan:${l.id}`, severity: "low", message: `${reg}: licence ${l.licence_number} is recorded as lasting more than ${yearsText(rule.maxYears)}${l.province ? ` (the limit set for ${l.province})` : ""}: check the dates`, subject: reg });
        return { id: String(l.id), licenceNumber: String(l.licence_number), province: (l.province as string | null) ?? null, authority: (l.authority as string | null) ?? null, route: (l.condition_route as string | null) ?? null, validFrom: dayOf(l.valid_from)!, validUntil: dayOf(l.valid_until)!, maxYears: rule.maxYears, ruleVerified: rule.verified }; });
      vehicles.push({ vehicleId: id, registration: reg, make: (v.make as string | null) ?? null, driver: v.driver_name ? String(v.driver_name) : null, status, scorePercent: score, vin: (c?.vin as string | null) ?? null, items, licences, details: { roadworthyRef: (c?.roadworthy_ref as string | null) ?? null, insurer: (c?.insurer as string | null) ?? null, policyNumber: (c?.policy_number as string | null) ?? null } });
    }
    const all = vehicles.flatMap((v) => v.items), validAll = all.filter((i) => i.status === "valid").length, order = { high: 0, medium: 1, low: 2 };
    return { today: onDay, reminderDays: days, rules: ruleList, vehicles, fleet: { vehicles: vehicles.length, green: vehicles.filter((v) => v.status === "green").length, amber: vehicles.filter((v) => v.status === "amber").length, red: vehicles.filter((v) => v.status === "red").length, scorePercent: all.length ? Math.round((validAll / all.length) * 100) : null, expired: all.filter((i) => i.status === "expired").length, dueSoon: all.filter((i) => i.status === "due").length, missing: all.filter((i) => i.status === "missing").length }, flags: flags.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject)), reminders };
  }

  /* ───────────────────────── what the owner can change ───────────────────────── */
  const dateOk = (v: unknown, onDay: string) => isDay(v) && (v as string) >= shift(onDay, -3650) && (v as string) <= shift(onDay, 3650);
  /** Saves the owner's roadworthy, insurance and disc details for one of their vehicles. Only what is sent changes; an empty date clears it. */
  async function saveVehicle(owner: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, vehicleId); if (!v) return bad(404, "That vehicle is not yours"); const day = today(), cur = (await db.query(`SELECT * FROM vehicle_compliance WHERE vehicle_id = $1`, [vehicleId])).rows[0] ?? {}, next: Record<string, unknown> = {};
    for (const [k, col] of [["roadworthyExpiry", "roadworthy_expiry"], ["insuranceExpiry", "insurance_expiry"]] as const) if (b[k] !== undefined) { if (b[k] === null || b[k] === "") next[col] = null; else if (!dateOk(b[k], day)) return bad(400, `${k === "roadworthyExpiry" ? "The roadworthy expiry" : "The insurance expiry"} must be a date (YYYY-MM-DD) within ten years of today`); else next[col] = b[k]; }
    for (const [k, col, max, label] of [["roadworthyRef", "roadworthy_ref", 40, "The roadworthy reference"], ["insurer", "insurer", 80, "The insurer"], ["policyNumber", "policy_number", 40, "The policy number"], ["vin", "vin", 17, "The VIN"]] as const) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${label} is too long`); next[col] = t; }
    let disc: string | null | undefined; if (b.discExpiry !== undefined) { if (b.discExpiry === null || b.discExpiry === "") disc = null; else if (!dateOk(b.discExpiry, day)) return bad(400, "The licence disc expiry must be a date (YYYY-MM-DD) within ten years of today"); else disc = b.discExpiry as string; }
    if (!Object.keys(next).length && disc === undefined) return bad(400, "Nothing to change"); const m = { ...cur, ...next } as Record<string, unknown>;
    if (Object.keys(next).length) await db.query(`INSERT INTO vehicle_compliance (vehicle_id, vin, roadworthy_expiry, roadworthy_ref, insurer, policy_number, insurance_expiry, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT (vehicle_id) DO UPDATE SET vin = EXCLUDED.vin, roadworthy_expiry = EXCLUDED.roadworthy_expiry, roadworthy_ref = EXCLUDED.roadworthy_ref, insurer = EXCLUDED.insurer, policy_number = EXCLUDED.policy_number, insurance_expiry = EXCLUDED.insurance_expiry, updated_at = EXCLUDED.updated_at`, [vehicleId, m.vin ?? null, m.roadworthy_expiry ?? null, m.roadworthy_ref ?? null, m.insurer ?? null, m.policy_number ?? null, m.insurance_expiry ?? null, now().toISOString()]);
    if (disc !== undefined) await db.query(`UPDATE vehicles SET disc_expiry = $2 WHERE id = $1`, [vehicleId, disc]); return { ok: true, value: { id: vehicleId } };
  }
  /** Records an operating licence for one of the owner's vehicles. The province is required, and the licence may not last longer than that province's rule allows. */
  async function addLicence(owner: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, vehicleId); if (!v) return bad(404, "That vehicle is not yours"); const number = text(b.licenceNumber, 60); if (!number) return bad(400, "Give the licence number");
    if (!isProvince(b.province)) return bad(400, "Choose the province that issued the licence"); if (!isDay(b.validFrom) || !isDay(b.validUntil)) return bad(400, "Give the dates the licence is valid from and until (YYYY-MM-DD)"); if ((b.validUntil as string) < (b.validFrom as string)) return bad(400, "A licence is valid until after it starts");
    const rule = await rules.forProvince(b.province); if (addYears(b.validFrom as string, rule.maxYears) < (b.validUntil as string)) return bad(400, `A licence in ${b.province} lasts at most ${yearsText(rule.maxYears)} under the limit set in this system${rule.verified ? "" : " (not yet verified with the Provincial Regulatory Entity)"}: check the dates. If the limit is wrong, the administrator can correct it`);
    const route = text(b.route, 200), authority = text(b.authority, 120); if (route === false || authority === false) return bad(400, "A field is too long"); if ((await db.query(`SELECT 1 AS x FROM operating_licences WHERE vehicle_id = $1 AND licence_number = $2`, [vehicleId, number])).rows.length) return bad(409, "That licence number is already recorded for this vehicle");
    const r = (await db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, authority, valid_from, valid_until, condition_route, province) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [vehicleId, number, authority, b.validFrom, b.validUntil, route, b.province])).rows[0]; return { ok: true, value: { id: String(r.id) } };
  }
  /** Removes a licence the owner entered by mistake. */
  async function removeLicence(owner: string, id: string): Promise<Res<{ id: string }>> {
    const l = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT l.id, l.vehicle_id FROM operating_licences l WHERE l.id = $1`, [id])).rows[0] : null; if (!l || !(await ownVehicle(owner, String(l.vehicle_id)))) return bad(404, "Licence not found"); await db.query(`DELETE FROM operating_licences WHERE id = $1`, [id]); return { ok: true, value: { id } };
  }
  return { centre, reminderDays, setReminderDays, saveVehicle, addLicence, removeLicence };
}
export type OwnerCompliance = ReturnType<typeof createOwnerCompliance>;
