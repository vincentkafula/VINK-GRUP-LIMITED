import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { PRODUCTS, PRODUCT_ORDER } from "./components/manshya/products";

/**
 * VINK Banking, VINK Pay and VINK Tap are separate dashboards. This reads the app and fails if sign-in stops landing on the choice of product, if a product loses its own address, or if anything
 * opens the dashboard without saying which product it is (which would bring back the one combined dashboard).
 */
const app = readFileSync(join(__dirname, "App.tsx"), "utf8");
const sources = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : []; });

describe("the product dashboards in the app", () => {
  it("lands on the choice of product after sign-in, and again at /dashboard", () => {
    expect(app).toMatch(/id === "manshya"\)\s+\{ mount\("manshya"\);\s+setManshyaProduct\(null\); setShowManshya\(true\); pushRoute\("\/dashboard"\);/);
    expect(app).toMatch(/path === "\/dashboard"\)\s+\{ mount\("manshya"\);\s+setManshyaProduct\(null\); setShowManshya\(true\); return true; \}/);
  });
  it("gives each product its own address that opens that product's dashboard", () => {
    expect(PRODUCT_ORDER.map((p) => PRODUCTS[p].path)).toEqual(["/dashboard/banking", "/dashboard/pay", "/dashboard/tap"]);
    expect(app).toMatch(/path\.startsWith\("\/dashboard\/"\)/); expect(app).toMatch(/\.find\(\(p\) => p\.path === `\/dashboard\/\$\{slug\}`\)/); expect(app).toMatch(/setManshyaProduct\(hit\.id\)/);
  });
  it("shows the chooser when no product is chosen and that product's dashboard when one is, with a way back to choose", () => {
    expect(app).toMatch(/manshyaProduct\s*\?\s*<ManshyaDashboard product=\{manshyaProduct\}/); expect(app).toMatch(/: <ProductChooser isOpen=\{showManshya\}/);
    expect(app).toMatch(/onChooseProduct=\{\(\) => \{ setManshyaProduct\(null\); pushRoute\("\/dashboard"\); \}\}/); expect(app).toMatch(/onOpen=\{\(p\) => \{ setManshyaProduct\(p\); pushRoute\(PRODUCTS\[p\]\.path\); \}\}/);
  });
  it("starts the bank account application from the chooser", () => { expect(app).toMatch(/onApplyBank=\{\(\) => \{ setShowManshya\(false\); setManshyaProduct\(null\); startTransition\(\(\) => \{ mount\("application"\); setShowApplication\(true\); pushRoute\("\/apply"\);/); });
  it("never opens the dashboard without saying which product it is", () => {
    const root = join(__dirname); const offenders: string[] = [];
    for (const f of sources(root)) { const s = readFileSync(f, "utf8"); for (const m of s.matchAll(/<ManshyaDashboard\b([^>]*)>?/g)) if (!/\bproduct=|\binitialMode=/.test(m[1])) offenders.push(`${f.replace(root, "")}: <ManshyaDashboard${m[1].slice(0, 60)}`); }
    expect(offenders).toEqual([]);
  });
});
