/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import type { EmailSender, EmailMessage } from "../auth/email.js";
import { createAssociationDigest, isoWeekday, mondayOf, MAX_RECIPIENTS, MAX_TESTS_PER_DAY, MAX_FAILED_TRIES } from "./associationDigest.js";

/** The association's email digest. Association A is "Langa Taxi Association"; B is a stranger. The mail is a recording stand-in and the clock is ours. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2) };
let NOW = new Date("2026-11-18T08:00:00Z"), db: Db, sent: EmailMessage[], failFor: Set<string>, mailName: string, flagSets: Record<string, any[]>, expiries: any[], measures: any;
const advance = (ms: number) => { NOW = new Date(NOW.getTime() + ms); };
const at = (iso: string) => { NOW = new Date(iso); };
const mail = (): EmailSender => ({ get name() { return mailName; }, async send(m: EmailMessage) { if (failFor.has(m.to)) throw new Error(`provider refused ${m.to} secret-detail`); sent.push(m); } } as any);
const flag = (id: string, severity: "high" | "medium" | "low", message: string) => ({ id, category: "x", severity, message, subject: "s", dueOn: null });
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
let d: ReturnType<typeof createAssociationDigest>;
beforeEach(async () => {
  at("2026-11-18T08:00:00Z"); db = allPortalsDb(); sent = []; failFor = new Set(); mailName = "resend"; expiries = []; flagSets = { c: [flag("c1", "high", "CA 111-111 has no operating licence"), flag("c2", "medium", "3 members have not accepted the constitution"), flag("c3", "low", "Minor note")], f: [flag("f1", "medium", "R2500.00 in fees is overdue")], g: [], s: [flag("s1", "high", "An open dispute has been escalated")] };
  measures = { vehicles: 40, vehiclesLicensed: 31, licensedPercent: 77.5, drivers: 55, driversWithValidPermit: 50 };
  for (const [i, nm] of [[U.A, "Langa Taxi Association"], [U.B, "Other Association"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'association')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]);
  d = createAssociationDigest({ db, mail: mail(), now: () => NOW, frontendUrl: "https://www.example.test/", summaries: async () => [{ measures, flags: flagSets.c, expiries }, { measures: { membersOverdue: 4, overdueCents: 250000 }, flags: flagSets.f }, { measures: { overdueResolutions: 2 }, flags: flagSets.g }, { flags: flagSets.s }] });
});
const SETTINGS = { enabled: true, frequency: "weekly", weekday: 1, dayOfMonth: 1, recipients: ["chair@langa.test", "Sec@Langa.test"], sendWhenQuiet: false };
const save = (o: any = {}, assoc = U.A) => d.save(assoc, assoc, { ...SETTINGS, ...o });

describe("the settings", () => {
  it("start switched off with nobody to send to", async () => { expect(await d.get(U.A)).toEqual({ enabled: false, frequency: "weekly", weekday: 1, dayOfMonth: 1, recipients: [], sendWhenQuiet: false, when: "every Monday" }); });
  it("keep what was chosen, with addresses in lower case and each once, and say when in words", async () => {
    expect(ok<any>(await save({ recipients: ["Chair@Langa.test", "chair@langa.test", " sec@langa.test "] }))).toEqual({ enabled: true, frequency: "weekly", weekday: 1, dayOfMonth: 1, recipients: ["chair@langa.test", "sec@langa.test"], sendWhenQuiet: false, when: "every Monday" });
    expect(ok<any>(await save({ weekday: 5 })).when).toBe("every Friday"); for (const [dom, w] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"], [28, "28th"]] as const) expect(ok<any>(await save({ frequency: "monthly", dayOfMonth: dom })).when, String(dom)).toBe(`on the ${w} of each month`);
  });
  it("refuse what is not valid, with the reason, and keep nothing", async () => {
    for (const [bad, why] of [[{ enabled: "yes" }, /on or off/], [{ frequency: "daily" }, /weekly or monthly/], [{ weekday: 0 }, /day of the week/], [{ weekday: 8 }, /day of the week/], [{ weekday: 1.5 }, /day of the week/], [{ frequency: "monthly", dayOfMonth: 29 }, /1 to 28/], [{ dayOfMonth: 0 }, /1 to 28/], [{ recipients: "a@b.co" }, /email addresses/], [{ recipients: ["nope"] }, /"nope" is not a valid email/], [{ recipients: [5] }, /valid email/], [{ recipients: [] }, /at least one email/], [{ recipients: Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@x.test`) }, /Up to 5/], [{ sendWhenQuiet: "no" }, /nothing needs attention/]] as const) expect(await save(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(await q(`SELECT * FROM association_digests`)).toEqual([]); ok(await save({ enabled: false, recipients: [] })); expect((await d.get(U.A)).enabled).toBe(false);
  });
  it("belong to each association alone", async () => { ok(await save()); expect((await d.get(U.B)).recipients).toEqual([]); ok(await save({ recipients: ["b@x.test"] }, U.B)); expect((await d.get(U.A)).recipients).toHaveLength(2); expect((await d.get(U.B)).recipients).toEqual(["b@x.test"]); expect((await q(`SELECT COUNT(*) AS n FROM association_digests`))[0].n).toBe(2); });
});

describe("what it says", () => {
  it("counts what needs attention, lists what needs action now and soon most serious first, and leaves the smaller notes to the dashboard", async () => {
    const c = await d.compose(U.A, "2026-11-18"); expect(c).toMatchObject({ needsAttention: 4, urgent: 2, soon: 2 }); expect(c.subject).toBe("Langa Taxi Association: 4 things need attention (2026-11-18)");
    const t = c.text; expect(t).toContain("4 things need your attention: 2 need action now and 2 soon."); expect(t.indexOf("NEEDS ACTION NOW")).toBeLessThan(t.indexOf("NEEDS ACTION SOON")); for (const m of ["CA 111-111 has no operating licence", "An open dispute has been escalated", "3 members have not accepted the constitution", "R2500.00 in fees is overdue"]) expect(t, m).toContain(`- ${m}`);
    expect(t).not.toContain("Minor note"); expect(t).toContain("1 smaller note are on the dashboard."); expect(t).toContain("Open the dashboard: https://www.example.test");
  });
  it("gives the headline figures from the modules that report them", async () => { const t = (await d.compose(U.A, "2026-11-18")).text; expect(t).toContain("Vehicles: 31 of 40 have a valid operating licence (77.5%). Drivers: 50 of 55 have a valid driving permit."); expect(t).toContain("Members overdue with their fees: 4 (R2500.00 in all)."); expect(t).toContain("Resolutions past their action date: 2."); });
  it("lists the expiries in the next 30 days, soonest first, and nothing further away or already past", async () => {
    expiries = [{ kind: "Operating licence", subject: "CA 111-111", expiresOn: "2026-11-18", days: 0 }, { kind: "Roadworthy certificate", subject: "CA 222-222", expiresOn: "2026-11-19", days: 1 }, { kind: "Insurance", subject: "CA 333-333", expiresOn: "2026-12-01", days: 13 }, { kind: "Driver's licence", subject: "Dan", expiresOn: "2026-12-18", days: 30 }, { kind: "Insurance", subject: "Far", expiresOn: "2027-02-01", days: 75 }, { kind: "Insurance", subject: "Past", expiresOn: "2026-11-01", days: -17 }];
    const t = (await d.compose(U.A, "2026-11-18")).text; expect(t).toContain("RUNNING OUT IN THE NEXT 30 DAYS"); expect(t).toContain("- Operating licence, CA 111-111: 2026-11-18 (today)"); expect(t).toContain("- Roadworthy certificate, CA 222-222: 2026-11-19 (tomorrow)"); expect(t).toContain("- Insurance, CA 333-333: 2026-12-01 (in 13 days)"); expect(t).toContain("- Driver's licence, Dan: 2026-12-18 (in 30 days)"); expect(t).not.toContain("Far"); expect(t).not.toContain("Past");
  });
  it("says so plainly when nothing needs attention, and is worded for one thing in the singular", async () => {
    flagSets = { c: [flag("a", "low", "x")], f: [], g: [], s: [] }; const q0 = await d.compose(U.A, "2026-11-18"); expect(q0.needsAttention).toBe(0); expect(q0.subject).toBe("Langa Taxi Association: nothing needs attention (2026-11-18)"); expect(q0.text).toContain("Nothing needs your attention today."); expect(q0.text).not.toContain("NEEDS ACTION");
    flagSets = { c: [flag("a", "medium", "Only this")], f: [], g: [], s: [] }; const one = await d.compose(U.A, "2026-11-18"); expect(one.subject).toBe("Langa Taxi Association: 1 thing needs attention (2026-11-18)"); expect(one.text).toContain("1 thing needs your attention: 0 need action now and 1 soon.");
  });
  it("shortens a long list and says how many more are on the dashboard", async () => { flagSets = { c: Array.from({ length: 15 }, (_, i) => flag(`h${i}`, "high", `Problem number ${i}`)), f: [], g: [], s: [] }; const t = (await d.compose(U.A, "2026-11-18")).text; expect(t.match(/^- Problem number/gm)).toHaveLength(12); expect(t).toContain("- and 3 more on the dashboard"); });
  it("cannot be used to carry markup, in the web version", async () => { flagSets = { c: [flag("x", "high", "<script>alert(1)</script> & \"quotes\"")], f: [], g: [], s: [] }; const c = await d.compose(U.A, "2026-11-18"); expect(c.html).not.toContain("<script>"); expect(c.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;"); });
  it("works against the real modules too, for an association with nothing recorded", async () => { const real = createAssociationDigest({ db, mail: mail(), now: () => NOW }), c = await real.compose(U.A, "2026-11-18"); expect(c.subject).toContain("Langa Taxi Association"); expect(c.text).toContain("Open the dashboard: https://www.vink.co.za"); expect(typeof c.needsAttention).toBe("number"); });
});

describe("when it is sent", () => {
  it("helpers: the weekday and the Monday of the week", () => { expect(isoWeekday("2026-11-16")).toBe(1); expect(isoWeekday("2026-11-22")).toBe(7); expect(mondayOf("2026-11-18")).toBe("2026-11-16"); expect(mondayOf("2026-11-22")).toBe("2026-11-16"); expect(mondayOf("2026-11-23")).toBe("2026-11-23"); });
  it("sends a weekly digest on the chosen weekday, once, each person their own copy, and records it", async () => {
    ok(await save({ weekday: 3 })); expect(await d.runDue()).toEqual({ checked: 1, sent: 1, skipped: 0, failed: 0 }); expect(sent.map((m) => m.to)).toEqual(["chair@langa.test", "sec@langa.test"]); expect(sent[0].subject).toBe("Langa Taxi Association: 4 things need attention (2026-11-18)"); expect(sent[0].text).toBe(sent[1].text); expect(sent[0].text).not.toContain("sec@langa.test");
    expect(await q(`SELECT period, status, recipients FROM association_digest_log`)).toEqual([{ period: "2026-11-16", status: "sent", recipients: 2 }]); expect(await d.runDue()).toMatchObject({ sent: 0 }); advance(3 * 3_600_000); expect(await d.runDue()).toMatchObject({ sent: 0 }); expect(sent).toHaveLength(2);
  });
  it("waits for the chosen weekday, sends if the server was off on it later in the same week, and sends again the next week", async () => {
    ok(await save({ weekday: 5 })); expect((await d.runDue()).sent).toBe(0); expect(sent).toEqual([]); at("2026-11-20T08:00:00Z"); expect((await d.runDue()).sent).toBe(1); at("2026-11-22T08:00:00Z"); expect((await d.runDue()).sent).toBe(0); at("2026-11-26T08:00:00Z"); expect((await d.runDue()).sent).toBe(0); at("2026-11-27T08:00:00Z"); expect((await d.runDue()).sent).toBe(1); expect((await q(`SELECT period FROM association_digest_log ORDER BY created_at`)).map((r) => r.period)).toEqual(["2026-11-16", "2026-11-23"]);
    at("2026-11-23T08:00:00Z"); ok(await save({ weekday: 1 })); expect((await d.runDue()).sent).toBe(0);                  // this week's is already sent, even though the day was changed
  });
  it("sends a monthly digest on or after the chosen day, once a month", async () => {
    ok(await save({ frequency: "monthly", dayOfMonth: 20 })); expect((await d.runDue()).sent).toBe(0); at("2026-11-21T08:00:00Z"); expect((await d.runDue()).sent).toBe(1); at("2026-11-28T08:00:00Z"); expect((await d.runDue()).sent).toBe(0); at("2026-12-19T08:00:00Z"); expect((await d.runDue()).sent).toBe(0); at("2026-12-20T08:00:00Z"); expect((await d.runDue()).sent).toBe(1); expect((await q(`SELECT period FROM association_digest_log ORDER BY created_at`)).map((r) => r.period)).toEqual(["2026-11", "2026-12"]);
  });
  it("sends only between 07:00 and 19:00 South African time", async () => {
    ok(await save({ weekday: 3 })); at("2026-11-18T04:59:00Z"); expect((await d.runDue()).checked).toBe(0); at("2026-11-18T05:00:00Z"); expect((await d.runDue()).sent).toBe(1); await db.query(`DELETE FROM association_digest_log`); sent = []; at("2026-11-18T16:59:00Z"); expect((await d.runDue()).sent).toBe(1); await db.query(`DELETE FROM association_digest_log`); at("2026-11-18T17:00:00Z"); expect((await d.runDue()).checked).toBe(0); at("2026-11-18T22:30:00Z"); expect((await d.runDue()).checked).toBe(0);
  });
  it("uses the South African day: late on Sunday evening UTC is already Monday there", async () => { ok(await save({ weekday: 1 })); at("2026-11-22T22:30:00Z"); expect((await d.runDue()).checked).toBe(0); at("2026-11-23T05:30:00Z"); expect((await d.runDue()).sent).toBe(1); expect((await q(`SELECT period FROM association_digest_log`))[0].period).toBe("2026-11-23"); });
  it("sends nothing for a digest that is off or has nobody to send to, and for no association but its own", async () => { await db.query(`INSERT INTO association_digests (association_id, enabled, frequency, weekday, recipients) VALUES ($1,false,'weekly',3,'["a@x.test"]'),($2,true,'weekly',3,'[]')`, [U.A, U.B]); expect(await d.runDue()).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 }); expect(sent).toEqual([]); });
  it("does not send when nothing needs attention, says so on the record once, unless the association asked for quiet digests", async () => {
    flagSets = { c: [flag("a", "low", "x")], f: [], g: [], s: [] }; ok(await save({ weekday: 3 })); expect(await d.runDue()).toEqual({ checked: 1, sent: 0, skipped: 1, failed: 0 }); expect(sent).toEqual([]); expect(await q(`SELECT status, recipients, note FROM association_digest_log`)).toEqual([{ status: "skipped", recipients: 0, note: "nothing needed attention" }]); expect((await d.runDue()).skipped).toBe(0);
    await db.query(`DELETE FROM association_digest_log`); ok(await save({ weekday: 3, sendWhenQuiet: true })); expect((await d.runDue()).sent).toBe(1); expect(sent[0].subject).toContain("nothing needs attention");
  });
  it("sends to those it can when one address fails, and says how many could not be sent, without the provider's own message", async () => {
    ok(await save({ weekday: 3 })); failFor.add("chair@langa.test"); expect((await d.runDue()).sent).toBe(1); expect(sent.map((m) => m.to)).toEqual(["sec@langa.test"]); const r = (await q(`SELECT status, recipients, note FROM association_digest_log`))[0]; expect(r).toEqual({ status: "sent", recipients: 1, note: "1 could not be sent" }); expect(JSON.stringify(r)).not.toContain("secret-detail");
  });
  it("tries again after a failure, and gives up for the period after three", async () => {
    ok(await save({ weekday: 3 })); failFor.add("chair@langa.test").add("sec@langa.test"); for (let i = 0; i < MAX_FAILED_TRIES; i++) { expect((await d.runDue()).failed, `try ${i + 1}`).toBe(1); advance(60_000); } expect((await d.runDue())).toMatchObject({ failed: 0, sent: 0 }); expect(sent).toEqual([]); expect((await q(`SELECT status FROM association_digest_log`)).map((r) => r.status)).toEqual(["failed", "failed", "failed"]);
    at("2026-11-23T08:00:00Z"); failFor.clear(); ok(await save({ weekday: 1 })); expect((await d.runDue()).sent).toBe(1);                  // a new week starts fresh
  });
  it("sends nothing at all, and spends no tries, when the email service is not set up", async () => { ok(await save({ weekday: 3 })); mailName = "unconfigured"; expect(await d.runDue()).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 }); expect(await q(`SELECT * FROM association_digest_log`)).toEqual([]); mailName = "resend"; expect((await d.runDue()).sent).toBe(1); });
  it("counts each association on its own", async () => { ok(await save({ weekday: 3 })); ok(await save({ weekday: 3, recipients: ["b@x.test"] }, U.B)); expect(await d.runDue()).toEqual({ checked: 2, sent: 2, skipped: 0, failed: 0 }); expect(sent.map((m) => m.to).sort()).toEqual(["b@x.test", "chair@langa.test", "sec@langa.test"]); });
});

describe("a test send", () => {
  it("sends the digest now to the chosen addresses, counts as a test and not as the period's digest, and is limited to three a day", async () => {
    ok(await save({ weekday: 3 })); const r = ok<any>(await d.sendTest(U.A)); expect(r).toEqual({ sent: 2, failed: 0 }); expect(sent).toHaveLength(2); expect((await q(`SELECT status FROM association_digest_log`)).map((x) => x.status)).toEqual(["test"]);
    for (let i = 1; i < MAX_TESTS_PER_DAY; i++) ok(await d.sendTest(U.A)); expect(await d.sendTest(U.A)).toMatchObject({ ok: false, status: 429, error: expect.stringContaining("3 test emails today") }); advance(24 * 3_600_000); ok(await d.sendTest(U.A)); expect((await d.runDue()).sent).toBe(1);                  // the real one is still to come
  });
  it("needs somewhere to send it and an email service, and says when it could not be sent", async () => {
    expect(await d.sendTest(U.A)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("at least one email address") }); ok(await save()); mailName = "unconfigured"; expect(await d.sendTest(U.A)).toMatchObject({ ok: false, status: 503 }); mailName = "resend"; failFor.add("chair@langa.test").add("sec@langa.test"); const r = await d.sendTest(U.A); expect(r).toMatchObject({ ok: false, status: 502 }); expect(JSON.stringify(r)).not.toContain("secret-detail");
  });
  it("keeps the record of what was sent, newest first, for the association's own digests only", async () => { ok(await save({ weekday: 3 })); await d.runDue(); advance(60_000); ok(await d.sendTest(U.A)); ok(await save({ weekday: 3, recipients: ["b@x.test"] }, U.B)); await d.sendTest(U.B); const h = await d.history(U.A); expect(h.map((x) => x.status)).toEqual(["test", "sent"]); expect(h[0]).toMatchObject({ period: "2026-11-16", recipients: 2, note: null }); expect(typeof h[0].at).toBe("string"); expect((await d.history(U.B)).map((x) => x.status)).toEqual(["test"]); });
});
