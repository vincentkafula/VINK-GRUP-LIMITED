import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./sponsorshipApi", async (orig) => ({ ...(await orig<typeof import("./sponsorshipApi")>()), send: vi.fn(async () => ({ data: {} })) }));
import { send, type Detail, type Identity, type Me } from "./sponsorshipApi";
import { IdentityBox } from "./SponsorshipDetail";

const identity = (over: Partial<Identity> = {}): Identity => ({ enabled: true, status: "not_started", requirement: "recommended", confirmed: false, override: null, reviewStatus: null, reviewAnswer: null, rejectType: null, rejectLabels: [], moderationComment: null, clientComment: null, consentAt: null, attempts: 0, reviewedAt: null, applicantId: null, levelName: null, caseUrl: null, ...over });
const detail = (id?: Identity) => ({ ref: "SP-ABC234", ...(id ? { identity: id } : {}) }) as unknown as Detail;
/** The page's own helper: turns a call into a button action and reloads. */
const act_ = (fn: () => Promise<{ error: string } | { data: unknown }>, message: string) => async () => { const r = await fn(); return "error" in r ? { error: r.error } : { message }; };
const me = (isSuper = false) => ({ userId: "u1", name: "Vincent", role: isSuper ? "superadmin" : "reviewer", isSuper, isFinance: false, canReview: true, sectionName: "Sponsorships", settings: {} }) as unknown as Me;
const show = (id?: Identity, isSuper = false) => render(<IdentityBox d={detail(id)} me={me(isSuper)} act={act_} />);
afterEach(() => { cleanup(); vi.mocked(send).mockClear(); });

describe("the identity check, as staff see it", () => {
  it("says the documents are with Sumsub and that the check does not move the application", () => {
    show(identity()); expect(screen.getByRole("heading", { name: "Identity check (Sumsub)" })).toBeTruthy(); expect(screen.getByText(/held by Sumsub, not by VINK.*does not change the application/)).toBeTruthy();
  });
  it("says so plainly when checks are switched off and nothing has happened", () => {
    show(identity({ enabled: false })); expect(screen.getByText("Identity checks are not switched on.")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
  });
  it("still shows a past result when checks have since been switched off", () => {
    show(identity({ enabled: false, status: "approved", reviewAnswer: "GREEN", applicantId: "a1" })); expect(screen.getByText("Confirmed")).toBeTruthy(); expect(screen.getByText("Checks are switched off now")).toBeTruthy();
  });
  it("shows an applicant who has not started as exactly that, with nothing to refresh", () => {
    show(identity()); expect(screen.getByText("Not started")).toBeTruthy(); expect(screen.getByText(/has not started/)).toBeTruthy(); expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
  });
  it.each([["in_progress", "Started, not finished"], ["pending", "Being checked"], ["on_hold", "On hold at Sumsub"], ["approved", "Confirmed"], ["retry", "Not confirmed: may try again"], ["rejected", "Not confirmed: final"]] as const)("labels %s", (status, label) => {
    show(identity({ status, applicantId: "a1" })); expect(screen.getByText(label)).toBeTruthy();
  });
  it("shows a pass in words, with the dates and the consent", () => {
    show(identity({ status: "approved", reviewAnswer: "GREEN", reviewStatus: "completed", attempts: 2, consentAt: "2026-11-01T08:00:00Z", reviewedAt: "2026-11-01T09:00:00Z", applicantId: "a1" }));
    expect(screen.getByText("Passed")).toBeTruthy(); expect(screen.getByText("Not applicable")).toBeTruthy(); expect(screen.getByText("2")).toBeTruthy(); expect(screen.getByText("Agreed to the check")).toBeTruthy(); expect(screen.getByText("Reviewed")).toBeTruthy();
  });
  it("shows a failure with Sumsub's reasons and notes for staff, and what the applicant was told, and whether they may try again", () => {
    show(identity({ status: "retry", reviewAnswer: "RED", rejectType: "RETRY", rejectLabels: ["BAD_PHOTO_QUALITY", "FORGERY_SUSPECTED"], moderationComment: "Looks edited; ask for the original", clientComment: "Please retake the photo.", applicantId: "a1" }));
    expect(screen.getByText("Not passed")).toBeTruthy(); expect(screen.getByText("Yes, they may try again")).toBeTruthy(); expect(screen.getByText(/the applicant does not see these/)).toBeTruthy();
    expect(screen.getByText("BAD_PHOTO_QUALITY")).toBeTruthy(); expect(screen.getByText("FORGERY_SUSPECTED")).toBeTruthy(); expect(screen.getByText("Looks edited; ask for the original")).toBeTruthy();
    expect(screen.getByText("What the applicant was told")).toBeTruthy(); expect(screen.getByText("Please retake the photo.")).toBeTruthy();
    cleanup(); show(identity({ status: "rejected", reviewAnswer: "RED", rejectType: "FINAL", applicantId: "a1" })); expect(screen.getByText("No, this is final")).toBeTruthy();
  });
  it("links to the full case in Sumsub, safely, and can ask Sumsub for the latest", async () => {
    show(identity({ status: "pending", applicantId: "a1", caseUrl: "https://cockpit.sumsub.com/checkus#/applicant/a1" }));
    const link = screen.getByRole("link", { name: /Open the full case in Sumsub/ }); expect(link.getAttribute("href")).toBe("https://cockpit.sumsub.com/checkus#/applicant/a1"); expect(link.getAttribute("target")).toBe("_blank"); expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Sumsub" })); await waitFor(() => expect(send).toHaveBeenCalledWith("POST", "/SP-ABC234/identity/refresh"));
    expect(await screen.findByText("Updated from Sumsub")).toBeTruthy();
  });
  it("shows the reason when Sumsub cannot be reached", async () => {
    vi.mocked(send).mockResolvedValueOnce({ error: "Sumsub could not be reached. Try again in a moment." }); show(identity({ status: "pending", applicantId: "a1" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Sumsub" })); expect(await screen.findByText(/could not be reached/)).toBeTruthy();
  });
  it("shows nothing, and does not fail, when the server does not send the identity yet (the front end can go live first)", () => {
    show(undefined); expect(document.body.textContent).toBe("");
  });

  it("says whether the identity is required before approval, recommended, or already confirmed", () => {
    show(identity({ requirement: "required" })); expect(screen.getByText(/this application cannot be approved until the identity is confirmed/)).toBeTruthy(); cleanup();
    show(identity({ requirement: "recommended" })); expect(screen.getByText("Recommended. Approval is not blocked.")).toBeTruthy(); cleanup();
    show(identity({ requirement: "required", confirmed: true, status: "approved", applicantId: "a1" })); expect(screen.getByText("Required, and confirmed.")).toBeTruthy();
  });
  it("lets only a Super Administrator allow approval without a confirmed identity, and only while it is required and unconfirmed", () => {
    const needs = { requirement: "required" as const, status: "pending" as const, applicantId: "a1" };
    show(identity(needs), false); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup();
    show(identity(needs), true); expect(screen.getByText("Allow approval without a confirmed identity")).toBeTruthy(); cleanup();
    show(identity({ ...needs, confirmed: true, status: "approved" }), true); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup();
    show(identity({ ...needs, requirement: "recommended" }), true); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull(); cleanup();
    show(identity({ ...needs, override: { reason: "Seen in person", by: "Vincent", at: "2026-11-01T09:00:00Z" } }), true); expect(screen.queryByText("Allow approval without a confirmed identity")).toBeNull();
  });
  it("refuses a reason that is too short without calling the server, then records a real one", async () => {
    show(identity({ requirement: "required", status: "pending", applicantId: "a1" }), true); const box = screen.getByLabelText(/Why approval may go ahead/); const go = () => fireEvent.click(screen.getByRole("button", { name: "Allow approval anyway" }));
    fireEvent.change(box, { target: { value: "short" } }); go(); expect(await screen.findByText(/at least 10 characters/)).toBeTruthy(); expect(send).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "  Identity checked in person at the site visit.  " } }); go();
    await waitFor(() => expect(send).toHaveBeenCalledWith("POST", "/SP-ABC234/identity/override", { reason: "Identity checked in person at the site visit." })); expect(await screen.findByText("Approval allowed, with your reason on record")).toBeTruthy();
  });
  it("shows who allowed an approval without a confirmed identity, when and why", () => {
    show(identity({ requirement: "required", override: { reason: "Known customer; ID seen at the branch", by: "Vincent", at: "2026-11-01T09:00:00Z" } }));
    expect(screen.getByText(/Approval allowed without a confirmed identity/)).toBeTruthy(); expect(screen.getByText(/Vincent/)).toBeTruthy(); expect(screen.getByText(/Known customer; ID seen at the branch/)).toBeTruthy(); expect(screen.getByText(/Required, but approval was allowed without it/)).toBeTruthy();
  });
});
