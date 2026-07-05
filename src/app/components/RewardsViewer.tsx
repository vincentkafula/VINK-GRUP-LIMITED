import { PricingViewer } from "./PricingViewer";

const ROW1 = [
  { name: "Balance Transfer", price: "R0",   features: ["Transfer balances from other credit cards", "0% interest for 6 months on transferred balance", "3% transfer fee (minimum R50)"] },
  { name: "Cash Back",        price: "R0",   features: ["1% cashback on all spend", "Capped at R500/month", "Credited to your account on the last day of each month", "No minimum spend required"] },
  { name: "Fuel Rewards",     price: "R85",  features: ["Earn 8c per litre at Engen, Shell, and Sasol", "Top-up bonus of 500 VinkPoints when you spend R500 in a single fuel transaction", "Monthly fuel rewards statement"] },
];

const ROW2 = [
  {
    name: "Retail Rewards", price: "R170",
    features: [
      "Earn double VinkPoints at Pick n Pay, Shoprite, Checkers, and Spar",
      "Redeem in-store or on the VMS app",
      "Selected independent retailers included",
    ],
  },
  {
    name: "Travel Rewards", price: "R265", featured: true,
    features: [
      "3× VinkPoints on flights and hotels",
      "Access to Bidvest Lounges at all major SA airports",
      "Travel insurance on bookings",
      "Airline partners: Comair and FlySafair",
    ],
  },
  {
    name: "Automotive Rewards", price: "R415",
    features: [
      "Earn VinkPoints at Tiger Wheel & Tyre, Supa Quick, and AutoZone",
      "Redeem for oil changes, tyres, and mechanical services",
      "Monthly automotive spend report",
    ],
  },
];

interface Props { isOpen: boolean; onClose: () => void }

export function RewardsViewer({ isOpen, onClose }: Props) {
  return (
    <PricingViewer
      isOpen={isOpen}
      onClose={onClose}
      activeSubNav="Rewards"
      heroTitle="VinkPoints — Rewards That Move With You"
      heroSub="Transparent Pricing for You"
      row1={ROW1}
      row2={ROW2}
    />
  );
}
