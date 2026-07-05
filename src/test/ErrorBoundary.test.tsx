import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../app/components/ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion 💥");
  return <p>All good</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(<ErrorBoundary><Bomb shouldThrow={false} /></ErrorBoundary>);
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows fallback UI on error", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary label="Test Section"><Bomb shouldThrow={true} /></ErrorBoundary>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Test explosion/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("resets after clicking try again", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
    fireEvent.click(screen.getByText("Try again"));
    rerender(<ErrorBoundary><Bomb shouldThrow={false} /></ErrorBoundary>);
    expect(screen.getByText("All good")).toBeInTheDocument();
    spy.mockRestore();
  });
});
