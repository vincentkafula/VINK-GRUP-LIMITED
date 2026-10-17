import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SponsorshipTracker, type Tracked } from "./SponsorshipTracker";

const tracked: Tracked = {
  ref: "SP-ABC234", status: "more_information_required", statusLabel: "More information required", project: "Township Entrepreneurs Bootcamp", organisation: "Khayelitsha Youth Hub",
  submittedAt: "2026-10-09T10:00:00Z", updatedAt: "2026-10-14T09:00:00Z",
  timeline: [
    { status: "submitted", label: "Submitted", at: "2026-10-09T10:00:00Z", message: null },
    { status: "under_review", label: "Under review", at: "2026-10-12T08:00:00Z", message: null },
    { status: "more_information_required", label: "More information required", at: "2026-10-14T09:00:00Z", message: "Please send a quote for the venue hire." },
  ],
};
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const fill = (ref: string, email: string) => { fireEvent.change(screen.getByLabelText(/Reference number/), { target: { value: ref } }); fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: email } }); };
const find = () => fireEvent.click(screen.getByRole("button", { name: /Find my application/ }));

afterEach(() => cleanup());

describe("following an application", () => {
  it("shows the project, where it stands, and what the applicant was told, newest first", async () => {
    const f = reply(200, { success: true, data: tracked }); globalThis.fetch = f;
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />);
    fill(" sp-abc234 ", "Thandi@Example.com"); find();
    expect(await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" })).toBeTruthy();
    expect(screen.getByText(/Khayelitsha Youth Hub · sent 9 October 2026/)).toBeTruthy();
    const status = document.querySelector(".sf-status")!; expect(status.textContent).toBe("More information required"); expect(status.className).toContain("sf-status--warn");
    const items = [...document.querySelectorAll(".sf-timeline__item")].map((li) => li.querySelector("strong")!.textContent);
    expect(items).toEqual(["More information required", "Under review", "Submitted"]);
    expect(screen.getByText("Please send a quote for the venue hire.")).toBeTruthy();
    const [url, init] = vi.mocked(f).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/sponsorship\/track$/); expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "SP-ABC234", email: "Thandi@Example.com" });         // the reference is tidied; the email goes in the body, never the address bar
  });

  it("uses a different look, and an icon as well as words, for each kind of outcome", async () => {
    for (const [status, cls, label] of [["approved", "ok", "Approved"], ["declined", "bad", "Declined"], ["under_review", "plain", "Under review"], ["agreement_pending", "ok", "Agreement pending"]] as const) {
      globalThis.fetch = reply(200, { success: true, data: { ...tracked, status, timeline: [tracked.timeline[0]] } });
      const { unmount } = render(<SponsorshipTracker email="sponsorships@vink.co.za" />);
      fill("SP-ABC234", "a@b.co"); find();
      await waitFor(() => expect(document.querySelector(".sf-status")).toBeTruthy());
      const s = document.querySelector(".sf-status")!; expect(s.className).toContain(`sf-status--${cls}`); expect(s.textContent).toBe(label); expect(s.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });

  it("gives the same answer whether the reference or the email was wrong, so nobody can probe for other people's applications", async () => {
    globalThis.fetch = reply(404, { success: false, error: "We could not find an application with that reference and email address. Check both and try again." });
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />);
    fill("SP-ABC234", "wrong@example.com"); find();
    expect((await screen.findByRole("alert")).textContent).toBe("We could not find an application with that reference and email address. Check both and try again.");
    expect(screen.queryByRole("heading", { name: "Township Entrepreneurs Bootcamp" })).toBeNull();
  });

  it("checks what was typed before asking the server", () => {
    const f = vi.fn(); globalThis.fetch = f as unknown as typeof fetch;
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />);
    fill("hello", "a@b.co"); find(); expect(screen.getByRole("alert").textContent).toMatch(/starts with SP-/);
    fill("SP-ABC234", "not an email"); find(); expect(screen.getByRole("alert").textContent).toMatch(/email address you used/);
    expect(f).not.toHaveBeenCalled();
  });

  it("says what to do when the lookup cannot be made", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />);
    fill("SP-ABC234", "a@b.co"); find();
    expect((await screen.findByRole("alert")).textContent).toMatch(/check your connection.*sponsorships@vink\.co\.za/);
  });

  it("looks the application up by itself when it is opened with the reference and email just used", async () => {
    globalThis.fetch = reply(200, { success: true, data: tracked });
    render(<SponsorshipTracker email="sponsorships@vink.co.za" prefill={{ ref: "SP-ABC234", email: "thandi@example.com" }} />);
    expect((screen.getByLabelText(/Reference number/) as HTMLInputElement).value).toBe("SP-ABC234");
    expect(await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" })).toBeTruthy();
  });

  it("repeats the review timing and a way to write to the sponsorship team", async () => {
    globalThis.fetch = reply(200, { success: true, data: tracked });
    render(<SponsorshipTracker email="sponsorships@vink.co.za" prefill={{ ref: "SP-ABC234", email: "a@b.co" }} />);
    await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" });
    expect(screen.getByText(/quarterly basis.*within 6 weeks of the review date/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "sponsorships@vink.co.za" }).getAttribute("href")).toBe("mailto:sponsorships@vink.co.za");
  });
});
