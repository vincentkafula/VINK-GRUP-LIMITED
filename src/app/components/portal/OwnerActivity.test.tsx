/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActivityScreen } from "./OwnerActivity";

type Reply = { status?: number; body: unknown; file?: boolean };
let routes: (method: string, path: string) => Reply | undefined, calls: { method: string; path: string }[];
const P = "/api/portal/owner";
const E = (id: string, o: any = {}) => ({ id, at: "2026-11-11T08:00:00Z", actorId: "u1", actor: "Thabo Mokoena", actorRole: "Fleet manager", group: "money", action: "owner.cost.add", text: "Wrote down a fuel cost of R600.00", ...o });
const PEOPLE = [{ id: "o1", name: "Olu Owner", role: "owner", roleText: "The owner" }, { id: "u1", name: "Thabo Mokoena", role: "fleet_manager", roleText: "Fleet manager" }];
const GROUPS = [{ key: "money", label: "Money: payments, targets, costs, fines, loans, dues" }, { key: "fleet", label: "Vehicles, drivers, devices and servicing" }, { key: "documents", label: "Documents and compliance" }, { key: "team", label: "The team" }, { key: "exports", label: "Downloads" }];
const PAGE1 = { success: true, entries: [E("a3", { actor: "Olu Owner", actorRole: "The owner", text: "Wrote down an insurance cost of R200.00" }), E("a2", { text: "Recorded a R300.00 payment from a driver for CA 111-111 (cash)" }), E("a1", { group: "team", text: "Gave a new login to anele as accountant" })], next: "2026-11-10T08:00:00Z|a1", people: PEOPLE, groups: GROUPS };

beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => { if (p.includes("/audit.csv")) return { body: "x", file: true }; if (p.startsWith(`${P}/audit`)) return p.includes("before=") ? { body: { ...PAGE1, entries: [E("a0", { group: "documents", text: "Opened a stored document" })], next: null } } : { body: PAGE1 }; return undefined; };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET"; calls.push({ method, path });
    const r = routes(method, path); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + path }), { status: 500 }); if (r.file) return new Response("x", { status: 200, headers: { "content-type": "text/csv" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const last = () => calls.filter((c) => c.path.startsWith(`${P}/audit`) && !c.path.includes(".csv")).at(-1)!.path;

describe("the activity log", () => {
  it("says what it is: a record to look at that cannot be changed, and how a mistake is put right", async () => { render(<ActivityScreen />); expect(await screen.findByText(/It is for looking: it cannot be changed\. If something was done by mistake, it is put right with a new entry/)).toBeInTheDocument(); });
  it("lists each line in plain words with who did it, their role and when, and a label for the kind", async () => {
    render(<ActivityScreen />); const a = (await screen.findByText("Wrote down an insurance cost of R200.00")).closest("li")!; expect(a).toHaveTextContent("Olu Owner (The owner)"); expect(a).toHaveTextContent("Money"); const b = screen.getByText("Recorded a R300.00 payment from a driver for CA 111-111 (cash)").closest("li")!; expect(b).toHaveTextContent("Thabo Mokoena (Fleet manager)"); expect(screen.getByText("Gave a new login to anele as accountant").closest("li")).toHaveTextContent("The team");
    expect(screen.getAllByRole("listitem").map((l) => l.textContent?.slice(0, 5))).toEqual(["Money", "Money", "The t"]);
  });
  it("has nothing to change or remove: only filters, a download and 'show older'", async () => { render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); expect(screen.getAllByRole("button").map((b) => b.textContent).sort()).toEqual(["Download as a spreadsheet", "Show older activity"]); expect(screen.queryByRole("button", { name: /delete|remove|edit|cancel|void/i })).toBeNull(); });
  it("says when nothing was done in the time chosen", async () => { routes = (m, p) => (p.startsWith(`${P}/audit`) ? { body: { ...PAGE1, entries: [], next: null } } : undefined); render(<ActivityScreen />); expect(await screen.findByText("Nothing was done in this time.")).toBeInTheDocument(); });
  it("shows the server's reason when it cannot be read", async () => { routes = () => ({ status: 403, body: { success: false, error: "The fleet manager role does not have access to that" } }); render(<ActivityScreen />); expect(await screen.findByText(/does not have access to that/)).toBeInTheDocument(); });

  it("offers each kind and each person, with their role, and asks again with the choice", async () => {
    render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); expect(screen.getByRole("option", { name: "Thabo Mokoena (Fleet manager)" })).toBeInTheDocument(); expect(screen.getByRole("option", { name: "Olu Owner (The owner)" })).toBeInTheDocument(); expect(screen.getByRole("option", { name: "Documents and compliance" })).toBeInTheDocument();
    pick("Activity kind", "money"); await waitFor(() => expect(last()).toBe(`${P}/audit?group=money`)); pick("Activity person", "u1"); await waitFor(() => expect(last()).toBe(`${P}/audit?group=money&actorId=u1`)); pick("Activity from", "2026-11-01"); pick("Activity to", "2026-11-30"); await waitFor(() => expect(last()).toBe(`${P}/audit?group=money&actorId=u1&from=2026-11-01&to=2026-11-30`));
    pick("Activity kind", ""); await waitFor(() => expect(last()).toBe(`${P}/audit?actorId=u1&from=2026-11-01&to=2026-11-30`));
  });
  it("shows older activity below the rest, once, and stops offering it at the end", async () => {
    render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); fireEvent.click(screen.getByRole("button", { name: "Show older activity" })); expect(await screen.findByText("Opened a stored document")).toBeInTheDocument(); expect(last()).toBe(`${P}/audit?before=2026-11-10T08%3A00%3A00Z%7Ca1`); expect(screen.getAllByRole("listitem")).toHaveLength(4); expect(screen.getByText("Wrote down an insurance cost of R200.00")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Show older activity" })).toBeNull();
  });
  it("keeps the filter when showing older activity, and starts afresh when the filter changes", async () => {
    render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); pick("Activity kind", "money"); await waitFor(() => expect(last()).toBe(`${P}/audit?group=money`)); await screen.findByText("Wrote down an insurance cost of R200.00"); fireEvent.click(screen.getByRole("button", { name: "Show older activity" })); await screen.findByText("Opened a stored document"); expect(last()).toBe(`${P}/audit?group=money&before=2026-11-10T08%3A00%3A00Z%7Ca1`);
    pick("Activity kind", "team"); await waitFor(() => expect(last()).toBe(`${P}/audit?group=team`)); await waitFor(() => expect(screen.queryByText("Opened a stored document")).toBeNull()); expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  it("shows the server's reason, and keeps what is shown, when older activity cannot be loaded", async () => {
    render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); const o = routes; routes = (m, p) => (p.includes("before=") ? { status: 400, body: { success: false, error: "That page marker is not valid" } } : o(m, p)); fireEvent.click(screen.getByRole("button", { name: "Show older activity" })); expect(await screen.findByRole("alert")).toHaveTextContent("That page marker is not valid"); expect(screen.getAllByRole("listitem")).toHaveLength(3); expect(screen.getByRole("button", { name: "Show older activity" })).not.toBeDisabled();
  });
  it("downloads the spreadsheet for the same filters", async () => {
    render(<ActivityScreen />); await screen.findByText("Wrote down an insurance cost of R200.00"); fireEvent.click(screen.getByRole("button", { name: "Download as a spreadsheet" })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/audit.csv`)); pick("Activity person", "u1"); pick("Activity from", "2026-11-01"); await waitFor(() => expect(last()).toBe(`${P}/audit?actorId=u1&from=2026-11-01`)); fireEvent.click(screen.getByRole("button", { name: "Download as a spreadsheet" })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/audit.csv?actorId=u1&from=2026-11-01`));
  });
});
