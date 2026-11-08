/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DigestScreen } from "./AssociationDigest";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const OFF = { enabled: false, frequency: "weekly", weekday: 1, dayOfMonth: 1, recipients: [], sendWhenQuiet: false, when: "every Monday" };
const ON = { enabled: true, frequency: "weekly", weekday: 3, dayOfMonth: 1, recipients: ["chair@langa.test", "sec@langa.test"], sendWhenQuiet: false, when: "every Wednesday" };
const HIST = [{ period: "2026-11-16", status: "sent", recipients: 2, note: null, at: "2026-11-18T06:05:00Z" }, { period: "2026-11-09", status: "skipped", recipients: 0, note: "nothing needed attention", at: "2026-11-11T06:05:00Z" }, { period: "2026-11-02", status: "failed", recipients: 0, note: "none could be sent", at: "2026-11-04T06:05:00Z" }, { period: "2026-11-02", status: "test", recipients: 2, note: "1 could not be sent", at: "2026-11-03T08:00:00Z" }];
const state = (settings: any, emailAvailable = true, history: any[] = []) => { routes = (m, p) => (m === "GET" && p === `${P}/digest` ? { body: { success: true, settings, history, emailAvailable } } : m === "GET" && p === `${P}/digest/preview` ? { body: { success: true, text: "Langa Taxi Association: your digest for 2026-11-18\n\n4 things need your attention." } } : m === "PUT" && p === `${P}/digest` ? { body: { success: true, settings: ON } } : m === "POST" && p === `${P}/digest/test` ? { body: { success: true, sent: 2, failed: 0 } } : undefined); };
beforeEach(() => {
  calls = []; state(OFF);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the digest screen", () => {
  it("says what the digest is, that it names people, and that each person gets their own copy", async () => { render(<DigestScreen />); expect(await screen.findByText(/It names vehicles, drivers and members, so add only people who are allowed to see that/)).toBeInTheDocument(); expect(screen.getByText(/Each person gets their own copy/)).toBeInTheDocument(); expect(screen.getByRole("checkbox", { name: /Send the digest/ })).not.toBeChecked(); expect(screen.queryByText(/The digest is/)).toBeNull(); expect(screen.getByText("Nothing has been sent yet.")).toBeInTheDocument(); });
  it("warns that nothing can be sent when email is not set up", async () => { state(OFF, false); render(<DigestScreen />); expect(await screen.findByText(/Email is not set up on this server yet, so nothing can be sent/)).toBeInTheDocument(); });
  it("shows what is saved: that it is on, when, to how many, and fills the boxes", async () => {
    state(ON); render(<DigestScreen />); expect(await screen.findByText(/it is sent every Wednesday to 2 addresses/)).toBeInTheDocument(); expect(screen.getByRole("checkbox", { name: /Send the digest/ })).toBeChecked(); expect(screen.getByLabelText("Digest how often")).toHaveValue("weekly"); expect(screen.getByLabelText("Digest weekday")).toHaveValue("3"); expect(screen.getByLabelText("Digest email addresses")).toHaveValue("chair@langa.test, sec@langa.test");
  });
  it("sends what was chosen, splitting the addresses however they were separated", async () => {
    render(<DigestScreen />); await screen.findByLabelText("Digest email addresses"); fireEvent.click(screen.getByRole("checkbox", { name: /Send the digest/ })); pick("Digest weekday", "5"); pick("Digest email addresses", "a@x.test; b@x.test,  c@x.test d@x.test,"); fireEvent.click(screen.getByRole("checkbox", { name: /Send it even when nothing needs attention/ })); fireEvent.click(screen.getByRole("button", { name: "Save the digest settings" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/digest`, body: { enabled: true, frequency: "weekly", weekday: 5, dayOfMonth: 1, recipients: ["a@x.test", "b@x.test", "c@x.test", "d@x.test"], sendWhenQuiet: true } })); expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
  it("offers the day of the month, and not the weekday, for a monthly digest", async () => {
    render(<DigestScreen />); await screen.findByLabelText("Digest how often"); pick("Digest how often", "monthly"); expect(screen.queryByLabelText("Digest weekday")).toBeNull(); pick("Digest day of the month", "15"); pick("Digest email addresses", "a@x.test"); fireEvent.click(screen.getByRole("button", { name: "Save the digest settings" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ frequency: "monthly", dayOfMonth: 15, recipients: ["a@x.test"] }));
  });
  it("shows the server's reason when it will not save", async () => { render(<DigestScreen />); await screen.findByLabelText("Digest email addresses"); const o = routes; routes = (m, p, b) => (m === "PUT" ? { status: 400, body: { success: false, error: "\"nope\" is not a valid email address" } } : o(m, p, b)); pick("Digest email addresses", "nope"); fireEvent.click(screen.getByRole("button", { name: "Save the digest settings" })); expect(await screen.findByText(/"nope" is not a valid email address/)).toBeInTheDocument(); });
  it("shows today's digest as it would be emailed, and hides it again, sending nothing", async () => { render(<DigestScreen />); fireEvent.click(await screen.findByRole("button", { name: "Show me today's digest" })); const pre = await screen.findByLabelText("Digest preview"); expect(pre.textContent).toContain("4 things need your attention."); expect(writes()).toEqual([]); fireEvent.click(screen.getByRole("button", { name: "Hide it" })); expect(screen.queryByLabelText("Digest preview")).toBeNull(); });
  it("sends a test and says how many it went to, or why not", async () => {
    state(ON); render(<DigestScreen />); fireEvent.click(await screen.findByRole("button", { name: "Send a test email now" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/digest/test`, body: undefined })); expect(await screen.findByText("Sent to 2 addresses.")).toBeInTheDocument(); cleanup();
    state(ON); const o = routes; routes = (m, p, b) => (m === "POST" ? { status: 429, body: { success: false, error: "You have sent 3 test emails today: try again tomorrow" } } : o(m, p, b)); render(<DigestScreen />); fireEvent.click(await screen.findByRole("button", { name: "Send a test email now" })); expect(await screen.findByText(/You have sent 3 test emails today/)).toBeInTheDocument();
  });
  it("lists what was sent, skipped, failed and tested, in words", async () => { state(ON, true, HIST); render(<DigestScreen />); await screen.findByText("What was sent"); const items = screen.getAllByRole("listitem").map((l) => l.textContent ?? ""); expect(items.some((t) => /Sent · to 2$/.test(t))).toBe(true); expect(items.some((t) => t.includes("Not sent: nothing needed attention") && t.includes("nothing needed attention"))).toBe(true); expect(items.some((t) => t.includes("Could not be sent · none could be sent"))).toBe(true); expect(items.some((t) => t.includes("Test email · to 2 · 1 could not be sent"))).toBe(true); });
});
