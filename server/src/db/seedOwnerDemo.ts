import type { Db } from "../portal/common.js";
import { createDriverTargets, weekdayIndex } from "../services/driverTargets.js";

/**
 * Demo data for the Owner Dashboard (docs/OWNER_DASHBOARD.md): three owners in three provinces, six drivers, seven vehicles, targets of different kinds, and four weeks of payments that leave each vehicle in a different state (on time, two days late, far behind, paid ahead, weekly, no target).
 * Everything is obviously fake (registrations start DEMO, e-mail addresses end .invalid) and is created through the real services, so what you see is what the code does. Safe to run twice: users, vehicles and targets are found before they are made, and every payment carries a reference.
 */
export interface DemoResult { owners: { username: string; name: string }[]; vehicles: number; payments: number }
const day = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Plan = { reg: string; driver: number; target?: { period: "daily" | "weekly"; cents: number; dueWeekday?: number }; pattern: "ontime" | "late" | "behind" | "ahead" | "weekly" | "none"; pause?: [number, number, string]; split?: [number, number, number, number] };
const OWNERS: { username: string; name: string; plans: Plan[] }[] = [
  { username: "demo.owner.1", name: "Thandi Nkosi (demo, Gauteng)", plans: [{ reg: "DEMO GP 101", driver: 1, target: { period: "daily", cents: 55000 }, pattern: "ontime" }, { reg: "DEMO GP 102", driver: 2, target: { period: "daily", cents: 60000 }, pattern: "behind" }] },
  { username: "demo.owner.2", name: "Pieter van Wyk (demo, Western Cape)", plans: [{ reg: "DEMO CA 201", driver: 3, target: { period: "daily", cents: 70000 }, pattern: "ahead", split: [7000, 1000, 1500, 500] }, { reg: "DEMO CA 202", driver: 4, target: { period: "weekly", cents: 350000, dueWeekday: 7 }, pattern: "weekly", split: [7000, 1000, 1500, 500] }, { reg: "DEMO CA 203", driver: 4, target: { period: "daily", cents: 65000 }, pattern: "ontime", pause: [9, 6, "Gearbox repair"] }] },
  { username: "demo.owner.3", name: "Sipho Dlamini (demo, KwaZulu-Natal)", plans: [{ reg: "DEMO ND 301", driver: 5, target: { period: "daily", cents: 50000 }, pattern: "late" }, { reg: "DEMO ND 302", driver: 6, pattern: "none" }] },
];
const DRIVERS = ["Dan Driver", "Dee Driver", "Dumi Driver", "Dora Driver", "Dirk Driver", "Dina Driver"];

export async function seedOwnerDemo(db: Db, o: { passwordHash: string; now?: () => Date }): Promise<DemoResult> {
  const now = o.now ?? (() => new Date()), today = day(now()), svc = createDriverTargets(db, now), result: DemoResult = { owners: [], vehicles: 0, payments: 0 };
  const user = async (username: string, name: string, role: string) => { const f = async () => (await db.query(`SELECT id FROM users WHERE username = $1`, [username])).rows[0]; let r = await f(); if (!r) { await db.query(`INSERT INTO users (username, password_hash, role, name, email) VALUES ($1,$2,$3,$4,$5)`, [username, o.passwordHash, role, name, `${username}@demo.invalid`]); r = await f(); } return String(r.id); };
  const drivers: string[] = []; for (let i = 0; i < DRIVERS.length; i++) drivers.push(await user(`demo.driver.${i + 1}`, `${DRIVERS[i]} (demo)`, "driver"));
  for (const ow of OWNERS) {
    const owner = await user(ow.username, ow.name, "vehicle_owner"); result.owners.push({ username: ow.username, name: ow.name });
    for (const p of ow.plans) {
      const driver = drivers[p.driver - 1]; if (!(await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2`, [owner, driver])).rows.length) await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by, responded_at) VALUES ($1,$2,'active','owner', now())`, [owner, driver]);
      let v = (await db.query(`SELECT id FROM vehicles WHERE registration = $1`, [p.reg])).rows[0]; if (!v) { await db.query(`INSERT INTO vehicles (owner_id, registration, make, model, year, seats, driver_id) VALUES ($1,$2,'Toyota','Quantum',2019,15,$3)`, [owner, p.reg, driver]); v = (await db.query(`SELECT id FROM vehicles WHERE registration = $1`, [p.reg])).rows[0]; } const vid = String(v.id); result.vehicles++;
      if (!p.target) continue; const start = shift(today, -27);
      if (!(await svc.targets(owner, vid)).length) { const r = await svc.setTarget(owner, owner, { vehicleId: vid, driverId: driver, period: p.target.period, amountCents: p.target.cents, startDate: start, ...(p.target.dueWeekday ? { dueWeekday: p.target.dueWeekday } : {}), terms: "Demo: paid to the owner before 20:00" }); if (!r.ok) throw new Error(`${p.reg}: ${r.error}`); }
      if (p.split) await svc.setSplit(owner, owner, vid, { ownerBp: p.split[0], associationBp: p.split[1], financeBp: p.split[2], maintenanceBp: p.split[3] });
      if (p.pause && !(await svc.pauses(owner, vid)).length) await svc.addPause(owner, { vehicleId: vid, fromDate: shift(today, -p.pause[0]), toDate: shift(today, -p.pause[0] + p.pause[1] - 1), reason: p.pause[2] });
      const pay = async (d: string, cents: number) => { const r = await svc.recordPayment(owner, owner, { vehicleId: vid, driverId: driver, amountCents: cents, paidOn: d, method: "cash", clientRef: `demo-${p.reg}-${d}` }); if (!r.ok) throw new Error(`${p.reg} ${d}: ${r.error}`); if (!r.value.duplicate) result.payments++; };
      for (let n = 27; n >= 0; n--) {
        const d = shift(today, -n), wd = weekdayIndex(d), paused = p.pause && n <= p.pause[0] && n > p.pause[0] - p.pause[1];
        if (p.pattern === "ontime" && p.target.period === "daily" && wd < 6 && !paused) await pay(d, p.target.cents);
        if (p.pattern === "late" && p.target.period === "daily" && wd < 6 && n > 1) await pay(d, p.target.cents);                                              // paid up to the day before yesterday: two days behind, so amber
        if (p.pattern === "behind" && p.target.period === "daily" && wd < 6 && (n > 7 ? n % 3 !== 0 : false)) await pay(d, p.target.cents);                  // misses one working day in three, then nothing for a week
        if (p.pattern === "ahead" && n === 20) await pay(d, p.target.cents * 24);                                                                         // a lump that pays well ahead
        if (p.pattern === "weekly" && wd === 6) await pay(d, p.target.cents);
      }
    }
  }
  return result;
}
