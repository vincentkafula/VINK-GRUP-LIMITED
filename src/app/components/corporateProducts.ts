/**
 * What the Corporate Banking pages show: the banking accounts, credit facilities and loans for governments and
 * the public institutions that deliver national infrastructure. The names of the three pages (Account, Solutions &
 * Credit Cards, Loan) do not change; the cards on them come from here. All figures are indicative, as the notice says.
 */

export interface DetailGroup { head: string; items: string[]; ordered?: boolean }
export interface CardData {
  name: string; price?: string; featured?: boolean; features: string[];
  tagline?: string; overview?: string; idealFor?: string[]; inheritsFrom?: string;
  /** shown on the card instead of a monthly fee, for products that are priced by term sheet */
  stat?: { label: string; value: string };
  /** the extra sections of the "see details" panel */
  groups?: DetailGroup[];
  note?: string;
}
export interface Section { label: string; cards: CardData[] }
export type CorpCategory = "account" | "solutions" | "loan";

export const IMPORTANT_NOTICE = "All products are subject to credit approval, due diligence and the terms of the facility agreement. Information on this website, including rates, fees, tenors and eligibility, is indicative, is not an offer or commitment to lend, and may change without notice. Lending to governments and public institutions is subject to the borrower's legal authority to borrow and applicable sanctions and anti-money-laundering requirements.";
const TERMS_NOTE = "Terms are indicative and set by the Credit Committee for each borrower and asset.";

// ─── Accounts ────────────────────────────────────────────────────────────────────────────────────
const ACCOUNT_FEATURES: DetailGroup = {
  head: "Account features",
  items: [
    "Role-based access with maker–checker approvals and configurable payment limits",
    "Real-time balances, SWIFT and local clearing payments, bulk payroll and supplier payments",
    "Statements and reports in PDF, Excel and API formats for auditors and treasury teams",
    "Direct link between accounts and credit facilities, so drawdowns and repayments are visible in one place",
    "Optional sweep and liquidity arrangements across a ministry's accounts",
  ],
};
const GOV_DOCS: DetailGroup = {
  head: "Documents required: government bodies",
  ordered: true,
  items: [
    "Letter of request on official letterhead, signed by the Accounting Officer or equivalent",
    "Authority to open the account (ministerial instruction, cabinet or finance ministry approval)",
    "Enabling legislation or establishment instrument for agencies and enterprises",
    "Signatory list with specimen signatures and signing mandates",
    "Certified identification for each signatory and authorised user",
    "Proof of official address",
    "Beneficial ownership or controlling-authority declaration where applicable",
  ],
};
const CONTRACTOR_DOCS: DetailGroup = {
  head: "Documents required: contractors and suppliers (additional)",
  ordered: true,
  items: [
    "Certificate of incorporation, tax clearance and company registry extract",
    "Directors' and beneficial owners' identification",
    "Signed government contract or letter of award",
    "Audited financial statements for the last two years",
  ],
};
const OPEN_STEPS: DetailGroup = {
  head: "How to open an account",
  ordered: true,
  items: [
    "Register: complete the online enquiry with your organisation and project details",
    "Consultation: a relationship manager contacts you within 2 business days",
    "Submit documents: upload them securely through the portal",
    "Due diligence: we complete identity, authority and compliance checks",
    "Account activation: you receive account details, portal credentials and signatory training",
  ],
};
const OPEN_TIME = { label: "Indicative timeline from complete documents", value: "5 to 10 business days" };

// ─── Credit ──────────────────────────────────────────────────────────────────────────────────────
const PRICING: DetailGroup = {
  head: "Pricing",
  items: [
    "A published reference rate plus a margin reflecting country risk, tenor, currency and security",
    "Fees may include an arrangement fee, a commitment fee on undrawn amounts, and an agency or monitoring fee",
    "A full indicative term sheet is provided before you apply",
  ],
};
const CURRENCIES: DetailGroup = { head: "Currencies", items: ["US dollar, euro and selected local currencies, subject to availability and hedging arrangements"] };
const SECURITY: DetailGroup = {
  head: "Security and credit support",
  items: [
    "Sovereign guarantee or direct sovereign obligation, as applicable",
    "Pledge of financed equipment, with registration of the bank's interest",
    "Assignment of project receivables or dedicated revenue streams",
    "Debt service reserve or escrow account held with us",
    "Insurance over financed assets and delivery risk",
  ],
};
const DISBURSEMENT: DetailGroup = {
  head: "How facilities are disbursed",
  items: [
    "Funds are drawn into your project account in stages",
    "Equipment suppliers are paid directly against delivery and inspection documents",
    "Civil-works payments are released against certified milestones",
    "Statements and drawdown reports are available in the client portal",
  ],
};
const REPAYMENT: DetailGroup = { head: "Repayment", items: ["Repayments follow an agreed schedule (monthly, quarterly or semi-annual) from an account you designate. Early repayment options and any grace period are set out in the facility agreement."] };
const BENEFITS: DetailGroup = {
  head: "Benefits",
  items: [
    "Single institution for accounts, credit and equipment delivery",
    "Facilities matched to the life of the asset or project",
    "Clear drawdown, reporting and audit trail",
    "Debt-sustainability review built into structuring",
  ],
};
const APPLY_STEPS: DetailGroup = {
  head: "How to apply",
  ordered: true,
  items: [
    "Initial enquiry: tell us about your organisation, project and financing need. We respond within 2 business days",
    "Eligibility and scoping: we confirm the borrower, the project and the structure, and issue an indicative term sheet",
    "Formal application: submit the application form and supporting documents through the secure portal",
    "Due diligence and credit assessment: we review the borrower, project, procurement, repayment capacity and debt sustainability",
    "Approval and documentation: the Credit Committee decides; if approved, we issue the facility agreement",
    "Signing and disbursement: once conditions are met, funds go to your project account or to approved suppliers",
  ],
};
const APPLY_TIME = "Indicative timeline from complete application to credit decision: 6 to 12 weeks, depending on facility size and the borrower's approvals.";
const CREDIT_COMMON = [PRICING, CURRENCIES, SECURITY, DISBURSEMENT, REPAYMENT, BENEFITS, APPLY_STEPS];

// ─── Equipment ───────────────────────────────────────────────────────────────────────────────────
const STRUCTURES: DetailGroup = {
  head: "Financing structures",
  items: [
    "Term loan to government: the borrower buys the equipment and repays from budget or agency revenue",
    "Finance lease: the bank buys the equipment and leases it to the borrower, transferring ownership at the end of the term",
    "Revolving equipment credit line: a pre-approved limit drawn down as each batch of machinery is ordered",
    "Supplier-direct payment: the bank pays the approved supplier on delivery documents",
    "Bundled facility: equipment, spare parts, operator training and a maintenance contract in one facility",
  ],
};
const EQUIP_INCLUDES: DetailGroup = {
  head: "What every equipment facility includes",
  items: [
    "Asset registration and serial-number tracking",
    "Insurance in the bank's favour during delivery and use",
    "Pre-shipment inspection and delivery confirmation before disbursement",
    "Warranty and after-sales service requirements in the supply contract",
    "A project account for drawdowns, supplier payments and statements",
  ],
};
const EQUIP_STEPS: DetailGroup = {
  head: "How to request equipment financing",
  ordered: true,
  items: [
    "Tell us your programme: equipment type, quantity, locations and timeline",
    "Submit the approved budget, procurement plan and any supplier quotations",
    "We confirm structure, pricing and security",
    "Procurement proceeds under your national rules; we pay on documented delivery",
  ],
};
const SECTOR_STAT = { label: "We can fund", value: "Works and machinery" };

export const SECTIONS: Record<CorpCategory, Section[]> = {
  account: [
    {
      label: "Accounts for public funds",
      cards: [
        {
          name: "Government Treasury Account",
          features: ["Multi-currency: local currency, USD and EUR", "Dual authorisation", "Daily balance reporting"],
          tagline: "Secure, traceable and ready for large-value payments.",
          overview: "For ministries, departments and agencies. Open the accounts you need to receive loan proceeds, pay contractors and suppliers, and report on every transaction. Each account has a dedicated relationship manager and a secure client portal login.",
          idealFor: ["Ministries", "Departments", "Agencies"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, GOV_DOCS, OPEN_STEPS],
        },
        {
          name: "Project Account", featured: true,
          features: ["Ring-fenced funds", "Drawdown tracking", "Payment only against approved budget lines"],
          tagline: "Every drawdown and payment on one named programme, on record.",
          overview: "A ring-fenced account for a single named infrastructure or equipment programme. It holds loan proceeds separately from other funds and gives auditors and oversight bodies a complete record of drawdowns and payments.",
          idealFor: ["A single named infrastructure programme", "A single named equipment programme"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, GOV_DOCS, OPEN_STEPS],
        },
        {
          name: "Escrow / Disbursement Account",
          features: ["Funds released on documented milestones", "Audit-ready statements"],
          tagline: "Funds released against verified delivery, not in advance.",
          overview: "For milestone-based payments to contractors and suppliers. Money moves only when the documents say the work or delivery is done, and every release is on the statement.",
          idealFor: ["Milestone-based payments to contractors", "Milestone-based payments to suppliers"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, GOV_DOCS, OPEN_STEPS],
        },
        {
          name: "Collections Account",
          features: ["Reconciliation file", "Bulk-payment support", "Daily sweep options"],
          tagline: "Tolls, fees, levies and repayments, collected and reconciled.",
          overview: "For agencies receiving tolls, fees, levies or programme repayments. Incoming funds are reconciled daily and can be swept to your treasury or project account.",
          idealFor: ["Agencies receiving tolls", "Agencies receiving fees and levies", "Programme repayments"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, GOV_DOCS, OPEN_STEPS],
        },
        {
          name: "Contractor Account",
          features: ["Receivables tracking", "Link to guarantees and advance-payment facilities"],
          tagline: "For the contractors and suppliers who deliver government projects.",
          overview: "For contractors and suppliers delivering government projects. Track what you are owed and connect the account to the guarantees and advance-payment facilities on your contract.",
          idealFor: ["Contractors with a signed government contract", "Suppliers on government projects"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, CONTRACTOR_DOCS, OPEN_STEPS],
        },
        {
          name: "Foreign Currency Account",
          features: ["Multi-currency", "Cross-border transfers", "FX dealing desk"],
          tagline: "Import payments for machinery and materials.",
          overview: "Pay for imported machinery and materials in the currency the supplier invoices in, with cross-border transfers and access to our FX dealing desk.",
          idealFor: ["Import payments for machinery", "Import payments for materials"],
          stat: OPEN_TIME, groups: [ACCOUNT_FEATURES, GOV_DOCS, OPEN_STEPS],
        },
      ],
    },
  ],

  solutions: [
    {
      label: "Sovereign and project credit",
      cards: [
        {
          name: "Sovereign Term Loan",
          features: ["Funds national capital programmes: roads, rail, schools, hospitals, universities, housing", "Borrower: government, via the Ministry of Finance"],
          tagline: "Long-term credit for governments, sized to your capital programme.",
          overview: "Funding for national capital programmes. Each facility is linked to a project account, so every disbursement and repayment is visible and auditable.",
          idealFor: ["National governments, via the Ministry of Finance"],
          stat: { label: "Indicative tenor", value: "7 to 15 years, with grace period" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Project Finance Facility",
          features: ["Revenue-generating infrastructure such as toll roads and rail", "Borrower: special-purpose vehicle or state-owned enterprise"],
          tagline: "Finance for infrastructure that earns its own repayment.",
          overview: "Project-grade credit for revenue-generating infrastructure such as toll roads and rail, linked to a project account so every drawdown and repayment is visible.",
          idealFor: ["Special-purpose vehicles", "State-owned enterprises"],
          stat: { label: "Indicative tenor", value: "10 to 20 years" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Bridge Facility",
          features: ["Short-term funding ahead of budget releases or donor disbursements", "Borrower: government or agency"],
          tagline: "Keep the programme moving until the money arrives.",
          overview: "Short-term funding ahead of budget releases or donor disbursements, so works and deliveries do not stop while approvals are completed.",
          idealFor: ["Governments", "Agencies"],
          stat: { label: "Indicative tenor", value: "Up to 24 months" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
      ],
    },
    {
      label: "Equipment and contractor credit",
      cards: [
        {
          name: "Equipment Term Loan",
          features: ["Buys road, housing or agricultural machinery", "Borrower: government, agency or state-owned enterprise"],
          tagline: "The borrower owns the machinery; the bank holds a security interest.",
          overview: "A loan to buy road construction, housing construction or agricultural machinery. The borrower purchases the equipment and repays from budget or agency revenue.",
          idealFor: ["Governments", "Agencies", "State-owned enterprises"],
          stat: { label: "Indicative tenor", value: "4 to 10 years" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Equipment Finance Lease", featured: true,
          features: ["Machinery acquired by the bank and leased to the borrower", "Borrower: agency, municipality or state-owned enterprise"],
          tagline: "Ownership passes to you at the end of the term.",
          overview: "The bank buys the equipment and leases it to the borrower, transferring ownership at the end of the term.",
          idealFor: ["Agencies", "Municipalities", "State-owned enterprises"],
          stat: { label: "Indicative tenor", value: "4 to 8 years" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Revolving Equipment Credit Line",
          features: ["Multi-year fleet programmes drawn in tranches", "Borrower: government or agency"],
          tagline: "A pre-approved limit, drawn as each batch is ordered.",
          overview: "A pre-approved limit drawn down as each batch of machinery is ordered, ideal for multi-year fleet programmes.",
          idealFor: ["Governments", "Agencies"],
          stat: { label: "Indicative tenor", value: "Up to 5 years, renewable" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Guarantees and Performance Bonds",
          features: ["Supports contractors on government contracts", "Borrower: contractor"],
          tagline: "Back the contractors who deliver your projects.",
          overview: "Performance and advance-payment guarantees that support contractors on government contracts, linked to the contractor's account with us.",
          idealFor: ["Contractors on government contracts"],
          stat: { label: "Indicative tenor", value: "Matched to contract" },
          groups: CREDIT_COMMON, note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
      ],
    },
  ],

  loan: [
    {
      label: "Public infrastructure loans: sectors we finance",
      cards: [
        {
          name: "Road Development",
          features: ["National highways, regional and rural roads, bridges and drainage", "Rehabilitation and new construction"],
          tagline: "From the first kilometre of road.",
          overview: "We finance rehabilitation and new construction programmes for national highways, regional roads, rural access roads, bridges and drainage, and the plant fleets that road agencies use to build and maintain them.",
          idealFor: ["Roads agencies", "Ministries of works and transport", "Municipalities"],
          stat: SECTOR_STAT,
          groups: [{ head: "Typical equipment", items: ["Motor graders", "Excavators", "Bulldozers", "Compactors", "Pavers", "Asphalt plants", "Crushers", "Tipper trucks"] }, APPLY_STEPS],
          note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Railway Development",
          features: ["New lines, rehabilitation, freight corridors", "Urban transit and station works"],
          tagline: "Rail capacity, financed from track to station.",
          overview: "We support rail authorities and state-owned operators with project finance and track-laying and civil-works plant, for new lines, rehabilitation, freight corridors, urban transit and station works.",
          idealFor: ["Rail authorities", "State-owned operators"],
          stat: SECTOR_STAT,
          groups: [{ head: "Typical equipment", items: ["Track-laying and tamping machines", "Cranes", "Excavators", "Loaders", "Ballast and concrete equipment"] }, APPLY_STEPS],
          note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Schools",
          features: ["Primary, secondary and technical schools", "Classrooms, laboratories, boarding and sanitation"],
          tagline: "To the last classroom desk.",
          overview: "We finance standardised school-building programmes delivered at scale: classrooms, laboratories, boarding facilities and sanitation for primary, secondary and technical schools.",
          idealFor: ["Ministries of education", "Municipalities", "Public school programmes"],
          stat: SECTOR_STAT, groups: [APPLY_STEPS], note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Hospitals and Clinics", featured: true,
          features: ["District and referral hospitals, rural clinics", "Staff housing"],
          tagline: "Built on schedule, with the plant to build them.",
          overview: "We fund the construction of district hospitals, referral hospitals, rural clinics and staff housing, and the construction plant needed to build them on schedule.",
          idealFor: ["Ministries of health", "Public hospitals", "Municipalities"],
          stat: SECTOR_STAT, groups: [APPLY_STEPS], note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Universities",
          features: ["Lecture halls, laboratories, libraries", "Student accommodation and campus infrastructure"],
          tagline: "Campus infrastructure for public universities.",
          overview: "Lecture halls, laboratories, libraries, student accommodation and campus infrastructure for public universities and technical institutions.",
          idealFor: ["Public universities", "Technical institutions"],
          stat: SECTOR_STAT, groups: [APPLY_STEPS], note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Housing Development",
          features: ["Affordable and social housing", "Site servicing and urban renewal"],
          tagline: "Programme-level credit and the machinery to build homes.",
          overview: "We finance housing-construction machinery and programme-level credit for housing agencies and municipalities, covering affordable and social housing, site servicing and urban renewal.",
          idealFor: ["Housing agencies", "Municipalities"],
          stat: SECTOR_STAT,
          groups: [{ head: "Typical equipment", items: ["Tower and mobile cranes", "Concrete batching plants and mixers", "Block-making machines", "Loaders and backhoes", "Scaffolding and formwork systems"] }, APPLY_STEPS],
          note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Agriculture",
          features: ["Mechanisation programmes and irrigation works", "Storage and farm-to-market roads"],
          tagline: "Tractor and implement fleets for government mechanisation schemes.",
          overview: "We finance tractor and implement fleets for government mechanisation schemes, as well as irrigation works, storage and farm-to-market roads.",
          idealFor: ["Ministries of agriculture", "Mechanisation agencies"],
          stat: SECTOR_STAT,
          groups: [{ head: "Typical equipment", items: ["Tractors", "Ploughs", "Planters", "Harvesters", "Irrigation machinery"] }, APPLY_STEPS],
          note: APPLY_TIME + " " + IMPORTANT_NOTICE,
        },
      ],
    },
    {
      label: "Equipment financing programmes",
      cards: [
        {
          name: "Road Construction Machinery",
          features: ["Excavators, bulldozers, motor graders, wheel loaders, compactors, pavers", "Asphalt and concrete plants, crushers, tipper trucks"],
          tagline: "Machinery for national development, financed directly to government.",
          overview: "The equipment is supplied by approved manufacturers and dealers, delivered to your project site, and financed over a term matched to its working life.",
          idealFor: ["Roads agencies", "Ministries of works and transport", "Municipalities"],
          stat: { label: "Indicative term", value: "5 to 10 years" },
          groups: [
            { head: "Equipment categories", items: ["Excavators, bulldozers, motor graders, wheel loaders, backhoe loaders", "Soil and asphalt compactors, pavers", "Asphalt and concrete plants, crushers and screens", "Dump and tipper trucks, water bowsers, low-loaders, bitumen distributors"] },
            STRUCTURES, EQUIP_INCLUDES, EQUIP_STEPS,
          ],
          note: TERMS_NOTE + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Housing Construction Machinery",
          features: ["Tower and mobile cranes, concrete batching plants, transit mixers", "Block and paving-stone machines, loaders, generators"],
          tagline: "Everything a housing programme needs on site.",
          overview: "The equipment is supplied by approved manufacturers and dealers, delivered to your project site, and financed over a term matched to its working life.",
          idealFor: ["Housing agencies", "Municipalities", "Public universities", "State developers"],
          stat: { label: "Indicative term", value: "4 to 8 years" },
          groups: [
            { head: "Equipment categories", items: ["Tower and mobile cranes", "Concrete batching plants, transit mixers and concrete pumps", "Block and paving-stone machines", "Loaders, mini-excavators and telehandlers", "Scaffolding, formwork and prefabrication equipment, generators"] },
            STRUCTURES, EQUIP_INCLUDES, EQUIP_STEPS,
          ],
          note: TERMS_NOTE + " " + IMPORTANT_NOTICE,
        },
        {
          name: "Agricultural Machinery",
          features: ["Tractors, ploughs, harrows, planters and seeders", "Combine harvesters, sprayers, irrigation pumps and pivots"],
          tagline: "Mechanisation for government farming schemes.",
          overview: "The equipment is supplied by approved manufacturers and dealers, delivered to your project site, and financed over a term matched to its working life.",
          idealFor: ["Ministries of agriculture", "Mechanisation agencies", "State farms", "Cooperatives under government schemes"],
          stat: { label: "Indicative term", value: "5 to 10 years" },
          groups: [
            { head: "Equipment categories", items: ["Tractors, ploughs, harrows", "Planters and seeders, combine harvesters, sprayers", "Irrigation pumps and pivots", "Balers, grain dryers and storage equipment, farm trailers"] },
            STRUCTURES, EQUIP_INCLUDES, EQUIP_STEPS,
          ],
          note: TERMS_NOTE + " " + IMPORTANT_NOTICE,
        },
      ],
    },
  ],
};
