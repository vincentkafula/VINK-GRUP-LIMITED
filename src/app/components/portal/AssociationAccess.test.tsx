/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccessScreen, navAllowed, type Access } from "./AssociationAccess";
import { AssociationDashboard } from "./AssociationDashboard";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const DELEGATES = [
  { id: "d1", name: "Sipho Dube", username: "sipho", email: "sipho@langa.test", role: "treasurer", roleText: "Treasurer", officeBearerId: "b1", officeBearer: "Sipho Dube (Treasurer)", disabled: false, lastLogin: "2026-11-01T08:00:00Z", modules: [{ module: "overview", level: "r" }, { module: "finance", level: "rw" }, { module: "reports", level: "r" }] },
  { id: "d2", name: "Lerato Nel", username: "lerato", email: "lerato@langa.test", role: "secretary", roleText: "Secretary", officeBearerId: null, officeBearer: null, disabled: true, lastLogin: null, modules: [{ module: "discipline", level: "rw" }] }];
const MODS = ["overview", "registers", "members", "governance", "discipline", "finance", "safety", "routes", "reports", "operations"];
const access = (role: string | null, mods: Record<string, "r" | "rw">): Access => ({ kind: role ? "delegate" : "owner", name: role ? "Sipho Dube" : null, role, roleText: role ?? "Main login", officeBearerId: role ? "b1" : null, modules: Object.fromEntries(MODS.map((m) => [m, mods[m] ?? null])) as any });
const TREASURER = access("treasurer", { overview: "r", registers: "r", finance: "rw", routes: "r", reports: "r" }), SECRETARY = access("secretary", { overview: "r", registers: "rw", members: "rw", governance: "rw", discipline: "rw", safety: "rw", routes: "r", reports: "r", operations: "rw" }), VIEWER = access("viewer", { overview: "r", registers: "r", routes: "r", reports: "r" }), OWNER = access(null, Object.fromEntries(MODS.map((m) => [m, "rw" as const])));
beforeEach(() => {
  calls = []; routes = (m, p) => {
    if (p === `${P}/delegates` && m === "GET") return { body: { success: true, delegates: DELEGATES } }; if (p === `${P}/compliance/office-bearers`) return { body: { success: true, officeBearers: [{ id: "b1", name: "Sipho Dube", office: "Treasurer" }, { id: "b2", name: "Lerato Nel", office: "Secretary" }] } };
    if (m === "POST" && p === `${P}/delegates`) return { status: 201, body: { success: true, id: "new", username: "thabo", temporaryPassword: "Abcdefghjkmnpq-4821" } }; if (p.endsWith("/reset-password")) return { body: { success: true, id: "d1", username: "sipho", temporaryPassword: "Zyxwvutsrqpnmk-7310" } };
    if (m === "POST" || m === "PUT" || m === "DELETE") return { body: { success: true } }; return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("which menu items a person may see", () => {
  it("shows the main login everything, and a delegate only the modules their role allows", () => {
    for (const l of ["Compliance", "Discipline", "Bank account", "Commission", "Office bearers' logins", "Email digest", "Anything"]) expect(navAllowed(l, OWNER), l).toBe(true);
    for (const a of [TREASURER, SECRETARY]) expect(navAllowed("Email digest", a)).toBe(false);                  // the digest gathers every module in one email, so only the main login has it
    expect(["Compliance", "Finance", "Fees & receipts", "Registration", "Reports", "Route control", "Levies"].map((l) => navAllowed(l, TREASURER))).toEqual([true, true, true, true, true, true, true]); expect(["Discipline", "Safety", "Member register", "Governance", "Operations", "Owners", "Bank account", "Commission", "Office bearers' logins", "VINK Tokens"].map((l) => navAllowed(l, TREASURER))).toEqual(Array(10).fill(false));
    expect(["Discipline", "Safety", "Member register", "Formalisation", "Governance", "Registration", "Owners", "Approvals", "Reports"].map((l) => navAllowed(l, SECRETARY))).toEqual(Array(9).fill(true)); expect(["Finance", "Levies", "Statements", "Bank account", "Office bearers' logins"].map((l) => navAllowed(l, SECRETARY))).toEqual(Array(5).fill(false));
    expect(["Compliance", "Registration", "Vehicle register", "Route control", "Reports"].map((l) => navAllowed(l, VIEWER))).toEqual(Array(5).fill(true)); expect(["Finance", "Discipline", "Safety", "Member register", "Governance", "Owners"].map((l) => navAllowed(l, VIEWER))).toEqual(Array(6).fill(false));
  });
  it("shows only the way in until it is known who is signed in", () => { expect(navAllowed("Compliance", null)).toBe(true); expect(navAllowed("Finance", null)).toBe(false); expect(navAllowed("Discipline", null)).toBe(false); });
});

describe("the dashboard's menu for each person", () => {
  const menu = async (a: Access | null) => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/access` ? (a ? { body: { success: true, ...a } } : { status: 500, body: { success: false, error: "x" } }) : o(m, p, b)))(routes); render(<AssociationDashboard userName="Association" onClose={() => undefined} />); await waitFor(() => expect(calls.some((c) => c.path === `${P}/access`)).toBe(true)); await new Promise((r) => setTimeout(r, 50)); const nav = screen.getAllByRole("list")[0]; return within(nav).queryAllByRole("button").map((b) => b.textContent ?? ""); };
  it("gives the main login every item, including the logins and the bank", async () => { const m = await menu(OWNER); for (const l of ["Compliance", "Discipline", "Safety", "Finance", "Member register", "Office bearers' logins", "Bank account", "Commission"]) expect(m.some((x) => x.includes(l)), l).toBe(true); });
  it("gives a treasurer finance and the registers and reports to read, and none of the sensitive modules, the bank or the logins", async () => { const m = await menu(TREASURER); for (const l of ["Compliance", "Finance", "Fees & receipts", "Registration", "Reports"]) expect(m.some((x) => x.includes(l)), l).toBe(true); for (const l of ["Discipline", "Safety", "Member register", "Governance", "Bank account", "Commission", "Office bearers", "VINK Tokens"]) expect(m.some((x) => x.includes(l)), l).toBe(false); });
  it("gives a secretary the sensitive modules but not finance, and a viewer only what is read-only", async () => { const s = await menu(SECRETARY); for (const l of ["Discipline", "Safety", "Member register", "Governance"]) expect(s.some((x) => x.includes(l)), l).toBe(true); for (const l of ["Finance", "Bank account"]) expect(s.some((x) => x.includes(l)), l).toBe(false); cleanup(); const v = await menu(VIEWER); expect(v.some((x) => x.includes("Reports"))).toBe(true); for (const l of ["Finance", "Discipline", "Safety", "Member register"]) expect(v.some((x) => x.includes(l)), l).toBe(false); });
  it("never asks the bank for anything when a delegate is signed in, nor while it is not yet known who is signed in, but does for the main login", async () => {
    await menu(TREASURER); await new Promise((r) => setTimeout(r, 80)); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false); cleanup(); calls = []; await menu(null); await new Promise((r) => setTimeout(r, 80)); expect(calls.some((c) => c.path.includes("/bank"))).toBe(false);
    cleanup(); calls = []; await menu(OWNER); await waitFor(() => expect(calls.some((c) => c.path.includes("/bank"))).toBe(true));
  });
  it("shows only the way in while it is not known who is signed in", async () => { const m = await menu(null); expect(m.some((x) => x.includes("Compliance"))).toBe(true); expect(m.some((x) => x.includes("Finance"))).toBe(false); });
});

describe("the logins screen", () => {
  it("explains the roles and that the bank, payroll and these logins stay with the main login", async () => {
    render(<AccessScreen />); expect(await screen.findByText(/Everything about the association except its bank and payroll/)).toBeInTheDocument(); expect(screen.getByText(/Not discipline, safety or member identities/)).toBeInTheDocument(); expect(screen.getByText(/stay with your own login alone, whatever role you give/)).toBeInTheDocument();
  });
  it("lists each login with their role, office bearer record, last sign-in, whether switched off, and what they can see", async () => {
    render(<AccessScreen />); const li = (await screen.findByText("Sipho Dube", { selector: "b" })).closest("li")!; expect(li).toHaveTextContent("sipho · sipho@langa.test · Sipho Dube (Treasurer) · last signed in"); expect(li).toHaveTextContent("Can see: overview (read), finance, reports (read)"); expect(screen.getByLabelText("Role of Sipho Dube")).toHaveValue("treasurer");
    const l2 = screen.getByText("Lerato Nel", { selector: "b" }).closest("li")!; expect(l2).toHaveTextContent("not linked to an office bearer · has not signed in yet"); expect(within(l2).getByText("Switched off")).toBeInTheDocument(); expect(within(l2).getByRole("button", { name: "Switch on" })).toBeInTheDocument();
  });
  it("changes a role, and switches a login off or on", async () => {
    render(<AccessScreen />); await screen.findByText("Sipho Dube", { selector: "b" }); pick("Role of Sipho Dube", "viewer"); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/delegates/d1/role`, body: { role: "viewer" } }));
    fireEvent.click(within(screen.getByText("Sipho Dube", { selector: "b" }).closest("li")!).getByRole("button", { name: "Switch off" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/delegates/d1/active`, body: { active: false } })); fireEvent.click(within(screen.getByText("Lerato Nel", { selector: "b" }).closest("li")!).getByRole("button", { name: "Switch on" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/delegates/d2/active`, body: { active: true } }));
  });
  it("creates a login and shows the one-time password, with a warning that it is shown only now, until it is dismissed", async () => {
    render(<AccessScreen />); await screen.findByText("Sipho Dube", { selector: "b" }); pick("Login name", "Thabo Mokoena"); pick("Login email", "thabo@langa.test"); pick("Login username", "thabo"); pick("Login role", "chairperson"); pick("Login office bearer", "b2"); fireEvent.click(screen.getByRole("button", { name: "Create login" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/delegates`, body: { name: "Thabo Mokoena", email: "thabo@langa.test", username: "thabo", role: "chairperson", officeBearerId: "b2" } }));
    const a = await screen.findByRole("alert"); expect(a).toHaveTextContent("A password for Thabo Mokoena: it is shown only now."); expect(a).toHaveTextContent("Username thabo · password Abcdefghjkmnpq-4821"); expect(a).toHaveTextContent("It is not kept anywhere you can look it up again"); expect(screen.getByLabelText("Login name")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "I have passed it on" })); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("sends no office bearer when none is chosen, and shows the server's reason when a login is refused", async () => {
    render(<AccessScreen />); await screen.findByText("Sipho Dube", { selector: "b" }); pick("Login name", "X"); pick("Login email", "x@y.test"); pick("Login username", "someone"); fireEvent.click(screen.getByRole("button", { name: "Create login" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ name: "X", email: "x@y.test", username: "someone", role: "secretary" }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/delegates` ? { status: 409, body: { success: false, error: "That username is taken" } } : o(m, p, b)))(routes); pick("Login name", "Y"); pick("Login email", "y@y.test"); pick("Login username", "sipho"); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect(await screen.findByText("That username is taken")).toBeInTheDocument();
  });
  it("resets a password and shows the new one-time password", async () => {
    render(<AccessScreen />); fireEvent.click(within((await screen.findByText("Sipho Dube", { selector: "b" })).closest("li")!).getByRole("button", { name: "Reset password" })); const a = await screen.findByRole("alert"); expect(a).toHaveTextContent("A password for Sipho Dube: it is shown only now."); expect(a).toHaveTextContent("password Zyxwvutsrqpnmk-7310"); expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/delegates/d1/reset-password` });
  });
  it("says no office bearer has a login yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/delegates` && m === "GET" ? { body: { success: true, delegates: [] } } : o(m, p, b)))(routes); render(<AccessScreen />); expect(await screen.findByText("No office bearer has their own login yet.")).toBeInTheDocument(); });
});

describe("inviting an office bearer by email", () => {
  const withInvites = (available: boolean) => { const o = routes; routes = (m, p, b) => (p === `${P}/delegates` && m === "GET" ? { body: { success: true, delegates: DELEGATES, invitationsAvailable: available } } : m === "POST" && p === `${P}/delegates` && b?.invite ? { status: 201, body: { success: true, id: "new", username: "thabo", invited: true } } : o(m, p, b)); };
  const fillNew = () => { pick("Login name", "Thabo Mokoena"); pick("Login email", "thabo@langa.test"); pick("Login username", "thabo"); pick("Login role", "chairperson"); };
  it("offers it, ticked, when email is set up, and says what it means", async () => { withInvites(true); render(<AccessScreen />); const box = await screen.findByRole("checkbox", { name: /Email them an invitation/ }); expect(box).toBeChecked(); expect(screen.getByText(/so they choose their own password\. Nothing is passed on to them by you/)).toBeInTheDocument(); });
  it("does not offer it when email is not set up, and gives a one-time password as before", async () => { withInvites(false); render(<AccessScreen />); await screen.findByText("Sipho Dube", { selector: "b" }); expect(screen.queryByRole("checkbox", { name: /Email them an invitation/ })).toBeNull(); expect(screen.queryByRole("button", { name: /Resend the invitation/ })).toBeNull(); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect((await screen.findByRole("alert")).textContent).toContain("Abcdefghjkmnpq-4821"); expect(writes().at(-1)!.body.invite).toBeUndefined(); });
  it("sends the invitation, says where it went, shows no password and clears the form", async () => {
    withInvites(true); render(<AccessScreen />); await screen.findByRole("checkbox", { name: /Email them an invitation/ }); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/delegates`, body: { name: "Thabo Mokoena", email: "thabo@langa.test", username: "thabo", role: "chairperson", invite: true } }));
    expect(await screen.findByText("We emailed an invitation to thabo@langa.test. They choose their own password, so you have nothing to pass on.")).toBeInTheDocument(); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByLabelText("Login name")).toHaveValue("");
  });
  it("gives a one-time password instead when unticked, and shows the server's reason when the invitation cannot be sent", async () => {
    withInvites(true); render(<AccessScreen />); fireEvent.click(await screen.findByRole("checkbox", { name: /Email them an invitation/ })); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect((await screen.findByRole("alert")).textContent).toContain("Abcdefghjkmnpq-4821"); expect(writes().at(-1)!.body.invite).toBeUndefined(); cleanup();
    withInvites(true); const o = routes; routes = (m, p, b) => (m === "POST" && p === `${P}/delegates` ? { status: 502, body: { success: false, error: "The invitation could not be emailed: check the address and try again" } } : o(m, p, b)); render(<AccessScreen />); await screen.findByRole("checkbox", { name: /Email them an invitation/ }); fillNew(); fireEvent.click(screen.getByRole("button", { name: "Create login" })); expect(await screen.findByText(/The invitation could not be emailed/)).toBeInTheDocument();
  });
  it("offers to resend only to someone who has not signed in yet, and only when email is set up", async () => {
    withInvites(true); render(<AccessScreen />); await screen.findByText("Lerato Nel", { selector: "b" }); expect(screen.getByRole("button", { name: "Resend the invitation to Lerato Nel" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Resend the invitation to Sipho Dube" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resend the invitation to Lerato Nel" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/delegates/d2/invite`, body: undefined })); expect(await screen.findByText("We emailed Lerato Nel a new link. The old one no longer works.")).toBeInTheDocument();
  });
});

