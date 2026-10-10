import { describe, it, expect } from "vitest";
import { cleanOutgoingHtml, htmlToText, textToHtml } from "./mailHtml.js";
import { renderSignature, safeUrl, safePhone, signatureConfigFromEnv, DEFAULT_SIGNATURE_CONFIG, type SignatureFields } from "./mailSignature.js";
import { scoreSpam, SPAM_THRESHOLD } from "./mailSpam.js";

describe("rich text from the editor", () => {
  it("keeps formatting, lists and links, and drops everything dangerous", () => {
    const out = cleanOutgoingHtml(`<p onclick="x()">Hello <b>Pam</b> <i>and</i> <u>Sam</u></p><script>alert(1)</script><ul><li>One</li></ul><img src=x onerror=alert(1)><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">bad</a><a href="https://vink.co.za/x" onclick="y()" style="color:red">good</a><style>p{}</style><form><input></form>`);
    expect(out).toContain("<b>Pam</b>"); expect(out).toContain("<li>One</li>"); expect(out).toContain("<u>Sam</u>");
    for (const bad of ["<script", "onclick", "onerror", "<img", "<iframe", "javascript:", "<style", "<form", "<input", "style="]) expect(out, bad).not.toContain(bad);
    expect(out).toContain('<a href="https://vink.co.za/x" target="_blank" rel="noopener noreferrer">good</a>');
  });
  it("copes with junk, protocol-relative links and oversized input", () => {
    expect(cleanOutgoingHtml(undefined)).toBe(""); expect(cleanOutgoingHtml(42)).toBe(""); expect(cleanOutgoingHtml("")).toBe("");
    expect(cleanOutgoingHtml('<a href="//evil.test/x">x</a>')).not.toContain("evil.test");
    expect(cleanOutgoingHtml("<p>" + "a".repeat(300_000) + "</p>").length).toBeLessThanOrEqual(100_000);
  });
  it("makes plain text with line breaks, bullets and link addresses", () => {
    expect(htmlToText("<p>Dear Pam,</p><p>Prices:</p><ul><li>Taxi</li><li>Bus</li></ul><p>See <a href=\"https://vink.co.za/p\">our site</a> &amp; call 021&nbsp;007</p>"))
      .toBe("Dear Pam,\nPrices:\n\n- Taxi\n- Bus\n\nSee our site (https://vink.co.za/p) & call 021 007");
    expect(htmlToText('<a href="https://x.co">https://x.co</a>')).toBe("https://x.co");
    expect(htmlToText("a<br>b<br/>c")).toBe("a\nb\nc");
  });
  it("shows plain text as HTML with the characters escaped", () => {
    expect(textToHtml("a <b> & \"c\"\nnext")).toBe('<p style="white-space:pre-wrap;margin:0 0 12px">a &lt;b&gt; &amp; &quot;c&quot;\nnext</p>');
  });
});

describe("the signature", () => {
  const fields = (o: Partial<SignatureFields> = {}): SignatureFields => ({ name: "Sarah Mitchell", title: "Sales Executive", department: "Sales Department", phone: "+27 (0)21 007 0772", email: "sales@vink.co.za", photoUrl: "https://www.vink.co.za/p/sarah.jpg", ...DEFAULT_SIGNATURE_CONFIG, ...o });

  it("follows the supplied design: name, title, department, contact rows, logo, wordmark, slogan, accent bar and notice", () => {
    const { html, text } = renderSignature(fields());
    for (const s of ["Sarah Mitchell", "Sales Executive", "Sales Department", "#82161A", "#D1A55B", "tel:+27210070772", "mailto:sales@vink.co.za", "8 Rose Street, Cape Town CBD, State House Building", "www.vink.co.za", "https://www.vink.co.za/signature/vink-logo.png", ">Vink<", "Let’s Grow Together", "confidential and intended solely for the addressee", 'width:640px']) expect(html, s).toContain(s);
    expect(html).toContain('src="https://www.vink.co.za/p/sarah.jpg"'); expect(html).not.toContain("<script");
    expect(text).toBe(["--", "Sarah Mitchell", "Sales Executive, Sales Department", "T: +27 (0)21 007 0772", "E: sales@vink.co.za", "A: 8 Rose Street, Cape Town CBD, State House Building", "W: https://www.vink.co.za", "VINK – Let’s Grow Together"].join("\n"));
  });
  it("shows the person's initials in a gold ring when there is no photo, and leaves out rows that are empty", () => {
    const { html } = renderSignature(fields({ photoUrl: "", phone: "", title: "" }));
    expect(html).toContain(">SM<"); expect(html).not.toContain("<img src=\"https://www.vink.co.za/p/"); expect(html).not.toContain("tel:");
    expect(html).not.toContain("font-size:15px");                                         // no title line
  });
  it("escapes everything a person types, and refuses an unsafe picture or phone", () => {
    const { html } = renderSignature(fields({ name: `<img src=x onerror=alert(1)> "Bob"`, title: "<script>alert(1)</script>", photoUrl: "javascript:alert(1)", phone: "<b>call</b>" }));
    expect(html).not.toContain("<script"); expect(html).not.toContain("<img src=x"); expect(html).not.toContain("javascript:"); expect(html).not.toContain("<b>call");
    expect(safeUrl("https://ok.example/a.png")).toBe("https://ok.example/a.png"); for (const bad of ["http://insecure.example/a.png", "data:image/png;base64,AA", "//x.test/a", "https://x.test/a b", "https://x.test/\"onload=1", 42, "", "x".repeat(400)]) expect(safeUrl(bad), String(bad)).toBe("");
    expect(safeUrl("http://x.test/a", false)).toBe("http://x.test/a");
    expect(safePhone("+27 21 007 0772")).toBe("+27 21 007 0772"); for (const bad of ["abc", "<b>1</b>", "", "12"]) expect(safePhone(bad), bad).toBe("");
  });
  it("shows social links only when they have been configured, and reads the settings from the environment", () => {
    expect(renderSignature(fields()).html).not.toContain(">in<");
    const cfg = signatureConfigFromEnv({ SIGNATURE_LINKEDIN: "https://www.linkedin.com/company/vink-za", SIGNATURE_YOUTUBE: "javascript:alert(1)", SIGNATURE_X: "https://x.com/vink", SIGNATURE_ADDRESS: "1 Main Rd", SIGNATURE_SLOGAN: "Grow" } as never);
    expect(cfg.social).toEqual([{ label: "LINKEDIN", url: "https://www.linkedin.com/company/vink-za" }, { label: "X", url: "https://x.com/vink" }]); expect(cfg).toMatchObject({ address: "1 Main Rd", slogan: "Grow", website: DEFAULT_SIGNATURE_CONFIG.website });
    const html = renderSignature(fields({ ...cfg })).html;
    expect(html).toContain(">in<"); expect(html).toContain('href="https://www.linkedin.com/company/vink-za"');
    expect(signatureConfigFromEnv({} as never)).toEqual(DEFAULT_SIGNATURE_CONFIG);
  });
  it("is the same design for every department, with its own name", () => {
    for (const d of ["Sales Department", "Customer Support", "Compliance"]) { const { html } = renderSignature(fields({ department: d })); expect(html).toContain(d); expect(html).toContain("#82161A"); }
  });
});

describe("automatic spam detection", () => {
  const m = (o: Partial<Parameters<typeof scoreSpam>[0]> = {}) => ({ fromName: "Pam Mokoena", fromEmail: "pam@example.com", subject: "Taxi rank levy", text: "Hello, please tell me about the levy for our taxi association.", ...o });
  it("leaves ordinary mail alone, including a customer who asks about their account", () => {
    expect(scoreSpam(m()).spam).toBe(false);
    expect(scoreSpam(m({ subject: "Please verify my account", text: "Hi, can you verify my account has the right name? Thanks." })).spam).toBe(false);   // one soft hit is not enough
    expect(scoreSpam(m({ fromName: "VINK Support", fromEmail: "support@vink.co.za", subject: "Re: your question" })).spam).toBe(false);
    expect(scoreSpam(m({ subject: "URGENT", text: "Please call me" })).score).toBeLessThan(SPAM_THRESHOLD);
  });
  it("sends a prize scam to spam, with the reasons", () => {
    const v = scoreSpam(m({ fromName: "Lottery Desk", fromEmail: "x84736251@mail.example", subject: "YOU HAVE WON!!!", text: "Claim your prize now: https://bit.ly/abc123" }));
    expect(v.spam).toBe(true); expect(v.score).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
    expect(v.reasons).toEqual(expect.arrayContaining(["Wording used in prize, casino, medicine or investment scams", "Subject is mostly capital letters", "Hides where a link goes (a link shortener)"]));
  });
  it("catches someone pretending to be VINK from another address, at once", () => {
    const v = scoreSpam(m({ fromName: "VINK Security Team", fromEmail: "alerts@gmail.com", subject: "Notice", text: "Hello" }));
    expect(v.spam).toBe(true); expect(v.reasons[0]).toBe("Claims to be VINK but was sent from gmail.com");
    expect(scoreSpam(m({ fromName: "VINK Group", fromEmail: "x@mail.vink.co.za" })).spam).toBe(false);                    // a real VINK subdomain is fine
  });
  it("catches phishing wording together with a bare-address link", () => {
    const v = scoreSpam(m({ subject: "Your account will be suspended", text: "Verify your account at http://192.168.4.4/login or lose access." }));
    expect(v.spam).toBe(true); expect(v.reasons).toEqual(expect.arrayContaining(["Asks you to confirm account or bank details, a common phishing trick", "Links to a bare internet address instead of a website name"]));
  });
  it("notices a name that shows a different email address, a missing subject, and many links", () => {
    const v = scoreSpam(m({ fromName: "ceo@bank.example", fromEmail: "x@mail.example", subject: "", text: Array.from({ length: 8 }, (_, i) => `https://a.example/${i}`).join(" ") }));
    expect(v.reasons).toEqual(expect.arrayContaining(["The name shown is a different email address from the real sender", "No subject", "Many links"])); expect(v.score).toBe(4);
  });
  it("copes with empty and very long input", () => {
    expect(scoreSpam({ fromName: "", fromEmail: "", subject: "", text: "" })).toMatchObject({ spam: false, score: 1 });
    expect(scoreSpam(m({ text: "word ".repeat(100_000) })).spam).toBe(false);
  });
});
