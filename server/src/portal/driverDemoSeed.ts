import { randomUUID } from "node:crypto";
import { seedEnabled } from "../auth/seedRoleAccounts.js";
import type { Db } from "./driverRoutes.js";

/**
 * Test data for the seeded test driver (SEED_DRIVER_EMAIL), so every screen of the Driver's Dashboard has something to show:
 * one vehicle, one fare terminal fitted to it, one route, a week of sample fares and one sample off-route fine.
 *
 * Same switch as the test accounts (NODE_ENV not production, or SEED_ENABLED=true). Idempotent: nothing is created twice, and a
 * terminal that already has fares is left alone. The fares are SAMPLE amounts for testing only, not tariffs. The fine amount is the
 * system's existing fixed off-route fine (routes/terminalRouter.ts). The terminal gets an unusable key hash, so it cannot be used to
 * post real taps.
 */
const DEMO_SERIAL = "DEMO-TERMINAL-001";
const DEMO_REG = "DEMO 001 GP";
const SAMPLE_FARES = [15, 15, 20, 15, 25, 15, 20, 15, 15, 30, 15, 20];
const OFF_ROUTE_FINE = 50;

export async function seedDriverDemo(db: Db, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log, now: Date = new Date()): Promise<void> {
  if (!seedEnabled(env)) return;
  const email = env.SEED_DRIVER_EMAIL?.trim().toLowerCase();
  if (!email) return;
  const driver = (await db.query(`SELECT id FROM users WHERE lower(email) = $1 AND role = 'driver' LIMIT 1`, [email])).rows[0];
  if (!driver) return;
  const driverId = String(driver.id);

  let vehicle = (await db.query(`SELECT id FROM vehicles WHERE registration = $1`, [DEMO_REG])).rows[0];
  if (!vehicle) {
    const id = randomUUID();
    const disc = new Date(now.getTime() + 45 * 86400_000).toISOString().slice(0, 10);       // inside the reminder window, to show the reminder
    await db.query(`INSERT INTO vehicles (id, registration, make, model, year, colour, seats, disc_expiry) VALUES ($1,$2,'Toyota','Quantum',2021,'White',15,$3)`, [id, DEMO_REG, disc]);
    vehicle = { id };
  }

  let terminal = (await db.query(`SELECT id, driver_id FROM terminals WHERE serial = $1`, [DEMO_SERIAL])).rows[0];
  if (!terminal) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO terminals (id, serial, api_key_hash, status, assigned_driver, registered_by, driver_id, vehicle_id) VALUES ($1,$2,'!seeded-not-a-usable-key','active','Test Driver','seed',$3,$4)`,
      [id, DEMO_SERIAL, driverId, vehicle.id]);
    terminal = { id, driver_id: driverId };
  } else if (String(terminal.driver_id) !== driverId) {
    await db.query(`UPDATE terminals SET driver_id = $2, vehicle_id = $3 WHERE id = $1`, [terminal.id, driverId, vehicle.id]);
  }
  const terminalId = String(terminal.id);

  let route = (await db.query(`SELECT id FROM vehicle_routes WHERE terminal_id = $1 LIMIT 1`, [terminalId])).rows[0];
  if (!route) {
    const id = randomUUID();
    await db.query(`INSERT INTO vehicle_routes (id, terminal_id, name) VALUES ($1,$2,'Demo route (Soweto to Johannesburg CBD)')`, [id, terminalId]);
    const pts = [[-26.2678, 27.8585], [-26.2400, 27.9400], [-26.2250, 28.0000], [-26.2041, 28.0473]];
    for (let i = 0; i < pts.length; i++) await db.query(`INSERT INTO route_waypoints (id, route_id, sequence, lat, lng) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, i + 1, pts[i][0], pts[i][1]]);
    route = { id };
  }

  const haveTaps = Number((await db.query(`SELECT COUNT(*) AS n FROM terminal_taps WHERE terminal_id = $1`, [terminalId])).rows[0]?.n ?? 0);
  if (haveTaps === 0) {
    for (let i = 0; i < SAMPLE_FARES.length; i++) {
      const at = new Date(now.getTime() - i * 14 * 3600_000);                                 // spread over the last ~week
      await db.query(
        `INSERT INTO terminal_taps (id, terminal_id, masked_pan, scheme, amount, status, received_at) VALUES ($1,$2,'**** **** **** 0000',$3,$4,'confirmed',$5)`,
        [randomUUID(), terminalId, i % 3 === 0 ? "mastercard" : "visa", SAMPLE_FARES[i], at]);
    }
    const posId = randomUUID(), vioId = randomUUID(), at = new Date(now.getTime() - 2 * 86400_000);
    await db.query(`INSERT INTO vehicle_positions (id, terminal_id, lat, lng, recorded_at) VALUES ($1,$2,-26.3100,27.9000,$3)`, [posId, terminalId, at]);
    await db.query(`INSERT INTO route_violations (id, terminal_id, route_id, position_id, distance_from_route_m, fine_amount, created_at) VALUES ($1,$2,$3,$4,640,$5,$6)`, [vioId, terminalId, route.id, posId, OFF_ROUTE_FINE, at]);
    await db.query(`INSERT INTO driver_ledger (id, driver_id, amount, balance_after, reference_id, description, created_at) VALUES ($1,$2,$3,$3,$4,'Off-route fine (sample)',$5)`, [randomUUID(), driverId, -OFF_ROUTE_FINE, vioId, at]);
    log("[seed] demo vehicle, route, sample fares and one sample fine created for the test driver");
  }
}
