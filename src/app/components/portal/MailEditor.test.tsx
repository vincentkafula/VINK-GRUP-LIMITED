// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createRef } from "react";
import { MailEditor, cleanHtml, isEmptyHtml, linkAddress, type EditorHandle } from "./MailEditor";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, exec: ReturnType<typeof vi.fn>, changes: string[];
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); changes = []; exec = vi.fn(() => true); (document as unknown as { execCommand: unknown }).execCommand = exec; });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const box = () => host.querySelector('[aria-label="Message"][contenteditable]') as HTMLElement;
const btn = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const mount = async (value = "", extra: Partial<React.ComponentProps<typeof MailEditor>> = {}, ref?: React.Ref<EditorHandle>) => { await act(async () => { root.render(<MailEditor ref={ref} value={value} onChange={(h) => changes.push(h)} ariaLabel="Message" {...extra} />); }); };
const typeHtml = async (html: string) => { await act(async () => { box().innerHTML = html; box().dispatchEvent(new Event("input", { bubbles: true })); }); };
const paste = async (data: Record<string, string>) => {
  const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { getData: (t: string) => data[t] ?? "" };
  await act(async () => { box().dispatchEvent(ev); }); return ev;
};

describe("helpers", () => {
  it("cleans HTML down to what an email needs", () => {
    const out = cleanHtml(`<p onclick="x()">Hi <b>there</b></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://vink.co.za" style="color:red" onclick="y()">good</a><iframe src="https://evil.test"></iframe><style>p{}</style>`);
    expect(out).toContain("<b>there</b>"); expect(out).toContain('href="https://vink.co.za"');
    for (const bad of ["<script", "onclick", "onerror", "<img", "javascript:", "<iframe", "<style", "style="]) expect(out, bad).not.toContain(bad);
  });
  it("knows when there is no text", () => {
    for (const e of ["", "<br>", "<div><br></div>", "<p>&nbsp;</p>", "  "]) expect(isEmptyHtml(e), JSON.stringify(e)).toBe(true);
    for (const t of ["a", "<p>a</p>", "<div>0</div>"]) expect(isEmptyHtml(t), t).toBe(false);
  });
  it("accepts web, email and phone addresses for a link, and only those", () => {
    expect(linkAddress("https://vink.co.za/a")).toBe("https://vink.co.za/a"); expect(linkAddress("vink.co.za")).toBe("https://vink.co.za"); expect(linkAddress(" sales@vink.co.za ")).toBe("mailto:sales@vink.co.za"); expect(linkAddress("tel:+27210070772")).toBe("tel:+27210070772"); expect(linkAddress("mailto:a@b.co")).toBe("mailto:a@b.co");
    for (const bad of ["", "javascript:alert(1)", "data:text/html,x", "two words", "ftp://x.test", "just text", "//x.test"]) expect(linkAddress(bad), bad).toBe("");
  });
});

describe("the editor", () => {
  it("shows a toolbar and a text box named for screen readers, with a placeholder while empty", async () => {
    await mount("", { placeholder: "Write your answer" });
    expect([...host.querySelectorAll('[role="toolbar"] button')].map((b) => b.getAttribute("aria-label"))).toEqual(["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Add link", "Clear formatting"]);
    expect(box().getAttribute("role")).toBe("textbox"); expect(box().getAttribute("aria-multiline")).toBe("true"); expect(host.textContent).toContain("Write your answer");
    await mount("<p>Hello</p>", { placeholder: "Write your answer" }); expect(host.textContent).not.toContain("Write your answer");
  });
  it("starts with the given text, cleaned", async () => {
    await mount("<p>Dear <b>Pam</b></p><script>alert(1)</script>");
    expect(box().innerHTML).toBe("<p>Dear <b>Pam</b></p>");
  });
  it("reports what is typed, cleaned, and reports an empty box as empty", async () => {
    await mount("");
    await typeHtml("<p>Hello <i>there</i></p><script>x</script><img src=x onerror=alert(1)>"); expect(changes.at(-1)).toBe("<p>Hello <i>there</i></p>");
    await typeHtml("<div><br></div>"); expect(changes.at(-1)).toBe("");
  });
  it("applies each formatting button to the selection", async () => {
    await mount("<p>x</p>");
    for (const [label, cmd] of [["Bold", "bold"], ["Italic", "italic"], ["Underline", "underline"], ["Bulleted list", "insertUnorderedList"], ["Numbered list", "insertOrderedList"], ["Clear formatting", "removeFormat"]] as const) {
      exec.mockClear(); await act(async () => { btn(label).click(); }); expect(exec, label).toHaveBeenCalledWith(cmd, false, undefined);
    }
  });
  it("makes a link from a web address, an email address or a bare website, and refuses anything else", async () => {
    await mount("<p>x</p>");
    const prompt = vi.spyOn(window, "prompt"), alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    prompt.mockReturnValueOnce("vink.co.za"); await act(async () => { btn("Add link").click(); }); expect(exec).toHaveBeenCalledWith("createLink", false, "https://vink.co.za");
    exec.mockClear(); prompt.mockReturnValueOnce("sales@vink.co.za"); await act(async () => { btn("Add link").click(); }); expect(exec).toHaveBeenCalledWith("createLink", false, "mailto:sales@vink.co.za");
    exec.mockClear(); prompt.mockReturnValueOnce("javascript:alert(1)"); await act(async () => { btn("Add link").click(); }); expect(exec).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalledTimes(1);
    prompt.mockReturnValueOnce(null); await act(async () => { btn("Add link").click(); }); expect(exec).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalledTimes(1);          // cancelled
  });
  it("opens links in a new tab without handing over the page", async () => {
    await mount('<p><a href="https://vink.co.za">site</a></p>');
    vi.spyOn(window, "prompt").mockReturnValueOnce("https://vink.co.za"); await act(async () => { btn("Add link").click(); });
    const a = box().querySelector("a")!; expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("cleans what is pasted, and turns pasted plain text into lines", async () => {
    await mount("");
    const ev = await paste({ "text/html": `<p onclick="x()">Pasted <b>bold</b></p><script>alert(1)</script><span style="font-size:40px">big</span>` });
    expect(ev.defaultPrevented).toBe(true); expect(exec).toHaveBeenCalledWith("insertHTML", false, expect.not.stringContaining("<script"));
    expect(exec.mock.calls.at(-1)![2]).toContain("<b>bold</b>"); expect(exec.mock.calls.at(-1)![2]).not.toContain("style=");
    exec.mockClear(); await paste({ "text/plain": "line one\n\nline <three> & more" });
    expect(exec.mock.calls.at(-1)![2]).toBe("<div>line one</div><div><br></div><div>line &lt;three&gt; &amp; more</div>");
  });
  it("takes a new value from outside (a template, a draft) but leaves the box alone while the person types", async () => {
    await mount("<p>first</p>"); await typeHtml("<p>first and more</p>"); expect(box().innerHTML).toBe("<p>first and more</p>");
    await mount("<p>first and more</p>"); expect(box().innerHTML).toBe("<p>first and more</p>");                             // typed text came back as the value: not reset
    await mount("<p>from a template</p>"); expect(box().innerHTML).toBe("<p>from a template</p>");
  });
  it("lets the page insert text (a template) or replace everything", async () => {
    const ref = createRef<EditorHandle>(); await mount("<p>start</p>", {}, ref);
    await act(async () => { ref.current!.insertHtml("<p>Dear customer</p><script>x</script>"); }); expect(exec).toHaveBeenCalledWith("insertHTML", false, "<p>Dear customer</p>");
    await act(async () => { ref.current!.setHtml("<p>replaced</p>"); }); expect(box().innerHTML).toBe("<p>replaced</p>"); expect(changes.at(-1)).toBe("<p>replaced</p>");
    (document as unknown as { execCommand: unknown }).execCommand = undefined;
    await act(async () => { ref.current!.insertHtml("<p>more</p>"); }); expect(box().innerHTML).toBe("<p>replaced</p><p>more</p>");              // still works without execCommand
  });
});
