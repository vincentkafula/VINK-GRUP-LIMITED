import { PricingViewer } from "./PricingViewer";

const ROW1 = [
  { name: "Student Card",               price: "R0",   features: ["Credit limit R1,000–R5,000", "No annual fee", "Credit-builder reporting to all 4 bureaux", "Free online statements", "0.5% cashback on study and grocery spend"] },
  { name: "Secure Card",                price: "R0",   features: ["Secured by a deposit you choose", "No annual fee", "Upgrade to unsecured after 12 months of on-time payments", "Reports to all credit bureaux", "Free replacement card"] },
  { name: "Co-Branded Card (VMS × PnP)", price: "R85", features: ["Earn 1 Smart Shopper point per R5 spent at Pick n Pay", "0.5% cashback everywhere else", "R0 transaction fees at PnP tills", "Exclusive monthly bonus offers"] },
];

const ROW2 = [
  {
    name: "Investment Credit Card", price: "R170",
    features: [
      "1% of every purchase credited to a linked unit trust",
      "Quarterly investment statements",
      "Linked to Allan Gray or Coronation on request",
      "Travel insurance included",
    ],
  },
  {
    name: "Grain Credit Card", price: "R265", featured: true,
    features: [
      "Airport lounge access — 1,000+ lounges worldwide",
      "2% cashback on travel",
      "1% cashback on all other spend",
      "Credit limit up to R500,000",
      "Travel insurance and medical emergency cover",
      "Dedicated concierge service",
    ],
  },
  {
    name: "Animal Credit Card", price: "R415",
    features: [
      "R1,000,000 credit limit",
      "3% cashback on international spend",
      "Personal concierge 24/7",
      "Global medical emergency evacuation",
      "Earn up to 120,000 VinkPoints annually",
      "Virtual card for online security",
    ],
  },
];

interface Props { isOpen: boolean; onClose: () => void }

export function CreditCardViewer({ isOpen, onClose }: Props) {
  return (
    <PricingViewer
      isOpen={isOpen}
      onClose={onClose}
      activeSubNav="Credit Card"
      heroTitle="Credit That Works as Hard as You Do"
      heroSub="Build credit, earn rewards, or travel in style — find the Vink credit card made for your life stage."
      row1={ROW1}
      row2={ROW2}
    />
  );
}
