import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * The portal screens used to be drawn on a dark theme with an amber accent, and some of that palette survived the move to a light theme and the red dashboards:
 * dark-brown ink on a crimson button, pale slate on a white chip, pale amber on a white card. None of it is readable now. Colours come from the theme classes
 * (text-fg, text-warn, ...) or from inkOn(background); this fails if the old hardcoded ones come back.
 */
const dir = __dirname;
const files = readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));
const BANNED: [RegExp, string][] = [
  [/"#1a1200"/, "dark-brown ink (made for an amber button)"], [/"#cbd5e1"/, "pale slate text (made for a dark surface)"], [/"#06122b"/, "navy ink (made for a light accent)"],
  [/text-(amber|emerald|red|yellow|sky)-[0-9]{3}/, "a pale palette text class (made for a dark surface)"],
];
// Self-contained dark surfaces keep their own pale text: the screen-error card has its own dark background, and the mail sidebar is a dark sidebar.
const ALLOWED: Record<string, RegExp[]> = { "widgets.tsx": [/text-red-200/], "MailPanel.tsx": [/text-white\/[0-9]+/] };

describe("portal screens: no leftover palette from the old dark theme", () => {
  it("has no hardcoded dark-theme text colours (an allowlist covers the two self-contained dark surfaces)", () => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = readFileSync(join(dir, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const [re, why] of BANNED) if (re.test(line) && !(ALLOWED[f] ?? []).some((a) => a.test(line))) hits.push(`${f}:${i + 1}  ${why}`);
        if (/text-white\/[0-9]+/.test(line) && !(ALLOWED[f] ?? []).some((a) => a.test(line))) hits.push(`${f}:${i + 1}  white text at partial opacity (invisible on a white card)`);
      });
    }
    expect(hits).toEqual([]);
  });
  it("never sets button ink to a fixed colour on an accent background (use inkOn)", () => {
    const hits: string[] = [];
    for (const f of files) readFileSync(join(dir, f), "utf8").split("\n").forEach((line, i) => { if (/background: *(COLOR|color)\b[^}]*color: *"#[0-9a-fA-F]{3,6}"/.test(line) && !/"#fff(fff)?"/.test(line.match(/color: *"#[0-9a-fA-F]{3,6}"/)?.[0] ?? "")) hits.push(`${f}:${i + 1}`); });
    expect(hits).toEqual([]);
  });
});
