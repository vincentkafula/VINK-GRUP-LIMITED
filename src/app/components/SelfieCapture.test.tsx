// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SelfieCapture } from "./SelfieCapture";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, onUse: ReturnType<typeof vi.fn>, onBack: ReturnType<typeof vi.fn>, stop: ReturnType<typeof vi.fn>, gum: ReturnType<typeof vi.fn>;
const fakeStream = () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream;
const setMedia = (md: unknown) => Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });

beforeEach(() => {
  onUse = vi.fn(); onBack = vi.fn(); stop = vi.fn(); gum = vi.fn(async () => fakeStream());
  setMedia({ getUserMedia: gum });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/jpeg;base64,SELFIE");
  vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); setMedia(undefined); });

const render = async () => { await act(async () => { root.render(<SelfieCapture onUse={onUse} onBack={onBack} tick={1} />); }); await wait(); };
const wait = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = () => host.textContent!;
const btn = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent!.includes(t)) as HTMLElement | undefined;
const click = async (t: string) => { const b = btn(t); if (!b) throw new Error("no button " + t); await act(async () => { b.click(); }); await wait(); };

describe("the selfie step", () => {
  it("shows the live camera with an oval to centre the face in, and a Take photo button, once the camera is allowed", async () => {
    await render();
    expect(gum).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: "user" }), audio: false }));
    const v = host.querySelector("video") as HTMLVideoElement; expect(v.className).toContain("opacity-100"); expect(v.className).toContain("-scale-x-100");        // visible, and mirrored like a mirror
    expect(host.querySelector("[data-selfie-frame] svg")).not.toBeNull(); expect(btn("Take photo")).toBeTruthy();
    expect(text()).toContain("sent with your application");
  });

  it("counts down, takes the photo, and hands it over when the applicant keeps it; the camera is switched off", async () => {
    await render(); await click("Take photo"); await wait(80);
    expect(host.querySelector("img[alt='Your selfie']")).not.toBeNull(); expect(text()).toContain("Photo ready"); expect(stop).toHaveBeenCalled();
    await click("Use this photo"); expect(onUse).toHaveBeenCalledWith("data:image/jpeg;base64,SELFIE");
  });

  it("shows the count while it runs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await act(async () => { root.render(<SelfieCapture onUse={onUse} onBack={onBack} tick={1000} />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { btn("Take photo")!.click(); });
    expect(host.querySelector("[aria-live=assertive]")!.textContent).toBe("3");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(host.querySelector("[aria-live=assertive]")!.textContent).toBe("2");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(host.querySelector("[aria-live=assertive]")!.textContent).toBe("1");
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); expect(host.querySelector("img[alt='Your selfie']")).not.toBeNull();
    vi.useRealTimers();
  });

  it("Retake starts the camera again", async () => {
    await render(); await click("Take photo"); await wait(80); await click("Retake"); await wait();
    expect(gum).toHaveBeenCalledTimes(2); expect(host.querySelector("img[alt='Your selfie']")).toBeNull(); expect(btn("Take photo")).toBeTruthy();
  });

  it("when the camera is blocked it says how to allow it, offers to try again, and offers a photo instead", async () => {
    gum.mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    await render();
    expect(text()).toContain("Camera access was blocked"); expect(btn("Try the camera again")).toBeTruthy(); expect(host.querySelector("label[for=selfie-file]")!.textContent).toContain("Take or choose a photo");
    gum.mockResolvedValue(fakeStream()); await click("Try the camera again"); expect(btn("Take photo")).toBeTruthy();
  });

  it("says so when there is no camera, and when the browser has none to offer", async () => {
    gum.mockRejectedValue(Object.assign(new Error("none"), { name: "NotFoundError" })); await render(); expect(text()).toContain("No camera was found on this device.");
    act(() => root.unmount()); root = createRoot(host); setMedia(undefined); await render(); expect(text()).toContain("isn't available in this browser");
  });

  it("takes a photo chosen or taken with the phone's camera instead, and rejects a file that is not a picture", async () => {
    setMedia(undefined); await render();
    const input = host.querySelector("#selfie-file") as HTMLInputElement; expect(input.getAttribute("capture")).toBe("user"); expect(input.accept).toBe("image/*");
    const choose = async (f: File) => { Object.defineProperty(input, "files", { value: [f], configurable: true }); await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(60); };
    await choose(new File(["x"], "notes.pdf", { type: "application/pdf" })); expect(text()).toContain("Please choose a photo");
    await choose(new File(["x"], "me.jpg", { type: "image/jpeg" })); expect(host.querySelector("img[alt='Your selfie']")).not.toBeNull();
    await click("Use this photo"); expect(onUse).toHaveBeenCalledWith("data:image/jpeg;base64,SELFIE");
  });

  it("switches the camera off when the step is left", async () => {
    await render(); act(() => root.unmount()); expect(stop).toHaveBeenCalled(); root = createRoot(host);
  });
});
