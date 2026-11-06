import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DashboardShell, type NavItem } from "./DashboardShell";

afterEach(cleanup);
const items = (): NavItem[] => [{ icon: <span />, label: "Compliance", group: "Overview" }, { icon: <span />, label: "Summary", group: "Overview" }, { icon: <span />, label: "Registration", group: "Registers" }, { icon: <span />, label: "Vehicles", group: "Registers", display: "Vehicle register" }, { icon: <span />, label: "Levies", group: "Money" }, { icon: <span />, label: "Loose" }];
const shell = (on = "Compliance", onNav = vi.fn()) => render(<DashboardShell title="Association" subtitle="x" accentColor="#C8102E" gradient="from-red" navItems={items()} activeNav={on} onNavChange={onNav} onClose={() => undefined}><p>content</p></DashboardShell>);

describe("the menu's groups", () => {
  it("shows each group's heading once, above its first item, and none for items with no group", () => {
    shell(); const nav = screen.getAllByRole("list")[0]; const heads = within(nav).getAllByRole("presentation").map((h) => h.textContent); expect(heads.slice(0, 3)).toEqual(["Overview", "Registers", "Money"]);
    expect(within(nav).getAllByRole("presentation")).toHaveLength(3);                                                                                     // "Loose" has no group, and follows the last group without a heading of its own... so there is none
  });
  it("still navigates by the item's label, shows its display text when it has one, and marks the current page", () => {
    const onNav = vi.fn(); shell("Vehicles", onNav); const nav = screen.getAllByRole("list")[0]; const b = within(nav).getByRole("button", { name: /Vehicle register/ }); expect(b).toHaveAttribute("aria-current", "page"); fireEvent.click(within(nav).getByRole("button", { name: /Registration/ })); expect(onNav).toHaveBeenCalledWith("Registration");
    fireEvent.click(b); expect(onNav).toHaveBeenLastCalledWith("Vehicles");
  });
});
