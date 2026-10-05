import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AboutVINKViewer } from "./AboutVINKViewer";

describe("About VINK page", () => {
  it("shows the company story, sections and head office", () => {
    render(<AboutVINKViewer isOpen onClose={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "About VINK" })).toBeTruthy();
    for (const h of ["Our story", "Mission & vision", "One network, many services", "Core values", "Social Development", "BBBEE & ownership", "Company milestones", "Head office"]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
    expect(screen.getByText(/8 Rose Street/)).toBeTruthy();
  });
});
