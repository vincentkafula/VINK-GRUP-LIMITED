/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComplianceCentreScreen } from "./OwnerCompliance";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const item = (kind: string, label: string, expiresOn: string | null, daysLeft: number | null, status: string, detail: string | null = null) => ({ key: `${kind}:v1`, kind, label, expiresOn, daysLeft, status, detail });
const V1 = { vehicleId: "v1", registration: "CA 111-111", make: "Toyota", driver: "Dan Driver", status: "red", scorePercent: 33, vin: null,
  items: [item("licence", "Operating licence OL-9", "2027-06-30", 240, "valid", "Gauteng · Langa to Bellville"), item("roadworthy", "Roadworthy certificate", "2026-11-22", 20, "due", "RWC-77"), item("disc", "Licence disc", null, null, "missing"), item("insurance", "Insurance", "2026-10-30", -3, "expired", "Santam · P-9"), item("driver_licence", "Driving licence of Dan Driver", "2028-01-01", 425, "valid", "As recorded by the driver"), item("prdp", "PrDP of Dan Driver", null, null, "missing", "As recorded by the driver")],
  licences: [{ id: "l1", licenceNumber: "OL-9", province: "Gauteng", authority: "GPRE", route: "Langa to Bellville", validFrom: "2024-07-01", validUntil: "2027-06-30", maxYears: 5, ruleVerified: false }],
  details: { roadworthyRef: "RWC-77", insurer: "Santam", policyNumber: "P-9" } };
const V2 = { vehicleId: "v2", registration: "CA 222-222", make: null, driver: null, status: "green", scorePercent: 100, vin: null, items: [item("licence", "Operating licence", "2028-01-01", 425, "valid")], licences: [], details: { roadworthyRef: null, insurer: null, policyNumber: null } };
const CENTRE = { success: true, today: "2026-11-02", reminderDays: [90, 60, 30, 7], rules: [{ province: "*", maxYears: 7, verified: false, note: null }, { province: "Gauteng", maxYears: 5, verified: false, note: null }, { province: "Western Cape", maxYears: 5, verified: true, note: null }],
  vehicles: [V1, V2], fleet: { vehicles: 2, green: 1, amber: 0, red: 1, scorePercent: 63, expired: 1, dueSoon: 1, missing: 2 },
  flags: [{ id: "cc:expired:insurance:v1", severity: "high", message: "CA 111-111: Insurance expired on 2026-10-30" }, { id: "cc:due:roadworthy:v1", severity: "medium", message: "CA 111-111: Roadworthy certificate expires in 20 days (2026-11-22)" }, { id: "cc:missing:disc:v1", severity: "low", message: "CA 111-111: Licence disc has not been recorded" }] };

beforeEach(() => {
  calls = [];
  routes = (m, p) => {
    if (p === `${P}/compliance-centre`) return { body: CENTRE };
    if (m === "POST") return { status: 201, body: { success: true, id: "new" } };
    if (m === "PUT" || m === "DELETE") return { body: { success: true } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const r = routes(method, path, body);
    if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const override = (path: string, reply: Reply) => { const o = routes; routes = (m, p, b) => (p === path ? reply : o(m, p, b)); };
const card = (reg: string) => screen.getByText(new RegExp(`^${reg}`), { selector: "h2,h3" }).closest("section,div")!;
const openV1 = async () => { render(<ComplianceCentreScreen />); fireEvent.click(await screen.findByRole("button", { name: "Update CA 111-111" })); };

describe("the overview", () => {
  it("shows the score, how many are expired, due and not recorded, and what each vehicle's state is in words", async () => {
    render(<ComplianceCentreScreen />); expect(await screen.findByText("63%")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 vehicles are all in order, 0 need attention and 1 has something expired.")).toBeInTheDocument(); expect(screen.getByText("All in order")).toBeInTheDocument(); expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
  });
  it("lists what needs doing, in words, most serious first", async () => {
    render(<ComplianceCentreScreen />); await screen.findByText("63%"); const lis = screen.getAllByRole("listitem").map((l) => l.textContent ?? ""); const a = lis.findIndex((t) => t.includes("Insurance expired on 2026-10-30")), b = lis.findIndex((t) => t.includes("Roadworthy certificate expires in 20 days")), c = lis.findIndex((t) => t.includes("Licence disc has not been recorded")); expect(a).toBeGreaterThan(-1); expect(a).toBeLessThan(b); expect(b).toBeLessThan(c);
    expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText("Soon")).toBeInTheDocument(); expect(screen.getByText("Keep an eye on")).toBeInTheDocument();
  });
  it("shows each document with its date, how long is left or how long ago it expired, and a word for its state", async () => {
    render(<ComplianceCentreScreen />); await screen.findByText("63%"); const row = (label: string) => screen.getByText(label, { selector: "b" }).closest("li")!;
    expect(row("Operating licence OL-9")).toHaveTextContent("Valid"); expect(row("Operating licence OL-9")).toHaveTextContent("2027-06-30 (240 days left) · Gauteng · Langa to Bellville"); expect(row("Roadworthy certificate")).toHaveTextContent("Due soon"); expect(row("Roadworthy certificate")).toHaveTextContent("2026-11-22 (20 days left) · RWC-77");
    expect(row("Insurance")).toHaveTextContent("Expired"); expect(row("Insurance")).toHaveTextContent("(expired 3 days ago) · Santam · P-9"); expect(row("Licence disc")).toHaveTextContent("Not recorded"); expect(row("PrDP of Dan Driver")).toHaveTextContent("As recorded by the driver");
  });
  it("says no driver is assigned when there is none, and asks to add a vehicle when there are none", async () => {
    render(<ComplianceCentreScreen />); await screen.findByText("63%"); expect(screen.getByText("100% in order · no driver assigned")).toBeInTheDocument(); expect(screen.getByText("33% in order · driver Dan Driver")).toBeInTheDocument(); cleanup();
    override(`${P}/compliance-centre`, { body: { ...CENTRE, vehicles: [], flags: [], fleet: { vehicles: 0, green: 0, amber: 0, red: 0, scorePercent: null, expired: 0, dueSoon: 0, missing: 0 } } }); render(<ComplianceCentreScreen />); expect(await screen.findByText("Add a vehicle first.")).toBeInTheDocument(); expect(screen.queryByText("Compliance score")).toBeNull();                  // nothing to score
  });
});

describe("updating a vehicle's details", () => {
  it("fills the form from what is recorded and saves what is typed", async () => {
    await openV1(); expect(screen.getByLabelText("Roadworthy expiry CA 111-111")).toHaveValue("2026-11-22"); expect(screen.getByLabelText("Insurer CA 111-111")).toHaveValue("Santam"); expect(screen.getByLabelText("Policy number CA 111-111")).toHaveValue("P-9"); expect(screen.getByLabelText("Disc expiry CA 111-111")).toHaveValue("");
    pick("Disc expiry CA 111-111", "2027-03-31"); pick("Insurance expiry CA 111-111", "2027-09-01"); fireEvent.click(screen.getByRole("button", { name: "Save details for CA 111-111" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/compliance-centre/vehicles/v1`, body: { roadworthyExpiry: "2026-11-22", roadworthyRef: "RWC-77", discExpiry: "2027-03-31", insurer: "Santam", policyNumber: "P-9", insuranceExpiry: "2027-09-01" } })); expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
  it("shows the server's reason when a save is refused", async () => {
    override(`${P}/compliance-centre/vehicles/v1`, { status: 400, body: { success: false, error: "The insurance expiry must be a date (YYYY-MM-DD) within ten years of today" } }); await openV1(); fireEvent.click(screen.getByRole("button", { name: "Save details for CA 111-111" })); expect(await screen.findByText(/within ten years of today/)).toBeInTheDocument();
  });
});

describe("operating licences", () => {
  it("lists each licence with its province and dates, and removes one", async () => {
    await openV1(); const li = screen.getByText(/OL-9 · Gauteng · 2024-07-01 to 2027-06-30 · Langa to Bellville/).closest("li")!; fireEvent.click(within(li).getByRole("button", { name: "Remove OL-9" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "DELETE", path: `${P}/compliance-centre/licences/l1` }));
  });
  it("says when none is recorded", async () => { override(`${P}/compliance-centre`, { body: { ...CENTRE, vehicles: [{ ...V1, licences: [] }] } }); await openV1(); expect(screen.getByText("No operating licence is recorded.")).toBeInTheDocument(); });
  it("says what the chosen province allows, and that it has not been verified, until it has", async () => {
    await openV1(); expect(screen.queryByRole("note")).toBeNull(); pick("Licence province CA 111-111", "Gauteng"); expect(screen.getByRole("note")).toHaveTextContent("Gauteng licences last at most 5 years in this system. This limit has not been verified with the Provincial Regulatory Entity: check it yourself before relying on it.");
    pick("Licence province CA 111-111", "Western Cape"); expect(screen.getByRole("note")).toHaveTextContent("Western Cape licences last at most 5 years in this system."); expect(screen.getByRole("note")).not.toHaveTextContent("not been verified"); pick("Licence province CA 111-111", "Limpopo"); expect(screen.getByRole("note")).toHaveTextContent("Limpopo licences last at most 7 years in this system. This limit has not been verified");
  });
  it("needs a province before it sends anything, then sends the licence with only the optional fields that were typed", async () => {
    await openV1(); pick("Licence number CA 111-111", "OL-10"); pick("Licence from CA 111-111", "2026-01-01"); pick("Licence until CA 111-111", "2030-12-31"); fireEvent.click(screen.getByRole("button", { name: "Add licence for CA 111-111" })); expect(await screen.findByText("Choose the province that issued the licence.")).toBeInTheDocument(); expect(writes()).toEqual([]);
    pick("Licence province CA 111-111", "Gauteng"); fireEvent.click(screen.getByRole("button", { name: "Add licence for CA 111-111" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/compliance-centre/vehicles/v1/licences`, body: { licenceNumber: "OL-10", province: "Gauteng", validFrom: "2026-01-01", validUntil: "2030-12-31" } }));
    pick("Licence route CA 111-111", "Langa to Cape Town"); pick("Licence authority CA 111-111", "GPRE"); pick("Licence number CA 111-111", "OL-11"); pick("Licence province CA 111-111", "Gauteng"); pick("Licence from CA 111-111", "2026-01-01"); pick("Licence until CA 111-111", "2030-12-31"); fireEvent.click(screen.getByRole("button", { name: "Add licence for CA 111-111" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ route: "Langa to Cape Town", authority: "GPRE" }));
  });
  it("shows the server's reason when a licence is longer than the province allows", async () => {
    override(`${P}/compliance-centre/vehicles/v1/licences`, { status: 400, body: { success: false, error: "A licence in Gauteng lasts at most five years under the limit set in this system (not yet verified with the Provincial Regulatory Entity): check the dates" } }); await openV1(); pick("Licence number CA 111-111", "OL-12"); pick("Licence province CA 111-111", "Gauteng"); pick("Licence from CA 111-111", "2024-01-01"); pick("Licence until CA 111-111", "2031-01-01"); fireEvent.click(screen.getByRole("button", { name: "Add licence for CA 111-111" })); expect(await screen.findByText(/lasts at most five years under the limit/)).toBeInTheDocument();
  });
});

describe("reminders", () => {
  it("says when you will be reminded, and where the reminders appear", async () => { render(<ComplianceCentreScreen />); expect(await screen.findByText("You are reminded 90, 60, 30, 7 days before a document expires, and again once it has. The reminders appear under Notifications.")).toBeInTheDocument(); });
  it("saves the days typed, with commas or spaces, as whole numbers", async () => {
    render(<ComplianceCentreScreen />); await screen.findByText("63%"); expect(screen.getByLabelText("Reminder days")).toHaveValue("90, 60, 30, 7"); pick("Reminder days", "45 14,3"); fireEvent.click(screen.getByRole("button", { name: "Save reminder days" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/compliance-centre/reminders`, body: { days: [45, 14, 3] } }));
  });
  it("refuses something that is not whole numbers of days before sending", async () => {
    render(<ComplianceCentreScreen />); await screen.findByText("63%"); pick("Reminder days", "soon"); fireEvent.click(screen.getByRole("button", { name: "Save reminder days" })); expect(await screen.findByText(/Type whole numbers of days/)).toBeInTheDocument(); pick("Reminder days", ""); fireEvent.click(screen.getByRole("button", { name: "Save reminder days" })); expect(await screen.findAllByText(/Type whole numbers of days/)).not.toHaveLength(0); expect(writes()).toEqual([]);
  });
});
