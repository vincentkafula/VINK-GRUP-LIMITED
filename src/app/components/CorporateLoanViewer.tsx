import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; }

const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"] as const;

interface Card {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}

interface Section {
  label: string;
  cards: Card[];
}

const SECTIONS: Section[] = [
  {
    label: "Infrastructure Construction Loans",
    cards: [
      {
        name: "Road Construction",
        price: "R0",
        features: ["Annual turnover: R0 to R1,5 million"],
      },
      {
        name: "School / University Construction",
        price: "R0",
        features: ["Annual turnover: R0 to R5 million"],
      },
      {
        name: "Shopping Malls Construction",
        price: "R85",
        features: ["Annual turnover: R0 to R500 million"],
      },
    ],
  },
  {
    label: "Development & Energy Loans",
    cards: [
      {
        name: "Hospital Construction",
        price: "R170",
        features: [
          "Annual turnover: R0 to R500 million",
          "Free Vms Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
          "Free Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Hotels Construction",
        price: "R265",
        featured: true,
        features: [
          "Annual turnover: R0 to R500 million",
          "35 electronic transactions",
          "10 cash deposits/withdrawals at any Vms ATM (capped at R50,000 per month)",
          "Suitable for all business segments and sectors",
          "Free Online Banking and NotifyMes",
          "Limited to Sole Proprietors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Solar Plant",
        price: "R415",
        features: [
          "Annual turnover: R0 to R500 million",
          "60 electronic transactions",
          "15 cash deposits/withdrawals at any Vms ATM (capped at R100,000 per month)",
          "Suitable for all business segments and sectors",
          "Free Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
    ],
  },
  {
    label: "Industry & Resources Loans",
    cards: [
      {
        name: "Water Purification",
        price: "R170",
        features: [
          "Annual turnover: R0 to R500 million",
          "Free Vms Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Mineral & Mining",
        price: "R265",
        features: [
          "Annual turnover: R0 to R500 million",
          "35 electronic transactions",
          "10 cash deposits/withdrawals at any Vms ATM (capped at R50,000 per month)",
          "Suitable for all business segments and sectors",
        ],
      },
      {
        name: "Manufacturing",
        price: "R415",
        features: [
          "Annual turnover: R0 to R500 million",
          "60 electronic transactions",
          "15 cash deposits/withdrawals at any Vms ATM (capped at R100,000 per month)",
          "Suitable for all business segments and sectors",
        ],
      },
    ],
  },
];

export function CorporateLoanViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#f5f5f7" }}>

      {/* Top Nav */}
      <header className="bg-white border-b flex items-center px-6 h-[52px] gap-8" style={{ borderColor: "#ddd" }}>
        <img src={vinkLogo} alt="VMS" className="h-8 w-auto object-contain" />
        <nav className="flex flex-1 h-full">
          {["Personal", "Business", "Corporate", "Marketplace"].map((item) => (
            <span
              key={item}
              className="px-4 h-full flex items-center text-sm cursor-default border-b-[3px]"
              style={item === "Corporate"
                ? { color: "#5B2D8E", borderColor: "#5B2D8E", fontWeight: 600 }
                : { color: "#222", borderColor: "transparent" }}
            >
              {item}
            </span>
          ))}
        </nav>
        <button
          onClick={onClose}
          className="ml-auto p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Sub Nav */}
      <nav className="flex px-6 overflow-x-auto" style={{ background: "#5B2D8E" }}>
        {CORPORATE_SUB_NAV.map((item) => (
          <span
            key={item}
            className="px-4 h-10 flex items-center text-sm whitespace-nowrap border-b-[3px] cursor-default"
            style={item === "Loan"
              ? { color: "#fff", borderColor: "#fff", fontWeight: 600 }
              : { color: "rgba(255,255,255,.8)", borderColor: "transparent" }}
          >
            {item}
          </span>
        ))}
        <span className="ml-auto px-4 h-10 flex items-center text-sm font-bold rounded cursor-default" style={{ background: "#F5A623", color: "#222" }}>
          Get Help
        </span>
      </nav>

      {/* Hero */}
      <section
        className="text-center px-4 py-12"
        style={{ background: "linear-gradient(135deg, #EDE7F6 0%, #fff 60%)" }}
      >
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#5B2D8E" }}>Plans that help you grow</h1>
        <p className="text-gray-500 text-sm">Transparent Pricing for You</p>
      </section>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <div key={section.label}>
          {/* Section label */}
          <div className="text-center py-7 px-4 text-base font-semibold" style={{ color: "#3d1d63" }}>
            {section.label}
          </div>

          {/* Cards grid */}
          <div className="grid gap-5 max-w-5xl mx-auto px-6 pb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {section.cards.map((card) => (
              <div
                key={card.name}
                className="rounded-xl border flex flex-col p-7 transition-shadow hover:shadow-lg"
                style={card.featured
                  ? { background: "#5B2D8E", borderColor: "#5B2D8E", color: "#fff" }
                  : { background: "#fff", borderColor: "#ddd", color: "#222" }}
              >
                <div className="text-base font-bold mb-2.5" style={{ color: card.featured ? "#fff" : "#6C3DB5" }}>
                  {card.name}
                </div>
                <div className="font-extrabold mb-3.5 leading-none" style={{ fontSize: "2.2rem", color: card.featured ? "#fff" : "#3d1d63" }}>
                  {card.price} <span className="text-base font-normal">/ Month</span>
                </div>
                <div className="text-xs font-semibold mb-2" style={{ color: card.featured ? "rgba(255,255,255,.85)" : "#6C3DB5" }}>
                  What you Get
                </div>
                <ul className="flex-1 mb-5 space-y-1">
                  {card.features.map((f, i) => (
                    <li key={i} className="flex gap-2 items-start text-xs leading-relaxed" style={{ color: card.featured ? "rgba(255,255,255,.9)" : "#666" }}>
                      <span className="flex-shrink-0 font-bold" style={{ color: card.featured ? "#a5f3b4" : "#5B2D8E" }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2.5 mt-auto">
                  <button
                    className="flex-1 rounded-full py-2 text-sm font-semibold transition-colors"
                    style={card.featured
                      ? { background: "#fff", color: "#5B2D8E", border: "none" }
                      : { background: "#5B2D8E", color: "#fff", border: "none" }}
                  >
                    Apply Now
                  </button>
                  <button
                    className="flex-1 rounded-full py-2 text-sm transition-colors"
                    style={card.featured
                      ? { border: "1.5px solid rgba(255,255,255,.5)", color: "#fff", background: "none" }
                      : { border: "1.5px solid #ddd", color: "#222", background: "none" }}
                  >
                    Tell me more
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Footer />
    </div>
  );
}
