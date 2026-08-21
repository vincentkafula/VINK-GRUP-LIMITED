import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { pool, hasDb } from "../db/pool.js";

/**
 * Retail POS terminal registration and authentication -- mirrors
 * terminalAuth.ts's proven pattern exactly (same hashing convention,
 * bcryptjs cost factor 10, same "shown once, never retrievable again"
 * API key discipline), for a genuinely separate physical device fleet
 * (retail_terminals, not terminals -- different hardware, no vendor
 * SDK confirmed yet, different ownership model).
 */

export interface RegisterRetailTerminalResult {
  id: string;
  serial: string;
  apiKey: string; // plaintext -- returned exactly once, never retrievable again
}

export async function registerRetailTerminal(serial: string, model: string, registeredBy: string): Promise<RegisterRetailTerminalResult> {
  if (!hasDb || !pool) throw new Error("Database not configured");

  const apiKey = randomBytes(32).toString("hex");
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const { rows } = await pool.query(
    `INSERT INTO retail_terminals (serial, model, api_key_hash, registered_by) VALUES ($1, $2, $3, $4)
     RETURNING id, serial`,
    [serial, model, apiKeyHash, registeredBy]
  );

  return { id: rows[0].id, serial: rows[0].serial, apiKey };
}

export interface RetailTerminalAuthResult {
  authenticated: boolean;
  terminalId?: string;
  merchantId?: string | null;
  error?: string;
}

export async function authenticateRetailTerminal(serial: string, apiKey: string): Promise<RetailTerminalAuthResult> {
  if (!hasDb || !pool) return { authenticated: false, error: "Database not configured" };
  if (!serial || !apiKey) return { authenticated: false, error: "Missing terminal serial or API key" };

  const { rows } = await pool.query(`SELECT id, api_key_hash, status, merchant_id FROM retail_terminals WHERE serial = $1`, [serial]);
  if (!rows.length) return { authenticated: false, error: "Unknown terminal" };

  const terminal = rows[0];
  // Status check before the API key comparison -- same order as
  // terminalAuth.ts, and for the same reason: this is the real
  // access-control lever, so a revoked/inactive terminal is rejected
  // regardless of whether its key is technically still valid.
  if (terminal.status !== "active") return { authenticated: false, error: `Terminal is ${terminal.status}` };

  const valid = await bcrypt.compare(apiKey, terminal.api_key_hash);
  if (!valid) return { authenticated: false, error: "Invalid API key" };

  await pool.query(`UPDATE retail_terminals SET last_seen_at = now() WHERE id = $1`, [terminal.id]);
  return { authenticated: true, terminalId: terminal.id, merchantId: terminal.merchant_id };
}
