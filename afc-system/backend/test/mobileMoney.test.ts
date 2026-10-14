import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ADAPTERS, exampleProviderAdapter, genericHmacAdapter } from "../src/domain/mobileMoney";

const SECRET = "provider-shared-secret-123";
const now = () => String(Math.floor(Date.now() / 1000));

describe("generic adapter", () => {
  const body = JSON.stringify({ reference: "MM-1", cardUid: "04a1b2c3d4e5f6", amount: 2500, status: "SUCCESS" });
  const sig = (b: string, s = SECRET) => createHmac("sha256", s).update(b).digest("hex");
  it("accepts a correctly signed event", () => expect(genericHmacAdapter.parse({ headers: { "x-signature": sig(body) }, rawBody: body, secret: SECRET })).toEqual({ reference: "MM-1", cardUid: "04a1b2c3d4e5f6", amount: 2500, status: "SUCCESS" }));
  it("refuses a wrong secret, a changed body, a missing or malformed signature", () => {
    expect(genericHmacAdapter.parse({ headers: { "x-signature": sig(body, "other-secret-0123456") }, rawBody: body, secret: SECRET })).toBeNull();
    expect(genericHmacAdapter.parse({ headers: { "x-signature": sig(body) }, rawBody: body.replace("2500", "250000"), secret: SECRET })).toBeNull();
    expect(genericHmacAdapter.parse({ headers: {}, rawBody: body, secret: SECRET })).toBeNull();
    expect(genericHmacAdapter.parse({ headers: { "x-signature": "zz" }, rawBody: body, secret: SECRET })).toBeNull();
  });
  it("refuses a signed body that is not the expected shape, without throwing", () => {
    for (const bad of ["not json", "[]", JSON.stringify({ reference: "x" }), JSON.stringify({ reference: "x", cardUid: "y", amount: 1.5, status: "SUCCESS" })])
      expect(genericHmacAdapter.parse({ headers: { "x-signature": sig(bad) }, rawBody: bad, secret: SECRET })).toBeNull();
  });
});

describe("example provider adapter (a differently shaped callback)", () => {
  const make = (over: Record<string, unknown> = {}, ts = now()) => {
    const body = JSON.stringify({ state: "COMPLETED", transaction: { id: "EX-77", account: "04A1B2C3D4E5F6", amount: "25.50" }, ...over });
    return { body, ts, sig: createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("base64") };
  };
  it("reads nested fields, decimal rand and the state word", () => {
    const m = make();
    expect(exampleProviderAdapter.parse({ headers: { "x-example-timestamp": m.ts, "x-example-signature": m.sig }, rawBody: m.body, secret: SECRET })).toEqual({ reference: "EX-77", cardUid: "04a1b2c3d4e5f6", amount: 2550, status: "SUCCESS" });
    const f = make({ state: "CANCELLED" });
    expect(exampleProviderAdapter.parse({ headers: { "x-example-timestamp": f.ts, "x-example-signature": f.sig }, rawBody: f.body, secret: SECRET })?.status).toBe("FAILED");
  });
  it("refuses a stale timestamp, a bad signature, an unknown state and a malformed amount", () => {
    const old = make({}, String(Math.floor(Date.now() / 1000) - 3600));
    expect(exampleProviderAdapter.parse({ headers: { "x-example-timestamp": old.ts, "x-example-signature": old.sig }, rawBody: old.body, secret: SECRET })).toBeNull();
    const m = make();
    expect(exampleProviderAdapter.parse({ headers: { "x-example-timestamp": m.ts, "x-example-signature": m.sig }, rawBody: m.body, secret: "different-secret-123" })).toBeNull();
    for (const over of [{ state: "PENDING" }, { transaction: { id: "x", account: "y", amount: "12.345" } }, { transaction: { id: "x", account: "y", amount: "-5" } }]) {
      const b = make(over);
      expect(exampleProviderAdapter.parse({ headers: { "x-example-timestamp": b.ts, "x-example-signature": b.sig }, rawBody: b.body, secret: SECRET })).toBeNull();
    }
  });
  it("both adapters are registered by name", () => expect(Object.keys(ADAPTERS).sort()).toEqual(["example", "generic"]));
});
