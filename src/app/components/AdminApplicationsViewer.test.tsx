import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("../services/applicationsApi", () => ({ applicationsApi: { list: vi.fn(), stats: vi.fn(), get: vi.fn(), updateStatus: vi.fn(), identityRefresh: vi.fn(), identityOverride: vi.fn() } }));
vi.mock("../services/apiClient", () => ({ getSession: vi.fn(() => ({ id: "u1", username: "staff", name: "Staff", email: "s@x.co", role: "billing_admin" })) }));
import { applicationsApi } from "../services/applicationsApi";
import { getSession } from "../services/apiClient";
import { AdminApplicationsViewer } from "./AdminApplicationsViewer";
import type { IdentityStaff } from "../services/identityStaff";

const api = vi.mocked(applicationsApi);
const identity = (over: Partial<IdentityStaff> = {}): IdentityStaff => ({ enabled: true, status: "not_started", requirement: "required", confirmed: false, reviewStatus: null, reviewAnswer: null, rejectType: null, rejectLabels: [], moderationComment: null, clientComment: null, consentAt: null, attempts: 0, reviewedAt: null, applicantId: null, levelName: null, caseUrl: null, override: null, ...over });
const app = (over: Record<string, unknown> = {}) => ({ id: "a1", referenceNumber: "VNK-PA-TEST000001", accountNumber: "1234567890", accountNumberStatus: "provisional", rejectedAt: null, tier: "personal", currency: "ZAR", status: "under_review", applicantName: "Thandi Nkosi", applicantEmail: "thandi@example.com", applicantPhone: "+27820000000", tierData: {}, submittedAt: "2026-10-09T10:00:00Z", updatedAt: "2026-10-14T09:00:00Z", ...over });
const ok = <T,>(data: T) => ({ success: true as const, data });
beforeEach(() => {
  api.list.mockResolvedValue({ success: true, data: [app()], meta: { pages: 1 } } as never); api.stats.mockResolvedValue(ok({ totalApplications: 1, byTier: {}, byStatus: {} }) as never);
  api.get.mockResolvedValue(ok(app({ identity: identity(), statusHistory: [{ fromStatus: null, toStatus: "submitted", reason: "Application received", changedBy: null, createdAt: "2026-10-09T10:00:00Z" }] })) as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(getSession).mockReturnValue({ id: "u1", username: "staff", name: "Staff", email: "s@x.co", role: "billing_admin" } as never); });
const open = async () => { render(<AdminApplicationsViewer isOpen onClose={vi.fn()} />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); return await screen.findByLabelText("Identity check"); };
const approve = (why = "Documents are in order") => { fireEvent.click(screen.getByRole("button", { name: /^Approved$/ })); fireEvent.change(screen.getByPlaceholderText(/Reason for this status change/), { target: { value: why } }); fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); };

describe("opening an application on the staff screen", () => {
  it("fetches its full detail, which the list does not carry, and shows the identity check and the status history", async () => {
    const panel = await open(); expect(api.get).toHaveBeenCalledWith("VNK-PA-TEST000001"); expect(panel.textContent).toContain("Not started"); await waitFor(() => expect(document.body.textContent).toContain("— Application received"));      // the history, which only the full detail has
  });
  it("still opens, without the identity check, if the detail cannot be fetched or the server does not send one", async () => {
    api.get.mockRejectedValueOnce(new Error("offline")); render(<AdminApplicationsViewer isOpen onClose={vi.fn()} />); fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(await screen.findByText("Update status")).toBeTruthy(); expect(screen.queryByLabelText("Identity check")).toBeNull();
  });
});

describe("approving an application whose identity is required", () => {
  it("warns before the attempt, and says why when the server refuses, instead of doing nothing", async () => {
    await open(); fireEvent.click(screen.getByRole("button", { name: /^Approved$/ })); expect(screen.getByRole("note").textContent).toMatch(/identity is not confirmed yet, so this approval will be refused/); expect(screen.getByRole("note").textContent).toMatch(/A Super Administrator can allow it/);
    api.updateStatus.mockResolvedValueOnce({ success: false, error: "This application cannot be approved until the applicant's identity is confirmed. The applicant has not started confirming their identity." } as never); approve();
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toContain("cannot be approved until the applicant's identity is confirmed"); expect(api.updateStatus).toHaveBeenCalledWith("VNK-PA-TEST000001", "approved", "Documents are in order");
    expect(api.list).toHaveBeenCalledTimes(1);                                              // the list was not reloaded as though it had worked: nothing claims it was approved
  });
  it("goes through when the identity is confirmed, with no warning", async () => {
    api.get.mockResolvedValue(ok(app({ identity: identity({ status: "approved", confirmed: true }) })) as never); api.updateStatus.mockResolvedValueOnce(ok(app({ status: "approved" })) as never);
    await open(); fireEvent.click(screen.getByRole("button", { name: /^Approved$/ })); expect(screen.queryByRole("note")).toBeNull(); approve(); await waitFor(() => expect(api.updateStatus).toHaveBeenCalled()); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not warn about, or block, a decline or a request for more information", async () => {
    await open(); fireEvent.click(screen.getByRole("button", { name: /^Declined$/ })); expect(screen.queryByRole("note")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: /More Info Needed/ })); expect(screen.queryByRole("note")).toBeNull();
  });
  it("does not warn when identity checks are switched off or the identity is not required for this kind", async () => {
    for (const over of [{ enabled: false, requirement: "off" as const }, { requirement: "recommended" as const }]) { api.get.mockResolvedValue(ok(app({ identity: identity(over) })) as never); await open(); fireEvent.click(screen.getByRole("button", { name: /^Approved$/ })); expect(screen.queryByRole("note")).toBeNull(); cleanup(); }
  });
});

describe("the override and the refresh on an application", () => {
  it("shows the override only to an owner or Super Administrator, and then allows the warning to be resolved", async () => {
    await open(); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup();
    vi.mocked(getSession).mockReturnValue({ id: "u9", username: "boss", name: "Boss", email: "b@x.co", role: "superadmin" } as never);
    api.identityOverride.mockResolvedValueOnce(ok(identity({ override: { reason: "Known customer; ID seen in the branch", by: "Boss", at: "2026-11-01T09:00:00Z" } })) as never);
    await open(); fireEvent.click(screen.getByRole("button", { name: /^Approved$/ })); expect(screen.getByRole("note").textContent).toMatch(/You can allow it with a reason in the identity check above/);
    fireEvent.change(screen.getByLabelText(/Why approval may go ahead/), { target: { value: "Known customer; ID seen in the branch" } }); fireEvent.click(screen.getByRole("button", { name: "Allow approval anyway" }));
    await waitFor(() => expect(api.identityOverride).toHaveBeenCalledWith("VNK-PA-TEST000001", "Known customer; ID seen in the branch")); expect(await screen.findByText(/Approval allowed without a confirmed identity/)).toBeTruthy(); await waitFor(() => expect(screen.queryByRole("note")).toBeNull());
  });
  it("refreshes from Sumsub and shows the new stage, or the reason it could not", async () => {
    api.get.mockResolvedValue(ok(app({ identity: identity({ status: "pending", applicantId: "a1" }) })) as never);
    api.identityRefresh.mockResolvedValueOnce({ success: false, error: "Sumsub could not be reached. Try again in a moment." } as never).mockResolvedValueOnce(ok(identity({ status: "approved", confirmed: true, applicantId: "a1", reviewAnswer: "GREEN" })) as never);
    const panel = await open(); const btn = () => within(panel).getByRole("button", { name: "Refresh from Sumsub" });
    fireEvent.click(btn()); expect((await within(panel).findByRole("alert")).textContent).toMatch(/could not be reached/);
    fireEvent.click(btn()); await waitFor(() => expect(panel.textContent).toContain("Confirmed")); expect(api.identityRefresh).toHaveBeenCalledWith("VNK-PA-TEST000001");
  });
});
