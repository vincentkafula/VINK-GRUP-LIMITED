/**
 * The VINK email signature, in the design VINK supplied (email-signature-vink.html): a gold-ringed photo (or the person's initials), name, title and department on
 * the left, contact rows with round burgundy icons, the logo, the VINK wordmark and slogan on the right, a burgundy and gold bar, and a confidentiality notice.
 * Every department uses the same design with its own name and address. It is built from tables and inline styles because that is what mail programs support.
 *
 * Everything that comes from a person (name, title, phone, picture address) is escaped or checked here, because the signature goes into emails sent from VINK.
 */
export const BRAND = { burgundy: "#82161A", deep: "#5E0F12", gold: "#D1A55B", goldText: "#b88a3a", ink: "#2b1a1a", muted: "#5b5b66", rule: "#e3d3b0" };

export interface SignatureFields {
  name: string; title: string; department: string; phone: string; email: string; photoUrl: string;
  address: string; website: string; logoUrl: string; slogan: string; social: { label: string; url: string }[];
}
export interface SignatureConfig { address: string; website: string; logoUrl: string; slogan: string; social: { label: string; url: string }[] }

export const DEFAULT_SIGNATURE_CONFIG: SignatureConfig = {
  address: "8 Rose Street, Cape Town CBD, State House Building",
  website: "https://www.vink.co.za",
  logoUrl: "https://www.vink.co.za/signature/vink-logo.png",
  slogan: "Let’s Grow Together",
  social: [],
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Only a web address (https) is accepted for a picture or a link; anything else is dropped. */
export function safeUrl(v: unknown, httpsOnly = true): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (t.length > 300 || /[\s"'<>\\]/.test(t)) return "";
  try { const u = new URL(t); return (u.protocol === "https:" || (!httpsOnly && u.protocol === "http:")) ? u.toString() : ""; } catch { return ""; }
}
export const safePhone = (v: unknown) => { const t = oneLine(v, 30); return /^[+\d][\d\s().\-]{3,}$/.test(t) ? t : ""; };
const initials = (name: string) => (name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "V");

/** The configuration from the environment: SIGNATURE_ADDRESS, SIGNATURE_WEBSITE, SIGNATURE_LOGO_URL, SIGNATURE_SLOGAN and SIGNATURE_LINKEDIN / _X / _YOUTUBE / _FACEBOOK / _INSTAGRAM. */
export function signatureConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SignatureConfig {
  const d = DEFAULT_SIGNATURE_CONFIG;
  const social = (["LINKEDIN", "X", "YOUTUBE", "FACEBOOK", "INSTAGRAM"] as const).map((k) => ({ label: k, url: safeUrl(env[`SIGNATURE_${k}`]) })).filter((s) => s.url);
  return { address: oneLine(env.SIGNATURE_ADDRESS, 200) || d.address, website: safeUrl(env.SIGNATURE_WEBSITE) || d.website, logoUrl: safeUrl(env.SIGNATURE_LOGO_URL) || d.logoUrl, slogan: oneLine(env.SIGNATURE_SLOGAN, 60) || d.slogan, social };
}

const SOCIAL_CHIP: Record<string, string> = { LINKEDIN: "in", X: "X", YOUTUBE: "&#9654;", FACEBOOK: "f", INSTAGRAM: "ig" };

const chip = (letter: string) => `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td width="20" height="20" align="center" valign="middle" style="width:20px;height:20px;background-color:${BRAND.burgundy};border-radius:10px;color:${BRAND.gold};font-size:10px;font-weight:700;line-height:20px;">${letter}</td></tr></table>`;
const row = (letter: string, inner: string) => `<tr><td valign="middle" style="padding:3px 8px 3px 0;">${chip(letter)}</td><td valign="middle" style="font-size:13px;color:${BRAND.ink};">${inner}</td></tr>`;
const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:${BRAND.ink};text-decoration:none;">${esc(label)}</a>`;

export function renderSignature(f: SignatureFields): { html: string; text: string } {
  const name = oneLine(f.name, 80) || "VINK", title = oneLine(f.title, 80), dept = oneLine(f.department, 80), phone = safePhone(f.phone), email = oneLine(f.email, 254);
  const photo = safeUrl(f.photoUrl);
  const photoCell = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" width="110" height="110" style="display:block;width:110px;height:110px;border-radius:55px;border:3px solid ${BRAND.gold};object-fit:cover;">`
    : `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td width="104" height="104" align="center" valign="middle" style="width:104px;height:104px;border-radius:55px;border:3px solid ${BRAND.gold};background-color:${BRAND.burgundy};color:${BRAND.gold};font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:700;line-height:104px;">${esc(initials(name))}</td></tr></table>`;
  const rows = [
    phone ? row("T", link(`tel:${phone.replace(/\(0\)/, "").replace(/[^\d+]/g, "")}`, phone)) : "",
    email ? row("E", link(`mailto:${email}`, email)) : "",
    f.address ? row("A", link(`https://maps.google.com/?q=${encodeURIComponent(f.address)}`, f.address)) : "",
    f.website ? row("W", link(f.website, f.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))) : "",
  ].join("");
  const social = f.social.length
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center"><tr>${f.social.map((s, i) => `<td style="padding-right:${i === f.social.length - 1 ? 0 : 8}px;"><a href="${esc(s.url)}" style="text-decoration:none;"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background-color:${BRAND.burgundy};border-radius:13px;color:${BRAND.gold};font-family:Arial,sans-serif;font-size:12px;font-weight:700;line-height:26px;">${SOCIAL_CHIP[s.label] ?? esc(s.label.slice(0, 2))}</td></tr></table></a></td>`).join("")}</tr></table>`
    : "";
  const html = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;background-color:#ffffff;font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;width:640px;max-width:100%;margin-top:18px;">
<tr>
<td valign="middle" style="padding:16px 22px 16px 0;width:120px;">${photoCell}</td>
<td valign="middle" style="padding:16px 22px 16px 0;border-right:1px solid ${BRAND.rule};">
<div style="font-size:24px;line-height:28px;font-weight:700;color:${BRAND.burgundy};letter-spacing:0.2px;">${esc(name)}</div>
${title ? `<div style="font-size:15px;line-height:20px;color:${BRAND.muted};padding-top:2px;">${esc(title)}</div>` : ""}
${dept ? `<div style="font-size:10px;line-height:16px;color:${BRAND.goldText};letter-spacing:2.5px;text-transform:uppercase;padding-top:3px;padding-bottom:10px;">${esc(dept)}</div>` : ""}
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${rows}</table>
</td>
<td valign="middle" align="center" style="padding:16px 0 16px 22px;">
<a href="${esc(f.website)}" style="text-decoration:none;"><img src="${esc(f.logoUrl)}" alt="VINK" width="120" style="display:block;margin:0 auto;width:120px;height:auto;border:0;"></a>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;font-weight:700;color:${BRAND.burgundy};letter-spacing:6px;text-transform:uppercase;padding-top:6px;text-align:center;">Vink</div>
<div style="font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive;font-size:18px;line-height:22px;font-style:italic;color:${BRAND.goldText};padding-top:6px;padding-bottom:10px;text-align:center;">${esc(f.slogan)}</div>
${social}
</td>
</tr>
<tr><td colspan="3" style="padding:0;line-height:0;font-size:0;"><table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation"><tr><td height="4" style="height:4px;background-color:${BRAND.burgundy};line-height:4px;font-size:0;">&nbsp;</td><td width="120" height="4" style="width:120px;height:4px;background-color:${BRAND.gold};line-height:4px;font-size:0;">&nbsp;</td></tr></table></td></tr>
<tr><td colspan="3" style="padding-top:8px;font-size:10px;line-height:14px;color:#8a8a93;">This email and any attachments are confidential and intended solely for the addressee. If you received it in error, please notify the sender and delete it.</td></tr>
</table>`;
  const text = ["--", name, [title, dept].filter(Boolean).join(", "), phone && `T: ${phone}`, email && `E: ${email}`, f.address && `A: ${f.address}`, f.website && `W: ${f.website}`, "VINK – " + f.slogan].filter(Boolean).join("\n");
  return { html, text };
}
