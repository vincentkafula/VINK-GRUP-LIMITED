import { describe, it, expect } from "vitest";
import { engineMailer } from "./mount.js";
import type { EmailMessage, EmailSender } from "../auth/email.js";

describe("the VINK engine's mail goes through the real sender", () => {
  it("hands plain text to the sender as an escaped HTML copy as well, with attachments", async () => {
    const got: EmailMessage[] = [];
    const sender: EmailSender = { name: "test", async send(m) { got.push(m); } };
    await engineMailer(sender).send({ to: "ops@vink.co.za", subject: "Alert", text: "a <b> & c", attachments: [{ filename: "s.pdf", content: Buffer.from("x") }] });
    expect(got[0]).toMatchObject({ to: "ops@vink.co.za", subject: "Alert", text: "a <b> & c" });
    expect(got[0].html).toContain("a &lt;b&gt; &amp; c"); expect(got[0].html).not.toContain("<b>");
    expect(got[0].attachments).toHaveLength(1);
  });

  it("a sender that refuses (email not configured) rejects, so the engine's catch can swallow and log it", async () => {
    const sender: EmailSender = { name: "off", async send() { throw new Error("Email is not configured"); } };
    await expect(engineMailer(sender).send({ to: "a@b.co", subject: "s", text: "t" })).rejects.toThrow(/not configured/);
  });
});
