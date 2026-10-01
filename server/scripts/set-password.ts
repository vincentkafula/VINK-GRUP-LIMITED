/**
 * Set (rotate) a user's password directly in the database.
 *
 *   cd server
 *   DATABASE_URL=postgres://... NEW_PASSWORD='a-long-random-passphrase' npm run set-password -- <username>
 *
 * Read the new password from NEW_PASSWORD (not a command-line argument, so it does not end up in shell
 * history or process lists). Needs at least 12 characters. The password is hashed with bcrypt before it is stored.
 */
import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";
import { BCRYPT_ROUNDS } from "../src/config/secrets.js";

async function main() {
  const username = process.argv[2];
  const password = process.env.NEW_PASSWORD;
  if (!pool) throw new Error("DATABASE_URL is not set.");
  if (!username) throw new Error("Usage: NEW_PASSWORD=... npm run set-password -- <username>");
  if (!password || password.length < 12) throw new Error("NEW_PASSWORD must be set and at least 12 characters.");
  const hash = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS);
  const r = await pool.query("UPDATE users SET password_hash = $1 WHERE username = $2", [hash, username]);
  console.log(r.rowCount ? `Password updated for "${username}".` : `No user named "${username}".`);
  await pool.end();
  process.exit(r.rowCount ? 0 : 1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
