import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const walk = (d: string, out: string[] = []): string[] => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = (dir: string, ext: RegExp) => walk(dir).filter((f) => ext.test(f) && !/\.test\./.test(f));

describe("the name Manshya is not shown anywhere a person can see it", () => {
  const front = files("src", /\.(tsx?|css)$/).map((f) => [f, fs.readFileSync(f, "utf8")] as const);
  const bad: [string, RegExp][] = [
    ["the rewards points are VINK Points", /ManshyaPoints/],
    ["the logo reads vink, not manshya", /manshya<i>/i],
    ["no product labelled manshya pay or tap", /"manshya (pay|tap|finance)"/i],
    ["the web addresses are /dashboard and /back-office", /"\/manshya(-admin)?"/],
    ["the API address is /api/vink", /\/api\/manshya/],
    ["the webhook header is X-VINK-Signature", /X-Manshya/i],
  ];
  for (const [what, re] of bad) it(what, () => { for (const [f, s] of front) expect(s, f).not.toMatch(re); });

  it("the server uses the same API address and header", () => {
    for (const f of files("server/src", /\.(ts|js)$/)) { const s = fs.readFileSync(f, "utf8"); expect(s, f).not.toMatch(/\/api\/manshya/); expect(s, f).not.toMatch(/x-manshya-signature/i); }
  });
  it("the customer dashboard and the back office open at their new addresses", () => {
    const app = fs.readFileSync("src/app/App.tsx", "utf8");
    expect(app).toContain('path === "/dashboard"'); expect(app).toContain('path === "/back-office"');
    expect(app).toContain('pushRoute("/dashboard")'); expect(app).toContain('pushRoute("/back-office")');
  });
});
