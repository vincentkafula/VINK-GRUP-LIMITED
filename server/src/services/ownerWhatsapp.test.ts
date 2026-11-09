/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import type { SmsSender } from "./alerts.js";
import { createOwnerSms, SMS_KINDS, MAX_TESTS_PER_DAY, MAX_FAILED_PER_DAY, type OwnerSms } from "./ownerSms.js";
import { createOwnerWhatsapp, configureOwnerWhatsapp, cleanParam, TEMPLATE_BODY, MAX_ITEMS, type OwnerWhatsapp } from "./ownerWhatsapp.js";
import { createOwnerCompliance } from "./ownerCompliance.js";
import { createDriverTargets } from "./driverTargets.js";
import { createOwnerFinance } from "./ownerFinance.js";

/**
 * WhatsApp alerts for an owner. The SMS sender (to confirm a number) and the WhatsApp client are stand-ins that record what they were asked to send and can be made to fail, so no real message is ever sent.
 * Owner O1 has vehicles v1 and v2 and driver D1; owner O2 has v3. The clock starts at 10:00 South African time on Wednesday 18 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), D1: id(6) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const START = new Date("2026-11-18T08:00:00Z");
let NOW = START, db: Db, s: OwnerSms, w: OwnerWhatsapp, wa: { to: string; name: string; language: string; params: string[] }[], failWa: boolean, sent: { to: string; text: string }[], fail: boolean, name: string;
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

const CFG: any = { phoneNumberId: "123", token: "tok-secret-value", verifyToken: "v", appSecret: "app-secret", number: "27600000000", reopenTemplate: "", reopenLanguage: "en", graphVersion: "v21.0" };
const waClient: any = { async sendTemplate(to: string, name: string, language: string, params: string[] = []) { if (failWa) return { ok: false, error: "Meta said: tok-secret-value is wrong (code 100)" }; wa.push({ to, name, language, params }); return { ok: true, id: `wamid.${wa.length}` }; }, async sendText() { return { ok: true, id: "x" }; }, async markRead() { /* nothing */ } };
const ENV = { WHATSAPP_ALERT_TEMPLATE: "vink_owner_alert", WHATSAPP_ALERT_LANGUAGE: "en" } as any;
const money = async () => { const f = createOwnerFinance(db, () => NOW); ok(await f.addFinance(U.O1, { vehicleId: V.v1, lender: "WesBank", originalCents: 45000000, balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, startDate: "2024-01-20" })); ok(await f.addCost(U.O1, { vehicleId: V.v1, category: "fine", amountCents: 20000, incurredOn: "2026-11-09" })); };
const service = async () => { ok(await createOwnerFinance(db, () => NOW).addMaintenance(U.O1, { vehicleId: V.v2, kind: "service", servicedOn: "2026-05-01", nextDueOn: "2026-11-01", odometerKm: 1000 })); };
const arrears = async () => { ok(await createDriverTargets(db, () => NOW).setTarget(U.O1, U.O1, { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02", driverId: U.D1 })); };
const compliance = async () => { ok(await createOwnerCompliance(db, () => NOW).saveVehicle(U.O1, V.v1, { roadworthyExpiry: "2026-10-01" })); };
const agree = async (kinds: string[] = ["finance", "service", "arrears"], owner = U.O1) => { ok(await w.configure(owner, { enabled: true, kinds, consent: true })); wa = []; };
const set = async () => { await confirmed(U.O1, "082 123 4567"); await agree(); };
const waLog = async (kind?: string) => (await q(`SELECT kind, status, keys, error FROM owner_whatsapp_log ${kind ? `WHERE kind = '${kind}'` : ""} ORDER BY sent_at`)).map((r) => ({ ...r, keys: typeof r.keys === "string" ? JSON.parse(r.keys) : r.keys }));

beforeEach(async () => { wa = []; failWa = false; configureOwnerWhatsapp({ wa: waClient, config: CFG, env: ENV }); w = createOwnerWhatsapp(db, () => NOW); });
afterEach(() => configureOwnerWhatsapp(null));

describe("whether it is available", () => {
  it("says what is missing, and that nothing can be sent, until WhatsApp and an approved template are set up", async () => {
    await confirmed(); configureOwnerWhatsapp(null); expect(await w.status(U.O1)).toMatchObject({ available: false, reason: "WhatsApp is not set up on this server yet" });
    configureOwnerWhatsapp({ wa: waClient, config: { ...CFG, token: "" }, env: ENV }); expect((await w.status(U.O1)).available).toBe(false);
    configureOwnerWhatsapp({ wa: waClient, config: CFG, env: {} as any }); expect(await w.status(U.O1)).toMatchObject({ available: false, reason: expect.stringContaining("message template has not been approved") });
    configureOwnerWhatsapp({ wa: waClient, config: CFG, env: { WHATSAPP_ALERT_TEMPLATE: "Bad Name!" } as any }); expect((await w.status(U.O1)).available).toBe(false);
    configureOwnerWhatsapp({ wa: waClient, config: CFG, env: ENV }); expect(await w.status(U.O1)).toMatchObject({ available: true, reason: null });
  });
  it("shows the number only by its end, whether one is confirmed, what is chosen, and the day the owner agreed", async () => {
    expect(await w.status(U.O1)).toMatchObject({ numberConfirmed: false, number: null, enabled: false, consentOn: null, kinds: [] }); await confirmed(); const a = await w.status(U.O1); expect(a).toMatchObject({ numberConfirmed: true, enabled: false }); expect(a.number).toMatch(/4567$/); expect(JSON.stringify(a)).not.toContain("0821234567"); expect(a.kindList.map((k) => k.key)).toEqual([...SMS_KINDS]);
    await agree(["finance"]); expect(await w.status(U.O1)).toMatchObject({ enabled: true, consentOn: "2026-11-18", kinds: ["finance"] });
  });
  it("has the template wording to give Meta, with the two variables", () => { expect(TEMPLATE_BODY).toBe("VINK alert: {{1}}. {{2}} Reply STOP to switch these off, or open WhatsApp alerts on your dashboard to change them."); expect(TEMPLATE_BODY.match(/\{\{\d\}\}/g)).toEqual(["{{1}}", "{{2}}"]); expect(TEMPLATE_BODY.startsWith("{{")).toBe(false); expect(TEMPLATE_BODY.endsWith("}}")).toBe(false); });
});

describe("switching it on", () => {
  it("needs a confirmed number, the owner's agreement, a kind, and the template: each with its own reason, and changes nothing until all are there", async () => {
    expect(await w.configure(U.O1, { enabled: true, kinds: ["finance"], consent: true })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Confirm your mobile number under Text alerts first") }); await confirmed();
    expect(await w.configure(U.O1, { enabled: true, kinds: ["finance"] })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Tick the box") }); expect(await w.configure(U.O1, { enabled: true, kinds: ["finance"], consent: "yes" })).toMatchObject({ ok: false, status: 400 });
    expect(await w.configure(U.O1, { enabled: true, kinds: [], consent: true })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("at least one kind") });
    configureOwnerWhatsapp({ wa: waClient, config: CFG, env: {} as any }); expect(await w.configure(U.O1, { enabled: true, kinds: ["finance"], consent: true })).toMatchObject({ ok: false, status: 503 }); expect(await q(`SELECT * FROM owner_whatsapp`)).toEqual([]);
  });
  it("refuses what is not valid", async () => { await confirmed(); for (const [b, why] of [[{ kinds: ["finance"] }, /on or off/], [{ enabled: "yes", kinds: [] }, /on or off/], [{ enabled: true }, /what to be told/], [{ enabled: true, kinds: ["finance", "weather"], consent: true }, /not one we send/]] as const) expect(await w.configure(U.O1, b as any), JSON.stringify(b)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) }); });
  it("records when the owner agreed, keeps that when they change what to be told, and needs no second tick", async () => {
    await confirmed(); ok(await w.configure(U.O1, { enabled: true, kinds: ["finance"], consent: true })); advance(2 * 86_400_000); const r = ok<any>(await w.configure(U.O1, { enabled: true, kinds: ["finance", "service"] })); expect(r.consentOn).toBe("2026-11-18"); expect(r.kinds).toEqual(["finance", "service"]);
  });
  it("can always be switched off, even when WhatsApp is not set up, and keeps what was chosen", async () => { await confirmed(); await agree(["finance", "arrears"]); configureOwnerWhatsapp(null); const r = ok<any>(await w.configure(U.O1, { enabled: false, kinds: ["finance", "arrears"] })); expect(r.enabled).toBe(false); expect(r.kinds).toEqual(["finance", "arrears"]); });
  it("goes off by itself if the owner deletes the number they confirmed", async () => { await set(); expect((await w.status(U.O1)).enabled).toBe(true); ok(await s.remove(U.O1)); expect((await w.status(U.O1)).enabled).toBe(false); await money(); expect(await w.dispatch()).toMatchObject({ sent: 0 }); expect(wa).toEqual([]); });
  it("withdraws consent and forgets the choices, and keeps each owner's own", async () => { await set(); await confirmed(U.O2, "083 111 2222"); await agree(["service"], U.O2); expect(ok<any>(await w.remove(U.O1)).removed).toBe(true); expect(ok<any>(await w.remove(U.O1)).removed).toBe(false); expect(await w.status(U.O1)).toMatchObject({ enabled: false, consentOn: null, kinds: [] }); expect((await w.status(U.O2)).enabled).toBe(true); });
});

describe("a test message", () => {
  it("sends the real template to the confirmed number, and says it is a test", async () => { await set(); ok(await w.test(U.O1)); expect(wa).toEqual([{ to: "27821234567", name: "vink_owner_alert", language: "en", params: ["this is only a test", "Nothing needs you. This is a test of your VINK WhatsApp alerts."] }]); expect(await waLog("test")).toEqual([{ kind: "test", status: "sent", keys: [], error: null }]); });
  it("needs the owner's agreement, a confirmed number and the template, and says why when it cannot", async () => {
    expect(await w.test(U.O1)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Tick the box") }); await confirmed(); expect(await w.test(U.O1)).toMatchObject({ ok: false, status: 409 }); await agree(); ok(await s.remove(U.O1)); expect(await w.test(U.O1)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Confirm your mobile number") });
    await confirmed(U.O1, "082 123 4567"); configureOwnerWhatsapp({ wa: waClient, config: CFG, env: {} as any }); expect(await w.test(U.O1)).toMatchObject({ ok: false, status: 503 }); expect(wa).toEqual([]);
  });
  it("is limited to three a day, and starts again tomorrow", async () => { await set(); for (let i = 0; i < MAX_TESTS_PER_DAY; i++) ok(await w.test(U.O1)); expect(await w.test(U.O1)).toMatchObject({ ok: false, status: 429, error: expect.stringContaining("3 test messages today") }); advance(24 * 3_600_000); ok(await w.test(U.O1)); });
  it("says when it could not be sent, without repeating anything the provider said", async () => { await set(); failWa = true; const r = await w.test(U.O1); expect(r).toMatchObject({ ok: false, status: 502, error: expect.stringContaining("on WhatsApp") }); expect(JSON.stringify(r)).not.toContain("tok-secret-value"); expect(await waLog("test")).toEqual([{ kind: "test", status: "failed", keys: [], error: "could not be sent" }]); });
});

describe("the daily message", () => {
  it("sends ONE message with the count and one line of what needs action, most serious first, using the template and the number confirmed", async () => {
    await money(); await service(); await arrears(); await set(); expect(await w.dispatch()).toEqual({ owners: 1, sent: 1, failed: 0, quiet: 0 }); expect(wa).toHaveLength(1); const m = wa[0]; expect(m).toMatchObject({ to: "27821234567", name: "vink_owner_alert", language: "en" }); expect(m.params).toHaveLength(2);
    expect(m.params[0]).toBe("6 things need you"); expect(m.params[1].split(" | ")).toHaveLength(MAX_ITEMS + 1); expect(m.params[1]).toMatch(/\| \+3 more on your dashboard$/); expect(m.params[1].split(" | ").slice(0, 3)).toEqual(["CA 111-111: R3000.00 is owed by the driver (about 15 days of the target)", "CA 222-222: the service was due on 2026-11-01 and is overdue", "1 fine is unpaid, R200.00 in all"]);                  // the two most serious first, then the fine
    expect(await waLog("daily")).toEqual([{ kind: "daily", status: "sent", keys: expect.arrayContaining([expect.stringContaining("mnt:")]), error: null }]); expect((await waLog("daily"))[0].keys).toHaveLength(MAX_ITEMS);
  });
  it("puts nothing in a variable that WhatsApp would refuse: no line break, no tab, no run of spaces, and not too long", async () => {
    await money(); await service(); await arrears(); await set(); await w.dispatch(); for (const p of wa[0].params) { expect(p).not.toMatch(/[\r\n\t]/); expect(p).not.toMatch(/ {2,}/); } expect(wa[0].params[0].length).toBeLessThanOrEqual(60); expect(wa[0].params[1].length).toBeLessThanOrEqual(600);
    expect(cleanParam("a\nb\t c    d", 50)).toBe("a b c d"); expect(cleanParam("x".repeat(100), 20)).toHaveLength(20); expect(cleanParam("x".repeat(100), 20).endsWith("…")).toBe(true); expect(cleanParam("  hi  ", 20)).toBe("hi");
  });
  it("says it in the singular for one thing", async () => { await service(); await confirmed(); await agree(["service"]); await w.dispatch(); expect(wa[0].params[0]).toBe("1 thing needs you"); expect(wa[0].params[1]).toBe("CA 222-222: the service was due on 2026-11-01 and is overdue"); });
  it("sends only the kinds chosen", async () => { await money(); await service(); await confirmed(); await agree(["service"]); await w.dispatch(); expect(wa[0].params[1]).not.toContain("WesBank"); expect(wa[0].params[1]).not.toContain("fine"); expect(wa[0].params[1]).toContain("CA 222-222"); });
  it("sends at most one a day, even when something new goes wrong, and tells about the new thing tomorrow", async () => { await service(); await confirmed(); await agree(["service", "finance"]); expect((await w.dispatch()).sent).toBe(1); await money(); advance(3_600_000); expect(await w.dispatch()).toMatchObject({ sent: 0, quiet: 1 }); advance(24 * 3_600_000); expect((await w.dispatch()).sent).toBe(1); expect(wa[1].params[1]).toContain("WesBank"); expect(wa[1].params[1]).not.toContain("CA 222-222"); });
  it("does not repeat an alert within a week, and tells about it again after", async () => { await service(); await confirmed(); await agree(["service"]); await w.dispatch(); advance(6 * 86_400_000); expect((await w.dispatch()).sent).toBe(0); advance(2 * 86_400_000); expect((await w.dispatch()).sent).toBe(1); });
  it("sends only between 07:00 and 19:00 South African time", async () => { await service(); await set(); for (const [iso, n] of [["2026-11-18T04:59:00Z", 0], ["2026-11-18T05:00:00Z", 1]] as const) { NOW = new Date(iso); expect((await w.dispatch()).sent, iso).toBe(n); } await db.query(`DELETE FROM owner_whatsapp_log`); wa = []; NOW = new Date("2026-11-19T16:59:00Z"); expect((await w.dispatch()).sent).toBe(1); await db.query(`DELETE FROM owner_whatsapp_log`); NOW = new Date("2026-11-20T17:00:00Z"); expect((await w.dispatch()).sent).toBe(0); });
  it("sends nothing to someone who has not agreed, switched it on, or has no confirmed number, nor when the template is not set up", async () => {
    await service(); await confirmed(); expect(await w.dispatch()).toMatchObject({ owners: 0, sent: 0 }); await agree(["service"]); ok(await w.configure(U.O1, { enabled: false, kinds: ["service"] })); expect((await w.dispatch()).sent).toBe(0); await db.query(`UPDATE owner_whatsapp SET enabled = true, consent_at = NULL`); expect((await w.dispatch()).sent).toBe(0);
    await db.query(`UPDATE owner_whatsapp SET consent_at = now()`); configureOwnerWhatsapp({ wa: waClient, config: CFG, env: {} as any }); expect(await w.dispatch()).toEqual({ owners: 0, sent: 0, failed: 0, quiet: 0 }); expect(wa).toEqual([]);
  });
  it("says nothing when nothing new needs action, and sends nothing for an owner with no kinds chosen", async () => { await confirmed(); await agree(["service"]); expect(await w.dispatch()).toEqual({ owners: 1, sent: 0, failed: 0, quiet: 1 }); await db.query(`UPDATE owner_whatsapp SET kinds = '[]'`); await service(); expect(await w.dispatch()).toMatchObject({ sent: 0, quiet: 1 }); expect(wa).toEqual([]); });
  it("keeps each owner's alerts to themselves", async () => { await service(); await confirmed(U.O1, "082 123 4567"); await agree(["service"]); await confirmed(U.O2, "083 111 2222"); await agree(["service"], U.O2); await w.dispatch(); expect(wa.map((m) => m.to)).toEqual(["27821234567"]); });
  it("tries again after a failure, gives up for the day after three, and never keeps what the provider said", async () => {
    await service(); await set(); failWa = true; for (let i = 0; i < MAX_FAILED_PER_DAY; i++) { expect((await w.dispatch()).failed, `try ${i + 1}`).toBe(1); advance(60_000); } expect(await w.dispatch()).toMatchObject({ failed: 0, quiet: 1 }); const l = await waLog("daily"); expect(l.map((x) => x.status)).toEqual(["failed", "failed", "failed"]); expect(JSON.stringify(l)).not.toContain("tok-secret-value"); expect(l.every((x) => x.error === "could not be sent")).toBe(true);
    failWa = false; advance(24 * 3_600_000); expect((await w.dispatch()).sent).toBe(1);                  // tomorrow starts fresh
  });
  it("does not count a failed message as told, so the alert is still sent next time", async () => { await service(); await set(); failWa = true; await w.dispatch(); failWa = false; advance(60_000); expect((await w.dispatch()).sent).toBe(1); });
  it("tells about compliance reminders only when asked, using the same source as the dashboard", async () => { await compliance(); await confirmed(); await agree(["service"]); expect((await w.dispatch()).sent).toBe(0); ok(await w.configure(U.O1, { enabled: true, kinds: ["compliance"] })); expect((await w.dispatch()).sent).toBe(1); expect(wa[0].params[1]).toContain("CA 111-111"); });
});

describe("a STOP on WhatsApp", () => {
  it("switches off the alerts of the owner who confirmed that number, keeps what they chose, and records it", async () => { await set(); await confirmed(U.O2, "083 111 2222"); await agree(["service"], U.O2); expect(await w.handleStop("27821234567")).toBe(1); expect(await w.status(U.O1)).toMatchObject({ enabled: false, kinds: ["finance", "service", "arrears"], consentOn: "2026-11-18" }); expect((await w.status(U.O2)).enabled).toBe(true); expect(await waLog("stop")).toEqual([{ kind: "stop", status: "sent", keys: [], error: null }]); });
  it("switches off every owner who confirmed that number, is safe to repeat, and counts only those that were on", async () => { await set(); await db.query(`UPDATE owner_sms SET phone = '+27821234567'`); await confirmed(U.O2, "083 111 2222"); await db.query(`UPDATE owner_sms SET phone = '+27821234567' WHERE owner_id = $1`, [U.O2]); await agree(["service"], U.O2); expect(await w.handleStop("27821234567")).toBe(2); expect(await w.handleStop("27821234567")).toBe(0); expect((await w.status(U.O1)).enabled).toBe(false); expect((await w.status(U.O2)).enabled).toBe(false); });
  it("leaves alone a number it does not know, and anything that is not a number", async () => { await set(); for (const x of ["27700000000", "", "abc", null, undefined, 5, "123"]) expect(await w.handleStop(x), String(x)).toBe(0); expect((await w.status(U.O1)).enabled).toBe(true); expect(await waLog("stop")).toEqual([]); });
  it("stops the daily message", async () => { await service(); await set(); await w.handleStop("27821234567"); expect((await w.dispatch()).sent).toBe(0); expect(wa).toEqual([]); });
});
