/**
 * Sets how long an operating licence may last in a province. For an ADMINISTRATOR: an owner or an association never changes what the law says.
 *
 *   cd server
 *   DATABASE_URL=postgres://... npm run licence-rule -- "Gauteng" 5 --verified --note "Confirmed with the Gauteng PRE on 2 Nov 2026"
 *   DATABASE_URL=postgres://... npm run licence-rule -- "*" 7            (the rule for any province not listed)
 *   DATABASE_URL=postgres://... npm run licence-rule -- list
 *
 * Without --verified the rule is saved as NOT VERIFIED, and the screens say so. Only pass --verified once someone has checked the figure with the Provincial Regulatory Entity.
 */
import { pool } from "../src/db/pool.js";
import { createLicenceRules } from "../src/services/licenceRules.js";

async function main() {
  if (!pool) throw new Error("DATABASE_URL is not set."); const rules = createLicenceRules(pool as never), args = process.argv.slice(2);
  if (args[0] === "list" || args.length === 0) { for (const r of await rules.list()) console.log(`${r.province.padEnd(14)} ${String(r.maxYears).padStart(2)} years  ${r.verified ? "verified    " : "NOT verified"}  ${r.note ?? ""}`); await pool.end(); return; }
  const [province, years] = args, note = args.includes("--note") ? args[args.indexOf("--note") + 1] : undefined; const r = await rules.set(province, Number(years), { verified: args.includes("--verified"), ...(note !== undefined ? { note } : {}) });
  if (!r.ok) throw new Error(r.error); console.log(`${r.rule.province}: ${r.rule.maxYears} years, ${r.rule.verified ? "verified" : "NOT verified"}.`); await pool.end();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
