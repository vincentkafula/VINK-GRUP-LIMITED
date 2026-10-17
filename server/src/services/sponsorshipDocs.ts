import PDFDocument from "pdfkit";

/**
 * The award letter and the sponsorship agreement, as PDFs.
 *
 * The letter tells the applicant what they have been awarded. The agreement is a TEMPLATE: it sets out the parties, the project, the amount, the schedule, what the
 * recipient provides in return, and the reporting, with places to sign. It does not contain legal clauses (liability, intellectual property, termination and so
 * on): VINK's legal advisers must add and review those before anyone signs, and every page of the agreement says so.
 * Fonts are the standard PDF ones, so letters outside Western European alphabets will not print correctly.
 */
export interface AwardDocData {
  ref: string; issuedOn: string; organisation: string; applicantName: string; contactPerson: string; email: string; projectTitle: string; startDate: string; endDate: string; location: string;
  amount: number; currency: string; conditions: string | null; milestones: { title: string; dueDate: string | null }[]; benefits: string[]; benefitsValue: string;
  department: { name: string; address: string }; headOffice: string;
}
const RED = "#C8102E", INK = "#101828", MUTED = "#475467";
const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (s: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "No date set");

function render(build: (doc: InstanceType<typeof PDFDocument>) => void, o: { compress: boolean; footer: (page: number, pages: number) => string; title: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, compress: o.compress, bufferPages: true, info: { Title: o.title, Author: "VINK" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    build(doc);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;                                  // the footer sits inside the bottom margin: without this pdfkit starts a blank page for it
      doc.font("Helvetica", 8).fillColor(MUTED).text(o.footer(i + 1, range.count), 56, doc.page.height - 40, { width: doc.page.width - 112, align: "center" });
    }
    doc.end();
  });
}
const head = (doc: InstanceType<typeof PDFDocument>, d: AwardDocData, title: string) => {
  doc.font("Helvetica-Bold", 26).fillColor(RED).text("VINK", { continued: true }).font("Helvetica", 10).fillColor(MUTED).text(`   ${d.department.name}`);
  doc.moveDown(0.2).font("Helvetica", 9).text(d.headOffice).text(d.department.address);
  doc.moveDown(0.6).strokeColor(RED).lineWidth(2).moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).stroke();
  doc.moveDown(1).font("Helvetica-Bold", 17).fillColor(INK).text(title);
  doc.moveDown(0.3).font("Helvetica", 10).fillColor(MUTED).text(`Reference ${d.ref}   ·   ${dateText(d.issuedOn)}`);
  doc.moveDown(1);
};
const h2 = (doc: InstanceType<typeof PDFDocument>, t: string) => { doc.moveDown(0.8).font("Helvetica-Bold", 11.5).fillColor(INK).text(t).moveDown(0.25).font("Helvetica", 10.5).fillColor(INK); };
const para = (doc: InstanceType<typeof PDFDocument>, t: string) => doc.font("Helvetica", 10.5).fillColor(INK).text(t, { lineGap: 2 });
const rows = (doc: InstanceType<typeof PDFDocument>, r: [string, string][]) => { for (const [k, v] of r) { doc.font("Helvetica-Bold", 10).fillColor(MUTED).text(k, { continued: true }).font("Helvetica", 10.5).fillColor(INK).text(`  ${v}`, { lineGap: 2 }); } };
const bullets = (doc: InstanceType<typeof PDFDocument>, items: string[]) => { for (const i of items) doc.font("Helvetica", 10.5).fillColor(INK).text(`•  ${i}`, { indent: 12, lineGap: 2 }); };
const schedule = (doc: InstanceType<typeof PDFDocument>, d: AwardDocData) => {
  if (!d.milestones.length) { para(doc, "No milestones have been set. VINK and the recipient will agree them in writing."); return; }
  bullets(doc, d.milestones.map((m) => `${m.title}: ${dateText(m.dueDate)}`));
};

export async function awardLetterPdf(d: AwardDocData, o: { compress?: boolean } = {}): Promise<Buffer> {
  return render((doc) => {
    head(doc, d, "Sponsorship award");
    para(doc, `Dear ${d.contactPerson},`); doc.moveDown(0.6);
    para(doc, `We are pleased to tell ${d.organisation} that VINK has approved a sponsorship for "${d.projectTitle}".`);
    h2(doc, "The award");
    rows(doc, [["Amount awarded:", fmt(d.amount, d.currency)], ["Project dates:", `${dateText(d.startDate)} to ${dateText(d.endDate)}`], ["Where:", d.location]]);
    if (d.conditions) { h2(doc, "Conditions"); para(doc, d.conditions); }
    h2(doc, "Milestones and dates"); schedule(doc, d);
    h2(doc, "What happens next");
    para(doc, "The sponsorship agreement is sent with this letter. Please read it, sign it and return it to us. Payments are made after the agreement is signed. When the project is finished we ask for a final report on what was delivered, who benefited and how the money was spent.");
    doc.moveDown(1.2); para(doc, "Yours sincerely"); doc.moveDown(0.3).font("Helvetica-Bold", 10.5).text(d.department.name);
  }, { compress: o.compress ?? true, title: `Sponsorship award ${d.ref}`, footer: (p, n) => `Reference ${d.ref}   ·   Page ${p} of ${n}` });
}

export async function agreementPdf(d: AwardDocData, o: { compress?: boolean } = {}): Promise<Buffer> {
  return render((doc) => {
    head(doc, d, "Sponsorship agreement");
    para(doc, "DRAFT TEMPLATE: VINK's legal advisers must review this agreement and add VINK's legal terms before it is signed.");
    h2(doc, "1. The parties");
    rows(doc, [["Sponsor:", `VINK (${d.department.name}), ${d.headOffice}`], ["Recipient:", `${d.organisation}, represented by ${d.contactPerson} (${d.email})`]]);
    h2(doc, "2. The project");
    rows(doc, [["Project:", d.projectTitle], ["Dates:", `${dateText(d.startDate)} to ${dateText(d.endDate)}`], ["Where:", d.location]]);
    h2(doc, "3. The sponsorship");
    para(doc, `VINK sponsors the project with ${fmt(d.amount, d.currency)}. VINK pays after this agreement is signed, and records each payment against it.`);
    if (d.conditions) { doc.moveDown(0.4); para(doc, `Conditions: ${d.conditions}`); }
    h2(doc, "4. Milestones and dates"); schedule(doc, d);
    h2(doc, "5. What the recipient provides in return");
    if (d.benefits.length) bullets(doc, d.benefits); else para(doc, "As agreed in writing.");
    if (d.benefitsValue) { doc.moveDown(0.4); para(doc, `The recipient described the value of this partnership as: ${d.benefitsValue}`); }
    h2(doc, "6. Use of the money and reporting");
    para(doc, "The recipient uses the sponsorship only for the project named above. When the project is finished the recipient sends VINK a final report on the people reached, what was delivered, what was achieved and how the money was spent, with evidence. VINK may ask for information about the project at any time.");
    h2(doc, "7. Changes");
    para(doc, "Any change to this agreement, including its amount, dates or purpose, must be agreed in writing by both parties.");
    h2(doc, "8. Legal terms");
    para(doc, "[To be added by VINK's legal advisers.]");
    doc.moveDown(1.6);
    const y = doc.y, w = (doc.page.width - 112 - 40) / 2;
    doc.strokeColor(MUTED).lineWidth(0.8).moveTo(56, y + 36).lineTo(56 + w, y + 36).stroke().moveTo(56 + w + 40, y + 36).lineTo(doc.page.width - 56, y + 36).stroke();
    doc.font("Helvetica", 9).fillColor(MUTED).text("For VINK: name, signature and date", 56, y + 42, { width: w }).text("For the recipient: name, signature and date", 56 + w + 40, y + 42, { width: w });
  }, { compress: o.compress ?? true, title: `Sponsorship agreement ${d.ref}`, footer: (p, n) => `Reference ${d.ref}   ·   Page ${p} of ${n}   ·   DRAFT TEMPLATE: to be reviewed by VINK's legal advisers before signing` });
}
