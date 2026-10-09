// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ZoomImage } from "./ZoomImage";
import { CreditCardsSection } from "./CreditCardsSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** A pointer event with the fields React reads. jsdom has no PointerEvent, so a plain Event carries them. */
function pointer(el: Element, type: string, o: { pointerType: string; clientX?: number; clientY?: number }) {
  // React derives onPointerEnter/Leave from pointerover/pointerout, which is what a browser fires too
  const native = type === "pointerenter" ? "pointerover" : type === "pointerleave" ? "pointerout" : type;
  const e = new Event(native, { bubbles: true });
  Object.assign(e, { relatedTarget: null });
  Object.assign(e, { pointerType: o.pointerType, clientX: o.clientX ?? 0, clientY: o.clientY ?? 0 });
  act(() => { el.dispatchEvent(e); });
}
const frame = () => host.querySelector("[data-zoom]") as HTMLElement;
const img = () => host.querySelector("img") as HTMLImageElement;
const mount = (el: React.ReactElement) => act(() => { root.render(el); });
const sized = (w: number, h: number) => { frame().getBoundingClientRect = () => ({ left: 100, top: 50, width: w, height: h, right: 100 + w, bottom: 50 + h, x: 100, y: 50, toJSON() {} }) as DOMRect; };

describe("ZoomImage", () => {
  it("zooms in on the spot under the mouse, follows it, and returns to normal when the mouse leaves", () => {
    mount(<ZoomImage src="/card.webp" alt="A card" zoom={2} className="w-full h-full" />);
    expect(img().style.transform).toBe("scale(1)"); expect(frame().dataset.zoom).toBe("off");
    sized(200, 100);
    pointer(frame(), "pointerenter", { pointerType: "mouse", clientX: 200, clientY: 100 });          // the middle of the image
    expect(frame().dataset.zoom).toBe("on"); expect(img().style.transform).toBe("scale(2)"); expect(img().style.transformOrigin).toBe("50% 50%");
    pointer(frame(), "pointermove", { pointerType: "mouse", clientX: 100, clientY: 50 });            // the top-left corner
    expect(img().style.transformOrigin).toBe("0% 0%");
    pointer(frame(), "pointermove", { pointerType: "mouse", clientX: 900, clientY: 900 });           // far outside: stays inside the image
    expect(img().style.transformOrigin).toBe("100% 100%");
    pointer(frame(), "pointerleave", { pointerType: "mouse" });
    expect(frame().dataset.zoom).toBe("off"); expect(img().style.transform).toBe("scale(1)");
  });

  it("never zooms for a finger, and a pen zooms like a mouse", () => {
    mount(<ZoomImage src="/card.webp" alt="A card" />); sized(200, 100);
    pointer(frame(), "pointerenter", { pointerType: "touch", clientX: 150, clientY: 80 });
    pointer(frame(), "pointermove", { pointerType: "touch", clientX: 150, clientY: 80 });
    expect(frame().dataset.zoom).toBe("off");
    pointer(frame(), "pointerenter", { pointerType: "pen", clientX: 150, clientY: 80 });
    expect(frame().dataset.zoom).toBe("on");
  });

  it("keeps the picture's text alternative and does not make the image draggable", () => {
    mount(<ZoomImage src="/card.webp" alt="VINK Driver Card — physical card design" />);
    expect(img().alt).toBe("VINK Driver Card — physical card design"); expect(img().draggable).toBe(false);
  });
});

describe("the cards section", () => {
  it("tells people to roll over the image to zoom in, and zooms each Visa and Mastercard picture", () => {
    mount(<CreditCardsSection />);
    expect(host.textContent).toContain("Roll over image to zoom in");
    const cards = [...host.querySelectorAll("button[aria-label^='View the']")];
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["View the VINK Commuter Card", "View the VINK Driver Card", "View the VINK Gold", "View the VINK Business Card"]);
    expect(host.textContent).toContain("Mastercard Standard"); expect(host.textContent).toContain("Visa Premium"); expect(host.textContent).toContain("Mastercard World");
    for (const c of cards) expect(c.querySelector("[data-zoom]")).not.toBeNull();                       // every card picture can zoom
    const first = cards[0].querySelector("[data-zoom]") as HTMLElement;
    first.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 160, right: 260, bottom: 160, x: 0, y: 0, toJSON() {} }) as DOMRect;
    pointer(first, "pointerenter", { pointerType: "mouse", clientX: 130, clientY: 80 });
    expect((first.querySelector("img") as HTMLImageElement).style.transform).toBe("scale(2)");
  });
});
