/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MyAssociationScreen } from "./OwnerAssociation";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; file?: boolean } | "network";
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const A1 = { associationId: "a1", name: "Langa Taxi Association", status: "active", requestedBy: "member", joinedOn: "2025-03-10", registrationNumber: "WC/ASSOC/0042", province: "Western Cape", membershipNumber: "MC-0042", standing: "active", standingReason: null, routes: ["Langa to Bellville", "Langa to Cape Town"], ledger: { chargedCents: 70000, paidCents: 20000, owedCents: 50000, overdueCents: 40000, daysOverdue: 120, unallocatedCents: 0 }, pendingClaims: 1 };
const A2 = { associationId: "a2", name: "Bellville Taxi Association", status: "pending", requestedBy: "member", joinedOn: null, registrationNumber: null, province: null, membershipNumber: null, standing: "active", standingReason: null, routes: [], ledger: null, pendingClaims: 0 };
const PROFILE = { success: true, associations: [A1, A2], documents: [{ id: "d1", kind: "letter_of_recommendation", reference: "LOR-2025-17", expiresOn: null }, { id: "d2", kind: "membership_certificate", reference: "MC-9", expiresOn: "2027-03-01" }] };
const STATEMENT = {
  success: true, member: "Olu Owner", owedCents: 50000,
  lines: [
    { date: "2026-07-03", kind: "charge", ref: "", description: "Annual levy", amountCents: 60000, balanceCents: 60000 },
    { date: "2026-10-28", kind: "receipt", ref: "R-000001", description: "", amountCents: 20000, balanceCents: 40000 },
    { date: "2026-11-12", kind: "charge", ref: "", description: "Rank fee", amountCents: 10000, balanceCents: 50000 },
  ],
  openLevies: [{ id: "l1", title: "Annual levy", remainingCents: 40000, dueOn: "2026-07-03" }, { id: "l2", title: "Rank fee", remainingCents: 10000, dueOn: "2026-11-12" }],
  claims: [
    { id: "c1", associationId: "a1", levyId: "l2", amountCents: 10000, paidOn: "2026-11-01", method: "cash", reference: null, status: "claimed", decisionNote: null },
    { id: "c2", associationId: "a1", levyId: "l1", amountCents: 20000, paidOn: "2026-10-27", method: "eft", reference: "EFT 8841", status: "confirmed", decisionNote: null },
    { id: "c3", associationId: "a1", levyId: null, amountCents: 5000, paidOn: "2026-10-20", method: "eft", reference: null, status: "rejected", decisionNote: "Nothing on the statement" },
    { id: "c4", associationId: "a1", levyId: null, amountCents: 1000, paidOn: "2026-10-10", method: "cash", reference: null, status: "withdrawn", decisionNote: null },
  ],
};
const RECEIPTS = { success: true, receipts: [
  { id: "r2", number: "R-000002", receivedOn: "2026-10-30", category: "levy", amountCents: 5000, method: "eft", voided: true, voidReason: "Entered twice" },
  { id: "r1", number: "R-000001", receivedOn: "2026-10-28", category: "levy", amountCents: 20000, method: "eft", voided: false, voidReason: null },
] };

beforeEach(() => {
  localStorage.clear(); calls = [];
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === `${P}/my-association`) return { body: PROFILE };
    if (p === `${P}/my-association/a1/statement`) return { body: STATEMENT };
    if (p === `${P}/my-association/a1/receipts`) return { body: RECEIPTS };
    if (p.endsWith(".pdf")) return { body: "x", file: true };
    if (m === "POST") return { status: 201, body: { success: true, id: "new", duplicate: false } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const r = routes(method, path, body);
    if (r === "network") throw new TypeError("Failed to fetch");
    if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 });
    if (r.file) return new Response("x", { status: 200, headers: { "content-type": "application/pdf" } });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openAccount = async () => {
  render(<MyAssociationScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Open your account and pay" }));
  await screen.findByText("Your account");
};
const override = (path: string, reply: Reply) => { const o = routes; routes = (m, p, b) => (p === path ? reply : o(m, p, b)); };

describe("the profile", () => {
  it("shows the membership, its number, when they joined, the association's registration and province, and the routes", async () => {
    render(<MyAssociationScreen />);
    expect(await screen.findByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Member since 2025-03-10 · membership number MC-0042 · association registration WC/ASSOC/0042 · Western Cape")).toBeInTheDocument();
    expect(screen.getByText("Your routes: Langa to Bellville, Langa to Cape Town.")).toBeInTheDocument();
  });

  it("shows what they are charged, have paid, owe and what is overdue, and how many payments wait for the association", async () => {
    render(<MyAssociationScreen />);
    await screen.findByText("Member");
    expect(screen.getByText(R(70000))).toBeInTheDocument();
    expect(screen.getByText(R(20000))).toBeInTheDocument();
    expect(screen.getByText(R(50000))).toBeInTheDocument();
    expect(screen.getByText(`${R(40000)} (120 days)`)).toBeInTheDocument();
    expect(screen.getByText("1 payment is waiting for the association to confirm.")).toBeInTheDocument();
  });

  it("says an association is waiting to approve them, with no account to open", async () => {
    render(<MyAssociationScreen />);
    await screen.findByText("Waiting for approval");
    expect(screen.getByText("Not a member yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open your account and pay" })).toHaveLength(1);
  });

  it("says when no membership number or route has been issued, and when membership is suspended, with the association's reason", async () => {
    override(`${P}/my-association`, { body: { ...PROFILE, associations: [{ ...A1, membershipNumber: null, routes: [], standing: "suspended", standingReason: "Unpaid levies" }] } });
    render(<MyAssociationScreen />);
    expect(await screen.findByText("Suspended")).toBeInTheDocument();
    expect(screen.getByText(/no membership number issued yet/)).toBeInTheDocument();
    expect(screen.getByText("The association gave this reason: Unpaid levies")).toBeInTheDocument();
    expect(screen.getByText("No route is recorded on your operating licences.")).toBeInTheDocument();
  });

  it("lists the membership papers, and says when there are none", async () => {
    render(<MyAssociationScreen />);
    expect(await screen.findByText("Letter of recommendation", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("Letter of recommendation", { selector: "b" }).closest("li")).toHaveTextContent("LOR-2025-17");
    expect(screen.getByText("Membership certificate", { selector: "b" }).closest("li")).toHaveTextContent("MC-9 · valid until 2027-03-01");
    cleanup();
    override(`${P}/my-association`, { body: { ...PROFILE, documents: [] } });
    render(<MyAssociationScreen />);
    expect(await screen.findByText("No letter of recommendation or membership certificate is recorded.")).toBeInTheDocument();
  });

  it("tells an owner with no association how to join one", async () => {
    override(`${P}/my-association`, { body: { success: true, associations: [], documents: [] } });
    render(<MyAssociationScreen />);
    expect(await screen.findByText(/You are not a member of an association yet/)).toBeInTheDocument();
  });
});

describe("the account", () => {
  it("shows the statement with the running balance, a receipt as a deduction, and each payment report with how it stands", async () => {
    await openAccount();
    const rows = screen.getAllByRole("row").map((r) => r.textContent);
    expect(rows[1]).toBe(`2026-07-03Annual levy${R(60000)}${R(60000)}`);
    expect(rows[2]).toBe(`2026-10-28Receipt R-000001-${R(20000)}${R(40000)}`);
    expect(rows[3]).toBe(`2026-11-12Rank fee${R(10000)}${R(50000)}`);
    const claims = screen.getByText("Payments you told them about").closest("div")!;
    expect(claims).toHaveTextContent("Waiting for the association to confirm");
    expect(claims).toHaveTextContent("Confirmed: you have a receipt");
    expect(claims).toHaveTextContent("Not accepted: Nothing on the statement");
    expect(claims).toHaveTextContent("Withdrawn");
    expect(claims).toHaveTextContent("EFT 8841");
  });

  it("lists the receipts, with a cancelled one struck out and no download, and downloads a real one", async () => {
    await openAccount();
    const r1 = (await screen.findByText(/R-000001 · 2026-10-28/)).closest("li")!;
    expect(r1).toHaveTextContent(R(20000));
    const r2 = screen.getByText(/R-000002 · 2026-10-30/).closest("li")!;
    expect(r2).toHaveTextContent("Cancelled: Entered twice");
    expect(within(r2).queryByRole("button")).toBeNull();
    fireEvent.click(within(r1).getByRole("button", { name: "Download R-000001" }));
    await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/my-association/a1/receipts/r1.pdf`));
  });

  it("withdraws a payment report that is still waiting, and only that one", async () => {
    await openAccount();
    const list = screen.getByText("Payments you told them about").closest("div")!;
    expect(within(list).getAllByRole("button", { name: "Withdraw" })).toHaveLength(1);
    fireEvent.click(within(list).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/my-association/claims/c1/withdraw` }));
  });
});

describe("telling the association you have paid", () => {
  it("fills the amount from the charge chosen, and sends it in cents with the date, how it was paid, the reference and a client reference", async () => {
    await openAccount();
    pick("Payment for", "l1");
    expect(screen.getByLabelText("Dues amount")).toHaveValue("400");
    pick("Dues amount", "250.50");
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(screen.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "true");
    pick("Dues reference", "Paid at the rank office");
    fireEvent.click(screen.getByRole("button", { name: "Tell the association" }));
    await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/my-association/claims`));
    const b = writes().at(-1)!.body;
    expect(b).toMatchObject({ associationId: "a1", levyId: "l1", amountCents: 25050, method: "cash", reference: "Paid at the rank office" });
    expect(b.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.clientRef).toMatch(/^dues-/);
    expect(await screen.findByText("Sent. Langa Taxi Association will check it and confirm.")).toBeInTheDocument();
    expect(screen.getByLabelText("Dues amount")).toHaveValue("");
  });

  it("sends no charge when it is for something else, and asks for a proper amount before sending anything", async () => {
    await openAccount();
    fireEvent.click(screen.getByRole("button", { name: "Tell the association" }));
    expect(await screen.findByText(/Type the amount in rand/)).toBeInTheDocument();
    expect(writes()).toEqual([]);
    pick("Dues amount", "100");
    fireEvent.click(screen.getByRole("button", { name: "Tell the association" }));
    await waitFor(() => expect(writes().at(-1)!.body.levyId).toBeUndefined());
  });

  it("shows the server's reason when it is refused, and does not keep it to try again", async () => {
    const o = routes;
    routes = (m, p, b) => (m === "POST" && p.endsWith("/claims") ? { status: 409, body: { success: false, error: "That is more than is still owed on that charge (R100.00)" } } : o(m, p, b));
    await openAccount();
    pick("Dues amount", "999");
    fireEvent.click(screen.getByRole("button", { name: "Tell the association" }));
    expect(await screen.findByText("That is more than is still owed on that charge (R100.00)")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]")).toEqual([]);
  });

  it("with no signal, keeps it on the phone, says so, and sends it once with the same reference when the signal returns", async () => {
    let online = false;
    const orig = routes;
    routes = (m, p, b) => (m === "POST" && p.endsWith("/my-association/claims") && !online ? "network" : orig(m, p, b));
    await openAccount();
    pick("Dues amount", "300");
    fireEvent.click(screen.getByRole("button", { name: "Tell the association" }));
    expect(await screen.findByText("Saved on this phone. It will be sent when you are online.")).toBeInTheDocument();
    const queued = JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]");
    expect(queued).toHaveLength(1);
    const ref = queued[0].body.clientRef;
    expect(ref).toMatch(/^dues-/);
    expect(await screen.findByText(/1 change is saved on this phone and waiting to be sent: Payment of .* to Langa Taxi Association/)).toBeInTheDocument();
    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]")).toEqual([]));
    expect(writes().filter((c) => c.path.endsWith("/my-association/claims")).at(-1)!.body.clientRef).toBe(ref);
  });
});
