// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { PersonalAccountViewer } from "./PersonalAccountViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true })))); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("the Personal accounts page bar", () => {
  it("has no currency button and no signed-in name or Sign out menu", async () => {
    await act(async () => { root.render(<PersonalAccountViewer isOpen onClose={() => {}} onNavigate={() => {}} onOpenBankingApp={() => {}} />); });
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent!.trim());
    expect(buttons).not.toContain("ZAR"); expect(host.textContent).not.toContain("Sign out");
    expect(readFileSync("src/app/components/PersonalAccountViewer.tsx", "utf8")).not.toContain("Sign out");
  });
  it("shows a signed-in visitor as Account in the site header, never the role (System) as a name", () => {
    expect(readFileSync("src/app/App.tsx", "utf8")).not.toMatch(/userName={userRole/);
  });
  it("offers only Light and Dark in the profile's appearance settings", () => {
    const s = readFileSync("src/app/components/UserProfileViewer.tsx", "utf8");
    expect(s).toContain('["Light", "Dark"]'); expect(s).not.toContain('"System"]');
  });
});
