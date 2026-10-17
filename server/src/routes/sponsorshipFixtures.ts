// Shared sample data for the sponsorship tests: one good application and a few real-looking files.
import type { UploadedFile } from "../services/sponsorshipUtil.js";

export const pdf = (tag = "") => Buffer.from(`%PDF-1.4\n% a test document ${tag}\n%%EOF`);
export const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png body")]);
export const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("zip body \u00ff\u0000\u0010")]);
export const file = (kind: string, name: string, data: Buffer): UploadedFile => ({ kind, filename: name, data });
export const ngoDocs = (): UploadedFile[] => [file("proposal", "proposal.pdf", pdf("p")), file("registration", "npo certificate.pdf", pdf("r")), file("budget", "budget.xlsx", zip())];

export const good = {
  orgType: "ngo", applicantName: "Thandi Nkosi", organisation: "Khayelitsha Youth Hub", registrationNumber: "NPO 123-456", contactPerson: "Thandi Nkosi", email: "Thandi@Example.com", phone: "082 000 0000",
  physicalAddress: "12 Lingelethu Road, Khayelitsha", postalAddress: "", country: "South Africa", province: "Western Cape", city: "Cape Town", website: "https://youthhub.example", socialLinks: "",
  taxStatus: "exempt", taxNumber: "930012345",
  category: "youth",
  projectTitle: "Township Entrepreneurs Bootcamp", executiveSummary: "A twelve week business skills programme for sixty young people in Khayelitsha, ending with a pitch day judged by local business owners.",
  background: "Youth unemployment in our area is above sixty percent. Our objective is to give young people practical skills to start small businesses.",
  problem: "Young people leave school without any practical business training and have no access to mentors or start-up capital.",
  targetAudience: "Unemployed young people aged 18 to 25", geographicArea: "Khayelitsha, Cape Town", beneficiaries: 60, startDate: "2026-11-01", endDate: "2026-12-15",
  implementationPlan: "Weeks one to four cover basics. Weeks five to eight are mentored practice. Weeks nine to twelve are pitch preparation and the pitch day.",
  outcomes: "Sixty participants complete the programme and at least twenty start a business within six months, tracked by follow-up surveys.",
  whyVink: "VINK serves the taxi industry that our participants and their families depend on every day.",
  alignment: "The programme supports township economic development, one of VINK's published focus areas.",
  currency: "ZAR", totalBudget: 80000, amountRequested: 50000, ownContribution: 20000, otherSponsorsAmount: 10000, otherSponsorsNotes: "Local ward committee",
  expenditure: [{ description: "Facilitators", amount: 45000 }, { description: "Venue and materials", amount: 25000 }, { description: "Pitch day", amount: 10000 }],
  requestedItems: "", financialControls: "Two signatories on every payment, monthly reports to the board, and an independent examiner.",
  benefits: ["logo", "social"], benefitsValue: "Logo on all materials and about four thousand people reached through our social channels.",
  consent: { accuracy: true, authorised: true, terms: true, processing: true },
};
