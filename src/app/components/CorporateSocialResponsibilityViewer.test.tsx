import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CorporateSocialResponsibilityViewer } from "./CorporateSocialResponsibilityViewer";

describe("Social Responsibility page", () => {
  it("shows every tab from the content document and switches between them", () => {
    render(<CorporateSocialResponsibilityViewer isOpen onClose={() => {}} onNavigate={() => {}} />);
    for (const l of ["About", "Cities We Serve", "Office of the CEO", "Safety & Security Department", "Urban Management", "Social Development", "Communications", "Get Involved"]) {
      expect(screen.getByRole("button", { name: l })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "About Social Development" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cities We Serve" }));
    expect(screen.getByRole("heading", { name: "Public safety partners by city" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Safety & Security Department" }));
    expect(screen.getByRole("heading", { name: "A note on CCTV footage" })).toBeTruthy();
  });
});
