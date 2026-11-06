import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { translate, coverage, LangProvider, useT, LANGS } from "./i18n";

function Probe({ text }: { text: string }) { const t = useT(); return <p>{t(text)}</p>; }
describe("the marshal's language", () => {
  it("shows English as written, and a translated string in the chosen language", () => {
    expect(translate("en", "My earnings")).toBe("My earnings"); expect(translate("af", "My earnings")).toBe("My verdienste"); expect(translate("zu", "Send")).toBe("Thumela"); expect(translate("xh", "Send")).toBe("Thumela");
  });
  it("never shows a blank or a key: a string with no translation shows in English", () => { expect(translate("af", "Some text nobody translated")).toBe("Some text nobody translated"); expect(translate("zu", "My earnings")).toBe("My earnings"); });
  it("says which languages are reviewed: only isiZulu and isiXhosa are a first draft, and they have the fewest words", () => {
    expect(LANGS.map((l) => [l.code, l.reviewed])).toEqual([["en", true], ["af", true], ["zu", false], ["xh", false]]); expect(coverage("af")).toBeGreaterThan(coverage("zu")); expect(coverage("zu")).toBeGreaterThan(0);
  });
  it("applies to everything under the provider, and falls back to English for an unknown language", () => {
    const a = render(<LangProvider lang="af"><Probe text="My payslips" /></LangProvider>); expect(screen.getByText("My betaalstrokies")).toBeInTheDocument(); a.unmount();
    render(<LangProvider lang="klingon"><Probe text="My payslips" /></LangProvider>); expect(screen.getByText("My payslips")).toBeInTheDocument();
  });
  it("shows English with no provider at all", () => { render(<Probe text="My payslips" />); expect(screen.getByText("My payslips")).toBeInTheDocument(); });
  it("never has an empty translation, or one that is just the English again", () => { for (const l of ["af", "zu", "xh"] as const) for (const k of ["My earnings", "Send", "Close", "Open"]) { const v = translate(l, k); expect(v.trim().length).toBeGreaterThan(0); } expect(translate("af", "Trips")).not.toBe("Trips"); });
});
