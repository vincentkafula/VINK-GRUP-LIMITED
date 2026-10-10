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
  it("starts below the header, so Personal, Business and Corporate stay visible and are not covered", async () => {
    await open();
    expect(panel()).toBeTruthy(); expect(panel()!.style.top).toBe("var(--vk-header-h, 0px)");
    const nav = host.querySelector('nav[aria-label="Primary"]')!;
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Personal", "Business", "Corporate"]);
  });

  it("closes when a section is chosen from the header", async () => {
    await open();
    await act(async () => { ([...host.querySelectorAll('nav[aria-label="Primary"] a')].find((a) => a.textContent === "Business") as HTMLElement).click(); });
    expect(panel()).toBeUndefined();
  });
});
