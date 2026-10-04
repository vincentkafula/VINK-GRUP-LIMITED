import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, type LedgerPort } from "../services/moneyEngine.js";
import { ensureVirtualAccount } from "../services/poolService.js";
import { createMoneyAdminRouter } from "./moneyAdminRouter.js";
import { DEFAULT_ZA, DEFAULT_ZM } from "../config/countryConfig.js";
import { createCrossBorder } from "../services/crossBorderService.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(90), USER = id(5);
const reader = { active: async (c: string) => ({ version: 1, config: c === "ZM" ? DEFAULT_ZM : DEFAULT_ZA }), invalidate() {} } as never;

describe("admin money API", () => {
  let server: Server, url = "", db: Db, ledger: LedgerPort, acct = "";
  beforeEach(async () => {
    process.env.MANSHYA_DB_PATH = ":memory:";
    const mod = (await import("../manshya/mount.js")).createManshyaModule();
    db = allPortalsDb();
    const core = manshyaBankCore(mod as never);
    for (const [u, n, r] of [[USER, "Dee", "driver"], [ADMIN, "Admin", "superadmin"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, n, `${n}@x.test`, r]);
    core.ensureMerchant(USER, "Dee"); acct = core.accounts(USER)[0].id;
    await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [USER, acct]);
    ledger = manshyaLedgerPort(mod as never);
    const engine = createMoneyEngine({ db, ledger, reader });
    const app = express();
    app.use((req, _r, next) => { req.user = { userId: ADMIN, username: "admin", role: "superadmin" }; next(); });
    app.use("/admin", createMoneyAdminRouter({ db, ledger, reader, engine, channels: () => ({ in_person: { accountNumber: "1234567890" } }), crossBorder: createCrossBorder({ db, ledger, engine, reader }) }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const call = async (path: string, method = "GET", body?: unknown) => { const r = await fetch(url + "/admin" + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() as Record<string, any> }; };   // eslint-disable-line @typescript-eslint/no-explicit-any

  it("records a bank credit once, and the pool summary reflects it", async () => {
    const va = await ensureVirtualAccount(db, USER, "ZAR", "in_person");
    const line = { bankRef: "BANK-1001", reference: va.reference, amountCents: 12_500, currency: "ZAR" };
    expect((await call("/pool/credits", "POST", line)).status).toBe(201);
    expect((await call("/pool/credits", "POST", line)).body).toMatchObject({ success: true, status: "duplicate" });
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(12_500);
    const pool = (await call("/pool")).body;
    expect(pool.virtualAccounts).toEqual([{ pool: "in_person", currency: "ZAR", count: 1 }]);
    expect(pool.credits).toEqual([{ currency: "ZAR", status: "credited", count: 1, totalCents: 12_500 }]);
    expect(pool.channels.in_person.accountNumber).toBe("1234567890");
    expect((await call("/reconciliation")).body.ok).toBe(true);
  });

  it("lists unmatched credits and lets staff match one to a valid reference", async () => {
    const un = (await call("/pool/credits", "POST", { bankRef: "BANK-2002", reference: "VKR000000000", amountCents: 900, currency: "ZAR" })).body;
    expect(un.status).toBe("unmatched");
    expect((await call("/pool")).body.unmatched[0]).toMatchObject({ bankRef: "BANK-2002", amountCents: 900 });
    expect((await call(`/pool/credits/${un.creditId}/match`, "POST", { reference: "junk" })).status).toBe(400);
    const va = await ensureVirtualAccount(db, USER, "ZAR", "in_person");
    expect((await call(`/pool/credits/${un.creditId}/match`, "POST", { reference: va.reference })).body).toMatchObject({ status: "credited" });
    expect((await call(`/pool/credits/${un.creditId}/match`, "POST", { reference: va.reference })).status).toBe(404);          // already credited
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(900);
  });

  it("rejects bad input", async () => {
    expect((await call("/pool/credits", "POST", { bankRef: "BANK-3", reference: "x", amountCents: 100, currency: "ZAR" })).body.status).toBe("unmatched");      // a bad reference is held for a person, not refused
    expect((await call("/pool/credits", "POST", { bankRef: "BANK-4", reference: "x", amountCents: 1.5, currency: "ZAR" })).status).toBe(400);
    expect((await call("/pool/credits", "POST", { reference: "x" })).status).toBe(400);
    expect((await call("/check", "POST", { country: "ZA", kind: "limit", channel: "atm", amountCents: -5 })).status).toBe(400);
  });

  it("staff set exchange rates, and bad rates are refused", async () => {
    expect((await call("/fx", "PUT", { from: "ZAR", to: "ZMW", rate: 1.52 })).status).toBe(200);
    expect((await call("/fx")).body.rates).toEqual([expect.objectContaining({ pair: "ZAR-ZMW", rate: 1.52 })]);
    expect((await call("/fx", "PUT", { from: "ZAR", to: "ZMW", rate: -1 })).status).toBe(400);
    expect((await call("/fx", "PUT", { from: "ZAR", to: "USD", rate: 1 })).status).toBe(400);
  });

  it("clear and return a pending payment, and fund the reserve once", async () => {
    const va = await ensureVirtualAccount(db, USER, "ZAR", "in_person");
    const p = (await call("/pool/credits", "POST", { bankRef: "BANK-5005", reference: va.reference, amountCents: 3000, currency: "ZAR", pending: true })).body;
    expect(p.status).toBe("awaiting_clearing");                                                  // instant credit is off in the default profile
    expect((await call("/pool")).body.pending[0]).toMatchObject({ bankRef: "BANK-5005", status: "awaiting_clearing" });
    expect((await call(`/pool/credits/${p.creditId}/clear`, "POST")).body).toMatchObject({ status: "credited" });
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(3000);
    expect((await call(`/pool/credits/${p.creditId}/bounce`, "POST")).status).toBe(409);        // it has already cleared
    expect((await call("/reserve/fund", "POST", { ref: "RES-A1", currency: "ZAR", amountCents: 100000 })).status).toBe(201);
    expect((await call("/reserve/fund", "POST", { ref: "RES-A1", currency: "ZAR", amountCents: 100000 })).status).toBe(200);
    expect((await call("/pool")).body.reserve).toEqual([{ currency: "ZAR", balanceCents: 100000, outstandingCents: 0 }, { currency: "ZMW", balanceCents: 0, outstandingCents: 0 }]);
    expect((await call("/reserve/fund", "POST", { ref: "RES-A2", currency: "ZAR", amountCents: -5 })).status).toBe(400);
  });
});
