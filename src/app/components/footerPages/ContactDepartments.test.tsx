// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ContactUsViewer } from "./ContactUsViewer";
import { DEPARTMENTS } from "../../data/departments";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });
const options = () => [...host.querySelectorAll("select option")].map((o) => o.textContent ?? "");
const render = async () => { await act(async () => { root.render(<ContactUsViewer isOpen onClose={() => {}} initialTab="feedback" />); }); await settle(); await settle(); };

describe("the departments on the Contact page", () => {
  it("start with the built-in ones, then show the list the server sends, including a department a Super Administrator made public", async () => {
    const hr = { key: "hr-team", name: "HR Team", address: "people@vink.co.za", purpose: "Staff questions", respondWithin: "2 days" };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(String(u).endsWith("/api/contact/departments") ? { success: true, departments: [...DEPARTMENTS, hr] } : { success: true }))));
    await render();
    expect(options()).toContain("HR Team — Staff questions"); expect(options()).toContain("Customer Support — Help with your wallet, card, account or the app");
  });

  it("keeps the built-in departments when the server cannot be reached or sends nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); })); await render();
    expect(options().filter((o) => o.includes(" — "))).toHaveLength(DEPARTMENTS.length); expect(options().some((o) => o.startsWith("Customer Support"))).toBe(true);
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, departments: [] })))); await render();
    expect(options().filter((o) => o.includes(" — "))).toHaveLength(DEPARTMENTS.length);
  });
});
