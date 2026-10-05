// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { ThemeProvider, ThemeToggle, Button, TextField, Modal, EmptyState, ErrorState, SkeletonList } from "./index";
import { AppLink, LaunchNotice } from "../SiteChrome";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => {
  localStorage.clear(); document.documentElement.className = "";
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el: React.ReactElement) => act(async () => { root.render(el); });

describe("theme", () => {
  it("cycles light, dark and device; applies the dark class; remembers the choice; and the button says what a press does", async () => {
    await render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    const btn = () => host.querySelector("button")!;
    expect(btn().getAttribute("aria-label")).toMatch(/Match my device.*Switch to: light theme/);
    await act(async () => { btn().click(); });
    expect(localStorage.getItem("vink-theme")).toBe("light"); expect(document.documentElement.classList.contains("dark")).toBe(false);
    await act(async () => { btn().click(); });
    expect(localStorage.getItem("vink-theme")).toBe("dark"); expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(btn().getAttribute("aria-label")).toMatch(/Dark theme.*Switch to: match my device/);
    await act(async () => { btn().click(); });
    expect(localStorage.getItem("vink-theme")).toBe("system");
  });
  it("follows the device when set to system", async () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    await render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("Button", () => {
  it("is a button by default, and while loading it is busy and cannot be pressed again", async () => {
    const fn = vi.fn();
    await render(<Button onClick={fn} loading>Save</Button>);
    const b = host.querySelector("button")!;
    expect(b.type).toBe("button"); expect(b.disabled).toBe(true); expect(b.getAttribute("aria-busy")).toBe("true");
    await act(async () => { b.click(); }); expect(fn).not.toHaveBeenCalled();
  });
});

describe("TextField", () => {
  it("ties the label, hint and error to the control", async () => {
    await render(<TextField label="Email" hint="We never share it" error="Enter a valid email" required />);
    const input = host.querySelector("input")!, label = host.querySelector("label")!;
    expect(label.htmlFor).toBe(input.id); expect(input.getAttribute("aria-invalid")).toBe("true"); expect(input.getAttribute("aria-required")).toBe("true");
    const err = host.querySelector("[role=alert]")!;
    expect(input.getAttribute("aria-describedby")).toContain(err.id); expect(err.textContent).toContain("Enter a valid email");
    expect(host.textContent).not.toContain("We never share it");                  // the error replaces the hint
  });
});

describe("Modal", () => {
  function Demo() { const [open, setOpen] = useState(true); return <Modal open={open} onOpenChange={setOpen} title="Confirm" description="Are you sure?"><button>Yes</button></Modal>; }
  it("is a named dialog with a close button, closes on Escape, and takes focus inside", async () => {
    await render(<Demo />);
    const dlg = document.querySelector("[role=dialog]")!;
    expect(dlg).toBeTruthy(); expect(dlg.getAttribute("aria-labelledby")).toBeTruthy(); expect(document.querySelector("[aria-label=Close]")).toBeTruthy();
    expect(dlg.contains(document.activeElement)).toBe(true);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
});

describe("states", () => {
  it("empty, error and loading announce themselves properly", async () => {
    const retry = vi.fn();
    await render(<><EmptyState title="Nothing here">Add one to begin</EmptyState><ErrorState onRetry={retry}>Please try again</ErrorState><SkeletonList label="Loading payments" /></>);
    expect(host.textContent).toContain("Nothing here"); expect(host.querySelector("[role=alert]")!.textContent).toContain("Something went wrong");
    expect(host.querySelector("[role=status]")!.textContent).toContain("Loading payments");
    await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!.click(); }); expect(retry).toHaveBeenCalled();
  });
});

describe("site chrome", () => {
  it("AppLink has a real address, runs the app handler on a plain click, and leaves modified clicks to the browser", async () => {
    const go = vi.fn();
    await render(<AppLink href="/personal" onNavigate={go}>Personal</AppLink>);
    const a = host.querySelector("a")!; expect(a.getAttribute("href")).toBe("/personal");
    await act(async () => { a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); }); expect(go).toHaveBeenCalledTimes(1);
    await act(async () => { a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })); }); expect(go).toHaveBeenCalledTimes(1);
  });
  it("the launch notice keeps its full statement on large screens and a short one on phones", async () => {
    await render(<LaunchNotice />);
    expect(host.textContent).toContain("VINK is not yet in full operation. All information on this site is a preview."); expect(host.textContent).toContain("Full launch: June 2027."); expect(host.textContent).toContain("launch June 2027");
    expect(host.querySelector("[role=note]")).toBeTruthy();
  });
});
