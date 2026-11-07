/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GovernanceScreen, DisciplineScreen } from "./AssociationGovernance";

type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const SUMMARY = { success: true, today: "2026-11-02", settings: { electionIntervalMonths: 36, disciplineLimitDays: 90 }, measures: { meetingsThisYear: 3, upcomingMeetings: 1, averageAttendancePercent: 62.5, openResolutions: 4, overdueResolutions: 1, lastElectionOn: "2024-05-01", nextElectionDue: "2027-05-01", openCases: 2 }, flags: [{ id: "gov:agm", category: "governance", severity: "medium", message: "No annual general meeting is recorded in the last 12 months" }, { id: "gov:election:overdue", category: "governance", severity: "high", message: "An election was due on 2026-05-01 and has not been held (the last was on 2023-05-01)" }] };
const MEETINGS = [
  { id: "m1", heldOn: "2026-10-12", kind: "executive", title: "October exco", venue: "Rank office", agenda: null, minutes: "1. Repairs approved.", minutesAdoptedOn: null, upcoming: false, attendance: [{ name: "Olu Owner", memberId: "o1", status: "present" }, { name: "Guest speaker", memberId: null, status: "apology" }] },
  { id: "m2", heldOn: "2026-09-01", kind: "agm", title: "AGM 2026", venue: null, agenda: null, minutes: "AGM minutes", minutesAdoptedOn: "2026-10-12", upcoming: false, attendance: [] },
  { id: "m3", heldOn: "2026-08-01", kind: "general", title: "August general", venue: null, agenda: null, minutes: null, minutesAdoptedOn: null, upcoming: false, attendance: [] },
  { id: "m4", heldOn: "2026-11-20", kind: "special", title: "Special meeting", venue: null, agenda: null, minutes: null, minutesAdoptedOn: null, upcoming: true, attendance: [] }];
const RESOLUTIONS = [{ id: "r2", number: "2026/02", text: "Repair the lights", meeting: "October exco", actionOwner: "Sipho", dueOn: "2026-10-30", status: "open", overdue: true }, { id: "r1", number: "2026/01", text: "Approve the budget", meeting: null, actionOwner: null, dueOn: null, status: "done", overdue: false }];
const CASES = [
  { id: "c1", subjectKind: "member", subjectName: "Olu Owner", complaint: "Charged R15 000 to join the rank", charge: "Clause 14.2", openedOn: "2026-10-03", hearingOn: null, outcome: null, sanction: null, decidedOn: null, appealLodgedOn: null, appealOutcome: null, closedOn: null, status: "open", daysOpen: 30 },
  { id: "c2", subjectKind: "driver", subjectName: "Dan Driver", complaint: "Reckless driving", charge: null, openedOn: "2026-08-01", hearingOn: "2026-08-20", outcome: "upheld", sanction: "Suspended for a month", decidedOn: "2026-08-22", appealLodgedOn: null, appealOutcome: null, closedOn: null, status: "decided", daysOpen: 93 },
  { id: "c3", subjectKind: "marshal", subjectName: "Mo Marshal", complaint: "Skipped the queue", charge: null, openedOn: "2026-07-01", hearingOn: "2026-07-10", outcome: "upheld", sanction: "Warning", decidedOn: "2026-07-12", appealLodgedOn: "2026-07-15", appealOutcome: null, closedOn: null, status: "appealed", daysOpen: 124 },
  { id: "c4", subjectKind: "other", subjectName: "Visitor", complaint: "Touting", charge: null, openedOn: "2026-05-01", hearingOn: null, outcome: "withdrawn", sanction: null, decidedOn: "2026-05-05", appealLodgedOn: null, appealOutcome: null, closedOn: "2026-05-06", status: "closed", daysOpen: 5 }];
beforeEach(() => {
  calls = []; routes = (m, p) => {
    if (p === `${P}/governance/summary`) return { body: SUMMARY }; if (p === `${P}/governance/meetings` && m === "GET") return { body: { success: true, meetings: MEETINGS } }; if (p === `${P}/governance/resolutions` && m === "GET") return { body: { success: true, resolutions: RESOLUTIONS } };
    if (p === `${P}/governance/elections` && m === "GET") return { body: { success: true, elections: [{ id: "e1", heldOn: "2024-05-01", results: "Chair: Thabo", notes: null, nextDueOn: "2027-05-01" }] } }; if (p === `${P}/governance/declarations` && m === "GET") return { body: { success: true, declarations: [{ id: "d1", name: "Thabo Mokoena", office: "Chairperson", declaredOn: "2026-05-02", none: false, interest: "Owns the garage that services the vehicles" }, { id: "d2", name: "Sipho Dube", office: "Treasurer", declaredOn: "2026-05-02", none: true, interest: null }] } };
    if (p === `${P}/compliance/acceptances`) return { body: { success: true, constitutionVersion: "3", members: [{ memberId: "o1", name: "Olu Owner", acceptedCurrent: true }, { memberId: "o2", name: "Ona Owner", acceptedCurrent: false }] } }; if (p === `${P}/compliance/office-bearers`) return { body: { success: true, officeBearers: [{ id: "b1", name: "Thabo Mokoena", office: "Chairperson" }, { id: "b2", name: "Sipho Dube", office: "Treasurer" }] } };
    if (p === `${P}/governance/cases` && m === "GET") return { body: { success: true, cases: CASES } }; if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
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

describe("governance overview", () => {
  it("shows the year's meetings, average attendance, open and overdue resolutions, the next election, and what needs attention", async () => {
    render(<GovernanceScreen />); expect(await screen.findByText("3")).toBeInTheDocument(); expect(screen.getByText("62.5%")).toBeInTheDocument(); expect(screen.getByText("4 (1 overdue)")).toBeInTheDocument(); expect(screen.getByText("2027-05-01", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Soon")).toBeInTheDocument(); expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText(/No annual general meeting is recorded/)).toBeInTheDocument(); expect(screen.getByText(/has not been held/)).toBeInTheDocument();
  });
  it("says there is no attendance figure and no election date when there are none, and that nothing needs attention", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/governance/summary` ? { body: { ...SUMMARY, flags: [], measures: { ...SUMMARY.measures, averageAttendancePercent: null, nextElectionDue: null, overdueResolutions: 0 } } } : o(m, p, b)))(routes); render(<GovernanceScreen />); expect(await screen.findByText("No data")).toBeInTheDocument(); expect(screen.getByText("Not set")).toBeInTheDocument(); expect(screen.getByText("Nothing needs attention.")).toBeInTheDocument();
  });
});

describe("meetings", () => {
  it("lists each meeting with how its minutes stand, and how many attended", async () => {
    render(<GovernanceScreen />); const li = (name: string) => screen.getByText(name, { selector: "b" }).closest("li")!; await screen.findByText("October exco");
    expect(li("October exco")).toHaveTextContent("Executive committee · 2026-10-12 · Rank office · 1 of 2 present"); expect(within(li("October exco")).getByText("Minutes not adopted")).toBeInTheDocument(); expect(within(li("AGM 2026")).getByText("Minutes adopted 2026-10-12")).toBeInTheDocument(); expect(within(li("August general")).getByText("No minutes")).toBeInTheDocument(); expect(within(li("Special meeting")).getByText("Upcoming")).toBeInTheDocument();
  });
  it("adds a meeting and shows the server's reason when it is refused", async () => {
    render(<GovernanceScreen />); await screen.findByText("October exco"); pick("Meeting title", "November exco"); pick("Meeting kind", "executive"); pick("Meeting date", "2026-11-09"); pick("Meeting venue", "Rank office"); fireEvent.click(screen.getByRole("button", { name: "Add meeting" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/meetings`, body: { kind: "executive", heldOn: "2026-11-09", title: "November exco", venue: "Rank office", agenda: "" } }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 400, body: { success: false, error: "Give the meeting a title" } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Add meeting" })); expect(await screen.findByText("Give the meeting a title")).toBeInTheDocument();
  });
  it("saves minutes, sending the adoption date only when one is set", async () => {
    render(<GovernanceScreen />); const li = (await screen.findByText("October exco", { selector: "b" })).closest("li")!; fireEvent.click(within(li).getByRole("button", { name: "Open" })); fireEvent.change(screen.getByLabelText("Minutes of October exco"), { target: { value: "1. Repairs approved. 2. Budget noted." } }); fireEvent.click(screen.getByRole("button", { name: "Save minutes" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/meetings/m1/minutes`, body: { minutes: "1. Repairs approved. 2. Budget noted.", adoptedOn: null } })); pick("Minutes adopted for October exco", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Save minutes" })); await waitFor(() => expect(writes().at(-1)!.body.adoptedOn).toBe("2026-11-01"));
  });
  it("edits attendance: adds a member (once) and a guest, changes a status, removes someone, and saves the list", async () => {
    render(<GovernanceScreen />); const li = (await screen.findByText("October exco", { selector: "b" })).closest("li")!; fireEvent.click(within(li).getByRole("button", { name: "Open" })); const sel = screen.getByLabelText("Add attendee member"); expect(within(sel).queryByText("Olu Owner")).toBeNull();                                // already listed
    pick("Add attendee member", "o2"); expect(screen.getByText("Ona Owner")).toBeInTheDocument(); expect(within(screen.getByLabelText("Add attendee member")).queryByText("Ona Owner")).toBeNull(); pick("Add attendee guest", "Visiting officer"); fireEvent.click(screen.getByRole("button", { name: "Add guest" })); pick("Add attendee guest", "visiting officer"); fireEvent.click(screen.getByRole("button", { name: "Add guest" }));
    pick("Attendance of Guest speaker", "absent"); fireEvent.click(screen.getByRole("button", { name: "Remove Olu Owner" })); fireEvent.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/meetings/m1/attendance`, body: { attendance: [{ name: "Guest speaker", memberId: null, status: "absent" }, { name: "Ona Owner", memberId: "o2", status: "present" }, { name: "Visiting officer", memberId: null, status: "present" }] } }));      // the guest was not added twice
  });
});

describe("resolutions, elections and declarations", () => {
  it("lists resolutions with an overdue marker, adds one without a meeting, and says which number it got", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/governance/resolutions` ? { status: 201, body: { success: true, id: "n", number: "2026/03" } } : o(m, p, b)))(routes); render(<GovernanceScreen />); const r2 = (await screen.findByText("2026/02", { selector: "b" })).closest("li")!; expect(r2).toHaveTextContent("Repair the lights · October exco · Sipho · due 2026-10-30"); expect(within(r2).getByText("Overdue")).toBeInTheDocument(); expect(screen.getByText("2026/01", { selector: "b" }).closest("li")).toHaveTextContent("Done");
    pick("Resolution text", "Buy a defibrillator"); pick("Resolution owner", "Lerato"); pick("Resolution due", "2026-12-01"); fireEvent.click(screen.getByRole("button", { name: "Record resolution" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/resolutions`, body: { text: "Buy a defibrillator", actionOwner: "Lerato", dueOn: "2026-12-01" } })); expect(await screen.findByText("Recorded as resolution 2026/03.")).toBeInTheDocument();
  });
  it("marks an open resolution done or cancelled, and offers neither for one that is done", async () => {
    render(<GovernanceScreen />); await screen.findByText("2026/02", { selector: "b" }); expect(screen.getAllByRole("button", { name: "Mark done" })).toHaveLength(1); fireEvent.click(screen.getByRole("button", { name: "Mark done" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/resolutions/r2/status`, body: { status: "done" } })); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ status: "cancelled" }));
  });
  it("lists and records elections", async () => {
    render(<GovernanceScreen />); expect((await screen.findByText("2024-05-01", { selector: "b" })).closest("li")).toHaveTextContent("Chair: Thabo · next due 2027-05-01"); pick("Election held", "2026-10-01"); pick("Election results", "Chair: Thabo"); fireEvent.click(screen.getByRole("button", { name: "Record election" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/elections`, body: { heldOn: "2026-10-01", results: "Chair: Thabo", nextDueOn: "" } }));
  });
  it("lists declarations, records 'no interest' by default, and asks for the interest only when there is one", async () => {
    render(<GovernanceScreen />); expect(await screen.findByText(/Owns the garage that services the vehicles/)).toBeInTheDocument(); expect(screen.getByText(/No interest to declare/, { selector: "li" })).toBeInTheDocument(); expect(screen.queryByLabelText("Declared interest")).toBeNull();
    pick("Declaring office bearer", "b2"); pick("Declaration date", "2026-11-02"); fireEvent.click(screen.getByRole("button", { name: "Record declaration" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/declarations`, body: { officeBearerId: "b2", declaredOn: "2026-11-02", none: true } }));
    fireEvent.click(screen.getByLabelText("No interest to declare")); pick("Declared interest", "Brother owns the paint supplier"); fireEvent.click(screen.getByRole("button", { name: "Record declaration" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ officeBearerId: "b2", declaredOn: "2026-11-02", none: false, interest: "Brother owns the paint supplier" }));
  });
});

describe("discipline", () => {
  it("lists each case with how long it has been open (or how long it took), its stage and outcome, and says the people it holds are identifiable", async () => {
    render(<DisciplineScreen />); expect(await screen.findByText(/allegations about identifiable people/)).toBeInTheDocument(); const li = (n: string) => screen.getByText(n, { selector: "b" }).closest("li")!;
    expect(li("Olu Owner")).toHaveTextContent("(member) · opened 2026-10-03 · 30 days open · Clause 14.2"); expect(within(li("Olu Owner")).getAllByText("Open")).toHaveLength(2);                // the stage, and the button that opens the case expect(within(li("Dan Driver")).getByText("Decided: upheld")).toBeInTheDocument(); expect(within(li("Mo Marshal")).getByText("On appeal: upheld")).toBeInTheDocument(); expect(li("Visitor")).toHaveTextContent("closed after 5 days"); expect(within(li("Visitor")).getByText("Closed: withdrawn")).toBeInTheDocument();
    expect(screen.getByText(/this system does not judge anyone/)).toBeInTheDocument();
  });
  it("opens a case about a member from the list (linking them), or about someone by name", async () => {
    render(<DisciplineScreen />); await screen.findByText("Olu Owner", { selector: "b" }); pick("Case member", "o1"); expect(screen.queryByLabelText("Case subject name")).toBeNull(); pick("Case complaint", "Charged too much"); pick("Case opened", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Open case" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/governance/cases`, body: { subjectKind: "member", subjectId: "o1", subjectName: "", complaint: "Charged too much", openedOn: "2026-11-01" } }));
    pick("Case subject kind", "driver"); expect(screen.queryByLabelText("Case member")).toBeNull(); pick("Case subject name", "Dan Driver"); pick("Case complaint", "Reckless"); fireEvent.click(screen.getByRole("button", { name: "Open case" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ subjectKind: "driver", subjectName: "Dan Driver" })); expect(writes().at(-1)!.body).not.toHaveProperty("subjectId");
  });
  it("lets a new case be given its charge and hearing, then an outcome: the sanction is asked for only when upheld", async () => {
    render(<DisciplineScreen />); fireEvent.click(within((await screen.findByText("Olu Owner", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.queryByLabelText("Appeal lodged")).toBeNull(); expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull();
    pick("Case charge", "Clause 14.2, joining fees"); pick("Case hearing", "2026-11-10"); fireEvent.click(screen.getByRole("button", { name: "Save charge and hearing" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/cases/c1`, body: { charge: "Clause 14.2, joining fees", hearingOn: "2026-11-10" } }));
    expect(screen.getByLabelText("Case sanction")).toBeInTheDocument(); pick("Case outcome", "not_upheld"); expect(screen.queryByLabelText("Case sanction")).toBeNull(); pick("Case decided", "2026-11-11"); fireEvent.click(screen.getByRole("button", { name: "Record outcome" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/cases/c1`, body: { outcome: "not_upheld", decidedOn: "2026-11-11" } }));
    pick("Case outcome", "upheld"); pick("Case sanction", "Fined R2 000"); fireEvent.click(screen.getByRole("button", { name: "Record outcome" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ outcome: "upheld", decidedOn: "2026-11-11", sanction: "Fined R2 000" }));
  });
  it("offers an appeal after an outcome, then the appeal's outcome, and closing only when nothing is still open", async () => {
    render(<DisciplineScreen />); fireEvent.click(within((await screen.findByText("Dan Driver", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/Suspended for a month/)).toBeInTheDocument(); expect(screen.queryByLabelText("Case outcome")).toBeNull(); expect(screen.getByRole("button", { name: "Close the case" })).toBeInTheDocument();
    pick("Appeal lodged", "2026-09-01"); fireEvent.click(screen.getByRole("button", { name: "Record appeal" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/cases/c2`, body: { appealLodgedOn: "2026-09-01" } })); fireEvent.click(screen.getByRole("button", { name: "Close the case" })); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ close: true }));
    cleanup(); render(<DisciplineScreen />); fireEvent.click(within((await screen.findByText("Mo Marshal", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/lodged on 2026-07-15 · no outcome yet/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull(); expect(screen.queryByRole("button", { name: "Record appeal" })).toBeNull();
    pick("Appeal outcome", "overturned"); fireEvent.click(screen.getByRole("button", { name: "Record appeal outcome" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/governance/cases/c3`, body: { appealOutcome: "overturned" } }));
  });
  it("says a closed case can no longer be changed, and shows the server's reason when a step is refused", async () => {
    render(<DisciplineScreen />); fireEvent.click(within((await screen.findByText("Visitor", { selector: "b" })).closest("li")!).getByRole("button", { name: "Open" })); expect(screen.getByText(/This case is closed \(2026-05-06\) and can no longer be changed/)).toBeInTheDocument(); fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 409, body: { success: false, error: "Set the hearing before recording an outcome" } } : o(m, p, b)))(routes); fireEvent.click(within(screen.getByText("Olu Owner", { selector: "b" }).closest("li")!).getByRole("button", { name: "Open" })); fireEvent.click(screen.getByRole("button", { name: "Record outcome" })); expect(await screen.findByText("Set the hearing before recording an outcome")).toBeInTheDocument();
  });
  it("says there are no cases", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/governance/cases` && m === "GET" ? { body: { success: true, cases: [] } } : o(m, p, b)))(routes); render(<DisciplineScreen />); expect(await screen.findByText("No cases recorded.")).toBeInTheDocument(); });
});
