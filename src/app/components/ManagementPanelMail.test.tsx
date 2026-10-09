// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

let sections: string[] = [];
vi.mock("../services/apiClient", async (orig) => {
  const real = await orig<typeof import("../services/apiClient")>();
  return {
    ...real,
    getToken: () => "test-token",
    rbacApi: { ...real.rbacApi, mySections: async () => ({ success: true, data: sections }), applications: async () => ({ success: true, data: [] }), sections: async () => ({ success: true, data: [] }) },
  };
});
vi.mock("./portal/MailPanel", () => ({ MailPanel: () => <div>MAIL PANEL</div> }));

import { ManagementPanelViewer } from "./ManagementPanelViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const open = async (role: string) => { await act(async () => { root.render(<ManagementPanelViewer isOpen onClose={() => {}} role={role} />); }); await settle(); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

describe("Management Panel: department mail", () => {
  it("is there for a superadmin and for an owner", async () => {
    for (const role of ["superadmin", "owner"]) {
      act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
      await open(role);
      expect(btn("Department mail")).toBeTruthy();
      await act(async () => { btn("Department mail")!.click(); }); await settle();
      expect(host.textContent).toContain("MAIL PANEL");
    }
  });

  it("is there for a manager approved for a department, and not for one approved only for another module", async () => {
    sections = ["Sales"]; await open("customer");
    expect(btn("Department mail")).toBeTruthy();
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    sections = ["Bank Management"]; await open("customer");
    expect(btn("Department mail")).toBeUndefined();
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    sections = []; await open("customer");
    expect(btn("Department mail")).toBeUndefined();
  });

  it("offers every department as a section to apply for", async () => {
    sections = []; await open("customer");
    await act(async () => { btn("Apply for a Section")!.click(); }); await settle();
    const options = [...document.querySelectorAll("select option")].map((o) => o.textContent);
    for (const name of ["Sales", "Customer Support", "Compliance", "Careers", "Media Relations"]) expect(options.some((o) => o?.startsWith(name))).toBe(true);
    expect(options).toContain("Bank Management");
  });
});
