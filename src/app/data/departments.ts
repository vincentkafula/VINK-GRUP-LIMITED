/**
 * VINK's departments and their public email addresses: the one list the website uses.
 * The server keeps the same list (server/src/config/departments.ts) to route messages; a test fails if the two differ.
 * departments.test.ts also fails if a page shows a @vink.co.za address that is not in this list.
 */
export interface Department {
  key: string;
  name: string;
  address: string;
  purpose: string;
  respondWithin: string;
}

export const DEPARTMENTS: Department[] = [
  { key: "support", name: "Customer Support", address: "support@vink.co.za", purpose: "Help with your wallet, card, account or the app", respondWithin: "1–2 business days" },
  { key: "general", name: "General Enquiries", address: "info@vink.co.za", purpose: "Any other question about VINK", respondWithin: "1–2 business days" },
  { key: "compliance", name: "Compliance", address: "compliance@vink.co.za", purpose: "Regulatory and compliance enquiries, and reporting a concern", respondWithin: "1–2 business days" },
  { key: "privacy", name: "Privacy and Information Officer", address: "privacy@vink.co.za", purpose: "Access, correct or delete your personal information (POPIA)", respondWithin: "1–2 business days" },
  { key: "careers", name: "Careers", address: "careers@vink.co.za", purpose: "Jobs at VINK", respondWithin: "1–2 business days" },
  { key: "internships", name: "Internship Programme", address: "intern@vink.co.za", purpose: "Internships and graduate placements", respondWithin: "1–2 business days" },
  { key: "sponsorships", name: "Sponsorships and Partnerships", address: "sponsorships@vink.co.za", purpose: "Sponsorship and partnership proposals", respondWithin: "1–2 business days" },
  { key: "media", name: "Media Relations", address: "media@vink.co.za", purpose: "Press and media requests", respondWithin: "1–2 business days" },
];

export const departmentByKey = (key: string): Department | undefined => DEPARTMENTS.find((d) => d.key === key);
export const emailOf = (key: string): string => departmentByKey(key)?.address ?? "info@vink.co.za";
