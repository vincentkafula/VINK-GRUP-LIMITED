import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { JWT_SECRET } from "../middleware/auth.js";
import { createPortalRouter } from "./portal.js";
import { ACCOUNT_ROLES } from "../auth/roles.js";

let server: Server, url = "";
const token = (role: string) => jwt.sign({ userId: "u-" + role, username: role, role }, JWT_SECRET, { expiresIn: "5m" });
const PATH: Record<string, string> = { personal: "personal", driver: "driver", marshal: "marshal", vehicle_owner: "owner", association: "association" };
const get = (p: string, t?: string) => fetch(`${url}/api/portal/${p}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });

beforeAll(async () => {
  const app = express(); app.use("/api/portal", createPortalRouter({ query: async () => ({ rows: [] }) }));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("role portals", () => {
  it("every portal rejects a request with no token", async () => {
    for (const r of ACCOUNT_ROLES) expect((await get(PATH[r])).status).toBe(401);
  });

  it("each role can open its own portal", async () => {
    for (const r of ACCOUNT_ROLES) expect((await get(PATH[r], token(r))).status).toBe(200);
  });

  it("no role can open any other role's portal (checked on the server: 403)", async () => {
    for (const mine of ACCOUNT_ROLES) for (const other of ACCOUNT_ROLES) {
      if (mine === other) continue;
      expect((await get(PATH[other], token(mine))).status, `${mine} -> ${other}`).toBe(403);
    }
  });

  it("staff and banking customers have no portal access", async () => {
    for (const r of ["customer", "owner", "superadmin", "noc_engineer"]) {
      expect((await get("personal", token(r))).status).toBe(403);
      expect((await get("me", token(r))).status).toBe(403);
    }
  });

  it("a forged or expired token is refused", async () => {
    expect((await get("driver", jwt.sign({ userId: "x", username: "x", role: "driver" }, "wrong-secret"))).status).toBe(401);
    expect((await get("driver", jwt.sign({ userId: "x", username: "x", role: "driver" }, JWT_SECRET, { expiresIn: -10 }))).status).toBe(401);
  });

  it("the driver's data endpoints are for drivers only", async () => {
    for (const p of ["driver/profile", "driver/vehicle", "driver/trips", "driver/earnings", "driver/notifications"]) {
      expect((await get(p)).status, p).toBe(401);
      for (const r of ["personal", "marshal", "vehicle_owner", "association", "customer", "owner", "superadmin"]) expect((await get(p, token(r))).status, `${r} -> ${p}`).toBe(403);
      expect((await get(p, token("driver"))).status, `driver -> ${p}`).toBe(200);
    }
  });

  it("/me tells each role where its dashboard is", async () => {
    const j = await (await get("me", token("vehicle_owner"))).json() as { dashboard: string };
    expect(j.dashboard).toBe("/portal/owner");
  });
});
