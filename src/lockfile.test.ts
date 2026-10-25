import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Railway builds the frontend with `npm ci`, which refuses to run when package.json lists a package that package-lock.json does not. A tool that edits package.json
 * but only updates another lockfile (v0.dev records its changes in pnpm-lock.yaml) therefore breaks the deployment before anything is compiled. This catches it.
 */
const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const declared = lock.packages[""] as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

describe("package.json and package-lock.json agree (what `npm ci` needs)", () => {
  it("lists the same dependencies, with the same version ranges", () => { expect(declared.dependencies ?? {}).toEqual(pkg.dependencies ?? {}); });
  it("lists the same dev dependencies, with the same version ranges", () => { expect(declared.devDependencies ?? {}).toEqual(pkg.devDependencies ?? {}); });
  it("has an installed entry for every dependency", () => {
    const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => !lock.packages[`node_modules/${n}`]);
    expect(missing).toEqual([]);
  });
});
