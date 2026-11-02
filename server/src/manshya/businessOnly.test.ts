import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");

/**
 * Personal and business accounts, through the engine's real router. A personal account can bank, earn rewards, take online payments and use a card machine; business credit, a business's
 * owners and team, and managing a shop's categories, products and staff are for business accounts, and the SERVER says so (the menu merely hides them).
 */
const servers: Server[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise<void>((ok) => s.close(() => ok())); });

async function setup() {
  let mn: any;
  const kinds: Record<string, string | undefined> = { personal: "personal", business: "business", unspecified: undefined };
  mn = createManshya({ authenticate: async (req: any) => { const who = req.get("x-who") || "business"; return { merchantId: who, role: "owner", actor: `t:${who}`, accountKind: kinds[who] }; } });
  for (const id of ["personal", "business", "unspecified"]) { try { mn.services.createMerchant(id, { id }); } catch { /* exists */ } }
  const a = express(); a.use(express.json()); a.use("/v", mn.router);
  const srv: Server = await new Promise((ok) => { const x = a.listen(0, "127.0.0.1", () => ok(x)); }); servers.push(srv); const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v`;
  const call = async (who: string, method: string, path: string, body?: unknown) => { const r = await fetch(base + path, { method, headers: { "x-who": who, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
  return { mn, call };
}
const BUSINESS_ONLY = ["/credit/products", "/account/ubos", "/account/users", "/pos/staff", "/pos/categories", "/pos/products"];
const OPEN_TO_PERSONAL = ["/bank/accounts", "/pos/devices", "/pos/settlement", "/payment-buttons", "/subscriptions", "/insurance/products", "/rewards"];

describe("business-only services", () => {
  it("are refused to a personal account, by name, whatever the screen shows", async () => {
    const { call } = await setup();
    for (const p of BUSINESS_ONLY) { const r = await call("personal", "GET", p); expect(r.status, p).toBe(403); expect(r.body.error.code, p).toBe("business_only"); expect(r.body.error.message).toMatch(/business accounts/); }
    for (const [m, p] of [["POST", "/credit/apply"], ["POST", "/account/ubos"], ["POST", "/pos/staff"], ["POST", "/pos/products"]] as const) expect((await call("personal", m, p, {})).status, `${m} ${p}`).toBe(403);
  });
  it("are open to a business account", async () => {
    const { call } = await setup(); for (const p of BUSINESS_ONLY) expect((await call("business", "GET", p)).status, p).toBe(200);
  });
  it("treat a caller that does not say what it is (an API key, an older caller) as a business, exactly as before", async () => {
    const { call } = await setup(); for (const p of BUSINESS_ONLY) expect((await call("unspecified", "GET", p)).status, p).toBe(200);
  });
  it("leave a personal account its banking, rewards, online payments, card machine and insurance", async () => {
    const { call } = await setup(); for (const p of OPEN_TO_PERSONAL) expect((await call("personal", "GET", p)).status, p).toBe(200);
  });
  it("only guard the services named, not a path that merely starts the same way", async () => {
    const { call } = await setup(); expect((await call("personal", "GET", "/pos/devices")).status).toBe(200); expect((await call("personal", "GET", "/pos/devicesx")).status).not.toBe(403);
    expect((await call("personal", "GET", "/credits")).body?.error?.code).not.toBe("business_only");
  });
});

describe("insurance on a personal account", () => {
  async function withFunds() {
    const { mn, call } = await setup();
    const fund = (id: string) => { const a = mn.services.createBankAccount(id, "Main", "current"); mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -5_000_000 }, { account: `bank:${a.id}`, merchant: id, kind: "bank", amount: 5_000_000 }])).immediate(); return a; };
    return { call, personal: fund("personal"), business: fund("business") };
  }
  const buy = (call: any, who: string, a: any, product: string, cover: number) => call(who, "POST", "/insurance/policies", { product, cover, accountId: a.id, beneficiary: "Spouse" });
  it("lets a personal account buy funeral and life cover, but not business contents cover", async () => {
    const { call, personal } = await withFunds();
    expect((await buy(call, "personal", personal, "funeral", 1_000_000)).status).toBe(201); expect((await buy(call, "personal", personal, "life", 10_000_000)).status).toBe(201);
    const r = await buy(call, "personal", personal, "business", 5_000_000); expect(r.status).toBe(409); expect(r.body.error.code).toBe("business_only"); expect(r.body.error.message).toMatch(/Funeral and life cover are available on a personal account/);
  });
  it("lets a business account buy all three, and takes nothing from a personal account that was refused", async () => {
    const { call, business, personal, } = await withFunds(); expect((await buy(call, "business", business, "business", 5_000_000)).status).toBe(201);
    const before = (await call("personal", "GET", "/bank/accounts")).body.data.find((x: any) => x.id === personal.id).balance; await buy(call, "personal", personal, "business", 5_000_000);
    expect((await call("personal", "GET", "/bank/accounts")).body.data.find((x: any) => x.id === personal.id).balance).toBe(before);
  });
});
