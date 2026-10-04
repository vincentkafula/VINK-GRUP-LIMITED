import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./driverRoutes.js";
import { createMoneyRouter, type MoneyRole } from "./moneyRoutes.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { owner: id(3), driver: id(5), other: id(6), assoc: id(1) };

const deps = { channels: () => ({ in_person: { accountNumber: "1234567890", holder: "Vink Pool", bank: "Test Bank", type: "Business" as const } }), wallets: (u: string) => (u === U.driver ? [{ currency: "ZMW", balanceCents: 1500 }] : []) };

describe("agreements and payments API", () => {
  let server: Server, url = "", db: Db, as = U.owner, role: MoneyRole = "vehicle_owner";
  beforeEach(async () => {
    db = allPortalsDb(); as = U.owner; role = "vehicle_owner";
    for (const [u, n, r] of [[U.owner, "Oz", "vehicle_owner"], [U.driver, "Dee", "driver"], [U.other, "Other", "driver"], [U.assoc, "Assoc", "association"]] as const)
      await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, n, `${n}@x.test`, r]);
    await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver]);
    const app = express();
    app.use((req, _r, next) => { req.user = { userId: as, username: "u", role }; next(); });
    app.use("/owner", (q, s, n) => (role === "vehicle_owner" ? createMoneyRouter(db, "vehicle_owner", deps)(q, s, n) : n()));
    app.use("/driver", (q, s, n) => (role === "driver" ? createMoneyRouter(db, "driver", deps)(q, s, n) : n()));
    app.use("/assoc", (q, s, n) => (role === "association" ? createMoneyRouter(db, "association")(q, s, n) : n()));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const call = async (path: string, method = "GET", body?: unknown) => { const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() as Record<string, any> }; };   // eslint-disable-line @typescript-eslint/no-explicit-any
  const propose = (o: Record<string, unknown> = {}) => call("/owner/agreements", "POST", { driverId: U.driver, mode: "monthly_salary", amountCents: 500_000, startDate: "2026-11-01", ...o });

  it("the owner proposes; nothing is active until the driver consents", async () => {
    const p = await propose(); expect(p.status).toBe(201);
    expect((await call("/owner/agreements")).body.agreements[0]).toMatchObject({ status: "proposed", mode: "monthly_salary", amountCents: 500_000, payDay: 25 });
    as = U.driver; role = "driver";
    expect((await call(`/driver/agreements/${p.body.id}/accept`, "POST", {})).status).toBe(400);               // no consent ticked
    expect((await call(`/driver/agreements/${p.body.id}/accept`, "POST", { consent: true })).status).toBe(200);
    expect((await call("/driver/agreements")).body.agreements[0]).toMatchObject({ status: "active" });
    expect((await call(`/driver/agreements/${p.body.id}/accept`, "POST", { consent: true })).status).toBe(404); // cannot accept twice
  });

  it("rejects bad input and drivers who are not the owner's", async () => {
    expect((await propose({ mode: "bonus" })).status).toBe(400);
    expect((await propose({ amountCents: 12.5 })).status).toBe(400);
    expect((await propose({ amountCents: 0 })).status).toBe(400);
    expect((await propose({ mode: "cash_basis_weekly", payDay: 9 })).status).toBe(400);
    expect((await propose({ startDate: "2026-02-30" })).status).toBe(400);
    expect((await propose({ driverId: U.other })).status).toBe(404);
  });

  it("only one open agreement per driver; cancelling frees the slot", async () => {
    const p = await propose(); expect((await propose()).status).toBe(409);
    expect((await call(`/owner/agreements/${p.body.id}/cancel`, "POST")).status).toBe(200);
    expect((await propose({ mode: "per_trip_amount", amountCents: 15_000 })).status).toBe(201);
  });

  it("a driver cannot see or accept someone else's agreement", async () => {
    const p = await propose();
    as = U.other; role = "driver";
    expect((await call("/driver/agreements")).body.agreements).toHaveLength(0);
    expect((await call(`/driver/agreements/${p.body.id}/accept`, "POST", { consent: true })).status).toBe(404);
  });

  it("payments list shows only my own items and totals what I owe", async () => {
    await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, status, ref) VALUES ('marshal_fee',$1,$2,2000,2000,'waiting','a'), ('marshal_fee',$3,$2,2000,0,'paid','b')`, [U.driver, U.assoc, U.other]);
    as = U.driver; role = "driver";
    const r = (await call("/driver/payments")).body;
    expect(r.payments).toHaveLength(1); expect(r.owedByMeCents).toBe(2000); expect(r.payments[0]).toMatchObject({ direction: "out", status: "waiting" });
  });

  it("the association sets its marshal fee", async () => {
    as = U.assoc; role = "association";
    expect((await call("/assoc/settings")).body.marshalFeeCents).toBeNull();
    expect((await call("/assoc/settings", "PUT", { marshalFeeCents: 2500 })).status).toBe(200);
    expect((await call("/assoc/settings")).body.marshalFeeCents).toBe(2500);
    expect((await call("/assoc/settings", "PUT", { marshalFeeCents: -1 })).status).toBe(400);
    expect((await call("/assoc/settings", "PUT", { marshalFeeCents: null })).status).toBe(200);
  });

  it("virtual accounts need a verified linked account, give a stable reference, and show where to pay", async () => {
    as = U.driver; role = "driver";
    expect((await call("/driver/virtual-accounts", "POST", { currency: "ZAR", pool: "in_person" })).status).toBe(409);
    await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,'acc1','personal','verified')`, [U.driver]);
    expect((await call("/driver/virtual-accounts", "POST", { currency: "USD", pool: "in_person" })).status).toBe(400);
    expect((await call("/driver/virtual-accounts", "POST", { currency: "ZAR", pool: "somewhere" })).status).toBe(400);
    const a = await call("/driver/virtual-accounts", "POST", { currency: "ZAR", pool: "in_person" }); expect(a.status).toBe(201);
    expect((await call("/driver/virtual-accounts", "POST", { currency: "ZAR", pool: "in_person" })).body.reference).toBe(a.body.reference);
    const list = (await call("/driver/virtual-accounts")).body.accounts;
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ reference: a.body.reference, pool: "in_person", payInto: { accountNumber: "1234567890" } });
    as = U.other;                                                                           // nobody sees another user's references
    expect((await call("/driver/virtual-accounts")).body.accounts).toHaveLength(0);
  });

  it("shows kwacha wallet balances", async () => {
    as = U.driver; role = "driver";
    expect((await call("/driver/wallet")).body.wallets).toEqual([{ currency: "ZMW", balanceCents: 1500 }]);
  });
});
