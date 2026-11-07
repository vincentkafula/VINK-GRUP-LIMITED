/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SafetyScreen, RouteControlScreen } from "./AssociationSafety";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const SUMMARY = { success: true, today: "2026-11-02", measures: { accidents: 4, injuries: 3, fatalities: 1, passengerComplaints: 2, disputes: 1, policeMatters: 0, regulatorNotices: 1, open: 3, escalated: 1, averageDaysToResolve: 12, noticesInForce: 1 }, flags: [{ id: "safety:notice:1", severity: "high", message: 'A regulator notice is in force: "Route closure order" (Langa to Bellville) until 2026-11-12' }, { id: "safety:repeat:vehicle:CA 111-111", severity: "medium", message: "Vehicle CA 111-111 has 3 accidents or passenger complaints in the last 12 months" }] };
const EVENTS = [
  { id: "e1", kind: "accident", occurredOn: "2026-10-30", title: "Collision at the exit", description: "Two vehicles", vehicle: "CA 111-111", driver: "Dan Driver", routeLabel: "Langa to Bellville", injuries: 2, fatalities: 0, policeCaseNumber: null, otherAssociation: null, mediator: null, escalatedTo: "none", escalatedOn: null, noticeUntil: null, status: "open", resolvedOn: null, resolution: null, daysOpen: 3 },
  { id: "e2", kind: "inter_association_dispute", occurredOn: "2026-09-20", title: "Route border", description: null, vehicle: null, driver: null, routeLabel: null, injuries: 0, fatalities: 0, policeCaseNumber: null, otherAssociation: "Bellville TA", mediator: null, escalatedTo: "none", escalatedOn: null, noticeUntil: null, status: "open", resolvedOn: null, resolution: null, daysOpen: 43 },
  { id: "e3", kind: "inter_association_dispute", occurredOn: "2026-08-01", title: "Old border", description: null, vehicle: null, driver: null, routeLabel: null, injuries: 0, fatalities: 0, policeCaseNumber: null, otherAssociation: "Khayelitsha TA", mediator: "SANTACO chair", escalatedTo: "santaco", escalatedOn: "2026-08-10", noticeUntil: null, status: "resolved", resolvedOn: "2026-09-01", resolution: "Agreed a border", daysOpen: 31 },
  { id: "e4", kind: "regulator_notice", occurredOn: "2026-10-31", title: "Route closure order", description: null, vehicle: null, driver: null, routeLabel: "Langa to Bellville", injuries: 0, fatalities: 0, policeCaseNumber: null, otherAssociation: null, mediator: null, escalatedTo: "none", escalatedOn: null, noticeUntil: "2026-11-12", status: "open", resolvedOn: null, resolution: null, daysOpen: 2 }];
const CONTROL = { success: true, today: "2026-11-02", windowDays: 30,
  routes: [{ id: "r1", name: "Langa to Bellville", active: true, licensedVehicles: 4, operatingVehicles: 5, saturationRatio: 1.25, band: "over", unlicensedOperating: [{ vehicleId: "v1", registration: "CA 111-111", trips: 2 }], offRoute: [{ vehicleId: "v2", registration: "CA 222-222", licenceRoute: "Khayelitsha", trips: 1 }], nonMemberOperators: [{ vehicleId: "v9", registration: "ZZ 999-999", owner: "Otto Owner", trips: 3 }] }, { id: "r2", name: "Khayelitsha rank", active: true, licensedVehicles: 6, operatingVehicles: 0, saturationRatio: 0, band: "idle", unlicensedOperating: [], offRoute: [], nonMemberOperators: [] }, { id: "r3", name: "Nyanga", active: true, licensedVehicles: 10, operatingVehicles: 9, saturationRatio: 0.9, band: "warning", unlicensedOperating: [], offRoute: [], nonMemberOperators: [] }, { id: "r4", name: "Philippi", active: true, licensedVehicles: 0, operatingVehicles: 2, saturationRatio: null, band: "no_licensed", unlicensedOperating: [], offRoute: [], nonMemberOperators: [] }],
  ranks: [{ id: "k1", name: "Langa rank", departures: 20, approvedExceptions: 5, checked: 15, skips: 5, skipPercent: 33.3, band: "high", skippers: [{ registration: "CA 222-222", skips: 5 }, { registration: "CA 333-333", skips: 2 }] }, { id: "k2", name: "Bellville rank", departures: 4, approvedExceptions: 0, checked: 4, skips: 0, skipPercent: 0, band: "too_few", skippers: [] }],
  unmatchedLicences: [{ vehicleId: "v5", registration: "CA 555-555", licenceRoute: "Mitchells Plain" }], licencesWithoutRoute: [{ vehicleId: "v6", registration: "CA 666-666" }], flags: [{ id: "routes:over:r1", severity: "high", message: "5 vehicles operated on Langa to Bellville in the last 30 days, but 4 are licensed for it: the route is over-supplied" }] };
beforeEach(() => {
  calls = []; routes = (m, p) => {
    if (p === `${P}/safety/summary`) return { body: SUMMARY }; if (p === `${P}/safety/events` && m === "GET") return { body: { success: true, events: EVENTS } }; if (p === `${P}/compliance/vehicles`) return { body: { success: true, vehicles: [{ id: "v1", registration: "CA 111-111" }, { id: "v2", registration: "CA 222-222" }] } }; if (p === `${P}/compliance/drivers`) return { body: { success: true, drivers: [{ id: "d1", name: "Dan Driver" }] } };
    if (p === `${P}/route-control`) return { body: CONTROL }; if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
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
const li = (title: string) => screen.getByText(title, { selector: "b" }).closest("li")!;

describe("safety and conflict", () => {
  it("shows the year's counts, injuries and deaths, what is open, and how long resolved events took, with what stands out", async () => {
    render(<SafetyScreen />); expect(await screen.findByText("4 (3 injured, 1 died)")).toBeInTheDocument(); expect(screen.getByText("3 (1 notice in force)")).toBeInTheDocument(); expect(screen.getByText("Resolved events took 12 days on average.")).toBeInTheDocument(); expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText(/A regulator notice is in force/)).toBeInTheDocument(); expect(screen.getByText(/Vehicle CA 111-111 has 3 accidents/)).toBeInTheDocument();
  });
  it("says nothing has been resolved and nothing needs attention when that is so", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/safety/summary` ? { body: { ...SUMMARY, flags: [], measures: { ...SUMMARY.measures, averageDaysToResolve: null, injuries: 0, fatalities: 0, noticesInForce: 0 } } } : o(m, p, b)))(routes); render(<SafetyScreen />); expect(await screen.findByText("Nothing has been resolved yet.")).toBeInTheDocument(); expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });
  it("lists each event with its kind, vehicle, driver, injuries, other association and notice date, and whether it is open, resolved or escalated", async () => {
    render(<SafetyScreen />); await screen.findByText("Collision at the exit", { selector: "b" }); expect(li("Collision at the exit")).toHaveTextContent("Accident · 2026-10-30 · CA 111-111 · Dan Driver · Langa to Bellville · 2 injured, 0 died"); expect(within(li("Collision at the exit")).getByText("Open 3 days")).toBeInTheDocument(); expect(li("Route border")).toHaveTextContent("with Bellville TA");
    expect(within(li("Old border")).getByText("Resolved in 31 days")).toBeInTheDocument(); expect(within(li("Old border")).getByText("Escalated to SANTACO")).toBeInTheDocument(); expect(li("Route closure order")).toHaveTextContent("until 2026-11-12"); expect(screen.getByText(/visible to whoever holds your association's login/)).toBeInTheDocument();
  });
  it("filters events by kind and says when none match", async () => {
    render(<SafetyScreen />); await screen.findByText("Collision at the exit", { selector: "b" }); pick("Filter events", "regulator_notice"); expect(screen.queryByText("Collision at the exit", { selector: "b" })).toBeNull(); expect(screen.getByText("Route closure order", { selector: "b" })).toBeInTheDocument(); pick("Filter events", "police_matter"); expect(screen.getByText("Nothing of that kind.")).toBeInTheDocument();
  });
  it("asks only for what fits the kind: vehicle, driver, injuries and deaths for an accident; the other association for a dispute; an end date for a notice", async () => {
    render(<SafetyScreen />); await screen.findByText("Collision at the exit", { selector: "b" }); expect(screen.getByLabelText("Event vehicle")).toBeInTheDocument(); expect(screen.getByLabelText("Event injuries")).toBeInTheDocument(); expect(screen.queryByLabelText("Event other association")).toBeNull(); expect(screen.queryByLabelText("Event notice until")).toBeNull();
    pick("Event kind", "inter_association_dispute"); expect(screen.getByLabelText("Event other association")).toBeInTheDocument(); expect(screen.queryByLabelText("Event vehicle")).toBeNull(); expect(screen.queryByLabelText("Event injuries")).toBeNull(); pick("Event kind", "regulator_notice"); expect(screen.getByLabelText("Event notice until")).toBeInTheDocument(); pick("Event kind", "passenger_complaint"); expect(screen.getByLabelText("Event driver")).toBeInTheDocument(); expect(screen.queryByLabelText("Event injuries")).toBeNull();
  });
  it("records an accident with its vehicle, driver and injuries as numbers, and a dispute with the other association", async () => {
    render(<SafetyScreen />); await screen.findByText("Collision at the exit", { selector: "b" }); pick("Event title", "Rear-end collision"); pick("Event date", "2026-11-01"); pick("Event vehicle", "v1"); pick("Event driver", "d1"); pick("Event injuries", "2"); pick("Event fatalities", "0"); pick("Event route", "Langa to Bellville"); fireEvent.click(screen.getByRole("button", { name: "Record event" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/safety/events`, body: { kind: "accident", occurredOn: "2026-11-01", title: "Rear-end collision", description: "", routeLabel: "Langa to Bellville", policeCaseNumber: "", vehicleId: "v1", driverId: "d1", injuries: 2, fatalities: 0 } }));
    pick("Event kind", "inter_association_dispute"); pick("Event title", "Border"); pick("Event other association", "Bellville TA"); fireEvent.click(screen.getByRole("button", { name: "Record event" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ kind: "inter_association_dispute", occurredOn: "2026-11-02".length ? expect.any(String) : "", title: "Border", description: "", routeLabel: "", policeCaseNumber: "", otherAssociation: "Bellville TA" }));
  });
  it("shows the server's reason when an event is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 400, body: { success: false, error: "Give it a short title" } } : o(m, p, b)))(routes); render(<SafetyScreen />); await screen.findByText("Collision at the exit", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: "Record event" })); expect(await screen.findByText("Give it a short title")).toBeInTheDocument();
  });
  it("adds detail to an open event, escalates a dispute to a body, and resolves with how, and offers escalation only for disputes", async () => {
    render(<SafetyScreen />); fireEvent.click(within(await screen.findByText("Collision at the exit", { selector: "b" }).then((b) => b.closest("li")!)).getByRole("button", { name: "Open" })); expect(screen.queryByLabelText("Escalate to")).toBeNull(); pick("Event police case", "CAS 5/2026"); fireEvent.click(screen.getByRole("button", { name: "Save detail" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/safety/events/e1`, body: { policeCaseNumber: "CAS 5/2026", mediator: "", description: "Two vehicles" } })); pick("Resolved on", "2026-11-02"); pick("How resolved", "Insurance claim settled"); fireEvent.click(screen.getByRole("button", { name: "Mark resolved" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/safety/events/e1/resolve`, body: { resolvedOn: "2026-11-02", resolution: "Insurance claim settled" } }));
    cleanup(); render(<SafetyScreen />); fireEvent.click(within((await screen.findByText("Route border", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/Not yet taken to SANTACO or another body for mediation/)).toBeInTheDocument(); pick("Event mediator", "SANTACO chair"); pick("Escalate to", "national_taxi_alliance"); pick("Escalated on", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Record escalation" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/safety/events/e2/escalate`, body: { to: "national_taxi_alliance", on: "2026-11-01", mediator: "SANTACO chair" } }));
  });
  it("shows a resolved event as closed, with how it was resolved, and no way to change it", async () => {
    render(<SafetyScreen />); fireEvent.click(within((await screen.findByText("Old border", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/Resolved on 2026-09-01: Agreed a border. A resolved event can no longer be changed./)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Save detail" })).toBeNull();
  });
  it("says nothing has been recorded when there are no events", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/safety/events` && m === "GET" ? { body: { success: true, events: [] } } : o(m, p, b)))(routes); render(<SafetyScreen />); expect(await screen.findByText("Nothing has been recorded yet.")).toBeInTheDocument(); });
});

describe("route control", () => {
  it("shows each route's vehicles operated and licensed, its ratio, and its band in plain words", async () => {
    render(<RouteControlScreen />); await screen.findByText("Langa to Bellville", { selector: "b" }); expect(li("Langa to Bellville")).toHaveTextContent("5 operated · 4 licensed · ratio 1.25"); expect(within(li("Langa to Bellville")).getByText("Over-supplied")).toBeInTheDocument(); expect(within(li("Khayelitsha rank")).getByText("No vehicles operated")).toBeInTheDocument(); expect(within(li("Nyanga")).getByText("Nearly full")).toBeInTheDocument();
    expect(li("Philippi")).toHaveTextContent("2 operated · 0 licensed"); expect(li("Philippi")).not.toHaveTextContent("ratio"); expect(within(li("Philippi")).getByText("No vehicle licensed for it on record")).toBeInTheDocument(); expect(screen.getByText(/the route is over-supplied/)).toBeInTheDocument();
  });
  it("opens a route to show members' vehicles with no valid licence, those whose licence names another route, and operators who are not members", async () => {
    render(<RouteControlScreen />); fireEvent.click(within((await screen.findByText("Langa to Bellville", { selector: "b" })).closest("li")!).getByRole("button", { name: "Details" })); expect(screen.getByText("CA 111-111: 2 trips")).toBeInTheDocument(); expect(screen.getByText(/CA 222-222: licence names "Khayelitsha", 1 trip here/)).toBeInTheDocument(); expect(screen.getByText("ZZ 999-999 (owner Otto Owner): 3 trips")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(screen.queryByText("CA 111-111: 2 trips")).toBeNull(); fireEvent.click(within(screen.getByText("Nyanga", { selector: "b" }).closest("li")!).getByRole("button", { name: "Details" })); expect(screen.getAllByText("None.")).toHaveLength(3);
  });
  it("shows queue fairness per rank: departures, approved exceptions, how many left out of turn, who, and says when there are too few to judge", async () => {
    render(<RouteControlScreen />); const k = (await screen.findByText("Langa rank", { selector: "b" })).closest("li")!; expect(k).toHaveTextContent("20 departures · 5 approved exceptions · 5 out of turn (33.3%)"); expect(within(k).getByText("Many left out of turn")).toBeInTheDocument(); expect(k).toHaveTextContent("Left out of turn: CA 222-222 (5), CA 333-333 (2)"); expect(within(screen.getByText("Bellville rank", { selector: "b" }).closest("li")!).getByText("Too few departures to judge")).toBeInTheDocument();
    expect(screen.getByText(/approved, with a reason, is counted as an exception, not a skip/)).toBeInTheDocument();
  });
  it("lists the licences that name a route the association does not have, and those with no route, for checking, and explains that the licence is the authority", async () => {
    render(<RouteControlScreen />); expect(await screen.findByText(/CA 555-555: "Mitchells Plain"/)).toBeInTheDocument(); expect(screen.getByText("CA 666-666")).toBeInTheDocument(); expect(screen.getByText(/The licence, not your route list, is the legal authority to operate/)).toBeInTheDocument();
  });
  it("says so when there are no routes or ranks recorded", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/route-control` ? { body: { ...CONTROL, routes: [], ranks: [], flags: [], unmatchedLicences: [], licencesWithoutRoute: [] } } : o(m, p, b)))(routes); render(<RouteControlScreen />); expect(await screen.findByText("You have no routes recorded yet.")).toBeInTheDocument(); expect(screen.getByText("You have no ranks recorded yet.")).toBeInTheDocument(); });
});
