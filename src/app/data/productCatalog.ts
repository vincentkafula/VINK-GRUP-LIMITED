/**
 * Every product a visitor can apply for, by section. The application form lists the products of the section the visitor picks (Personal, Business or
 * Corporate), grouped as the product pages group them. The names are the ones on the product pages; productCatalog.test.ts checks that this list still
 * matches those pages, so a product added to a page cannot be missing from the form. (Insurance has no product page yet, so it is the one group the test does not compare.)
 */
export type Segment = "Personal" | "Business" | "Corporate";
export interface ProductGroup { group: string; products: string[] }

export const SEGMENTS: readonly Segment[] = ["Personal", "Business", "Corporate"];

export const CATALOG: Record<Segment, ProductGroup[]> = {
  Personal: [
    { group: "Accounts", products: ["Spark Account", "Anchor Account", "Momentum Account", "Horizon Account", "Summit Account", "Legacy Account"] },
    { group: "Insurance", products: ["Life Insurance", "Funeral Cover", "Vehicle Insurance"] },
    { group: "Credit cards", products: ["Pulse Card", "Nova Card", "Orbit Card", "Elevate Card", "Apex Card", "Vertex Card"] },
    { group: "Loans", products: ["LifeAdvance", "FlexiLoan", "HorizonLoan", "SwiftCash", "DreamFund", "ElevateLoan"] },
    { group: "Investments", products: ["NovaWealth", "HorizonPlus", "ProsperNest", "InfinityGrowth", "Evergreen Portfolio", "LegacyBuilder"] },
    { group: "Rewards", products: ["LifePerks", "SparkRewards", "NovaPoints", "ThriveClub", "ElevateRewards", "JourneyPoints"] },
  ],
  Business: [
    { group: "Accounts", products: ["Launch Business Account", "Forge Business Account", "Catalyst Business Account", "Pinnacle Business Account", "Empire Business Account", "Sovereign Business Account"] },
    { group: "Credit cards", products: ["VentureLine", "GrowthBridge", "CapitalFlow", "EnterpriseLift", "CommerceFlex", "PrimeLedger"] },
    { group: "Loans", products: ["VentureLoan", "GrowthCapital", "CommerceAdvance", "EnterpriseBoost", "MomentumFund", "ApexBusiness Loan"] },
    { group: "Investments", products: ["VentureFund", "CapitalForge", "EnterpriseYield", "ProsperEdge", "WealthAxis", "FutureReserve"] },
    { group: "Manage My Business", products: ["Quick Market Entry", "A People-First Approach", "Reduce Costs", "Services in 185+ Countries", "Unmatched Expertise", "No Long-Term Commitments"] },
    { group: "Start My Business", products: ["South Africa", "Zambia", "United States", "United Kingdom", "Germany", "Canada"].map((c) => `Register your business in ${c}`) },
  ],
  Corporate: [
    { group: "Accounts", products: ["Government Treasury Account", "Project Account", "Escrow / Disbursement Account", "Collections Account", "Contractor Account", "Foreign Currency Account"] },
    { group: "Solutions and credit", products: ["Sovereign Term Loan", "Project Finance Facility", "Bridge Facility", "Equipment Term Loan", "Equipment Finance Lease", "Revolving Equipment Credit Line", "Guarantees and Performance Bonds"] },
    { group: "Loans", products: ["Road Development", "Railway Development", "Schools", "Hospitals and Clinics", "Universities", "Housing Development", "Agriculture", "Road Construction Machinery", "Housing Construction Machinery", "Agricultural Machinery"] },
  ],
};

/** A select value that names both the group and the product, so the same product name in two groups can never be confused. */
export const productValue = (group: string, product: string) => `${group}::${product}`;
export const splitProduct = (value: string): { group: string; product: string } | null => {
  const i = value.indexOf("::"); return i < 0 ? null : { group: value.slice(0, i), product: value.slice(i + 2) };
};
export const allProducts = (s: Segment) => CATALOG[s].flatMap((g) => g.products.map((p) => ({ group: g.group, product: p })));
