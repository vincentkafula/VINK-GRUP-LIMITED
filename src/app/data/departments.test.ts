import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { DEPARTMENTS, departmentByKey, emailOf } from "./departments";

/** Every page that shows a VINK email address to the public. If a page shows an address that is not a department, this test names it. */
const PUBLIC_FILES = [
  "components/footerPages/ContactUsViewer.tsx", "components/footerPages/CareersViewer.tsx", "components/footerPages/SponsorshipViewer.tsx",
  "components/footerPages/LegalComplianceViewer.tsx", "components/footerPages/SafetySecurityViewer.tsx", "components/GetHelpModal.tsx",
  "components/ErrorBoundary.tsx", "components/CustomerSupportChat.tsx", "components/PersonalAccountApplicationViewer.tsx",
];

describe("department email addresses", () => {
  it("are all on vink.co.za, unique, and each has a key, name, purpose and response time", () => {
    expect(new Set(DEPARTMENTS.map((d) => d.address)).size).toBe(DEPARTMENTS.length);
    expect(new Set(DEPARTMENTS.map((d) => d.key)).size).toBe(DEPARTMENTS.length);
    for (const d of DEPARTMENTS) { expect(d.address).toMatch(/^[a-z]+@vink\.co\.za$/); expect(d.name.length).toBeGreaterThan(3); expect(d.purpose.length).toBeGreaterThan(10); expect(d.respondWithin).toBeTruthy(); }
    expect(emailOf("careers")).toBe("careers@vink.co.za"); expect(emailOf("nope")).toBe("info@vink.co.za"); expect(departmentByKey("media")?.name).toBe("Media Relations");
  });

  it("are the only VINK addresses the public pages show (no other address, and no vink.com address)", () => {
    const allowed = new Set(DEPARTMENTS.map((d) => d.address));
    const stray: string[] = [];
    for (const f of PUBLIC_FILES) {
      const text = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
      for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@vink\.(?:co\.za|com)\b/g)) if (!allowed.has(m[0].toLowerCase())) stray.push(`${f}: ${m[0]}`);
    }
    expect(stray).toEqual([]);
  });

  it("every department address is shown somewhere on the public pages", () => {
    const shown = PUBLIC_FILES.map((f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8")).join("\n");
    const missing = DEPARTMENTS.filter((d) => d.key !== "privacy" || true).filter((d) => !shown.includes(d.address)).map((d) => d.address);
    expect(missing).toEqual([]);
  });
});
