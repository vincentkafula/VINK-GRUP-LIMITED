/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import type { SmsSender } from "../services/alerts.js";
import { createTwilioSmsWebhook, twilioSignature, verifyTwilioSignature } from "./twilioSmsWebhook.js";

/**
 * Replies to an owner's text alerts. The signatures below were worked out SEPARATELY (in Python, from the documented rule: the address, then each parameter's name and value in alphabetical order, HMAC-SHA1 with the account's token, base64), not by this code.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2) };
const TOKEN = "tok-secret", URL_ = "https://api.example.test/api/webhooks/twilio/sms";
let db: Db, server: Server, base = "", env: NodeJS.ProcessEnv;
const sms: SmsSender = { name: "twilio", async send() { /* never sends in these tests */ } };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const row = async (owner: string) => (await q(`SELECT * FROM owner_sms WHERE owner_id = $1`, [owner]))[0];
const kinds = (r: any) => (typeof r.kinds === "string" ? JSON.parse(r.kinds) : r.kinds);
const post = async (params: Record<string, string>, o: { signature?: string | null; url?: string; token?: string; contentType?: string } = {}) => {
  const sig = o.signature === undefined ? twilioSignature(o.token ?? TOKEN, o.url ?? URL_, params) : o.signature;
  const r = await fetch(`${base}/api/webhooks/twilio/sms`, { method: "POST", headers: { "Content-Type": o.contentType ?? "application/x-www-form-urlencoded", ...(sig ? { "X-Twilio-Signature": sig } : {}) }, body: new URLSearchParams(params).toString() });
  return { status: r.status, type: r.headers.get("content-type") ?? "", text: await r.text() };
};
const stopFrom = (from = "+27821234567", body = "STOP") => ({ From: from, Body: body, MessageSid: "SM123", To: "+27600000000" });

beforeEach(async () => {
  db = allPortalsDb(); env = { TWILIO_AUTH_TOKEN: TOKEN, TWILIO_SMS_WEBHOOK_URL: URL_ } as any;
  for (const [i, nm] of [[U.O1, "Olu Owner"], [U.O2, "Ona Owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'vehicle_owner')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]);
  await db.query(`INSERT INTO owner_sms (owner_id, phone, verified_at, enabled, kinds) VALUES ($1,'+27821234567',now(),true,$2),($3,'+27839998888',now(),true,$4)`, [U.O1, JSON.stringify(["finance", "service"]), U.O2, JSON.stringify(["compliance"])]);
  const app = express(); app.use("/api/webhooks/twilio/sms", createTwilioSmsWebhook({ db, sms, env })); app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

describe("the signature", () => {
  it("is exactly what was worked out separately from the documented rule", () => {
    expect(twilioSignature(TOKEN, URL_, { From: "+27821234567", Body: "STOP", MessageSid: "SM123", To: "+27600000000" })).toBe("nom8yDfp/RuVMVJBqa70PLQ/nSY="); expect(twilioSignature(TOKEN, URL_, { From: "+27821234567", Body: "Stop please é", MessageSid: "SM124" })).toBe("smgZ8xaWGXLEQQ+v7qOpOMpmNqE=");
    expect(twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", { CallSid: "CA1234567890ABCDE", Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212" })).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
  });
  it("does not depend on the order the parameters arrive in, and changes with any change to the address, the token, a name or a value", () => {
    const p = { From: "+27821234567", Body: "STOP", MessageSid: "SM123" }, a = twilioSignature(TOKEN, URL_, p); expect(twilioSignature(TOKEN, URL_, { MessageSid: "SM123", Body: "STOP", From: "+27821234567" })).toBe(a);
    for (const other of [twilioSignature("other", URL_, p), twilioSignature(TOKEN, URL_ + "?x=1", p), twilioSignature(TOKEN, "http://api.example.test/api/webhooks/twilio/sms", p), twilioSignature(TOKEN, URL_, { ...p, Body: "STOPP" }), twilioSignature(TOKEN, URL_, { ...p, Extra: "1" }), twilioSignature(TOKEN, URL_, { From: "+27821234567", Body: "STOP" })]) expect(other).not.toBe(a);
  });
  it("accepts only the exact signature", () => {
    const p = { From: "+27821234567", Body: "STOP" }, s = twilioSignature(TOKEN, URL_, p); expect(verifyTwilioSignature(TOKEN, URL_, p, s)).toBe(true); for (const bad of [undefined, null, "", "x", s.slice(0, -1), s + "=", s.toLowerCase(), 5, ["a"]]) expect(verifyTwilioSignature(TOKEN, URL_, p, bad), String(bad)).toBe(false); expect(verifyTwilioSignature("other", URL_, p, s)).toBe(false);
  });
});

describe("who may call it", () => {
  it("refuses a request with no signature, a wrong one, one made with another token or address, or one whose content was changed, and changes nothing", async () => {
    const p = stopFrom(); const cases = [await post(p, { signature: null }), await post(p, { signature: "nope" }), await post(p, { token: "other" }), await post(p, { url: "https://evil.test/hook" }), await post({ ...p, Body: "STOP now" }, { signature: twilioSignature(TOKEN, URL_, p) })];
    for (const r of cases) expect(r.status).toBe(403); const r = await row(U.O1); expect(r.enabled).toBe(true); expect(await q(`SELECT * FROM owner_sms_log`)).toEqual([]);
  });
  it("says it is not set up, and does nothing, without the secret or the address", async () => {
    delete env.TWILIO_AUTH_TOKEN; expect((await post(stopFrom())).status).toBe(503); env.TWILIO_AUTH_TOKEN = TOKEN; delete env.TWILIO_SMS_WEBHOOK_URL; expect((await post(stopFrom())).status).toBe(503); expect((await row(U.O1)).enabled).toBe(true);
  });
  it("does not accept a signed request that is not a form, so JSON cannot carry the parameters", async () => { const r = await fetch(`${base}/api/webhooks/twilio/sms`, { method: "POST", headers: { "Content-Type": "application/json", "X-Twilio-Signature": twilioSignature(TOKEN, URL_, stopFrom()) }, body: JSON.stringify(stopFrom()) }); expect(r.status).toBe(403); expect((await row(U.O1)).enabled).toBe(true); });
  it("is not reachable by GET", async () => { expect((await fetch(`${base}/api/webhooks/twilio/sms`)).status).toBe(404); });
});

describe("a reply of STOP", () => {
  it("switches off the alerts of the owner whose confirmed number it came from, keeps what they chose, and sends no reply of its own", async () => {
    const r = await post(stopFrom()); expect(r.status).toBe(200); expect(r.type).toContain("text/xml"); expect(r.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>'); const a = await row(U.O1); expect(a.enabled).toBe(false); expect(kinds(a)).toEqual(["finance", "service"]); expect(a.verified_at).not.toBeNull();
    expect((await row(U.O2)).enabled).toBe(true); expect((await q(`SELECT owner_id, kind, status FROM owner_sms_log`))).toEqual([{ owner_id: U.O1, kind: "stop", status: "sent" }]);
  });
  it("is the same for every word that means stop, in any case and with punctuation, and when more is said after it", async () => {
    for (const body of ["stop", "Stop.", "STOPALL", "Unsubscribe", "cancel", "END", "quit", "STOP please", "  stop  ", "STOP!!!"]) { await db.query(`UPDATE owner_sms SET enabled = true WHERE owner_id = $1`, [U.O1]); expect((await post(stopFrom("+27821234567", body))).status, body).toBe(200); expect((await row(U.O1)).enabled, body).toBe(false); }
  });
  it("leaves alone a message that is not a stop, and a number it does not know", async () => {
    for (const body of ["thanks", "STOPPING", "Please stop", "okay", "1", "hello STOP"]) { await post(stopFrom("+27821234567", body)); expect((await row(U.O1)).enabled, body).toBe(true); }
    expect((await post(stopFrom("+27700000000"))).status).toBe(200); expect((await row(U.O1)).enabled).toBe(true); expect((await row(U.O2)).enabled).toBe(true); expect(await q(`SELECT * FROM owner_sms_log`)).toEqual([]);
  });
  it("switches off every owner who confirmed that number, and is safe to repeat", async () => {
    await db.query(`UPDATE owner_sms SET phone = '+27821234567' WHERE owner_id = $1`, [U.O2]); await post(stopFrom()); expect((await row(U.O1)).enabled).toBe(false); expect((await row(U.O2)).enabled).toBe(false); expect((await post(stopFrom())).status).toBe(200); expect((await row(U.O1)).enabled).toBe(false);
  });
  it("is understood whether the number arrives in international form or as the number was first typed", async () => { await post(stopFrom("0821234567")); expect((await row(U.O1)).enabled).toBe(false); });
});

describe("the other replies", () => {
  it("never switches alerts back on from a text, and says where to do it", async () => {
    await db.query(`UPDATE owner_sms SET enabled = false WHERE owner_id = $1`, [U.O1]); for (const body of ["START", "yes", "UNSTOP"]) { const r = await post(stopFrom("+27821234567", body)); expect(r.status).toBe(200); expect(r.text).toContain("<Message>VINK: to switch text alerts back on, open Text alerts on your dashboard. We do not switch them on from a text message.</Message>"); expect((await row(U.O1)).enabled, body).toBe(false); }
  });
  it("answers HELP and INFO with how to stop and how to change it", async () => { for (const body of ["HELP", "info"]) { const r = await post(stopFrom("+27821234567", body)); expect(r.text).toContain("Reply STOP to switch them off, or open Text alerts on your dashboard to change them."); expect(r.text).toContain("at most one text a day"); } expect((await row(U.O1)).enabled).toBe(true); });
  it("says nothing to anything else, and copes with no body or an odd number", async () => { for (const p of [{ From: "+27821234567", Body: "hello" }, { From: "+27821234567" }, { Body: "STOP" }, { From: "garbage", Body: "STOP" }, { From: "+27821234567", Body: "" }]) { const r = await post(p as any); expect(r.status).toBe(200); expect(r.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>'); } expect((await row(U.O1)).enabled).toBe(true); });
  it("only ever puts fixed text in a reply, never anything the sender typed", async () => { const r = await post(stopFrom("+27821234567", "HELP <script>alert(1)</script> & more")); expect(r.text).not.toContain("script"); expect(r.text).not.toContain("alert"); });
});
