/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShiftsPanel, SafetyPanel, WelfarePanel, OverviewPanel } from "./AssociationCare";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; file?: boolean };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const SHIFTS = { success: true, weeks: [{ marshal: "Mo Marshal", week: "2026-10-26", minutes: 3750, limit: 3600, over: true }, { marshal: "Mia Marshal", week: "2026-10-26", minutes: 900, limit: 3600, over: false }], shifts: [
  { id: "s1", marshal: "Mo Marshal", rank: "Langa", startedAt: "2026-10-27T04:00:00Z", endedAt: "2026-10-27T16:30:00Z", inProgress: false, workedMinutes: 690, breakMinutes: 0, source: "auto", status: "proposed", corrected: false, note: null, flags: ["over_shift_limit", "no_break_noted"] },
  { id: "s2", marshal: "Mia Marshal", rank: "Bellville", startedAt: "2026-10-28T04:00:00Z", endedAt: "2026-10-28T09:00:00Z", inProgress: false, workedMinutes: 270, breakMinutes: 30, source: "manual", status: "approved", corrected: true, note: "Morning", flags: [] },
  { id: "s3", marshal: "Mo Marshal", rank: "Langa", startedAt: "2026-10-29T04:00:00Z", endedAt: null, inProgress: true, workedMinutes: 120, breakMinutes: 0, source: "auto", status: "proposed", corrected: false, note: null, flags: [] }] };
const INCIDENTS = { success: true, newCount: 1, incidents: [{ id: "i1", rank: "Langa", type: "robbery", occurredAt: "2026-11-01T05:00:00Z", note: "Two men at the back of the rank", hasPhoto: true, status: "new", reporter: "Mo Marshal" }, { id: "i2", rank: "Bellville", type: "overcrowding", occurredAt: "2026-10-30T05:00:00Z", note: null, hasPhoto: false, status: "closed", reporter: "Mia Marshal" }] };
const RISK = { success: true, ranks: [{ rank: "Langa", total: 3, score: 11, level: "high", byType: { robbery: 1, threat: 1, fight: 1 }, byPeriod: { night: 1, morning: 1, afternoon: 1, evening: 0 } }, { rank: "Bellville", total: 0, score: 0, level: "low", byType: {}, byPeriod: { night: 0, morning: 0, afternoon: 0, evening: 0 } }] };
const KPIS = { success: true, kpis: { from: "2026-10-04", to: "2026-11-02", totalFaresCents: 31500, trips: 3, tapPassengers: 21, cashPassengersEstimate: 4, tapSharePercent: 84, commissionPaidCents: 8000, commissionIssuedCents: 12000, payslipsIssued: 2, disputesOpen: 1, disputesResolved: 2, incidents: 4, averageShiftMinutes: 330, marshals: 5, verifiedProfiles: 2 } };
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p.startsWith("/api/portal/association/shifts") && m === "GET") return { body: SHIFTS }; if (p.startsWith("/api/portal/association/incidents") && m === "GET" && !p.includes("/photo")) return { body: INCIDENTS };
    if (p === "/api/portal/association/incidents/i1/photo") return { body: { success: true, photo: "data:image/png;base64,iVBORw0KGgo=" } }; if (p.startsWith("/api/portal/association/risk-map")) return { body: RISK };
    if (p === "/api/portal/association/patterns") return { body: { success: true, patterns: [{ rank: "Langa", kind: "cash_share_up", message: "Cash share at Langa is 30 points above its 4-week average", nowPercent: 40, basePercent: 10, passengers: 40 }] } };
    if (p.startsWith("/api/portal/association/grievances") && m === "GET") return { body: { success: true, grievances: [{ id: "g1", category: "pay", message: "My advance was taken twice", status: "open", response: null, marshal: "Mo Marshal", createdAt: "2026-11-01T05:00:00Z" }, { id: "g2", category: "hours", message: "Too many hours", status: "resolved", response: "Fixed the roster", marshal: "Mia Marshal", createdAt: "2026-10-30T05:00:00Z" }] } };
    if (p.startsWith("/api/portal/association/welfare-insights")) return { body: { success: true, total: 8, open: 3, byCategory: { pay: 4, safety: 2, hours: 2 }, byStatus: {}, averageHoursToAnswer: 6.5 } };
    if (p === "/api/portal/association/benefits" && m === "GET") return { body: { success: true, marshals: [{ id: "m1", name: "Mo Marshal", contributions: { uifCents: 200, stokvelCents: 1000, associationFeeCents: 0 }, benefits: [{ kind: "uif", status: "registered", reference: "UIF-77", contributedCents: 200 }, { kind: "injury_cover", status: "not_registered", reference: null, contributedCents: null }, { kind: "savings", status: "pending", reference: null, contributedCents: 1000 }, { kind: "funeral", status: "not_registered", reference: null, contributedCents: 1000 }] }] } };
    if (p.startsWith("/api/portal/association/kpis.")) return { body: "x", file: true }; if (p.startsWith("/api/portal/association/kpis")) return { body: KPIS };
    if (p === "/api/portal/association/ranks") return { body: { success: true, ranks: [{ id: "k1", name: "Langa" }, { id: "k2", name: "Bellville" }] } }; if (p === "/api/portal/association/commission/marshals") return { body: { success: true, marshals: [{ id: "m1", name: "Mo Marshal" }, { id: "m2", name: "Mia Marshal" }] } };
    if (p === "/api/portal/association/work-record/m1") return { body: { success: true, record: { startDate: "2026-08-15", tenureDays: 83, totalTrips: 312, verified: false, missing: ["consent to keep payroll records"], ranks: [{ rank: "Langa", trips: 250 }] } } };
    if (m === "POST" || m === "PUT") return { body: { success: true } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    if (r.file) return new Response("x", { status: 200, headers: { "content-type": "application/pdf" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("shifts and hours", () => {
  it("lists shifts with hours, notes and flags, names the weeks over the agreed hours (and only those), and offers a decision only on shifts that are finished and waiting", async () => {
    render(<ShiftsPanel />); expect(await screen.findAllByText("Mo Marshal")).not.toHaveLength(0); expect(screen.getByText("11 h 30 min")).toBeInTheDocument(); expect(screen.getByText(/Over the agreed shift · No break noted/)).toBeInTheDocument(); expect(screen.getByText(/added by the marshal · corrected · break 30 min · Morning/)).toBeInTheDocument();
    expect(screen.getByText(/Mo Marshal: 62 h 30 min in the week of 2026-10-26 \(agreed 60 h 0 min\)/)).toBeInTheDocument(); expect(screen.queryByText(/Mia Marshal: 15 h/)).toBeNull(); expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);                 // the in-progress one has no decision yet
  });
  it("approves and rejects, finds shifts from activity saying how many, and asks for the chosen period", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/shifts/detect") ? { body: { success: true, found: 3 } } : o(m, p, b)))(routes);
    render(<ShiftsPanel />); await screen.findByText("11 h 30 min"); fireEvent.click(screen.getByRole("button", { name: "Approve" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/shifts/s1/decide", body: { decision: "approved" } }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ decision: "rejected" }));
    fireEvent.click(screen.getByRole("button", { name: "Find shifts from activity" })); expect(await screen.findByText("3 new shifts found.")).toBeInTheDocument(); fireEvent.change(screen.getByLabelText("Shifts from"), { target: { value: "2026-10-01" } }); await waitFor(() => expect(calls.at(-1)!.path).toMatch(/\/shifts\?from=2026-10-01&to=/));
  });
  it("shows the server's reason when a decision is refused, and says when there are no shifts", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/decide") ? { status: 409, body: { success: false, error: "That shift is not waiting for a decision" } } : o(m, p, b)))(routes); render(<ShiftsPanel />); await screen.findByText("11 h 30 min"); fireEvent.click(screen.getByRole("button", { name: "Approve" })); expect(await screen.findByText("That shift is not waiting for a decision")).toBeInTheDocument(); cleanup();
    routes = (m, p) => (p.includes("/shifts") ? { body: { success: true, shifts: [], weeks: [] } } : undefined); render(<ShiftsPanel />); expect(await screen.findByText("No shifts in this period.")).toBeInTheDocument();
  });
});

describe("safety", () => {
  it("says how many reports are new, shows each with who sent it and what they wrote, and offers only the actions that still apply", async () => {
    render(<SafetyPanel />); expect(await screen.findByText("1 new report waiting.")).toBeInTheDocument(); expect(screen.getByText(/at Langa .*reported by Mo Marshal/)).toBeInTheDocument(); expect(screen.getByText("Two men at the back of the rank")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Acknowledge" })).toHaveLength(1); expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);                           // the closed one has neither
  });
  it("shows a report's photo only when asked, acknowledges and closes with the right request, and shows a refusal", async () => {
    render(<SafetyPanel />); fireEvent.click(await screen.findByText("View photo")); expect(await screen.findByAltText("Photo sent with the report")).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo="); fireEvent.click(screen.getByText("Hide photo")); expect(screen.queryByAltText("Photo sent with the report")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/incidents/i1/ack", body: { status: "acknowledged" } }));
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/ack") ? { status: 409, body: { success: false, error: "That report is already closed" } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(await screen.findByText("That report is already closed")).toBeInTheDocument();
  });
  it("shows the risk by rank with its level, score, what happened and when, and says what the score means", async () => {
    render(<SafetyPanel />); const row = (await screen.findByText("Langa", { selector: "td" })).closest("tr")!; expect(within(row).getByText("high")).toBeInTheDocument(); expect(within(row).getByText("11")).toBeInTheDocument(); expect(within(row).getByText("Robbery 1, Threat 1, Fight 1")).toBeInTheDocument();
    expect(within(screen.getByText("Bellville", { selector: "td" }).closest("tr")!).getByText("none")).toBeInTheDocument(); expect(screen.getByText(/robbery 5; threat, fight and injury 3/)).toBeInTheDocument(); expect(screen.getByText(/Night is 21:00 to 05:00 South African time/)).toBeInTheDocument();
  });
  it("describes a change at a rank, never a person, and says so when nothing has changed", async () => {
    render(<SafetyPanel />); expect(await screen.findByText(/Cash share at Langa is 30 points above its 4-week average/)).toBeInTheDocument(); expect(screen.getByText(/40% this week against 10%, over 40 passengers/)).toBeInTheDocument(); expect(screen.getByText(/not a finding about anyone/)).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/patterns" ? { body: { success: true, patterns: [] } } : o(m, p, b)))(routes); render(<SafetyPanel />); expect(await screen.findByText("Nothing has changed enough to flag this week.")).toBeInTheDocument();
  });
});

describe("marshal welfare", () => {
  it("summarises what marshals are raising without names, and lists complaints with their answers", async () => {
    render(<WelfarePanel />); expect(await screen.findByText(/raised,/)).toHaveTextContent("8 raised, 3 still open, answered in 6.5 hours on average."); expect(screen.getByText("pay 4 · safety 2 · hours 2")).toBeInTheDocument(); expect(await screen.findByText(/My advance was taken twice/)).toBeInTheDocument(); expect(screen.getByText(/Answer: Fixed the roster/)).toBeInTheDocument();
  });
  it("answers a complaint with the status and the words the marshal will see, only while it is open, and filters by status", async () => {
    render(<WelfarePanel />); await screen.findByText(/My advance was taken twice/); expect(screen.getAllByLabelText("Answer status")).toHaveLength(1); fireEvent.change(screen.getByLabelText("Answer to the marshal"), { target: { value: "Refunded the second deduction" } }); fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/grievances/g1/respond", body: { status: "resolved", response: "Refunded the second deduction" } })); expect(await screen.findByText("Answered.")).toBeInTheDocument();
    pick("Show complaints", "open"); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/association/grievances?status=open"));
  });
  it("shows the server's reason when an answer is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/respond") ? { status: 400, body: { success: false, error: "Give the answer, so the marshal sees it" } } : o(m, p, b)))(routes); render(<WelfarePanel />); await screen.findByText(/My advance was taken twice/); fireEvent.click(screen.getByRole("button", { name: "Answer" })); expect(await screen.findByText("Give the answer, so the marshal sees it")).toBeInTheDocument();
  });
  it("shows each marshal's cover and what they have paid in, and records a change of status with the reference", async () => {
    render(<WelfarePanel />); expect(await screen.findByText(/UIF paid in/)).toHaveTextContent(`UIF paid in ${R(200)} · savings and funeral paid in ${R(1000)}`); expect(screen.getByLabelText("UIF reference for Mo Marshal")).toHaveValue("UIF-77");
    fireEvent.change(screen.getByLabelText("Injury cover reference for Mo Marshal"), { target: { value: "INJ-9" } }); pick("Injury cover for Mo Marshal", "registered"); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/association/benefits", body: { marshalId: "m1", kind: "injury_cover", status: "registered", reference: "INJ-9" } }));
  });
});

describe("the overview", () => {
  it("shows fares, trips, tap share, commission, queries, incidents, shift length and verified profiles, and says the cash share is an estimate", async () => {
    render(<OverviewPanel />); expect(await screen.findByText(R(31500))).toBeInTheDocument(); expect(screen.getByText("84%")).toBeInTheDocument(); expect(screen.getByText(/Commission issued:/)).toHaveTextContent(`Commission issued: ${R(12000)} (paid ${R(8000)})`); expect(screen.getByText(/Queries:/)).toHaveTextContent("Queries: 1 open, 2 resolved");
    expect(screen.getByText(/Average shift:/)).toHaveTextContent("Average shift: 5 h 30 min"); expect(screen.getByText(/Verified profiles:/)).toHaveTextContent("Verified profiles: 2 of 5"); expect(screen.getByText(/the rest is an estimate of cash, not a count/)).toBeInTheDocument();
  });
  it("asks for the chosen rank, marshal and period, and says so when no passengers were counted", async () => {
    render(<OverviewPanel />); await screen.findByText(R(31500)); pick("Overview rank", "k1"); await waitFor(() => expect(calls.at(-1)!.path).toMatch(/kpis\?from=.*&to=.*&rankId=k1$/)); pick("Overview marshal", "m1"); await waitFor(() => expect(calls.at(-1)!.path).toMatch(/rankId=k1&marshalId=m1$/)); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p.startsWith("/api/portal/association/kpis?") ? { body: { success: true, kpis: { ...KPIS.kpis, tapSharePercent: null, averageShiftMinutes: null } } } : o(m, p, b)))(routes); render(<OverviewPanel />); expect(await screen.findByText("No counts yet")).toBeInTheDocument(); expect(screen.getByText(/Average shift:/)).toHaveTextContent("no shifts");
  });
  it("downloads the overview as CSV and PDF with the same filters, and shows a failure", async () => {
    render(<OverviewPanel />); await screen.findByText(R(31500)); pick("Overview rank", "k2"); fireEvent.click(screen.getByRole("button", { name: /Download CSV/ })); await waitFor(() => expect(calls.at(-1)!.path).toMatch(/kpis\.csv\?from=.*&to=.*&rankId=k2$/)); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ })); await waitFor(() => expect(calls.at(-1)!.path).toMatch(/kpis\.pdf\?/)); routes = ((o) => (m: string, p: string, b: any) => (p.includes("kpis.pdf") ? { status: 500, body: { error: "The PDF could not be made" } } : o(m, p, b)))(routes);
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ })); expect(await screen.findByText("The PDF could not be made")).toBeInTheDocument();
  });
  it("shows a marshal's work record and whether it counts as verified", async () => {
    render(<OverviewPanel />); await screen.findByText(R(31500)); pick("Record marshal", "m1"); expect(await screen.findByText(/Started 2026-08-15 · 83 days · 312 trips · Langa 250/)).toBeInTheDocument(); expect(screen.getByText(/Not yet verified: needs consent to keep payroll records/)).toBeInTheDocument();
  });
  it("checks a proof-of-income letter by number and code: genuine, not recognised, or genuine but changed since", async () => {
    render(<OverviewPanel />); await screen.findByText(R(31500)); const check = async (reply: any) => { routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/income-letters/verify") ? { body: { success: true, ...reply } } : o(m, p, b)))(routes); fireEvent.change(screen.getByLabelText("Letter number"), { target: { value: "IL-20261102-M0001-1" } }); fireEvent.change(screen.getByLabelText("Letter code"), { target: { value: "AB12CD34EF56" } }); fireEvent.click(screen.getByRole("button", { name: "Check" })); };
    await check({ valid: true, marshal: "Mo Marshal", from: "2026-08-02", to: "2026-11-02", issuedAt: "2026-11-02T08:00:00Z", intact: true }); expect(await screen.findByRole("status")).toHaveTextContent("Genuine. Issued to Mo Marshal on 2026-11-02, covering 2026-08-02 to 2026-11-02."); expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/income-letters/verify", body: { number: "IL-20261102-M0001-1", code: "AB12CD34EF56" } });
    await check({ valid: false }); expect(await screen.findByText(/Not recognised\./)).toBeInTheDocument(); await check({ valid: true, marshal: "Mo Marshal", from: "a", to: "b", issuedAt: "2026-11-02T08:00:00Z", intact: false }); expect(await screen.findByText(/should not be relied on/)).toBeInTheDocument();
  });
});
