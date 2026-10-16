import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CareersViewer } from "./CareersViewer";

const open = (onApply = () => {}) => render(<CareersViewer isOpen onClose={() => {}} onApply={onApply} />);
const roleButtons = () => screen.getAllByRole("button", { name: /^Apply now for / });

describe("Careers page: open roles", () => {
  it("lists every open role with its own 'Apply now' button", () => {
    open();
    const buttons = roleButtons();
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of buttons) expect(b.textContent).toBe("Apply now");       // not the bare "Apply" it used to be
    expect(screen.getByRole("button", { name: "Apply now for Senior Software Engineer" })).toBeTruthy();
  });

  it("opens the job application form when any role's 'Apply now' is pressed (it used to do nothing)", () => {
    const onApply = vi.fn();
    open(onApply);
    const buttons = roleButtons();
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it("searches by role, team or location and says how many roles are showing", () => {
    open();
    const total = roleButtons().length;
    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "compliance" } });
    expect(roleButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["Apply now for Compliance Officer"]);
    expect(screen.getByText(`Showing 1 of ${total} roles`)).toBeTruthy();
  });

  it("filters by contract type, and by team", () => {
    open();
    const total = roleButtons().length;
    fireEvent.click(screen.getByRole("button", { name: "Contract" }));
    const contract = roleButtons();
    expect(contract.length).toBeGreaterThan(0);
    expect(contract.length).toBeLessThan(total);
    expect(screen.getByRole("button", { name: "Contract" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Filter by team"), { target: { value: "Finance" } });
    expect(roleButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["Apply now for Data Analyst"]);
  });

  it("shows a helpful empty state and a way back when nothing matches", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "zzzz-no-such-role" } });
    expect(screen.queryAllByRole("button", { name: /^Apply now for / })).toHaveLength(0);
    expect(screen.getByText("No roles match your search")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(roleButtons().length).toBeGreaterThanOrEqual(5);
  });

  it("offers a way in when no role fits: an application button and the real careers mailbox", () => {
    const onApply = vi.fn();
    open(onApply);
    fireEvent.click(screen.getByRole("button", { name: "Start an application" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const mail = screen.getAllByRole("link", { name: "careers@vink.co.za" })[0];
    expect(mail.getAttribute("href")).toBe("mailto:careers@vink.co.za");
  });
});

describe("Careers page: structure and the other tabs", () => {
  it("has the hero, a tab bar and a breadcrumb, and switches tabs with the mouse and the arrow keys", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: /Build the Future of African Payments/ })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent!.replace(/\d+$/, ""))).toEqual(["Open roles", "Graduates & interns", "Why VINK", "How we hire"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Graduate & Internship Programme" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Why VINK" }));
    expect(screen.getByRole("heading", { name: "Gym Access" })).toBeTruthy();
    expect(screen.getByText("Partner gyms (to be announced)")).toBeTruthy();
  });

  it("keeps the graduate programme's facts and its email", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Graduates & interns" }));
    expect(screen.getByText("12 months, paid")).toBeTruthy();
    expect(screen.getByText("Open annually in January")).toBeTruthy();
    expect(screen.getByRole("link", { name: /intern@vink\.co\.za/ }).getAttribute("href")).toBe("mailto:intern@vink.co.za");
  });

  it("explains how hiring works: four steps and a FAQ whose answers open and close", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "How we hire" }));
    const steps = screen.getByRole("heading", { name: "What happens next" }).closest(".vc-card") as HTMLElement;
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    const q = screen.getByRole("button", { name: "What happens after I apply?" });
    expect(q.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(q);
    expect(q.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Shortlisted candidates are contacted within 5 business days.")).toBeTruthy();
  });

  it("starts an application from the FAQ too", () => {
    const onApply = vi.fn();
    open(onApply);
    fireEvent.click(screen.getByRole("tab", { name: "How we hire" }));
    fireEvent.click(screen.getByRole("button", { name: "I can't see a role that fits me" }));
    fireEvent.click(screen.getByRole("button", { name: /Start an application/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
