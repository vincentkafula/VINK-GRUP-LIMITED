import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const FRAMES = [
  "dashboards/DashboardShell.tsx", "ManagementPanelViewer.tsx", "BankingDashboard.tsx", "AdminDashboard.tsx", "RevenueDashboard.tsx",
  
  
];

describe("the red dashboards", () => {
  it("marks the frame of every dashboard, so the brand red shows behind the cards", () => {
    for (const f of FRAMES) expect(fs.readFileSync(path.join(root, f), "utf8"), f).toContain("data-dashboard");
  });
  it("paints those frames the brand red, gives the cards their own colours back, and keeps the menu text white", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../../styles/dashboard.css"), "utf8");
    expect(css).toContain("[data-dashboard] {"); expect(css).toContain("background: #c8102e !important");
    expect(css).toContain(".bg-surface"); expect(css).toContain("--vkd-fg"); expect(css).toMatch(/aside :is\(button, a\) \{ color: #fff !important/);
    expect(fs.readFileSync(path.resolve(__dirname, "../../../styles/index.css"), "utf8")).toContain("dashboard.css");
  });
});
