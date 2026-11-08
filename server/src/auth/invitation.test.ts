/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resolveAuthConfig } from "./config.js";
import { MemoryAuthStore } from "./store.js";
import { SessionService } from "./sessionService.js";
import { AuthFlows, FlowError, INVITE_TTL_MS } from "./flows.js";
import { ConsoleEmail, type EmailSender } from "./email.js";
import { plainName } from "./emailTemplates.js";

/** An emailed invitation: a link to choose one's OWN password, using the platform's reset flow. The mail is a recording stand-in; the clock is ours. */
const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;
let NOW = new Date("2026-11-18T08:00:00Z"), store: MemoryAuthStore, mail: ConsoleEmail, flows: AuthFlows;
const advance = (ms: number) => { NOW = new Date(NOW.getTime() + ms); };
const FRONT = "https://www.example.test";
const tokenIn = (m: { text: string }) => decodeURIComponent((m.text.match(/token=([^&\s]+)/) ?? [])[1] ?? "");
beforeEach(() => {
  NOW = new Date("2026-11-18T08:00:00Z"); store = new MemoryAuthStore(); mail = new ConsoleEmail(); const cfg = resolveAuthConfig(env({ FRONTEND_URL: FRONT })), sessions = new SessionService(store, cfg);
  flows = new AuthFlows(store, sessions, mail, cfg, () => NOW, () => {});
  store.users.set("u1", { id: "u1", username: "thabo", passwordHash: bcrypt.hashSync("never-shown-random-password-1", 4), role: "vehicle_owner", name: "Thabo Mokoena", email: "thabo@langa.test", emailVerified: false, lastLogin: null });
});

describe("the invitation", () => {
  it("is emailed to the person's own address, names who invited them and to what, gives their username, and has no password in it", async () => {
    await flows.invite("u1", { by: "Olu Owner", what: "help run Langa Taxi Services" }); expect(mail.sent).toHaveLength(1); const m = mail.sent[0] as any;
    expect(m.to).toBe("thabo@langa.test"); expect(m.subject).toBe("You have been given a VINK login"); expect(m.text).toContain("Hi Thabo Mokoena, Olu Owner has given you a login to help run Langa Taxi Services. Your username is thabo."); expect(m.text).toContain("Choose my password:"); expect(m.text).toContain("works for 7 days and can be used once");
    expect(m.text).toMatch(new RegExp(`${FRONT.replace(/\./g, "\\.")}/reset-password\\?token=[A-Za-z0-9_-]+&invited=1`)); expect(m.text).not.toContain("never-shown-random-password"); expect(m.html).toContain("Choose my password");
  });
  it("lets the person choose their own password with the link, once, and that password then works", async () => {
    await flows.invite("u1", { by: "Olu", what: "VINK" }); const t = tokenIn(mail.sent[0]); await flows.resetPassword(t, "A-passphrase-I-chose-2026"); const u = await store.findUserById("u1"); expect(await bcrypt.compare("A-passphrase-I-chose-2026", u!.passwordHash)).toBe(true); expect(await bcrypt.compare("never-shown-random-password-1", u!.passwordHash)).toBe(false);
    await expect(flows.resetPassword(t, "Another-passphrase-2026")).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("does not burn the link on a weak password, so a typo does not cost the person their invitation", async () => { await flows.invite("u1", { by: "Olu", what: "VINK" }); const t = tokenIn(mail.sent[0]); await expect(flows.resetPassword(t, "password1")).rejects.toMatchObject({ code: "weak_password" }); await flows.resetPassword(t, "A-passphrase-I-chose-2026"); });
});

describe("how long it lasts", () => {
  it("works for seven days, not eight, where an ordinary reset link lasts one hour", async () => {
    await flows.invite("u1", { by: "Olu", what: "VINK" }); const t = tokenIn(mail.sent[0]); expect(INVITE_TTL_MS).toBe(7 * 86_400_000); advance(7 * 86_400_000 - 60_000); await flows.resetPassword(t, "A-passphrase-I-chose-2026");
    await flows.invite("u1", { by: "Olu", what: "VINK" }); const t2 = tokenIn(mail.sent[1]); advance(7 * 86_400_000 + 60_000); await expect(flows.resetPassword(t2, "Another-passphrase-2026")).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("leaves an ordinary password reset at one hour", async () => {
    await flows.requestPasswordReset("thabo@langa.test"); await new Promise((r) => setTimeout(r, 10)); const t = tokenIn(mail.sent[0]); advance(3_600_000 + 60_000); await expect(flows.resetPassword(t, "A-passphrase-I-chose-2026")).rejects.toMatchObject({ code: "invalid_token" });
    advance(-3_600_000 - 60_000); await flows.requestPasswordReset("thabo@langa.test"); await new Promise((r) => setTimeout(r, 10)); advance(3_600_000 - 120_000); await flows.resetPassword(tokenIn(mail.sent[1]), "A-passphrase-I-chose-2026");
  });
  it("makes a new invitation the only one that works", async () => { await flows.invite("u1", { by: "Olu", what: "VINK" }); await flows.invite("u1", { by: "Olu", what: "VINK" }); const [a, b] = mail.sent.map(tokenIn); expect(a).not.toBe(b); await expect(flows.resetPassword(a, "A-passphrase-I-chose-2026")).rejects.toMatchObject({ code: "invalid_token" }); await flows.resetPassword(b, "A-passphrase-I-chose-2026"); });
});

describe("when it cannot be sent", () => {
  it("says so, and does not pretend, when the email fails", async () => {
    const failing: EmailSender = { name: "resend", async send() { throw new Error("provider down"); } }; const cfg = resolveAuthConfig(env({ FRONTEND_URL: FRONT })); const f = new AuthFlows(store, new SessionService(store, cfg), failing, cfg, () => NOW, () => {}); await expect(f.invite("u1", { by: "Olu", what: "VINK" })).rejects.toThrow("provider down");
  });
  it("refuses a person who does not exist, and sends nothing", async () => { await expect(flows.invite("nobody", { by: "Olu", what: "VINK" })).rejects.toBeInstanceOf(FlowError); expect(mail.sent).toEqual([]); });
});

describe("the names that go into it", () => {
  it("cannot be used to carry a link, a line break or markup into the platform's own email", async () => {
    store.users.get("u1")!.name = "Click https://evil.test/login now\nand www.evil.test <b>pay</b>"; await flows.invite("u1", { by: "Olu\r\nVisit http://evil.test", what: "VINK <script>x</script>" }); const m = mail.sent[0] as any;
    expect(m.text).not.toContain("evil"); expect(m.html).not.toContain("evil"); expect(m.text).not.toContain("<b>"); expect(m.html).not.toContain("<script>"); expect(m.text).toMatch(/^You have been given a login\n\nHi Click now and bpay\/b, Olu Visit has given you a login to VINK scriptx\/script\./);
  });
  it("shortens and tidies what it is given, and has a fallback when nothing is left", () => {
    expect(plainName("  many   spaces\there ")).toBe("many spaces here"); expect(plainName("x".repeat(200))).toHaveLength(80); expect(plainName("https://only.a.link/")).toBe(""); expect(plainName("a<b>c")).toBe("abc"); expect(plainName("see www.evil.test today")).toBe("see today");
  });
  it("falls back to plain words when a name is nothing but a link", async () => { store.users.get("u1")!.name = "https://evil.test"; await flows.invite("u1", { by: "http://evil.test", what: "www.evil.test" }); expect((mail.sent[0] as any).text).toContain("Hi there, Someone has given you a login to VINK."); });
});
