import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (f: string) => fs.readFileSync(f, "utf8");

describe("Company Registration Management is no longer part of the system", () => {
  it("is not a management module, a careers department or a server section any more", () => {
    for (const f of ["src/app/components/ManagementPanelViewer.tsx", "src/app/components/JobApplicationViewer.tsx", "server/src/routes/rbac.ts"]) expect(read(f), f).not.toContain("Company Registration");
  });
  it("leaves three management modules in the panel and in the server", () => {
    const panel = read("src/app/components/ManagementPanelViewer.tsx");
    expect([...panel.matchAll(/\{ title: "[A-Za-z ]+ Management", displayTitle:/g)]).toHaveLength(3);
    const server = read("server/src/routes/rbac.ts"); const list = server.slice(server.indexOf("export const MODULE_SECTIONS"), server.indexOf("];", server.indexOf("export const MODULE_SECTIONS")));
    expect(list).toContain("Bank Management"); expect(list).toContain("Payment Management"); expect(list).toContain("Social Responsibility Management"); expect(list).toContain("Social Media Management"); expect(list).not.toContain("Registration");
  });
});
