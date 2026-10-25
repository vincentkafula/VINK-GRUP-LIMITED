import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");

/**
 * The home page in ivory and crimson: a light hero, a light benefits section, deep-ink bands for protection and cross-border, a light card picker and the crimson footer.
 * The colours come from the palette tokens (tokens.css), so the page follows the dark-mode toggle; these tests keep the old red-gradient hero and the violet section from coming back.
 */
describe("the home page's ivory and crimson look", () => {
  it("has an ivory hero: ink text, a crimson primary button, a white secondary button and no red gradient", () => {
    const h = src("HeroSection.tsx");
    expect(h).toContain("var(--vk-ivory) 70%, var(--vk-ivory-2) 100%");   // ivory, easing into the next section's tone at the bottom expect(h).toContain("text-ink"); expect(h).toContain("linear-gradient(180deg,#d6203d,#c8102e)");
    expect(h).not.toContain("linear-gradient(135deg, #C8102E"); expect(h).not.toContain("text-white"); expect(h).not.toContain("vkp-dots-on-red");
  });
  it("fades the hero's glows out at its edge, so no hard line shows where the hero meets the next section", () => {
    const h = src("HeroSection.tsx");
    expect(h).toContain('maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)"');
    expect(h).not.toContain("translate(-40%,40%)");   // no decorative glow hangs over the hero's edge to be sliced by it
  });
  it("keeps the find-a-card bar from leaving a white strip between the ivory hero and the ivory benefits section", () => {
    const s = src("SearchSection.tsx"); expect(s).toContain("var(--vk-ivory-2) 2.25rem"); expect(s).toContain("-mt-9");
  });
  it("makes the protection and cross-border sections the deep-ink band, and the card picker ivory", () => {
    expect(src("ProtectionSection.tsx")).toContain("vkp-dark vkp-night"); expect(src("ProtectionSection.tsx")).not.toContain("vkp-wine");
    expect(src("BusinessPowerSection.tsx")).toContain("vkp-dark vkp-night"); expect(src("BusinessPowerSection.tsx")).not.toContain("vkp-ink");
    expect(src("CreditCardsSection.tsx")).toContain("var(--vk-ivory) 0%,var(--vk-ivory-2) 100%"); expect(src("CreditCardsSection.tsx")).not.toContain("text-fg-muted");
  });
  it("uses a theme-aware crimson for text that sits on dark surfaces (plain brand red is only 3 to 1 there)", () => {
    expect(src("SearchSection.tsx")).toContain('text-[color:var(--vk-crimson-text)]">your journey.');
  });
  it("has no violet left anywhere on the home page", () => {
    for (const f of ["HeroSection.tsx", "FeaturesSection.tsx", "SearchSection.tsx", "ProtectionSection.tsx", "CreditCardsSection.tsx", "BusinessPowerSection.tsx"]) expect(src(f), f).not.toMatch(/vkv-|violet|#5d1efb/i);
    expect(readFileSync(join(__dirname, "../../styles/premium.css"), "utf8")).not.toContain("vkp-violet");
  });
});
