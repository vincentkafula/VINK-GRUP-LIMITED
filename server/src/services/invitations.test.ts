/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createInvitations, configureInvitations, MAX_PER_DAY } from "./invitations.js";

/** The shared invitation service, with a stand-in for the authentication flows that records what it was asked to send. Clock: 18 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let NOW = new Date("2026-11-18T08:00:00Z"), db: Db, calls: { id: string; by: string; what: string }[], fail: boolean;
const flows = { async invite(userId: string, o: { by: string; what: string }) { if (fail) throw new Error("provider down https://secret.link/abc"); calls.push({ id: userId, ...o }); } } as any;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
beforeEach(() => { NOW = new Date("2026-11-18T08:00:00Z"); calls = []; fail = false; db = allPortalsDb(); configureInvitations({ flows, mailName: "resend" }); });
afterEach(() => configureInvitations(null));
const inv = () => createInvitations(db, () => NOW);

describe("whether an invitation can be sent", () => {
  it("can when the server has the authentication flows and a real email service", () => { expect(inv().available()).toEqual({ ok: true, value: { available: true } }); configureInvitations({ flows, mailName: "console" }); expect(inv().available().ok).toBe(true); });
  it("says plainly it cannot when it is not set up, or when there is no email service, and sends nothing", async () => {
    configureInvitations(null); expect(inv().available()).toMatchObject({ ok: false, status: 503, error: "Invitations are not set up on this server" }); expect(await inv().send(id(1), { by: "Olu", what: "x" })).toMatchObject({ ok: false, status: 503 });
    configureInvitations({ flows, mailName: "unconfigured" }); const r = inv().available(); expect(r).toMatchObject({ ok: false, status: 503 }); expect((r as any).error).toContain("Email is not set up yet"); expect((r as any).error).toContain("use a one-time password instead"); expect(await inv().send(id(1), { by: "Olu", what: "x" })).toMatchObject({ ok: false, status: 503 }); expect(calls).toEqual([]);
  });
});

describe("sending one", () => {
  it("asks the flows to email that person, saying who invited them and to what, and records that it was sent (never the link)", async () => {
    expect(await inv().send(id(5), { by: "Olu Owner", what: "help run Langa Taxis" })).toEqual({ ok: true, value: { sent: true } }); expect(calls).toEqual([{ id: id(5), by: "Olu Owner", what: "help run Langa Taxis" }]);
    const a = await q(`SELECT actor_id, actor_name, action, target FROM audit_log`); expect(a).toEqual([{ actor_id: null, actor_name: "invitation", action: "invite.sent", target: id(5) }]);
  });
  it("sends at most five a day to the same person, counts each person separately, and starts again after a day", async () => {
    for (let i = 0; i < MAX_PER_DAY; i++) expect((await inv().send(id(5), { by: "a", what: "b" })).ok, `send ${i + 1}`).toBe(true); expect(await inv().send(id(5), { by: "a", what: "b" })).toMatchObject({ ok: false, status: 429, error: expect.stringContaining("enough invitations today") }); expect(calls).toHaveLength(MAX_PER_DAY);
    expect((await inv().send(id(6), { by: "a", what: "b" })).ok).toBe(true); NOW = new Date(NOW.getTime() + 86_400_000 + 1000); expect((await inv().send(id(5), { by: "a", what: "b" })).ok).toBe(true);
  });
  it("tells the caller when the email failed, does not count it, and never repeats the provider's message or any link", async () => {
    fail = true; const r = await inv().send(id(5), { by: "a", what: "b" }); expect(r).toMatchObject({ ok: false, status: 502, error: "The invitation could not be emailed: check the address and try again" }); expect(JSON.stringify(r)).not.toContain("secret.link"); expect(JSON.stringify(r)).not.toContain("provider"); expect(await q(`SELECT * FROM audit_log`)).toEqual([]);
    fail = false; for (let i = 0; i < MAX_PER_DAY; i++) { fail = true; await inv().send(id(5), { by: "a", what: "b" }); } fail = false; expect((await inv().send(id(5), { by: "a", what: "b" })).ok).toBe(true);                  // failures never used up the day's five
  });
});
