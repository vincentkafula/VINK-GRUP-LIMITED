import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadGoogleMaps, onMapsAuthFailure, resetGoogleMapsForTests, MapsUnavailable } from "./googleMaps";

const scripts = () => [...document.head.querySelectorAll("script")].filter((s) => s.src.includes("maps.googleapis.com"));
const fakeGoogle = () => ({ maps: { importLibrary: vi.fn(async () => ({})), marker: {} } });

beforeEach(() => { resetGoogleMapsForTests(); document.head.innerHTML = ""; delete (window as unknown as Record<string, unknown>).google; delete (window as unknown as Record<string, unknown>).__vinkMapsReady; });
afterEach(() => vi.useRealTimers());

describe("loadGoogleMaps", () => {
  it("without a key it refuses at once and loads nothing", async () => {
    await expect(loadGoogleMaps("")).rejects.toMatchObject({ reason: "no_key" });
    expect(scripts()).toHaveLength(0);
  });

  it("with a key it adds ONE script (key escaped, async loading) and resolves when Google calls back; later calls reuse it", async () => {
    const p = loadGoogleMaps("AIza test&key");
    const [s] = scripts();
    expect(scripts()).toHaveLength(1);
    expect(s.src).toContain("key=AIza%20test%26key"); expect(s.src).toContain("loading=async"); expect(s.src).toContain("callback=__vinkMapsReady");
    (window as unknown as { google: unknown }).google = fakeGoogle();
    (window as unknown as Record<string, () => void>).__vinkMapsReady();
    const maps = await p;
    expect(maps.importLibrary).toHaveBeenCalledWith("maps"); expect(maps.importLibrary).toHaveBeenCalledWith("marker");
    expect(await loadGoogleMaps("AIza test&key")).toBe(maps);
    expect(scripts()).toHaveLength(1);
  });

  it("a script that fails to load rejects as script_failed, and a later visit may try again", async () => {
    const p = loadGoogleMaps("k1");
    scripts()[0].onerror!(new Event("error"));
    await expect(p).rejects.toBeInstanceOf(MapsUnavailable);
    await expect(p).rejects.toMatchObject({ reason: "script_failed" });
    loadGoogleMaps("k1").catch(() => {});
    expect(scripts()).toHaveLength(2);                                   // a fresh attempt, not a stuck promise
  });

  it("gives up with a timeout when Google never answers", async () => {
    vi.useFakeTimers();
    const p = loadGoogleMaps("k2", 5000);
    const assertion = expect(p).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });

  it("tells listeners when Google rejects the key after loading (gm_authFailure), and they can unsubscribe", () => {
    loadGoogleMaps("k3").catch(() => {});
    const seen = vi.fn(); const off = onMapsAuthFailure(seen);
    (window as unknown as Record<string, () => void>).gm_authFailure();
    expect(seen).toHaveBeenCalledTimes(1);
    off(); (window as unknown as Record<string, () => void>).gm_authFailure();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
