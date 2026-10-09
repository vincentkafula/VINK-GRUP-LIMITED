// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SECTION_PAGES, OTHER_SITE_PAGES, APP_PAGES, siteChrome } from "./sitePages";
import { BusinessAccountApplicationViewer } from "./components/BusinessAccountApplicationViewer";
import { FiveHundredGlobalApplication } from "./components/FiveHundredGlobalApplication";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = fs.readFileSync(path.resolve(__dirname, "App.tsx"), "utf8");
const sectionPages = Object.values(SECTION_PAGES).flat();
const sitePages = [...sectionPages, ...OTHER_SITE_PAGES];

describe("which pages show the Personal / Business / Corporate header", () => {
  it("shows it on every public page, and highlights the section a page belongs to", () => {
    for (const [section, pages] of Object.entries(SECTION_PAGES)) for (const p of pages) expect(siteChrome({ [p]: true }), p).toEqual({ section, showNav: true });
    for (const p of OTHER_SITE_PAGES) expect(siteChrome({ [p]: true }), p).toEqual({ section: null, showNav: true });
  });

  it("does not show it on the home page, or on the signed-in tools that keep their own layout", () => {
    expect(siteChrome({})).toEqual({ section: null, showNav: false });
    for (const p of APP_PAGES) expect(siteChrome({ [p]: true }), p).toEqual({ section: null, showNav: false });
  });

  it("includes the pages that used to be missing: the Business landing page, the legal and information pages, and Exchange Rates", () => {
    for (const p of ["showBusinessLanding", "showLegal", "showBranchLocator", "showSponsorship", "showBankingFees", "showBankingGuide", "showBankingChannels", "showExchangeRates", "showLatestOffers", "showMarketIndices", "showVinkBlog"]) expect(siteChrome({ [p]: true }).showNav, p).toBe(true);
    expect(siteChrome({ showBusinessLanding: true }).section).toBe("Business");
  });

  it("accounts for every page the app can open: each one is in exactly one list, so a new page cannot be forgotten", () => {
    const flags = [...app.matchAll(/const \[(show\w+|selectorOpen),\s*set\w+\]\s*=\s*useState/g)].map((m) => m[1]);
    expect(flags.length).toBeGreaterThan(60);
    const listed = [...sitePages, ...APP_PAGES];
    expect(flags.filter((f) => !listed.includes(f)), "pages in App.tsx that are in no list in sitePages.ts").toEqual([]);
    expect(listed.filter((f) => !flags.includes(f)), "names in sitePages.ts that App.tsx does not have").toEqual([]);
    expect(new Set(listed).size, "a page in two lists").toBe(listed.length);
  });

  it("passes every public page to the header rule, and closes every one of them when the header's Close or a section button is used", () => {
    const call = /siteChrome\(\{([\s\S]*?)\}\);/.exec(app)![1];
    const passed = [...call.matchAll(/\b(show\w+|selectorOpen)\b/g)].map((m) => m[1]);
    expect(sitePages.filter((p) => !passed.includes(p)), "public pages not passed to siteChrome").toEqual([]);
    const closers = /const sitePageClosers[\s\S]*?=\s*\{([\s\S]*?)\};/.exec(app)![1];
    const closed = [...closers.matchAll(/\b(show\w+|selectorOpen):/g)].map((m) => m[1]);
    expect(sitePages.filter((p) => !closed.includes(p)), "public pages the header cannot close").toEqual([]);
  });
});

describe("footers on the pages that used to have none", () => {
  let root: Root, host: HTMLElement;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("the Business Account application ends with the site footer", () => {
    act(() => { root.render(<BusinessAccountApplicationViewer isOpen onClose={() => {}} />); });
    expect(host.querySelector("footer")).not.toBeNull(); expect(host.textContent).toContain("Useful Tools"); expect(host.textContent).toContain("Who We Are");
  });

  it("the 500 Global application ends with the site footer", () => {
    act(() => { root.render(<FiveHundredGlobalApplication isOpen onClose={() => {}} />); });
    expect(host.querySelector("footer")).not.toBeNull(); expect(host.textContent).toContain("Useful Tools");
  });
});
