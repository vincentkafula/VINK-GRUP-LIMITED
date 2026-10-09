/**
 * VINK's departments and their email addresses: the one list the server uses to route a message sent from the website and an email that arrives.
 * The website has its own copy (src/app/data/departments.ts) so its pages can show the addresses; departments.test.ts fails if the two lists differ.
 *
 * An address is only listed here if it is shown to the public. A department's mailbox is expected to exist on the company's mail system. When the people
 * who answer it have their own inboxes, set DEPT_FORWARD_<KEY> (a comma-separated list) and the server notifies those inboxes instead of the mailbox.
 */
export interface Department {
  key: string;
  name: string;
  address: string;
  /** What to write to this department about, in words for the public. */
  purpose: string;
  /** What the sender is told to expect. */
  respondWithin: string;
}

export const DEPARTMENTS: Department[] = [
  { key: "support", name: "Customer Support", address: "support@vink.co.za", purpose: "Help with your wallet, card, account or the app", respondWithin: "1–2 business days" },
  { key: "sales", name: "Sales", address: "sales@vink.co.za", purpose: "Sales enquiries about VINK products and services", respondWithin: "1–2 business days" },
  { key: "general", name: "General Enquiries", address: "info@vink.co.za", purpose: "Any other question about VINK", respondWithin: "1–2 business days" },
  { key: "compliance", name: "Compliance", address: "compliance@vink.co.za", purpose: "Regulatory and compliance enquiries, and reporting a concern", respondWithin: "1–2 business days" },
  { key: "privacy", name: "Privacy and Information Officer", address: "privacy@vink.co.za", purpose: "Access, correct or delete your personal information (POPIA)", respondWithin: "1–2 business days" },
  { key: "careers", name: "Careers", address: "careers@vink.co.za", purpose: "Jobs at VINK", respondWithin: "1–2 business days" },
  { key: "internships", name: "Internship Programme", address: "intern@vink.co.za", purpose: "Internships and graduate placements", respondWithin: "1–2 business days" },
  { key: "sponsorships", name: "Sponsorships and Partnerships", address: "sponsorships@vink.co.za", purpose: "Sponsorship and partnership proposals", respondWithin: "1–2 business days" },
  { key: "media", name: "Media Relations", address: "media@vink.co.za", purpose: "Press and media requests", respondWithin: "1–2 business days" },
];

export const departmentByKey = (key: unknown): Department | undefined => (typeof key === "string" ? DEPARTMENTS.find((d) => d.key === key) : undefined);

/** The department an incoming email was sent to, from its recipient addresses ("Name <addr>" is accepted). null when it was sent to none of ours. */
export function departmentOfAddresses(to: readonly string[]): Department | null {
  for (const raw of to) {
    const m = /<([^>]+)>/.exec(raw);
    const addr = (m ? m[1] : raw).trim().toLowerCase();
    const d = DEPARTMENTS.find((x) => x.address === addr);
    if (d) return d;
  }
  return null;
}

/** Who is told about a message for this department: the forward list if one is set, otherwise the department's own mailbox. */
export function notifyTargets(d: Department, env: NodeJS.ProcessEnv = process.env): string[] {
  const list = (env[`DEPT_FORWARD_${d.key.toUpperCase()}`] ?? "").split(",").map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return list.length ? list : [d.address];
}
