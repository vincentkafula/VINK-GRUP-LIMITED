import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./driverRoutes.js";
import { createBankRouter, createBankAdminRouter, manshyaBankCore, seedBankLinks, readChannelAccounts, type BankCore, type Deps } from "./bankLinks.js";
import { createFieldCrypto } from "./fieldCrypto.js";
import { requireRole } from "../middleware/auth.js";
import { BANK_ROLES, type BankRole } from "./bankRules.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { driver: id(5), marshal: id(7), investor: id(8), owner: id(3), assoc: id(1), driver2: id(6), admin: id(90) };
const ROLE_OF: Record<string, string> = { [U.driver]: "driver", [U.driver2]: "driver", [U.marshal]: "marshal", [U.investor]: "investor", [U.owner]: "vehicle_owner", [U.assoc]: "association", [U.admin]: "superadmin" };
const USER_FOR: Record<BankRole, string> = { driver: U.driver, marshal: U.marshal, investor: U.investor, vehicle_owner: U.owner, association: U.assoc };
const BIZ = { holderType: "business", businessName: "Acme Taxis (Pty) Ltd", registrationNumber: "2015/123456/07" };
const KEY = Buffer.alloc(32, 3).toString("base64");

let mod: Awaited<ReturnType<(typeof import("./../manshya/mount.js"))["createManshyaModule"]>>;

describe("bank account links (real Banking module + database)", () => {
  let server: Server, url = "", db: Db, core: BankCore, deps: Deps, as = U.driver, role = "driver", channels: ReturnType<typeof readChannelAccounts> = {};

  beforeEach(async () => {
    process.env.MANSHYA_DB_PATH = ":memory:";
    mod = (await import("../manshya/mount.js")).createManshyaModule();        // a fresh Banking module (own in-memory database) for every test
    db = allPortalsDb();
    for (const [i, name] of [[U.driver, "Dee Driver"], [U.driver2, "Dee Two"], [U.marshal, "Mo Marshal"], [U.investor, "Ina Investor"], [U.owner, "Oz Owner"], [U.assoc, "Assoc One"], [U.admin, "Admin One"]] as const)
      await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, name, name, `${name.split(" ")[0].toLowerCase()}@x.test`, ROLE_OF[i]]);
    core = manshyaBankCore(mod as never);
    deps = { db, core, crypto: createFieldCrypto({ DATA_ENCRYPTION_KEY: KEY } as unknown as NodeJS.ProcessEnv), channels: () => channels };
    channels = {};
    const app = express(); app.use(express.json());
    app.use((req, _r, next) => { req.user = { userId: as, username: "u", role }; next(); });
    for (const r of BANK_ROLES) app.use(`/bank/${r}`, createBankRouter(deps, r));
    app.use("/admin", requireRole("owner", "superadmin"), createBankAdminRouter(deps));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>((ok) => server.close(() => ok())); mod.db.close(); });

  const who = (u: string) => { as = u; role = ROLE_OF[u]; };
  const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };
  const get = (p: string) => call("GET", p);
  const auditRows = async () => (await db.query(`SELECT action, details FROM audit_log ORDER BY created_at`)).rows;
  const merchants = () => Number((mod.db.prepare("SELECT COUNT(*) AS n FROM merchants WHERE id IN (?,?,?,?,?,?)").get(U.driver, U.marshal, U.investor, U.owner, U.assoc, U.driver2) as { n: number }).n);

  /* ─────────── the account-type rules, enforced at creation ─────────── */
  describe("account type rules at link time", () => {
    const table: [BankRole, "personal" | "business", number, string?][] = [
      ["driver", "personal", 201], ["driver", "business", 422, "Drivers must use a Personal account."],
      ["marshal", "personal", 201], ["marshal", "business", 422, "Marshals must use a Personal account."],
      ["association", "business", 201], ["association", "personal", 422, "Associations must use a Business account."],
      ["investor", "personal", 201], ["investor", "business", 201],
      ["vehicle_owner", "personal", 201], ["vehicle_owner", "business", 201],
    ];
    it.each(table)("%s + %s -> %s", async (r, type, status, message) => {
      who(USER_FOR[r]);
      const res = await call("POST", `/bank/${r}/link`, type === "business" ? { ...BIZ, holderType: type } : { holderType: type });
      expect(res.status).toBe(status);
      if (message) { expect(res.body.error).toBe(message); expect(res.body.code).toBe("account_type_not_allowed"); expect(merchants()).toBe(0); }   // a rejected request opens nothing in the Banking module
      else expect(res.body.link.accountType).toBe(type === "business" ? "Business" : "Personal");
    });
  });

  /* ─────────── what the dashboard gets ─────────── */
  it("a Personal link shows the holder name, bank, type, a real 10-digit account number from the Banking module, and the balance", async () => {
    who(U.driver);
    const empty = (await get("/bank/driver")).body;
    expect(empty.link).toBeNull(); expect(empty.rules).toMatchObject({ allowed: ["personal"], message: "Drivers must use a Personal account." }); expect(empty.accounts).toEqual([]);
    const l = (await call("POST", "/bank/driver/link", { holderType: "personal" })).body.link;
    expect(l).toMatchObject({ holderName: "Dee Driver", bankName: "Manshya Finance", accountType: "Personal", status: "verified", currency: "ZAR", accountName: "Personal current", accountKind: "current", balance: 0 });
    expect(l.accountNumber).toMatch(/^\d{10}$/);
    const inBank = mod.services.listAccounts({ id: U.driver });
    expect(inBank).toHaveLength(1); expect(inBank[0].number).toBe(l.accountNumber);                    // one source of truth: the very same account
    expect((await get("/bank/driver")).body.link.accountNumber).toBe(l.accountNumber);
  });

  it("a Business link needs name and registration number, shows the business as holder, and waits for review", async () => {
    who(U.assoc);
    expect((await call("POST", "/bank/association/link", { holderType: "business" })).status).toBe(400);
    expect((await call("POST", "/bank/association/link", { ...BIZ, registrationNumber: "12345" })).body.code).toBe("invalid_registration_number");
    expect(merchants()).toBe(0);
    const l = (await call("POST", "/bank/association/link", BIZ)).body.link;
    expect(l).toMatchObject({ holderName: "Acme Taxis (Pty) Ltd", accountType: "Business", status: "pending_review", registrationNumber: "2015/123456/07", businessName: "Acme Taxis (Pty) Ltd" });
  });

  it("the account can only be linked once, and an existing link can't be created again", async () => {
    who(U.driver);
    expect((await call("POST", "/bank/driver/link", { holderType: "personal" })).status).toBe(201);
    expect((await call("POST", "/bank/driver/link", { holderType: "personal" })).status).toBe(409);
    expect(mod.services.listAccounts({ id: U.driver })).toHaveLength(1);
  });

  /* ─────────── editing is validated again, and audited ─────────── */
  it("editing is validated against the same table; business changes go back to review; personal is verified", async () => {
    who(U.owner);
    await call("POST", "/bank/vehicle_owner/link", { holderType: "personal" });
    const up = await call("PUT", "/bank/vehicle_owner/link", BIZ);
    expect(up.body.link).toMatchObject({ accountType: "Business", status: "pending_review", holderName: "Acme Taxis (Pty) Ltd" });
    await db.query(`UPDATE bank_account_links SET status = 'verified' WHERE user_id = $1`, [U.owner]);                       // an admin approved it
    expect((await call("PUT", "/bank/vehicle_owner/link", BIZ)).body.link.status).toBe("verified");                          // unchanged details stay approved
    expect((await call("PUT", "/bank/vehicle_owner/link", { ...BIZ, businessName: "Acme Taxis Two (Pty) Ltd" })).body.link.status).toBe("pending_review");
    const back = (await call("PUT", "/bank/vehicle_owner/link", { holderType: "personal" })).body.link;
    expect(back).toMatchObject({ accountType: "Personal", status: "verified", registrationNumber: null, holderName: "Oz Owner" });

    who(U.assoc); await call("POST", "/bank/association/link", BIZ);
    const bad = await call("PUT", "/bank/association/link", { holderType: "personal" });
    expect(bad.status).toBe(422); expect(bad.body.error).toBe("Associations must use a Business account.");
    expect((await get("/bank/association")).body.link.accountType).toBe("Business");                                         // unchanged by the rejected edit
    who(U.driver2); expect((await call("PUT", "/bank/driver/link", { holderType: "personal" })).status).toBe(404);          // nothing to edit
  });

  it("every change is audited, with only masked identifiers (never the full account or registration number)", async () => {
    who(U.owner);
    const l = (await call("POST", "/bank/vehicle_owner/link", BIZ)).body.link;
    await call("PUT", "/bank/vehicle_owner/link", { ...BIZ, businessName: "Renamed Taxis (Pty) Ltd" });
    await call("DELETE", "/bank/vehicle_owner/link");
    const rows = await auditRows();
    expect(rows.map((r) => r.action)).toEqual(["bank.link.create", "bank.link.update", "bank.link.remove"]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(l.accountNumber); expect(text).not.toContain("2015/123456/07"); expect(text).not.toContain("Acme Taxis");
    expect(text).toContain("••••••" + l.accountNumber.slice(-4)); expect(text).toContain("2015/••••••/07");
  });

  it("business details are encrypted in the database (no plaintext at rest)", async () => {
    who(U.assoc); await call("POST", "/bank/association/link", BIZ);
    const raw = (await db.query(`SELECT business_name_enc, registration_number_enc FROM bank_account_links`)).rows[0];
    expect(JSON.stringify(raw)).not.toContain("Acme"); expect(JSON.stringify(raw)).not.toContain("2015/123456");
    expect(String(raw.business_name_enc)).toMatch(/^v1\./);
    expect(deps.crypto.decrypt(String(raw.registration_number_enc))).toBe("2015/123456/07");
  });

  it("without an encryption key (production) a Business account is refused and nothing is created", async () => {
    deps.crypto = createFieldCrypto({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv);
    who(U.assoc);
    const r = await call("POST", "/bank/association/link", BIZ);
    expect(r.status).toBe(503); expect(r.body.error).toMatch(/encryption is not configured/);
    expect((await db.query(`SELECT COUNT(*) AS n FROM bank_account_links`)).rows[0].n).toBe(0); expect(merchants()).toBe(0);
    who(U.driver); expect((await call("POST", "/bank/driver/link", { holderType: "personal" })).status).toBe(201);          // personal needs no secrets stored
  });

  /* ─────────── unlinking, empty state, access ─────────── */
  it("unlinking returns to the empty state and offers the user's own existing account to link again", async () => {
    who(U.driver);
    const first = (await call("POST", "/bank/driver/link", { holderType: "personal" })).body.link.accountNumber;
    expect((await call("DELETE", "/bank/driver/link")).status).toBe(200);
    expect((await call("DELETE", "/bank/driver/link")).status).toBe(404);
    const g = (await get("/bank/driver")).body;
    expect(g.link).toBeNull(); expect(g.accounts).toMatchObject([{ number: first }]);
    expect((await get("/bank/driver/transactions")).status).toBe(404);
    expect((await call("POST", "/bank/driver/link", { holderType: "personal", accountId: g.accounts[0].id })).body.link.accountNumber).toBe(first);     // relinked, not a new account
    expect((await call("POST", "/bank/driver/link", { holderType: "personal", accountId: "acc_nope" })).status).toBe(409);
  });

  it("each user sees only their own link", async () => {
    who(U.driver); await call("POST", "/bank/driver/link", { holderType: "personal" });
    who(U.driver2);
    expect((await get("/bank/driver")).body.link).toBeNull();
    expect((await get("/bank/driver/transactions")).status).toBe(404);
  });

  it("transactions come from the Banking module's ledger", async () => {
    who(U.driver);
    const l = (await call("POST", "/bank/driver/link", { holderType: "personal" })).body.link;
    expect((await get("/bank/driver/transactions")).body.transactions).toEqual([]);                                          // a new account has none
    const fake: BankCore = { ...core, transactions: () => [{ at: "2026-10-03T10:00:00Z", kind: "transfer", description: "Salary", amountCents: 150025, balanceCents: 150025 }, { at: "2026-10-02T10:00:00Z", kind: "fee", description: "Fee", amountCents: -500, balanceCents: 0 }] };
    deps.core = fake;                                                                                                       // same router object reads deps live
    const t = (await get("/bank/driver/transactions")).body.transactions;
    expect(t[0]).toEqual({ at: "2026-10-03T10:00:00Z", type: "transfer", description: "Salary", amount: 1500.25, balance: 1500.25 }); expect(t[1].amount).toBe(-5);
    expect(l.accountNumber).toBeTruthy();
  });

  /* ─────────── payment channels: shown as they are, nothing created ─────────── */
  it("shows the existing channel accounts on the relevant dashboards and creates no accounts", async () => {
    channels = readChannelAccounts({ PAYMENT_CHANNEL_ACCOUNTS: JSON.stringify({ online: { accountNumber: "9000000001", holder: "Manshya Online", bank: "Manshya Finance", type: "Business" }, in_person: { accountNumber: "9000000002", holder: "Manshya In-Person", bank: "Manshya Finance", type: "Business" } }) } as unknown as NodeJS.ProcessEnv);
    const before = merchants();
    who(U.assoc); expect((await get("/bank/association")).body.channels).toMatchObject([{ channel: "in_person", label: "In-Person Payment", configured: true, accountNumber: "9000000002" }, { channel: "online", label: "Online Payment", configured: true, accountNumber: "9000000001" }]);
    who(U.driver); expect((await get("/bank/driver")).body.channels.map((c: any) => c.channel)).toEqual(["in_person"]);
    who(U.marshal); expect((await get("/bank/marshal")).body.channels).toEqual([]);
    expect(merchants()).toBe(before);
  });

  it("unconfigured or malformed channel settings never break a dashboard", async () => {
    who(U.owner);
    expect((await get("/bank/vehicle_owner")).body.channels).toMatchObject([{ channel: "in_person", configured: false }, { channel: "online", configured: false }]);
    const warns: string[] = [];
    expect(readChannelAccounts({ PAYMENT_CHANNEL_ACCOUNTS: "{not json" } as unknown as NodeJS.ProcessEnv, (m) => warns.push(m))).toEqual({});
    expect(readChannelAccounts({ PAYMENT_CHANNEL_ACCOUNTS: JSON.stringify({ online: { accountNumber: "abc", holder: "x", bank: "y", type: "Business" }, in_person: { accountNumber: "123456", holder: "H", bank: "B", type: "Joint" } }) } as unknown as NodeJS.ProcessEnv, (m) => warns.push(m))).toEqual({});
    expect(warns).toHaveLength(3);
  });

  /* ─────────── admin ─────────── */
  describe("admin", () => {
    it("sees every account with full details; non-admins are refused; filters and review work", async () => {
      who(U.driver); await call("POST", "/bank/driver/link", { holderType: "personal" });
      who(U.assoc); await call("POST", "/bank/association/link", BIZ);
      who(U.driver); expect((await get("/admin")).status).toBe(403);
      who(U.assoc); expect((await get("/admin")).status).toBe(403);
      who(U.admin);
      const all = (await get("/admin")).body;
      expect(all.total).toBe(2); expect(all.links[0].status).toBe("pending_review");                                          // review queue first
      expect(all.links.map((l: any) => l.user.role).sort()).toEqual(["association", "driver"]);
      expect(all.links.every((l: any) => /^\d{10}$/.test(l.accountNumber))).toBe(true);
      expect((await get("/admin?role=driver")).body.links).toHaveLength(1);
      expect((await get("/admin?status=pending_review")).body.links[0].registrationNumber).toBe("2015/123456/07");
      expect((await get("/admin?q=assoc")).body.total).toBe(1);
      expect((await get("/admin?role=astronaut")).status).toBe(400);
      const biz = (await get("/admin?role=association")).body.links[0];
      expect((await call("POST", `/admin/${biz.id}/review`, { approve: false })).status).toBe(400);                           // rejection needs a reason
      expect((await call("POST", `/admin/${biz.id}/review`, { approve: false, note: "Registration number not found" })).body.status).toBe("rejected");
      who(U.assoc); const mine = (await get("/bank/association")).body.link; expect(mine).toMatchObject({ status: "rejected", reviewNote: "Registration number not found" });
      who(U.admin);
      expect((await call("POST", `/admin/${biz.id}/review`, { approve: true })).body.status).toBe("verified");
      const personal = (await get("/admin?role=driver")).body.links[0];
      expect((await call("POST", `/admin/${personal.id}/review`, { approve: true })).status).toBe(404);                         // only Business accounts are reviewed
      expect((await auditRows()).map((r) => r.action)).toEqual(expect.arrayContaining(["bank.admin.list", "bank.admin.reject", "bank.admin.approve"]));
    });

    it("a user who edits an approved business account sends it back for review", async () => {
      who(U.assoc); await call("POST", "/bank/association/link", BIZ);
      who(U.admin); const l = (await get("/admin")).body.links[0]; await call("POST", `/admin/${l.id}/review`, { approve: true });
      who(U.assoc); expect((await call("PUT", "/bank/association/link", { ...BIZ, registrationNumber: "2015/654321/07" })).body.link).toMatchObject({ status: "pending_review", reviewNote: null });
    });
  });

  /* ─────────── test data ─────────── */
  it("seeds a verified Banking-module account for each test login, and is idempotent", async () => {
    const env = { SEED_ENABLED: "true", SEED_DRIVER_EMAIL: "dee@x.test", SEED_MARSHAL_EMAIL: "mo@x.test", SEED_INVESTOR_EMAIL: "ina@x.test", SEED_OWNER_EMAIL: "oz@x.test", SEED_ASSOCIATION_EMAIL: "assoc@x.test" } as unknown as NodeJS.ProcessEnv;
    await seedBankLinks(deps, env, () => {}); await seedBankLinks(deps, env, () => {});
    const rows = (await db.query(`SELECT holder_type, status FROM bank_account_links`)).rows;
    expect(rows).toHaveLength(5); expect(rows.every((r) => r.status === "verified")).toBe(true);
    expect(rows.filter((r) => r.holder_type === "business")).toHaveLength(2);
    who(U.driver); expect((await get("/bank/driver")).body.link).toMatchObject({ accountType: "Personal", accountName: "Personal current" });
    who(U.assoc); expect((await get("/bank/association")).body.link).toMatchObject({ holderName: "Test Association NPC", accountType: "Business", status: "verified" });
    await seedBankLinks(deps, { ...env, SEED_ENABLED: "", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv, () => {});
  });
});
