/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShiftsScreen, SafetyScreen, VoiceScreen, MyRecordScreen, CashOutCard, OutboxBar, shrinkPhoto } from "./MarshalCare";
import { pending } from "./offlineQueue";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown };
let routes: (method: string, path: string, body: any) => Reply | undefined | "offline", calls: { method: string; path: string; body: any }[];
const RANKS = { success: true, ranks: [{ id: "k1", name: "Langa" }] }, TWO_RANKS = { success: true, ranks: [{ id: "k1", name: "Langa" }, { id: "k2", name: "Bellville" }] };
const SHIFTS = { success: true, weeks: [{ week: "2026-10-26", minutes: 3750, limit: 3600, over: true }], shifts: [
  { id: "s1", rank: "Langa", startedAt: "2026-10-27T04:00:00Z", endedAt: "2026-10-27T16:30:00Z", inProgress: false, workedMinutes: 690, breakMinutes: 0, source: "auto", status: "proposed", corrected: false, note: null, flags: ["over_shift_limit", "no_break_noted"] },
  { id: "s2", rank: "Langa", startedAt: "2026-10-28T04:00:00Z", endedAt: "2026-10-28T10:00:00Z", inProgress: false, workedMinutes: 330, breakMinutes: 30, source: "manual", status: "approved", corrected: true, note: "x", flags: [] }] };
const RECORD = { success: true, record: { marshalNumber: "M-0001", startDate: "2026-08-15", tenureDays: 83, totalTrips: 312, ranks: [{ rank: "Langa", trips: 250, first: "2026-08-15", last: "2026-11-01" }, { rank: "Bellville", trips: 62, first: "2026-09-01", last: "2026-10-20" }], earningsByMonth: [{ month: "2026-10", earnedCents: 96000, deductionsCents: 15000, netCents: 81000, trips: 120 }], verified: false, missing: ["consent to keep payroll records"] } };
const BENEFITS = { success: true, contributions: { uifCents: 200, stokvelCents: 1000, associationFeeCents: 0 }, benefits: [{ kind: "uif", status: "registered", reference: "UIF-77", since: null, contributedCents: 200 }, { kind: "injury_cover", status: "not_registered", reference: null, since: null, contributedCents: null }, { kind: "savings", status: "pending", reference: null, since: null, contributedCents: 1000 }, { kind: "funeral", status: "not_registered", reference: null, since: null, contributedCents: 1000 }] };
const LETTER = { id: "l1", number: "IL-20261102-M0001-1", monthsCovered: 3, from: "2026-08-02", to: "2026-11-02", issuedAt: "2026-11-02T08:00:00Z", verificationCode: "AB12CD34EF56", intact: true, months: [{ month: "2026-10", payslips: 2, trips: 175, earnedCents: 70000, deductionsCents: 5000, netCents: 65000 }], totals: { earnedCents: 70000, deductionsCents: 5000, netCents: 65000, trips: 175 }, note: "It is not a certificate of employment." };
beforeEach(() => {
  calls = []; Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); localStorage.clear();
  routes = (m, p) => {
    if (p === "/api/portal/marshal/ranks") return { body: RANKS }; if (p.startsWith("/api/portal/marshal/shifts") && m === "GET") return { body: SHIFTS }; if (m === "POST" || m === "PUT") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
    if (p === "/api/portal/marshal/incidents") return { body: { success: true, incidents: [{ id: "i1", rank: "Langa", type: "robbery", occurredAt: "2026-11-01T05:00:00Z", status: "acknowledged" }, { id: "i2", rank: "Langa", type: "threat", occurredAt: "2026-11-02T05:00:00Z", status: "new" }] } };
    if (p === "/api/portal/marshal/grievances") return { body: { success: true, grievances: [{ id: "g1", category: "pay", message: "My advance was taken twice", status: "resolved", response: "Refunded", respondedBy: "Your association", createdAt: "2026-11-01T05:00:00Z" }, { id: "g2", category: "hours", message: "Too many hours", status: "open", response: null, respondedBy: null, createdAt: "2026-11-02T05:00:00Z" }] } };
    if (p === "/api/portal/marshal/work-record") return { body: RECORD }; if (p === "/api/portal/marshal/benefits") return { body: BENEFITS };
    if (p === "/api/portal/marshal/profile") return { body: { success: true, profile: { marshalNumber: "M-0001", language: "en", class: "independent" }, consents: [{ purpose: "income_letter", granted: false }] } };
    if (p === "/api/portal/marshal/income-letters") return { body: { success: true, letters: [{ id: "l1", number: LETTER.number, months: 3, issuedAt: LETTER.issuedAt }] } }; if (p === "/api/portal/marshal/income-letters/l1") return { body: { success: true, letter: LETTER } };
    if (p === "/api/portal/marshal/cash-out") return { body: { success: true, enabled: true, availableCents: 4000, outstandingCents: 1500, maxCents: 500, capBp: 5000 } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (r === "offline") throw new TypeError("Failed to fetch"); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const offline = () => { const o = routes; routes = (m, p, b) => (m === "GET" ? o(m, p, b) : "offline"); };
const REF = expect.stringMatching(/^[A-Za-z0-9._-]{8,80}$/);

describe("waiting to send", () => {
  it("shows nothing when nothing is waiting, and what is waiting (with a way to send it) when something is", async () => {
    const a = render(<OutboxBar />); expect(a.container.textContent).toBe(""); a.unmount();
    localStorage.setItem("vink.marshal.outbox.v1", JSON.stringify([{ ref: "ref-aaaa-0001", method: "POST", path: "/incidents", body: { clientRef: "ref-aaaa-0001" }, label: "Safety report", at: "t" }, { ref: "ref-bbbb-0002", method: "POST", path: "/grievances", body: { clientRef: "ref-bbbb-0002" }, label: "Complaint", at: "t" }]));
    routes = () => "offline"; render(<OutboxBar />); expect(await screen.findByText(/Waiting to send/)).toHaveTextContent("Waiting to send: 2 (Safety report, Complaint)"); expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
  it("lists changes the server refused, so none is lost silently, and lets the marshal dismiss them", async () => {
    localStorage.setItem("vink.marshal.outbox.rejected.v1", JSON.stringify([{ label: "Shift", error: "That overlaps a shift you already have", at: "t" }])); render(<OutboxBar />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Shift: That overlaps a shift you already have"); fireEvent.click(screen.getByText("Dismiss")); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("my shifts", () => {
  it("shows the week against the agreed week, and each shift with its hours, status and flags", async () => {
    render(<ShiftsScreen />); expect(await screen.findByText(/Week of 2026-10-26/)).toHaveTextContent("Week of 2026-10-26: 62 h 30 min, over the agreed 60 h 0 min"); expect(screen.getByText("11 h 30 min")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for approval.*Longer than the agreed shift, No break noted/)).toBeInTheDocument(); expect(screen.getByText(/Approved · corrected by you · added by you · break 30 min/)).toBeInTheDocument(); expect(calls[0].path).toMatch(/^\/api\/portal\/marshal\/ranks$|\/shifts$/);
  });
  it("corrects a shift sending only what changed and the reason, and says it goes back for approval", async () => {
    render(<ShiftsScreen />); await screen.findByText("11 h 30 min"); fireEvent.click(screen.getAllByText("Correct")[0]); fireEvent.change(screen.getAllByLabelText("Break (minutes)")[0], { target: { value: "45" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/marshal/shifts/s1", body: { breakMinutes: 45 } })); expect(await screen.findByText(/Your association will approve it again/)).toBeInTheDocument();
  });
  it("shows the server's reason when a correction is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "Say why the times are changed" } } : o(m, p, b)))(routes);
    render(<ShiftsScreen />); await screen.findByText("11 h 30 min"); fireEvent.click(screen.getAllByText("Correct")[0]); fireEvent.change(screen.getAllByLabelText("Ended")[0], { target: { value: "2026-10-27T19:00" } }); fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]); expect(await screen.findByText("Say why the times are changed")).toBeInTheDocument();
  });
  it("adds a shift with a reference so a resend does nothing twice, and keeps it on the phone with no signal", async () => {
    render(<ShiftsScreen />); await screen.findByText("11 h 30 min"); fireEvent.change(screen.getByLabelText("Shift rank"), { target: { value: "k1" } }); fireEvent.change(screen.getByLabelText("Shift started"), { target: { value: "2026-10-29T06:00" } }); fireEvent.change(screen.getByLabelText("Shift ended"), { target: { value: "2026-10-29T12:00" } }); fireEvent.change(screen.getByLabelText("Shift note"), { target: { value: "Worked the morning" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" }).at(-1)!); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: "/api/portal/marshal/shifts", body: { rankId: "k1", breakMinutes: 0, note: "Worked the morning", clientRef: REF } })); expect(await screen.findByText("Sent.")).toBeInTheDocument(); expect(pending()).toEqual([]);
    offline(); fireEvent.change(screen.getByLabelText("Shift started"), { target: { value: "2026-10-30T06:00" } }); fireEvent.change(screen.getByLabelText("Shift ended"), { target: { value: "2026-10-30T12:00" } }); fireEvent.change(screen.getByLabelText("Shift note"), { target: { value: "Offline day" } }); fireEvent.click(screen.getAllByRole("button", { name: "Save" }).at(-1)!);
    expect(await screen.findByText("Saved on your phone. It will send when you have signal.")).toBeInTheDocument(); expect(pending()).toHaveLength(1); expect(pending()[0]).toMatchObject({ path: "/shifts", label: "Shift", body: { note: "Offline day" } });
  });
  it("says there are no shifts yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/shifts") ? { body: { success: true, shifts: [], weeks: [] } } : o(m, p, b)))(routes); render(<ShiftsScreen />); expect(await screen.findByText(/No shifts in the last two weeks/)).toBeInTheDocument(); });
});

describe("reporting a problem at the rank", () => {
  it("sends a report in two taps at the marshal's only rank, with the reference, and says the association has been told", async () => {
    render(<SafetyScreen />); await screen.findByText("My reports"); fireEvent.click(screen.getByRole("button", { name: "Robbery" })); fireEvent.change(screen.getByLabelText("Incident note"), { target: { value: "Two men at the back" } }); fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: "/api/portal/marshal/incidents", body: { rankId: "k1", type: "robbery", note: "Two men at the back", clientRef: REF } })); expect(await screen.findByText("Reported. Your association has been told.")).toBeInTheDocument();
  });
  it("asks which rank when the marshal has several, keeps the report on the phone with no signal, and shows their own reports with what became of them", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/marshal/ranks" ? { body: TWO_RANKS } : o(m, p, b)))(routes); render(<SafetyScreen />); await screen.findByText("Robbery");
    fireEvent.click(screen.getByRole("button", { name: "Fight" })); fireEvent.click(screen.getByRole("button", { name: "Send report" })); expect(await screen.findByText("Choose which rank")).toBeInTheDocument(); expect(writes()).toEqual([]);
    fireEvent.change(screen.getByLabelText("Incident rank"), { target: { value: "k2" } }); offline(); fireEvent.click(screen.getByRole("button", { name: "Send report" })); expect(await screen.findByText("Saved on your phone. It will send when you have signal.")).toBeInTheDocument();
    expect(pending()[0]).toMatchObject({ label: "Safety report", body: { rankId: "k2", type: "fight" } }); expect(screen.getByText("Seen by your association")).toBeInTheDocument(); expect(screen.getByText("Sent")).toBeInTheDocument();
  });
  it("says so when a photo cannot be made small enough, and does not send it", async () => {
    render(<SafetyScreen />); await screen.findByText("My reports"); fireEvent.click(screen.getByRole("button", { name: "Injury" })); fireEvent.change(screen.getByLabelText("Incident photo"), { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText(/could not be made small enough/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Send report" })); await waitFor(() => expect(writes().at(-1)!.body.photo).toBeUndefined());
    expect(await shrinkPhoto(new File(["x"], "p.jpg"))).toBeNull();
  });
  it("shows the server's refusal", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 403, body: { success: false, error: "You do not work at that rank" } } : o(m, p, b)))(routes); render(<SafetyScreen />); await screen.findByText("My reports"); fireEvent.click(screen.getByRole("button", { name: "Threat" })); fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("You do not work at that rank")).toBeInTheDocument(); expect(pending()).toEqual([]);
  });
});

describe("my voice", () => {
  it("sends a complaint with a reference, offers every theme, and shows what was raised with the answers", async () => {
    render(<VoiceScreen />); expect(await screen.findByText(/My advance was taken twice/)).toBeInTheDocument(); expect(within(screen.getByLabelText("Complaint about")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pay", "Hours", "Safety", "Queue", "Conditions", "Benefits", "Other"]);
    expect(screen.getByText(/Your association: Refunded/)).toBeInTheDocument(); expect(screen.getByText("Waiting for an answer")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Complaint about"), { target: { value: "safety" } }); fireEvent.change(screen.getByLabelText("Complaint text"), { target: { value: "No lighting at the rank" } }); fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: "/api/portal/marshal/grievances", body: { category: "safety", message: "No lighting at the rank", clientRef: REF } })); expect(await screen.findByText("Sent. Your association will answer here.")).toBeInTheDocument();
  });
  it("keeps a complaint on the phone with no signal, and shows the server's reason when it refuses", async () => {
    render(<VoiceScreen />); await screen.findByText(/Too many hours/); offline(); fireEvent.change(screen.getByLabelText("Complaint text"), { target: { value: "Pay was late again" } }); fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Saved on your phone. It will send when you have signal.")).toBeInTheDocument(); expect(pending()[0]).toMatchObject({ label: "Complaint", body: { message: "Pay was late again" } });
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 400, body: { success: false, error: "Say what the matter is, in 5 to 500 characters" } } : o(m, p, b)))(routes); fireEvent.change(screen.getByLabelText("Complaint text"), { target: { value: "no" } }); fireEvent.click(screen.getByRole("button", { name: "Send" })); expect(await screen.findByText(/5 to 500 characters/)).toBeInTheDocument();
  });
});

describe("my record", () => {
  it("shows tenure, trips, ranks and earnings by month, and says plainly what is still needed to count as verified", async () => {
    render(<MyRecordScreen />); expect(await screen.findByText("2026-08-15")).toBeInTheDocument(); expect(screen.getByText("312")).toBeInTheDocument(); expect(screen.getAllByText("M-0001").length).toBeGreaterThan(0); expect(screen.getByText(/Not yet verified.*consent to keep payroll records/)).toBeInTheDocument();
    expect(screen.getByText("Langa: 250 trips (2026-08-15 to 2026-11-01)")).toBeInTheDocument(); const row = screen.getByText("2026-10").closest("tr")!; for (const t of ["120", R(96000), R(81000)]) expect(within(row).getByText(t)).toBeInTheDocument();
  });
  it("shows cover and what has been paid in, read from payslips", async () => {
    render(<MyRecordScreen />); expect(await screen.findByText(/UIF \(UIF-77\)/)).toBeInTheDocument(); expect(screen.getByText(new RegExp(`Registered · paid in so far ${R(200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeInTheDocument(); expect(screen.getByText(/Pending · paid in so far/)).toBeInTheDocument(); expect(screen.getAllByText(/^Not registered/).length).toBe(2);
  });
  it("needs consent for the letter, makes it for 3 or 6 months, and shows it with its code, totals, a PDF and a WhatsApp share", async () => {
    render(<MyRecordScreen />); await screen.findByText("Proof of income"); fireEvent.click(screen.getByRole("checkbox")); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/marshal/consents/income_letter", body: { granted: true } }));
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "6" } }); fireEvent.click(screen.getByRole("button", { name: "Create letter" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/marshal/income-letters", body: { months: 6 } }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/income-letters") ? { status: 201, body: { success: true, letter: LETTER } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Create letter" }));
    expect(await screen.findByText(/Letter IL-20261102-M0001-1 · code AB12CD34EF56/)).toBeInTheDocument(); expect(screen.getByText(/Total over 3 months/)).toHaveTextContent(`earned ${R(70000)}, net ${R(65000)}`); expect(screen.getByRole("button", { name: /Download PDF/ })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: "Share on WhatsApp" }) as HTMLAnchorElement; const msg = decodeURIComponent(wa.href.split("text=")[1]); expect(msg).toContain("AB12CD34EF56"); expect(msg).toContain("The association can confirm this letter");
  });
  it("shows the server's reason when there is no consent, and warns when a payslip behind a letter has changed", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/income-letters") ? { status: 403, body: { success: false, error: "Give your consent for income letters first" } } : p === "/api/portal/marshal/income-letters/l1" ? { body: { success: true, letter: { ...LETTER, intact: false } } } : o(m, p, b)))(routes);
    render(<MyRecordScreen />); await screen.findByText("Proof of income"); fireEvent.click(screen.getByRole("button", { name: "Create letter" })); expect(await screen.findByText("Give your consent for income letters first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" })); expect(await screen.findByText("A payslip behind this letter has changed since it was made. Make a new letter.")).toBeInTheDocument();
  });
});

describe("drawing earned commission", () => {
  it("is not shown when the association has not switched it on", async () => { routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/cash-out") ? { body: { success: true, enabled: false, availableCents: 0, outstandingCents: 0, maxCents: 0, capBp: 5000 } } : o(m, p, b)))(routes); const a = render(<CashOutCard />); await waitFor(() => expect(calls.length).toBeGreaterThan(0)); expect(a.container.textContent).toBe(""); });
  it("shows what can be drawn and what is already drawn, and requests the amount in cents (a comma decimal works)", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/cash-out") ? { status: 201, body: { success: true, reference: "ACC-0002", amountCents: 450, maxCents: 50 } } : o(m, p, b)))(routes);
    render(<CashOutCard />); expect(await screen.findByText(/You can draw up to/)).toHaveTextContent(`You can draw up to ${R(500)} now. Earned and safe to draw: ${R(4000)} (50% of it may be drawn). Already drawn and still to come off your payslip: ${R(1500)}.`);
    fireEvent.change(screen.getByLabelText("Cash-out amount"), { target: { value: "4,50" } }); fireEvent.click(screen.getByRole("button", { name: "Draw" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/marshal/cash-out", body: { amountCents: 450 } }));
    expect(await screen.findByText(/ACC-0002: .* will be paid to you by your association, and comes off your next payslip/)).toBeInTheDocument();
  });
  it("shows the server's reason when more than allowed is asked, and does not queue money requests", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" ? { status: 409, body: { success: false, error: "You can draw up to R5.00 right now" } } : o(m, p, b)))(routes); render(<CashOutCard />); await screen.findByText(/You can draw up to/);
    fireEvent.change(screen.getByLabelText("Cash-out amount"), { target: { value: "50" } }); fireEvent.click(screen.getByRole("button", { name: "Draw" })); expect(await screen.findByText("You can draw up to R5.00 right now")).toBeInTheDocument(); expect(pending()).toEqual([]);
  });
});
