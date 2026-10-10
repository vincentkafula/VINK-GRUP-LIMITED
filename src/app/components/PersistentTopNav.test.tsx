// @vitest-environment jsdom
import { readFileSync } from "fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { PersistentTopNav } from "./PersistentTopNav";
import { NOTICE_H, BAR_H } from "./SiteChrome";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("the header on every page", () => {
  it("is 97px tall: the notice and a 65px bar, which is the offset theme.css gives every full-screen page", () => {
    expect(NOTICE_H + BAR_H).toBe(97);
    expect(readFileSync("src/styles/theme.css", "utf8")).toContain("top: 97px !important");
  });

  it("has the same buttons as the home page: sections, search, theme and Login, and Login opens the sign-in page", () => {
    const login = vi.fn();
    act(() => { root.render(<PersistentTopNav active={null} onSelect={() => {}} onHome={() => {}} onLogin={login} />); });
    expect([...host.querySelectorAll('nav a')].map((a) => a.textContent)).toEqual(["Personal", "Business", "Corporate"]);
    expect(host.querySelector('button[aria-label="Search pages and actions"]')).toBeTruthy();
    act(() => { ([...host.querySelectorAll("button")].find((b) => b.textContent === "Login") as HTMLElement).click(); });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("shows the person's name instead of Login once signed in", () => {
    const profile = vi.fn();
    act(() => { root.render(<PersistentTopNav active="Business" onSelect={() => {}} onHome={() => {}} isLoggedIn userName="Thandi" onProfile={profile} />); });
    expect(host.textContent).not.toContain("Login"); expect(host.textContent).toContain("Thandi");
    act(() => { ([...host.querySelectorAll("button")].find((b) => b.textContent!.includes("Thandi")) as HTMLElement).click(); });
    expect(profile).toHaveBeenCalledTimes(1);
  });
});
