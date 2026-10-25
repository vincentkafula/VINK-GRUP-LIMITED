// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { useReveal } from "./useReveal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function Probe({ delay }: { delay?: number }) { const r = useReveal(delay); return <div data-testid="p" ref={r.ref} style={r.style} className={r.className}>hello</div>; }
const el = () => host.querySelector("[data-testid=p]") as HTMLElement;

const rect = (top: number) => ({ top, bottom: top + 100, left: 0, right: 10, width: 10, height: 100, x: 0, y: top, toJSON() {} }) as DOMRect;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });   // lets the animation frame that checks positions run

describe("useReveal: content eases in as it scrolls into view, and is never left hidden", () => {
  it("shows content that is on screen at load straight away", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false })); vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(200));
    act(() => root.render(<Probe />)); expect(el().className).toBe("vkp-reveal is-in");
  });
  it("shows the content at once with a reduced-motion setting, even below the fold", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(5000));
    act(() => root.render(<Probe />)); expect(el().className).toContain("is-in");
  });
  it("holds content below the fold back, with its stagger delay, until it is scrolled to", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false })); const r = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(5000));
    act(() => root.render(<Probe delay={120} />));
    expect(el().className).toBe("vkp-reveal"); expect(el().style.transitionDelay).toBe("120ms");
    await act(async () => { window.dispatchEvent(new Event("scroll")); }); await settle(); expect(el().className).toBe("vkp-reveal");   // scrolled, but not far enough
    r.mockReturnValue(rect(300)); await act(async () => { window.dispatchEvent(new Event("scroll")); }); await settle();
    expect(el().className).toBe("vkp-reveal is-in");
  });
  it("reveals content that was scrolled PAST (the End key, a link to the footer, dragging the scrollbar), so it is never left hidden", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false })); const r = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(5000));
    act(() => root.render(<Probe />)); expect(el().className).toBe("vkp-reveal");
    r.mockReturnValue(rect(-4000)); await act(async () => { window.dispatchEvent(new Event("scroll")); }); await settle();
    expect(el().className).toBe("vkp-reveal is-in");
  });
  it("stops listening for scrolls once nothing is waiting", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false })); const r = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(5000));
    const remove = vi.spyOn(window, "removeEventListener");
    act(() => root.render(<Probe />)); r.mockReturnValue(rect(100)); await act(async () => { window.dispatchEvent(new Event("scroll")); }); await settle();
    expect(remove.mock.calls.some((c) => c[0] === "scroll")).toBe(true);
  });
});

describe("the polish styles", () => {
  const css = readFileSync(join(__dirname, "../../styles/premium.css"), "utf8");
  const polish = css.slice(css.indexOf("/* ── Polish"));
  it("switch every animation off, and show everything, for a reduced-motion setting", () => {
    const reduced = polish.slice(polish.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const rule of [".vkp-mesh i", ".vkp-ivory .vkp-gradient-text", ".vkp-reveal", ".vkp-cta::after"]) expect(reduced, rule).toContain(rule);
    expect(reduced).toMatch(/\.vkp-reveal \{ opacity: 1; transform: none/);
  });
  it("balance headings, avoid lone last words and tabulate figures", () => {
    expect(polish).toContain("text-wrap: balance"); expect(polish).toContain("text-wrap: pretty"); expect(polish).toContain("font-variant-numeric: tabular-nums");
  });
  it("only ever move things with transform and opacity (nothing that shifts the layout)", () => {
    const motion = polish.slice(polish.indexOf(".vkp-reveal {"), polish.indexOf(".vkp-cta {"));
    expect(motion).not.toMatch(/\b(top|left|right|bottom|margin|width|height)\s*:\s*[^;]*;[^}]*transition/);
    expect(motion).toContain("opacity"); expect(motion).toContain("translate3d");
  });
});
