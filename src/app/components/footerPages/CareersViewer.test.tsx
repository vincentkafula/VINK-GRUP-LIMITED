import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CareersViewer } from "./CareersViewer";

describe("Careers page", () => {
  it("lists every open role with its own 'Apply now' button", () => {
    render(<CareersViewer isOpen onClose={() => {}} onApply={() => {}} />);
    const buttons = screen.getAllByRole("button", { name: /^Apply now for / });
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    // the visible label is "Apply now", not the bare "Apply" it used to be
    for (const b of buttons) expect(b.textContent).toBe("Apply now");
    expect(screen.getByRole("button", { name: "Apply now for Senior Software Engineer" })).toBeTruthy();
  });

  it("opens the job application form when any role's 'Apply now' is pressed (it used to do nothing)", () => {
    const onApply = vi.fn();
    render(<CareersViewer isOpen onClose={() => {}} onApply={onApply} />);
    const buttons = screen.getAllByRole("button", { name: /^Apply now for / });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onApply).toHaveBeenCalledTimes(2);
  });
});
