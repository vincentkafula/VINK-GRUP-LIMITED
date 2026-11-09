/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TeamScreen, ownerNavAllowed, type OwnerAccess } from "./OwnerTeam";
import { OwnerDashboard } from "./OwnerDashboard";
import { OwnerFinanceScreen } from "./OwnerFinance";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const MODS = ["overview", "notifications", "fleet", "driverpay", "compliance", "files", "association", "costs", "finance", "earnings", "audit", "bank"];
const access = (role: string | null, mods: Record<string, "r" | "rw">): OwnerAccess => ({ kind: role ? "team" : "owner", name: role ? "Thabo Mokoena" : null, role, roleText: role ?? "The owner", modules: Object.fromEntries(MODS.map((m) => [m, mods[m] ?? null])) as any });
const OWNER = access(null, Object.fromEntries(MODS.map((m) => [m, "rw" as const]))), CO = access("co_owner", { ...Object.fromEntries(MODS.map((m) => [m, "rw" as const])), audit: "r", bank: "r" }), FLEET = access("fleet_manager", { overview: "r", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", costs: "rw" }), ACC = access("accountant", { overview: "r", notifications: "rw", driverpay: "r", association: "r", costs: "r", finance: "r", earnings: "r", audit: "r" });
const TEAM = [{ id: "t1", name: "Thabo Mokoena", username: "thabo", email: "thabo@x.test", role: "fleet_manager", roleText: "Fleet manager", disabled: false, lastLogin: "2026-11-01T08:00:00Z", modules: [{ module: "overview", level: "r" }, { module: "fleet", level: "rw" }, { module: "costs", level: "rw" }] }, { id: "t2", name: "Anele Nkosi", username: "anele", email: "anele@x.test", role: "accountant", roleText: "Accountant (looks only)", disabled: true, lastLogin: null, modules: [{ module: "finance", level: "r" }] }];

beforeEach(() => {
  calls = []; routes = (m, p) => {
    if (p === `${P}/team` && m === "GET") return { body: { success: true, team: TEAM } };
    if (m === "POST" && p === `${P}/team`) return { status: 201, body: { success: true, id: "new", username: "sipho", temporaryPassword: "Abcdefghjkmnpq-4821" } }; if (p.endsWith("/reset-password")) return { body: { success: true, id: "t1", username: "thabo", temporaryPassword: "Zyxwvutsrqpnmk-7310" } };
    if (m === "POST" || m === "PUT") return { body: { success: true } }; return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const withAccess = (a: OwnerAccess | null) => { const o = routes; routes = (m, p, b) => (p === `${P}/access` ? (a ? { body: { success: true, ...a } } : { status: 500, body: { success: false, error: "x" } }) : o(m, p, b)); };

describe("which menu items a person may see", () => {
  it("shows the owner everything, including the team and the bank", () => { for (const l of ["Overview", "Vehicles", "Driver pay", "Payments & trips", "Requests & links", "VINK Tokens", "Bank account", "My team", "Profit and costs", "Anything"]) expect(ownerNavAllowed(l, OWNER), l).toBe(true); });
  it("shows a co-owner the business, and the bank, tokens and payments to look at, but never requests, the team or the text and WhatsApp alerts", () => {
    for (const l of ["Overview", "Vehicles", "Drivers", "Reports", "Financials", "Documents", "Notifications", "Driver targets", "My association", "Compliance centre", "Profit and costs", "Routes & map", "Payments & trips", "VINK Tokens", "Bank account"]) expect(ownerNavAllowed(l, CO), l).toBe(true); for (const l of ["Driver pay", "Requests & links", "My team", "Text alerts", "WhatsApp alerts"]) expect(ownerNavAllowed(l, CO), l).toBe(false);
    for (const a of [FLEET, ACC]) for (const l of ["Payments & trips", "VINK Tokens", "Bank account", "Requests & links", "My team", "Text alerts", "WhatsApp alerts"]) expect(ownerNavAllowed(l, a), `${a.role} ${l}`).toBe(false); for (const l of ["Payments & trips", "VINK Tokens", "Bank account", "Requests & links", "My team", "Text alerts", "WhatsApp alerts"]) expect(ownerNavAllowed(l, OWNER), l).toBe(true);
  });
  it("shows a fleet manager the vehicles, drivers, what drivers pay, compliance, documents and costs, but not takings, reports, the association or profit and loans' menu", () => {
    for (const l of ["Overview", "Vehicles", "Drivers", "Driver targets", "Compliance centre", "Documents", "Notifications", "Profit and costs", "Routes & map"]) expect(ownerNavAllowed(l, FLEET), l).toBe(true); for (const l of ["Reports", "Financials", "My association", "My team", "Bank account", "VINK Tokens", "Driver pay"]) expect(ownerNavAllowed(l, FLEET), l).toBe(false);
  });
  it("shows an accountant takings, reports, profit and costs, what drivers pay and the association, but not the vehicles, drivers, documents or compliance", () => {
    for (const l of ["Overview", "Reports", "Financials", "Profit and costs", "Driver targets", "My association", "Notifications"]) expect(ownerNavAllowed(l, ACC), l).toBe(true); for (const l of ["Vehicles", "Drivers", "Documents", "Compliance centre", "My team", "Bank account"]) expect(ownerNavAllowed(l, ACC), l).toBe(false);
  });
  it("shows the activity log to the owner, a co-owner and the accountant, and not to the fleet manager", () => { for (const a of [OWNER, CO, ACC]) expect(ownerNavAllowed("Activity log", a), String(a.role)).toBe(true); expect(ownerNavAllowed("Activity log", FLEET)).toBe(false); expect(ownerNavAllowed("Activity log", null)).toBe(false); });
  it("shows only the way in until it is known who is signed in", () => { expect(ownerNavAllowed("Overview", null)).toBe(true); for (const l of ["Vehicles", "Profit and costs", "Bank account", "My team"]) expect(ownerNavAllowed(l, null), l).toBe(false); });
});

describe("the dashboard's menu for each person", () => {
  const menu = async (a: OwnerAccess | null) => { withAccess(a); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 60)); return within(screen.getAllByRole("list")[0]).queryAllByRole("button").map((b) => b.textContent ?? ""); };
  it("gives the owner every item, including the team, and asks the bank for its strip", async () => { const m = await menu(OWNER); for (const l of ["Vehicles", "Driver pay", "Profit and costs", "Bank account", "My team"]) expect(m.some((x) => x.includes(l)), l).toBe(true); await waitFor(() => expect(calls.some((c) => c.path.includes("/bank"))).toBe(true)); });
  it("gives a fleet manager the day-to-day items and never asks the bank for anything", async () => { const m = await menu(FLEET); for (const l of ["Vehicles", "Drivers", "Driver targets", "Compliance centre", "Profit and costs"]) expect(m.some((x) => x.includes(l)), l).toBe(true); for (const l of ["Reports", "My association", "Bank account", "VINK Tokens", "My team", "Activity log"]) expect(m.some((x) => x.includes(l)), l).toBe(false); await new Promise((r) => setTimeout(r, 60)); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false); });
  it("gives an accountant the looking items, and never the bank", async () => { const m = await menu(ACC); for (const l of ["Reports", "Financials", "Profit and costs", "My association", "Activity log"]) expect(m.some((x) => x.includes(l)), l).toBe(true); for (const l of ["Vehicles", "Drivers", "Bank account", "My team"]) expect(m.some((x) => x.includes(l)), l).toBe(false); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false); });
  it("shows only the way in, and never asks the bank, while it is not yet known who is signed in", async () => { const m = await menu(null); expect(m.some((x) => x.includes("Overview"))).toBe(true); for (const l of ["Vehicles", "Profit and costs", "My team"]) expect(m.some((x) => x.includes(l)), l).toBe(false); await new Promise((r) => setTimeout(r, 60)); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false); });
});

describe("the finance tabs for each role", () => {
  const tabs = async (a: OwnerAccess) => { withAccess(a); render(<OwnerFinanceScreen />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 60)); return screen.getAllByRole("tab").map((t) => t.textContent); };
  it("shows the owner and a co-owner all seven", async () => { expect(await tabs(OWNER)).toEqual(["Overview", "Profit and loss", "Costs and fines", "Loans", "Servicing", "Planner", "Business"]); cleanup(); expect(await tabs(CO)).toHaveLength(7); });
  it("shows a fleet manager only costs and servicing, and opens on costs, never asking for profit or loans", async () => { expect(await tabs(FLEET)).toEqual(["Costs and fines", "Servicing"]); expect(screen.getByRole("tab", { name: "Costs and fines" })).toHaveAttribute("aria-selected", "true"); expect(calls.some((c) => c.path.includes("/finance/overview") && calls.indexOf(c) > calls.findIndex((x) => x.path === `${P}/access`))).toBe(false); });
  it("shows an accountant the overview, profit and loss, costs, loans and servicing, looking only", async () => { expect(await tabs(ACC)).toEqual(["Overview", "Profit and loss", "Costs and fines", "Loans", "Servicing", "Planner", "Business"]); });
});

describe("the team screen", () => {
  it("explains the roles and that the bank, tokens, payments and the team stay with the owner", async () => { render(<TeamScreen />); expect(await screen.findByText(/Runs the vehicles day to day/)).toBeInTheDocument(); expect(screen.getByText(/Looks but never changes/)).toBeInTheDocument(); expect(screen.getByText(/A partner: everything about the business, except the bank/)).toBeInTheDocument(); expect(screen.getByText(/The bank, VINK tokens, payments, requests and the team stay with your own login alone/)).toBeInTheDocument(); });
  it("lists each login with their role, when they last signed in, whether switched off, and what they can see in words", async () => {
    render(<TeamScreen />); const a = (await screen.findByText("Thabo Mokoena", { selector: "b" })).closest("li")!; expect(a).toHaveTextContent("thabo · thabo@x.test · last signed in"); expect(a).toHaveTextContent("Can see: overview (look only), vehicles and drivers, costs and servicing"); expect(screen.getByLabelText("Role of Thabo Mokoena")).toHaveValue("fleet_manager");
    const b = screen.getByText("Anele Nkosi", { selector: "b" }).closest("li")!; expect(b).toHaveTextContent("has not signed in yet"); expect(within(b).getByText("Switched off")).toBeInTheDocument(); expect(within(b).getByRole("button", { name: "Switch on Anele Nkosi" })).toBeInTheDocument(); expect(b).toHaveTextContent("Can see: profit, loans and exports (look only)");
  });
  it("changes a role and switches a login off or on", async () => {
    render(<TeamScreen />); await screen.findByText("Thabo Mokoena", { selector: "b" }); pick("Role of Thabo Mokoena", "co_owner"); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/team/t1/role`, body: { role: "co_owner" } })); fireEvent.click(screen.getByRole("button", { name: "Switch off Thabo Mokoena" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/team/t1/active`, body: { active: false } })); fireEvent.click(screen.getByRole("button", { name: "Switch on Anele Nkosi" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/team/t2/active`, body: { active: true } }));
  });
  it("creates a login and shows the one-time password with a warning that it is shown only now, until it is dismissed", async () => {
    render(<TeamScreen />); await screen.findByText("Thabo Mokoena", { selector: "b" }); pick("Team name", "Sipho Dube"); pick("Team email", "sipho@x.test"); pick("Team username", "sipho"); pick("Team role", "accountant"); fireEvent.click(screen.getByRole("button", { name: "Create login" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/team`, body: { name: "Sipho Dube", email: "sipho@x.test", username: "sipho", role: "accountant" } }));
    const a = await screen.findByRole("alert"); expect(a).toHaveTextContent("A password for Sipho Dube: it is shown only now."); expect(a).toHaveTextContent("Username sipho · password Abcdefghjkmnpq-4821"); expect(a).toHaveTextContent("with their username exactly as shown (it is lower case)"); expect(screen.getByLabelText("Team name")).toHaveValue(""); fireEvent.click(screen.getByRole("button", { name: "I have passed it on" })); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("resets a password and shows the new one-time password, and shows the server's reason when a login is refused", async () => {
    render(<TeamScreen />); fireEvent.click(await screen.findByRole("button", { name: "Reset password for Thabo Mokoena" })); const a = await screen.findByRole("alert"); expect(a).toHaveTextContent("A password for Thabo Mokoena: it is shown only now."); expect(a).toHaveTextContent("password Zyxwvutsrqpnmk-7310");
    const o = routes; routes = (m, p, b) => (m === "POST" && p === `${P}/team` ? { status: 409, body: { success: false, error: "That username is taken" } } : o(m, p, b)); pick("Team name", "X"); pick("Team email", "x@y.test"); pick("Team username", "thabo"); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect(await screen.findByText("That username is taken")).toBeInTheDocument();
  });
  it("says nobody has a login yet", async () => { const o = routes; routes = (m, p, b) => (p === `${P}/team` && m === "GET" ? { body: { success: true, team: [] } } : o(m, p, b)); render(<TeamScreen />); expect(await screen.findByText("Nobody has their own login yet.")).toBeInTheDocument(); });
});

describe("inviting by email", () => {
  const withInvites = (available: boolean) => { const o = routes; routes = (m, p, b) => (p === `${P}/team` && m === "GET" ? { body: { success: true, team: TEAM, invitationsAvailable: available } } : m === "POST" && p === `${P}/team` && b?.invite ? { status: 201, body: { success: true, id: "new", username: "sipho", invited: true } } : o(m, p, b)); };
  const fillNew = () => { pick("Team name", "Sipho Dube"); pick("Team email", "sipho@x.test"); pick("Team username", "sipho"); pick("Team role", "accountant"); };
  it("offers it, ticked, when email is set up, and says what it means", async () => { withInvites(true); render(<TeamScreen />); const box = await screen.findByRole("checkbox", { name: /Email them an invitation/ }); expect(box).toBeChecked(); expect(screen.getByText(/so they choose their own password\. Nothing is passed on to them by you/)).toBeInTheDocument(); });
  it("does not offer it when email is not set up, and gives a one-time password as before", async () => { withInvites(false); render(<TeamScreen />); await screen.findByText("Thabo Mokoena", { selector: "b" }); expect(screen.queryByRole("checkbox", { name: /Email them an invitation/ })).toBeNull(); expect(screen.queryByRole("button", { name: /Resend the invitation/ })).toBeNull(); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect((await screen.findByRole("alert")).textContent).toContain("password Abcdefghjkmnpq-4821"); expect(writes().at(-1)!.body.invite).toBeUndefined(); });
  it("sends the invitation, says where it went, shows no password, and clears the form", async () => {
    withInvites(true); render(<TeamScreen />); await screen.findByRole("checkbox", { name: /Email them an invitation/ }); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/team`, body: { name: "Sipho Dube", email: "sipho@x.test", username: "sipho", role: "accountant", invite: true } }));
    expect(await screen.findByText("We emailed an invitation to sipho@x.test. They choose their own password, so you have nothing to pass on.")).toBeInTheDocument(); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByLabelText("Team name")).toHaveValue(""); expect(document.body.textContent).not.toMatch(/A password for|Abcdefghjkmnpq|shown only now/);
  });
  it("gives a one-time password instead when the owner unticks it", async () => { withInvites(true); render(<TeamScreen />); fireEvent.click(await screen.findByRole("checkbox", { name: /Email them an invitation/ })); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/team`)); expect(writes().at(-1)!.body.invite).toBeUndefined(); expect((await screen.findByRole("alert")).textContent).toContain("password Abcdefghjkmnpq-4821"); });
  it("shows the server's reason when the invitation cannot be sent", async () => { withInvites(true); const o = routes; routes = (m, p, b) => (m === "POST" && p === `${P}/team` ? { status: 502, body: { success: false, error: "The invitation could not be emailed: check the address and try again" } } : o(m, p, b)); render(<TeamScreen />); await screen.findByRole("checkbox", { name: /Email them an invitation/ }); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect(await screen.findByText(/The invitation could not be emailed/)).toBeInTheDocument(); expect(screen.getByLabelText("Team email")).toHaveValue("sipho@x.test"); });
  it("offers to resend only to someone who has not signed in yet, and only when email is set up", async () => {
    withInvites(true); render(<TeamScreen />); await screen.findByText("Anele Nkosi", { selector: "b" }); expect(screen.getByRole("button", { name: "Resend the invitation to Anele Nkosi" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Resend the invitation to Thabo Mokoena" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resend the invitation to Anele Nkosi" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/team/t2/invite`, body: undefined })); expect(await screen.findByText("We emailed Anele Nkosi a new link. The old one no longer works.")).toBeInTheDocument();
  });
  it("shows the server's reason when a resend is refused", async () => { withInvites(true); const o = routes; routes = (m, p, b) => (m === "POST" && p.endsWith("/invite") ? { status: 429, body: { success: false, error: "That person has been sent enough invitations today: ask them to check their email, or try again tomorrow" } } : o(m, p, b)); render(<TeamScreen />); fireEvent.click(await screen.findByRole("button", { name: "Resend the invitation to Anele Nkosi" })); expect(await screen.findByText(/sent enough invitations today/)).toBeInTheDocument(); });
});

describe("what each person sees first on the dashboard", () => {
  const open = async (a: OwnerAccess | null) => { withAccess(a); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 80)); };
  const asked = (path: string) => calls.some((c) => c.path.startsWith(`${P}${path}`));
  it("gives a fleet manager a welcome and where to go, and never asks for the money figures they may not see", async () => {
    await open(FLEET); expect(await screen.findByText("Welcome, Thabo Mokoena")).toBeInTheDocument(); expect(screen.getByText(/Your role does not include the money figures/)).toBeInTheDocument(); expect(asked("/earnings")).toBe(false); expect(asked("/trend")).toBe(false); expect(screen.queryByText(/not have access/)).toBeNull(); expect(screen.queryByText(/fares collected/)).toBeNull();
    const body = screen.getByText("Welcome, Thabo Mokoena").parentElement!; const names = within(body).getAllByRole("button").map((b) => b.textContent); for (const l of ["Vehicles", "Drivers", "Driver targets", "Compliance centre", "Documents", "Notifications"]) expect(names, l).toContain(l); for (const l of ["Overview", "Reports", "Financials", "My association", "Bank account", "My team", "Activity log"]) expect(names, l).not.toContain(l);
  });
  it("opens what the fleet manager chooses from that page", async () => { await open(FLEET); fireEvent.click(await within((await screen.findByText("Welcome, Thabo Mokoena")).parentElement!).findByRole("button", { name: "Vehicles" })); await waitFor(() => expect(asked("/vehicles")).toBe(true)); expect(screen.queryByText("Welcome, Thabo Mokoena")).toBeNull(); });
  it("shows the fares, as before, to the owner, a co-owner and an accountant, whose access includes them", async () => {
    for (const a of [OWNER, CO, ACC]) { cleanup(); calls.length = 0; await open(a); await waitFor(() => expect(asked("/earnings")).toBe(true)); expect(screen.queryByText(/Welcome, /)).toBeNull(); expect(asked("/trend")).toBe(true); }
  });
  it("asks for nothing, and shows nothing, while it is still being found out who is signed in", async () => { withAccess(FLEET); const real = globalThis.fetch; vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (String(url).endsWith("/access") ? new Promise<Response>(() => undefined) : real(url, init))); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await new Promise((r) => setTimeout(r, 150)); expect(asked("/earnings")).toBe(false); expect(asked("/trend")).toBe(false); expect(screen.queryByText(/Welcome, /)).toBeNull(); });
  it("falls back to the figures page if who is signed in cannot be found out, because the server still decides what each person may see", async () => { const o = routes; routes = (m, p, b) => (p === `${P}/access` ? { status: 500, body: { success: false, error: "down" } } : o(m, p, b)); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await waitFor(() => expect(asked("/earnings")).toBe(true)); expect(screen.queryByText(/Welcome, /)).toBeNull(); });
});

describe("alerts on the notifications screen", () => {
  const NOTES = [
    { key: "alert-fin:due:l1:2026-11-20-aaaa1111", kind: "alert", title: "An instalment is coming up", body: "CA 111-111: a R9000.00 instalment to WesBank is due in 2 days (2026-11-20)", read: false, at: "2026-11-18T00:00:00.000Z" },
    { key: "alert-fines:unpaid-bbbb2222", kind: "alert", title: "Fines are unpaid", body: "2 fines are unpaid, R400.00 in all", read: true, at: "2026-11-18T00:00:00.000Z" },
    { key: "disc-CA 111-111", kind: "disc", title: "Licence disc for CA 111-111 expires soon", body: "It expires on 2026-11-25.", read: false, at: "2026-11-25T00:00:00.000Z" }];
  const withNotes = (notifications: any[], unread: number) => { const o = routes; routes = (m, p, b) => (p === `${P}/notifications` && m === "GET" ? { body: { success: true, notifications, unread } } : m === "POST" && p === `${P}/notifications/read` ? { body: { success: true, marked: 2 } } : o(m, p, b)); };
  const openNotes = async (a: OwnerAccess) => { withAccess(a); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 60)); fireEvent.click(within(screen.getAllByRole("list")[0]).getByRole("button", { name: /Notifications/ })); };
  it("lists each alert with its heading and sentence beside the expiry reminders, unread ones standing out", async () => {
    withNotes(NOTES, 2); await openNotes(OWNER); expect(await screen.findByText("An instalment is coming up")).toBeInTheDocument(); expect(screen.getByText("CA 111-111: a R9000.00 instalment to WesBank is due in 2 days (2026-11-20)")).toBeInTheDocument(); expect(screen.getByText("Fines are unpaid")).toBeInTheDocument(); expect(screen.getByText("2 fines are unpaid, R400.00 in all")).toBeInTheDocument(); expect(screen.getByText("Licence disc for CA 111-111 expires soon")).toBeInTheDocument();
    expect(screen.getByText("An instalment is coming up").className).toContain("font-semibold"); expect(screen.getByText("Fines are unpaid").className).not.toContain("font-semibold");
  });
  it("marks every unread one as read, by its key, when asked", async () => { withNotes(NOTES, 2); await openNotes(OWNER); fireEvent.click(await screen.findByRole("button", { name: "Mark all as read" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/notifications/read`, body: { keys: ["alert-fin:due:l1:2026-11-20-aaaa1111", "disc-CA 111-111"] } })); });
  it("says what appears there when nothing needs attention, including the alerts", async () => { withNotes([], 0); await openNotes(OWNER); expect(await screen.findByText(/Nothing needs your attention\. Reminders about expiring documents and licence discs, and things that need action \(loan instalments, fines, servicing and what your drivers owe\), appear here\./)).toBeInTheDocument(); });
  it("shows the same list to a fleet manager as the server gives them, with no money figures of its own", async () => { withNotes([NOTES[1]], 1); await openNotes(FLEET); expect(await screen.findByText("Fines are unpaid")).toBeInTheDocument(); expect(screen.queryByText(/WesBank/)).toBeNull(); });
});

describe("what a co-owner sees of the bank", () => {
  const openFor = async (a: OwnerAccess) => { withAccess(a); render(<OwnerDashboard userName="Olu" onClose={() => undefined} />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 80)); };
  const go = (label: RegExp) => fireEvent.click(within(screen.getAllByRole("list")[0]).getByRole("button", { name: label }));
  const NOTICE = /You can look at this, but not change anything: only the owner can link or change the bank account, move money or tokens, or accept or cancel an agreement\./;
  it("offers the bank, tokens and payments, asks the bank for its strip, and says on each screen that it is for looking only", async () => {
    await openFor(CO); const names = within(screen.getAllByRole("list")[0]).queryAllByRole("button").map((b) => b.textContent ?? ""); for (const l of ["Bank account", "VINK Tokens", "Payments & trips"]) expect(names.some((x) => x.includes(l)), l).toBe(true); for (const l of ["Requests & links", "My team", "Text alerts", "WhatsApp alerts"]) expect(names.some((x) => x.includes(l)), l).toBe(false);
    expect(calls.some((c) => c.path.includes("/bank"))).toBe(true); for (const l of [/Bank account/, /VINK Tokens/, /Payments & trips/]) { go(l); expect(await screen.findByRole("note"), String(l)).toHaveTextContent(NOTICE); }
  });
  it("shows the owner the same screens with no such notice, and never shows a fleet manager or an accountant the bank", async () => {
    await openFor(OWNER); go(/Bank account/); await new Promise((r) => setTimeout(r, 60)); expect(screen.queryByRole("note")).toBeNull(); cleanup(); calls.length = 0;
    for (const a of [FLEET, ACC]) { cleanup(); calls.length = 0; await openFor(a); const names = within(screen.getAllByRole("list")[0]).queryAllByRole("button").map((b) => b.textContent ?? ""); for (const l of ["Bank account", "VINK Tokens", "Payments & trips"]) expect(names.some((x) => x.includes(l)), `${a.role} ${l}`).toBe(false); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false); }
  });
});

