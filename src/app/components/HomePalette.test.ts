import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");

/**
 * The home page: the red hero (as it was) and the crimson footer, with ivory as the background of every section between them.
 * The ivory comes from the palette tokens (tokens.css), so the middle of the page follows the dark-mode toggle; the hero and footer stay red.
 */
describe("the home page's ivory and crimson look", () => {
  it("keeps the hero red, exactly as it was: the brand-red gradient, white text, no ivory", () => {
    const h = src("HeroSection.tsx");
    expect(h).toContain("linear-gradient(135deg, #C8102E 0%, #A30D25 54%, #7F1D1D 100%)"); expect(h).toContain("text-white"); expect(h).toContain("vkp-dots-on-red");
    expect(h).not.toMatch(/vk-ivory|text-ink|vk-glow-rose/);
    // the white button's red label comes from a class, not an inline colour: the dark theme lightens inline red text to pink, which is unreadable on white (2.7 to 1)
    expect(h).toContain('"vkp-cta-light text-[#C8102E]"'); expect(h).not.toMatch(/background: "linear-gradient\(180deg,#ffffff,#f3f3f6\)", color:/);
  });
  it("keeps the find-a-card bar from leaving a white strip between the ivory hero and the ivory benefits section", () => {
    const s = src("SearchSection.tsx"); expect(s).toContain("var(--vk-ivory-2) 2.25rem"); expect(s).toContain("-mt-9");
  });
  it("makes every section between the hero and the footer ivory: benefits, protection, card picker and cross-border", () => {
    expect(src("FeaturesSection.tsx")).toContain('className="vkp-ivory relative'); expect(src("ProtectionSection.tsx")).toContain("vkp-ivory vkp-ivory-alt"); expect(src("BusinessPowerSection.tsx")).toContain("vkp-ivory vkp-ivory-alt");
    expect(src("CreditCardsSection.tsx")).toContain("var(--vk-ivory) 0%,var(--vk-ivory-2) 100%"); expect(src("CreditCardsSection.tsx")).not.toContain("text-fg-muted");
    for (const f of ["ProtectionSection.tsx", "BusinessPowerSection.tsx"]) expect(src(f), f).not.toMatch(/vkp-dark|vkp-night|vkp-wine|vkp-ink|text-white/);   // no dark band and no white-on-dark text left
  });
  it("uses a theme-aware crimson for text that sits on dark surfaces (plain brand red is only 3 to 1 there)", () => {
    expect(src("SearchSection.tsx")).toContain('text-[color:var(--vk-crimson-text)]">your journey.');
  });
  it("has no violet left anywhere on the home page", () => {
    for (const f of ["HeroSection.tsx", "FeaturesSection.tsx", "SearchSection.tsx", "ProtectionSection.tsx", "CreditCardsSection.tsx", "BusinessPowerSection.tsx"]) expect(src(f), f).not.toMatch(/vkv-|violet|#5d1efb/i);
    expect(readFileSync(join(__dirname, "../../styles/premium.css"), "utf8")).not.toContain("vkp-violet");
  });
});
