/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemberRegisterScreen, FormalisationScreen } from "./AssociationMembers";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; file?: boolean };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const MEMBERS = [
  { memberId: "m1", name: "Olu Owner", email: "olu@x.test", joinedOn: "2025-03-10", membershipClass: "member", legalName: "Olu Owner Transport (Pty) Ltd", entityType: "company", idNumberMasked: "•••••••••••6/07", phone: "+27821234567", cardNumber: "MC-0001", standing: "suspended", standingReason: "Unpaid levies", standingChangedOn: "2026-10-01", dualMemberOf: "Bellville TA", dualConsent: false, notes: null, vehicles: [{ id: "v1", registration: "CA 111-111", licence: "valid" }, { id: "v2", registration: "CA 222-222", licence: "application_lodged" }], owedCents: 60000, overdueCents: 60000, daysOverdue: 120, disciplinaryCases: { open: 1, closed: 2 }, recentTrips: 4 },
  { memberId: "m2", name: "Ona Owner", email: "ona@x.test", joinedOn: "2026-01-05", membershipClass: "member", legalName: null, entityType: "individual", idNumberMasked: null, phone: null, cardNumber: null, standing: "active", standingReason: null, standingChangedOn: null, dualMemberOf: null, dualConsent: false, notes: null, vehicles: [], owedCents: 0, overdueCents: 0, daysOverdue: 0, disciplinaryCases: { open: 0, closed: 0 }, recentTrips: 0 }];
const REGISTER = { success: true, today: "2026-11-02", measures: { members: 2, suspended: 1, terminated: 0, identityRecordedPercent: 50, dualMembers: 1, activeNonMembers: 1 }, members: MEMBERS, nonMembers: [{ id: "n1", name: "Visiting Vusi", phone: "0821112222", vehicleRegistration: "ZZ 111-222", routeLabel: "Langa to Bellville", notedOn: "2026-10-30", endedOn: null }, { id: "n2", name: "Old Operator", phone: null, vehicleRegistration: "ZZ 333-444", routeLabel: null, notedOn: "2026-08-01", endedOn: "2026-09-01" }], unregisteredOperators: [{ registration: "ZZ 999-999", owner: "Otto Owner", route: "Langa to Bellville", trips: 3 }], flags: [{ id: "members:standing:m1", severity: "high", message: "Olu Owner is suspended, but their vehicles ran 4 trips on your routes in the last 30 days" }, { id: "members:dual:m1", severity: "medium", message: "Olu Owner is also a member of Bellville TA, and no consent is recorded" }] };
const OWNERS = [
  { ownerId: "m1", name: "Olu Owner", businessType: "company", registrationNo: "2015/123456/07", taxNumberMasked: "•••••••789", taxRegistered: true, filingStatus: "overdue", uifEmployer: true, coidaEmployer: false, sdlRegistered: false, checkedOn: "2026-10-01", notes: null, drivers: 3, driversFormal: 1, driversPaidCashNoContract: 1 },
  { ownerId: "m2", name: "Ona Owner", businessType: "unknown", registrationNo: null, taxNumberMasked: null, taxRegistered: false, filingStatus: "unknown", uifEmployer: false, coidaEmployer: false, sdlRegistered: false, checkedOn: null, notes: null, drivers: 0, driversFormal: 0, driversPaidCashNoContract: 0 }];
const FORMAL = { success: true, today: "2026-11-02", owners: OWNERS, measures: { owners: 2, businessRecordedPercent: 50, taxRegisteredPercent: 50, employersRegisteredPercent: 0, drivers: 3, driversFormal: 1, driversFormalPercent: 33.3 }, flags: [{ id: "formal:coida:m1", severity: "medium", message: "Olu Owner has 3 drivers on record but is not recorded as registered with COIDA as an employer" }] };
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === `${P}/member-register` && m === "GET") return { body: REGISTER }; if (p === `${P}/formalisation` && m === "GET") return { body: FORMAL }; if (p.includes("/reports/csv/")) return { body: "x", file: true };
    if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 }); if (r.file) return new Response("x", { status: 200, headers: { "content-type": "text/csv" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const li = (name: string) => screen.getByText(name, { selector: "b" }).closest("li")!;

describe("the member register", () => {
  it("shows the number of members, those suspended or terminated, how many have an ID on record, dual members, and what needs attention", async () => {
    render(<MemberRegisterScreen />); expect(await screen.findByText("1 and 0")).toBeInTheDocument(); expect(screen.getAllByText("50%").length).toBeGreaterThan(0); expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText(/is suspended, but their vehicles ran 4 trips/)).toBeInTheDocument(); expect(screen.getByText(/no consent is recorded/)).toBeInTheDocument();
  });
  it("lists each member with their type, card, masked ID, other membership and standing, saying what is missing", async () => {
    render(<MemberRegisterScreen />); await screen.findByText("Olu Owner", { selector: "b" }); expect(li("Olu Owner")).toHaveTextContent("(Olu Owner Transport (Pty) Ltd) · Company · card MC-0001 · •••••••••••6/07 · also Bellville TA (no consent)"); expect(within(li("Olu Owner")).getByText("Suspended")).toBeInTheDocument(); expect(li("Ona Owner")).toHaveTextContent("Individual · no card number · no ID on file"); expect(within(li("Ona Owner")).getByText("Active")).toBeInTheDocument();
  });
  it("opens a member to show when they joined, their vehicles' licences, what they owe, disciplinary cases as counts only, and recent trips", async () => {
    render(<MemberRegisterScreen />); fireEvent.click(within(await screen.findByText("Olu Owner", { selector: "b" }).then((b) => b.closest("li")!)).getByRole("button", { name: "Open" }));
    expect(screen.getByText(/Joined 2025-03-10/)).toHaveTextContent(`CA 111-111 (licensed), CA 222-222 (application only) · owes ${R(60000)}, ${R(60000)} overdue 120 days · disciplinary cases: 1 open, 2 closed · 4 trips in the last 30 days`);
  });
  it("saves a member's details, sending the ID only when one is typed, the reason only when not active, and nothing about consent without another membership", async () => {
    render(<MemberRegisterScreen />); fireEvent.click(within((await screen.findByText("Ona Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.queryByLabelText("Member standing reason")).toBeNull(); expect(screen.queryByText("Consent to this recorded")).toBeNull(); pick("Member legal name", "Ona Transport"); pick("Member phone", "+27821230000"); pick("Member card number", "MC-0002"); fireEvent.click(screen.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/member-register/m2`, body: { legalName: "Ona Transport", entityType: "individual", phone: "+27821230000", cardNumber: "MC-0002", standing: "active", dualMemberOf: null, notes: "" } }));
    pick("Member ID number", " 8001015009087 "); pick("Member standing", "terminated"); pick("Member standing reason", "Left the association"); pick("Member dual membership", "Khayelitsha TA"); fireEvent.click(screen.getByLabelText("Consent to this recorded")); fireEvent.click(screen.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ idNumber: "8001015009087", standing: "terminated", standingReason: "Left the association", dualMemberOf: "Khayelitsha TA", dualConsent: true }));
  });
  it("labels the number field for the type, and shows the masked number on file and the server's reason when a save is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "That is not a valid South African ID number" } } : o(m, p, b)))(routes); render(<MemberRegisterScreen />); fireEvent.click(within((await screen.findByText("Ona Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText("ID number")).toBeInTheDocument(); pick("Member ID number", "123"); fireEvent.click(screen.getByRole("button", { name: "Save member" })); expect(await screen.findByText("That is not a valid South African ID number")).toBeInTheDocument(); cleanup();
    render(<MemberRegisterScreen />); fireEvent.click(within((await screen.findByText("Olu Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/Company or registration number \(on file: •••••••••••6\/07\)/)).toBeInTheDocument(); expect(screen.getByLabelText("Member standing reason")).toHaveValue("Unpaid levies");
  });
  it("downloads the member list", async () => { render(<MemberRegisterScreen />); await screen.findByText("Olu Owner", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: /Download member list/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/csv/members.csv`)); });
  it("says there are no members yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/member-register` ? { body: { ...REGISTER, members: [], flags: [], unregisteredOperators: [], nonMembers: [] } } : o(m, p, b)))(routes); render(<MemberRegisterScreen />); expect(await screen.findByText("No members yet.")).toBeInTheDocument(); expect(screen.getByText("No non-member operators recorded.")).toBeInTheDocument(); });
});

describe("operators who are not members", () => {
  it("lists them with when they were noted or stopped, and offers to end one that is still operating", async () => {
    render(<MemberRegisterScreen />); await screen.findByText("Visiting Vusi", { selector: "b" }); expect(li("Visiting Vusi")).toHaveTextContent("ZZ 111-222 · Langa to Bellville · 0821112222 · noted 2026-10-30"); expect(li("Old Operator")).toHaveTextContent("stopped 2026-09-01"); expect(within(li("Old Operator")).queryByRole("button")).toBeNull();
    fireEvent.click(within(li("Visiting Vusi")).getByRole("button", { name: /Stopped operating/ })); await waitFor(() => expect(writes().at(-1)!.method).toBe("POST")); expect(writes().at(-1)!.path).toBe(`${P}/member-register/non-members/n1/end`); expect(writes().at(-1)!.body.endedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("shows the vehicles seen on the routes that are not yet in the register, and adds one under its owner's name", async () => {
    render(<MemberRegisterScreen />); expect(await screen.findByText("ZZ 999-999 · owner Otto Owner · Langa to Bellville · 3 trips")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Add ZZ 999-999" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/member-register/non-members`, body: { name: "Otto Owner", vehicleRegistration: "ZZ 999-999", routeLabel: "Langa to Bellville" } }));
  });
  it("adds an operator, leaving the phone out when it is empty, and shows the server's reason when it is refused", async () => {
    render(<MemberRegisterScreen />); await screen.findByText("Visiting Vusi", { selector: "b" }); pick("Non-member name", "Sam Operator"); pick("Non-member vehicle", "zz 555-666"); pick("Non-member route", "Langa to Bellville"); fireEvent.click(screen.getByRole("button", { name: "Add operator" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ name: "Sam Operator", vehicleRegistration: "zz 555-666", routeLabel: "Langa to Bellville" })); expect(writes().at(-1)!.body.phone).toBeUndefined();
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 409, body: { success: false, error: "CA 111-111 belongs to your member Olu Owner" } } : o(m, p, b)))(routes); pick("Non-member vehicle", "CA 111-111"); fireEvent.click(screen.getByRole("button", { name: "Add operator" })); expect(await screen.findByText("CA 111-111 belongs to your member Olu Owner")).toBeInTheDocument();
  });
  it("downloads the list of non-member operators", async () => { render(<MemberRegisterScreen />); await screen.findByText("Visiting Vusi", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: /Download list/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/csv/non_members.csv`)); });
});

describe("formalisation", () => {
  it("says plainly that the association tracks and reports only, and shows how far members have got, with what stands out", async () => {
    render(<FormalisationScreen />); expect(await screen.findByText(/You track and report only: filing tax and registering as an employer are each owner's own duty, and nothing here is tax or labour advice/)).toBeInTheDocument(); expect(screen.getAllByText("50%").length).toBe(2); expect(screen.getByText("0%")).toBeInTheDocument(); expect(screen.getByText("1 of 3 (33.3%)")).toBeInTheDocument(); expect(screen.getByText(/recorded as employed, with a contract on file, registered for UIF and registered for COIDA/)).toBeInTheDocument(); expect(screen.getByText(/not recorded as registered with COIDA as an employer/)).toBeInTheDocument();
  });
  it("says there is no percentage when nothing can be measured", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/formalisation` ? { body: { ...FORMAL, flags: [], measures: { owners: 0, businessRecordedPercent: null, taxRegisteredPercent: null, employersRegisteredPercent: null, drivers: 0, driversFormal: 0, driversFormalPercent: null } } } : o(m, p, b)))(routes); render(<FormalisationScreen />); expect((await screen.findAllByText("No data")).length).toBe(3); expect(screen.getByText("No drivers")).toBeInTheDocument(); expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });
  it("lists each owner with their business, masked tax number, and how many drivers are formally employed or paid in cash with no contract", async () => {
    render(<FormalisationScreen />); await screen.findByText("Olu Owner", { selector: "b" }); expect(li("Olu Owner")).toHaveTextContent("Company · tax •••••••789 · 1 of 3 drivers formally employed · 1 paid in cash, no contract"); expect(li("Ona Owner")).toHaveTextContent("Not recorded · no drivers on record");
  });
  it("saves an owner's business, sending the tax number only when one is typed, and the checked date as null when empty", async () => {
    render(<FormalisationScreen />); fireEvent.click(within((await screen.findByText("Ona Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); pick("Owner business type", "sole_proprietor"); pick("Owner tax filing", "up_to_date"); fireEvent.click(screen.getByLabelText("Registered for tax")); fireEvent.click(screen.getByRole("button", { name: "Save owner" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/formalisation/m2`, body: { businessType: "sole_proprietor", registrationNo: "", taxRegistered: true, filingStatus: "up_to_date", uifEmployer: false, coidaEmployer: false, sdlRegistered: false, checkedOn: null, notes: "" } }));
    pick("Owner tax number", "0123 456 789"); pick("Owner checked on", "2026-11-01"); fireEvent.click(screen.getByLabelText("Registered with UIF as an employer")); fireEvent.click(screen.getByRole("button", { name: "Save owner" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ taxNumber: "0123 456 789", checkedOn: "2026-11-01", uifEmployer: true }));
  });
  it("shows the masked tax number on file and the server's reason when a save is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "A SARS tax reference number is ten digits" } } : o(m, p, b)))(routes); render(<FormalisationScreen />); fireEvent.click(within((await screen.findByText("Olu Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/SARS tax reference \(on file: •••••••789\)/)).toBeInTheDocument(); expect(screen.getByLabelText("Registered with UIF as an employer")).toBeChecked(); expect(screen.getByLabelText("Registered with COIDA as an employer")).not.toBeChecked();
    pick("Owner tax number", "12345"); fireEvent.click(screen.getByRole("button", { name: "Save owner" })); expect(await screen.findByText("A SARS tax reference number is ten digits")).toBeInTheDocument();
  });
  it("downloads the formalisation list", async () => { render(<FormalisationScreen />); await screen.findByText("Olu Owner", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: /Download formalisation list/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/csv/formalisation.csv`)); });
});
