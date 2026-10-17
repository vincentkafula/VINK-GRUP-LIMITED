import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SponsorshipViewer } from "./SponsorshipViewer";

const open = (onClose = () => {}) => render(<SponsorshipViewer isOpen onClose={onClose} />);
const goTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("Sponsorship page", () => {
  it("has the hero, a tab bar and a breadcrumb, and starts on the focus areas", () => {
    const onClose = vi.fn();
    open(onClose);
    expect(screen.getByRole("heading", { level: 1, name: "Sponsorship & Community Investment" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Focus areas", "Who can apply", "How to apply"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Home" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps all four focus areas with their original wording, including the neighbourhood watch statement", () => {
    open();
    for (const t of ["Transport Safety", "Youth Entrepreneurship", "Community Safety", "Grassroots Sport"]) expect(screen.getByRole("heading", { name: t })).toBeTruthy();
    expect(screen.getByText(/5% of every VINK taxi transaction goes directly to neighbourhood watch in the area served\./)).toBeTruthy();
    expect(screen.getByText("Football leagues, athletics, and martial arts at community level — supporting healthy, active communities.")).toBeTruthy();
  });

  it("shows the numbers in the hero: four focus areas, the R500,000 maximum, the quarterly review", () => {
    open();
    const stats = screen.getByRole("list", { name: "Sponsorship at a glance" });
    expect(within(stats).getByText("4")).toBeTruthy();
    expect(within(stats).getByText("R500,000")).toBeTruthy();
    expect(within(stats).getByText("Quarterly")).toBeTruthy();
  });

  it("switches tabs with the mouse, the arrow keys, Home and End, and from the hero links", () => {
    open();
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Eligibility criteria" })).toBeTruthy();
    fireEvent.keyDown(screen.getAllByRole("tab")[1], { key: "End" });
    expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getAllByRole("tab")[2], { key: "Home" });
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(document.querySelector(".vc-hero__links") as HTMLElement).getByRole("button", { name: /Who can apply/ }));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });

  it("lists the four eligibility criteria, including the minimum and maximum request", () => {
    open();
    goTab("Who can apply");
    expect(screen.getByText("Non-profit organisations, community sport teams, school programmes, or community events")).toBeTruthy();
    expect(screen.getByText("Priority given to Western Cape applicants; national applications considered")).toBeTruthy();
    expect(screen.getByText("Clear community benefit aligned with VINK values required")).toBeTruthy();
    expect(screen.getByText("Minimum request: R5,000 · Maximum: R500,000 per application")).toBeTruthy();
  });

  it("tells applicants where to send a proposal and what to include, as real mail links", () => {
    open();
    goTab("How to apply");
    for (const l of screen.getAllByRole("link", { name: /sponsorships@vink\.co\.za/ })) expect(l.getAttribute("href")).toBe("mailto:sponsorships@vink.co.za");
    const include = screen.getByRole("heading", { name: "Include in your proposal" }).closest(".vc-card") as HTMLElement;
    expect(within(include).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Organisation background and mission", "Event or programme details and dates", "Requested amount",
      "Expected community reach and impact", "Proof of NPO or community organisation registration",
    ]);
  });

  it("explains the process in three steps and keeps the quarterly review and the 6-week answer", () => {
    open();
    goTab("How to apply");
    const next = screen.getByRole("heading", { name: "What happens next" }).closest(".vc-card") as HTMLElement;
    const steps = within(next).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[1].textContent).toContain("VINK reviews applications on a quarterly basis");
    expect(steps[2].textContent).toContain("within 6 weeks of the review date");
  });

  it("has a FAQ whose answers open and close, and one that jumps to the eligibility tab", () => {
    open();
    goTab("How to apply");
    const q = screen.getByRole("button", { name: "How much can I ask for?" });
    expect(q.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(q);
    expect(q.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Minimum request: R5,000 · Maximum: R500,000 per application.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Who can apply?" }));
    fireEvent.click(screen.getByRole("button", { name: /See every criterion/ }));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });

  it("ends with the 'ready to apply' band and the sponsorship mailbox's reply time", () => {
    open();
    goTab("How to apply");
    const band = screen.getByRole("complementary", { name: "Ready to apply?" });
    expect(within(band).getByText("Sponsorships and Partnerships")).toBeTruthy();
    expect(within(band).getByText("Replies within 1–2 business days")).toBeTruthy();
    expect(within(band).getByRole("link", { name: "Send a proposal" }).getAttribute("href")).toBe("mailto:sponsorships@vink.co.za");
  });
});
