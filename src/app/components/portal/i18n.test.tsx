/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { translate, coverage, translateTree, translatableTexts, LangProvider, useT, LANGS, type Lang } from "./i18n";
import { VoiceScreen, SafetyScreen } from "./MarshalCare";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Probe({ text }: { text: string }) { const t = useT(); return <p>{t(text)}</p>; }
const SAFETY_CRITICAL = ["I need help now", "Emergency", "Sending an emergency alert", "Cancel", "Emergency alert sent. Your association has been told.", "Emergency alert saved on your phone. It will send as soon as you have signal.", "Getting your location",
  "We could not find your location, so the alert will go without it.", "Report a problem at the rank", "Threat", "Fight", "Robbery", "Overcrowding", "Injury", "Other", "Send report", "Reported. Your association has been told.", "Saved on your phone. It will send when you have signal."];

describe("the dictionaries", () => {
  it("show English as written, and a translated text in the chosen language, falling back to English for anything not translated", () => {
    expect(translate("en", "My earnings")).toBe("My earnings"); expect(translate("af", "My earnings")).toBe("My verdienste"); expect(translate("zu", "My earnings")).toBe("Imali engiyitholile"); expect(translate("xh", "My earnings")).toBe("Imali endiyifumileyo");
    expect(translate("af", "Some text nobody translated")).toBe("Some text nobody translated"); expect(translate("zu", "Deductions")).toBe("Deductions"); expect(translate("xh", "Deductions")).toBe("Deductions");                 // left in English rather than guessed
  });
  it("cover every safety-critical text in every language, so nobody in danger is shown English by default", () => {
    for (const lang of ["af", "zu", "xh"] as Lang[]) for (const k of SAFETY_CRITICAL) expect(translate(lang, k), `${lang}: ${k}`).not.toBe(k);
  });
  it("have no empty, duplicated or half-finished entries", () => {
    const keys = translatableTexts(); expect(new Set(keys).size).toBe(keys.length);                                                                                                                   // two rows for one text would silently disagree
    for (const lang of ["af", "zu", "xh"] as Lang[]) for (const k of keys) { const v = translate(lang, k); expect(v.trim().length, `${lang}: ${k}`).toBeGreaterThan(0); expect(v, `${lang}: ${k}`).not.toMatch(/undefined|null|TODO|\?\?/); expect(v.length, `${lang}: ${k}`).toBeLessThan(k.length * 3 + 20); }
  });
  it("keep the parts of a text that must not change: (R), (optional), numbers and the word PDF or WhatsApp", () => {
    for (const lang of ["af", "zu", "xh"] as Lang[]) { for (const k of keys().filter((x) => /PDF/.test(x))) if (translate(lang, k) !== k) expect(translate(lang, k)).toContain("PDF"); for (const k of keys().filter((x) => /WhatsApp/.test(x))) if (translate(lang, k) !== k) expect(translate(lang, k)).toContain("WhatsApp"); }
    expect(translate("af", "Break (minutes)")).toContain("(minute)");
  });
  it("say which languages are reviewed: Afrikaans is, isiZulu and isiXhosa are a first draft with fewer entries", () => {
    expect(LANGS.map((l) => [l.code, l.reviewed])).toEqual([["en", true], ["af", true], ["zu", false], ["xh", false]]); expect(coverage("af")).toBeGreaterThan(coverage("zu")); expect(coverage("zu")).toBeGreaterThan(100); expect(coverage("xh")).toBeGreaterThan(100); expect(coverage("en")).toBe(0);
  });
});
const keys = () => translatableTexts();

describe("translating a whole screen", () => {
  it("replaces text, placeholders, accessible names and titles that have an exact translation, keeping the surrounding spacing, and leaves everything else alone", () => {
    const host = document.createElement("div"); host.innerHTML = `<h2>  My shifts </h2><button title="Close" aria-label="Open">Open</button><input placeholder="Note" value="Note"><p>Open the door</p><p>Week of 2026-10-26</p><img alt="Closed" src="x"><textarea>Note</textarea><span data-notranslate>Other</span><script>var x = "Other";</script>`;
    translateTree("af", host); expect(host.querySelector("h2")!.textContent).toBe("  My skofte "); const b = host.querySelector("button")!; expect(b.textContent).toBe("Maak oop"); expect(b.getAttribute("title")).toBe("Maak toe"); expect(b.getAttribute("aria-label")).toBe("Maak oop");
    const i = host.querySelector("input")!; expect(i.getAttribute("placeholder")).toBe("Nota"); expect(i.value).toBe("Note");                                                                          // what a user typed is never touched
    expect(host.querySelectorAll("p")[0].textContent).toBe("Open the door"); expect(host.querySelectorAll("p")[1].textContent).toBe("Week of 2026-10-26"); expect(host.querySelector("img")!.getAttribute("alt")).toBe("Gesluit");
    expect(host.querySelector("textarea")!.textContent).toBe("Note"); expect(host.querySelector("span")!.textContent).toBe("Other"); expect(host.querySelector("script")!.textContent).toContain("Other");
  });
  it("does nothing at all in English", () => { const host = document.createElement("div"); host.innerHTML = "<p>Open</p>"; translateTree("en", host); expect(host.innerHTML).toBe("<p>Open</p>"); });
  it("applies to everything under the provider, including what appears later, and falls back to English for an unknown language", async () => {
    function Page() { const [n, setN] = useState(0); return <div><button onClick={() => setN(n + 1)}>Go</button>{n > 0 && <p>Safety</p>}<label>Reason<select aria-label="Which rank?"><option>Choose</option></select></label></div>; }
    const a = render(<LangProvider lang="af"><Probe text="My payslips" /><Page /></LangProvider>); expect(screen.getByText("My betaalstrokies")).toBeInTheDocument(); expect(screen.getByLabelText("Watter staanplek?")).toBeInTheDocument(); expect(screen.getByText("Kies")).toBeInTheDocument();
    expect(screen.queryByText("Veiligheid")).toBeNull(); fireEvent.click(screen.getByText("Go")); expect(await screen.findByText("Veiligheid")).toBeInTheDocument(); a.unmount();                                                                    // a new node is translated as it appears
    render(<LangProvider lang="klingon"><Probe text="My payslips" /></LangProvider>); expect(screen.getByText("My payslips")).toBeInTheDocument();
  });
  it("changes language while the screen is open, and back to English", async () => {
    const { rerender } = render(<LangProvider lang="zu"><button>Send</button></LangProvider>); expect(screen.getByRole("button")).toHaveTextContent("Thumela");
    rerender(<LangProvider lang="af"><button>Send</button></LangProvider>); expect(screen.getByRole("button")).toHaveTextContent("Stuur"); rerender(<LangProvider lang="en"><button>Send</button></LangProvider>); expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
  it("does not loop or flicker: a screen that updates often is translated each time without running away", async () => {
    function Ticker() { const [n, setN] = useState(0); return <div><button onClick={() => setN(n + 1)}>Go</button><p data-testid="t">{n % 2 ? "Closed" : "Pending"}</p></div>; }
    const spy = vi.spyOn(Node.prototype, "appendChild"); render(<LangProvider lang="af"><Ticker /></LangProvider>);
    for (let i = 0; i < 5; i++) { await act(async () => { fireEvent.click(screen.getByText("Go")); }); expect(screen.getByTestId("t")).toHaveTextContent(i % 2 === 0 ? "Gesluit" : "Hangende"); }
    expect(spy.mock.calls.length).toBeLessThan(50); spy.mockRestore();
  });
  it("shows the real marshal screens in the marshal's language: the complaint screen and the safety screen, including the emergency wording", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith("/ranks") ? { success: true, ranks: [{ id: "k1", name: "Langa" }] } : { success: true, grievances: [], incidents: [] }), { status: 200 })));
    const v = render(<LangProvider lang="af"><VoiceScreen /></LangProvider>); expect(await screen.findByText("Vertel jou vereniging iets")).toBeInTheDocument(); expect(screen.getByText("Waaroor gaan dit?")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Stuur" })).toBeInTheDocument(); expect(await screen.findByText("Jy het nog niks geopper nie.")).toBeInTheDocument();
    expect(screen.queryByText("Tell your association something")).toBeNull(); v.unmount();
    render(<LangProvider lang="xh"><SafetyScreen /></LangProvider>); expect(await screen.findByText("Chaza ingxaki erenki")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Isoyikiso" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Ukuphanga" })).toBeInTheDocument();
  });
});
