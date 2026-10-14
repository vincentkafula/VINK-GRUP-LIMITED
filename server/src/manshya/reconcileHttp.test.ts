import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("./core");

/** The back-office reconciliation endpoints over real HTTP: who may call them, and that a big settlement file gets through. */
describe("reconciliation back-office routes", () => {
  let server: Server, base: string, mn: ReturnType<typeof createManshya>, root: string, support: string;
  beforeEach(async () => {
    mn = createManshya();
    const app = express(); app.use("/api", mn.router);
    server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
    root = mn.admin.issueAdminKey("ops", "superadmin"); support = mn.admin.issueAdminKey("helper", "support");
  });
  afterEach(() => server.close());
  const call = async (method: string, path: string, key?: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };   // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  it("needs an admin sign-in to read, and a superadmin to run or import", async () => {
    expect((await call("GET", "/reconciliation/runs")).status).toBe(401);
    expect((await call("GET", "/reconciliation/runs", support)).status).toBe(200);
    expect((await call("POST", "/reconciliation/run", support, {})).status).toBe(403);
    expect((await call("POST", "/reconciliation/settlements", support, { kind: "acquirer", csv: "a,b\n1,2" })).status).toBe(403);
    expect((await call("POST", "/webhooks/evt_x/replay", support, {})).status).toBe(403);
  });

  it("runs on demand, then lists the run and reads it back", async () => {
    const run = await call("POST", "/reconciliation/run", root, {});
    expect(run.status).toBe(201); expect(run.body).toMatchObject({ ok: true, by: expect.any(String) });
    const list = await call("GET", "/reconciliation/runs", root);
    expect(list.body.data[0].id).toBe(run.body.id);
    expect((await call("GET", "/reconciliation/runs/" + run.body.id, root)).body).toMatchObject({ id: run.body.id, items: [] });
    expect((await call("GET", "/reconciliation/runs/nope", root)).status).toBe(404);
  });

  it("accepts a settlement file larger than the normal 100 KB request limit, and refuses it twice", async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => `gw_${String(i).padStart(6, "0")},10.00,2026-10-14`);
    const csv = "reference,amount,date\n" + rows.join("\n");
    expect(csv.length).toBeGreaterThan(100_000);
    const first = await call("POST", "/reconciliation/settlements", root, { kind: "acquirer", csv, source: "PSP" });
    expect(first.status).toBe(201); expect(first.body.summary).toMatchObject({ rows: 4000, not_in_our_records: 4000 });
    expect(first.body.truncated).toBe(true);
    expect((await call("POST", "/reconciliation/settlements", root, { kind: "acquirer", csv, source: "PSP" })).status).toBe(409);
    const list = await call("GET", "/reconciliation/settlements", root);
    expect(list.body.data[0]).toMatchObject({ id: first.body.id, kind: "acquirer", ok: false });
    expect((await call("GET", "/reconciliation/settlements/" + first.body.id, root)).body.items.length).toBeGreaterThan(0);
  });

  it("other routes still refuse a body over 100 KB", async () => {
    const r = await call("POST", "/reconciliation/run", root, { pad: "x".repeat(150_000) });
    expect([413, 400]).toContain(r.status);
  });

  it("lists dead webhooks and replays one", async () => {
    const m = mn.services.createMerchant("Hook Co");
    mn.db.prepare("INSERT INTO events(id,merchant_id,type,payload,created_at,dead,attempts,last_error) VALUES('evt_d',?,?,?,?,1,8,'HTTP 500')").run(m.id, "payment.paid", "{}", new Date().toISOString());
    expect((await call("GET", "/webhooks/dead", root)).body.data[0]).toMatchObject({ id: "evt_d", merchant: "Hook Co" });
    expect((await call("POST", "/webhooks/evt_d/replay", root, {})).body).toMatchObject({ id: "evt_d", outcome: "skipped" });
    expect((await call("POST", "/webhooks/evt_zzz/replay", root, {})).status).toBe(404);
  });
});
