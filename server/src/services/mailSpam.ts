/**
 * Automatic spam detection for incoming email. This looks at what we are given (sender, subject, text, links); it cannot see SPF/DKIM results or mail headers,
 * because Resend's webhook does not pass them on, so it catches the common cases, not everything. Each rule adds points, with a reason in plain words; at
 * SPAM_THRESHOLD points a message goes to Spam, and the reasons are shown on the message so a person can tell why, and press "Not spam".
 * A person's "Not spam" is final for that message (it is never filed again), and mail from a blocked sender goes to Spam without scoring (see mailService).
 */
export const SPAM_THRESHOLD = 5;
export interface SpamInput { fromName: string; fromEmail: string; subject: string; text: string }
export interface SpamVerdict { score: number; reasons: string[]; spam: boolean }

const OFFICIAL_DOMAIN = "vink.co.za";
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc)\//i;
const RULES: { re: RegExp; points: number; reason: string; where: "subject" | "text" | "both" }[] = [
  { re: /\b(viagra|cialis|casino|lottery|jackpot|you(?:'ve| have) won|claim your (?:prize|reward|winnings)|crypto (?:giveaway|doubl)|bitcoin (?:investment|profit)|forex signals?)\b/i, points: 4, reason: "Wording used in prize, casino, medicine or investment scams", where: "both" },
  { re: /\b(verify your account|your account (?:has been|will be) (?:suspended|locked|closed)|password (?:will )?expire|confirm your (?:identity|bank details)|update your (?:bank|banking|payment) details|unusual (?:sign[- ]?in|activity))\b/i, points: 3, reason: "Asks you to confirm account or bank details, a common phishing trick", where: "both" },
  { re: /\b(gift cards?|western union|wire transfer urgently|send (?:me )?(?:bitcoin|btc)|advance fee|inheritance|next of kin|beneficiary of)\b/i, points: 3, reason: "Wording used in advance-fee and payment scams", where: "both" },
  { re: /\b(work from home|make \$?\d+[\d,]* (?:a|per) (?:day|week)|earn (?:up to )?\$?\d+|no experience needed|risk[- ]free|act now|limited time offer|click here to (?:claim|verify|confirm|unsubscribe))\b/i, points: 2, reason: "Pushy marketing wording", where: "both" },
  { re: /\b(unsubscribe)\b[\s\S]{0,200}\b(sent to you because|you are receiving this)\b/i, points: 1, reason: "Looks like a bulk mailing", where: "text" },
];

export function scoreSpam(m: SpamInput): SpamVerdict {
  let score = 0; const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; if (!reasons.includes(reason)) reasons.push(reason); };
  const subject = m.subject.trim(), text = m.text.slice(0, 20_000), email = m.fromEmail.toLowerCase(), domain = email.split("@")[1] ?? "";

  for (const r of RULES) if ((r.where !== "text" && r.re.test(subject)) || (r.where !== "subject" && r.re.test(text))) add(r.points, r.reason);

  const letters = subject.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7) add(1, "Subject is mostly capital letters");
  if (/[!?]{3,}/.test(subject)) add(1, "Shouting punctuation in the subject");
  if (!subject) add(1, "No subject");

  if (SHORTENERS.test(text)) add(2, "Hides where a link goes (a link shortener)");
  if (/https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i.test(text)) add(2, "Links to a bare internet address instead of a website name");
  if ((text.match(/https?:\/\//gi) ?? []).length > 6) add(1, "Many links");

  // pretending to be VINK, or to be someone else's address
  const name = m.fromName.toLowerCase();
  if (/\bvink\b/.test(name) && domain !== OFFICIAL_DOMAIN && !domain.endsWith(`.${OFFICIAL_DOMAIN}`)) add(5, `Claims to be VINK but was sent from ${domain || "an unknown address"}`);
  const shown = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(m.fromName)?.[0]?.toLowerCase();
  if (shown && shown !== email) add(2, "The name shown is a different email address from the real sender");
  if (/^[a-z]*\d{6,}[a-z\d]*@/.test(email)) add(1, "Sender address looks machine-made");

  return { score, reasons, spam: score >= SPAM_THRESHOLD };
}
