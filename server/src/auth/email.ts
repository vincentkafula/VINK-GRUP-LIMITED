/**
 * Outgoing email. Auth only needs two kinds (verify address, reset password), sent through Resend's HTTPS API
 * (POST https://api.resend.com/emails, Bearer API key). Behind an interface so tests and local development never send anything.
 *
 * Needs, in production: RESEND_API_KEY and EMAIL_FROM (an address on a domain you have verified in Resend, for example
 * "VINK <no-reply@vink.co.za>"). Without them, production sends nothing and says so in the log; flows still behave the same
 * from the user's point of view (they never learn whether an account exists).
 */

/** from: a sender such as "VINK Support <support@vink.co.za>" (used only if its domain is the verified sending domain). replyTo: where a reply should go. */
export interface EmailMessage { to: string; subject: string; text: string; html: string; from?: string; replyTo?: string }
export interface EmailSender { readonly name: string; send(msg: EmailMessage): Promise<void> }

export class ResendEmail implements EmailSender {
  readonly name = "resend";
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}

  /** A department's own address is used as the sender only on the same domain as the verified one; anything else falls back to the default sender. */
  private senderFor(wanted?: string): string {
    const domain = (a: string) => /@([^>\s]+)>?\s*$/.exec(a)?.[1]?.toLowerCase();
    return wanted && domain(wanted) && domain(wanted) === domain(this.from) && !/[\r\n]/.test(wanted) ? wanted : this.from;
  }

  async send(msg: EmailMessage): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.senderFor(msg.from), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(msg.replyTo && !/[\r\n]/.test(msg.replyTo) ? { reply_to: msg.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Never include the message body (it contains a one-time link) or the API key in the error.
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Resend rejected the email (${res.status}): ${detail}`);
    }
  }
}

/** Development: print the email instead of sending it, so links can be clicked from the terminal. */
export class ConsoleEmail implements EmailSender {
  readonly name = "console";
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}

/** Production without email configured: refuse loudly in the log, send nothing. */
export class UnconfiguredEmail implements EmailSender {
  readonly name = "unconfigured";
  async send(): Promise<void> { throw new Error("Email is not configured (set RESEND_API_KEY and EMAIL_FROM)."); }
}

export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const key = env.RESEND_API_KEY?.trim(), from = env.EMAIL_FROM?.trim();
  if (key && from) return new ResendEmail(key, from);
  if (env.NODE_ENV === "production") return new UnconfiguredEmail();
  return new ConsoleEmail();
}
