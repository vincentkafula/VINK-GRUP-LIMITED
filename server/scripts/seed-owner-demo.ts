/**
 * Fills the Owner Dashboard with demo data (three owners, six drivers, seven vehicles, four weeks of payments). For a demo or development database ONLY.
 *
 *   cd server
 *   DATABASE_URL=postgres://... DEMO_PASSWORD='a-long-passphrase' npm run seed:owner-demo
 *
 * Needs DEMO_PASSWORD (at least 12 characters; there is no default), used for all the demo logins (demo.owner.1 to 3, demo.driver.1 to 6). Refuses to run when NODE_ENV is production unless ALLOW_DEMO_SEED=1.
 * Safe to run twice. Everything it makes is marked DEMO and uses .invalid e-mail addresses.
 */
import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";
import { BCRYPT_ROUNDS } from "../src/config/secrets.js";
import { seedOwnerDemo } from "../src/db/seedOwnerDemo.js";

async function main() {
  if (!pool) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") throw new Error("Refusing to put demo data in a production database. Set ALLOW_DEMO_SEED=1 only if you really mean it.");
  const password = process.env.DEMO_PASSWORD; if (!password || password.length < 12) throw new Error("DEMO_PASSWORD must be set and at least 12 characters.");
  const r = await seedOwnerDemo(pool as never, { passwordHash: await bcrypt.hash(password.trim(), BCRYPT_ROUNDS) });
  console.log(`Demo data ready: ${r.owners.length} owners, ${r.vehicles} vehicles, ${r.payments} new payments.`); for (const o of r.owners) console.log(`  ${o.username}  ${o.name}`);
  await pool.end();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
