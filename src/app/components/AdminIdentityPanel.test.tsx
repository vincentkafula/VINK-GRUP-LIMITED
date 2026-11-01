import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AdminIdentityPanel } from "./AdminIdentityPanel";
import type { IdentityStaff } from "../services/identityStaff";

const id = (over: Partial<IdentityStaff> = {}): IdentityStaff => ({ enabled: true, status: "not_started", requirement: "required", confirmed: false, reviewStatus: null, reviewAnswer: null, rejectType: null, rejectLabels: [], moderationComment: null, clientComment: null, consentAt: null, attempts: 0, reviewedAt: null, applicantId: null, levelName: null, caseUrl: null, override: null, ...over });
const show = (i: IdentityStaff, o: { canOverride?: boolean; onRefresh?: () => Promise<string | null>; onOverride?: (r: string) => Promise<string | null> } = {}) =>
  render(<AdminIdentityPanel identity={i} canOverride={o.canOverride ?? false} onRefresh={o.onRefresh ?? (async () => null)} onOverride={o.onOverride ?? (async () => null)} />);
afterEach(() => cleanup());

describe("the identity check on an application, as a reviewer sees it", () => {
  it("says so plainly when identity checks are not switched on", () => { show(id({ enabled: false, requirement: "off" })); expect(screen.getByText("Identity checks are not switched on.")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull(); });
  it.each([["not_started", "Not started"], ["in_progress", "Started, not finished"], ["pending", "Being checked"], ["on_hold", "On hold at Sumsub"], ["approved", "Confirmed"], ["retry", "Not confirmed: may try again"], ["rejected", "Not confirmed: final"]] as const)("labels the %s stage", (status, label) => {
    show(id({ status })); expect(screen.getByLabelText("Identity check").textContent).toContain(label);
  });
  it("says whether it is required, recommended, or already confirmed", () => {
    show(id()); expect(screen.getByText(/cannot be approved until the identity is confirmed/)).toBeTruthy(); cleanup();
    show(id({ requirement: "recommended" })); expect(screen.getByText("Recommended. Approval is not blocked.")).toBeTruthy(); cleanup();
    show(id({ confirmed: true, status: "approved" })); expect(screen.getByText("Required, and confirmed.")).toBeTruthy();
  });
  it("shows Sumsub's answer, reasons and notes for staff, and says the applicant does not see the reasons", () => {
    show(id({ status: "retry", reviewAnswer: "RED", rejectType: "RETRY", rejectLabels: ["BAD_PHOTO_QUALITY"], moderationComment: "Looks edited", attempts: 2, consentAt: "2026-11-01T08:00:00Z", applicantId: "a1" }));
    for (const t of ["Not passed", "Yes, they may try again", "BAD_PHOTO_QUALITY", "Looks edited", "2", /the applicant does not see these/]) expect(screen.getByText(t)).toBeTruthy();
  });
  it("links to the full case in Sumsub, safely, and can ask Sumsub for the latest, showing the reason when it cannot", async () => {
    const onRefresh = vi.fn().mockResolvedValueOnce("Sumsub could not be reached.").mockResolvedValueOnce(null);
    show(id({ status: "pending", applicantId: "a1", caseUrl: "https://cockpit.sumsub.com/checkus#/applicant/a1" }), { onRefresh });
    const link = screen.getByRole("link", { name: /Open the full case/ }); expect(link.getAttribute("rel")).toBe("noopener noreferrer"); expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Sumsub" })); expect((await screen.findByRole("alert")).textContent).toBe("Sumsub could not be reached.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Sumsub" })); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull()); expect(onRefresh).toHaveBeenCalledTimes(2);
  });
  it("offers the override only to someone allowed, only while it is required and unconfirmed", () => {
    show(id({ applicantId: "a1" }), { canOverride: false }); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup();
    show(id({ applicantId: "a1" }), { canOverride: true }); expect(screen.getByText("Allow approval without a confirmed identity")).toBeTruthy(); cleanup();
    for (const over of [{ confirmed: true, status: "approved" as const }, { requirement: "recommended" as const }, { override: { reason: "x", by: "V", at: "2026-11-01T09:00:00Z" } }]) { show(id(over), { canOverride: true }); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup(); }
  });
  it("keeps the override button off until the reason is a real sentence, then sends it trimmed, clears it, and shows the server's refusal if it refuses", async () => {
    const onOverride = vi.fn().mockResolvedValueOnce("Not allowed for your role").mockResolvedValueOnce(null);
    show(id(), { canOverride: true, onOverride }); const box = screen.getByLabelText(/Why approval may go ahead/); const btn = screen.getByRole("button", { name: "Allow approval anyway" });
    fireEvent.change(box, { target: { value: "too short" } }); expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  Identity checked in person at the branch.  " } }); expect((btn as HTMLButtonElement).disabled).toBe(false); fireEvent.click(btn);
    expect((await screen.findByRole("alert")).textContent).toBe("Not allowed for your role"); expect(onOverride).toHaveBeenCalledWith("Identity checked in person at the branch."); expect((box as HTMLTextAreaElement).value).not.toBe("");     // kept so it can be corrected
    fireEvent.click(screen.getByRole("button", { name: "Allow approval anyway" })); await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
  });
  it("records an override with who allowed it, when and why", () => {
    show(id({ override: { reason: "Known customer; ID seen at the branch", by: "Vincent", at: "2026-11-01T09:00:00Z" } }));
    expect(screen.getByText(/Approval allowed without a confirmed identity/)).toBeTruthy(); expect(screen.getByText(/Vincent/)).toBeTruthy(); expect(screen.getByText(/Known customer; ID seen at the branch/)).toBeTruthy(); expect(screen.getByText(/approval was allowed without it/)).toBeTruthy();
  });
});
