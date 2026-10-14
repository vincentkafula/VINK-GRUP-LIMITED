// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LoginModal } from "./LoginModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const type = (id: string, value: string) => {
  const el = host.querySelector("#" + id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sign-in with a second factor", () => {
  it("asks for the authenticator code when the server says it is needed, then sends it with the password", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body ?? "{}")); bodies.push(b);
      return b.code ? json(200, { success: true, token: "t", expiresIn: 900, user: { id: "1", username: "sam", role: "customer", name: "Sam", email: "s@x.test" } })
        : json(401, { success: false, error: "Enter the 6-digit code from your authenticator app.", code: "mfa_required" });
    }));
    await act(async () => { root.render(<LoginModal isOpen onClose={() => {}} />); });
    expect(host.querySelector("#vink-mfa-code")).toBeNull();
    await act(async () => { type("vink-username", "sam"); type("vink-password", "correct-horse-battery"); });
    await act(async () => { (host.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("#vink-mfa-code")).not.toBeNull();
    expect(host.textContent).toContain("6-digit code");
    expect(host.textContent).not.toContain("couldn't sign you in");
    await act(async () => { type("vink-mfa-code", "123456"); });
    await act(async () => { (host.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(bodies[0]).toEqual({ username: "sam", password: "correct-horse-battery" });
    expect(bodies[1]).toEqual({ username: "sam", password: "correct-horse-battery", code: "123456" });
  });
});
