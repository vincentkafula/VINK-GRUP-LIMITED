import { randomBytes } from "node:crypto";
import { SAMPLE_CARDS, sampleFareTable } from "@afc/shared";
import { hashPassword } from "./auth/password";
import type { Db } from "./db";
import { SYSTEM } from "./domain/audit";
import { registerDevice } from "./domain/devices";
import { publishFareTable, upsertRoute, replaceDiscounts, replaceTimeRules, type RouteInput } from "./domain/fares";
import { registerCard } from "./domain/cards";

/**
 * Sample data: one operator, two routes, time-of-day and passenger-category rules, a published fare table, staff accounts for every role,
 * one demo validator, and four demo cards. Safe to run twice (it skips what already exists).
 * Passwords: SEED_ADMIN_PASSWORD if set, otherwise a random one printed once. Never a default that works on a real server.
 */
export async function seedDatabase(db: Db, o: { deviceKeyMaster: Buffer; adminPassword?: string; log?: (m: string) => void }) {
  const log = o.log ?? (() => {});
  const out: { password: string; accounts: string[]; devices: { id: string; secret: string }[] } = { password: "", accounts: [], devices: [] };
  const table = sampleFareTable();

  await db.operator.upsert({ where: { id: 1 }, create: { id: 1, name: "Demo Transit" }, update: {} });
  for (const r of table.routes) {
    const input: RouteInput = { ...r, active: true, stops: r.stops, fare: r.fare };
    if (!(await db.route.findUnique({ where: { id: r.id } }))) await upsertRoute(db, SYSTEM, input);
  }
  if ((await db.timeRule.count()) === 0) await replaceTimeRules(db, SYSTEM, table.timeRules.map(({ id: _id, ...t }) => t));
  await replaceDiscounts(db, SYSTEM, table.discounts);
  if ((await db.fareTableVersion.count()) === 0) await publishFareTable(db, SYSTEM);

  const password = o.adminPassword ?? randomBytes(9).toString("base64url") + "7a";
  out.password = password;
  const staff: { email: string; name: string; role: "ADMIN" | "OPERATOR" | "AGENT" | "VIEWER"; operatorId?: number }[] = [
    { email: "admin@afc.local", name: "Admin", role: "ADMIN" },
    { email: "operator@afc.local", name: "Operator manager", role: "OPERATOR", operatorId: 1 },
    { email: "agent@afc.local", name: "Cash agent", role: "AGENT" },
    { email: "viewer@afc.local", name: "Viewer", role: "VIEWER" },
  ];
  for (const s of staff) {
    if (await db.adminUser.findUnique({ where: { email: s.email } })) continue;
    await db.adminUser.create({ data: { ...s, passwordHash: await hashPassword(password) } });
    out.accounts.push(s.email);
  }

  if (!(await db.device.findUnique({ where: { id: "VAL-0001" } }))) {
    const d = await registerDevice(db, SYSTEM, o.deviceKeyMaster, { id: "VAL-0001", name: "Demo validator (bus 1)", routeId: 1 });
    out.devices.push({ id: d.device.id, secret: d.secret });
  }

  for (const c of SAMPLE_CARDS) {
    if (await db.card.findUnique({ where: { uid: c.uid } })) continue;
    await registerCard(db, SYSTEM, { uid: c.uid, holderName: c.holder, category: c.category, initialBalance: c.balance });
  }
  log(`seeded: ${out.accounts.length} new staff account(s), ${out.devices.length} new device(s)`);
  return out;
}
