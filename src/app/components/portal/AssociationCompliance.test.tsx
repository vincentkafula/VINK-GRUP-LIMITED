/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComplianceOverview, RegistrationScreen, VehicleRegisterScreen, DriverRegisterScreen } from "./AssociationCompliance";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association/compliance";
const FLAGS = [
  { id: "f1", category: "licence", severity: "high", message: "CA 222-222 has only a licence application lodged: it counts as unlicensed until the licence is granted", subject: "CA 222-222", dueOn: null },
  { id: "f2", category: "vehicle", severity: "medium", message: "CA 111-111's roadworthy certificate expires in 60 days (2027-01-01)", subject: "CA 111-111", dueOn: "2027-01-01" },
  { id: "f3", category: "driver", severity: "low", message: "Dan Driver's PrDP expires in 150 days (2027-04-01)", subject: "Dan Driver", dueOn: "2027-04-01" }];
const SUMMARY = { success: true, today: "2026-11-02", measures: { vehicles: 3, vehiclesLicensed: 1, licensedPercent: 33.3, applicationOnly: 1, expired: 0, noLicence: 1, drivers: 2, driversWithValidPermit: 1, validPermitPercent: 50, driversWithoutEmployer: 1, members: 2, minMembersRequired: 10, registrationStatus: "provisional" }, flags: FLAGS, flagCounts: { high: 1, medium: 1, low: 1 },
  expiries: [{ kind: "Operating licence", subject: "CA 111-111", expiresOn: "2026-11-22", days: 20, band: "30" }, { kind: "Professional driving permit", subject: "Dan Driver", expiresOn: "2026-10-23", days: -10, band: "expired" }, { kind: "Insurance", subject: "CA 333-333", expiresOn: "2027-03-01", days: 119, band: "180" }] };
const REG = { recorded: true, status: "provisional", registrationNumber: "GP/2026/0412", registrar: "Gauteng PRE", province: "Gauteng", conditionalSince: "2025-06-01", conditionalLimitMonths: 12, registeredOn: null, certificateIssuedOn: null, renewalDueOn: "2027-01-31", minMembersRequired: 10, constitutionVersion: "3", constitutionDated: "2026-01-10", constitutionLodgedVersion: "2", constitutionLodgedOn: null, codeVersion: "1", codeDated: null, feeCapCents: 1000000, notes: null, memberCount: 2 };
const VEH = [
  { id: "v1", registration: "CA 111-111", make: "Toyota", model: "Quantum", seats: 15, owner: "Olu Owner", driver: "Dan Driver", compliance: { vin: null, roadworthyExpiry: "2027-01-01", roadworthyRef: null, insurer: "Santam", policyNumber: null, insuranceExpiry: null, tracker: "installed", camera: "unknown", signageNote: null, recapStatus: "unknown", state: "active", replacedBy: null, replacedByRegistration: null, replacementNote: null }, licence: { status: "valid", validUntil: "2027-06-01", all: [{ id: "l1", licenceNumber: "OL-1", authority: "PRE", holder: null, validFrom: "2026-01-01", validUntil: "2027-06-01", route: "Langa to Bellville", area: null, times: null }] }, applications: [], roadworthy: { band: "90", days: 60 }, insurance: { band: "missing", days: null }, flags: [FLAGS[1]] },
  { id: "v2", registration: "CA 222-222", make: "Toyota", model: "Quantum", seats: 15, owner: "Olu Owner", driver: null, compliance: { vin: null, roadworthyExpiry: null, roadworthyRef: null, insurer: null, policyNumber: null, insuranceExpiry: null, tracker: "unknown", camera: "unknown", signageNote: null, recapStatus: "unknown", state: "active", replacedBy: null, replacedByRegistration: null, replacementNote: null }, licence: { status: "application_lodged", validUntil: null, all: [] }, applications: [{ id: "a1", kind: "new", reference: "APP-1", authority: null, lodgedOn: "2026-10-01", outcome: "pending", outcomeOn: null }], roadworthy: { band: "missing", days: null }, insurance: { band: "missing", days: null }, flags: [FLAGS[0]] }];
const DRV = [
  { id: "d1", name: "Dan Driver", email: "d@x", idNumberMasked: "•••••••••9087", vehicle: "CA 111-111", employers: ["Olu Owner"], member: false, permit: { number: "PDP-2", expiresOn: "2026-10-23", band: "expired", days: -10 }, licence: { code: "EC1", expiresOn: "2027-12-01", band: "ok", days: 400 }, register: { employmentStatus: "employed", contractOnFile: true, payBasis: "salary", uifRegistered: true, coidaRegistered: false, cleanRecordConfirmed: false, trainingNote: null, state: "active", stateReason: null }, flags: [{ id: "x", category: "driver", severity: "high", message: "Dan Driver's PrDP expired on 2026-10-23 and they are assigned to CA 111-111", subject: "Dan Driver", dueOn: "2026-10-23" }] },
  { id: "d2", name: "Dee Driver", email: "dd@x", idNumberMasked: null, vehicle: null, employers: [], member: true, permit: { number: null, expiresOn: null, band: "missing", days: null }, licence: { code: null, expiresOn: null, band: "missing", days: null }, register: { employmentStatus: "unknown", contractOnFile: false, payBasis: "unknown", uifRegistered: false, coidaRegistered: false, cleanRecordConfirmed: false, trainingNote: null, state: "active", stateReason: null }, flags: [] }];
beforeEach(() => {
  calls = []; routes = (m, p) => {
    if (p === `${P}/summary`) return { body: SUMMARY }; if (p.startsWith(`${P}/trend`)) return { body: { success: true, trend: [{ month: "2026-10", vehicles: 3, licensed: 1, licensedPercent: 33.3, drivers: 2, driversValid: 1, validPermitPercent: 50 }] } };
    if (p.startsWith(`${P}/changes`)) return { body: { success: true, changes: [{ entity: "licence", summary: "CA 111-111: licence OL-1 valid 2026-01-01 to 2027-06-01", at: "2026-11-01T08:00:00Z", by: "Langa Taxi Association" }] } };
    if (p === `${P}/registration` && m === "GET") return { body: { success: true, registration: REG } }; if (p === `${P}/office-bearers` && m === "GET") return { body: { success: true, officeBearers: [{ id: "o1", name: "Thabo Mokoena", office: "Chairperson", termStart: "2024-01-01", termEnd: "2026-12-01" }] } };
    if (p === `${P}/documents` && m === "GET") return { body: { success: true, documents: [{ id: "dc1", kind: "constitution", title: "Signed constitution", reference: null, version: "3", datedOn: "2026-01-10", expiresOn: null, heldAt: "Office safe" }] } };
    if (p === `${P}/acceptances` && m === "GET") return { body: { success: true, constitutionVersion: "3", members: [{ memberId: "m1", name: "Olu Owner", acceptedCurrent: true, acceptedOn: "2026-02-01", versionsAccepted: ["3"] }, { memberId: "m2", name: "Ona Owner", acceptedCurrent: false, acceptedOn: null, versionsAccepted: [] }] } };
    if (p === `${P}/vehicles` && m === "GET") return { body: { success: true, vehicles: VEH } }; if (p === `${P}/drivers` && m === "GET") return { body: { success: true, drivers: DRV } }; if (p === `${P}/settings` && m === "GET") return { body: { success: true, enforcePrdp: false } };
    if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the compliance overview", () => {
  it("shows the shares that are legal today, says plainly that an application is not a licence, and where each count comes from", async () => {
    render(<ComplianceOverview />); expect(await screen.findByText("33.3%")).toBeInTheDocument(); expect(screen.getByText("50%")).toBeInTheDocument(); expect(screen.getByText("2 of 10 needed")).toBeInTheDocument(); expect(screen.getByText("Provisional")).toBeInTheDocument();
    const p = screen.getByText(/hold a licence that covers today/); expect(p).toHaveTextContent("1 of 3 vehicles hold a licence that covers today. 1 has only an application lodged, which counts as unlicensed. 1 has none on file. 1 driver has no employing owner on record.");
    expect(screen.getByText(/as of 2026-11-02/)).toBeInTheDocument();
  });
  it("says there is no percentage when nothing can be measured, never 0% or NaN", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/summary` ? { body: { ...SUMMARY, measures: { ...SUMMARY.measures, vehicles: 0, vehiclesLicensed: 0, licensedPercent: null, drivers: 0, driversWithValidPermit: 0, validPermitPercent: null, applicationOnly: 0, noLicence: 0, driversWithoutEmployer: 0, minMembersRequired: null }, flags: [], flagCounts: { high: 0, medium: 0, low: 0 }, expiries: [] } } : o(m, p, b)))(routes);
    render(<ComplianceOverview />); expect((await screen.findAllByText("No data")).length).toBe(2); expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument(); expect(screen.getByText("Nothing is expiring in the next 180 days.")).toBeInTheDocument(); expect(screen.queryByText("NaN%")).toBeNull();
  });
  it("lists what needs attention by how serious it is, and filters by seriousness and by subject", async () => {
    render(<ComplianceOverview />); expect(await screen.findByText("Needs attention (3)")).toBeInTheDocument(); expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText("Soon")).toBeInTheDocument(); expect(screen.getAllByText("Keep an eye on").length).toBeGreaterThan(0);
    pick("Filter by seriousness", "high"); expect(screen.getByText(/only a licence application lodged/)).toBeInTheDocument(); expect(screen.queryByText(/roadworthy certificate expires/)).toBeNull(); pick("Filter by seriousness", ""); pick("Filter by subject", "driver"); expect(screen.getByText(/Dan Driver's PrDP expires/)).toBeInTheDocument(); expect(screen.queryByText(/only a licence application/)).toBeNull();
    pick("Filter by seriousness", "high"); expect(screen.getByText("Nothing matches that filter.")).toBeInTheDocument();
  });
  it("lists expiries soonest first with how near each is, and the month-by-month picture, and says so when there is none yet", async () => {
    render(<ComplianceOverview />); const rows = (await screen.findAllByRole("row")).slice(1); expect(rows[0]).toHaveTextContent("Operating licence"); expect(rows[1]).toHaveTextContent(/Professional driving permit.*Dan Driver.*-10.*Expired/); expect(rows[2]).toHaveTextContent("Within 180 days");
    expect(await screen.findByText(/Vehicles licensed 1 of 3 \(33.3%\) · drivers with a permit 1 of 2 \(50%\)/)).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p.startsWith(`${P}/trend`) ? { body: { success: true, trend: [] } } : o(m, p, b)))(routes); render(<ComplianceOverview />); expect(await screen.findByText(/The monthly picture builds up as months pass/)).toBeInTheDocument();
  });
  it("offers a way into the registers, and loads the change history only when asked", async () => {
    const open = vi.fn(); render(<ComplianceOverview onOpen={open} />); await screen.findByText("33.3%"); fireEvent.click(screen.getByText("Open the vehicle register")); fireEvent.click(screen.getByText("Open the driver register")); fireEvent.click(screen.getByText("Open the registration")); expect(open.mock.calls.map((c) => c[0])).toEqual(["Vehicle register", "Driver register", "Registration"]);
    expect(calls.some((c) => c.path.includes("/changes"))).toBe(false); fireEvent.click(screen.getByRole("button", { name: "Show" })); expect(await screen.findByText(/licence OL-1 valid 2026-01-01 to 2027-06-01/)).toBeInTheDocument(); expect(screen.getByText(/Langa Taxi Association/)).toBeInTheDocument();
  });
});

describe("registration", () => {
  it("says nothing has been recorded when it has not", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/registration` && m === "GET" ? { body: { success: true, registration: { ...REG, recorded: false, registrationNumber: null, status: "conditional" } } } : o(m, p, b)))(routes); render(<RegistrationScreen />); expect(await screen.findByText(/Nothing has been recorded yet/)).toBeInTheDocument();
  });
  it("shows what has been recorded, with the member count", async () => {
    render(<RegistrationScreen />); expect(await screen.findByDisplayValue("GP/2026/0412")).toBeInTheDocument(); expect(screen.getByText(/You have/)).toHaveTextContent("You have 2 active owner members."); expect(screen.queryByText(/Nothing has been recorded yet/)).toBeNull();
  });
  it("saves every field in the types the server wants: whole numbers as numbers, the fee cap in cents, blank dates empty, a blank minimum as null", async () => {
    render(<RegistrationScreen />); await screen.findByDisplayValue("GP/2026/0412"); pick("Registration status", "full"); pick("Fee cap", "12 500,50".replace(" ", "")); pick("Minimum members", ""); pick("Conditional limit", "18"); pick("Registered on", "2026-03-01");
    fireEvent.click(screen.getByRole("button", { name: "Save registration" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "PUT", path: `${P}/registration`, body: { status: "full", registrationNumber: "GP/2026/0412", conditionalLimitMonths: 18, minMembersRequired: null, feeCapCents: 1250050, registeredOn: "2026-03-01", constitutionVersion: "3", constitutionLodgedVersion: "2", certificateIssuedOn: "" } }));
  });
  it("shows the server's reason when the registration is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "Give renewalDueOn as YYYY-MM-DD" } } : o(m, p, b)))(routes); render(<RegistrationScreen />); await screen.findByDisplayValue("GP/2026/0412"); fireEvent.click(screen.getByRole("button", { name: "Save registration" })); expect(await screen.findByText("Give renewalDueOn as YYYY-MM-DD")).toBeInTheDocument();
  });
  it("adds and removes office bearers and evidence, and records signatures only for members who have not signed the current version", async () => {
    render(<RegistrationScreen />); expect((await screen.findByText("Thabo Mokoena")).closest("li")).toHaveTextContent("Chairperson · term 2024-01-01 to 2026-12-01"); fireEvent.change(screen.getByLabelText("Office bearer name"), { target: { value: "Sipho Dube" } }); fireEvent.change(screen.getByLabelText("Office held"), { target: { value: "Treasurer" } }); fireEvent.change(screen.getByLabelText("Term ends"), { target: { value: "2027-05-01" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/office-bearers`, body: { name: "Sipho Dube", office: "Treasurer", termStart: "", termEnd: "2027-05-01" } }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "DELETE", path: `${P}/office-bearers/o1`, body: undefined }));
    expect(screen.getAllByText("Signed constitution").find((e) => e.tagName === "B")!.closest("li")).toHaveTextContent("version 3 · dated 2026-01-10 · kept at Office safe"); fireEvent.change(screen.getByLabelText("Document title"), { target: { value: "Certificate 2026" } }); pick("Document kind", "registration_certificate"); fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/documents`, body: { kind: "registration_certificate", title: "Certificate 2026" } }));
    expect(screen.getByText(/1 of 2 members have signed it/)).toBeInTheDocument(); const sel = screen.getByLabelText("Acceptance member"); expect(within(sel).queryByText("Olu Owner")).toBeNull(); pick("Acceptance member", "m2"); pick("Signed on", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Record signature" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/acceptances`, body: { memberId: "m2", version: "3", acceptedOn: "2026-11-01" } }));
  });
});

describe("the vehicle register", () => {
  it("lists each vehicle with its licence status in plain words, its dates and how many things need attention, and says an application is unlicensed", async () => {
    render(<VehicleRegisterScreen />); expect(await screen.findByText("CA 111-111")).toBeInTheDocument(); expect(screen.getByText("Valid")).toBeInTheDocument(); expect(screen.getByText("Application lodged: counts as unlicensed")).toBeInTheDocument(); expect(screen.getAllByText("1 to attend to")).toHaveLength(2); expect(screen.getByText("Licence until: 2027-06-01")).toBeInTheDocument(); expect(screen.getByText("Licence until: none")).toBeInTheDocument();
  });
  it("filters to the vehicles not licensed today and to those with something to attend to, and says when none match", async () => {
    render(<VehicleRegisterScreen />); await screen.findByText("CA 111-111"); pick("Filter vehicles", "unlicensed"); expect(screen.queryByText("CA 111-111")).toBeNull(); expect(screen.getByText("CA 222-222")).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/vehicles` && m === "GET" ? { body: { success: true, vehicles: [{ ...VEH[0], flags: [] }] } } : o(m, p, b)))(routes); render(<VehicleRegisterScreen />); await screen.findByText("CA 111-111"); pick("Filter vehicles", "attention"); expect(screen.getByText("No vehicles match.")).toBeInTheDocument();
  });
  it("adds a licence with its conditions, and removes one, and shows the server's reason when it refuses", async () => {
    render(<VehicleRegisterScreen />); fireEvent.click((await screen.findAllByRole("button", { name: "Open" }))[0]); expect(screen.getByText(/The licence belongs to the vehicle and its owner, not to your association/)).toBeInTheDocument(); expect(screen.getByText("OL-1").closest("li")).toHaveTextContent("2026-01-01 to 2027-06-01 · PRE · route: Langa to Bellville");
    pick("Licence number", "OL-2"); pick("Licence valid from", "2026-02-01"); pick("Licence valid until", "2033-02-01"); pick("Licence route", "Langa to Cape Town"); fireEvent.click(screen.getByRole("button", { name: "Add licence" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/vehicles/v1/licences`, body: { licenceNumber: "OL-2", authority: "", validFrom: "2026-02-01", validUntil: "2033-02-01", route: "Langa to Cape Town", area: "", times: "" } }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "DELETE", path: `${P}/licences/l1` }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 400, body: { success: false, error: "An operating licence lasts at most seven years: check the dates" } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Add licence" })); expect(await screen.findByText("An operating licence lasts at most seven years: check the dates")).toBeInTheDocument();
  });
  it("records an application and its outcome with today's date, only offering an outcome while it is pending", async () => {
    render(<VehicleRegisterScreen />); fireEvent.click((await screen.findAllByRole("button", { name: "Open" }))[1]); expect(screen.getByText(/An application is not a licence/)).toBeInTheDocument(); expect(screen.getByText(/new · lodged 2026-10-01 · APP-1/)).toBeInTheDocument();
    pick("Application kind", "renewal"); pick("Application reference", "APP-2"); pick("Application lodged", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Record application" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/vehicles/v2/applications`, body: { kind: "renewal", reference: "APP-2", authority: "", lodgedOn: "2026-11-01" } }));
    fireEvent.click(screen.getByRole("button", { name: "Granted" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "PUT", path: `${P}/applications/a1`, body: { outcome: "granted", outcomeOn: new Date().toISOString().slice(0, 10) } }));
  });
  it("saves a vehicle's details, asks which vehicle replaced it when it is marked replaced, and sends no replacement otherwise", async () => {
    render(<VehicleRegisterScreen />); fireEvent.click((await screen.findAllByRole("button", { name: "Open" }))[0]); pick("Insurer", "Discovery"); pick("Tracker", "none"); expect(screen.queryByLabelText("Replaced by")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "PUT", path: `${P}/vehicles/v1`, body: { insurer: "Discovery", tracker: "none", state: "active", replacedBy: null, roadworthyExpiry: "2027-01-01" } }));
    pick("Vehicle state", "replaced"); pick("Replaced by", "v2"); fireEvent.click(screen.getByRole("button", { name: "Save details" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ state: "replaced", replacedBy: "v2" }));
  });
  it("says there are no vehicles yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/vehicles` && m === "GET" ? { body: { success: true, vehicles: [] } } : o(m, p, b)))(routes); render(<VehicleRegisterScreen />); expect(await screen.findByText(/No vehicles yet/)).toBeInTheDocument(); });
});

describe("the driver register", () => {
  it("lists each driver with their vehicle, employer and permit state in words, and never the full ID number", async () => {
    render(<DriverRegisterScreen />); expect(await screen.findByText("Dan Driver")).toBeInTheDocument(); expect(screen.getByText("PrDP expired")).toBeInTheDocument(); expect(screen.getByText("No PrDP")).toBeInTheDocument(); expect(screen.getByText(/employed by Olu Owner/)).toBeInTheDocument(); expect(screen.getByText(/no employer on record/)).toBeInTheDocument();
    expect(screen.getByText("ID •••••••••9087")).toBeInTheDocument(); expect(screen.getByText("No ID on file")).toBeInTheDocument(); expect(document.body.textContent).not.toContain("8001015009");
  });
  it("switches on the rule that blocks drivers without a valid permit", async () => {
    render(<DriverRegisterScreen />); fireEvent.click(await screen.findByLabelText(/Do not let owners put a driver on a vehicle without a valid professional driving permit/)); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/settings`, body: { enforcePrdp: true } }));
  });
  it("saves a driver's details, sends the ID number only when one is typed, and asks why when suspending", async () => {
    render(<DriverRegisterScreen />); fireEvent.click((await screen.findAllByRole("button", { name: "Open" }))[0]); expect(screen.getByText(/assigned to CA 111-111/)).toBeInTheDocument(); pick("Pay basis", "salary"); fireEvent.click(screen.getByLabelText("Registered for COIDA")); fireEvent.click(screen.getByRole("button", { name: "Save driver" }));
    await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ employmentStatus: "employed", payBasis: "salary", uifRegistered: true, coidaRegistered: true, state: "active" })); expect(writes().at(-1)!.body).not.toHaveProperty("idNumber");
    fireEvent.change(screen.getByLabelText("ID number"), { target: { value: " 8001015009087 " } }); expect(screen.queryByLabelText("Why suspended")).toBeNull(); pick("Driver status", "suspended"); fireEvent.change(screen.getByLabelText("Why suspended"), { target: { value: "Disciplinary hearing" } }); fireEvent.click(screen.getByRole("button", { name: "Save driver" }));
    await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ idNumber: "8001015009087", state: "suspended", stateReason: "Disciplinary hearing" }));
  });
  it("shows the server's reason when a driver is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" && p.includes("/drivers/") ? { status: 400, body: { success: false, error: "That is not a valid South African ID number" } } : o(m, p, b)))(routes); render(<DriverRegisterScreen />); fireEvent.click((await screen.findAllByRole("button", { name: "Open" }))[0]); fireEvent.change(screen.getByLabelText("ID number"), { target: { value: "123" } }); fireEvent.click(screen.getByRole("button", { name: "Save driver" })); expect(await screen.findByText("That is not a valid South African ID number")).toBeInTheDocument();
  });
  it("says there are no drivers yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/drivers` && m === "GET" ? { body: { success: true, drivers: [] } } : o(m, p, b)))(routes); render(<DriverRegisterScreen />); expect(await screen.findByText(/No drivers yet/)).toBeInTheDocument(); });
});
