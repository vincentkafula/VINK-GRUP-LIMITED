/**
 * Product selection screen shown BEFORE any application form.
 * User picks their specific product, then clicks "Apply Now" → opens the form.
 */
import { useState } from "react";
import { X, ChevronRight, CheckCircle, Star } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductCategory =
  | "invest" | "insure" | "rewards" | "loan" | "creditCard" | "sim" | "account";

export interface Product {
  id: string;
  name: string;
  tagline: string;
  price: string;
  priceLabel: string;
  features: string[];
  badge?: string;
  badgeColor?: string;
  featured?: boolean;
  gradient: string;
  emoji: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  category: ProductCategory;
  onSelect: (productId: string, productName: string) => void;
}

// ─── Per-category config ──────────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<ProductCategory, {
  title: string; subtitle: string; tag: string;
  gradient: string; accentColor: string;
}> = {
  invest: {
    title: "Choose Your Investment Product",
    subtitle: "Select the investment vehicle that best suits your financial goals — from tax-free savings to commodity-linked accounts.",
    tag: "Personal Banking · Investments",
    gradient: "linear-gradient(135deg,#0F4C81 0%,#1565C0 55%,#42A5F5 100%)",
    accentColor: "#1565C0",
  },
  insure: {
    title: "Choose Your Insurance Cover",
    subtitle: "Protect what matters most — select the cover type that fits your life, your vehicle, your family, or your health.",
    tag: "Personal Banking · Insurance",
    gradient: "linear-gradient(135deg,#1B5E20 0%,#2E7D32 55%,#66BB6A 100%)",
    accentColor: "#2E7D32",
  },
  rewards: {
    title: "Choose Your Rewards Programme",
    subtitle: "Earn VinkPoints on every purchase — pick the card that rewards you most for how you spend.",
    tag: "Personal Banking · VinkPoints",
    gradient: "linear-gradient(135deg,#FF9900 0%,#FFB84D 55%,#FFCC80 100%)",
    accentColor: "#FFB84D",
  },
  loan: {
    title: "Choose Your Loan Product",
    subtitle: "From personal loans to vehicle finance — find the right funding solution for your next chapter.",
    tag: "Personal Banking · Loans",
    gradient: "linear-gradient(135deg,#B71C1C 0%,#E53935 55%,#EF9A9A 100%)",
    accentColor: "#E53935",
  },
  creditCard: {
    title: "Choose Your Vink Card",
    subtitle: "From your first credit card to a premium Visa Infinite — pick the card that matches your lifestyle.",
    tag: "Personal Banking · Credit Cards",
    gradient: "linear-gradient(135deg,#0B5C2E 0%,#128A43 55%,#5FC97F 100%)",
    accentColor: "#128A43",
  },
  sim: {
    title: "Choose Your Vink SIM Plan",
    subtitle: "Stay connected on the Cell C network — affordable data, calls, and SMS bundled with your Vink wallet.",
    tag: "VINK MVNO · Cell C Network",
    gradient: "linear-gradient(135deg,#E65100 0%,#F57C00 55%,#FFB74D 100%)",
    accentColor: "#F57C00",
  },
  account: {
    title: "Choose Your Bank Account",
    subtitle: "From your first account to private banking — find the account that works for your life stage.",
    tag: "Personal Banking · Accounts",
    gradient: "linear-gradient(135deg,#1A237E 0%,#0F3D24 55%,#34A853 100%)",
    accentColor: "#128A43",
  },
};

// ─── Product catalogues ───────────────────────────────────────────────────────

export const PRODUCTS: Record<ProductCategory, Product[]> = {
  account: [
    { id: "clear-access", name: "Spark Account", tagline: "For anyone starting their banking journey", price: "R0", priceLabel: "/month — always free", emoji: "🌱", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", features: ["No minimum balance", "Free Vink card included", "Instant transaction notifications", "Online and app banking"], badge: "Free Forever", badgeColor: "#10B981" },
    { id: "everyday", name: "Anchor Account", tagline: "Designed for daily commuters and casual spenders", price: "R0", priceLabel: "/month", emoji: "🚌", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["Free taxi fare payments via tap-and-go", "2 free ATM withdrawals/month", "Free airtime and electricity in-app", "Debit order support"] },
    { id: "prime", name: "Momentum Account", tagline: "For working adults who want more from their bank", price: "R85", priceLabel: "/month", emoji: "⭐", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["5 free ATM withdrawals/month", "Earn 0.5% cashback on all spend", "Overdraft facility up to R5,000", "Dedicated phone support"] },
    { id: "premier", name: "Horizon Account", tagline: "For high-earners who need premium everyday banking", price: "R170", priceLabel: "/month", emoji: "💎", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", features: ["10 free ATM withdrawals at any bank", "1% cashback on all spend", "R15,000 overdraft facility", "Travel notifications included"] },
    { id: "grain", name: "Summit Account", tagline: "The flagship VINK account — full financial control", price: "R265", priceLabel: "/month", emoji: "🏆", gradient: "linear-gradient(135deg,#0B5C2E,#5FC97F)", featured: true, badge: "Most Popular", badgeColor: "#F5A623", features: ["Unlimited ATM withdrawals", "1.5% cashback on all spend", "R30,000 overdraft", "Dedicated relationship manager", "Investment sub-account", "International transfers to 60+ countries"] },
    { id: "animal", name: "Legacy Account", tagline: "For high-net-worth individuals", price: "R415", priceLabel: "/month", emoji: "🦁", gradient: "linear-gradient(135deg,#1A1A2E,#4A4A6A)", features: ["Unlimited transactions", "2% cashback on all spend", "Private banking concierge", "R100,000 overdraft", "Multi-currency wallet", "Will and estate planning guidance"] },
  ],
  invest: [
    { id: "tfsa", name: "NovaWealth", tagline: "A growth-oriented investment solution designed to help individuals build wealth over the medium to long term.", price: "R0", priceLabel: "admin fee", emoji: "🛡️", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", badge: "Best for Beginners", badgeColor: "#10B981", features: ["Zero tax on interest, dividends, and capital gains", "R36,000 annual contribution limit", "Access your funds any time", "Linked to VINK money market fund"] },
    { id: "fixed-3m", name: "HorizonPlus", tagline: "A diversified investment plan built for investors seeking balanced growth with manageable risk.", price: "7.2%", priceLabel: "p.a. indicative rate", emoji: "🔒", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["3-month lock-in period", "Interest paid at maturity", "No monthly fees", "Early exit penalty of 1% applies"] },
    { id: "fixed-12m", name: "ProsperNest", tagline: "An investment solution designed around long-term savings goals, from major purchases to retirement.", price: "9.5%", priceLabel: "p.a. indicative rate", emoji: "📈", gradient: "linear-gradient(135deg,#E8F5E9,#A5D6A7)", featured: true, badge: "Best Rate", badgeColor: "#F5A623", features: ["12-month lock-in period", "Interest credited monthly or at maturity", "No monthly fees", "Guaranteed rate at opening"] },
    { id: "unit-trust", name: "InfinityGrowth", tagline: "A high-growth investment option for investors comfortable with a longer time horizon and higher return potential.", price: "R500", priceLabel: "minimum/month", emoji: "📊", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["Diversified across equity, bonds, and property", "Managed by qualified portfolio team", "Monthly or lump-sum contributions", "Quarterly investment statements"] },
    { id: "ra", name: "Evergreen Portfolio", tagline: "A stability-focused investment portfolio designed to preserve and steadily grow capital over time.", price: "27.5%", priceLabel: "of income tax-deductible", emoji: "🎯", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", features: ["Tax-deductible contributions up to 27.5% of income", "Lump-sum or monthly contributions", "Choice of underlying fund", "Portable between employers"] },
    { id: "money-market", name: "LegacyBuilder", tagline: "An investment plan designed to help individuals build and protect wealth to pass on to future generations.", price: "R0", priceLabel: "no minimum balance", emoji: "💰", gradient: "linear-gradient(135deg,#E0F2F1,#B2DFDB)", features: ["Instant access", "Daily interest accrual", "Rate linked to repo rate", "No minimum balance required"] },
  ],
  insure: [
    { id: "life", name: "VINK LifeNest", tagline: "Life insurance focused on protecting your family's future.", price: "R0", priceLabel: "admin fee · premium from R89/month", emoji: "❤️", gradient: "linear-gradient(135deg,#FFEBEE,#FFCDD2)", badge: "Most Important", badgeColor: "#EF4444", features: ["Lump-sum or income-based payout options for beneficiaries", "Guaranteed insurability options as your family grows", "Optional critical illness and terminal illness acceleration benefits", "Flexible terms from short-term cover to whole-of-life protection", "Transparent, fixed premiums with no hidden escalations"] },
    { id: "disability", name: "VINK SecureStride", tagline: "Income protection and disability cover for working professionals.", price: "R0", priceLabel: "admin fee · premium from R59/month", emoji: "🦺", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["Monthly income replacement during illness, injury, or disability", "Own-occupation cover options for specialised professions", "Short-term and long-term disability benefit structures", "Rehabilitation and return-to-work support included", "Cover that adjusts automatically as your salary grows"] },
    { id: "funeral", name: "VINK ShieldOne", tagline: "Comprehensive everyday personal protection.", price: "R85", priceLabel: "/month", emoji: "🌹", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", features: ["All-in-one cover for accidents, personal liability, and everyday risks", "Single premium, single policy, single point of contact", "Flexible cover levels that scale with life stage and income", "24/7 claims support with fast-track digital claims", "Optional add-ons to tailor protection to your household"] },
    { id: "home-contents", name: "VINK HomeHarbour", tagline: "Protection for your home and personal belongings.", price: "R170", priceLabel: "/month", emoji: "🏠", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["Buildings and contents cover, individually or combined", "All-risk protection for valuables, electronics, and personal items", "Cover for temporary accommodation after an insured event", "Home office and remote-work equipment protection", "Optional cover extensions for high-value items and specified goods"] },
    { id: "motor", name: "VINK JourneyGuard", tagline: "Travel and journey protection for personal trips.", price: "R265", priceLabel: "/month", emoji: "🚗", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", featured: true, badge: "Most Chosen", badgeColor: "#F5A623", features: ["Emergency medical cover and evacuation while travelling", "Trip cancellation, curtailment, and delay protection", "Baggage, personal effects, and travel document cover", "24/7 global emergency assistance line", "Single-trip and annual multi-trip options available"] },
    { id: "hospital-cash", name: "VINK CareCircle", tagline: "Health and accident cover with wellness benefits.", price: "R415", priceLabel: "/month", emoji: "🏥", gradient: "linear-gradient(135deg,#E0F2F1,#B2DFDB)", features: ["Hospital, day-to-day medical, and accident cover in one plan", "Wellness rewards for health screenings, fitness, and preventative care", "Access to a curated network of healthcare providers", "Telehealth and virtual consultation access", "Family cover options with dependant discounts"] },
  ],
  rewards: [
    { id: "balance-transfer", name: "LifePerks", tagline: "A rewards programme built around everyday life, offering benefits on the purchases and services people use most.", price: "R0", priceLabel: "/month", emoji: "🔄", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["0% interest for 6 months on transferred balance", "3% transfer fee (minimum R50)", "No annual fee", "Reports to all 4 credit bureaux"] },
    { id: "cash-back", name: "SparkRewards", tagline: "An entry-level rewards programme designed to give new customers immediate value and easy-to-earn benefits.", price: "R0", priceLabel: "/month", emoji: "💵", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", features: ["1% cashback on all spend", "Capped at R500/month", "Credited last day of each month", "No minimum spend required"] },
    { id: "fuel-rewards", name: "NovaPoints", tagline: "A points-based rewards programme offering flexible redemption across travel, retail, and lifestyle categories.", price: "R85", priceLabel: "/month", emoji: "⛽", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["Earn 8c per litre at Engen, Shell & Sasol", "500 VinkPoints bonus per R500 fuel spend", "Monthly fuel rewards statement", "Use points for any purchase"] },
    { id: "retail-rewards", name: "ThriveClub", tagline: "A wellness-linked rewards programme that rewards healthy habits and positive lifestyle choices.", price: "R170", priceLabel: "/month", emoji: "🛒", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", features: ["Double VinkPoints at Pick n Pay, Shoprite, Checkers & Spar", "Redeem in-store or on the VINK app", "Selected independent retailers included", "Points never expire while account is active"] },
    { id: "travel-rewards", name: "ElevateRewards", tagline: "A premium rewards programme offering enhanced benefits for high-engagement VINK customers.", price: "R265", priceLabel: "/month", emoji: "✈️", gradient: "linear-gradient(135deg,#FF9900,#FFB84D)", featured: true, badge: "Top Pick", badgeColor: "#F5A623", features: ["3× VinkPoints on flights and hotels", "Access to Bidvest Lounges at all SA airports", "Travel insurance on bookings", "Airline partners: Comair and FlySafair"] },
    { id: "automotive-rewards", name: "JourneyPoints", tagline: "A travel-focused rewards programme designed to reward spending with travel perks, upgrades, and experiences.", price: "R415", priceLabel: "/month", emoji: "🔧", gradient: "linear-gradient(135deg,#212121,#424242)", features: ["Earn VinkPoints at Tiger Wheel & Tyre, Supa Quick & AutoZone", "Redeem for oil changes, tyres, and services", "Monthly automotive spend report", "Linked to fleet management tools"] },
  ],
  loan: [
    { id: "personal", name: "LifeAdvance", tagline: "A flexible personal loan designed to help fund major life milestones, from home improvements to family events.", price: "R0", priceLabel: "application fee", emoji: "👤", gradient: "linear-gradient(135deg,#FFEBEE,#FFCDD2)", badge: "Same-day Approval", badgeColor: "#10B981", features: ["R1,000 – R250,000", "12–60 month terms", "Interest rate 12.5%–24.5% p.a.", "Same-day approval for qualifying applicants"] },
    { id: "home-loan", name: "FlexiLoan", tagline: "A personal loan built around flexibility, with adjustable repayment options to suit changing circumstances.", price: "R0", priceLabel: "application fee", emoji: "🏠", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["Up to 100% LTV for first-time buyers", "20-year term available", "Linked to prime rate", "Free property valuation included"] },
    { id: "student-loan", name: "HorizonLoan", tagline: "Medium-to-long-term personal financing designed for larger goals that need structured, predictable repayment.", price: "R85", priceLabel: "admin fee", emoji: "🎓", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", features: ["Covers tuition, textbooks, and accommodation", "Repayment deferred until 6 months post-graduation", "All public universities in SA eligible", "No collateral required"] },
    { id: "pension-backed", name: "SwiftCash", tagline: "Fast-access personal financing designed for short-term needs, with a streamlined application process.", price: "R170", priceLabel: "admin fee", emoji: "🏦", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["Up to 90% of pension fund value", "No credit check required", "Any registered pension fund in SA", "Lower interest rate than unsecured loans"] },
    { id: "vehicle-loan", name: "DreamFund", tagline: "A personal loan designed to help fund significant personal goals, from weddings to travel to education.", price: "R265", priceLabel: "admin fee", emoji: "🚗", gradient: "linear-gradient(135deg,#B71C1C,#E53935)", featured: true, badge: "Most Chosen", badgeColor: "#F5A623", features: ["New and used vehicles", "Finance up to 100%", "Balloon payment option available", "Linked VINK vehicle insurance option", "12–72 month terms"] },
    { id: "vehicle-leasing", name: "ElevateLoan", tagline: "A premium personal loan offering, providing higher limits and preferential terms for qualifying individuals.", price: "R415", priceLabel: "admin fee", emoji: "🔑", gradient: "linear-gradient(135deg,#37474F,#546E7A)", features: ["Operating or finance lease", "Maintenance, tyres, and licensing included", "Fixed monthly cost", "Residual value guaranteed", "Ideal for personal and business"] },
  ],
  creditCard: [
    { id: "student", name: "Pulse Card", tagline: "An everyday credit card built for simplicity and value, ideal for managing day-to-day spending with confidence.", price: "R0", priceLabel: "/month", emoji: "🎓", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", badge: "No Annual Fee", badgeColor: "#10B981", features: ["Credit limit R1,000 – R5,000", "Credit-builder reporting to all 4 bureaux", "0.5% cashback on study and grocery spend", "Free online statements"] },
    { id: "secure", name: "Nova Card", tagline: "A rewards-driven card designed for people who want their everyday spending to work harder, with benefits on the purchases that matter most.", price: "R0", priceLabel: "/month", emoji: "🔐", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", features: ["Secured by a deposit you choose", "Upgrade to unsecured after 12 months", "Reports to all credit bureaux", "Free replacement card"] },
    { id: "co-branded", name: "Orbit Card", tagline: "A travel-focused card offering benefits designed around flights, accommodation, and life on the move.", price: "R85", priceLabel: "/month", emoji: "🛒", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["Earn 1 Smart Shopper point per R5 at PnP", "0.5% cashback everywhere else", "R0 transaction fees at PnP tills", "Exclusive monthly bonus offers"] },
    { id: "investment-cc", name: "Elevate Card", tagline: "A card built for upwardly mobile professionals, combining everyday value with premium lifestyle perks.", price: "R170", priceLabel: "/month", emoji: "📈", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", features: ["1% of every purchase to a linked unit trust", "Quarterly investment statements", "Linked to Allan Gray or Coronation", "Travel insurance included"] },
    { id: "grain-cc", name: "Apex Card", tagline: "A premium card offering elevated rewards, travel benefits, and exclusive access for high-value spenders.", price: "R265", priceLabel: "/month", emoji: "🏆", gradient: "linear-gradient(135deg,#0B5C2E,#FF9900)", featured: true, badge: "Premium Choice", badgeColor: "#F5A623", features: ["Airport lounge access — 1,000+ lounges", "2% cashback on travel · 1% everywhere", "Credit limit up to R500,000", "Dedicated concierge service", "Medical emergency cover"] },
    { id: "animal-cc", name: "Vertex Card", tagline: "Our top-tier personal credit card, delivering elite rewards, concierge-level service, and premium lifestyle privileges.", price: "R415", priceLabel: "/month", emoji: "🦁", gradient: "linear-gradient(135deg,#1A1A1A,#4A4A4A)", features: ["R1,000,000 credit limit", "3% cashback on international spend", "Personal concierge 24/7", "Global medical emergency evacuation", "Earn up to 120,000 VinkPoints/year"] },
  ],
  sim: [
    { id: "payg", name: "Pay-As-You-Go", tagline: "No commitment — pay only for what you use", price: "R0", priceLabel: "/month", emoji: "📱", gradient: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", badge: "No Contract", badgeColor: "#10B981", features: ["No monthly fee", "Data from R0.50/MB", "Calls from R0.80/min", "SMS from R0.20 each"] },
    { id: "starter-1gb", name: "Starter 1GB", tagline: "Perfect for light data users", price: "R49", priceLabel: "/month", emoji: "🌱", gradient: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", features: ["1GB data included", "50 free SMS", "Free Vink app data", "Rollover unused data (30 days)"] },
    { id: "essential-3gb", name: "Essential 3GB", tagline: "Stay connected every day", price: "R99", priceLabel: "/month", emoji: "📶", gradient: "linear-gradient(135deg,#FFF8E1,#FFF3CD)", features: ["3GB data included", "100 free SMS", "Free Vink app data", "Free Wi-Fi on VINK taxis"] },
    { id: "plus-10gb", name: "Plus 10GB", tagline: "Serious data for busy lifestyles", price: "R199", priceLabel: "/month", emoji: "🚀", gradient: "linear-gradient(135deg,#F3E5F5,#EAF7EE)", featured: true, badge: "Best Value", badgeColor: "#F5A623", features: ["10GB data included", "200 free SMS", "100 free minutes", "Free Vink app data", "Free Wi-Fi on VINK taxis"] },
    { id: "unlimited", name: "Unlimited Calls & 5GB", tagline: "Talk as much as you want", price: "R299", priceLabel: "/month", emoji: "📞", gradient: "linear-gradient(135deg,#E65100,#F57C00)", features: ["Unlimited calls to all SA networks", "5GB data included", "200 free SMS", "Free Vink app data", "HD voice quality on Cell C network"] },
  ],
};

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product, accentColor, onSelect, isSelected,
}: {
  product: Product; accentColor: string; onSelect: () => void; isSelected: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className="relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl border-2"
      style={{
        borderColor: isSelected ? accentColor : "transparent",
        boxShadow: isSelected ? `0 0 0 3px ${accentColor}30, 0 8px 32px ${accentColor}20` : undefined,
      }}
    >
      {/* Featured badge */}
      {product.badge && (
        <div className="absolute top-3 right-3 z-10 text-[10px] font-black px-2 py-1 rounded-full text-white"
          style={{ background: product.badgeColor }}>
          {product.badge}
        </div>
      )}

      {/* Selected tick */}
      {isSelected && (
        <div className="absolute top-3 left-3 z-10 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: accentColor }}>
          <CheckCircle className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Card header */}
      <div className="relative h-28 flex flex-col items-center justify-center"
        style={{ background: product.gradient }}>
        <span className="text-5xl mb-1">{product.emoji}</span>
        <span className="text-sm font-bold text-white/90 drop-shadow px-2 text-center">{product.name}</span>
      </div>

      {/* Card body */}
      <div className="bg-white p-4 space-y-3">
        <p className="text-xs text-gray-500 leading-snug">{product.tagline}</p>

        {/* Price */}
        <div>
          <span className="text-2xl font-black text-gray-900">{product.price}</span>
          <span className="text-xs text-gray-400 ml-1">{product.priceLabel}</span>
        </div>

        {/* Features */}
        <ul className="space-y-1.5">
          {product.features.slice(0, 4).map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600 leading-snug">
              <span className="mt-0.5 flex-shrink-0 font-bold" style={{ color: accentColor }}>✓</span>
              {f}
            </li>
          ))}
          {product.features.length > 4 && (
            <li className="text-[10px] text-gray-400">+{product.features.length - 4} more features</li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProductSelectorViewer({ isOpen, onClose, category, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const cfg = CATEGORY_CONFIG[category];
  const products = PRODUCTS[category] ?? [];
  const selectedProduct = products.find(p => p.id === selected);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#F8F7FF]">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
          <div className="hidden sm:block border-l border-gray-200 pl-3">
            <p className="text-sm font-bold text-gray-800">Product Selection</p>
            <p className="text-[11px] text-gray-400">{cfg.tag}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden px-6 py-10 text-white" style={{ background: cfg.gradient }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle,#fff,transparent)" }} />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle,#F5A623,transparent)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-3"
            style={{ background: "rgba(255,255,255,.15)" }}>
            Step 1 of 2 — Choose your product
          </span>
          <h1 className="text-2xl md:text-3xl font-black leading-tight mb-2">{cfg.title}</h1>
          <p className="text-white/70 text-sm max-w-xl">{cfg.subtitle}</p>
        </div>
      </div>

      {/* ── Product grid ── */}
      <div className="max-w-5xl mx-auto w-full px-5 py-8">

        {/* Instruction */}
        <div className="flex items-center gap-2 mb-6 p-3.5 rounded-xl text-sm font-medium"
          style={{ background: cfg.accentColor + "10", color: cfg.accentColor, border: `1px solid ${cfg.accentColor}25` }}>
          <Star className="w-4 h-4 flex-shrink-0" />
          Select the product you want to apply for, then click <strong className="ml-1">Apply Now</strong> to begin your application.
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              accentColor={cfg.accentColor}
              isSelected={selected === product.id}
              onSelect={() => setSelected(product.id === selected ? null : product.id)}
            />
          ))}
        </div>

        {/* Compare note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Not sure which to choose? <span className="underline cursor-pointer" style={{ color: cfg.accentColor }}>Compare all products</span> or speak to a VINK advisor at 0800 VINK (8465).
        </p>
      </div>

      {/* ── Sticky apply bar ── */}
      <div className="sticky bottom-0 z-20 bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,.08)]">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          {selectedProduct ? (
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl flex-shrink-0">{selectedProduct.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">{selectedProduct.price} <span className="text-gray-400">{selectedProduct.priceLabel}</span></p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-medium">← Select a product to continue</p>
          )}

          <button
            disabled={!selected}
            onClick={() => selected && selectedProduct && onSelect(selected, selectedProduct.name)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
            style={{
              background: selected
                ? `linear-gradient(135deg,${cfg.accentColor},${cfg.accentColor}CC)`
                : "#9CA3AF",
              boxShadow: selected ? `0 6px 20px ${cfg.accentColor}40` : "none",
            }}
          >
            Apply Now
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
}
