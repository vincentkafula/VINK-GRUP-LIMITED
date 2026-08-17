import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { pool, hasDb } from "../db/pool.js";

/**
 * AFC terminal registration and authentication -- the device-credential
 * equivalent of user login, but for a physical P18Q bus validator (or
 * equivalent) unit rather than a person. A terminal authenticates with a serial +
 * API key pair, not a JWT, since it isn't a logged-in user session.
 *
 * Same hashing convention as user passwords elsewhere in this codebase
 * (bcryptjs, cost factor 10) -- the API key itself is generated once,
 * shown to the operator exactly once at registration time, and only its
 * hash is ever stored. There is no "forgot API key" flow by design: a
 * lost key means re-registering the terminal with a new one, same as
 * losing a physical device credential in any real terminal fleet.
 */

export interface RegisterTerminalResult {
  id: string;
  serial: string;
  apiKey: string; // plaintext -- returned exactly once, never retrievable again
}

export async function registerTerminal(serial: string, model: string, registeredBy: string): Promise<RegisterTerminalResult> {
  if (!hasDb || !pool) throw new Error("Database not configured");

  const apiKey = randomBytes(32).toString("hex"); // 64 hex chars -- plenty of entropy for a device credential
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const { rows } = await pool.query(
    `INSERT INTO terminals (serial, model, api_key_hash, registered_by) VALUES ($1, $2, $3, $4)
     RETURNING id, serial`,
    [serial, model, apiKeyHash, registeredBy]
  );

  return { id: rows[0].id, serial: rows[0].serial, apiKey };
}

export interface TerminalAuthResult {
  authenticated: boolean;
  terminalId?: string;
  error?: string;
}

export async function authenticateTerminal(serial: string, apiKey: string): Promise<TerminalAuthResult> {
  if (!hasDb || !pool) return { authenticated: false, error: "Database not configured" };
  if (!serial || !apiKey) return { authenticated: false, error: "Missing terminal serial or API key" };

  const { rows } = await pool.query(`SELECT id, api_key_hash, status FROM terminals WHERE serial = $1`, [serial]);
  if (!rows.length) return { authenticated: false, error: "Unknown terminal" };

  const terminal = rows[0];
  if (terminal.status !== "active") return { authenticated: false, error: `Terminal is ${terminal.status}` };

  const valid = await bcrypt.compare(apiKey, terminal.api_key_hash);
  if (!valid) return { authenticated: false, error: "Invalid API key" };

  await pool.query(`UPDATE terminals SET last_seen_at = now() WHERE id = $1`, [terminal.id]);
  return { authenticated: true, terminalId: terminal.id };
}
