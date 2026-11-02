import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProductChooser } from "./ProductChooser";
import { setSession, setToken, clearSession, getSession } from "../../services/apiClient";

const asUser = (role: string) => { setToken("t"); setSession({ id: "u1", username: role + "1", name: "Thandi Nkosi", email: "t@x.co", role }); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Replies = { me?: unknown; accounts?: unknown; devices?: unknown };
const serve = (r: Replies) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  const u = String(url);
  const pick = (v: unknown) => (v === "fail" ? json({ error: { code: "x", message: "x" } }, 500) : json(v));
  if (u.endsWith("/me")) return pick(r.me ?? { id: "u1", name: "T", verified: true });
  if (u.endsWith("/bank/accounts")) return pick(r.accounts ?? { data: [{ id: "a1" }] });
  if (u.endsWith("/pos/devices")) return pick(r.devices ?? { data: [{ id: "d1" }] });
  return json({ data: [] });
}));
beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; clearSession(); });
afterEach(() => { vi.unstubAllGlobals(); clearSession(); });

const show = (props: Partial<React.ComponentProps<typeof ProductChooser>> = {}) => render(<ProductChooser isOpen onClose={() => {}} onOpen={() => {}} {...props} />);
const card = (name: string) => screen.getByRole("article", { name });

describe("choosing a product", () => {
  it("shows VINK Banking, VINK Pay and VINK Tap as three separate choices, each saying who it is for", async () => {
    asUser("customer"); serve({}); show(); expect(screen.getByRole("dialog", { name: "Choose a VINK product" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-labelledby"))).toEqual(["prod-bank", "prod-pay", "prod-tap"]);
    expect(within(card("VINK Banking")).getByText(/Everyone with a bank account/)).toBeInTheDocument(); expect(within(card("VINK Pay")).getByText(/online payments on their website/)).toBeInTheDocument(); expect(within(card("VINK Tap")).getByText(/Drivers/)).toBeInTheDocument();
  });
  it("opens the product that was chosen, and only that one", async () => {
    asUser("customer"); serve({}); const onOpen = vi.fn(); show({ onOpen });
    fireEvent.click(within(card("VINK Pay")).getByRole("button", { name: "Open VINK Pay" })); expect(onOpen).toHaveBeenLastCalledWith("pay");
    fireEvent.click(within(card("VINK Tap")).getByRole("button", { name: "Open VINK Tap" })); expect(onOpen).toHaveBeenLastCalledWith("tap");
    fireEvent.click(within(card("VINK Banking")).getByRole("button", { name: "Open VINK Banking" })); expect(onOpen).toHaveBeenLastCalledWith("bank"); expect(onOpen).toHaveBeenCalledTimes(3);
  });
  it("renders nothing while closed", () => { asUser("customer"); serve({}); const { container } = render(<ProductChooser isOpen={false} onClose={() => {}} onOpen={() => {}} />); expect(container).toBeEmptyDOMElement(); });
});

describe("what is set up on this account", () => {
  it("says what is already set up", async () => {
    asUser("customer"); serve({}); show(); await waitFor(() => expect(within(card("VINK Pay")).getByText("Verified")).toBeInTheDocument());
    expect(within(card("VINK Banking")).getByText("Set up")).toBeInTheDocument(); expect(within(card("VINK Tap")).getByText("Set up")).toBeInTheDocument();
  });
  it("says what is still to do: no bank account, not verified, no card machine", async () => {
    asUser("customer"); serve({ me: { id: "u1", name: "T", verified: false }, accounts: { data: [] }, devices: { data: [] } }); show();
    await waitFor(() => expect(within(card("VINK Pay")).getByText("Not verified yet")).toBeInTheDocument()); expect(within(card("VINK Banking")).getByText("No account yet")).toBeInTheDocument(); expect(within(card("VINK Tap")).getByText("No card machine yet")).toBeInTheDocument();
    expect(screen.getByText(/Add your verification documents/)).toBeInTheDocument(); expect(screen.getByText(/Add a card machine to start/)).toBeInTheDocument();
  });
  it("starts the bank account application for someone with no account, instead of opening an empty dashboard", async () => {
    asUser("personal"); serve({ accounts: { data: [] } }); const onOpen = vi.fn(), onApplyBank = vi.fn(); show({ onOpen, onApplyBank });
    fireEvent.click(await within(card("VINK Banking")).findByRole("button", { name: "Open a bank account" })); expect(onApplyBank).toHaveBeenCalledTimes(1); expect(onOpen).not.toHaveBeenCalled();
  });
  it("opens the banking dashboard for someone with no account when there is no application to start", async () => {
    asUser("personal"); serve({ accounts: { data: [] } }); const onOpen = vi.fn(); show({ onOpen }); fireEvent.click(await within(card("VINK Banking")).findByRole("button", { name: "Open a bank account" })); expect(onOpen).toHaveBeenCalledWith("bank");
  });
  it("lets you choose even when the status cannot be loaded: every product can still be opened, with no status shown", async () => {
    asUser("customer"); serve({ me: "fail", accounts: "fail", devices: "fail" }); const onOpen = vi.fn(); show({ onOpen }); await new Promise((r) => setTimeout(r, 30));
    for (const [n, t] of [["VINK Banking", "Set up"], ["VINK Pay", "Verified"], ["VINK Tap", "Set up"]] as const) { expect(within(card(n)).queryByText(t), n).toBeNull(); expect(within(card(n)).getByRole("button", { name: /^Open VINK|Open a bank/ })).toBeEnabled(); }
    fireEvent.click(within(card("VINK Tap")).getByRole("button", { name: "Open VINK Tap" })); expect(onOpen).toHaveBeenCalledWith("tap");
  });
});

describe("business-only services", () => {
  it("tells a personal account which services in each product are for businesses only", async () => {
    asUser("personal"); serve({}); show(); expect(screen.getByText("Personal account", { exact: false })).toBeInTheDocument();
    expect(within(card("VINK Banking")).getByText(/Business credit and funding/)).toBeInTheDocument(); expect(within(card("VINK Pay")).getByText(/Business information, owners and team/)).toBeInTheDocument(); expect(within(card("VINK Tap")).getByText(/Managing categories, products and staff/)).toBeInTheDocument();
    expect(screen.getAllByText("Business accounts only:")).toHaveLength(3);
  });
  it("does not say that to a business, which can use them", async () => {
    asUser("customer"); serve({}); show(); expect(screen.getByText("Business account", { exact: false })).toBeInTheDocument(); expect(screen.queryByText("Business accounts only:")).toBeNull();
  });
});

describe("leaving", () => {
  it("closes, and logs out (clearing the session and telling the app) from the same screen", async () => {
    asUser("customer"); serve({}); const onClose = vi.fn(), onSignOut = vi.fn(); show({ onClose, onSignOut });
    fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(onClose).toHaveBeenCalledTimes(1);
    expect(getSession()).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Log out" })); expect(getSession()).toBeNull(); expect(onSignOut).toHaveBeenCalledTimes(1); expect(onClose).toHaveBeenCalledTimes(2);
  });
});
