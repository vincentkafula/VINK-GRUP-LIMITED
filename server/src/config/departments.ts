/**
 * VINK's departments and their email addresses: the one list the server uses to route a message sent from the website and an email that arrives.
 * The website has its own copy of the built-in ones (src/app/data/departments.ts) so its pages can show the addresses; departments.test.ts fails if the two lists differ.
 *
 * The nine below are built in. A Super Administrator can create more in the Management Panel (Departments): they are stored in the database (custom_departments),
 * loaded at start-up and after every change, and used everywhere the built-in ones are (routing, the mailbox, sections, and the Contact page when marked public).
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
  /** Made by a Super Administrator rather than built in. */
  custom?: boolean;
  /** Shown on the Contact page (default true; a custom department can be internal only). */
  public?: boolean;
  /** A department that is switched off stays readable but is hidden from the Contact page and from the choice of who to write from (default true). */
  active?: boolean;
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

/**
 * Other names a department goes by in job applications. Approving a job application grants the section named in it, and the Careers page names two departments
 * differently from their mailboxes, so these job departments also open the matching mailbox.
 */
export const SECTION_ALIASES: Record<string, string> = {
  "Legal & Compliance": "compliance",
  "Client Services": "support",
};

let customDepartments: Department[] = [];
const listeners = new Set<() => void>();

/** Every department: the built-in ones, then the ones a Super Administrator has made. */
export const allDepartments = (): Department[] => [...DEPARTMENTS, ...customDepartments];
/** The departments the public Contact page offers. */
export const publicDepartments = (): Department[] => allDepartments().filter((d) => d.public !== false && d.active !== false);
/** Replaces the custom departments (called at start-up and after each change) and tells whoever is listening (the list of sections people can be approved for). */
export function setCustomDepartments(list: Department[]): void { customDepartments = list.map((d) => ({ ...d, custom: true })); for (const f of listeners) f(); }
export function onDepartmentsChanged(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const departmentByKey = (key: unknown): Department | undefined => (typeof key === "string" ? allDepartments().find((d) => d.key === key) : undefined);

/** The mail domain departments' addresses are made on. */
export const MAIL_DOMAIN = (process.env.MAIL_DOMAIN ?? "vink.co.za").toLowerCase();
/** Mailbox names that belong to the system or to people, and so cannot be a department's. */
export const RESERVED_MAILBOXES = new Set(["admin", "administrator", "billing", "noc", "noc1", "owner", "treasury", "no-reply", "noreply", "postmaster", "abuse", "root", "webmaster", "hostmaster", "security", "mailer-daemon", "bounce", "bounces", "dmarc", "hello", "ceo", "cfo", "alerts", "notifications", "api", "www", "mail", "ftp", "test"]);

export interface NewDepartment { name: unknown; mailbox: unknown; purpose?: unknown; respondWithin?: unknown; public?: unknown }

/**
 * Checks a new department against everything that exists; returns the department to store, or the reason it is refused. sectionNames are the other sections of the
 * management panel (a department's name is its section, so it cannot repeat one). The name cannot be changed later: managers are approved for it by name.
 */
export function checkNewDepartment(a: NewDepartment, sectionNames: readonly string[] = []): { ok: true; department: Department } | { ok: false; error: string } {
  const name = typeof a.name === "string" ? a.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 3 || name.length > 60) return { ok: false, error: "The name must be between 3 and 60 characters" };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &'.,()/-]*$/u.test(name)) return { ok: false, error: "The name can use letters, numbers, spaces and & ' . , ( ) / -" };
  const mailbox = typeof a.mailbox === "string" ? a.mailbox.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(mailbox) || /[._-]{2}/.test(mailbox)) return { ok: false, error: "The mailbox name needs 3 to 32 letters, numbers, dots, dashes or underscores (for example legal)" };
  if (RESERVED_MAILBOXES.has(mailbox)) return { ok: false, error: `"${mailbox}" is kept for the system. Choose another mailbox name` };
  const address = `${mailbox}@${MAIL_DOMAIN}`;
  const taken = allDepartments();
  if (taken.some((d) => d.address === address)) return { ok: false, error: `${address} is already used by another department` };
  if (taken.some((d) => d.name.toLowerCase() === name.toLowerCase()) || sectionNames.some((s) => s.toLowerCase() === name.toLowerCase())) return { ok: false, error: "A department or section with that name already exists" };
  const key = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
  if (!key || key === "unrouted" || taken.some((d) => d.key === key)) return { ok: false, error: "Choose a name that is different enough from the existing departments" };
  const purpose = typeof a.purpose === "string" ? a.purpose.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  const respondWithin = typeof a.respondWithin === "string" && a.respondWithin.trim() ? a.respondWithin.replace(/\s+/g, " ").trim().slice(0, 60) : "1–2 business days";
  return { ok: true, department: { key, name, address, purpose: purpose || `Enquiries for ${name}`, respondWithin, custom: true, public: a.public === true, active: true } };
}

/** The department an incoming email was sent to, from its recipient addresses ("Name <addr>" is accepted). null when it was sent to none of ours. */
export function departmentOfAddresses(to: readonly string[]): Department | null {
  for (const raw of to) {
    const m = /<([^>]+)>/.exec(raw);
    const addr = (m ? m[1] : raw).trim().toLowerCase();
    const d = allDepartments().find((x) => x.address === addr);
    if (d) return d;
  }
  return null;
}

/** Who is told about a message for this department: the forward list if one is set, otherwise the department's own mailbox. */
export function notifyTargets(d: Department, env: NodeJS.ProcessEnv = process.env): string[] {
  const list = (env[`DEPT_FORWARD_${d.key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`] ?? "").split(",").map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return list.length ? list : [d.address];
}
