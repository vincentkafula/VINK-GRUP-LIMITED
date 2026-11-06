/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createCommission } from "./commission.js";
import { createMarshalCare, type MarshalCare } from "./marshalCare.js";
import { createAlerts, TwilioSms, ConsoleSms, UnconfiguredSms, createSmsSender, mapUrl, type SmsSender } from "./alerts.js";
import type { EmailMessage, EmailSender } from "../auth/email.js";

/** Telling the association the moment a report is made: email for every report, SMS for panic, location as a map link, tracked per channel and retried without ever re-sending what went. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), M1: id(3), MB: id(5) }, R1 = id(100), RB = id(102);
const NOW = new Date("2026-11-02T08:00:00Z");
let db: Db, care: MarshalCare;
class FakeEmail implements EmailSender { readonly name = "fake"; sent: EmailMessage[] = []; failing = false; async send(m: EmailMessage) { if (this.failing) throw new Error("mail down"); this.sent.push(m); } }
class FakeSms implements SmsSender { readonly name = "fake"; sent: { to: string; text: string }[] = []; failing = false; async send(to: string, text: string) { if (this.failing) throw new Error("sms down"); this.sent.push({ to, text }); } }
let email: FakeEmail, sms: FakeSms, clock = NOW;
const alerts = (max?: number) => createAlerts({ db, email, sms, now: () => clock, ...(max ? { maxAttempts: max } : {}) });
const row = async (i: string) => (await db.query(`SELECT * FROM incidents WHERE id = $1`, [i])).rows[0] as any;
const report = async (o: any = {}) => String(((await care.reportIncident(U.M1, { rankId: R1, type: "panic", ...o })) as any).value.id);

beforeEach(async () => {
  db = allPortalsDb(); clock = NOW; email = new FakeEmail(); sms = new FakeSms(); care = createMarshalCare(db, createCommission(db, () => NOW), () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.M1, "Mo Marshal", "marshal"], [U.MB, "Bea Marshal", "marshal"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${nm.split(" ")[0].toLowerCase()}@langa.example`, r]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa')`, [R1, U.A]); await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [R1, U.M1]);
});
const setAlert = (a: { email?: string | null; phone?: string | null }) => db.query(`INSERT INTO association_settings (association_id, alert_email, alert_phone) VALUES ($1,$2,$3) ON CONFLICT (association_id) DO UPDATE SET alert_email = EXCLUDED.alert_email, alert_phone = EXCLUDED.alert_phone`, [U.A, a.email ?? null, a.phone ?? null]);

describe("a panic report", () => {
  it("is emailed and sent by SMS at once, with who, where, when and a map link, to the numbers the association gave", async () => {
    await setAlert({ email: "ops@langa.example", phone: "+27821234567" }); const i = await report({ latitude: -33.9249, longitude: 18.4241, accuracyM: 12.4, note: "Two men with a knife" });
    expect(await alerts().notifyIncident(i)).toEqual({ email: "sent", sms: "sent" });
    expect(email.sent).toHaveLength(1); expect(email.sent[0]).toMatchObject({ to: "ops@langa.example", subject: "PANIC: Mo Marshal at Langa" }); expect(email.sent[0].text).toContain("PANIC from Mo Marshal at Langa, 2026-11-02 10:00"); expect(email.sent[0].text).toContain("Location: https://maps.google.com/?q=-33.9249,18.4241 (within about 12 m)"); expect(email.sent[0].text).toContain("Note: Two men with a knife");
    expect(sms.sent).toEqual([{ to: "+27821234567", text: expect.stringContaining("PANIC from Mo Marshal at Langa") }]); expect(sms.sent[0].text).toContain("https://maps.google.com/?q=-33.9249,18.4241");
    const r = await row(i); expect(r.notified_at).not.toBeNull(); expect(r.notified_email_at).not.toBeNull(); expect(r.notified_sms_at).not.toBeNull(); expect(r.notify_error).toBeNull();
  });
  it("goes to the association's own account email when no alert email is set, and still says when there was no location", async () => {
    await setAlert({ phone: null }); const i = await report(); expect(await alerts().notifyIncident(i)).toEqual({ email: "sent", sms: "not_needed" }); expect(email.sent[0].to).toBe("langa@langa.example"); expect(email.sent[0].text).toContain("Location: not available"); expect(sms.sent).toEqual([]); expect((await row(i)).notified_at).not.toBeNull();
  });
  it("is a map link that opens the right place, and the pure helper agrees", () => { expect(mapUrl(-33.9249, 18.4241)).toBe("https://maps.google.com/?q=-33.9249,18.4241"); });
});

describe("other safety reports", () => {
  it("are emailed but never sent by SMS (SMS is for emergencies), with the kind in the subject", async () => {
    await setAlert({ email: "ops@langa.example", phone: "+27821234567" }); const i = await report({ type: "robbery", note: "Taxi hijacked" }); expect(await alerts().notifyIncident(i)).toEqual({ email: "sent", sms: "not_needed" });
    expect(email.sent[0].subject).toBe("Safety report: Robbery at Langa"); expect(email.sent[0].text).toContain("reported by Mo Marshal"); expect(sms.sent).toEqual([]);
  });
  it("mention a photo without attaching it, and escape anything the marshal typed so it cannot inject markup into the email", async () => {
    const i = await report({ type: "other", note: "<script>alert(1)</script> & \"quotes\"", photo: "data:image/png;base64,iVBORw0KGgo=" }); await alerts().notifyIncident(i); const m = email.sent[0];
    expect(m.text).toContain("A photo was sent with this report"); expect(m.html).not.toContain("<script>"); expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;"); expect(m.attachments).toBeUndefined();
  });
});

describe("when delivery fails", () => {
  it("records the failure on the report, never marks it delivered, and retries later without re-sending what already went", async () => {
    await setAlert({ email: "ops@langa.example", phone: "+27821234567" }); const i = await report({ latitude: -33.9, longitude: 18.4 }); sms.failing = true;
    expect(await alerts().notifyIncident(i)).toEqual({ email: "sent", sms: "failed" }); let r = await row(i); expect(r).toMatchObject({ notify_attempts: 1, notify_error: "sms: sms down", notified_at: null }); expect(r.notified_email_at).not.toBeNull();
    sms.failing = false; expect(await alerts().retryUnsent()).toBe(1); expect(email.sent).toHaveLength(1); expect(sms.sent).toHaveLength(1); r = await row(i); expect(r.notified_at).not.toBeNull(); expect(r.notify_error).toBeNull();                      // the email was not sent a second time
    expect(await alerts().retryUnsent()).toBe(0); expect(email.sent).toHaveLength(1);
  });
  it("retries a failed email, and keeps a visible reason when it never works, then stops after the limit rather than looping for ever", async () => {
    const i = await report({ type: "fight" }); email.failing = true; for (let k = 0; k < 3; k++) await alerts(3).retryUnsent(); expect(await row(i)).toMatchObject({ notify_attempts: 3, notify_error: "email: mail down", notified_at: null });
    await alerts(3).retryUnsent(); expect((await row(i)).notify_attempts).toBe(3);                                                              // no fourth try
  });
  it("does not retry reports older than a day, and sends a repeat call for an already delivered report as already done", async () => {
    const i = await report({ type: "fight" }); await db.query(`UPDATE incidents SET created_at = $2 WHERE id = $1`, [i, NOW]); email.failing = true; await alerts().notifyIncident(i); email.failing = false; clock = new Date(NOW.getTime() + 25 * 3600_000); expect(await alerts().retryUnsent()).toBe(0); expect(email.sent).toEqual([]);
    clock = NOW; await alerts().retryUnsent(); expect(email.sent).toHaveLength(1); expect(await alerts().notifyIncident(i)).toMatchObject({ email: "already" }); expect(email.sent).toHaveLength(1); expect(await alerts().notifyIncident(id(999))).toBeNull();
  });
  it("shows the failure to the association on the report, and not to the marshal", async () => {
    const i = await report({ type: "fight" }); email.failing = true; await alerts().notifyIncident(i);
    expect((await care.incidents({ associationId: U.A })).incidents[0]).toMatchObject({ alert: { email: false, sms: false, delivered: false, error: "email: mail down" } }); expect((await care.incidents({ marshalId: U.M1 })).incidents[0].alert).toBeNull();
  });
});

describe("the SMS providers", () => {
  it("sends to Twilio the way its API asks, with the credentials in the header, and never leaks the credentials or the message in an error", async () => {
    const calls: { url: string; init: any }[] = []; const ok = async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response("{}", { status: 201 }); };
    await new TwilioSms("AC123", "secret-token", "+27600000000", ok as any).send("+27821234567", "PANIC from Mo"); expect(calls[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"); expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret-token").toString("base64")}`); expect(Object.fromEntries(new URLSearchParams(calls[0].init.body))).toEqual({ To: "+27821234567", From: "+27600000000", Body: "PANIC from Mo" });
    const fail = async () => new Response('{"message":"The number +27821234567 is unverified"}', { status: 400 }); const err = (await new TwilioSms("AC123", "secret-token", "+27600000000", fail as any).send("+27821234567", "text").catch((e) => e)) as Error;
    expect(err.message).toBe("Twilio rejected the message (400)"); expect(err.message).not.toMatch(/secret|27821234567|unverified/);
  });
  it("picks Twilio when it is configured, the console in development, and fails loudly in production without it", async () => {
    expect(createSmsSender({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1" } as any)).toBeInstanceOf(TwilioSms); expect(createSmsSender({ NODE_ENV: "development" } as any)).toBeInstanceOf(ConsoleSms);
    const prod = createSmsSender({ NODE_ENV: "production" } as any); expect(prod).toBeInstanceOf(UnconfiguredSms); await expect(prod.send("+27821234567", "x")).rejects.toThrow(/not configured/); expect(createSmsSender({ NODE_ENV: "production", TWILIO_ACCOUNT_SID: "AC1" } as any)).toBeInstanceOf(UnconfiguredSms);
  });
  it("an unconfigured provider becomes a visible, retried failure rather than a lost alarm", async () => {
    await setAlert({ phone: "+27821234567" }); const i = await report(); const a = createAlerts({ db, email, sms: new UnconfiguredSms(), now: () => clock }); expect(await a.notifyIncident(i)).toEqual({ email: "sent", sms: "failed" }); expect((await row(i)).notify_error).toContain("SMS is not configured");
  });
});
