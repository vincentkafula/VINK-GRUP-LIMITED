/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TextAlertsScreen } from "./OwnerTextAlerts";
import { ownerNavAllowed, type OwnerAccess } from "./OwnerTeam";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[], state: any;
const P = "/api/portal/owner";
const KINDS = [{ key: "finance", label: "Money: a loan instalment missed, unpaid fines, a vehicle losing money" }, { key: "service", label: "Servicing: a service due or overdue" }, { key: "compliance", label: "Compliance: a licence, certificate or disc running out" }, { key: "arrears", label: "What drivers owe: a driver behind on payments" }];
const base = (o: any = {}) => ({ success: true, available: true, phone: null, verified: false, enabled: false, kinds: [], kindList: KINDS, codePending: false, ...o });

beforeEach(() => {
  calls = []; state = base();
  routes = (m, p) => { if (p === `${P}/sms` && m === "GET") return { body: state }; if (m === "POST" || m === "PUT" || m === "DELETE") return { body: { success: true } }; return undefined; };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("what the owner is told before anything is set up", () => {
  it("says plainly that it is optional, what is sent, how often, when, and how to stop it", async () => {
    render(<TextAlertsScreen />); expect(await screen.findByText(/It is completely optional and you choose what you are told/)).toBeInTheDocument();
    for (const t of [/only text a number you have confirmed with a code/, /one text a day/, /between 7 in the morning and 7 in the evening/, /not texted again within a week/, /never includes your bank details or a password/, /switch it off, or delete your number, at any time/, /reply STOP to any of the texts and it is switched off at once/]) expect(screen.getByText(t)).toBeInTheDocument();
  });
  it("says the service is not set up when it is not, instead of letting the owner try", async () => { state = base({ available: false }); render(<TextAlertsScreen />); expect(await screen.findByRole("alert")).toHaveTextContent("Text messages are not switched on yet"); });
});

describe("step 1: the number", () => {
  it("sends the number as typed and says a code was sent, then asks for the code", async () => {
    render(<TextAlertsScreen />); await screen.findByText("Step 1: your mobile number"); pick("Mobile number", "082 123 4567"); state = base({ phone: "+27 ••••• 4567", codePending: true }); fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/sms/phone`, body: { phone: "082 123 4567" } })); expect(await screen.findByText("Step 2: confirm it is your number")).toBeInTheDocument(); expect(screen.getByText(/We sent a code to/).textContent).toContain("+27 ••••• 4567"); expect(screen.getByText(/It works for 10 minutes/)).toBeInTheDocument(); expect(screen.queryByText("Step 1: your mobile number")).toBeNull();
  });
  it("shows the server's reason when the number is refused", async () => { routes = (m, p) => (m === "POST" && p.endsWith("/sms/phone") ? { status: 400, body: { success: false, error: "Give a mobile number, for example 082 123 4567" } } : p === `${P}/sms` ? { body: state } : undefined); render(<TextAlertsScreen />); await screen.findByText("Step 1: your mobile number"); pick("Mobile number", "hello"); fireEvent.click(screen.getByRole("button", { name: "Send me a code" })); expect(await screen.findByText(/Give a mobile number, for example 082 123 4567/)).toBeInTheDocument(); });
});

describe("step 2: the code", () => {
  beforeEach(() => { state = base({ phone: "+27 ••••• 4567", codePending: true }); });
  it("takes only digits, sends the six-digit code, and moves on when it is right", async () => {
    render(<TextAlertsScreen />); await screen.findByText("Step 2: confirm it is your number"); pick("Confirmation code", "12ab34 56"); expect(screen.getByLabelText("Confirmation code")).toHaveValue("123456"); state = base({ phone: "+27 ••••• 4567", verified: true }); fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/sms/verify`, body: { code: "123456" } })); expect(await screen.findByText("Step 3: choose what to be told")).toBeInTheDocument();
  });
  it("shows the server's reason for a wrong or expired code, and says when a code has run out", async () => {
    routes = (m, p) => (m === "POST" && p.endsWith("/sms/verify") ? { status: 400, body: { success: false, error: "That is not the code" } } : p === `${P}/sms` ? { body: state } : undefined); render(<TextAlertsScreen />); await screen.findByText("Step 2: confirm it is your number"); pick("Confirmation code", "000000"); fireEvent.click(screen.getByRole("button", { name: "Confirm" })); expect(await screen.findByText("That is not the code")).toBeInTheDocument();
    cleanup(); state = base({ phone: "+27 ••••• 4567", codePending: false }); render(<TextAlertsScreen />); expect(await screen.findByText(/That code has run out: ask for a new one/)).toBeInTheDocument();
  });
  it("lets the owner start again with a different number, and go back", async () => {
    render(<TextAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Use a different number" })); expect(screen.getByText("Use a different number", { selector: "h2, h3, div, span" })).toBeInTheDocument(); expect(screen.getByLabelText("Mobile number")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Keep the number I have" })); expect(screen.getByText("Step 2: confirm it is your number")).toBeInTheDocument();
  });
});

describe("step 3: what to be told", () => {
  beforeEach(() => { state = base({ phone: "+27 ••••• 4567", verified: true }); });
  it("starts with nothing chosen, lists each kind in words, and will not switch on until something is chosen", async () => {
    render(<TextAlertsScreen />); await screen.findByText("Step 3: choose what to be told"); for (const k of KINDS) expect(screen.getByRole("checkbox", { name: k.label })).not.toBeChecked(); expect(screen.getByText(/Right now text alerts are/).textContent).toContain("off");
    const o = routes; routes = (m, p, b) => (m === "PUT" && p.endsWith("/sms/settings") ? { status: 400, body: { success: false, error: "Choose at least one kind of alert to switch on" } } : o(m, p, b)); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" })); expect(await screen.findByText("Choose at least one kind of alert to switch on")).toBeInTheDocument(); expect(writes().at(-1)!.body).toEqual({ enabled: true, kinds: [] });
  });
  it("switches on with exactly the kinds ticked, and shows it is on, and switches off keeping the choices", async () => {
    render(<TextAlertsScreen />); await screen.findByText("Step 3: choose what to be told"); fireEvent.click(screen.getByRole("checkbox", { name: KINDS[0].label })); fireEvent.click(screen.getByRole("checkbox", { name: KINDS[2].label })); fireEvent.click(screen.getByRole("checkbox", { name: KINDS[2].label })); fireEvent.click(screen.getByRole("checkbox", { name: KINDS[1].label }));
    state = base({ phone: "+27 ••••• 4567", verified: true, enabled: true, kinds: ["finance", "service"] }); fireEvent.click(screen.getByRole("button", { name: "Switch on with these choices" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/sms/settings`, body: { enabled: true, kinds: ["finance", "service"] } }));
    await waitFor(() => expect(screen.getByText(/Right now text alerts are/).textContent).toContain("on")); expect(screen.getByRole("checkbox", { name: KINDS[0].label })).toBeChecked(); expect(screen.getByRole("checkbox", { name: KINDS[3].label })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Switch off" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/sms/settings`, body: { enabled: false, kinds: ["finance", "service"] } }));
  });
  it("sends a test text", async () => { render(<TextAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Send me a test text" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/sms/test` })); expect(await screen.findByText("A test text is on its way.")).toBeInTheDocument(); });
});

describe("deleting the number", () => {
  it("asks twice before deleting, then deletes the number and everything chosen", async () => {
    state = base({ phone: "+27 ••••• 4567", verified: true, enabled: true, kinds: ["finance"] }); render(<TextAlertsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Delete my number" })); expect(writes().filter((c) => c.method === "DELETE")).toEqual([]); state = base(); fireEvent.click(screen.getByRole("button", { name: "Yes, delete my number" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "DELETE", path: `${P}/sms`, body: undefined })); expect(await screen.findByText("Step 1: your mobile number")).toBeInTheDocument();
  });
});

describe("who sees it", () => {
  const MODS = ["overview", "notifications", "fleet", "driverpay", "compliance", "files", "association", "costs", "finance", "earnings", "audit"];
  const acc = (role: string | null): OwnerAccess => ({ kind: role ? "team" : "owner", name: null, role, roleText: role ?? "The owner", modules: Object.fromEntries(MODS.map((m) => [m, role ? "rw" : "rw"])) as any });
  it("is for the owner's own login only: every team role, however much it can do, is not shown it", () => { expect(ownerNavAllowed("Text alerts", acc(null))).toBe(true); for (const r of ["co_owner", "fleet_manager", "accountant"]) expect(ownerNavAllowed("Text alerts", acc(r)), r).toBe(false); expect(ownerNavAllowed("Text alerts", null)).toBe(false); });
});
