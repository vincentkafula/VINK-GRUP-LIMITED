import { describe, it, expect, vi, afterEach } from "vitest";
import { inkOn, portalClient } from "./ui";
import { BRAND } from "../../brand";

const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("inkOn: the text colour for a button on a given background", () => {
  it("is white on the brand red (5.9 to 1) and never the dark brown or black the dashboards used to hardcode there", () => {
    expect(inkOn("#C8102E")).toBe("#ffffff"); expect(contrast("#C8102E", inkOn("#C8102E"))).toBeGreaterThan(5.5);
    for (const red of [BRAND.crimson, BRAND.crimsonHover, BRAND.crimsonDeep]) expect(inkOn(red), red).toBe("#ffffff");
  });
  it("is dark on light backgrounds and white on dark ones", () => {
    for (const light of ["#ffffff", "#F9FAFB", "#FEF2F4", "#10B981", "#F59E0B", "#C9A84C"]) expect(inkOn(light), light).toBe("#101010");
    expect(inkOn("#101828")).toBe("#ffffff");
  });
  it("gives at least 4.5 to 1 on every brand colour, which is the point", () => {
    for (const [name, hex] of Object.entries(BRAND)) { if (!/^#[0-9a-f]{6}$/i.test(String(hex))) continue; expect(contrast(String(hex), inkOn(String(hex))), `${name} ${hex}`).toBeGreaterThanOrEqual(4.5); }
  });
  it("picks whichever of white and near-black has the better contrast, over the whole colour range", () => {
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
      const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""), chosen = inkOn(hex), other = chosen === "#ffffff" ? "#101010" : "#ffffff";
      expect(contrast(hex, chosen), hex).toBeGreaterThanOrEqual(contrast(hex, other) - 0.01);
    }
  });
  it("falls back to dark ink for something that is not a plain hex colour", () => { expect(inkOn("var(--vk-brand)")).toBe("#101010"); });
});

describe("portalClient: what it makes of a reply", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: string, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body || null, { status })));
  const call = () => portalClient("driver")("/profile");
  it("returns the data of a good reply", async () => { reply(JSON.stringify({ success: true, profile: { phone: "1" } })); expect(await call()).toEqual({ data: { success: true, profile: { phone: "1" } } }); });
  it("returns the server's own message for a refusal", async () => { reply(JSON.stringify({ success: false, error: "Not allowed" }), 403); expect(await call()).toEqual({ error: "Not allowed" }); });
  it("treats a successful reply that is not JSON (a proxy's page, or a route the server lacks) as an error, not as empty data", async () => {
    reply("<!DOCTYPE html><html></html>"); expect(await call()).toEqual({ error: "The server sent a reply we could not read. Please try again." });
    reply("[1,2,3]".replace(/.*/, "null")); expect(await call()).toEqual({ error: "The server sent a reply we could not read. Please try again." });
  });
  it("still treats a successful reply with no body (204) as success", async () => { reply("", 204); expect(await call()).toEqual({ data: {} }); });
  it("reports a failure whose body is not JSON by its status", async () => { reply("<html>Bad gateway</html>", 502); expect(await call()).toEqual({ error: "Request failed (502)" }); });
});
