import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../manshya/ManshyaDashboard", () => ({ ManshyaDashboard: (p: { initialMode?: string; onClose: () => void }) => <div data-testid="manshya" data-mode={p.initialMode}><button onClick={p.onClose}>close banking</button></div> }));
vi.mock("./TokensPanel", () => ({ TokensPanel: () => <div>TOKENS PANEL</div> }));

import { PersonalDashboard } from "./PersonalDashboard";

type Reply = { status?: number; body: unknown } | ((init?: RequestInit) => { status?: number; body: unknown });
let routes: Record<string, Reply>; let calls: { url: string; method: string; body?: unknown }[];
const HOME = {
  total: 1254000,
  accounts: [{ id: "a1", name: "Everyday account", number: "1000123456", balance: 1004000 }, { id: "a2", name: "Savings", number: "2000987654", balance: 250000 }],
  activity: [{ date: "2026-10-10T08:00:00Z", kind: "transfer", memo: "Rent to landlord", amount: -450000, account: "Everyday account" }, { date: "2026-10-09T08:00:00Z", kind: "deposit", memo: "Salary", amount: 1200000, account: "Everyday account" }],
  cards: [{ id: "c1", brand: "VINK Visa", last4: "4521", status: "active", limit: 5000000 }, { id: "c2", brand: "VINK Debit", last4: "8834", status: "cancelled", limit: 100000 }],
};
const STATEMENT = { data: [{ date: "2026-10-10T08:00:00Z", kind: "transfer", memo: "Rent to landlord", amount: -450000, balance: 1004000 }, { date: "2026-10-09T08:00:00Z", kind: "deposit", memo: "Salary", amount: 1200000, balance: 1454000 }] };
const PROFILE = { success: true, user: { name: "Thandi Nkosi", email: "t@example.com", username: "thandi" }, profile: { phone: "082 000 0000", homeArea: null, favouriteRoute: null, emergencyContactName: null, emergencyContactPhone: null } };

beforeEach(() => {
  calls = []; routes = { "GET /api/vink/dashboard/bank": { body: HOME }, "GET /api/vink/bank/accounts/a1/statement?limit=25": { body: STATEMENT }, "GET /api/portal/personal/profile": { body: PROFILE } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""); const method = init?.method ?? "GET"; calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = routes[`${method} ${path}`]; if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    const x = typeof r === "function" ? r(init) : r; return new Response(JSON.stringify(x.body), { status: x.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = () => render(<PersonalDashboard userName="Thandi" onClose={() => {}} />);
const tab = (name: string) => fireEvent.click(screen.getAllByRole("button", { name }).find((b) => b.textContent?.trim() === name)!);

describe("the personal dashboard: accounts", () => {
  it("opens on your accounts, with the total, each account, recent activity and cards", async () => {
    open();
    expect(await screen.findByText("R 12,540.00")).toBeTruthy(); expect(screen.getByText("Across 2 accounts")).toBeTruthy();
    expect(screen.getByText("Everyday account")).toBeTruthy(); expect(screen.getByText("R 10,040.00")).toBeTruthy(); expect(screen.getByText("·· 3456")).toBeTruthy();
    const activity = screen.getByRole("list", { name: "Recent activity" }); expect(activity.textContent).toContain("Rent to landlord"); expect(activity.textContent).toContain("− R 4,500.00"); expect(activity.textContent).toContain("+ R 12,000.00");
    expect(screen.getByText(/VINK Visa ·· 4521/)).toBeTruthy(); expect(screen.getByText("Limit R 50,000.00")).toBeTruthy();
  });
  it("no longer has a Trips tab (travel features moved out of VINK-GRUP), and keeps the other tabs", async () => {
    open(); await screen.findByText("R 12,540.00");
    const names = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(names).not.toContain("Trips"); for (const t of ["Accounts", "Payments & banking", "VINK Tokens", "Profile", "Support"]) expect(names, t).toContain(t);
  });
  it("shows an account's statement when asked, and hides it again", async () => {
    open(); await screen.findByText("R 12,540.00");
    fireEvent.click(screen.getAllByRole("button", { name: "View statement" })[0]);
    const st = await screen.findByLabelText("Statement for Everyday account"); await waitFor(() => expect(st.textContent).toContain("Salary")); expect(st.textContent).toContain("R 14,540.00");
    expect(calls.some((c) => c.url === "/api/vink/bank/accounts/a1/statement?limit=25")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hide statement" })); expect(screen.queryByLabelText("Statement for Everyday account")).toBeNull();
  });
  it("freezes an active card and shows it frozen; a cancelled card has no button", async () => {
    let status = "active";
    routes["GET /api/vink/dashboard/bank"] = () => ({ body: { ...HOME, cards: [{ ...HOME.cards[0], status }, HOME.cards[1]] } });
    routes["PATCH /api/vink/bank/cards/c1"] = (init) => { status = JSON.parse(String(init!.body)).status; return { body: { ok: true } }; };
    open(); await screen.findByText(/VINK Visa ·· 4521/);
    expect(screen.getAllByRole("button", { name: /(Freeze|Unfreeze) card/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Freeze card" }));
    expect(await screen.findByRole("button", { name: "Unfreeze card" })).toBeTruthy();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/vink/bank/cards/c1", body: { status: "frozen" } });
  });
  it("says so when there are no accounts yet, instead of an empty page", async () => {
    routes["GET /api/vink/dashboard/bank"] = { body: { total: 0, accounts: [], activity: [], cards: [] } };
    open(); expect(await screen.findByText(/You do not have a bank account yet/)).toBeTruthy(); expect(screen.getByText("No accounts yet")).toBeTruthy(); expect(screen.getByText("Nothing has moved yet.")).toBeTruthy();
  });
  it("does not crash on an empty or unreadable answer: it says it could not read the accounts", async () => {
    routes["GET /api/vink/dashboard/bank"] = { body: {} };                                           // what the banking client returns for an empty or non-JSON reply
    open(); expect((await screen.findByRole("alert")).textContent).toContain("could not read your accounts");
    cleanup(); routes["GET /api/vink/dashboard/bank"] = { body: { total: 5000 } };                    // accounts missing
    open(); expect((await screen.findByRole("alert")).textContent).toContain("could not read your accounts");
  });
  it("copes with a total and lists that are missing from an otherwise good answer", async () => {
    routes["GET /api/vink/dashboard/bank"] = { body: { accounts: [HOME.accounts[0]] } };
    open(); expect(await screen.findByText("Across 1 account")).toBeTruthy(); expect(screen.getByText("R 0.00")).toBeTruthy(); expect(screen.getByText("Nothing has moved yet.")).toBeTruthy(); expect(screen.queryByText("Your cards")).toBeNull();
  });
  it("shows the server's reason when the accounts cannot be loaded", async () => {
    routes["GET /api/vink/dashboard/bank"] = { status: 403, body: { error: { code: "customer_only", message: "This dashboard is for customer accounts." } } };
    open(); expect((await screen.findByRole("alert")).textContent).toContain("This dashboard is for customer accounts.");
  });
});

describe("the personal dashboard: the rest", () => {
  it("opens the banking dashboard straight on banking, from the button and from the tab, and returns to accounts when it closes", async () => {
    open(); await screen.findByText("R 12,540.00");
    fireEvent.click(screen.getByRole("button", { name: "Send money and more" })); expect((await screen.findByTestId("manshya")).getAttribute("data-mode")).toBe("bank");
    fireEvent.click(screen.getByRole("button", { name: "close banking" })); await waitFor(() => expect(screen.queryByTestId("manshya")).toBeNull()); expect(await screen.findByText("R 12,540.00")).toBeTruthy();
    tab("Payments & banking"); expect((await screen.findByTestId("manshya")).getAttribute("data-mode")).toBe("bank");
  });
  it("still shows the profile, tokens and support", async () => {
    routes["GET /api/portal/personal/support"] = { body: { success: true, requests: [] } };
    open(); await screen.findByText("R 12,540.00");
    tab("Profile"); expect(await screen.findByText("Thandi Nkosi")).toBeTruthy();
    tab("VINK Tokens"); expect(await screen.findByText("TOKENS PANEL")).toBeTruthy();
    tab("Support"); expect(await screen.findByText("Contact support")).toBeTruthy();
  });
});
