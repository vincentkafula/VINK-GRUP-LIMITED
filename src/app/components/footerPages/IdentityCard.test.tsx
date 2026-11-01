import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
vi.mock("../../services/apiClient", () => ({ getToken: vi.fn(() => null) }));
import { getToken } from "../../services/apiClient";
import { IdentityCard, type IdentityView } from "./IdentityCard";

const view = (over: Partial<IdentityView> = {}): IdentityView => ({ enabled: true, status: "not_started", canStart: true, consentRequired: true, message: "Confirm who you are. It takes about five minutes.", attempts: 0, ...over });
const SUPPORT = "sponsorships@vink.co.za";
const tokenReply = (token = "_act-1") => vi.fn(async () => new Response(JSON.stringify({ success: true, data: { token, expiresInSecs: 900, status: "in_progress" } }), { status: 200 })) as unknown as typeof fetch;
const failReply = (status: number, error: string) => vi.fn(async () => new Response(JSON.stringify({ success: false, error }), { status })) as unknown as typeof fetch;

/** A stand-in for Sumsub's widget script: records how the page set it up. */
type Handler = (p?: unknown) => void;
const fakeSdk = () => {
  const seen: { token?: string; refresh?: () => Promise<string>; conf?: unknown; options?: unknown; handlers: Record<string, Handler>; launched?: string; inits: number } = { handlers: {}, inits: 0 };
  const builder: Record<string, unknown> = {};
  builder.withConf = (c: unknown) => { seen.conf = c; return builder; }; builder.withOptions = (o: unknown) => { seen.options = o; return builder; };
  builder.on = (e: string, cb: Handler) => { seen.handlers[e] = cb; return builder; }; builder.build = () => ({ launch: (s: string) => { seen.launched = s; } });
  window.snsWebSdk = { init: (token: string, refresh: () => Promise<string>) => { seen.token = token; seen.refresh = refresh; seen.inits++; return builder as never; } };
  return seen;
};
const mount = (props: Partial<Parameters<typeof IdentityCard>[0]> = {}) => render(<IdentityCard identity={view()} kind="application" refNo="VNK-PA-ABC123456" email="thandi@example.com" supportEmail={SUPPORT} onChanged={vi.fn()} {...props} />);
const tick = () => fireEvent.click(screen.getByRole("checkbox"));
const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => { delete window.snsWebSdk; vi.mocked(getToken).mockReturnValue(null); });
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.snsWebSdk; document.head.querySelectorAll("script[src*=sumsub]").forEach((s) => s.remove()); });

describe("the identity card: what the applicant sees", () => {
  it("shows nothing when identity checks are not switched on", () => {
    mount({ identity: view({ enabled: false }) }); expect(document.body.textContent).toBe("");
  });
  it.each([
    ["not_started", "Not done yet", "plain", "Confirm my identity"], ["in_progress", "Started", "plain", "Carry on"], ["retry", "Please try again", "warn", "Try again"],
  ] as const)("offers the %s stage with its label, colour and button", (status, label, tone, button) => {
    mount({ identity: view({ status, message: `msg for ${status}` }) });
    expect(screen.getByRole("heading", { name: "Confirm your identity" })).toBeTruthy(); expect(screen.getByText(`msg for ${status}`)).toBeTruthy();
    const badge = document.querySelector(".sf-status")!; expect(badge.textContent).toBe(label); expect(badge.className).toContain(`sf-status--${tone}`); expect(screen.getByRole("button", { name: button })).toBeTruthy();
  });
  it.each([["pending", "Being checked", "plain"], ["on_hold", "Taking a little longer", "warn"], ["approved", "Confirmed", "ok"], ["rejected", "Could not be confirmed", "bad"]] as const)(
    "shows %s as a status only: there is nothing left for the applicant to start", (status, label, tone) => {
      mount({ identity: view({ status, canStart: false, message: `msg for ${status}` }) });
      expect(document.querySelector(".sf-status")!.textContent).toBe(label); expect(document.querySelector(".sf-status")!.className).toContain(`sf-status--${tone}`);
      expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.getByRole("status").textContent).toBe(`msg for ${status}`);
    });
});

describe("starting the check", () => {
  it("needs the box ticked first, and asks the server for nothing until it is", async () => {
    const f = tokenReply(); globalThis.fetch = f; mount();
    press(/Confirm my identity/); expect(screen.getByRole("alert").textContent).toMatch(/tick the box to agree/); expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox").getAttribute("aria-describedby")).toBe("id-err");
  });
  it("names Sumsub and says who keeps the documents, next to the box", () => {
    mount(); const text = screen.getByRole("checkbox").closest("label")!.textContent!;
    expect(text).toContain("Sumsub"); expect(text).toMatch(/Sumsub holds these documents\. VINK keeps the result of the check, together with the information I gave in my application\./);
  });
  it("sends the reference, the email and the agreement to the right place, then opens Sumsub's widget with the token it was given", async () => {
    const f = tokenReply("_act-777"); globalThis.fetch = f; const sdk = fakeSdk(); mount(); tick(); press(/Confirm my identity/);
    await waitFor(() => expect(sdk.launched).toBe("#sumsub-websdk-container-person"));
    const [url, init] = vi.mocked(f).mock.calls[0]; expect(String(url)).toMatch(/\/api\/identity\/token$/); expect(init?.method).toBe("POST"); expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toEqual({ kind: "application", ref: "VNK-PA-ABC123456", email: "thandi@example.com", consent: true });
    expect(sdk.token).toBe("_act-777"); expect(sdk.conf).toEqual({ lang: "en" }); expect(sdk.options).toMatchObject({ addViewportTag: false, adaptIframeHeight: true });
    expect(document.getElementById("sumsub-websdk-container-person")).toBeTruthy(); expect(screen.queryByRole("button", { name: /Confirm my identity/ })).toBeNull();      // the intro gives way to the widget
    expect(screen.getByRole("link", { name: SUPPORT }).getAttribute("href")).toBe(`mailto:${SUPPORT}`);
  });
  it("says the check has started, and what to do, as soon as the widget is open (before the page has heard back from the server)", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); mount(); expect(document.querySelector(".sf-status")!.textContent).toBe("Not done yet");
    tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    expect(document.querySelector(".sf-status")!.textContent).toBe("Started"); expect(screen.getByRole("status").textContent).toMatch(/^Follow the steps below/);
  });
  it("takes the widget away once the answer is final (confirmed or not), leaving just the outcome", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); const { rerender } = mount(); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    expect(document.getElementById("sumsub-websdk-container-person")).toBeTruthy();
    for (const status of ["approved", "rejected"] as const) {
      rerender(<IdentityCard identity={view({ status, canStart: false, message: `outcome ${status}` })} kind="application" refNo="VNK-PA-ABC123456" email="thandi@example.com" supportEmail={SUPPORT} onChanged={vi.fn()} />);
      expect(document.getElementById("sumsub-websdk-container-person")).toBeNull(); expect(screen.queryByText(/Trouble with the camera/)).toBeNull(); expect(screen.getByRole("status").textContent).toBe(`outcome ${status}`);
    }
  });
  it("goes back to what the server says once it says something more (being checked, confirmed)", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); const { rerender } = mount(); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    rerender(<IdentityCard identity={view({ status: "pending", canStart: false, message: "Thank you. We have your documents." })} kind="application" refNo="VNK-PA-ABC123456" email="thandi@example.com" supportEmail={SUPPORT} onChanged={vi.fn()} />);
    expect(document.querySelector(".sf-status")!.textContent).toBe("Being checked"); expect(screen.getByRole("status").textContent).toBe("Thank you. We have your documents.");
  });
  it("sends the kind of application it is for, so one card serves accounts, cards, loans and sponsorships", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); mount({ kind: "sponsorship", refNo: "SP-ABC234" }); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body))).toMatchObject({ kind: "sponsorship", ref: "SP-ABC234" });
  });
  it("for a signed-in customer, sends their login and no email address (the login proves the application is theirs)", async () => {
    vi.mocked(getToken).mockReturnValue("jwt-abc"); const f = tokenReply(); globalThis.fetch = f; const sdk = fakeSdk(); mount({ email: undefined }); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    const init = vi.mocked(f).mock.calls[0][1]!; expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc"); expect(JSON.parse(String(init.body))).toEqual({ kind: "application", ref: "VNK-PA-ABC123456", consent: true });
  });
  it("says that the application cannot be approved without it, when the identity is required, and not once it is settled", () => {
    mount({ identity: view({ required: true }) }); expect(screen.getByText(/cannot approve your application until your identity is confirmed/)).toBeTruthy(); cleanup();
    mount({ identity: view({ required: false }) }); expect(screen.queryByText(/cannot approve your application/)).toBeNull(); cleanup();
    mount({ identity: view({ required: true, status: "approved", canStart: false }) }); expect(screen.queryByText(/cannot approve your application/)).toBeNull();
  });
  it("does not ask again for what they already agreed to, and still sends the agreement the server needs", async () => {
    const f = tokenReply(); globalThis.fetch = f; const sdk = fakeSdk(); mount({ identity: view({ status: "in_progress", consentRequired: false }) });
    expect(screen.queryByRole("checkbox")).toBeNull(); press(/Carry on/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    expect(JSON.parse(String(vi.mocked(f).mock.calls[0][1]?.body))).toMatchObject({ consent: true });
  });
  it("gives the widget a way to get a fresh token when its first one runs out, and passes on a refusal", async () => {
    const f = tokenReply("_act-1"); globalThis.fetch = f; const sdk = fakeSdk(); mount(); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.refresh).toBeTruthy());
    globalThis.fetch = tokenReply("_act-2"); await expect(sdk.refresh!()).resolves.toBe("_act-2");
    globalThis.fetch = failReply(409, "Already being checked"); await expect(sdk.refresh!()).rejects.toThrow("Already being checked");
  });
  it("shows the server's own words when it will not start (not found, already confirmed, closed), and leaves them able to try again", async () => {
    globalThis.fetch = failReply(409, "This application is closed, so there is nothing to confirm."); fakeSdk(); mount(); tick(); press(/Confirm my identity/);
    expect((await screen.findByRole("alert")).textContent).toContain("This application is closed"); expect(screen.getByRole("button", { name: /Confirm my identity/ })).toBeTruthy(); expect(document.getElementById("sumsub-websdk-container-person")).toBeNull();
  });
  it("tells them plainly when the connection fails, with the address to write to", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch; fakeSdk(); mount(); tick(); press(/Confirm my identity/);
    expect((await screen.findByRole("alert")).textContent).toMatch(new RegExp(`check your connection.*${SUPPORT.replace(".", "\\.")}`));
  });
  it("loads Sumsub's widget script once from Sumsub, and says so plainly when it cannot be loaded, then works on a second try", async () => {
    globalThis.fetch = tokenReply(); mount(); tick(); press(/Confirm my identity/);
    const script = await waitFor(() => { const s = document.head.querySelector("script[src*=sumsub]"); expect(s).toBeTruthy(); return s as HTMLScriptElement; });
    expect(script.src).toBe("https://static.sumsub.com/idensic/static/sns-websdk-builder.js");
    await act(async () => { script.dispatchEvent(new Event("error")); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not load the identity checker/); expect(document.head.querySelector("script[src*=sumsub]")).toBeNull();   // the failed one is removed
    const sdk = fakeSdk(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
  });
  it("shows a message, and goes back to the start, when the widget itself cannot open or reports an error", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); mount(); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    act(() => sdk.handlers["idCheck.onError"]()); expect((await screen.findByRole("alert")).textContent).toMatch(/Something went wrong in the identity checker/);
    cleanup(); delete window.snsWebSdk; const sdk2 = fakeSdk(); window.snsWebSdk!.init = () => { throw new Error("boom"); }; void sdk2;
    mount(); tick(); press(/Confirm my identity/); expect((await screen.findByRole("alert")).textContent).toMatch(/could not open the identity checker/); expect(screen.getByRole("button", { name: /Confirm my identity/ })).toBeTruthy();
  });
});

describe("after the applicant finishes in the widget", () => {
  it("tells the page to look again straight away, and again a few more times as Sumsub's answer arrives", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); const onChanged = vi.fn(); mount({ onChanged }); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    vi.useFakeTimers(); act(() => sdk.handlers["idCheck.onApplicantSubmitted"]()); expect(onChanged).toHaveBeenCalledTimes(1);
    for (const [ms, total] of [[4_000, 2], [8_000, 3], [18_000, 4], [30_000, 5]] as const) { act(() => { vi.advanceTimersByTime(ms); }); expect(onChanged).toHaveBeenCalledTimes(total); }
    act(() => { vi.advanceTimersByTime(120_000); }); expect(onChanged).toHaveBeenCalledTimes(5);                      // and then it stops
  });
  it("also looks again when the widget reports a change of status", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); const onChanged = vi.fn(); mount({ onChanged }); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    act(() => sdk.handlers["idCheck.onApplicantStatusChanged"]()); expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it("stops looking when the page is left", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); const onChanged = vi.fn(); const { unmount } = mount({ onChanged }); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBeTruthy());
    vi.useFakeTimers(); act(() => sdk.handlers["idCheck.onApplicantSubmitted"]()); unmount(); act(() => { vi.advanceTimersByTime(120_000); }); expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("says it is verifying the BUSINESS when it is the company check: its heading, consent, button, notice and outcome", () => {
    render(<IdentityCard identity={view({ required: true })} kind="application" party="company" refNo="VNK-BA-ABC123456" email="d@x.co" supportEmail="support@vink.co.za" onChanged={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Verify your business" })).toBeTruthy(); expect(screen.getByLabelText("Verify your business")).toBeTruthy();
    expect(screen.getByText(/I agree that VINK sends my business's registration documents and details of its directors and owners to Sumsub/)).toBeTruthy(); expect(screen.getByRole("button", { name: /Verify my business/ })).toBeTruthy();
    expect(screen.getByText("We cannot approve your application until your business is verified.")).toBeTruthy(); expect(screen.queryByText(/ID document and a photo of my face/)).toBeNull(); expect(screen.queryByText(/until your identity is confirmed/)).toBeNull();
    cleanup(); for (const [status, label] of [["approved", "Verified"], ["rejected", "Could not be verified"]] as const) { render(<IdentityCard identity={view({ status, canStart: false, required: true })} kind="application" party="company" refNo="VNK-BA-ABC123456" supportEmail="s@x.co" onChanged={vi.fn()} />); expect(screen.getByText(label)).toBeTruthy(); cleanup(); }
  });
  it("asks the server for the BUSINESS check, opens the widget in its own container, and says so if it cannot", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk();
    render(<IdentityCard identity={view()} kind="application" party="company" refNo="VNK-BA-ABC123456" email="d@x.co" supportEmail="support@vink.co.za" onChanged={vi.fn()} />); tick(); press(/Verify my business/);
    await waitFor(() => expect(sdk.launched).toBe("#sumsub-websdk-container-company")); expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body))).toEqual({ kind: "application", ref: "VNK-BA-ABC123456", party: "company", email: "d@x.co", consent: true });
    expect(document.getElementById("sumsub-websdk-container-company")).toBeTruthy(); expect(document.getElementById("sumsub-websdk-container-person")).toBeNull(); expect(screen.getByText(/Trouble with your business documents/)).toBeTruthy();
  });
  it("sends no party at all for the person check, exactly as before", async () => {
    globalThis.fetch = tokenReply(); const sdk = fakeSdk(); mount(); tick(); press(/Confirm my identity/); await waitFor(() => expect(sdk.launched).toBe("#sumsub-websdk-container-person")); expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body))).not.toHaveProperty("party");
  });

  it("never tells the applicant that VINK does not keep their details: the application form stores the ID number and selfie it asks for, so the consent says only what is true", () => {
    for (const party of ["person", "company"] as const) { render(<IdentityCard identity={view()} kind="application" party={party} refNo="VNK-BA-ABC123456" supportEmail="s@x.co" onChanged={vi.fn()} />); const t = document.body.textContent ?? ""; expect(t, party).not.toMatch(/does not keep|doesn't keep|never keep|not stored|not kept/i); expect(t, party).toMatch(/VINK keeps the result of the check, together with the information I gave in my application/); cleanup(); }
  });
});
