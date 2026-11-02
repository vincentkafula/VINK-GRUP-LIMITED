import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ManshyaDashboard } from "./ManshyaDashboard";
import { setSession, setToken, clearSession } from "../../services/apiClient";

const asUser = (role: string) => { setToken("t"); setSession({ id: "u1", username: role + "1", name: "Thandi Nkosi", email: "t@x.co", role }); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ACCOUNTS = [{ id: "acc_1", name: "Main", number: "1234567890", kind: "current" }, { id: "acc_2", name: "Takings", number: "9876543210", kind: "current" }];
let chosen: string | null, accounts: unknown[], puts: Record<string, unknown>[], putStatus: number;
const settlement = () => { const a = ACCOUNTS.find((x) => x.id === (chosen ?? (accounts.length ? "acc_1" : ""))); return a && accounts.length ? { mode: "bank_account", chosen: !!chosen, account: { ...a, balance: 0 } } : { mode: "payments_balance", chosen: false, account: null }; };
// The pop-up layer uses the browser's own <dialog> (showModal and close), which the test environment does not implement: a stand-in that opens, and closes with the close event the real one fires.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; clearSession(); chosen = null; accounts = ACCOUNTS; puts = []; putStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET";
    if (u.endsWith("/me")) return json({ id: "u1", name: "T", verified: true });
    if (u.endsWith("/settings")) return json({ display: {}, payment_methods: {}, home: {} });
    if (u.endsWith("/notifications")) return json({ unread: 0, data: [] });
    if (u.includes("/dashboard/pos")) return json({ today: { sales: 0, transactions: 0, declined: 0, fees: 0 }, devices: [], settlement: settlement() });
    if (u.endsWith("/bank/accounts")) return json({ data: accounts });
    if (u.endsWith("/pos/settlement") && method === "PUT") { const body = JSON.parse(String(init?.body)); puts.push(body); if (putStatus !== 200) return json({ error: { code: "not_found", message: "No such account" } }, putStatus); chosen = body.accountId; return json(settlement()); }
    return json({ data: [] });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); clearSession(); });

const open = async (role = "customer") => { asUser(role); render(<ManshyaDashboard isOpen product="tap" onClose={() => {}} />); return await screen.findByLabelText("Where your takings go"); };

describe("where card machine takings go, on the VINK Tap dashboard", () => {
  it("says the takings go straight into the named VINK bank account, not into a payments balance", async () => {
    const box = await open(); await waitFor(() => expect(within(box).getByText("Main")).toBeInTheDocument());
    expect(box.textContent).toMatch(/goes straight into your VINK bank account, Main \(account 1234567890\), not into a payments balance/); expect(box.textContent).toMatch(/until you are verified a part is held back as a reserve/);
  });
  it("is shown to a personal account too, since a driver is often one", async () => { const box = await open("personal"); await waitFor(() => expect(within(box).getByText("Main")).toBeInTheDocument()); });
  it("lets the person choose another of their accounts, saves exactly that, and then shows it", async () => {
    const box = await open(); await waitFor(() => expect(within(box).getByText("Main")).toBeInTheDocument());
    fireEvent.click(within(box).getByText("Change")); const dialog = await screen.findByText("Where should your card machine takings go?"); expect(dialog).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("VINK bank account"), { target: { value: "acc_2" } }); fireEvent.click(screen.getByText("Save", { selector: "button" }));
    await waitFor(() => expect(puts).toEqual([{ accountId: "acc_2" }])); await waitFor(() => expect(within(screen.getByLabelText("Where your takings go")).getByText("Takings")).toBeInTheDocument());
  });
  it("changes nothing when the person cancels", async () => {
    const box = await open(); await waitFor(() => expect(within(box).getByText("Main")).toBeInTheDocument()); fireEvent.click(within(box).getByText("Change")); await screen.findByText("Where should your card machine takings go?");
    fireEvent.click(screen.getByText("Cancel", { selector: "button" })); await waitFor(() => expect(screen.queryByText("Where should your card machine takings go?")).toBeNull()); expect(puts).toEqual([]); expect(within(screen.getByLabelText("Where your takings go")).getByText("Main")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 60)); expect(document.body.textContent).not.toMatch(/Cannot read|undefined|TypeError/);       // and cancelling is not an error
  });
  it("shows what the server said, and keeps the old account, when saving is refused", async () => {
    putStatus = 404; const box = await open(); await waitFor(() => expect(within(box).getByText("Main")).toBeInTheDocument()); fireEvent.click(within(box).getByText("Change")); await screen.findByText("Where should your card machine takings go?");
    fireEvent.change(screen.getByLabelText("VINK bank account"), { target: { value: "acc_2" } }); fireEvent.click(screen.getByText("Save", { selector: "button" }));
    expect(await screen.findByText("No such account")).toBeInTheDocument(); expect(within(screen.getByLabelText("Where your takings go")).getByText("Main")).toBeInTheDocument();
  });
  it("says plainly when there is no VINK bank account yet, that takings wait in the payments balance, and where to open one", async () => {
    accounts = []; const box = await open(); await waitFor(() => expect(box.textContent).toMatch(/You do not have a VINK bank account yet, so your takings wait in your payments balance/));
    expect(within(box).queryByText("Change")).toBeNull(); expect(within(box).queryByText("Choose an account")).toBeNull(); expect(box.textContent).toMatch(/Open a VINK bank account in VINK Banking and your takings will go straight into it/); expect(puts).toEqual([]);      // nothing to choose, so no dead-end link: it points to where an account is opened
  });
});
