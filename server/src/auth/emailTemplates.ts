import type { EmailMessage } from "./email.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function layout(heading: string, intro: string, buttonText: string, link: string, footer: string): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#faf8f4;font-family:system-ui,Segoe UI,sans-serif;color:#241416">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;padding:28px">
<tr><td><div style="font-weight:800;font-size:20px;color:#8b0000">VINK</div>
<h1 style="font-size:20px;margin:18px 0 8px">${esc(heading)}</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 18px">${esc(intro)}</p>
<p style="margin:0 0 18px"><a href="${esc(link)}" style="display:inline-block;background:#8b0000;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${esc(buttonText)}</a></p>
<p style="font-size:12px;color:#6b5d5f;line-height:1.5;margin:0 0 8px">If the button does not work, copy this link into your browser:<br>${esc(link)}</p>
<p style="font-size:12px;color:#6b5d5f;line-height:1.5;margin:0">${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${intro}\n\n${buttonText}: ${link}\n\n${footer}\n`;
  return { html, text };
}

export function verifyEmailMessage(to: string, name: string, link: string): EmailMessage {
  const m = layout("Confirm your email address", `Hi ${name}, confirm this email address to finish setting up your VINK account. The link works for 24 hours.`, "Confirm email", link,
    "If you did not create an account, you can ignore this email.");
  return { to, subject: "Confirm your email address", ...m };
}

export function resetPasswordMessage(to: string, name: string, link: string): EmailMessage {
  const m = layout("Reset your password", `Hi ${name}, we received a request to reset your VINK password. The link works for 1 hour and can be used once.`, "Choose a new password", link,
    "If you did not ask for this, ignore this email: your password has not changed. Never share this link with anyone.");
  return { to, subject: "Reset your password", ...m };
}
