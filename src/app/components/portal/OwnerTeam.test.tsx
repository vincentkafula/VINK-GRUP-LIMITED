/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TeamScreen, ownerNavAllowed, type OwnerAccess } from "./OwnerTeam";
import { OwnerDashboard } from "./OwnerDashboard";
import { OwnerFinanceScreen } from "./OwnerFinance";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const MODS = ["overview", "notifications", "fleet", "driverpay", "compliance", "files", "association", "costs", "finance", "earnings", "audit"];
const access = (role: string | null, mods: Record<string, "r" | "rw">): OwnerAccess => ({ kind: role ? "team" : "owner", name: role ? "Thabo Mokoena" : null, role, roleText: role ?? "The owner", modules: Object.fromEntries(MODS.map((m) => [m, mods[m] ?? null])) as any });
const OWNER = access(null, Object.fromEntries(MODS.map((m) => [m, "rw" as const]))), CO = access("co_owner", { ...Object.fromEntries(MODS.map((m) => [m, "rw" as const])), audit: "r" }), FLEET = access("fleet_manager", { overview: "r", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", costs: "rw" }), ACC = access("accountant", { overview: "r", notifications: "rw", driverpay: "r", association: "r", costs: "r", finance: "r", earnings: "r", audit: "r" });
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
  it("shows a co-owner the business but never the bank, tokens, payments, requests or the team", () => {
    for (const l of ["Overview", "Vehicles", "Drivers", "Reports", "Financials", "Documents", "Notifications", "Driver targets", "My association", "Compliance centre", "Profit and costs", "Routes & map"]) expect(ownerNavAllowed(l, CO), l).toBe(true); for (const l of ["Driver pay", "Payments & trips", "Requests & links", "VINK Tokens", "Bank account", "My team"]) expect(ownerNavAllowed(l, CO), l).toBe(false);
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
