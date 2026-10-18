import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../../services/apiClient", () => ({ authFetch: h.authFetch, authApi: { mfaDisable: vi.fn(), mfaSetup: vi.fn(), mfaEnable: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TwoFactorPanel } from "./TwoFactorPanel";
import { authApi } from "../../services/apiClient";
import { mfaEnrolRequired, setMfaEnrolRequired } from "../../services/mfaFlag";

type Reply = { status?: number; body: Record<string, unknown> };
let routes: Record<string, Reply | ((body: unknown) => Reply)>;
const json = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
const calls = () => h.authFetch.mock.calls.map((c) => [String(c[0]).replace(/^.*\/api\/auth/, ""), c[1]?.method, c[1]?.body ? JSON.parse(String(c[1].body)) : undefined]);
const me = (mfaEnabled: boolean): Reply => ({ body: { success: true, data: { mfaEnabled } } });

beforeEach(() => {
  sessionStorage.clear(); h.authFetch.mockReset(); vi.mocked(authApi.mfaDisable).mockClear();
  routes = { "GET /me": me(false) };
  h.authFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api\/auth/, "")}`; const r = routes[key]; if (!r) throw new Error("unexpected call " + key);
    return json(typeof r === "function" ? r(init?.body ? JSON.parse(String(init.body)) : undefined) : r);
  });
});
afterEach(() => cleanup());

describe("two-factor sign-in: switching it on", () => {
  it("starts off, and shows the key to type into an authenticator app (grouped, with a link for phones)", async () => {
    routes["POST /mfa/setup"] = { body: { success: true, secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/VINK:amy?secret=JBSWY3DPEHPK3PXP&issuer=VINK" } };
    render(<TwoFactorPanel />);
    expect(await screen.findByText("Two-factor sign-in is off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set up two-factor sign-in" }));
    expect((await screen.findByLabelText("Setup key")).textContent).toBe("JBSW Y3DP EHPK 3PXP");
    expect(screen.getByRole("link", { name: /open it in your authenticator app/ }).getAttribute("href")).toBe("otpauth://totp/VINK:amy?secret=JBSWY3DPEHPK3PXP&issuer=VINK");
    expect(screen.getByText(/Anyone who has it can make your codes/)).toBeTruthy();
  });
  it("says what is wrong when the code is not right, and keeps the set-up open", async () => {
    routes["POST /mfa/setup"] = { body: { success: true, secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://x" } };
    routes["POST /mfa/enable"] = { status: 400, body: { success: false, error: "That code is not correct. Check the time on your phone and try again.", code: "mfa_invalid" } };
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: "Set up two-factor sign-in" })); await screen.findByLabelText("Setup key");
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value: "123456" } }); fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Check the time on your phone/); expect(screen.getByLabelText("Setup key")).toBeTruthy();
  });
  it("shows the recovery codes once, only lets a person move on after they confirm they saved them, and then reports it on", async () => {
    setMfaEnrolRequired(true); const onChange = vi.fn();
    routes["POST /mfa/setup"] = { body: { success: true, secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://x" } };
    routes["POST /mfa/enable"] = (b) => ({ body: { success: true, recoveryCodes: ["a1b2-c3d4", "e5f6-g7h8", "i9j0-k1l2", "m3n4-o5p6"], echoed: b } });
    render(<TwoFactorPanel required onChange={onChange} />);
    expect(await screen.findByText(/Your account must use two-factor sign-in/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set up two-factor sign-in" })); await screen.findByLabelText("Setup key");
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value: "123 456" } }); fireEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    const list = await screen.findByRole("list", { name: "Your recovery codes" });
    expect(list.textContent).toContain("a1b2-c3d4"); expect(screen.getByText(/shown only this once/)).toBeTruthy();
    expect(calls().find((c) => c[0] === "/mfa/enable")![2]).toEqual({ code: "123 456" });
    expect(onChange).toHaveBeenCalledWith(true); expect(mfaEnrolRequired()).toBe(false);                                // the platform's "you must set this up" prompt is cleared
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement; expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I have saved these codes/)); expect(done.disabled).toBe(false); fireEvent.click(done);
    expect(screen.queryByRole("list", { name: "Your recovery codes" })).toBeNull(); expect(screen.getByText("When you sign in you will be asked for the code from your authenticator app, or for one of your recovery codes.")).toBeTruthy();
  });
  it("copies the codes, and offers them as a file to keep", async () => {
    const write = vi.fn(async () => undefined); Object.assign(navigator, { clipboard: { writeText: write } }); (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:x"); (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    routes["POST /mfa/setup"] = { body: { success: true, secret: "JBSWY3DPEHPK3PXP", otpauthUri: "x" } }; routes["POST /mfa/enable"] = { body: { success: true, recoveryCodes: ["a1b2-c3d4", "e5f6-g7h8"] } };
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: "Set up two-factor sign-in" })); await screen.findByLabelText("Setup key");
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value: "123456" } }); fireEvent.click(screen.getByRole("button", { name: "Turn it on" })); await screen.findByRole("list", { name: "Your recovery codes" });
    fireEvent.click(screen.getByRole("button", { name: /Copy all/ })); await waitFor(() => expect(write).toHaveBeenCalledWith("a1b2-c3d4\ne5f6-g7h8"));
    fireEvent.click(screen.getByRole("button", { name: /Download as a file/ })); expect(URL.createObjectURL).toHaveBeenCalled();
  });
  it("explains when the server cannot do it yet (no encryption key), instead of a bare error", async () => {
    routes["POST /mfa/setup"] = { status: 503, body: { success: false, error: "Two-factor sign-in is not available until DATA_ENCRYPTION_KEY is configured.", code: "mfa_unavailable" } };
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: "Set up two-factor sign-in" }));
    expect((await screen.findByText(/no encryption key set \(DATA_ENCRYPTION_KEY\)/))).toBeTruthy();
  });
});

describe("two-factor sign-in: when it is on, and turning it off", () => {
  beforeEach(() => { routes["GET /me"] = me(true); });
  it("shows that it is on, and does not show the prompt that it is required", async () => {
    render(<TwoFactorPanel required />); expect(await screen.findByText("Two-factor sign-in is on")).toBeTruthy(); expect(screen.queryByText(/must use two-factor/)).toBeNull();
  });
  it("needs the password and a code to turn it off, and sends both", async () => {
    routes["POST /mfa/disable"] = { body: { success: true, message: "Two-factor sign-in is off." } }; const onChange = vi.fn();
    render(<TwoFactorPanel onChange={onChange} />); fireEvent.click(await screen.findByRole("button", { name: /Turn it off/ }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "hunter2!" } }); fireEvent.change(screen.getByLabelText("Code to turn it off"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor sign-in" }));
    expect(await screen.findByText("Two-factor sign-in is off")).toBeTruthy(); expect(calls().find((c) => c[0] === "/mfa/disable")![2]).toEqual({ password: "hunter2!", code: "123456" }); expect(onChange).toHaveBeenCalledWith(false);
  });
  it("does NOT sign the person out when the password is wrong (the server answers 401, which the API client would treat as an expired session)", async () => {
    const expired = vi.fn(); window.addEventListener("vink:session-expired", expired);
    routes["POST /mfa/disable"] = { status: 401, body: { success: false, error: "Current password is incorrect" } };
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: /Turn it off/ }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } }); fireEvent.change(screen.getByLabelText("Code to turn it off"), { target: { value: "123456" } }); fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor sign-in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Current password is incorrect");
    expect(expired).not.toHaveBeenCalled(); expect(authApi.mfaDisable).not.toHaveBeenCalled(); expect(screen.getByLabelText("Current password")).toBeTruthy();   // still signed in, still on, can try again
    window.removeEventListener("vink:session-expired", expired);
  });
  it("tells a staff member that the platform requires it to stay on", async () => {
    routes["POST /mfa/disable"] = { status: 403, body: { success: false, error: "Staff accounts must keep two-factor sign-in on.", code: "mfa_required_for_staff" } };
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: /Turn it off/ }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "x" } }); fireEvent.change(screen.getByLabelText("Code to turn it off"), { target: { value: "123456" } }); fireEvent.click(screen.getByRole("button", { name: "Turn off two-factor sign-in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/must keep two-factor sign-in on.*rule set for the whole platform/);
  });
  it("lets a person change their mind", async () => {
    render(<TwoFactorPanel />); fireEvent.click(await screen.findByRole("button", { name: /Turn it off/ })); fireEvent.click(screen.getByRole("button", { name: "Keep it on" }));
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });
});

describe("when the server cannot be reached", () => {
  it("says so instead of showing the wrong state", async () => {
    h.authFetch.mockImplementation(async () => { throw new TypeError("offline"); });
    render(<TwoFactorPanel />); expect((await screen.findByRole("alert")).textContent).toMatch(/could not reach the server/);
    expect(screen.queryByText("Two-factor sign-in is off")).toBeNull();
  });
});
