import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { SponsorshipTracker, type Tracked } from "./SponsorshipTracker";
import { AwardCard, ReplyForm, ReportForm } from "./SponsorshipTrackerExtras";

const pdf = (name: string) => new File(["%PDF-1.4 a test"], name, { type: "application/pdf" });
const base: Tracked = {
  ref: "SP-ABC234", status: "more_information_required", statusLabel: "More information required", project: "Township Entrepreneurs Bootcamp", organisation: "Khayelitsha Youth Hub",
  submittedAt: "2026-10-09T10:00:00Z", updatedAt: "2026-10-14T09:00:00Z",
  timeline: [{ kind: "status", status: "submitted", label: "Submitted", at: "2026-10-09T10:00:00Z", message: null }, { kind: "status", status: "more_information_required", label: "More information required", at: "2026-10-12T09:00:00Z", message: "Please send a quote for the venue hire." }],
  canReply: true, canReport: false, benefits: [], award: null,
};
const award = { amount: 45000, currency: "ZAR", conditions: "Facilitators and venue only.", stage: "agreement_pending" as const, stageLabel: "Agreement pending", signedOn: null, milestones: [{ title: "Programme starts", dueDate: "2026-11-01", status: "done" }, { title: "Pitch day", dueDate: "2026-12-15", status: "pending" }], paid: 20000, remaining: 25000 };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const lookup = () => { fireEvent.change(screen.getByLabelText(/Reference number/), { target: { value: "SP-ABC234" } }); fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "thandi@example.com" } }); fireEvent.click(screen.getByRole("button", { name: /Find my application/ })); };

beforeEach(() => { vi.mocked(toast.error).mockClear(); vi.mocked(toast.success).mockClear(); });
afterEach(() => cleanup());

describe("the award, as the applicant sees it", () => {
  it("shows the amount, the stage, the conditions, what has been paid and the milestones", () => {
    render(<AwardCard award={award} />);
    expect(screen.getByRole("heading", { name: /ZAR 45.?000 awarded/ })).toBeTruthy(); expect(screen.getByText(/Please sign the agreement we emailed you/)).toBeTruthy();
    expect(screen.getByText("Facilitators and venue only.")).toBeTruthy(); expect(screen.getByText(/Paid so far: ZAR 20.?000.*Still to come: ZAR 25.?000/)).toBeTruthy();
    expect(screen.getByText("Programme starts").closest("li")!.textContent).toContain("Done"); expect(screen.getByText("Pitch day").closest("li")!.textContent).toMatch(/Due 15 December 2026/);
  });
  it("says when it was signed once it has been", () => {
    render(<AwardCard award={{ ...award, stage: "active", stageLabel: "Agreement signed", signedOn: "2026-10-08" }} />);
    expect(screen.getByText("Agreement signed on 8 October 2026")).toBeTruthy(); expect(screen.queryByText(/Please sign the agreement/)).toBeNull();
  });
});

describe("replying to a question", () => {
  it("needs a reply, sends it with its files to the right place, and tells the page to look again", async () => {
    const f = reply(201, { success: true, data: { message: "ok" } }); globalThis.fetch = f; const onSent = vi.fn();
    render(<ReplyForm refNo="SP-ABC234" email="thandi@example.com" supportEmail="sponsorships@vink.co.za" onSent={onSent} />);
    fireEvent.click(screen.getByRole("button", { name: "Send my reply" })); expect(screen.getByRole("alert").textContent).toMatch(/at least 5 characters/); expect(f).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Your reply/), { target: { value: "The quote for the hall is attached: R12,500." } });
    fireEvent.change(screen.getByLabelText("Choose files: Files (optional)"), { target: { files: [pdf("quote.pdf")] } }); await screen.findByText("quote.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Send my reply" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(f).mock.calls[0] as unknown as [string, RequestInit]; const fd = init.body as FormData;
    expect(url).toMatch(/\/api\/sponsorship\/reply$/); expect(JSON.parse(String(fd.get("data")))).toEqual({ ref: "SP-ABC234", email: "thandi@example.com", message: "The quote for the hall is attached: R12,500." });
    expect((fd.getAll("file")[0] as File).name).toBe("quote.pdf"); expect(toast.success).toHaveBeenCalled();
  });
  it("shows the server's reason when it refuses, and keeps what was typed", async () => {
    globalThis.fetch = reply(409, { success: false, error: "We are not waiting for more information on this application." });
    render(<ReplyForm refNo="SP-ABC234" email="thandi@example.com" supportEmail="sponsorships@vink.co.za" onSent={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Your reply/), { target: { value: "An unprompted reply here" } }); fireEvent.click(screen.getByRole("button", { name: "Send my reply" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We are not waiting for more information on this application."); expect((screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).value).toBe("An unprompted reply here");
  });
  it("offers the email address when the network fails, and does not lose the reply", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    render(<ReplyForm refNo="SP-ABC234" email="thandi@example.com" supportEmail="sponsorships@vink.co.za" onSent={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Your reply/), { target: { value: "An unprompted reply here" } }); fireEvent.click(screen.getByRole("button", { name: "Send my reply" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled()); expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/sponsorships@vink\.co\.za/); expect((screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).value).toBe("An unprompted reply here");
  });
  it("refuses a file that is not an accepted type, before sending anything", async () => {
    render(<ReplyForm refNo="SP-ABC234" email="thandi@example.com" supportEmail="sponsorships@vink.co.za" onSent={() => {}} />);
    fireEvent.change(screen.getByLabelText("Choose files: Files (optional)"), { target: { files: [new File(["x"], "notes.txt")] } });
    expect(await screen.findByText(/"notes.txt" is not an accepted file type/)).toBeTruthy();
  });
});

describe("the final report", () => {
  const benefits = [{ id: "logo", label: "Brand logo placement" }, { id: "social", label: "Social media exposure" }];
  const fill = async () => {
    fireEvent.change(screen.getByLabelText(/People who took part/), { target: { value: "58" } }); fireEvent.change(screen.getByLabelText(/Total spent/), { target: { value: "44 200" } });
    fireEvent.change(screen.getByLabelText(/What was delivered/), { target: { value: "We ran the twelve week programme for fifty-eight young people and held the pitch day." } });
    fireEvent.change(screen.getByLabelText(/What was achieved/), { target: { value: "Fifty-eight finished and twenty-two have started a business, confirmed by follow-up calls." } });
    fireEvent.change(screen.getByLabelText(/How the money was spent/), { target: { value: "Facilitators, venue hire and the pitch day, as budgeted." } });
    fireEvent.change(screen.getByLabelText(/Brand logo placement/), { target: { value: "Logo on all banners and shirts." } }); fireEvent.change(screen.getByLabelText(/Social media exposure/), { target: { value: "Twelve posts reaching four thousand people." } });
    fireEvent.change(screen.getByLabelText(/Choose files: Evidence/), { target: { files: [pdf("receipts.pdf")] } }); await screen.findByText("receipts.pdf");
  };
  it("asks for a note on every promised benefit, the figures and evidence, and names each problem", () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    render(<ReportForm refNo="SP-ABC234" email="thandi@example.com" currency="ZAR" benefits={benefits} supportEmail="sponsorships@vink.co.za" onSent={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Send the final report" }));
    const errs = [...document.querySelectorAll(".sf-err")].map((e) => e.textContent);
    expect(errs).toHaveLength(8); expect(errs.join("|")).toMatch(/Brand logo placement/); expect(errs.join("|")).toMatch(/Social media exposure/); expect(errs.join("|")).toMatch(/Attach evidence/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("sends the numbers as numbers, the benefit notes by id, and the evidence as files", async () => {
    const f = reply(201, { success: true, data: { message: "ok" } }); globalThis.fetch = f; const onSent = vi.fn();
    render(<ReportForm refNo="SP-ABC234" email="thandi@example.com" currency="ZAR" benefits={benefits} supportEmail="sponsorships@vink.co.za" onSent={onSent} />);
    await fill(); fireEvent.click(screen.getByRole("button", { name: "Send the final report" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [url, init] = vi.mocked(f).mock.calls[0] as unknown as [string, RequestInit]; const fd = init.body as FormData; const data = JSON.parse(String(fd.get("data")));
    expect(url).toMatch(/\/api\/sponsorship\/report$/); expect(data).toMatchObject({ ref: "SP-ABC234", email: "thandi@example.com", beneficiaries: 58, spent: 44200, benefitsDelivered: { logo: "Logo on all banners and shirts.", social: "Twelve posts reaching four thousand people." } });
    expect(fd.getAll("file")).toHaveLength(1);
  });
  it("puts the server's complaint on the right field", async () => {
    globalThis.fetch = reply(400, { success: false, error: "Say what you delivered", fields: { "benefitsDelivered.logo": "Say what you delivered for \"Brand logo placement\" (or why it was not delivered)" } });
    render(<ReportForm refNo="SP-ABC234" email="thandi@example.com" currency="ZAR" benefits={benefits} supportEmail="sponsorships@vink.co.za" onSent={() => {}} />);
    await fill(); fireEvent.click(screen.getByRole("button", { name: "Send the final report" }));
    expect((await screen.findByText(/Say what you delivered for "Brand logo placement"/)).closest("div")!.querySelector("input")!.id).toBe("rp-b-logo");
  });
});

describe("the tracker with all of it", () => {
  it("shows a reply form when information is asked for, and looks again after it is sent", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify(String(url).endsWith("/reply") ? { success: true, data: {} } : { success: true, data: base }), { status: String(url).endsWith("/reply") ? 201 : 200 }); }) as unknown as typeof fetch;
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />); lookup();
    expect(await screen.findByRole("heading", { name: "We need a little more from you" })).toBeTruthy(); expect(screen.queryByRole("form", { name: "Final report" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Your reply/), { target: { value: "The quote is attached below." } }); fireEvent.click(screen.getByRole("button", { name: "Send my reply" }));
    await waitFor(() => expect(calls.filter((c) => c.endsWith("/track"))).toHaveLength(2));
  });
  it("shows the award, a report form once it is signed, and a timeline that includes what the applicant sent", async () => {
    const t: Tracked = { ...base, status: "agreement_pending", statusLabel: "Agreement pending", canReply: false, canReport: true, benefits: [{ id: "logo", label: "Brand logo placement" }], award: { ...award, stage: "active", stageLabel: "Agreement signed", signedOn: "2026-10-08" },
      timeline: [...base.timeline, { kind: "reply", status: "reply", label: "You sent more information", at: "2026-10-13T09:00:00Z", message: "The quote is attached." }, { kind: "report", status: "report_returned", label: "Final report returned for changes", at: "2026-10-20T09:00:00Z", message: "Please add the receipts." }] };
    globalThis.fetch = reply(200, { success: true, data: t });
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />); lookup();
    expect(await screen.findByRole("heading", { name: /ZAR 45.?000 awarded/ })).toBeTruthy(); expect(screen.getByRole("form", { name: "Final report" })).toBeTruthy(); expect(screen.queryByRole("form", { name: "Reply to our question" })).toBeNull();
    const items = [...document.querySelectorAll(".sf-timeline__item")].map((li) => li.querySelector("strong")!.textContent);
    expect(items).toEqual(["Final report returned for changes", "You sent more information", "More information required", "Submitted"]);
    expect(screen.getByText("Please add the receipts.")).toBeTruthy(); expect(document.querySelector(".sf-timeline__item--warn")).toBeTruthy();
  });
  it("shows neither form when there is nothing to do", async () => {
    globalThis.fetch = reply(200, { success: true, data: { ...base, status: "under_review", statusLabel: "Under review", canReply: false } });
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />); lookup(); await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" });
    expect(screen.queryByRole("form", { name: "Reply to our question" })).toBeNull(); expect(screen.queryByRole("form", { name: "Final report" })).toBeNull(); expect(within(document.body).queryByText(/awarded/)).toBeNull();
  });
});
