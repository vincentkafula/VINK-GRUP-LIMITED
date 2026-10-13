// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { SignInElsewhere } from "./SignInElsewhere";
import { openSignIn } from "../services/signIn";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("every Sign in opens the main sign-in", () => {
  it("openSignIn closes the page it is on, then asks the site for the sign-in", () => {
    const asked = vi.fn(), closed = vi.fn(); window.addEventListener("vink:open-login", asked);
    openSignIn(closed); window.removeEventListener("vink:open-login", asked);
    expect(closed).toHaveBeenCalledTimes(1); expect(asked).toHaveBeenCalledTimes(1);
  });
  it("the sign-in required card has a Sign in button, not only advice to find the Login button", async () => {
    const asked = vi.fn(), close = vi.fn(); window.addEventListener("vink:open-login", asked);
    await act(async () => { root.render(<SignInElsewhere onClose={close} label="The Management Hub" />); });
    const b = [...host.querySelectorAll("button")].find((x) => x.textContent === "Sign in") as HTMLElement; expect(b).toBeTruthy();
    expect(host.textContent).not.toContain("Login button in the main menu");
    await act(async () => { b.click(); }); window.removeEventListener("vink:open-login", asked);
    expect(close).toHaveBeenCalledTimes(1); expect(asked).toHaveBeenCalledTimes(1);
  });
  it("the staff-only and session-expired screens carry a Sign in button too", () => {
    for (const f of ["components/ManagementPanelViewer.tsx", "components/manshya/ManshyaAdmin.tsx", "components/portal/AdminConfig.tsx", "components/portal/AdminBankLinks.tsx", "components/PersonalAccountApplicationViewer.tsx", "components/portal/RolePortal.tsx"])
      expect(readFileSync("src/app/" + f, "utf8"), f).toContain("openSignIn(");
  });
  it("the sign-in page sits above the Personal, Business and Corporate pages (z-50) and below the header strip (z-[100]), so it is never hidden behind them", () => {
    const m = readFileSync("src/app/components/LoginModal.tsx", "utf8").match(/fixed inset-0 z-\[(\d+)\] flex flex-col overflow-y-auto/);
    expect(m).not.toBeNull(); const z = Number(m![1]); expect(z).toBeGreaterThan(50); expect(z).toBeLessThan(100);
  });
});
