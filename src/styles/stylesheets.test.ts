import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..");
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : []; });
const files = cssFiles(src);
const noStrings = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');

describe("the stylesheets", () => {
  it("never contain a literal backslash followed by n typed where a line break belongs (an editing tool once did this to dashboard.css: the browser dropped the rule's background and colour)", () => {
    expect(files.length).toBeGreaterThan(5);
    const hits = files.filter((f) => /\\n/.test(noStrings(readFileSync(f, "utf8")))).map((f) => f.replace(src, "src"));
    expect(hits).toEqual([]);
  });
  it("never import anything at run time from another website: the site's typeface is Inter, self-hosted", () => {
    const hits = files.filter((f) => /@import\s+url\(\s*['"]?https?:/i.test(readFileSync(f, "utf8"))).map((f) => f.replace(src, "src"));
    expect(hits).toEqual([]);
  });
});
