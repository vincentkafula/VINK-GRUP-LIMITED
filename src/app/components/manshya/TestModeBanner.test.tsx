import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestModeBanner } from "./TestModeBanner";

const health = (body: object | null) => vi.stubGlobal("fetch", vi.fn(async () => {
  if (body === null) throw new Error("down");
  return new Response(JSON.stringify(body), { status: 200 });
}));
afterEach(() => vi.unstubAllGlobals());

describe("TestModeBanner", () => {
  it("shows in sandbox mode", async () => {
    health({ ok: true, mode: "test", payments_mode: "sandbox" });
    render(<TestModeBanner />);
    expect(await screen.findByText(/TEST MODE/)).toBeInTheDocument();
  });
  it("is hidden in live mode", async () => {
    health({ ok: true, mode: "live", payments_mode: "live" });
    const { container } = render(<TestModeBanner />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
  it("assumes test mode when the server cannot be reached", async () => {
    health(null);
    render(<TestModeBanner />);
    expect(await screen.findByText(/TEST MODE/)).toBeInTheDocument();
  });
});
