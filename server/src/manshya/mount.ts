import fs from "fs";
import path from "path";
import { hasDb, pool } from "../db/pool.js";
import { adminUsers } from "../data/adminUsers.js";
import { customerAccess, backOfficeAccess } from "./access.js";

// The payments/banking core is plain CommonJS (see core/). Typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("./core");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ApiError } = require("./core/util");

/**
 * Builds the Manshya module and returns its Express router, to be mounted at /api/manshya.
 *
 * Sign-in is the app's own login (POST /api/auth/login -> JWT). This only decides who
 * gets in: customer accounts reach the merchant/banking API (one merchant per customer,
 * created on first visit, keyed by the customer's user id); staff reach /admin.
 *
 * Money does not move for real: with MANSHYA_MODE unset (or "test") every gateway and
 * bank rail is the bundled mock. Plug licensed providers in via `gateways` / `rails`
 * before setting MANSHYA_MODE=live.
 */
export function createManshyaModule() {
  const dbPath = process.env.MANSHYA_DB_PATH ?? path.join(process.cwd(), "data", "manshya.db");
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const known = new Set<string>();

  async function displayName(userId: string, fallback: string): Promise<string> {
    if (!hasDb || !pool) return adminUsers.find((u) => u.id === userId)?.name ?? fallback;   // in-memory auth (no DATABASE_URL)
    try {
      const { rows } = await pool.query("SELECT name FROM users WHERE id = $1", [userId]);
      return rows[0]?.name || fallback;
    } catch {
      return fallback;
    }
  }

  const mn = createManshya({
    dbPath,
    config: { mode: process.env.MANSHYA_MODE === "live" ? "live" : "test" },

    authenticate: async (req: { get(h: string): string | undefined }) => {
      const a = customerAccess(req.get("authorization"));
      if (!a.ok) {
        if (a.reason === "wrong_role") {
          throw new ApiError(403, "customer_only", "The Manshya dashboard is for customer accounts. Sign in with a customer account.");
        }
        return null;
      }
      const id = a.user.userId;
      if (!known.has(id)) {
        if (!mn.db.prepare("SELECT 1 FROM merchants WHERE id = ?").get(id)) {
          mn.services.createMerchant(await displayName(id, a.user.username), { id });
        }
        known.add(id);
      }
      return { merchantId: id, role: "owner", actor: `customer:${a.user.username}` };
    },

    adminAuthenticate: async (req: { get(h: string): string | undefined }) => {
      const a = backOfficeAccess(req.get("authorization"));
      if (!a.ok) {
        if (a.reason === "wrong_role") throw new ApiError(403, "staff_only", "The back office is for staff accounts.");
        return null;
      }
      return { actor: `staff:${a.user.username}`, role: "superadmin" };
    },
  });

  mn.startScheduler();
  return mn as { router: import("express").Router; db: { close(): void } };
}
