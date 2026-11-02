/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { LEDGER_GUARDS } = require("./core/db");

/**
 * For tests that PROVE a check would catch a corrupted ledger: they corrupt it on purpose, which the append-only triggers (rightly) refuse. This lifts those triggers, by name,
 * to stand in for "someone got round them" (a restored file, a dropped trigger, a database edited outside the application). Nothing else should ever use this.
 */
export function tampering<T extends { db: { exec(sql: string): unknown } }>(engine: T): T {
  for (const t of LEDGER_GUARDS as string[]) engine.db.exec(`DROP TRIGGER IF EXISTS ${t}`);
  return engine;
}
