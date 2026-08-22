import { useState, useEffect } from "react";
import {
  X, ChevronRight, CheckCircle2, Sparkles, Anchor as AnchorIcon, TrendingUp,
  Sunrise, Mountain, Crown, ArrowRight, UserCheck, Globe2, Star,
} from "lucide-react";
import { PersonalAccountApplicationViewer } from "./PersonalAccountApplicationViewer";
import { Footer } from "./Footer";
import { MarketplaceAuthModal } from "./MarketplaceAuthModal";
import { mktAuth, mktCustomer, type MktAuthUser } from "../services/marketplaceApi";
import { formatZAR, useCurrency, setCountryManually } from "../services/currencyStore";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (category: "creditCard" | "loan" | "invest" | "insure" | "rewards") => void; onOpenBankingApp?: () => void }

interface Account {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  quickFeatures: string[];
  price: string;      // real ZAR fee — this is what's actually billed, used for the application flow
  priceZAR: number;   // same value as a number, for currency-aware display conversion
  priceSub: string;
  marketingMessage: string;
  targetCustomer: string;
  inheritsFrom?: string;
  appFeatures: string[];
}

const SUB_NAV = ["Account", "Credit Card", "Loan", "Invest", "Insure", "Rewards"];
const GREEN = "#0F8A4B";
const ORANGE = "#FF7A1A";

const ACCOUNTS: Account[] = [
  {
    id: "spark", name: "Spark Account",
    desc: "Entry-level account — straightforward day-to-day banking, no monthly fee attached.",
    icon: <Sparkles className="w-6 h-6" />, iconBg: "#E8F7EE", iconColor: GREEN,
    quickFeatures: ["No monthly fee", "Free online banking", "35 electronic transactions included"],
    price: "R0", priceZAR: 0, priceSub: "/ month",
    marketingMessage: "Every great financial journey starts with a spark. Open your account in minutes and experience banking built for your future.",
    targetCustomer: "Students, first-time earners, young adults",
    appFeatures: ["Instant digital account opening", "Virtual debit card", "QR payments", "Spending insights", "Smart notifications", "Mobile airtime & bill payments", "Biometric login", "Round-up savings"],
  },
  {
    id: "anchor", name: "Anchor Account",
    desc: "Standard everyday account — more room to move each month, still free to hold.",
    icon: <AnchorIcon className="w-6 h-6" />, iconBg: "#FFF1E6", iconColor: ORANGE,
    quickFeatures: ["No monthly fee", "Free online banking", "60 electronic transactions included"],
    price: "R0", priceZAR: 0, priceSub: "/ month",
    marketingMessage: "The account you can rely on every day. Fast, secure and designed to keep your life moving.",
    targetCustomer: "Salaried professionals & everyday banking",
    inheritsFrom: "Spark",
    appFeatures: ["Salary deposits", "Scheduled transfers", "Standing orders", "Debit card controls (freeze/unfreeze)", "Subscription manager", "Budget categories", "Family payments", "Digital statements"],
  },
  {
    id: "momentum", name: "Momentum Account",
    desc: "Rewards account — built for accounts that carry serious monthly volume.",
    icon: <TrendingUp className="w-6 h-6" />, iconBg: "#E8F7EE", iconColor: GREEN,
    quickFeatures: ["Monthly fee: R85", "High transaction limits", "Access to exclusive rewards"],
    price: "R85", priceZAR: 85, priceSub: "/ month",
    marketingMessage: "Every payment should move you forward. Earn rewards, unlock exclusive offers and watch your banking pay you back.",
    targetCustomer: "Active spenders & loyal customers",
    inheritsFrom: "Anchor",
    appFeatures: ["Cashback rewards", "Merchant discounts", "Loyalty points marketplace", "Monthly reward challenges", "Travel rewards", "Referral bonuses", "Premium card designs", "Spending streak achievements"],
  },
  {
    id: "horizon", name: "Horizon Account",
    desc: "Savings-focused account — a tighter turnover band, geared to lower-volume activity.",
    icon: <Sunrise className="w-6 h-6" />, iconBg: "#FFF1E6", iconColor: ORANGE,
    quickFeatures: ["Low monthly fee", "Smart saving tools", "Ideal for growing balances"],
    price: "R170", priceZAR: 170, priceSub: "/ month",
    marketingMessage: "Your future deserves more than a savings account. Build wealth automatically, one goal at a time.",
    targetCustomer: "Serious savers",
    inheritsFrom: "Momentum",
    appFeatures: ["Goal-based savings vaults", "Auto-save rules", "High-interest savings", "Savings progress tracker", "Emergency fund vault", "Lock savings until a chosen date", "AI savings recommendations", "Family savings goals"],
  },
  {
    id: "summit", name: "Summit Account",
    desc: "Premium account — built for sole proprietors who need room to grow.",
    icon: <Mountain className="w-6 h-6" />, iconBg: "#E8F7EE", iconColor: GREEN,
    quickFeatures: ["Premium benefits", "Higher limits & flexibility", "Priority support"],
    price: "R265", priceZAR: 265, priceSub: "/ month",
    marketingMessage: "Reach the top with banking that works as hard as you do. Premium benefits without compromise.",
    targetCustomer: "High-income professionals & business leaders",
    inheritsFrom: "Horizon",
    appFeatures: ["Dedicated relationship manager", "Priority customer support (24/7)", "Airport lounge access", "Travel insurance integration", "Higher transaction limits", "Premium metal card", "Multi-currency wallets", "Early salary access"],
  },
  {
    id: "legacy", name: "Legacy Account",
    desc: "Wealth management account — the highest-capacity personal account, for all business segments.",
    icon: <Crown className="w-6 h-6" />, iconBg: "#FFF1E6", iconColor: ORANGE,
    quickFeatures: ["Highest transaction capacity", "Personal wealth support", "Dedicated relationship manager"],
    price: "R415", priceZAR: 415, priceSub: "/ month",
    marketingMessage: "Because wealth is more than money—it's the future you create for generations.",
    targetCustomer: "High-net-worth individuals & investors",
    inheritsFrom: "Summit",
    appFeatures: ["Investment portfolio dashboard", "Stocks & ETFs", "Bonds & treasury products", "Estate planning tools", "Trust account management", "Family wealth dashboard", "Tax document center", "Private banker messaging", "Exclusive investment opportunities offering"],
  },
];

function AccountCard({ acct, onApply, onDetails }: { acct: Account; onApply: (name: string, price: string) => void; onDetails: (acct: Account) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all relative">
      <button onClick={() => onDetails(acct)} className="absolute top-5 right-5 w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
      <span className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: acct.iconBg, color: acct.iconColor }}>
        {acct.icon}
      </span>
      <h3 className="text-lg font-bold mb-1.5" style={{ color: GREEN }}>{acct.name}</h3>
      <p className="text-[13.5px] text-gray-500 leading-relaxed mb-4">{acct.desc}</p>
      <ul className="space-y-2 mb-5">
        {acct.quickFeatures.map(f => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-gray-700">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GREEN }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2.5 mt-auto">
        <button
          onClick={() => onApply(acct.name, acct.price)}
          className="flex-1 py-2.5 rounded-lg text-white text-[13.5px] font-bold transition-opacity hover:opacity-90"
          style={{ background: ORANGE }}
        >
          Apply Now
        </button>
        <button
          onClick={() => onDetails(acct)}
          className="flex-1 py-2.5 rounded-lg text-[13.5px] font-bold border transition-colors"
          style={{ borderColor: GREEN, color: GREEN }}
        >
          View Details
        </button>
      </div>
    </div>
  );
}

function AccountDetailModal({ acct, onClose, onApply }: { acct: Account; onClose: () => void; onApply: (name: string, price: string) => void }) {
  const currency = useCurrency();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5" style={{ background: "rgba(15,30,20,0.55)" }} onClick={onClose}>
      <div className="relative bg-white max-w-lg w-full max-h-[88vh] overflow-y-auto rounded-2xl p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100" aria-label="Close">
          <X className="w-4 h-4" />
        </button>

        <span className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: acct.iconBg, color: acct.iconColor }}>{acct.icon}</span>
        <h3 className="text-2xl font-black mb-3" style={{ color: GREEN }}>{acct.name}</h3>
        <blockquote className="italic text-gray-600 text-[15px] leading-relaxed mb-5 pl-4" style={{ borderLeft: `3px solid ${ORANGE}` }}>
          &ldquo;{acct.marketingMessage}&rdquo;
        </blockquote>

        <div className="flex items-baseline gap-2 mb-5 pb-5 border-b border-gray-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Best for</span>
          <span className="text-sm font-semibold text-gray-800">{acct.targetCustomer}</span>
        </div>

        <p className="text-sm font-bold text-gray-800 mb-3">
          {acct.inheritsFrom ? <>Everything in <span style={{ color: GREEN }}>{acct.inheritsFrom}</span>, plus:</> : "Exclusive mobile app features"}
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mb-6">
          {acct.appFeatures.map(f => (
            <li key={f} className="flex items-start gap-2 text-[12.8px] text-gray-600">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: ORANGE }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-5 border-t border-gray-100">
          <div>
            <div className="text-2xl font-black text-gray-900">{formatZAR(acct.priceZAR)}<span className="text-sm font-medium text-gray-400">{acct.priceSub}</span></div>
            {currency.country.code !== "ZAR" && (
              <p className="text-[11px] text-gray-400 mt-1">Estimated in {currency.country.name} — you'll be billed {acct.price}{acct.priceSub} in South African Rand.</p>
            )}
          </div>
          <button onClick={() => onApply(acct.name, acct.price)} className="px-7 py-3 rounded-full text-white text-sm font-bold" style={{ background: ORANGE }}>
            Apply Now
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersonalAccountViewer({ isOpen, onClose, onNavigate, onOpenBankingApp }: Props) {
  const currency = useCurrency(); // subscribes this tree to live currency/rate updates
  const [showApplication, setShowApplication] = useState(false);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [authUser, setAuthUser] = useState<MktAuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [rewardPoints, setRewardPoints] = useState<number | null>(null);

  useEffect(() => {
    const restored = mktAuth.restoreSession();
    if (restored) setAuthUser(restored.user);
  }, []);

  useEffect(() => {
    if (!authUser) { setRewardPoints(null); return; }
    mktCustomer.stats(authUser.id).then(r => {
      if (r.success) setRewardPoints(Number((r.data as { rewardPoints?: number }).rewardPoints ?? 0));
    }).catch(() => {});
  }, [authUser]);

  if (!isOpen) return null;
  const openApply = () => setShowApplication(true);
  const handleSignOut = () => { mktAuth.logout(); setAuthUser(null); };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      {/* Sub-nav */}
      <nav className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-1 h-12 overflow-x-auto">
          {SUB_NAV.map((item) => (
            <button
              key={item}
              onClick={() => {
                if (item === "Account") return;
                const map: Record<string, "creditCard" | "loan" | "invest" | "insure" | "rewards"> = {
                  "Credit Card": "creditCard", "Loan": "loan", "Invest": "invest", "Insure": "insure", "Rewards": "rewards",
                };
                onNavigate(map[item]);
              }}
              className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={item === "Account" ? { background: "#E8F7EE", color: GREEN } : { color: "#6B7280" }}
            >
              {item}
            </button>
          ))}
          <div className="relative group ml-auto shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-50">
              <Globe2 className="w-3.5 h-3.5" /> {currency.country.code}
            </button>
            <div className="absolute right-0 top-full mt-0 w-64 bg-white rounded-b shadow-2xl border border-gray-200 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 max-h-80 overflow-y-auto">
              <p className="px-3 pb-2 mb-1 border-b border-gray-100 text-[11px] text-gray-400">
                Fees shown in your local currency for reference. All accounts are billed in South African Rand.
              </p>
              {currency.countries.map(c => (
                <button
                  key={c.countryCode}
                  onClick={() => setCountryManually(c.countryCode)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between"
                  style={{ color: currency.country.countryCode === c.countryCode ? GREEN : "#111827", fontWeight: currency.country.countryCode === c.countryCode ? 700 : 400 }}
                >
                  <span>{c.country ?? c.countryCode}</span>
                  <span className="text-gray-400 text-xs">{c.code}</span>
                </button>
              ))}
            </div>
          </div>
          {authUser ? (
            <div className="relative group shrink-0">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: GREEN }}>{authUser.name.charAt(0)}</span>
                {authUser.name.split(" ")[0]}
              </button>
              <div className="absolute right-0 top-full mt-0 w-40 bg-white rounded-b shadow-2xl border border-gray-200 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30">
                <button onClick={handleSignOut} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-red-600">Sign out</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold text-white shrink-0" style={{ background: GREEN }}>
              Log in
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg,#FAFCFB 0%,#F3F9F5 100%)" }}>
        <div className="absolute -left-24 top-0 bottom-0 w-64 rounded-full opacity-40" style={{ background: `linear-gradient(180deg,${GREEN},${ORANGE})`, filter: "blur(60px)" }} />
        <div className="absolute -right-24 top-0 bottom-0 w-64 rounded-full opacity-40" style={{ background: `linear-gradient(180deg,${ORANGE},${GREEN})`, filter: "blur(60px)" }} />

        <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block text-[11px] font-bold tracking-[0.14em] uppercase mb-4" style={{ color: ORANGE }}>Personal Banking</span>
            {authUser ? (
              <>
                <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] text-gray-900">
                  Banking that<br />moves with you.
                </h1>
                <p className="text-gray-500 text-base mt-5 max-w-md">
                  Pay. Save. Earn. All in one place, {authUser.name.split(" ")[0]}.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] text-gray-900">
                  Banking designed for<br />every South African.
                </h1>
                <p className="text-gray-500 text-base mt-5 max-w-md">
                  Open an account in minutes and manage your money with the VINK app.
                </p>
              </>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <button onClick={() => authUser ? setShowAuthModal(false) : openApply()}
                className="px-6 py-3 rounded-full text-white text-sm font-bold shadow-lg" style={{ background: ORANGE }}>
                {authUser ? "Explore Products" : "Open an Account"}
              </button>
              <button className="px-6 py-3 rounded-full text-sm font-bold border-2" style={{ borderColor: GREEN, color: GREEN }}>
                Compare Accounts
              </button>
            </div>
          </div>

          {/* Decorative app preview */}
          <div className="relative flex justify-center items-center h-64 sm:h-80">
            <div className="w-40 h-64 rounded-[28px] shadow-2xl p-3 relative" style={{ background: `linear-gradient(160deg,${GREEN},#0B5C2E)` }}>
              <div className="w-full h-full rounded-2xl bg-white/10 flex flex-col p-3">
                <span className="text-white/60 text-[9px] font-bold tracking-widest">VINK</span>
                <p className="text-white text-lg font-black mt-2">R12,540.00</p>
                <div className="flex gap-1.5 mt-4">
                  {["Send","Cards","Rewards"].map(l => (
                    <span key={l} className="text-[7px] text-white/70 bg-white/10 rounded-full px-2 py-1">{l}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -right-4 bottom-6 w-24 h-16 rounded-2xl shadow-xl flex items-center justify-center" style={{ background: ORANGE }}>
              <UserCheck className="w-8 h-8 text-white" />
            </div>
            {authUser && (
              <div className="absolute left-0 sm:-left-6 bottom-2 bg-white rounded-2xl shadow-xl p-3 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFF1E6", color: ORANGE }}><Star className="w-4 h-4 fill-current" /></span>
                <div>
                  <p className="text-[9px] text-gray-400">VinkPoints</p>
                  <p className="text-sm font-black text-gray-900">{rewardPoints !== null ? rewardPoints.toLocaleString() : "—"}</p>
                  <p className="text-[9px] font-semibold" style={{ color: GREEN }}>View Rewards →</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Choose your account */}
      <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900">
            Choose <span style={{ color: GREEN }}>Your</span> Account
          </h2>
          <div className="w-14 h-1 mx-auto mt-3 rounded-full" style={{ background: ORANGE }} />
          <p className="text-gray-500 text-sm mt-4">Simple banking solutions for every stage of your journey.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {ACCOUNTS.map((acct) => <AccountCard key={acct.id} acct={acct} onApply={openApply} onDetails={setDetailAccount} />)}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="relative overflow-hidden rounded-3xl px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(100deg,#F3F9F5,#FFF4EA)" }}>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#E8F7EE", color: GREEN }}>
              <UserCheck className="w-6 h-6" />
            </span>
            <div>
              <p className="text-xl font-black text-gray-900">Ready to get started?</p>
              <p className="text-gray-500 text-sm mt-1">Open your VINK account online in minutes and start banking your way.</p>
            </div>
          </div>
          <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
            <button onClick={() => openApply()}
              className="px-7 py-3 rounded-full text-white text-sm font-bold shadow-lg whitespace-nowrap" style={{ background: ORANGE }}>
              Open an Account Now
            </button>
            <button className="flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>
              Compare all accounts <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {detailAccount && (
        <AccountDetailModal
          acct={detailAccount}
          onClose={() => setDetailAccount(null)}
          onApply={() => { setDetailAccount(null); openApply(); }}
        />
      )}

      <PersonalAccountApplicationViewer
        isOpen={showApplication}
        onClose={() => setShowApplication(false)}
        onGoToDashboard={onOpenBankingApp ? () => { setShowApplication(false); onOpenBankingApp(); } : undefined}
      />

      {showAuthModal && (
        <MarketplaceAuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={(user) => { setAuthUser(user); setShowAuthModal(false); }}
        />
      )}

      <Footer />
    </div>
  );
}
