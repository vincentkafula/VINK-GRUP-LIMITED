/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import type { SmsSender } from "./alerts.js";
import { createOwnerSms, normalizePhone, maskPhone, SMS_KINDS, MAX_ATTEMPTS, MAX_CODES_PER_HOUR, MAX_CODES_PER_DAY, MAX_TESTS_PER_DAY, MAX_FAILED_PER_DAY, type OwnerSms } from "./ownerSms.js";
import { createOwnerCompliance } from "./ownerCompliance.js";
import { createDriverTargets } from "./driverTargets.js";
import { createOwnerFinance } from "./ownerFinance.js";

/**
 * Text alerts for an owner. The SMS sender is a stand-in that records what it was asked to send (and can be made to fail), so no real message is ever sent.
 * Owner O1 has vehicles v1 and v2 and driver D1; owner O2 has v3. The clock starts at 10:00 South African time on Wednesday 18 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), D1: id(6) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const START = new Date("2026-11-18T08:00:00Z");
let NOW = START, db: Db, s: OwnerSms, sent: { to: string; text: string }[], fail: boolean, name: string;
const sender: SmsSender = { get name() { return name; }, async send(to, text) { if (fail) throw new Error("gateway down"); sent.push({ to, text }); } };
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const codeSent = () => { const m = sent.at(-1)!.text.match(/code is (\d{6})/); expect(m, sent.at(-1)?.text).not.toBeNull(); return m![1]; };
const advance = (ms: number) => { NOW = new Date(NOW.getTime() + ms); };
const confirmed = async (owner = U.O1, phone = "082 123 4567") => { ok(await s.setPhone(owner, phone)); ok(await s.verify(owner, codeSent())); };

beforeEach(async () => {
  NOW = START; sent = []; fail = false; name = "twilio"; db = allPortalsDb(); s = createOwnerSms({ db, sms: sender, now: () => NOW });
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, i, nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2]);
});

describe("a phone number", () => {
  it("is made into +country digits, whichever way a South African number is typed, and anything else must say its country", () => {
    for (const [raw, want] of [["082 123 4567", "+27821234567"], ["0821234567", "+27821234567"], ["082-123-4567", "+27821234567"], ["27821234567", "+27821234567"], ["+27 82 123 4567", "+27821234567"], ["0027821234567", "+27821234567"], ["(082) 123 4567", "+27821234567"], ["+260 97 123 4567", "+260971234567"], ["0971234567".replace("09", "+2609"), "+260971234567"], ["  +27 61 234 5678 ", "+27612345678"], ["073 000 0000", "+27730000000"]] as const) expect(normalizePhone(raw), raw).toBe(want);
  });
  it("is refused when it is not a plausible mobile number, and a South African number must be a mobile one", () => {
    for (const bad of ["", "   ", "hello", "082 123", "082 123 45678", "+27 21 123 4567", "021 123 4567", "0821234567x", "+27+821234567", "82 123 4567", "+1", "+12345678901234567", 5, null, undefined, {}, "+27 82 123 4567 / 083 111 2222"]) expect(normalizePhone(bad), String(bad)).toBeNull();
  });
  it("is shown with only its end visible", () => { expect(maskPhone("+27821234567")).toBe("+27 ••••• 4567"); expect(maskPhone("+260971234567")).toBe("+26 •••••• 4567"); expect(maskPhone("+27821234567")).not.toContain("8212"); });
});

describe("giving a number and confirming it", () => {
  it("texts a code to the number typed, and nothing is on or chosen until it is confirmed", async () => {
    const r = ok<any>(await s.setPhone(U.O1, "082 123 4567")); expect(r.phone).toBe("+27 ••••• 4567"); expect(sent).toHaveLength(1); expect(sent[0].to).toBe("+27821234567"); expect(sent[0].text).toMatch(/^VINK: your code is \d{6}\. It works for 10 minutes\. If you did not ask for it, ignore this message\.$/);
    expect(await s.status(U.O1)).toMatchObject({ available: true, phone: "+27 ••••• 4567", verified: false, enabled: false, kinds: [], codePending: true }); expect((await q(`SELECT code_hash FROM owner_sms`))[0].code_hash).not.toContain(codeSent()); expect(JSON.stringify(await q(`SELECT * FROM owner_sms`))).not.toContain(codeSent());
  });
  it("confirms with the right code, once, and then the code is gone", async () => {
    ok(await s.setPhone(U.O1, "0821234567")); const c = codeSent(); ok(await s.verify(U.O1, c)); expect(await s.status(U.O1)).toMatchObject({ verified: true, enabled: false, codePending: false }); expect((await q(`SELECT code_hash, code_expires_at FROM owner_sms`))[0]).toEqual({ code_hash: null, code_expires_at: null }); expect(ok<any>(await s.verify(U.O1, "000000")).verified).toBe(true);                  // already confirmed
  });
  it("refuses a wrong code, a code that is not six digits, and gives up after five wrong tries, needing a new code", async () => {
    ok(await s.setPhone(U.O1, "0821234567")); const c = codeSent(), wrong = c === "123456" ? "654321" : "123456"; for (const bad of ["", "12345", "1234567", "abcdef", "12 3456", 123456 as any, null as any]) expect(await s.verify(U.O1, bad), String(bad)).toMatchObject({ ok: false, status: 400 }); expect((await q(`SELECT code_attempts FROM owner_sms`))[0].code_attempts).toBe(0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await s.verify(U.O1, wrong), `try ${i + 1}`).toMatchObject({ ok: false, status: 400, error: "That is not the code" }); expect(await s.verify(U.O1, c)).toMatchObject({ ok: false, status: 429, error: expect.stringContaining("ask for a new code") }); expect(await s.verify(U.O1, c)).toMatchObject({ ok: false, status: 410 });
    ok(await s.setPhone(U.O1, "0821234567")); ok(await s.verify(U.O1, codeSent()));
  });
  it("lets a code run out after ten minutes, but not before", async () => {
    ok(await s.setPhone(U.O1, "0821234567")); const c = codeSent(); advance(9 * 60_000 + 59_000); expect(await s.status(U.O1)).toMatchObject({ codePending: true }); advance(2_000); expect(await s.status(U.O1)).toMatchObject({ codePending: false }); expect(await s.verify(U.O1, c)).toMatchObject({ ok: false, status: 410, error: "That code has run out: ask for a new one" });
    ok(await s.setPhone(U.O1, "0821234567")); advance(9 * 60_000); ok(await s.verify(U.O1, codeSent()));
  });
  it("cannot be confirmed with the code sent to someone else's number, and needs a number first", async () => {
    ok(await s.setPhone(U.O2, "0831112222")); const theirs = codeSent(); ok(await s.setPhone(U.O1, "0821234567")); const mine = codeSent(); if (theirs !== mine) expect(await s.verify(U.O1, theirs)).toMatchObject({ ok: false, status: 400 }); expect((await s.status(U.O1)).verified).toBe(false); expect(await s.verify(U.O1, mine)).toMatchObject({ ok: true }); expect((await s.status(U.O2)).verified).toBe(false);
    await s.remove(U.O1); expect(await s.verify(U.O1, mine)).toMatchObject({ ok: false, status: 404, error: "Give your number first" });
  });
  it("starts again when the number changes: unconfirmed, switched off, and nothing chosen", async () => {
    await confirmed(); ok(await s.configure(U.O1, { enabled: true, kinds: ["finance", "service"] })); ok(await s.setPhone(U.O1, "0839998888")); expect(await s.status(U.O1)).toMatchObject({ phone: "+27 ••••• 8888", verified: false, enabled: false, kinds: [] }); expect(await s.configure(U.O1, { enabled: true, kinds: ["finance"] })).toMatchObject({ ok: false, status: 409 });
  });
  it("refuses a number that is not valid, says plainly when text messages are not set up, and tells the owner if the code could not be sent, leaving nothing behind", async () => {
    expect(await s.setPhone(U.O1, "nonsense")).toMatchObject({ ok: false, status: 400 }); name = "unconfigured"; expect(await s.setPhone(U.O1, "0821234567")).toMatchObject({ ok: false, status: 503, error: expect.stringContaining("not switched on yet") }); expect((await s.status(U.O1)).available).toBe(false); name = "twilio"; fail = true;
    expect(await s.setPhone(U.O1, "0821234567")).toMatchObject({ ok: false, status: 502 }); expect(await q(`SELECT * FROM owner_sms`)).toEqual([]); expect((await q(`SELECT status FROM owner_sms_log`)).map((r) => r.status)).toEqual(["failed"]);
  });
  it("limits how many codes can be asked for, per hour and per day, and counts each owner separately", async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR; i++) ok(await s.setPhone(U.O1, "0821234567")); expect(await s.setPhone(U.O1, "0821234567")).toMatchObject({ ok: false, status: 429 }); ok(await s.setPhone(U.O2, "0831112222"));
    advance(3_600_000 + 1000); for (let i = MAX_CODES_PER_HOUR; i < MAX_CODES_PER_DAY; i++) { ok(await s.setPhone(U.O1, "0821234567")); if ((i + 1) % MAX_CODES_PER_HOUR === 0) advance(3_600_000 + 1000); } expect((await q(`SELECT COUNT(*) AS n FROM owner_sms_log WHERE owner_id = $1 AND kind = 'code'`, [U.O1]))[0].n).toBe(MAX_CODES_PER_DAY);
    advance(3_600_000 + 1000); expect(await s.setPhone(U.O1, "0821234567")).toMatchObject({ ok: false, status: 429 }); advance(24 * 3_600_000); ok(await s.setPhone(U.O1, "0821234567"));
  });
});

describe("choosing what to be told", () => {
  it("needs a confirmed number, a kind that exists, and at least one kind to switch on", async () => {
    expect(await s.configure(U.O1, { enabled: true, kinds: ["finance"] })).toMatchObject({ ok: false, status: 409 }); ok(await s.setPhone(U.O1, "0821234567")); expect(await s.configure(U.O1, { enabled: true, kinds: ["finance"] })).toMatchObject({ ok: false, status: 409 }); ok(await s.verify(U.O1, codeSent()));
    for (const [bad, st] of [[{ enabled: true, kinds: [] }, 400], [{ enabled: true }, 400], [{ enabled: "yes", kinds: ["finance"] }, 400], [{ kinds: ["finance"] }, 400], [{ enabled: true, kinds: ["marketing"] }, 400], [{ enabled: true, kinds: "finance" }, 400], [{ enabled: true, kinds: ["finance", 5] }, 400]] as const) expect(await s.configure(U.O1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    expect(ok<any>(await s.configure(U.O1, { enabled: true, kinds: ["finance", "finance", "service"] })).kinds).toEqual(["finance", "service"]); expect(await s.status(U.O1)).toMatchObject({ enabled: true, kinds: ["finance", "service"] });
  });
  it("switches off but keeps what was chosen, and lists every kind in words", async () => {
    await confirmed(); ok(await s.configure(U.O1, { enabled: true, kinds: ["arrears", "compliance"] })); ok(await s.configure(U.O1, { enabled: false, kinds: ["arrears", "compliance"] })); const st = await s.status(U.O1); expect(st).toMatchObject({ enabled: false, kinds: ["arrears", "compliance"] }); expect(st.kindList.map((k) => k.key)).toEqual([...SMS_KINDS]); expect(st.kindList.map((k) => k.label.split(":")[0])).toEqual(["Money", "Servicing", "Compliance", "What drivers owe"]);
  });
  it("deletes the number and every choice, and says whether there was one", async () => { await confirmed(); ok(await s.configure(U.O1, { enabled: true, kinds: ["finance"] })); expect(ok<any>(await s.remove(U.O1)).removed).toBe(true); expect(await q(`SELECT * FROM owner_sms`)).toEqual([]); expect(await s.status(U.O1)).toMatchObject({ phone: null, verified: false, enabled: false, kinds: [] }); expect(ok<any>(await s.remove(U.O1)).removed).toBe(false); });
});

describe("a test message", () => {
  it("goes to the confirmed number only, three a day, and says plainly when it cannot be sent", async () => {
    expect(await s.test(U.O1)).toMatchObject({ ok: false, status: 409 }); ok(await s.setPhone(U.O1, "0821234567")); const pending = codeSent(); sent = []; expect(await s.test(U.O1)).toMatchObject({ ok: false, status: 409, error: "Confirm your number first" }); expect(sent).toEqual([]); ok(await s.verify(U.O1, pending)); sent = []; for (let i = 0; i < MAX_TESTS_PER_DAY; i++) ok(await s.test(U.O1)); expect(sent.map((m) => m.to)).toEqual(Array(3).fill("+27821234567")); expect(sent[0].text).toBe("VINK: this is a test. Your text alerts are working."); expect(await s.test(U.O1)).toMatchObject({ ok: false, status: 429 }); advance(24 * 3_600_000); ok(await s.test(U.O1));
    fail = true; advance(24 * 3_600_000); expect(await s.test(U.O1)).toMatchObject({ ok: false, status: 502 }); fail = false; name = "unconfigured"; expect(await s.test(U.O1)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("the daily run", () => {
  /** Real flags from the real services: a missed loan instalment and an unpaid fine (money), a service overdue (servicing), an expired certificate (compliance), a driver behind (what drivers owe). */
  const money = async () => { const f = createOwnerFinance(db, () => NOW); ok(await f.addFinance(U.O1, { vehicleId: V.v1, lender: "WesBank", originalCents: 45000000, balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, startDate: "2024-01-20" })); ok(await f.addCost(U.O1, { vehicleId: V.v1, category: "fine", amountCents: 20000, incurredOn: "2026-11-09" })); };
  const service = async () => { ok(await createOwnerFinance(db, () => NOW).addMaintenance(U.O1, { vehicleId: V.v2, kind: "service", servicedOn: "2026-05-01", nextDueOn: "2026-11-01", odometerKm: 1000 })); };
  const compliance = async () => { ok(await createOwnerCompliance(db, () => NOW).saveVehicle(U.O1, V.v1, { roadworthyExpiry: "2026-10-01" })); };
  const arrears = async () => { ok(await createDriverTargets(db, () => NOW).setTarget(U.O1, U.O1, { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02", driverId: U.D1 })); };
  const choose = async (kinds: string[], owner = U.O1) => { await confirmed(owner, owner === U.O1 ? "0821234567" : "0831112222"); ok(await s.configure(owner, { enabled: true, kinds })); sent = []; };
  const texts = () => sent.map((m) => m.text);

  it("sends one summary of what needs action, for the kinds chosen only, most serious first, with a way to switch off", async () => {
    await money(); await service(); await compliance(); await choose(["finance", "service", "compliance"]); const r = await s.dispatch(); expect(r).toEqual({ owners: 1, sent: 1, failed: 0, quiet: 0 }); expect(sent).toHaveLength(1); expect(sent[0].to).toBe("+27821234567"); const t = texts()[0];
    expect(t).toMatch(/^VINK: 4 things need you\.\n/); expect(t.split("\n").filter((l) => l.startsWith("- ")).length).toBe(3); expect(t).toContain("+1 more on your dashboard."); expect(t.endsWith("Switch off under Text alerts.")).toBe(true); expect(t.split("\n")[1]).toMatch(/expired on 2026-10-01|overdue/); expect(t).not.toContain("driver"); expect(t.length).toBeLessThanOrEqual(480);
  });
  it("tells an owner about nothing they did not choose", async () => {
    await money(); await service(); await compliance(); await arrears(); await choose(["arrears"]); await s.dispatch(); expect(texts()).toHaveLength(1); expect(texts()[0]).toContain("CA 111-111"); expect(texts()[0]).toMatch(/paid|behind|owed|target|payment/i); expect(texts()[0]).not.toContain("WesBank"); expect(texts()[0]).not.toContain("expired"); expect(texts()[0]).not.toContain("service");
  });
  it("says 'thing needs you' for one thing, and says nothing when nothing needs action", async () => {
    await compliance(); await choose(["compliance"]); await s.dispatch(); expect(texts()[0]).toMatch(/^VINK: 1 thing needs you\./); expect(texts()[0]).not.toContain("more on your dashboard"); sent = []; await db.query(`DELETE FROM owner_sms_log`); await createOwnerCompliance(db, () => NOW).saveVehicle(U.O1, V.v1, { roadworthyExpiry: "2027-12-01" }); expect(await s.dispatch()).toMatchObject({ sent: 0, quiet: 1 }); expect(sent).toEqual([]);
  });
  it("sends at most one a day, and not the same thing again within a week, but sends it again after a week if it is still wrong", async () => {
    await compliance(); await choose(["compliance"]); expect((await s.dispatch()).sent).toBe(1); expect((await s.dispatch()).sent).toBe(0); advance(3_600_000); expect((await s.dispatch()).sent).toBe(0); advance(24 * 3_600_000); expect((await s.dispatch()).sent).toBe(0);                  // next day, same item, inside the week
    advance(5 * 86_400_000); expect((await s.dispatch()).sent).toBe(0); advance(86_400_000); expect((await s.dispatch()).sent).toBe(1); expect(sent).toHaveLength(2);
  });
  it("tells about something new the next day, but not what it already told", async () => {
    await compliance(); await choose(["compliance", "service"]); await s.dispatch(); expect(texts()).toHaveLength(1); advance(86_400_000); await service(); await s.dispatch(); expect(texts()).toHaveLength(2); expect(texts()[1]).toMatch(/^VINK: 1 thing needs you\./); expect(texts()[1]).toContain("CA 222-222"); expect(texts()[1]).not.toContain("expired");
  });
  it("only runs between seven in the morning and seven in the evening, South African time", async () => {
    await compliance(); await choose(["compliance"]); for (const [utc, want] of [["2026-11-18T04:59:00Z", 0], ["2026-11-18T05:00:00Z", 1]] as const) { NOW = new Date(utc); await db.query(`DELETE FROM owner_sms_log WHERE kind = 'daily'`); sent = []; expect((await s.dispatch()).sent, utc).toBe(want); }
    for (const [utc, want] of [["2026-11-18T16:59:00Z", 1], ["2026-11-18T17:00:00Z", 0], ["2026-11-18T22:30:00Z", 0]] as const) { NOW = new Date(utc); await db.query(`DELETE FROM owner_sms_log WHERE kind = 'daily'`); sent = []; expect((await s.dispatch()).sent, utc).toBe(want); }
  });
  it("sends nothing to a number that is not confirmed, an owner who switched off, nor when text messages are not set up", async () => {
    await compliance(); ok(await s.setPhone(U.O1, "0821234567")); const c = codeSent(); sent = []; expect((await s.dispatch()).owners).toBe(0); expect(sent).toEqual([]);                  // not confirmed
    ok(await s.verify(U.O1, c)); expect((await s.dispatch()).owners).toBe(0);                  // confirmed, but not switched on
    ok(await s.configure(U.O1, { enabled: true, kinds: ["compliance"] })); ok(await s.configure(U.O1, { enabled: false, kinds: ["compliance"] })); expect((await s.dispatch()).owners).toBe(0); expect(sent).toEqual([]);                  // switched off again
    ok(await s.configure(U.O1, { enabled: true, kinds: ["compliance"] })); name = "unconfigured"; expect(await s.dispatch()).toEqual({ owners: 0, sent: 0, failed: 0, quiet: 0 }); expect(sent).toEqual([]);                  // the SMS service is not set up
    name = "twilio"; expect((await s.dispatch()).sent).toBe(1);
  });
  it("never texts a number that is saved but not confirmed, even if its row somehow says alerts are on", async () => {
    await compliance(); ok(await s.setPhone(U.O1, "0821234567")); sent = []; await db.query(`UPDATE owner_sms SET enabled = true, kinds = $1 WHERE owner_id = $2`, [JSON.stringify(["compliance"]), U.O1]);
    expect(await s.dispatch()).toMatchObject({ owners: 0, sent: 0 }); expect(sent).toEqual([]); expect(await s.status(U.O1)).toMatchObject({ verified: false, enabled: false });                  // and the owner is not shown as switched on
  });
  it("sends only one a day even when something new goes wrong the same day, and tells about the new thing the next day", async () => {
    await compliance(); await choose(["compliance", "service"]); expect((await s.dispatch()).sent).toBe(1); await service(); advance(3_600_000); const again = await s.dispatch(); expect(again).toMatchObject({ sent: 0, quiet: 1 }); expect(sent).toHaveLength(1);
    advance(24 * 3_600_000); expect((await s.dispatch()).sent).toBe(1); expect(sent).toHaveLength(2); expect(texts()[1]).toContain("CA 222-222");
  });
  it("tells about only the kinds chosen, even when the source it reads also reports other kinds", async () => {
    await money(); await service(); await choose(["finance"]); await s.dispatch(); expect(sent).toHaveLength(1); const t = texts()[0]; expect(t).toMatch(/WesBank|fine/); expect(t).not.toContain("CA 222-222"); expect(t).not.toMatch(/service/i);                  // the servicing problem is on vehicle 2, and the money overview also lists servicing: it must not be told
    sent = []; await db.query(`DELETE FROM owner_sms_log WHERE kind = 'daily'`); ok(await s.configure(U.O1, { enabled: true, kinds: ["service"] })); await s.dispatch(); expect(texts()[0]).toContain("CA 222-222"); expect(texts()[0]).not.toContain("WesBank");
  });
  it("tries again after a failure, but gives up for the day after three failures, and counts a failure as not sent", async () => {
    await compliance(); await choose(["compliance"]); fail = true; for (let i = 0; i < MAX_FAILED_PER_DAY; i++) expect(await s.dispatch(), `try ${i + 1}`).toMatchObject({ sent: 0, failed: 1 }); expect(await s.dispatch()).toMatchObject({ sent: 0, failed: 0, quiet: 1 }); fail = false; expect((await s.dispatch()).sent).toBe(0); advance(86_400_000); expect((await s.dispatch()).sent).toBe(1);
    expect((await q(`SELECT status FROM owner_sms_log WHERE kind = 'daily' ORDER BY sent_at`)).map((r) => r.status)).toEqual(["failed", "failed", "failed", "sent"]);
  });
  it("records what went and which alerts it covered, never the message or the number", async () => {
    await compliance(); await choose(["compliance"]); await s.dispatch(); const l = (await q(`SELECT * FROM owner_sms_log WHERE kind = 'daily'`))[0]; expect(l).toMatchObject({ owner_id: U.O1, status: "sent", error: null }); expect(JSON.parse(JSON.stringify(l.keys))[0]).toMatch(/^cc:expired:/); expect(JSON.stringify(await q(`SELECT * FROM owner_sms_log`))).not.toContain("+2782"); expect(JSON.stringify(await q(`SELECT * FROM owner_sms_log`))).not.toContain("expired on");
  });
  it("looks after each owner on their own: only their business, only their number", async () => {
    await compliance(); ok(await createOwnerCompliance(db, () => NOW).saveVehicle(U.O2, V.v3, { roadworthyExpiry: "2026-09-01" })); await choose(["compliance"], U.O1); await choose(["compliance"], U.O2);
    const r = await s.dispatch(); expect(r).toMatchObject({ owners: 2, sent: 2 }); const mine = sent.find((m) => m.to === "+27821234567")!, theirs = sent.find((m) => m.to === "+27831112222")!; expect(mine.text).toContain("CA 111-111"); expect(mine.text).not.toContain("CA 333-333"); expect(theirs.text).toContain("CA 333-333"); expect(theirs.text).not.toContain("CA 111-111");
  });
});
