import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { Pager } from "./widgets";

afterEach(() => cleanup());
describe("Pager", () => {
  it("shows nothing when everything fits on one page", () => { render(<Pager total={10} limit={25} offset={0} onChange={() => {}} />); expect(screen.queryByRole("navigation")).toBeNull(); });
  it("draws its arrows in the theme's text colour, not white (white is invisible on a white card)", () => {
    render(<Pager total={60} limit={25} offset={25} onChange={() => {}} />);
    for (const name of ["Previous page", "Next page"]) { const b = screen.getByRole("button", { name }); expect(b.className, name).toContain("text-fg"); expect(b.className, name).not.toMatch(/text-white/); }
    expect(screen.getByText("26–50 of 60")).toBeTruthy(); expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });
});
