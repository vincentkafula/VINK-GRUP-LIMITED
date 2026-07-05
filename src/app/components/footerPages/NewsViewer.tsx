import { useState } from "react";
import { X, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi } from "../../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

const CATEGORIES = ["All", "Product News", "Regulatory Update", "Community Impact", "Technology", "Partnerships"];

const ARTICLES = [
  {
    title: "How VMS's 3-Second Payment System Is Transforming the Taxi Industry",
    category: "Product News", date: "March 2022", author: "VMS Editorial Team", featured: true,
    summary: "Every weekday morning, 15 million South Africans board a minibus taxi. Until now, that journey relied entirely on cash. VMS's AFC device changes everything — processing fares, enabling free Wi-Fi, and building financial identities for drivers, all in under 3 seconds.",
    body: `Every weekday morning, approximately 15 million South Africans board a minibus taxi to get to work, school, or home. It's the largest public transport network in the country — and until now, it has operated almost entirely on cash.\n\nCash creates problems. Drivers carry large amounts of money, making them targets for robbery. Passengers scramble for exact change. Taxi marshals collect fares in bulk and carry risk. And taxi associations have almost no visibility into what their fleet earns each day.\n\nVMS was founded to change this — and our Automated Fare Collection (AFC) device does exactly that.\n\nThe Vink AFC device installs in any 14-seater minibus taxi or bus in under two hours. Passengers tap their Vink Smart Pay Card on the device and their fare is deducted in 3 seconds — no cash, no change, no delay. The driver sees payment confirmed instantly on their screen. The taxi association receives a real-time settlement report. The passenger's card receipt is sent via SMS.\n\nBeyond fare payments, the device powers free on-board Wi-Fi for passengers and allows them to buy airtime, electricity, and pay utility bills — all from a moving taxi.\n\nFor taxi drivers, the Vink Driver Wallet links directly to the AFC device, allowing instant access to their daily earnings. Funds can be withdrawn from Nedbank ATMs or used to pay for fuel at major forecourts across South Africa.\n\nVMS charges just R0.50 per taxi transaction — the lowest processing fee in the industry. The vision is bigger than payments. VMS is building the financial infrastructure for South Africa's most important, most overlooked, and most powerful transport workforce.`,
  },
  {
    title: "VMS Completes MVNO Agreement with Cell C — Connecting Drivers to Affordable Data",
    category: "Partnerships", date: "November 2021", author: "VMS Editorial Team", featured: false,
    summary: "VMS has finalised its MVNO (Mobile Virtual Network Operator) agreement with Cell C, enabling the Vink SIM to offer drivers and passengers affordable data, calls, and SMS — bundled directly into their Vink wallet.",
  },
  {
    title: "Nedbank API Integration: What It Means for Vink Cardholders",
    category: "Technology", date: "September 2021", author: "VMS Tech Team", featured: false,
    summary: "VMS's integration with Nedbank's banking API now enables real-time ATM withdrawals, instant account-to-account transfers, and bank-grade security for all Vink cardholders — at no additional cost.",
  },
  {
    title: "VMS Launches Gym Access Programme Across Planet Fitness, Zones & Virgin Active",
    category: "Product News", date: "July 2020", author: "VMS Editorial Team", featured: false,
    summary: "Vink cardholders can now access over 2,100 gym sessions nationwide at just R20 per visit — no monthly membership, no contract. Just tap your Vink card at the gym door.",
  },
  {
    title: "5% of Every Taxi Fare Goes Back to Your Neighbourhood Watch",
    category: "Community Impact", date: "March 2020", author: "VMS Editorial Team", featured: false,
    summary: "VMS's community banking model allocates 5% of every taxi transaction to neighbourhood watch organisations in the area served by that route — directly funding safety in the communities our drivers work in.",
  },
  {
    title: "VMS Business Plan Submitted for R4.5 Billion Funding Round",
    category: "Regulatory Update", date: "January 2022", author: "VMS Corporate Team", featured: false,
    summary: "Vink Group has submitted its formal business plan for a R4.5 billion funding round over 60 months at 7% p.a., aligned to the company's 5-year revenue projection of R266.4 billion cumulative net profit.",
  },
];

export function NewsViewer({ isOpen, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
  const [nlEmail, setNlEmail] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlDone, setNlDone] = useState(false);

  const handleNewsletter = async () => {
    if (!nlEmail.includes("@")) { toast.error("Please enter a valid email address."); return; }
    setNlLoading(true);
    const r = await publicApi.newsletter(nlEmail);
    setNlLoading(false);
    if (r.success) { setNlDone(true); toast.success("Subscribed! Welcome to VMS updates."); }
    else toast.error(r.error ?? "Subscription failed. Please try again.");
  };

  if (!isOpen) return null;

  const filtered = activeCategory === "All" ? ARTICLES : ARTICLES.filter(a => a.category === activeCategory);
  const featured = ARTICLES.find(a => a.featured);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-12 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-5xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>VMS Newsroom</span>
          <h1 className="text-3xl font-black mb-2">News &amp; Insights</h1>
          <p className="text-white/70 text-sm">Product updates, community impact, and industry insights from VMS.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-5 py-8 space-y-8">

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all"
              style={{ background: activeCategory === cat ? P : "#fff", color: activeCategory === cat ? "#fff" : "#6B7280", border: `1px solid ${activeCategory === cat ? P : "#E5E7EB"}` }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Featured article */}
        {featured && activeCategory === "All" && (
          <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setExpandedArticle(expandedArticle === 0 ? null : 0)}>
            <div className="p-6" style={{ background: `linear-gradient(135deg,${P}10,${P}05)` }}>
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                style={{ background: "#EDE9FE", color: P }}>Featured</span>
              <span className="ml-2 inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                style={{ background: "#FEF3C7", color: "#D97706" }}>{featured.category}</span>
              <h2 className="text-xl font-black text-gray-900 mb-2">{featured.title}</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">{featured.summary}</p>
              <p className="text-xs text-gray-400">{featured.date} · {featured.author}</p>
            </div>
            {expandedArticle === 0 && (
              <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                {featured.body?.split("\n\n").map((para, i) => (
                  <p key={i} className="text-gray-700 text-sm leading-relaxed mb-4">{para}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Article grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.filter(a => !a.featured || activeCategory !== "All").map((a, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setExpandedArticle(expandedArticle === i + 1 ? null : i + 1)}>
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                style={{ background: "#EDE9FE", color: P }}>{a.category}</span>
              <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2">{a.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-3">{a.summary}</p>
              <p className="text-xs text-gray-400">{a.date}</p>
              {expandedArticle === i + 1 && a.body && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {a.body.split("\n\n").map((para, j) => (
                    <p key={j} className="text-gray-700 text-xs leading-relaxed mb-3">{para}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Newsletter signup */}
        <div className="rounded-2xl p-8 text-white text-center" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
          <Mail className="w-8 h-8 mx-auto mb-3 opacity-80" />
          <h3 className="text-xl font-black mb-2">Stay Ahead of the Curve</h3>
          <p className="text-white/75 text-sm mb-6 max-w-md mx-auto">
            VMS news, product launches, and industry insights — delivered to your inbox monthly.
          </p>
          <div className="flex gap-2 max-w-sm mx-auto">
            {nlDone ? (
              <p className="flex-1 text-center text-sm font-semibold text-white/90">✓ You&apos;re subscribed!</p>
            ) : (
              <>
                <input value={nlEmail} onChange={e => setNlEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNewsletter()}
                  placeholder="Your email address" className="flex-1 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none" />
                <button onClick={handleNewsletter} disabled={nlLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0 flex items-center gap-1.5 disabled:opacity-60"
                  style={{ background: GOLD, color: "#222" }}>
                  {nlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Subscribe Free
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
