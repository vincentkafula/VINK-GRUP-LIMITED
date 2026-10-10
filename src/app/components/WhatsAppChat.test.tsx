// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WhatsAppButton, WhatsAppCard, resetWhatsAppInfo } from "./WhatsAppChat";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
const answer = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const on = { success: true, enabled: true, number: "27821234567", link: "https://wa.me/27821234567?text=Hi%20VINK" };
beforeEach(() => { resetWhatsAppInfo(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };

describe("chat on WhatsApp for the public", () => {
  it("shows a button that opens the chat, once the server says chat is on", async () => {
    answer(on); await render(<WhatsAppButton />);
    const a = host.querySelector("a")!; expect(a.getAttribute("aria-label")).toBe("Chat with VINK on WhatsApp"); expect(a.href).toBe(on.link); expect(a.target).toBe("_blank"); expect(a.rel).toContain("noopener");
  });
  it("shows nothing when chat is not on, when the server fails, or when the page asks for it to be hidden", async () => {
    answer({ success: true, enabled: false, number: null, link: null }); await render(<WhatsAppButton />); expect(host.querySelector("a")).toBeNull();
    resetWhatsAppInfo(); answer({}, 500); await render(<WhatsAppButton />); expect(host.querySelector("a")).toBeNull();
    resetWhatsAppInfo(); answer(on); await render(<WhatsAppButton hidden />); expect(host.querySelector("a")).toBeNull();
  });
  it("shows the QR code card with the button, and only asks the server once for both", async () => {
    answer(on); await render(<><WhatsAppButton /><WhatsAppCard /></>);
    expect(host.querySelector("img")!.getAttribute("src")).toMatch(/\/api\/whatsapp\/qr\.png$/); expect(host.querySelector("img")!.alt).toContain("scan it"); expect(host.querySelectorAll("a")).toHaveLength(2);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1); expect(host.textContent).toContain("Monday to Friday");
  });
});
