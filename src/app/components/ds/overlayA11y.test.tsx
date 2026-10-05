// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { useOverlayA11y, enhanceOverlays } from "./overlayA11y";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  // jsdom has no layout: treat everything as visible, and run animation frames at once
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function App() {
  useOverlayA11y();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button id="opener" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div className="fixed inset-0 z-50">
          <h1>Personal account</h1>
          <button aria-label="Close" onClick={() => setOpen(false)}>x</button>
          <input aria-label="Name" />
        </div>
      )}
    </div>
  );
}

describe("overlay accessibility", () => {
  it("gives a hand-built full-screen overlay a dialog role and a name from its heading, and leaves self-managed layers alone", async () => {
    document.body.insertAdjacentHTML("beforeend", '<div class="fixed inset-0" data-state="open"><button>ok</button></div><div class="fixed inset-0" role="alertdialog"><button>ok</button></div><div id="o" class="fixed inset-0"><h2>Contact us</h2><button>Send</button></div>');
    const done = enhanceOverlays();
    expect(done.map((e) => e.id)).toEqual(["o"]);
    const o = document.getElementById("o")!;
    expect(o.getAttribute("role")).toBe("dialog"); expect(o.getAttribute("aria-modal")).toBe("true"); expect(o.getAttribute("aria-label")).toBe("Contact us");
    expect(document.querySelector("[data-state=open]")!.hasAttribute("role")).toBe(false);
    document.querySelectorAll(".fixed").forEach((e) => e.remove());
  });

  it("moves focus in on open, closes on Escape through the page's own close button, and returns focus", async () => {
    await act(async () => { root.render(<App />); });
    const opener = host.querySelector<HTMLButtonElement>("#opener")!; opener.focus();
    await act(async () => { opener.click(); }); await tick();
    const dlg = host.querySelector("[role=dialog]") as HTMLElement;
    expect(dlg).toBeTruthy(); expect(dlg.getAttribute("aria-label")).toBe("Personal account"); expect(document.activeElement).toBe(dlg);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    expect(host.querySelector("[role=dialog]")).toBeNull(); expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside the overlay", async () => {
    await act(async () => { root.render(<App />); });
    await act(async () => { host.querySelector<HTMLButtonElement>("#opener")!.click(); }); await tick();
    const dlg = host.querySelector("[role=dialog]") as HTMLElement, input = dlg.querySelector("input")!;
    input.focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => { document.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true); expect(document.activeElement).toBe(dlg.querySelector("button"));          // last -> first
  });
});
