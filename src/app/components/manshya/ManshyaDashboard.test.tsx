import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ManshyaDashboard } from "./ManshyaDashboard";
import { ManshyaAdmin } from "./ManshyaAdmin";
import { setSession, setToken, clearSession } from "../../services/apiClient";

const asUser = (role: string) => { setToken("test-token"); setSession({ id: "u1", username: role + "1", name: "Test " + role, email: "t@x.co", role }); };

let calls: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;   // jsdom does not implement it (used by the body scroll lock)
  calls = [];
  clearSession();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    const u = String(url);
    if (u.endsWith("/me")) return json({ id: "u1", name: "Test customer", verified: false, role: "owner" });
    if (u.endsWith("/settings")) return json({ display: { theme: "system" }, payment_methods: { card: true, eft: true, qr: true }, home: {} });
    if (u.endsWith("/notifications")) return json({ unread: 2, data: [] });
    if (u.includes("/dashboard/online")) return json({
      month: "2026-10", previous_month: "2026-09", stats: { unique_shoppers: 3, total_transactions: 4, total_amount: 150000, avg_value: 37500 },
      balance: { total: 100000, retained: 10000, available: 90000, payout_fee: 850, available_for_payout: 89150 }, series: { current: [], previous: [] }, recent: [],
    });
    return json({ data: [] });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); clearSession(); });

describe("ManshyaDashboard access", () => {
  it("shows nothing when closed", () => {
    asUser("customer");
    const { container } = render(<ManshyaDashboard isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("customers see their dashboard", async () => {
    asUser("customer");
    render(<ManshyaDashboard isOpen onClose={() => {}} />);
    expect(await screen.findByText(/Welcome back, Test/)).toBeInTheDocument();
    expect(screen.getByText("manshya pay")).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.endsWith("/api/manshya/me"))).toBe(true));
  });

  it.each(["owner", "superadmin", "noc_engineer", "billing_admin", "seller"])("a %s account is turned away without any API call", (role) => {
    asUser(role);
    render(<ManshyaDashboard isOpen onClose={() => {}} />);
    expect(screen.getByText("Customer sign-in required")).toBeInTheDocument();
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("signed-out visitors are turned away", () => {
    render(<ManshyaDashboard isOpen onClose={() => {}} />);
    expect(screen.getByText("Customer sign-in required")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("'Sign in' clears the session, closes, and reports sign-out", () => {
    asUser("noc_engineer");
    const onClose = vi.fn(), onSignOut = vi.fn();
    render(<ManshyaDashboard isOpen onClose={onClose} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByText("Sign in"));
    expect(onClose).toHaveBeenCalled();
    expect(onSignOut).toHaveBeenCalled();
    expect(localStorage.getItem("vink_jwt")).toBeNull();
  });
});

describe("ManshyaAdmin access", () => {
  it("turns customers away", () => {
    asUser("customer");
    render(<ManshyaAdmin isOpen onClose={() => {}} />);
    expect(screen.getByText("Staff sign-in required")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("lets staff in", async () => {
    asUser("superadmin");
    render(<ManshyaAdmin isOpen onClose={() => {}} />);
    expect(screen.queryByText("Staff sign-in required")).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.endsWith("/api/manshya/admin/overview"))).toBe(true));
  });
});
