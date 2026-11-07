/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReportsScreen } from "./AssociationReports";

type Reply = { status?: number; body: unknown; file?: boolean };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const PACKS = [{ id: "registration", title: "Registration pack", description: "Registration status, constitution and code" }, { id: "licences", title: "Licence compliance report", description: "Every vehicle's operating licence" }, { id: "finance", title: "Finance statement", description: "Income and expenses with the budget" }, { id: "governance", title: "Governance report", description: "Meetings and attendance" }];
const SCHEDULES = [
  { id: "s1", pack: "licences", frequency: "monthly", recipientLabel: "Executive", recipientEmail: "exco@langa.test", dayOfMonth: 1, sendMonth: 3, active: true, lastPeriod: "2026-10", lastSentAt: "2026-10-01T08:00:00Z", lastError: null },
  { id: "s2", pack: "finance", frequency: "annually", recipientLabel: "Registrar", recipientEmail: "registrar@pre.test", dayOfMonth: 15, sendMonth: 3, active: false, lastPeriod: null, lastSentAt: null, lastError: null },
  { id: "s3", pack: "governance", frequency: "quarterly", recipientLabel: "Regional body", recipientEmail: "region@santaco.test", dayOfMonth: 2, sendMonth: 3, active: true, lastPeriod: null, lastSentAt: null, lastError: "Mailbox unavailable" }];
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === `${P}/reports/packs`) return { body: { success: true, packs: PACKS, csv: ["members", "vehicles", "drivers"] } }; if (p === `${P}/reports/schedules` && m === "GET") return { body: { success: true, schedules: SCHEDULES, emailConfigured: true } };
    if (p === `${P}/reports/runs`) return { body: { success: true, runs: [{ pack: "licences", period: "as at 2026-10-01", recipient: "exco@langa.test", ok: true, error: null, at: "2026-10-01T08:00:00Z" }, { pack: "governance", period: "as at 2026-10-02", recipient: "region@santaco.test", ok: false, error: "Mailbox unavailable", at: "2026-10-02T08:00:00Z" }] } };
    if (p.includes("/reports/pack/") || p.includes("/reports/csv/")) return { body: "x", file: true }; if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 }); if (r.file) return new Response("x", { status: 200, headers: { "content-type": "application/pdf" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("reports to download", () => {
  it("lists each report with what it holds, and downloads it as a PDF", async () => {
    render(<ReportsScreen />); expect(await screen.findByText("Registration pack", { selector: "b" })).toBeInTheDocument(); expect(screen.getByText(/Every vehicle's operating licence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Download licence compliance report/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/pack/licences.pdf`)); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
  it("lets the finance statement be asked for a month or a year, and for this year when nothing is typed", async () => {
    render(<ReportsScreen />); await screen.findByText("Finance statement", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: /Download finance statement/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/pack/finance.pdf`));
    pick("Finance report period", " 2026-10 "); fireEvent.click(screen.getByRole("button", { name: /Download finance statement/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/pack/finance.pdf?period=2026-10`)); expect(screen.getAllByLabelText("Finance report period")).toHaveLength(1);                 // only the finance report asks for a period
  });
  it("downloads the member, vehicle and driver lists, and says driver ID numbers are masked and that discipline is counted, not named", async () => {
    render(<ReportsScreen />); await screen.findByText("Members", { selector: "b" }); for (const [name, path] of [[/Download members list/, "members"], [/Download vehicles list/, "vehicles"], [/Download drivers list/, "drivers"]] as const) { fireEvent.click(screen.getByRole("button", { name })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/reports/csv/${path}.csv`)); }
    expect(screen.getByText(/ID numbers are masked/)).toBeInTheDocument(); expect(screen.getByText(/gives counts only: the people involved are not named/)).toBeInTheDocument(); expect(screen.getByText(/stamped with your association's name, the day it was generated/)).toBeInTheDocument();
  });
  it("shows why a download failed", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.includes("/reports/pack/") ? { status: 404, body: { success: false, error: "That report does not exist" } } : o(m, p, b)))(routes); render(<ReportsScreen />); await screen.findByText("Registration pack", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: /Download registration pack/ })); expect(await screen.findByText("That report does not exist")).toBeInTheDocument();
  });
});

describe("reports sent automatically", () => {
  it("lists each schedule in plain words: what, how often and from when, to whom, when it was last sent, and when it is switched off or failed", async () => {
    render(<ReportsScreen />); const li = (name: string) => screen.getAllByText(name, { selector: "b" }).map((b) => b.closest("li")!).find((x) => x.textContent?.includes("to "))!; await screen.findByText(/Every month/);
    const a = screen.getByText(/Every month/).closest("li")!; expect(a).toHaveTextContent("Licence compliance report · Every month, from the 1st · to Executive (exco@langa.test)"); expect(a).toHaveTextContent(/Last sent/); const b = screen.getByText(/Every year/).closest("li")!; expect(b).toHaveTextContent("Every year in March, from the 15th · to Registrar"); expect(within(b).getByText("Switched off")).toBeInTheDocument(); expect(b).toHaveTextContent("Not sent yet");
    const c = screen.getByText(/Every quarter/).closest("li")!; expect(c).toHaveTextContent("from the 2nd"); expect(c).toHaveTextContent("Last attempt failed: Mailbox unavailable. It will be tried again."); void li;
  });
  it("says so when email is not set up, and that the reports can still be downloaded", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/reports/schedules` && m === "GET" ? { body: { success: true, schedules: [], emailConfigured: false } } : o(m, p, b)))(routes); render(<ReportsScreen />); expect(await screen.findByRole("alert")).toHaveTextContent("Email is not set up on this server yet, so reports cannot be sent. You can still download them above."); expect(screen.getByText("Nothing is sent automatically yet.")).toBeInTheDocument();
  });
  it("adds a schedule with the day as a number, and the month only for an annual one", async () => {
    render(<ReportsScreen />); await screen.findByText(/Every month/); expect(screen.queryByLabelText("Schedule month")).toBeNull(); pick("Schedule report", "registration"); pick("Schedule recipient", "Registrar"); pick("Schedule email", "registrar@pre.test"); pick("Schedule day", "5"); fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/reports/schedules`, body: { pack: "registration", frequency: "monthly", recipientLabel: "Registrar", recipientEmail: "registrar@pre.test", dayOfMonth: 5 } }));
    pick("Schedule frequency", "annually"); pick("Schedule month", "6"); fireEvent.click(screen.getByRole("button", { name: "Add" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ frequency: "annually", sendMonth: 6, dayOfMonth: 5 }));
  });
  it("shows the server's reason when a schedule is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/reports/schedules") ? { status: 400, body: { success: false, error: "Give a valid email address" } } : o(m, p, b)))(routes); render(<ReportsScreen />); await screen.findByText(/Every month/); fireEvent.click(screen.getByRole("button", { name: "Add" })); expect(await screen.findByText("Give a valid email address")).toBeInTheDocument();
  });
  it("sends one now and says so, and shows the reason when sending fails", async () => {
    render(<ReportsScreen />); const li = (await screen.findByText(/Every month/)).closest("li")!; fireEvent.click(within(li).getByRole("button", { name: "Send now" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/reports/schedules/s1/send`, body: undefined })); expect(await within(li).findByText("Sent.")).toBeInTheDocument();
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/send") ? { status: 502, body: { success: false, error: "The email could not be sent: Mailbox unavailable" } } : o(m, p, b)))(routes); fireEvent.click(within(li).getByRole("button", { name: "Send now" })); expect(await within(li).findByText("The email could not be sent: Mailbox unavailable")).toBeInTheDocument();
  });
  it("switches a schedule off or on and removes it", async () => {
    render(<ReportsScreen />); const a = (await screen.findByText(/Every month/)).closest("li")!, b = screen.getByText(/Every year/).closest("li")!; fireEvent.click(within(a).getByRole("button", { name: "Switch off" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/reports/schedules/s1/active`, body: { active: false } }));
    fireEvent.click(within(b).getByRole("button", { name: "Switch on" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/reports/schedules/s2/active`, body: { active: true } })); fireEvent.click(within(a).getByRole("button", { name: "Remove" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "DELETE", path: `${P}/reports/schedules/s1` }));
  });
});

describe("what has been sent", () => {
  it("lists what was sent and to whom, and what failed and why", async () => {
    render(<ReportsScreen />); const s = await screen.findByText(/as at 2026-10-01\) to exco@langa.test/); expect(s.closest("li")).toHaveTextContent("Licence compliance report (as at 2026-10-01) to exco@langa.test · Sent"); expect(screen.getByText(/as at 2026-10-02\) to region@santaco.test/).closest("li")).toHaveTextContent("Failed: Mailbox unavailable");
  });
  it("says nothing has been sent yet", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/reports/runs` ? { body: { success: true, runs: [] } } : o(m, p, b)))(routes); render(<ReportsScreen />); expect(await screen.findByText("Nothing has been sent yet.")).toBeInTheDocument(); });
});
