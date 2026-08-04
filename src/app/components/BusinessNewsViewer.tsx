import { useState, useEffect } from "react";
import { Search, User, Loader2, ChevronDown, Home, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { ApplyModal } from "./ApplyModal";
import { publicApi, newsApi, type NewsArticleSummary } from "../services/apiClient";
import { ArticleView, SlidingNewsRow, timeAgo } from "./NewsShared";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void }

const GREEN = "#0B5C2E";
const LIVE_RED = "#D42E2E";

const NAV = ["Home", "World", "Africa", "Business", "Technology", "Politics", "Sport", "Health", "Entertainment"];



function Thumb({ a, size }: { a: NewsArticleSummary; size: number }) {
  return (
    <div className="rounded-lg flex items-center justify-center shrink-0" style={{ background: a.heroGradient, width: size, height: size * 0.7, fontSize: size * 0.32 }}>
      {a.emoji}
    </div>
  );
}

export function BusinessNewsViewer({ isOpen, onClose, onNavigate }: Props) {
  const [articles, setArticles] = useState<NewsArticleSummary[]>([]);
  const [trending, setTrending] = useState<NewsArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsletter, setNewsletter] = useState({ name: "", email: "" });
  const [subscribing, setSubscribing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([newsApi.list({ limit: 30 }), newsApi.trending()]).then(([listRes, trendRes]) => {
      if (listRes.success) setArticles(listRes.data ?? []);
      if (trendRes.success) setTrending(trendRes.data ?? []);
    }).finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNewsletterSubscribe = async () => {
    if (!newsletter.email.includes("@")) { toast.error("Please enter a valid email address."); return; }
    setSubscribing(true);
    const r = await publicApi.newsletter(newsletter.email);
    setSubscribing(false);
    if (r.success) { toast.success("Subscribed! Check your inbox for confirmation."); setNewsletter({ name: "", email: "" }); }
    else toast.error(r.error ?? "Couldn't subscribe right now — please try again.");
  };

  const hero = articles.find(a => a.featured) ?? articles[0];
  const heroSideItems = articles.filter(a => a.slug !== hero?.slug).slice(0, 4);
  const mostReadTop3 = trending.slice(0, 3);
  const worldItems = articles.filter(a => a.category === "World" || a.category === "Africa").slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Masthead */}
      <div className="flex items-center justify-between px-5 sm:px-8 h-[68px] border-b border-gray-100">
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="VINK" className="h-8 w-auto object-contain" />
          <span className="h-6 w-px bg-gray-200" />
          <span className="font-black text-2xl tracking-tight" style={{ color: GREEN }}>NEWS</span>
        </div>
        <div className="hidden sm:flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: LIVE_RED }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: LIVE_RED }} /> LIVE
          </span>
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
            <User className="w-4 h-4" /> Sign in
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
            <Search className="w-4 h-4" /> Search
          </button>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 text-sm font-semibold flex items-center gap-1">
          <X className="w-4 h-4" /> <span className="hidden sm:inline">Close</span>
        </button>
      </div>

      {/* Nav bar */}
      <nav className="flex items-center overflow-x-auto" style={{ background: GREEN, scrollbarWidth: "none" }}>
        <button onClick={() => setOpenSlug(null)} className="px-4 py-3 text-white/90 hover:bg-white/10 shrink-0"><Home className="w-4 h-4" /></button>
        {NAV.map(item => (
          <button key={item} onClick={() => item !== "Home" && onNavigate(item)}
            className="flex items-center gap-1 px-3.5 py-3 text-[13.5px] font-semibold text-white/90 hover:bg-white/10 whitespace-nowrap shrink-0">
            {item}
            {(item === "World" || item === "Africa") && <ChevronDown className="w-3 h-3" />}
          </button>
        ))}
        <button className="ml-auto px-4 py-3 text-[13.5px] font-semibold text-white/90 hover:bg-white/10 flex items-center gap-1 shrink-0">
          More <ChevronDown className="w-3 h-3" />
        </button>
      </nav>

      {loading ? (
        <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : openSlug ? (
        <ArticleView
          slug={openSlug}
          onBack={() => setOpenSlug(null)}
          onOpenSlug={setOpenSlug}
          onCategory={() => setOpenSlug(null)}
        />
      ) : (
        <>
          {/* Hero: headline+sub / photo / sidebar */}
          {hero && (
            <div className="max-w-[1400px] mx-auto px-5 sm:px-8 pt-8 pb-6 grid lg:grid-cols-[1fr_1.3fr_320px] gap-8">
              <div>
                <button onClick={() => setOpenSlug(hero.slug)} className="text-left">
                  <h1 className="text-3xl font-black text-gray-900 leading-[1.1] hover:underline">{hero.title}</h1>
                </button>
                <p className="text-gray-500 text-[15px] mt-4 leading-relaxed">{hero.summary}</p>
                <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
                  {timeAgo(hero.publishedAt)} <span className="text-gray-300">|</span> <span className="font-semibold" style={{ color: LIVE_RED }}>{hero.category}</span>
                </p>
                <div className="mt-5 space-y-2.5">
                  {hero.tags.slice(0, 3).map(t => (
                    <div key={t} className="flex items-center gap-2 text-[13.5px] text-gray-700">
                      <span style={{ color: LIVE_RED }}>▶</span> {t.charAt(0).toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => setOpenSlug(hero.slug)} className="rounded-xl flex items-center justify-center" style={{ background: hero.heroGradient, minHeight: 320, fontSize: 100 }}>
                {hero.emoji}
              </button>

              <div className="space-y-4">
                {heroSideItems.map((a, i) => (
                  <button key={a.slug} onClick={() => setOpenSlug(a.slug)} className={`text-left w-full ${i < heroSideItems.length - 1 ? "pb-4 border-b border-gray-100" : ""}`}>
                    <p className="text-[15px] font-bold text-gray-900 leading-snug hover:underline">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-1.5">{timeAgo(a.publishedAt)} <span className="text-gray-300">|</span> <span className="font-semibold" style={{ color: LIVE_RED }}>{a.category}</span></p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Most Read — sliding right-to-left, click to open the full article */}
          <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-8">
            <h2 className="text-xl font-black text-gray-900 mb-5">Most Read</h2>
            <div className="grid lg:grid-cols-[280px_1fr] gap-8">
              <div className="space-y-4">
                {mostReadTop3.map((a, i) => (
                  <button key={a.slug} onClick={() => setOpenSlug(a.slug)} className="text-left w-full flex items-start gap-3">
                    <span className="text-2xl font-black shrink-0" style={{ color: LIVE_RED }}>{i + 1}</span>
                    <div>
                      <p className="text-[14px] font-bold text-gray-900 leading-snug hover:underline">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{a.views.toLocaleString()} viewing</p>
                    </div>
                  </button>
                ))}
              </div>
              <SlidingNewsRow articles={articles.length ? articles : trending} onOpenSlug={setOpenSlug} />
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Around the World */}
          {worldItems.length > 0 && (
            <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-gray-900">Around the World</h2>
                <button className="flex items-center gap-1 text-sm font-bold" style={{ color: GREEN }}>View all <ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {worldItems.map(a => (
                  <button key={a.slug} onClick={() => setOpenSlug(a.slug)} className="text-left flex gap-3">
                    <Thumb a={a} size={90} />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900 leading-snug hover:underline">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-1.5">{timeAgo(a.publishedAt)} <span className="text-gray-300">|</span> <span className="font-semibold" style={{ color: LIVE_RED }}>{a.category}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Newsletter */}
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 pb-10">
        <div className="rounded-2xl p-8 text-white text-center" style={{ background: `linear-gradient(135deg,${GREEN},#34A853)` }}>
          <h3 className="text-xl font-black mb-2">Never Miss a Headline</h3>
          <p className="text-white/75 text-sm mb-6 max-w-md mx-auto">Top stories across business, technology, and world news — delivered to your inbox every morning.</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input value={newsletter.email} onChange={e => setNewsletter(p => ({ ...p, email: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleNewsletterSubscribe()}
              placeholder="Your email address" className="flex-1 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none" />
            <button onClick={handleNewsletterSubscribe} disabled={subscribing}
              className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex-shrink-0 flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: "#F5A623", color: "#222" }}>
              {subscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Subscribe
            </button>
          </div>
        </div>
      </div>

      {/* T&C Banner */}
      <div style={{ textAlign: "center", background: "#f7f7f9", padding: "28px 24px" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: GREEN, marginBottom: 6 }}>Ready to Grow Your Business with VINK?</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>Explore business accounts, credit, loans, and insurance built around how your business actually operates.</p>
        <button style={{ marginTop: 14, background: GREEN, color: "#fff", border: "none", borderRadius: 20, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onClick={() => setApplyOpen(true)}>Continue an Application</button>
      </div>

      <Footer />
      <ApplyModal isOpen={applyOpen} onClose={() => setApplyOpen(false)} product="Business Services Enquiry" />
    </div>
  );
}
