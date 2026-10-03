import { Router, json, type Request, type Response, type RequestHandler } from "express";

/**
 * The Driver's Dashboard API, mounted at /api/portal/driver (driver accounts only; the guard is applied where this is mounted).
 *
 * Everything here is real data. A driver sees only their own records: every query is keyed on the signed-in user's id, never on an id
 * taken from the URL or body.
 *
 *   GET  /profile            who I am + the details I entered      PUT /profile   update those details
 *   GET  /vehicle            the vehicle(s) I drive, with the licence-disc date
 *   GET  /routes             the routes of my vehicle(s)
 *   GET  /trips              fares tapped on my vehicle(s), newest first
 *   GET  /earnings           fares collected today / this week / this month, fines and my fine balance
 *   GET  /notifications      derived from real events (new fines, documents about to expire)    POST /notifications/read
 *
 * Deliberately NOT here: pay, payslip, UIF or tax. A driver's pay is a private arrangement with the owner that this platform does not
 * calculate or record (see services/revenueSplitService.ts).
 */
export interface Db { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

/** Reminder window for expiring documents. A display threshold only; it changes no rule or amount. */
export const EXPIRY_WARNING_DAYS = 60;
const SA_OFFSET_MS = 2 * 3600_000;      // South Africa is UTC+2 all year (no daylight saving)

/** Start of today / this week (Monday) / this month in South African time, as instants. */
export function saPeriods(now: Date): { day: Date; week: Date; month: Date } {
  const local = new Date(now.getTime() + SA_OFFSET_MS);
  const dayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const monthLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return { day: new Date(dayLocal - SA_OFFSET_MS), week: new Date(dayLocal - sinceMonday * 86400_000 - SA_OFFSET_MS), month: new Date(monthLocal - SA_OFFSET_MS) };
}

const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const dateOnly = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const h = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

/** Validates and cleans the editable profile fields. Returns an error message or the clean values. */
export function cleanProfile(b: Record<string, unknown>): { error: string } | { value: Record<string, string | null> } {
  const text = (k: string, max: number, re: RegExp, label: string): string | null | { error: string } => {
    const v = b[k];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || v.trim().length > max || !re.test(v.trim())) return { error: `${label} is not valid` };
    return v.trim();
  };
  const date = (k: string, label: string): string | null | { error: string } => {
    const v = b[k];
    if (v === undefined || v === null || v === "") return null;
    return typeof v === "string" && validDate(v) ? v : { error: `${label} must be a date like 2027-03-31` };
  };
  const fields: [string, string | null | { error: string }][] = [
    ["phone", text("phone", 20, /^[+0-9 ()-]{7,20}$/, "Phone number")],
    ["licence_number", text("licence_number", 30, /^[A-Za-z0-9 /-]+$/, "Licence number")],
    ["licence_code", text("licence_code", 10, /^[A-Za-z0-9 ]+$/, "Licence code")],
    ["licence_expiry", date("licence_expiry", "Licence expiry")],
    ["pdp_number", text("pdp_number", 30, /^[A-Za-z0-9 /-]+$/, "PDP number")],
    ["pdp_expiry", date("pdp_expiry", "PDP expiry")],
  ];
  const value: Record<string, string | null> = {};
  for (const [k, v] of fields) {
    if (v !== null && typeof v === "object") return { error: v.error };
    value[k] = v;
  }
  return { value };
}

interface Reminder { key: string; kind: "licence" | "pdp" | "disc"; title: string; body: string; date: string }
/** Documents that are expired or expire within the warning window. */
export function expiryReminders(items: { key: string; kind: Reminder["kind"]; label: string; date: string | null }[], now: Date): Reminder[] {
  const out: Reminder[] = [];
  for (const it of items) {
    if (!it.date) continue;
    const days = Math.floor((Date.parse(it.date + "T00:00:00Z") - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400_000);
    if (days > EXPIRY_WARNING_DAYS) continue;
    out.push({
      key: `${it.key}:${it.date}`, kind: it.kind, date: it.date,
      title: days < 0 ? `${it.label} has expired` : `${it.label} expires in ${days} day${days === 1 ? "" : "s"}`,
      body: days < 0 ? `It expired on ${it.date}. Please renew it.` : `Expiry date: ${it.date}.`,
    });
  }
  return out;
}

export function createDriverRouter(db: Db, now: () => Date = () => new Date()): Router {
  const router = Router();
  const uid = (req: Request) => req.user!.userId;

  router.get("/", (req, res) => { res.json({ success: true, role: "driver", user: { id: uid(req), username: req.user!.username } }); });

  router.get("/profile", h(async (req, res) => {
    const u = (await db.query(`SELECT username, name, email FROM users WHERE id = $1`, [uid(req)])).rows[0];
    const p = (await db.query(`SELECT phone, licence_number, licence_code, licence_expiry, pdp_number, pdp_expiry FROM driver_profiles WHERE user_id = $1`, [uid(req)])).rows[0];
    res.json({
      success: true,
      user: { username: u?.username, name: u?.name, email: u?.email },
      profile: { phone: p?.phone ?? null, licenceNumber: p?.licence_number ?? null, licenceCode: p?.licence_code ?? null, licenceExpiry: dateOnly(p?.licence_expiry), pdpNumber: p?.pdp_number ?? null, pdpExpiry: dateOnly(p?.pdp_expiry) },
    });
  }));

  router.put("/profile", json({ limit: "10kb" }), h(async (req, res) => {
    const c = cleanProfile(req.body ?? {});
    if ("error" in c) { res.status(400).json({ success: false, error: c.error }); return; }
    const v = c.value;
    await db.query(
      `INSERT INTO driver_profiles (user_id, phone, licence_number, licence_code, licence_expiry, pdp_number, pdp_expiry, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (user_id) DO UPDATE SET phone=$2, licence_number=$3, licence_code=$4, licence_expiry=$5, pdp_number=$6, pdp_expiry=$7, updated_at=now()`,
      [uid(req), v.phone, v.licence_number, v.licence_code, v.licence_expiry, v.pdp_number, v.pdp_expiry]);
    res.json({ success: true });
  }));

  router.get("/vehicle", h(async (req, res) => {
    const r = await db.query(
      `SELECT t.id AS terminal_id, t.serial, t.status, t.last_seen_at, v.registration, v.make, v.model, v.year, v.colour, v.seats, v.disc_expiry
         FROM terminals t LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE (t.driver_id = $1 OR v.driver_id = $1) AND t.status <> 'revoked' ORDER BY t.registered_at DESC`, [uid(req)]);
    // A vehicle the owner put me on may have no fare terminal yet: it still belongs on this screen.
    const bare = (await db.query(`SELECT id, registration, make, model, year, colour, seats, disc_expiry FROM vehicles WHERE driver_id = $1`, [uid(req)])).rows
      .filter((v) => !r.rows.some((x) => x.registration === v.registration))
      .map((v) => ({ terminal_id: null, serial: null, status: null, last_seen_at: null, registration: v.registration, make: v.make, model: v.model, year: v.year, colour: v.colour, seats: v.seats, disc_expiry: v.disc_expiry }));
    res.json({
      success: true,
      vehicles: [...r.rows, ...bare].map((x) => ({
        terminalId: x.terminal_id ?? null, terminalSerial: x.serial ?? null, terminalStatus: x.status ?? null, lastSeenAt: iso(x.last_seen_at),
        registration: x.registration ?? null, make: x.make ?? null, model: x.model ?? null, year: x.year ?? null, colour: x.colour ?? null,
        seats: x.seats ?? null, discExpiry: dateOnly(x.disc_expiry),
      })),
    });
  }));

  router.get("/routes", h(async (req, res) => {
    const r = await db.query(
      `SELECT r.id, r.name, r.active, r.tolerance_meters, t.serial, COUNT(w.id) AS waypoints
         FROM vehicle_routes r JOIN terminals t ON t.id = r.terminal_id
         LEFT JOIN vehicles v ON v.id = t.vehicle_id
         LEFT JOIN route_waypoints w ON w.route_id = r.id
        WHERE (t.driver_id = $1 OR v.driver_id = $1)
        GROUP BY r.id, r.name, r.active, r.tolerance_meters, r.created_at, t.serial
        ORDER BY r.created_at DESC`, [uid(req)]);
    res.json({ success: true, routes: r.rows.map((x) => ({ id: x.id, name: x.name, active: x.active, toleranceMeters: num(x.tolerance_meters), terminalSerial: x.serial, waypoints: num(x.waypoints) })) });
  }));

  router.get("/trips", h(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const r = await db.query(
      `SELECT k.id, k.amount, k.currency, k.scheme, k.status, k.received_at, t.serial
         FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE (t.driver_id = $1 OR v.driver_id = $1) ORDER BY k.received_at DESC LIMIT $2`, [uid(req), limit]);
    // Card details are never sent to the dashboard: only what the driver needs (when, how much, whether it went through).
    res.json({ success: true, trips: r.rows.map((x) => ({ id: x.id, at: iso(x.received_at), amount: num(x.amount), currency: x.currency, scheme: x.scheme ?? null, status: x.status, terminalSerial: x.serial })) });
  }));

  router.get("/earnings", h(async (req, res) => {
    const p = saPeriods(now());
    const sum = async (from: Date) => {
      const r = (await db.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(k.amount), 0) AS total
           FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
          WHERE (t.driver_id = $1 OR v.driver_id = $1) AND k.status = 'confirmed' AND k.received_at >= $2`, [uid(req), from])).rows[0];
      return { count: num(r?.n), total: num(r?.total) };
    };
    const [today, week, month] = [await sum(p.day), await sum(p.week), await sum(p.month)];
    const fines = (await db.query(
      `SELECT l.id, l.amount, l.balance_after, l.description, l.created_at, v.distance_from_route_m, r.name AS route_name
         FROM driver_ledger l
         LEFT JOIN route_violations v ON v.id = l.reference_id
         LEFT JOIN vehicle_routes r ON r.id = v.route_id
        WHERE l.driver_id = $1 ORDER BY l.created_at DESC LIMIT 50`, [uid(req)])).rows;
    res.json({
      success: true, currency: "ZAR",
      faresCollected: { today, week, month },                              // takings of the vehicle, NOT the driver's pay
      fineBalance: fines.length ? num(fines[0].balance_after) : 0,        // running balance after the latest entry (fines are negative)
      fines: fines.map((f) => ({ id: f.id, amount: num(f.amount), balanceAfter: num(f.balance_after), description: f.description ?? null, at: iso(f.created_at), distanceFromRouteMeters: f.distance_from_route_m == null ? null : num(f.distance_from_route_m), route: f.route_name ?? null })),
    });
  }));

  router.get("/notifications", h(async (req, res) => {
    const when = now();
    const prof = (await db.query(`SELECT licence_expiry, pdp_expiry FROM driver_profiles WHERE user_id = $1`, [uid(req)])).rows[0];
    const veh = [...new Map((await db.query(`SELECT DISTINCT v.registration, v.disc_expiry FROM vehicles v LEFT JOIN terminals t ON t.vehicle_id = v.id WHERE (t.driver_id = $1 AND t.status <> 'revoked') OR v.driver_id = $1`, [uid(req)])).rows.map((v) => [v.registration, v])).values()];
    const items: { key: string; kind: string; title: string; body: string; at: string }[] = [];

    for (const r of expiryReminders([
      { key: "licence", kind: "licence", label: "Your driving licence", date: dateOnly(prof?.licence_expiry) },
      { key: "pdp", kind: "pdp", label: "Your professional driving permit", date: dateOnly(prof?.pdp_expiry) },
      ...veh.map((v) => ({ key: `disc-${v.registration}`, kind: "disc" as const, label: `Licence disc for ${v.registration}`, date: dateOnly(v.disc_expiry) })),
    ], when)) items.push({ key: r.key, kind: r.kind, title: r.title, body: r.body, at: r.date + "T00:00:00.000Z" });

    const since = new Date(when.getTime() - 30 * 86400_000);
    const fines = (await db.query(`SELECT id, amount, created_at FROM driver_ledger WHERE driver_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 50`, [uid(req), since])).rows;
    for (const f of fines) items.push({ key: `fine:${f.id}`, kind: "fine", title: "Off-route fine recorded", body: `A fine of R ${Math.abs(num(f.amount)).toFixed(2)} was added to your account.`, at: iso(f.created_at)! });

    const read = new Set((await db.query(`SELECT key FROM notification_reads WHERE user_id = $1`, [uid(req)])).rows.map((x) => String(x.key)));
    items.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ success: true, notifications: items.map((i) => ({ ...i, read: read.has(i.key) })), unread: items.filter((i) => !read.has(i.key)).length });
  }));

  router.post("/notifications/read", json({ limit: "10kb" }), h(async (req, res) => {
    const keys = Array.isArray(req.body?.keys) ? (req.body.keys as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 200).slice(0, 100) : [];
    for (const key of keys) await db.query(`INSERT INTO notification_reads (user_id, key) VALUES ($1,$2) ON CONFLICT (user_id, key) DO NOTHING`, [uid(req), key]);
    res.json({ success: true, marked: keys.length });
  }));

  return router;
}
