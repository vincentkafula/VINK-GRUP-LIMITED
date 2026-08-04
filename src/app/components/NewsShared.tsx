import { useState, useEffect, useRef } from "react";
import { Loader2, Clock, Eye, ChevronRight, Share2, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { newsApi, type NewsArticleSummary, type NewsArticle } from "../services/apiClient";

export const NEWS_GREEN = "#0B5C2E";
export const NEWS_RED = "#C0392B";

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}
export function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** Continuous right-to-left drift, same behaviour as the marketplace's
 *  product-row auto-slide — pauses on hover/touch, loops seamlessly. */
export function useAutoSlide<T extends HTMLElement>(itemCount: number, speed = 0.6) {
  const ref = useRef<T>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || itemCount < 2) return;
    let raf: number;
    const tick = () => {
      if (!paused.current && el) {
        const max = el.scrollWidth - el.clientWidth;
        if (max > 0) el.scrollLeft = el.scrollLeft >= max - 1 ? 0 : el.scrollLeft + speed;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [itemCount, speed]);

  const handlers = {
    onMouseEnter: () => { paused.current = true; },
    onMouseLeave: () => { paused.current = false; },
    onTouchStart: () => { paused.current = true; },
    onTouchEnd:   () => { paused.current = false; },
  };
  return { ref, handlers };
}

export function CategoryTag({ category, onClick }: { category: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      style={{ background: `${NEWS_GREEN}15`, color: NEWS_GREEN }}
    >
      {category}
    </span>
  );
}

export function StoryCard({ a, onOpen, size = "md" }: { a: NewsArticleSummary; onOpen: () => void; size?: "sm" | "md" | "lg" }) {
  const heights = { sm: "h-24", md: "h-36", lg: "h-56" };
  const titleSizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" };
  return (
    <button onClick={onOpen} className="text-left w-full group">
      <div className={`${heights[size]} rounded-xl flex items-center justify-center text-5xl mb-3 relative overflow-hidden`} style={{ background: a.heroGradient }}>
        <span className={size === "lg" ? "text-7xl" : "text-4xl"}>{a.emoji}</span>
        {a.breaking && <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: NEWS_RED, color: "#fff" }}>BREAKING</span>}
      </div>
      <CategoryTag category={a.category} />
      <p className={`${titleSizes[size]} font-bold text-gray-900 mt-1.5 leading-snug group-hover:underline`}>{a.title}</p>
      {size !== "sm" && <p className="text-gray-500 text-[13px] mt-1.5 leading-relaxed line-clamp-2">{a.summary}</p>}
      <p className="text-[11px] text-gray-400 mt-2">{timeAgo(a.publishedAt)} · {a.readMinutes} min read</p>
    </button>
  );
}

export function ListRow({ a, rank, onOpen }: { a: NewsArticleSummary; rank?: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="text-left w-full flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 group">
      {rank !== undefined && <span className="text-2xl font-black text-gray-200 w-6 shrink-0">{rank}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-snug group-hover:underline">{a.title}</p>
        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(a.publishedAt)}</p>
      </div>
    </button>
  );
}

/** Right-to-left sliding photo carousel — click any card to open the full article. */
export function SlidingNewsRow({ articles, onOpenSlug }: { articles: NewsArticleSummary[]; onOpenSlug: (s: string) => void }) {
  const slide = useAutoSlide<HTMLDivElement>(articles.length);
  return (
    <div ref={slide.ref} {...slide.handlers} className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {articles.map(a => (
        <button key={a.slug} onClick={() => onOpenSlug(a.slug)} className="text-left shrink-0 w-56 group">
          <div className="h-32 rounded-xl flex items-center justify-center text-5xl relative overflow-hidden" style={{ background: a.heroGradient }}>
            {a.emoji}
            {a.breaking && <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: NEWS_RED, color: "#fff" }}>BREAKING</span>}
          </div>
          <CategoryTag category={a.category} />
          <p className="text-sm font-bold text-gray-900 mt-1.5 leading-snug line-clamp-2 group-hover:underline">{a.title}</p>
          <p className="text-[11px] text-gray-400 mt-1.5">{timeAgo(a.publishedAt)}</p>
        </button>
      ))}
    </div>
  );
}

export function ArticleView({ slug, onBack, onOpenSlug, onCategory }: { slug: string; onBack: () => void; onOpenSlug: (s: string) => void; onCategory: (c: string) => void }) {
  const [data, setData] = useState<{ article: NewsArticle; related: NewsArticleSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    window.scrollTo({ top: 0 });
    newsApi.get(slug).then(r => { if (r.success) setData(r.data); }).finally(() => setLoading(false));
  }, [slug]);

  const share = () => {
    navigator.clipboard?.writeText(`https://www.vink.co.za/news/${slug}`);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!data) return <div className="text-center py-32 text-gray-400">Article not found.</div>;
  const { article, related } = data;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
        <button onClick={onBack} className="hover:text-gray-700 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> News</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => onCategory(article.category)} className="hover:text-gray-700">{article.category}</button>
      </div>

      <CategoryTag category={article.category} />
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-3 leading-tight">{article.title}</h1>
      {article.subtitle && <p className="text-gray-500 text-base mt-3 leading-relaxed">{article.subtitle}</p>}

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-4 pb-5 border-b border-gray-100">
        <span className="font-semibold text-gray-600">{article.author}</span>
        <span className="flex items-center gap-1">{fmtDate(article.publishedAt)}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readMinutes} min read</span>
        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {article.views.toLocaleString()} views</span>
        <button onClick={share} className="flex items-center gap-1 font-semibold ml-auto" style={{ color: NEWS_GREEN }}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />} {copied ? "Copied" : "Share"}
        </button>
      </div>

      <div className="w-full h-56 sm:h-72 rounded-2xl flex items-center justify-center text-8xl my-7" style={{ background: article.heroGradient }}>
        {article.emoji}
      </div>

      <div className="space-y-4">
        {article.body.split("\n\n").map((p, i) => (
          <p key={i} className="text-gray-700 text-[15px] leading-relaxed">{p}</p>
        ))}
      </div>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-gray-100">
          {article.tags.map(t => (
            <span key={t} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">#{t}</span>
          ))}
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-10 pt-8 border-t border-gray-100">
          <p className="text-lg font-black text-gray-900 mb-5">More in {article.category}</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {related.map(a => <StoryCard key={a.slug} a={a} size="sm" onOpen={() => onOpenSlug(a.slug)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
