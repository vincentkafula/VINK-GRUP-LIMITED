import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import { JWT_SECRET } from "../middleware/auth.js";
import { customerAccess, backOfficeAccess } from "./access.js";

const token = (role: string, userId = "u-" + role) => "Bearer " + jwt.sign({ userId, username: role + "1", role }, JWT_SECRET, { expiresIn: "1h" });

describe("manshya access rules", () => {
  it("lets only customers into the dashboard", () => {
    expect(customerAccess(token("customer")).ok).toBe(true);
    for (const role of ["owner", "superadmin", "noc_engineer", "billing_admin", "seller"]) {
      const a = customerAccess(token(role));
      expect(a.ok).toBe(false);
      expect(!a.ok && a.reason).toBe("wrong_role");
    }
  });

  it("rejects missing, malformed, forged and expired tokens", () => {
    expect(customerAccess(undefined)).toMatchObject({ ok: false, reason: "no_token" });
    expect(customerAccess("Bearer not-a-jwt")).toMatchObject({ ok: false, reason: "bad_token" });
    const forged = "Bearer " + jwt.sign({ userId: "x", username: "x", role: "customer" }, "some-other-secret");
    expect(customerAccess(forged)).toMatchObject({ ok: false, reason: "bad_token" });
    const expired = "Bearer " + jwt.sign({ userId: "x", username: "x", role: "customer" }, JWT_SECRET, { expiresIn: -10 });
    expect(customerAccess(expired)).toMatchObject({ ok: false, reason: "bad_token" });
  });

  it("lets only owner/superadmin into the back office", () => {
    expect(backOfficeAccess(token("owner")).ok).toBe(true);
    expect(backOfficeAccess(token("superadmin")).ok).toBe(true);
    expect(backOfficeAccess(token("customer"))).toMatchObject({ ok: false, reason: "wrong_role" });
    expect(backOfficeAccess(token("noc_engineer"))).toMatchObject({ ok: false, reason: "wrong_role" });
  });
});

describe("manshya HTTP access", () => {
  let server: Server, base: string, close: () => void;

  beforeAll(async () => {
    process.env.MANSHYA_DB_PATH = ":memory:";
    const { createManshyaModule } = await import("./mount.js");
    const mn = createManshyaModule();
    close = () => mn.db.close();
    const app = express();
    app.use("/api/manshya", mn.router);
    server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/manshya`;
  });
  afterAll(() => { server.close(); close(); });

  const get = (path: string, auth?: string) => fetch(base + path, { headers: auth ? { authorization: auth } : {} });

  it("signed-out requests are refused", async () => {
    expect((await get("/balance")).status).toBe(401);
    expect((await get("/admin/overview")).status).toBe(401);
  });

  it("a customer gets their own merchant account; staff do not", async () => {
    const res = await get("/me", token("customer", "cust-1"));
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ id: "cust-1", role: "owner" });

    const staff = await get("/balance", token("owner"));
    expect(staff.status).toBe(403);
    expect(((await staff.json()) as { error: { code: string } }).error.code).toBe("customer_only");
  });

  it("customers are kept apart from each other and from the back office", async () => {
    const a = (await (await get("/bank/accounts", token("customer", "cust-a"))).json()) as { data: { id: string }[] };
    const b = (await (await get("/bank/accounts", token("customer", "cust-b"))).json()) as { data: { id: string }[] };
    expect(a.data[0].id).not.toBe(b.data[0].id);

    expect((await get("/admin/overview", token("customer"))).status).toBe(403);
    expect((await get("/admin/overview", token("superadmin"))).status).toBe(200);
  });
});
