import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { pool, hasDb } from "../db/pool.js";

/**
 * Till terminal registration and authentication -- mirrors
 * retailAuth.ts/terminalAuth.ts's proven pattern exactly, same hashing
 * convention, same "shown once, never retrievable again" API key
 * discipline, for a genuinely separate physical device fleet
 * (till_terminals, not retail_terminals or terminals).
 */

export interface RegisterTillTerminalResult {
  id: string;
  serial: string;
  apiKey: string; // plaintext -- returned exactly once, never retrievable again
}

export async function registerTillTerminal(serial: string, model: string, registeredBy: string): Promise<RegisterTillTerminalResult> {
  if (!hasDb || !pool) throw new Error("Database not configured");

  const apiKey = randomBytes(32).toString("hex");
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const { rows } = await pool.query(
    `INSERT INTO till_terminals (serial, model, api_key_hash, registered_by) VALUES ($1, $2, $3, $4)
     RETURNING id, serial`,
    [serial, model, apiKeyHash, registeredBy]
  );

  return { id: rows[0].id, serial: rows[0].serial, apiKey };
}

export interface TillTerminalAuthResult {
  authenticated: boolean;
  terminalId?: string;
  merchantId?: string | null;
  error?: string;
}

export async function authenticateTillTerminal(serial: string, apiKey: string): Promise<TillTerminalAuthResult> {
  if (!hasDb || !pool) return { authenticated: false, error: "Database not configured" };
  if (!serial || !apiKey) return { authenticated: false, error: "Missing terminal serial or API key" };

  const { rows } = await pool.query(`SELECT id, api_key_hash, status, merchant_id FROM till_terminals WHERE serial = $1`, [serial]);
  if (!rows.length) return { authenticated: false, error: "Unknown terminal" };

  const terminal = rows[0];
  // Status check before the API key comparison -- same order as
  // every other terminal auth service in this codebase, and for the
  // same reason: this is the real access-control lever.
  if (terminal.status !== "active") return { authenticated: false, error: `Terminal is ${terminal.status}` };

  const valid = await bcrypt.compare(apiKey, terminal.api_key_hash);
  if (!valid) return { authenticated: false, error: "Invalid API key" };

  await pool.query(`UPDATE till_terminals SET last_seen_at = now() WHERE id = $1`, [terminal.id]);
  return { authenticated: true, terminalId: terminal.id, merchantId: terminal.merchant_id };
}
