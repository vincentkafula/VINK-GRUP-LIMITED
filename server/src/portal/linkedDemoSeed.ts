import { randomUUID } from "node:crypto";
import { seedEnabled } from "../auth/seedRoleAccounts.js";
import type { Db } from "./driverRoutes.js";

/**
 * Links the seeded test accounts together so every dashboard has something to show: the owner owns the demo vehicle, the driver drives
 * it, the marshal works at the association's demo rank, the investor holds the demo terminal, and the association has all of them as
 * members. Runs after seedDriverDemo (which creates the vehicle, terminal, route and fares), under the same switch (NODE_ENV not
 * production, or SEED_ENABLED=true). Idempotent. Everything created here is labelled sample/test data; no rates or fees are invented:
 * the per-fare split figures come from the platform's existing split rule (a flat R1.00 platform fee, 10% of that fee to the investor,
 * the rest to the owner).
 */
const DEMO_REG = "DEMO 001 GP";
const DEMO_SERIAL = "DEMO-TERMINAL-001";
const RANK = "Demo Rank";

export async function seedLinkedDemo(db: Db, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log, now: Date = new Date()): Promise<void> {
  if (!seedEnabled(env)) return;
  const idOf = async (envKey: string, role: string): Promise<string | null> => {
    const email = env[envKey]?.trim().toLowerCase();
    if (!email) return null;
    const r = (await db.query(`SELECT id FROM users WHERE lower(email) = $1 AND role = $2 LIMIT 1`, [email, role])).rows[0];
    return r ? String(r.id) : null;
  };
  const owner = await idOf("SEED_OWNER_EMAIL", "vehicle_owner"), driver = await idOf("SEED_DRIVER_EMAIL", "driver"), marshal = await idOf("SEED_MARSHAL_EMAIL", "marshal");
  const assoc = await idOf("SEED_ASSOCIATION_EMAIL", "association"), investor = await idOf("SEED_INVESTOR_EMAIL", "investor");

  const vehicle = (await db.query(`SELECT id FROM vehicles WHERE registration = $1`, [DEMO_REG])).rows[0];
  const terminal = (await db.query(`SELECT id FROM terminals WHERE serial = $1`, [DEMO_SERIAL])).rows[0];
  if (!vehicle || !terminal) return;                                     // the driver demo has not run (no test driver configured)

  if (owner) {
    await db.query(`UPDATE vehicles SET owner_id = $2 WHERE id = $1`, [vehicle.id, owner]);
    await db.query(`UPDATE terminals SET owner_id = $2 WHERE id = $1`, [terminal.id, owner]);
  }
  if (driver) await db.query(`UPDATE vehicles SET driver_id = $2 WHERE id = $1`, [vehicle.id, driver]);
  if (investor) await db.query(`UPDATE terminals SET investor_id = $2 WHERE id = $1`, [terminal.id, investor]);
  if (assoc) await db.query(`UPDATE vehicle_routes SET association_id = $2 WHERE terminal_id = $1`, [terminal.id, assoc]);

  // Sample fares get the stored split figures the real system would have written for them.
  await db.query(`UPDATE terminal_taps SET vink_fee_device = 0.50, vink_fee_card = 0.50, investor_share = 0.10, owner_settlement = amount - 1.00 WHERE terminal_id = $1 AND investor_share IS NULL`, [terminal.id]);

  const link = async (table: "memberships" | "owner_drivers", cols: [string, string], a: string, b: string, extra: Record<string, string>) => {
    if ((await db.query(`SELECT 1 AS x FROM ${table} WHERE ${cols[0]} = $1 AND ${cols[1]} = $2`, [a, b])).rows.length) return;
    const names = Object.keys(extra);
    await db.query(`INSERT INTO ${table} (${cols[0]}, ${cols[1]}, status, ${names.join(", ")}) VALUES ($1,$2,'active', ${names.map((_, i) => `$${i + 3}`).join(", ")})`, [a, b, ...names.map((n) => extra[n])]);
  };
  if (assoc) {
    if (owner) await link("memberships", ["association_id", "member_id"], assoc, owner, { member_role: "vehicle_owner", requested_by: "association" });
    if (driver) await link("memberships", ["association_id", "member_id"], assoc, driver, { member_role: "driver", requested_by: "association" });
    if (marshal) await link("memberships", ["association_id", "member_id"], assoc, marshal, { member_role: "marshal", requested_by: "association" });
  }
  if (owner && driver) await link("owner_drivers", ["owner_id", "driver_id"], owner, driver, { requested_by: "owner" });

  if (assoc) {
    let rank = (await db.query(`SELECT id FROM ranks WHERE association_id = $1 AND name = $2`, [assoc, RANK])).rows[0];
    if (!rank) {
      const id = randomUUID();
      await db.query(`INSERT INTO ranks (id, association_id, name, location) VALUES ($1,$2,$3,'Soweto (sample rank)')`, [id, assoc, RANK]);
      rank = { id };
    }
    if (marshal && !(await db.query(`SELECT 1 AS x FROM rank_marshals WHERE rank_id = $1 AND marshal_id = $2`, [rank.id, marshal])).rows.length)
      await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [rank.id, marshal]);
    if (marshal && !(await db.query(`SELECT 1 AS x FROM departures WHERE rank_id = $1`, [rank.id])).rows.length) {
      for (const [i, pax] of [14, 15, 11].entries())                                // three sample departures over the last days (sample numbers)
        await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, passengers, note, departed_at) VALUES ($1,$2,$3,$4,$5,$6,'Sample departure',$7)`,
          [randomUUID(), rank.id, vehicle.id, driver, marshal, pax, new Date(now.getTime() - (i + 1) * 20 * 3600_000)]);
    }
    if (marshal && !(await db.query(`SELECT 1 AS x FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL`, [rank.id])).rows.length)
      await db.query(`INSERT INTO rank_queue (id, rank_id, vehicle_id) VALUES ($1,$2,$3)`, [randomUUID(), rank.id, vehicle.id]);

    if (owner && !(await db.query(`SELECT 1 AS x FROM levies WHERE association_id = $1`, [assoc])).rows.length)
      await db.query(`INSERT INTO levies (id, association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,'Sample levy (test data)', 100.00, $4)`, [randomUUID(), assoc, owner, new Date(now.getTime() + 14 * 86400_000).toISOString().slice(0, 10)]);
  }
  if (owner && !(await db.query(`SELECT 1 AS x FROM compliance_documents WHERE owner_id = $1`, [owner])).rows.length)
    await db.query(`INSERT INTO compliance_documents (id, owner_id, vehicle_id, kind, reference, expires_on) VALUES ($1,$2,$3,'Operating licence (sample)','SAMPLE-0001',$4)`, [randomUUID(), owner, vehicle.id, new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10)]);

  log("[seed] demo links created: owner, driver, marshal, investor and association are connected through the demo vehicle and rank");
}
