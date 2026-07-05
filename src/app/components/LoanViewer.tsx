import { PricingViewer } from "./PricingViewer";

const ROW1 = [
  { name: "Personal Loan",  price: "R0",  features: ["R1,000–R250,000 loan amount", "12–60 month repayment terms", "Interest rate 12.5%–24.5% p.a. based on credit profile", "Same-day approval for qualifying applicants"] },
  { name: "Home Loan",      price: "R0",  features: ["Up to 100% LTV for first-time buyers", "20-year term available", "Linked to prime rate", "First-home buyer subsidy guidance", "Free property valuation included"] },
  { name: "Student Loan",   price: "R85", features: ["Covers tuition, textbooks, and accommodation", "Repayment deferred until 6 months post-graduation", "Partner institutions: UCT, Stellenbosch, CPUT, UWC, all public universities"] },
];

const ROW2 = [
  {
    name: "Pension Backed Housing Loan", price: "R170",
    features: [
      "Use your retirement annuity or pension as collateral",
      "No credit check required",
      "Up to 90% of pension fund value",
      "Applicable to all registered pension funds in SA",
    ],
  },
  {
    name: "Vehicle Loan", price: "R265", featured: true,
    features: [
      "New and used vehicles financed",
      "Finance up to 100%",
      "Balloon payment option available",
      "Linked VMS vehicle insurance option",
      "Repayment terms 12–72 months",
    ],
  },
  {
    name: "Vehicle Leasing", price: "R415",
    features: [
      "Operating or finance lease available",
      "Maintenance, tyres, and licensing included",
      "Fixed monthly cost for easy budgeting",
      "Residual value guaranteed",
      "Ideal for personal and business use",
    ],
  },
];

interface Props { isOpen: boolean; onClose: () => void }

export function LoanViewer({ isOpen, onClose }: Props) {
  return (
    <PricingViewer
      isOpen={isOpen}
      onClose={onClose}
      activeSubNav="Loan"
      heroTitle="Finance Your Next Chapter"
      heroSub="Transparent Pricing for You"
      row1={ROW1}
      row2={ROW2}
    />
  );
}
