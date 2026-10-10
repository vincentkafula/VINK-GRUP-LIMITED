// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Header } from "./Header";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => { root.render(<Header onHome={() => {}} onSubNavClick={() => {}} />); });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const open = () => act(async () => { window.dispatchEvent(new Event("vink:open-login")); });
const panel = () => [...document.querySelectorAll<HTMLElement>(".fixed.inset-0")].find((e) => e.textContent!.includes("Need help signing in"));

describe("the sign-in panel and the site header", () => {
  it("opens as a full page of its own, with no second logo, and leaves the site header to the App", async () => {
    await open();
    const p = panel()!; expect(p).toBeTruthy();
    expect(p.style.background).toContain("var(--vk-bg)"); expect(p.className).toContain("overflow-y-auto");          // a page, not a dimmed dialog over the home page
    expect(p.querySelector('img[alt="VINK"]')).toBeNull();                                                          // the logo is in the header, once
    expect(p.textContent).toContain("Username"); expect(p.textContent).toContain("Password");
  });

  it("closes when a section is chosen from the header", async () => {
    await open();
    await act(async () => { ([...host.querySelectorAll('nav[aria-label="Primary"] a')].find((a) => a.textContent === "Business") as HTMLElement).click(); });
    expect(panel()).toBeUndefined();
  });
});
