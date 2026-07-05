import { PricingViewer } from "./PricingViewer";

const ROW1 = [
  { name: "Clear Access Account",      price: "R0",   features: ["No minimum balance — ever", "Free Vink card included", "Instant transaction notifications via app and SMS", "Online and app banking", "No monthly fees — always free"] },
  { name: "Everyday Checking Account", price: "R0",   features: ["Free taxi fare payments via tap-and-go", "2 free ATM withdrawals/month at Nedbank", "Free airtime and electricity purchases in-app", "Debit order support", "Online banking included"] },
  { name: "Prime Checking Account",    price: "R85",  features: ["5 free ATM withdrawals/month", "Earn 0.5% cashback on all spend", "Overdraft facility up to R5,000", "Unlimited debit orders", "Dedicated phone support"] },
];

const ROW2 = [
  {
    name: "Premier Checking Account", price: "R170",
    features: [
      "10 free ATM withdrawals at any bank",
      "1% cashback on all spend",
      "R15,000 overdraft facility",
      "Travel notifications and international card use included",
      "Priority customer support",
    ],
  },
  {
    name: "Grain Account", price: "R265", featured: true,
    features: [
      "Unlimited ATM withdrawals",
      "1.5% cashback on all spend",
      "R30,000 overdraft facility",
      "Dedicated relationship manager",
      "Investment sub-account included",
      "International transfers to 60+ countries",
      "Premium Visa card",
    ],
  },
  {
    name: "Animal Account", price: "R415",
    features: [
      "Unlimited ATM and branch transactions",
      "2% cashback on all spend",
      "Private banking concierge",
      "R100,000 overdraft facility",
      "Multi-currency wallet",
      "Will and estate planning guidance",
      "Priority fraud resolution within 2 hours",
    ],
  },
];

interface Props { isOpen: boolean; onClose: () => void }

export function PersonalAccountViewer({ isOpen, onClose }: Props) {
  return (
    <PricingViewer
      isOpen={isOpen}
      onClose={onClose}
      activeSubNav="Account"
      heroTitle="The Right Account for Your Life"
      heroSub="From your first account to a full financial toolkit — VMS has the right fit at every stage."
      row1={ROW1}
      row2={ROW2}
    />
  );
}
