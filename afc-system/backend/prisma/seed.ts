import { loadConfig } from "../src/config";
import { createDb } from "../src/db";
import { seedDatabase } from "../src/seedData";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const r = await seedDatabase(db, { deviceKeyMaster: config.deviceKeyMaster, adminPassword: process.env.SEED_ADMIN_PASSWORD, log: console.log });
if (r.accounts.length) {
  console.log("\n  Staff accounts created (all share one password):");
  for (const a of r.accounts) console.log("   -", a);
  console.log("  Password:", r.password, process.env.SEED_ADMIN_PASSWORD ? "(from SEED_ADMIN_PASSWORD)" : "(random; shown only now)");
}
for (const d of r.devices) console.log(`\n  Device ${d.id} signing secret (shown once): ${d.secret}`);
await db.$disconnect();
