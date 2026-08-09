import { useState, useEffect, useCallback } from "react";
import {
  X, Search, Loader2, ChevronRight, Mail,
  Menu, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi, newsApi, type NewsArticleSummary } from "../../services/apiClient";
import { StoryCard, ListRow, ArticleView, SlidingNewsRow, timeAgo } from "../NewsShared";

interface Props { isOpen: boolean; onClose: () => void; }

const GREEN = "#0B5C2E";
const RED = "#C0392B";
const GOLD = "#F5A623";

type View = "home" | "article" | "category" | "search";

const CATEGORIES = ["World", "Africa", "Business", "Technology", "Sport", "Entertainment", "Opinion"];

// ─── Category / search listing ──────────────────────────────────────────────
function ListingView({ title, category, search, onOpenSlug }: { title: string; category?: string; search?: string; onOpenSlug: (s: string) => void }) {
  const [articles, setArticles] = useState<NewsArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    newsApi.list({ category, search, page: 1, limit: 12 }).then(r => {
      if (r.success) { setArticles(r.data); setPages(r.meta.pages); }
    }).finally(() => setLoading(false));
  }, [category, search]);

  const loadMore = () => {
    const next = page + 1;
    newsApi.list({ category, search, page: next, limit: 12 }).then(r => {
      if (r.success) { setArticles(a => [...a, ...r.data]); setPage(next); }
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-black text-gray-900 mb-1">{title}</h1>
      {search && <p className="text-gray-400 text-sm mb-6">{articles.length ? `Results for "${search}"` : `No results for "${search}"`}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {articles.map(a => <StoryCard key={a.slug} a={a} onOpen={() => onOpenSlug(a.slug)} />)}
          </div>
          {page < pages && (
            <div className="text-center mt-10">
              <button onClick={loadMore} className="px-6 py-2.5 rounded-full text-sm font-bold border-2" style={{ borderColor: GREEN, color: GREEN }}>
                Load more stories
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────
function HomeView({ onOpenSlug, onCategory }: { onOpenSlug: (s: string) => void; onCategory: (c: string) => void }) {
  const [articles, setArticles] = useState<NewsArticleSummary[]>([]);
  const [trending, setTrending] = useState<NewsArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nlEmail, setNlEmail] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlDone, setNlDone] = useState(false);

  useEffect(() => {
    Promise.all([newsApi.list({ limit: 30 }), newsApi.trending()]).then(([listRes, trendRes]) => {
      if (listRes.success) setArticles(listRes.data);
      if (trendRes.success) setTrending(trendRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleNewsletter = async () => {
    if (!nlEmail.includes("@")) { toast.error("Please enter a valid email address."); return; }
    setNlLoading(true);
    const r = await publicApi.newsletter(nlEmail);
    setNlLoading(false);
    if (r.success) { setNlDone(true); toast.success("Subscribed! Welcome to VINK updates."); }
    else toast.error(r.error ?? "Subscription failed. Please try again.");
  };

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const breaking = articles.find(a => a.breaking);
  const hero = articles.find(a => a.featured) ?? articles[0];
  const secondary = articles.filter(a => a.slug !== hero?.slug).slice(0, 2);
  const restByCategory = (cat: string) => articles.filter(a => a.category === cat && a.slug !== hero?.slug).slice(0, 3);

  return (
    <>
      {breaking && (
        <button onClick={() => onOpenSlug(breaking.slug)} className="w-full flex items-center gap-2 px-5 py-2 text-white text-xs font-semibold text-left" style={{ background: RED }}>
          <span className="px-1.5 py-0.5 rounded bg-white/20 font-bold shrink-0">BREAKING</span>
          <span className="truncate">{breaking.title}</span>
        </button>
      )}

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Hero grid */}
        {hero && (
          <div className="grid lg:grid-cols-3 gap-6 mb-10">
            <div className="lg:col-span-2">
              <StoryCard a={hero} size="lg" onOpen={() => onOpenSlug(hero.slug)} />
            </div>
            <div className="space-y-5">
              {secondary.map(a => <StoryCard key={a.slug} a={a} size="sm" onOpen={() => onOpenSlug(a.slug)} />)}
            </div>
          </div>
        )}

        {/* Sliding photo carousel */}
        {articles.length > 0 && (
          <div className="mb-12">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">More Stories</p>
            <SlidingNewsRow articles={articles} onOpenSlug={onOpenSlug} />
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_280px] gap-10">
          <div className="space-y-12">
            {CATEGORIES.map(cat => {
              const items = restByCategory(cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-4 pb-2 border-b-2" style={{ borderColor: GREEN }}>
                    <h2 className="text-lg font-black text-gray-900">{cat}</h2>
                    <button onClick={() => onCategory(cat)} className="text-xs font-bold flex items-center gap-1" style={{ color: GREEN }}>
                      More <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-5">
                    {items.map(a => <StoryCard key={a.slug} a={a} size="sm" onOpen={() => onOpenSlug(a.slug)} />)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar */}
          <aside>
            <div className="bg-gray-50 rounded-2xl p-5 sticky top-24">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-4 h-4" style={{ color: GREEN }} />
                <p className="font-black text-gray-900 text-sm">Most Read</p>
              </div>
              {trending.map((a, i) => <ListRow key={a.slug} a={a} rank={i + 1} onOpen={() => onOpenSlug(a.slug)} />)}
            </div>
          </aside>
        </div>

        {/* Newsletter */}
        <div className="rounded-2xl p-8 text-white text-center mt-14" style={{ background: `linear-gradient(135deg,${GREEN},#34A853)` }}>
          <Mail className="w-8 h-8 mx-auto mb-3 opacity-80" />
          <h3 className="text-xl font-black mb-2">Stay Ahead of the Curve</h3>
          <p className="text-white/75 text-sm mb-6 max-w-md mx-auto">The day's top stories in business, technology, sport, and more — delivered to your inbox every morning.</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            {nlDone ? (
              <p className="flex-1 text-center text-sm font-semibold text-white/90">✓ You&apos;re subscribed!</p>
            ) : (
              <>
                <input value={nlEmail} onChange={e => setNlEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleNewsletter()}
                  placeholder="Your email address" className="flex-1 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none" />
                <button onClick={handleNewsletter} disabled={nlLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex-shrink-0 flex items-center gap-1.5 disabled:opacity-60"
                  style={{ background: GOLD, color: "#222" }}>
                  {nlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Subscribe Free
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export function NewsViewer({ isOpen, onClose }: Props) {
  const [view, setView] = useState<View>("home");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openSlug = useCallback((s: string) => { setSlug(s); setView("article"); window.scrollTo({ top: 0 }); }, []);
  const openCategory = useCallback((c: string) => { setCategory(c); setView("category"); window.scrollTo({ top: 0 }); }, []);
  const goHome = useCallback(() => { setView("home"); window.scrollTo({ top: 0 }); }, []);

  const runSearch = () => {
    if (!searchInput.trim()) return;
    setSearchQuery(searchInput.trim());
    setView("search");
    setMobileNavOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      {/* Masthead */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <button onClick={goHome} className="flex items-center gap-2">
              <img src={vinkLogo} alt="VINK" className="h-8 w-auto object-contain" />
              <span className="font-black text-lg tracking-tight" style={{ color: GREEN }}>NEWS</span>
            </button>
          </div>
          <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => openCategory(cat)}
                className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors"
                style={view === "category" && category === cat ? { background: `${GREEN}15`, color: GREEN } : { color: "#6B7280" }}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-gray-100 rounded-full px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runSearch()}
                placeholder="Search news" className="bg-transparent outline-none text-xs px-2 w-32"
              />
            </div>
            <button className="md:hidden p-2 rounded-full hover:bg-gray-100" onClick={() => setMobileNavOpen(o => !o)}><Menu className="w-4 h-4 text-gray-500" /></button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="md:hidden flex flex-col gap-0.5 px-5 pb-3">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { openCategory(cat); setMobileNavOpen(false); }} className="text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">{cat}</button>
            ))}
          </div>
        )}
      </div>

      {view === "home" && <HomeView onOpenSlug={openSlug} onCategory={openCategory} />}
      {view === "article" && <ArticleView slug={slug} onBack={goHome} onOpenSlug={openSlug} onCategory={openCategory} />}
      {view === "category" && <ListingView title={category} category={category} onOpenSlug={openSlug} />}
      {view === "search" && <ListingView title="Search Results" search={searchQuery} onOpenSlug={openSlug} />}
    </div>
  );
}
