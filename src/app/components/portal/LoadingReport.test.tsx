import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LoadingReport } from "./LoadingReport";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100);                  // an amount as the app writes it
type Reply = { status?: number; body: unknown; type?: string };
let routes: (path: string) => Reply | undefined, calls: string[];
const TOTALS = { trips: 4, passengers: 7, collectedCents: 17500, feeCents: 700, netCents: 16800 };
const GROUPS = { success: true, by: "driver", from: "2026-09-08", to: "2026-10-07", truncated: false, totals: TOTALS, rows: [
  { key: "d1", name: "Dee Driver", trips: 3, passengers: 5, collectedCents: 12500, feeCents: 500, netCents: 12000 }, { key: "d2", name: "Dan Driver", trips: 1, passengers: 2, collectedCents: 5000, feeCents: 200, netCents: 4800 }] };
const LINES = { success: true, by: "session", from: "2026-09-08", to: "2026-10-07", truncated: false, totals: TOTALS, rows: [
  { id: "s5", pairedAt: "2026-10-07T09:00:00Z", endedAt: null, inProgress: true, registration: "CA 111-111", driver: "Dee Driver", route: "Langa to Bellville", place: "Langa rank", passengers: 1, collectedCents: 2500, feeCents: 100, netCents: 2400 },
  { id: "s3", pairedAt: "2026-10-06T08:00:00Z", endedAt: "2026-10-06T09:00:00Z", inProgress: false, registration: "CA 111-111", driver: null, route: null, place: "Own device", passengers: 1, collectedCents: 2500, feeCents: 100, netCents: 2400 }] };
beforeEach(() => {
  calls = []; routes = (p) => (p.includes("by=session") ? { body: LINES } : p.includes("by=driver") ? { body: GROUPS } : { body: { ...GROUPS, by: "vehicle", rows: [{ key: "v1", name: "CA 111-111", trips: 3, passengers: 5, collectedCents: 12500, feeCents: 500, netCents: 12000 }] } });
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""); calls.push(path);
    const r = routes(path); if (!r) return new Response(JSON.stringify({ error: "unexpected " + path }), { status: 500 });
    if (r.type === "csv") return new Response("a,b\r\n", { status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="loads.csv"' } });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reports = () => calls.filter((c) => c.includes("/loading/report?"));

describe("the loading report", () => {
  it("shows the period's totals in a sentence and one row per driver by default, with what was collected, the fee and what is left", async () => {
    render(<LoadingReport segment="owner" />);
    expect(await screen.findByText("Dee Driver")).toBeInTheDocument(); expect(reports()[0]).toBe("/api/portal/owner/loading/report?by=driver");
    const sentence = screen.getByText(/2026-09-08 to 2026-10-07/); expect(sentence).toHaveTextContent(`4 loads, 7 passengers, collected ${R(17500)}, fee ${R(700)}, ${R(16800)} left.`);
    const row = screen.getByText("Dee Driver").closest("tr")!; for (const t of ["3", "5", R(12500), R(500), R(12000)]) expect(within(row).getByText(t)).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((r) => r.textContent?.slice(0, 3))).toEqual(["Dri", "Dee", "Dan"]);                 // biggest first, as the server sent them
  });
  it("asks again for the grouping and the period the person chooses, and downloads the same selection as a spreadsheet", async () => {
    render(<LoadingReport segment="owner" />); await screen.findByText("Dee Driver");
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "vehicle" } }); expect(await screen.findByText("CA 111-111")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } }); fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-05" } });
    await waitFor(() => expect(reports().at(-1)).toBe("/api/portal/owner/loading/report?by=vehicle&from=2026-10-01&to=2026-10-05"));
    routes = (p) => (p.includes("report.csv") ? { body: "", type: "csv" } : undefined); fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    await waitFor(() => expect(calls.at(-1)).toBe("/api/portal/owner/loading/report.csv?by=vehicle&from=2026-10-01&to=2026-10-05")); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
  it("lists each load with its vehicle, driver, route and where, marking the one still going and an own-device load, and showing a dash for what is missing", async () => {
    render(<LoadingReport segment="owner" />); await screen.findByText("Dee Driver"); fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "session" } });
    expect(await screen.findByText("Loading now")).toBeInTheDocument(); expect(screen.getByText("Langa rank")).toBeInTheDocument(); expect(screen.getByText("Own device")).toBeInTheDocument();
    const own = screen.getByText("Own device").closest("tr")!; expect(within(own).getAllByText("—")).toHaveLength(2);                          // no driver or route recorded
    expect(screen.getAllByText(R(2400))).toHaveLength(2);                                                           // what is left of each load
  });
  it("uses the role's own address, and a driver is offered each load, vehicle and route but not a grouping by driver", async () => {
    for (const seg of ["association", "marshal"] as const) { const v = render(<LoadingReport segment={seg} />); await screen.findByText("Dee Driver"); expect(reports().at(-1)).toBe(`/api/portal/${seg}/loading/report?by=driver`); v.unmount(); }
    render(<LoadingReport segment="driver" />); await screen.findByText("Loading now"); expect(reports().at(-1)).toBe("/api/portal/driver/loading/report?by=session");
    expect(within(screen.getByLabelText("Group by")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Each load", "Vehicle", "Route"]);
  });
  it("says so when there are no loads, warns when the list was cut short, and shows the server's reason for a bad period", async () => {
    routes = () => ({ body: { ...GROUPS, rows: [], totals: { trips: 0, passengers: 0, collectedCents: 0, feeCents: 0, netCents: 0 } } }); const a = render(<LoadingReport segment="owner" />); expect(await screen.findByText("No loads in this period.")).toBeInTheDocument(); expect(screen.getByText(/2026-09-08 to 2026-10-07/)).toHaveTextContent("0 loads, 0 passengers, collected " + R(0)); a.unmount();
    routes = () => ({ body: { ...GROUPS, truncated: true } }); const b = render(<LoadingReport segment="owner" />); expect(await screen.findByRole("alert")).toHaveTextContent("only the latest are shown"); b.unmount();
    routes = () => ({ status: 400, body: { success: false, error: "The start date is after the end date" } }); render(<LoadingReport segment="owner" />); expect(await screen.findByRole("alert")).toHaveTextContent("The start date is after the end date");
  });
});
