// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { existsSync, readFileSync } from "node:fs";
import { MobileAppOverlay } from "./PhoneFrame";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("phone-app previews are honest", () => {
  it("every phone app says it is a preview with sample data, and its Sign in button opens the real sign-in", async () => {
    const close = vi.fn(), asked = vi.fn(); window.addEventListener("vink:open-login", asked);
    await act(async () => { root.render(<MobileAppOverlay onClose={close} appName="Test"><p>screen</p></MobileAppOverlay>); });
    const note = host.querySelector("[data-preview-notice]") as HTMLElement;
    expect(note.textContent).toMatch(/Preview with sample data/);
    await act(async () => { (note.querySelector("button") as HTMLElement).click(); });
    window.removeEventListener("vink:open-login", asked);
    expect(close).toHaveBeenCalledTimes(1); expect(asked).toHaveBeenCalledTimes(1);
  });

  it("the open, simulated /api/global banking API and its dashboard are gone, and the app no longer reports a fake transfer", () => {
    for (const f of ["src/app/components/GlobalBankingDashboard.tsx", "server/src/routes/globalBanking.ts", "server/src/data/globalBankingStore.ts"]) expect(existsSync(f), f).toBe(false);
    expect(readFileSync("server/src/index.ts", "utf8")).not.toContain("/api/global");
    expect(readFileSync("src/app/components/apps/VinkBankingApp.tsx", "utf8")).not.toMatch(/p2pTransfer|Sent successfully!.*setSuccess\(\{/);
  });
});
