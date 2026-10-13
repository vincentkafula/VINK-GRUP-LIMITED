// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ProductDetailPage } from "./ProductDetailPage";
import { ManageMyBusinessViewer } from "./ManageMyBusinessViewer";
import { StartMyBusinessViewer } from "./StartMyBusinessViewer";
import { BusinessProductLedgerViewer } from "./BusinessProductLedgerViewer";
import { BusinessAccountSelectorViewer } from "./BusinessAccountSelectorViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true })))); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); };
const page = () => host.querySelector("[data-product-detail]") as HTMLElement | null;
const second = (i = 0) => host.querySelectorAll(".pav-cta-group .pav-btn:nth-child(2)")[i];

describe("the full-page product details", () => {
  it("fills the screen with the product's information, and goes back with the button and the Escape key", async () => {
    const back = vi.fn(), apply = vi.fn();
    await render(<ProductDetailPage detail={{ eyebrow: "Corporate Banking · Account", name: "Project Account", tagline: "A tagline", overview: "An overview.", price: { value: "R85", label: "per month" }, features: ["One", "Two"], idealFor: ["Agencies"], groups: [{ head: "Steps", items: ["First", "Second"], ordered: true }], note: "A note.", backLabel: "Back to all accounts" }} onBack={back} onApply={apply} />);
    const p = page()!; expect(p.className).toContain("fixed"); expect(p.className).toContain("inset-0"); expect(p.getAttribute("role")).toBe("dialog");
    for (const t of ["Project Account", "A tagline", "An overview.", "R85", "Key benefits", "Ideal for", "Steps", "A note."]) expect(p.textContent).toContain(t);
    await click([...p.querySelectorAll("button")].find((b) => b.textContent!.includes("Back to all accounts"))); expect(back).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); }); expect(back).toHaveBeenCalledTimes(2);
    await click([...p.querySelectorAll("button")].find((b) => b.textContent!.includes("Apply now"))); expect(apply).toHaveBeenCalledTimes(1);
  });
  it("opens from Tell me more on Manage My Business, as a page, and applying closes it and opens the application", async () => {
    await render(<ManageMyBusinessViewer isOpen onClose={() => {}} onNavigate={() => {}} />);
    await click(second(0)); expect(page()!.querySelector("h1")!.textContent).toBe("Quick Market Entry"); expect(page()!.textContent).toContain("Back to all management services");
    await click([...page()!.querySelectorAll("button")].find((b) => b.textContent!.includes("Apply now"))); expect(page()).toBeNull();
  });
  it("opens from Tell me more on Start My Business", async () => {
    await render(<StartMyBusinessViewer isOpen onClose={() => {}} onNavigate={() => {}} />);
    await click(second(0)); expect(page()!.querySelector("h1")!.textContent).toBe("Register your business in South Africa"); expect(page()!.textContent).toContain("R1,500");
    await click([...page()!.querySelectorAll("button")].find((b) => b.textContent!.includes("Back to all countries"))); expect(page()).toBeNull();
  });
  it("opens from See card details on the Business credit cards, and from See account details on the Business accounts", async () => {
    await render(<BusinessProductLedgerViewer isOpen onClose={() => {}} initialCategory="creditCard" onNavigate={() => {}} onApply={() => {}} />);
    await click(second(0)); expect(page()!.querySelector("h1")!.textContent).toBe("VentureLine"); expect(page()!.textContent).toContain("Key features");
    act(() => root.unmount()); root = createRoot(host);
    await render(<BusinessAccountSelectorViewer isOpen onClose={() => {}} onNavigate={() => {}} onApply={() => {}} onOpenApp={() => {}} />);
    await click(second(0)); expect(page()!.querySelector("h1")!.textContent).toBe("Launch Business Account"); expect(page()!.textContent).toContain("Perfect for");
  });
});
