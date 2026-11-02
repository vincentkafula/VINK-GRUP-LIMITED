import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The site navigation strip stays above every signed-in tool, and a rule shifts each full-screen page down to clear it. The VINK dashboards use their own .mn class, so the rule has to name
 * it too, or the strip covers the top of the dashboard's own bar (the product badge, the bell, the close button).
 */
const theme = readFileSync(join(__dirname, "../styles/theme.css"), "utf8");
const mn = readFileSync(join(__dirname, "components/manshya/manshya.css"), "utf8");
const strip = readFileSync(join(__dirname, "components/SiteChrome.tsx"), "utf8");

describe("the dashboards under the site navigation strip", () => {
  it("are shifted down by exactly the strip's height, the same as every other full-screen page", () => {
    const height = /export const BAR_H = (\d+)/.exec(strip)?.[1]; expect(height).toBe("65");
    expect(theme).toMatch(/\.has-persistent-nav \.fixed\.inset-0 \{\s*top: 65px !important;\s*\}/); expect(theme).toMatch(/\.has-persistent-nav \.mn \{\s*top: 65px !important;\s*\}/);
  });
  it("are full-screen fixed overlays, which is what the offset moves", () => { expect(mn).toMatch(/\.mn\{position:fixed;inset:0;/); });
});
