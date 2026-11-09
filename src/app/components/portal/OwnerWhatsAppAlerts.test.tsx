/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhatsAppAlertsScreen } from "./OwnerWhatsAppAlerts";
import { ownerNavAllowed, type OwnerAccess } from "./OwnerTeam";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[], state: any;
const P = "/api/portal/owner";
const KINDS = [{ key: "finance", label: "Money: a loan instalment missed or about to fall due, unpaid fines, a vehicle losing money" }, { key: "service", label: "Servicing: a service due or overdue" }, { key: "compliance", label: "Compliance: a licence, permit or certificate running out" }, { key: "arrears", label: "What drivers owe: a driver behind on their payments" }];
const base = (o: any = {}) => ({ success: true, available: true, reason: null, numberConfirmed: true, number: "+27 ••••• 4567", enabled: false, consentOn: null, kinds: [], kindList: KINDS, ...o });
beforeEach(() => {
  calls = []; state = base();
  routes = (m, p) => { if (p === `${P}/whatsapp` && m === "GET") return { body: state }; if (m === "POST" || m === "PUT" || m === "DELETE") return { body: { success: true } }; return undefined; };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");

describe("what the owner is told first", () => {
  it("says plainly that it is optional, who it goes to, how often, when, and how to stop it", async () => {
    render(<WhatsAppAlertsScreen />); expect(await screen.findByText(/It is completely optional and you choose what you are told/)).toBeInTheDocument();
    for (const t of [/only message the mobile number you confirmed under/, /one message a day/, /between 7 in the morning and 7 in the evening/, /never includes your bank details or a password/]) expect(screen.getByText((_, el) => el?.tagName === "LI" && t.test(el.textContent ?? ""))).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "LI" && /Reply STOP to any of the messages and it is switched off at once/.test(el.textContent ?? ""))).toBeInTheDocument();
  });
  it("says it is not available yet, and why, when WhatsApp or the template is not set up", async () => { state = base({ available: false, reason: "WhatsApp alerts are not available yet: the message template has not been approved and set up" }); render(<WhatsAppAlertsScreen />); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("WhatsApp alerts are not available yet: the message template has not been approved and set up. Nothing can be switched on until it is set up.")); cleanup(); state = base({ available: false, reason: "WhatsApp is not set up on this server yet" }); render(<WhatsAppAlertsScreen />); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("WhatsApp is not set up on this server yet. Nothing can be switched on until it is set up.")); });
  it("shows nothing about being unavailable when it is available", async () => { render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); expect(screen.queryByRole("status")).toBeNull(); });
});

describe("the number", () => {
  it("sends the owner to confirm a number under Text alerts first, and offers no choices until then", async () => { state = base({ numberConfirmed: false, number: null }); render(<WhatsAppAlertsScreen />); expect(await screen.findByText("First, confirm your mobile number")).toBeInTheDocument(); expect(screen.getByText(/WhatsApp alerts use the number you confirm under/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Switch on/ })).toBeNull(); expect(screen.queryByRole("checkbox")).toBeNull(); });
  it("shows where the messages will go, by the end of the number only", async () => { render(<WhatsAppAlertsScreen />); expect(await screen.findByText("+27 ••••• 4567")).toBeInTheDocument(); expect(document.body.textContent).not.toMatch(/0821234567|\+27821234567/); });
});

describe("switching on", () => {
  it("asks for the owner's agreement the first time, and sends what was chosen with it", async () => {
    render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); expect(screen.getByRole("checkbox", { name: /I agree to be sent alerts on WhatsApp/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Servicing/ })); fireEvent.click(screen.getByRole("checkbox", { name: /What drivers owe/ })); fireEvent.click(screen.getByRole("checkbox", { name: /I agree/ })); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/whatsapp/settings`, body: { enabled: true, kinds: ["service", "arrears"], consent: true } })); expect(await screen.findByText("WhatsApp alerts are on.")).toBeInTheDocument();
  });
  it("sends consent: false when the box is not ticked, so the server refuses and says why", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "Tick the box to say you agree to be sent alerts on WhatsApp" } } : o(m, p, b)))(routes); render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); fireEvent.click(screen.getByRole("checkbox", { name: /Servicing/ })); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" }));
    expect(await screen.findByText("Tick the box to say you agree to be sent alerts on WhatsApp")).toBeInTheDocument(); expect(writes().at(-1)!.body).toEqual({ enabled: true, kinds: ["service"], consent: false });
  });
  it("does not ask again once the owner has agreed, says when they agreed, and shows what is chosen", async () => {
    state = base({ enabled: true, consentOn: "2026-11-10", kinds: ["finance"] }); render(<WhatsAppAlertsScreen />); expect(await screen.findByText(/You agreed on 2026-11-10/)).toBeInTheDocument(); expect(screen.queryByRole("checkbox", { name: /I agree/ })).toBeNull(); expect(screen.getByRole("checkbox", { name: /Money/ })).toBeChecked(); expect(screen.getByRole("checkbox", { name: /Servicing/ })).not.toBeChecked(); expect(screen.getByText("on")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Servicing/ })); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ enabled: true, kinds: ["finance", "service"] }));
  });
  it("shows the server's reason when it will not switch on", async () => { routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 503, body: { success: false, error: "WhatsApp alerts are not available yet: the message template has not been approved and set up" } } : o(m, p, b)))(routes); render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" })); expect((await screen.findAllByText(/message template has not been approved/)).length).toBeGreaterThan(0); });
});

describe("switching off, testing and withdrawing", () => {
  it("switches off keeping the choices, and only offers that when it is on", async () => { render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); expect(screen.queryByRole("button", { name: "Switch off" })).toBeNull(); cleanup(); state = base({ enabled: true, consentOn: "2026-11-10", kinds: ["finance", "arrears"] }); render(<WhatsAppAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Switch off" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/whatsapp/settings`, body: { enabled: false, kinds: ["finance", "arrears"] } })); expect(await screen.findByText("WhatsApp alerts are off.")).toBeInTheDocument(); });
  it("sends a test message, and shows the server's reason when it cannot", async () => {
    render(<WhatsAppAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Send me a test message" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/whatsapp/test`, body: undefined })); expect(await screen.findByText(/A test message is on its way/)).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 429, body: { success: false, error: "You have sent 3 test messages today: try again tomorrow" } } : o(m, p, b)))(routes); render(<WhatsAppAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Send me a test message" })); expect(await screen.findByText(/You have sent 3 test messages today/)).toBeInTheDocument();
  });
  it("asks twice before withdrawing the agreement, and offers it only once there is one", async () => {
    render(<WhatsAppAlertsScreen />); await screen.findByText("Choose what to be told"); expect(screen.queryByText("Withdraw my agreement", { selector: "h2, h3, div, span" })).toBeNull(); cleanup();
    state = base({ enabled: true, consentOn: "2026-11-10", kinds: ["finance"] }); render(<WhatsAppAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Withdraw my agreement" })); expect(writes()).toEqual([]); fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw my agreement" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "DELETE", path: `${P}/whatsapp`, body: undefined }));
  });
});

describe("who sees it in the menu", () => {
  const A = (role: string | null, modules: Record<string, "r" | "rw">): OwnerAccess => ({ kind: role ? "team" : "owner", name: null, role, roleText: role ?? "The owner", modules } as any);
  it("is for the owner's own login only, like Text alerts", () => { expect(ownerNavAllowed("WhatsApp alerts", A(null, {}))).toBe(true); for (const role of ["co_owner", "fleet_manager", "accountant"]) expect(ownerNavAllowed("WhatsApp alerts", A(role, { overview: "rw", fleet: "rw", finance: "rw", earnings: "rw", costs: "rw", driverpay: "rw", compliance: "rw", files: "rw", association: "rw", audit: "r", notifications: "rw" })), role).toBe(false); });
});
