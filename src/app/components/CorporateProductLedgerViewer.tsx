import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ApplyModal } from "./ApplyModal";
import { Footer } from "./Footer";
import siteHeroBg from "../../imports/assets/site-hero-bg.webp";
import vinkCorporateTrain from "../../imports/VinkCorporateTrain.webp";
import { SECTIONS, type CardData, type CorpCategory } from "./corporateProducts";

type NavItem = "Account" | "Solutions & Credit Cards" | "Loan" | "Social Responsibility";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: CorpCategory;
  onNavigate: (item: NavItem) => void;
  onOpenApp: () => void;
}

const SUB_NAV: NavItem[] = ["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"];
const CATEGORY_FOR_NAV: Partial<Record<NavItem, CorpCategory>> = { "Account": "account", "Solutions & Credit Cards": "solutions", "Loan": "loan" };

const PAGE_COPY: Record<CorpCategory, { heading: string; tag: string; detailsCta: string; heroEyebrow: string; heroTitle: string; heroSubtitle: string }> = {
  account:   { heading: "All corporate accounts",        tag: "Corporate Banking · Account",                 detailsCta: "See account details", heroEyebrow: "Corporate Banking", heroTitle: "Banking built for\norganizations that shape the future.", heroSubtitle: "Treasury, project and escrow accounts for governments and the institutions that deliver public works." },
  solutions: { heading: "All corporate credit solutions", tag: "Corporate Banking · Solutions & Credit Cards", detailsCta: "See card details", heroEyebrow: "Corporate Credit Solutions", heroTitle: "Credit built for\nenterprise-scale spending.", heroSubtitle: "Long-term credit for governments and public institutions, sized to your capital programme." },
  loan:      { heading: "All corporate loans",            tag: "Corporate Banking · Loan",                    detailsCta: "See loan details", heroEyebrow: "Corporate Loans", heroTitle: "Capital that moves\nat enterprise speed.", heroSubtitle: "Finance for the roads, rail, schools, hospitals, housing and farms that build Africa, and the machinery to deliver them." },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  card, folio, maxPrice, detailsCta, onApply, onDetails,
}: {
  card: CardData; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: (name: string) => void; onDetails: (card: CardData, folio: string) => void;
}) {
  const numericPrice = card.price ? parsePrice(card.price) : null;
  const showGauge = numericPrice !== null && maxPrice !== null && maxPrice > 0;
  const pct = showGauge ? Math.max(4, (numericPrice! / maxPrice!) * 100) : 0;

  return (
    <div className="pav-card">
      <div className="pav-folio">Folio No.&nbsp;{folio}</div>
      {card.featured && <div className="pav-badge">Featured</div>}
      <h3 className="pav-acct-name">{card.name}</h3>
      <ul className="pav-features">
        {card.features.map((f) => <li key={f}>{f}</li>)}
      </ul>

      {showGauge && (
        <div className="pav-gauge-block">
          <div className="pav-gauge-label"><span>Fee</span><span className="pav-ceiling-val">{card.price} / month</span></div>
          <div className="pav-gauge" aria-label={`${card.price} per month`}>
            <div className="pav-gauge-fill" style={{ width: `${pct}%` }} />
            <div className="pav-gauge-marker" style={{ left: `${pct}%` }} />
          </div>
          <div className="pav-gauge-ticks"><span>R0</span><span>R{maxPrice}</span></div>
        </div>
      )}

      {card.stat ? (
        <div className="pav-price-block">
          <div className="pav-price pav-price-text">{card.stat.value}</div>
          <div className="pav-price-sub">{card.stat.label}</div>
        </div>
      ) : card.price ? (
        <div className="pav-price-block">
          <div className="pav-price"><span className="pav-cur">R</span>{card.price.replace("R", "")}</div>
          <div className="pav-price-sub">/ month</div>
        </div>
      ) : null}
      <div className="pav-cta-group">
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(card.name)}>Apply now</button>
        <button
          className="pav-btn pav-btn-secondary"
          onClick={() => card.tagline ? onDetails(card, folio) : onApply(card.name)}
        >
          {detailsCta}
        </button>
      </div>
    </div>
  );
}

function AccountDetailModal({ card, folio, onClose, onApply }: { card: CardData; folio: string; onClose: () => void; onApply: (name: string) => void }) {
  return (
    <div className="pav-detail-backdrop" onClick={onClose}>
      <div className="pav-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="pav-detail-close" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="pav-detail-folio">Folio No.&nbsp;{folio}</div>
        <h3 className="pav-detail-name">{card.name}</h3>
        <p className="pav-detail-tagline">{card.tagline}</p>
        <p className="pav-detail-desc">{card.overview}</p>
        {card.stat && <p className="pav-detail-stat"><span>{card.stat.label}</span><strong>{card.stat.value}</strong></p>}
        <div className="pav-detail-features-head">
          {card.inheritsFrom ? <>Everything in <strong>{card.inheritsFrom}</strong>, plus:</> : "Key Benefits"}
        </div>
        <ul className="pav-detail-features">
          {card.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        {card.idealFor && (
          <>
            <div className="pav-detail-features-head">Ideal For</div>
            <ul className="pav-detail-features" style={{ marginBottom: 28 }}>
              {card.idealFor.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </>
        )}
        {card.groups?.map((g) => (
          <div key={g.head}>
            <div className="pav-detail-features-head">{g.head}</div>
            {g.ordered
              ? <ol className="pav-detail-list pav-detail-list-num">{g.items.map((i) => <li key={i}>{i}</li>)}</ol>
              : <ul className="pav-detail-list">{g.items.map((i) => <li key={i}>{i}</li>)}</ul>}
          </div>
        ))}
        {card.note && <p className="pav-detail-note">{card.note}</p>}
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(card.name)}>Apply now</button>
      </div>
    </div>
  );
}

export function CorporateProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigate, onOpenApp }: Props) {
  const [category, setCategory] = useState<CorpCategory>(initialCategory);
  const [applyProduct, setApplyProduct] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<{ card: CardData; folio: string } | null>(null);

  useEffect(() => { if (isOpen) setCategory(initialCategory); }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const sections = SECTIONS[category];
  const copy = PAGE_COPY[category];
  const allCards = sections.flatMap(s => s.cards);
  const parsed = allCards.map(c => (c.price ? parsePrice(c.price) : null)).filter((n): n is number => n !== null);
  const maxPrice = parsed.length ? Math.max(...parsed) : null;
  const handleApply = (name: string) => setApplyProduct(name);
  const activeLabel: NavItem = category === "account" ? "Account" : category === "solutions" ? "Solutions & Credit Cards" : "Loan";
  let folioCounter = 0;

  return (
    <div className="pav-root fixed inset-0 z-50 overflow-y-auto">
      <style>{`
        
        .pav-root{
          --pav-ink:        #C8102E;   /* brand red: the primary button */
          --pav-panel:      #101828;   /* dark navy: structural bars (sub-nav, footer) */
          --pav-ink-soft:   var(--vk-fg);
          --pav-paper:      var(--vk-bg);
          --pav-paper-dim:  var(--vk-surface-2);
          --pav-gold:       #C8102E;   /* accent on light surfaces (focus ring): kept under its old name */
          --pav-accent-on-ink: #FF6B81; /* the same accent on navy: plain red is only 3.0:1 there */
          --pav-gold-dim:   var(--vk-gold-text);
          --pav-plum:       #A50F27;
          --pav-text-on-ink: #FFFFFF;
          --pav-text-muted-on-ink: #D0D5DD;
          --pav-text-body:  var(--vk-fg);
          --pav-text-muted: var(--vk-fg-muted);
          --pav-rule:       var(--vk-line);
          --pav-rule-on-ink: rgba(237,233,250,0.18);
          background: var(--pav-paper);
          color: var(--pav-text-body);
          font-family: var(--font-sans), sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .pav-root :focus-visible{ outline:2px solid var(--pav-gold); outline-offset:3px; }
          .pav-subnav :focus-visible, .pav-foot :focus-visible{ outline-color:var(--pav-accent-on-ink); }
        .pav-wrap{ max-width:1160px; margin:0 auto; padding:0 32px; }

        .pav-close{
          position:fixed; top:20px; right:20px; z-index:60;
          background:rgba(29,23,64,0.55); color:color-mix(in srgb, #EDE9FA var(--vk-wash), var(--vk-surface));
          border:1px solid rgba(237,233,250,0.3); border-radius:999px;
          width:38px; height:38px; display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:background 0.15s ease;
        }
        .pav-close:hover{ background:rgba(29,23,64,0.85); }

        .pav-subnav{ background:var(--pav-panel); border-bottom:1px solid var(--pav-rule-on-ink); }
        .pav-subnav-inner{
          display:flex; align-items:center; gap:4px; overflow-x:auto;
          padding:0 32px; max-width:1160px; margin:0 auto; height:46px;
        }
        .pav-subnav-item{
          font-family:var(--font-mono); font-size:12.5px; white-space:nowrap;
          padding:8px 16px; border-radius:2px; text-decoration:none; cursor:pointer;
          color:var(--pav-text-muted-on-ink); background:transparent; border:none;
          transition:color 0.15s ease, background 0.15s ease;
        }
        .pav-subnav-item:hover{ color:var(--pav-text-on-ink); }
        .pav-subnav-item.active{ color:#FFFFFF; background:var(--pav-ink); font-weight:600; }

        .pav-ledger-head{ padding:32px 0 8px; }
        .pav-ledger-head h2{ font-family:var(--font-display); font-weight:500; font-size:22px; margin:0; }
        .pav-ledger-head p{ font-family:var(--font-mono); font-size:12px; color:var(--pav-text-muted); margin:6px 0 0; }

        .pav-section-label{ font-family:var(--font-mono); font-size:11.5px; font-weight:600; color:var(--pav-gold-dim); text-transform:uppercase; letter-spacing:0.06em; margin:26px 0 14px; }

        .pav-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:8px; }
        .pav-card{
          position:relative;
          background:var(--vk-surface); border:1px solid var(--pav-rule); border-radius:2px;
          padding:28px 26px; display:flex; flex-direction:column;
          transition:box-shadow 0.2s ease, transform 0.2s ease;
        }
        .pav-card:hover{ box-shadow:0 12px 32px rgba(29,23,64,0.1); transform:translateY(-2px); }
        .pav-folio{ font-family:var(--font-mono); font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:14px; }
        .pav-badge{
          position:absolute; top:24px; right:26px;
          font-family:var(--font-mono); font-size:10px; font-weight:600;
          color:#ffffff; background:var(--pav-gold); padding:3px 9px; border-radius:2px;
        }
        .pav-acct-name{ font-family:var(--font-display); font-weight:500; font-size:20px; margin:0 0 14px; letter-spacing:-0.01em; padding-right:70px; }
        .pav-features{ list-style:none; margin:0 0 16px; padding:0; display:flex; flex-direction:column; gap:6px; }
        .pav-features li{ font-size:12.3px; color:var(--pav-ink-soft); line-height:1.5; padding-left:15px; position:relative; }
        .pav-features li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }

        .pav-gauge-block{ margin-bottom:18px; }
        .pav-gauge-label{ font-family:var(--font-mono); font-size:11px; color:var(--pav-text-muted); display:flex; justify-content:space-between; margin-bottom:8px; gap:8px; }
        .pav-gauge-label .pav-ceiling-val{ color:var(--vk-crimson-text); font-weight:600; }
        .pav-gauge{ position:relative; height:6px; background:var(--pav-paper-dim); border-radius:3px; overflow:visible; }
        .pav-gauge-fill{ position:absolute; top:0; left:0; height:100%; background:linear-gradient(90deg, var(--pav-plum), var(--pav-gold)); border-radius:3px; }
        .pav-gauge-marker{ position:absolute; top:50%; width:11px; height:11px; border-radius:50%; background:var(--pav-ink); border:2px solid var(--pav-gold); transform:translate(-50%,-50%); }
        .pav-gauge-ticks{ display:flex; justify-content:space-between; margin-top:7px; font-family:var(--font-mono); font-size:10px; color:var(--pav-text-muted); }

        .pav-price-block{ margin-top:auto; margin-bottom:16px; }
        .pav-price{ font-family:var(--font-mono); font-weight:600; font-size:28px; color:var(--vk-crimson-text); line-height:1; }
        .pav-price .pav-cur{ font-size:16px; vertical-align:top; margin-right:1px; }
        .pav-price-sub{ font-size:11px; color:var(--pav-text-muted); margin:6px 0 0; font-family:var(--font-mono); letter-spacing:0.02em; }
        .pav-cta-group{ display:flex; flex-direction:row; gap:9px; }
        .pav-btn{
          display:inline-block; font-family:var(--font-sans), sans-serif; font-size:13.5px; font-weight:600;
          text-decoration:none; padding:10px 20px; border-radius:2px; cursor:pointer;
          border:1px solid transparent; text-align:center; width:100%; transition:all 0.15s ease;
        }
        .pav-btn-primary{ background:var(--pav-ink); color:var(--pav-text-on-ink); }
        .pav-btn-primary:hover{ background:var(--pav-plum); }
        .pav-cta-group{ display:flex; flex-direction:column; gap:9px; margin-top:auto; }
        .pav-btn-secondary{ background:transparent; color:var(--vk-crimson-text); border-color:var(--pav-rule); }
        .pav-btn-secondary:hover{ background:var(--pav-paper-dim); border-color:var(--pav-gold-dim); }

        /* ── Account detail modal ── */
        .pav-detail-backdrop{ position:fixed; inset:0; z-index:70; background:rgba(29,23,64,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
        .pav-detail-card{ position:relative; background:var(--vk-surface); max-width:640px; width:100%; max-height:calc(100vh - 150px); overflow-y:auto; border-radius:4px; padding:40px 36px 32px; box-shadow:0 30px 80px rgba(29,23,64,0.35); }
        .pav-detail-close{ position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%; background:var(--pav-paper); color:var(--vk-crimson-text); border:1px solid var(--pav-rule); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .pav-detail-close:hover{ background:var(--pav-paper-dim); }
        .pav-detail-folio{ font-family:var(--font-mono); font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:10px; }
        .pav-detail-name{ font-family:var(--font-display); font-weight:500; font-size:26px; margin:0 0 8px; letter-spacing:-0.01em; color:var(--vk-crimson-text); }
        .pav-detail-tagline{ font-family:var(--font-display); font-style:italic; font-size:15px; color:var(--pav-plum); margin:0 0 20px; }
        .pav-detail-desc{ font-size:13.5px; line-height:1.7; color:var(--pav-ink-soft); margin:0 0 26px; padding-bottom:26px; border-bottom:1px solid var(--pav-rule); }
        .pav-detail-features-head{ font-size:13px; font-weight:600; color:var(--vk-crimson-text); margin-bottom:12px; }
        .pav-detail-features-head strong{ color:var(--pav-plum); }
        .pav-detail-features{ list-style:none; margin:0 0 28px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .pav-detail-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:16px; position:relative; }
        .pav-detail-features li::before{ content:"✓"; position:absolute; left:0; color:var(--pav-gold-dim); font-weight:600; }
        @media (max-width:480px){ .pav-detail-features{ grid-template-columns:1fr; } }
        .pav-price-text{ font-size:17px; line-height:1.3; }
        .pav-detail-stat{ display:flex; flex-direction:column; gap:2px; margin:-8px 0 24px; font-size:12.5px; color:var(--pav-text-muted); }
        .pav-detail-stat strong{ font-size:15px; color:var(--vk-crimson-text); }
        .pav-detail-list{ list-style:none; margin:0 0 24px; padding:0; display:flex; flex-direction:column; gap:7px; counter-reset:pav-n; }
        .pav-detail-list li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.55; padding-left:18px; position:relative; }
        .pav-detail-list li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }
        .pav-detail-list-num li{ counter-increment:pav-n; padding-left:24px; }
        .pav-detail-list-num li::before{ content:counter(pav-n) "."; font-weight:600; }
        .pav-detail-note{ font-size:11.5px; line-height:1.6; color:var(--pav-text-muted); margin:4px 0 24px; padding-top:16px; border-top:1px solid var(--pav-rule); }

        .pav-foot{ background:var(--pav-panel); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:var(--font-mono); margin-top:24px; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-accent-on-ink); font-weight:600; }

        @media (max-width:900px){ .pav-grid{ grid-template-columns:1fr; } }
        @media (prefers-reduced-motion:reduce){ .pav-root *{ transition:none !important; } }
      `}</style>

      <button className="pav-close" onClick={onClose} aria-label="Close">
        <X className="w-4 h-4" />
      </button>

      <nav className="pav-subnav">
        <div className="pav-subnav-inner">
          {SUB_NAV.map((item) => {
            const cat = CATEGORY_FOR_NAV[item];
            return (
              <button
                key={item}
                className={`pav-subnav-item${item === activeLabel ? " active" : ""}`}
                onClick={() => cat ? setCategory(cat) : onNavigate(item)}
              >
                {item}
              </button>
            );
          })}
        </div>
      </nav>

      {/* the same hero background as the Personal and Business pages */}
      <div className="relative overflow-hidden" style={{ background: "#C8102E" }}>
        <img loading="lazy" decoding="async" src={siteHeroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.14] mix-blend-luminosity" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative max-w-6xl mx-auto px-8 py-14 sm:py-16 flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div className="max-w-lg">
            <span className="inline-block text-[11px] font-bold tracking-[0.14em] uppercase mb-3" style={{ color: "#FFFFFF" }}>{copy.heroEyebrow}</span>
            <h1 className="text-3xl sm:text-4xl font-black leading-[1.1] text-white whitespace-pre-line">{copy.heroTitle}</h1>
            <p className="text-white/90 text-sm sm:text-base mt-4 max-w-lg">{copy.heroSubtitle}</p>
          </div>
          {/* the cut-out has hard edges, so every side fades out */}
          <img src={vinkCorporateTrain} alt="" width={1100} height={734} decoding="async"
            className="w-full max-w-[300px] sm:max-w-[420px] md:max-w-[460px] h-auto self-center md:self-auto shrink-0"
            style={{ WebkitMaskImage: "linear-gradient(to right, transparent, #000 16%, #000 88%, transparent), linear-gradient(to top, transparent, #000 14%, #000 90%, transparent)", WebkitMaskComposite: "source-in", maskImage: "linear-gradient(to right, transparent, #000 16%, #000 88%, transparent), linear-gradient(to top, transparent, #000 14%, #000 90%, transparent)", maskComposite: "intersect" }} />
        </div>
      </div>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: "14px" }}>
            <div>
              <h2>{copy.heading}</h2>
              <p>{copy.tag}</p>
            </div>
            {category === "account" && (
              <button onClick={onOpenApp} className="pav-btn pav-btn-primary" style={{ width: "auto", padding: "10px 20px" }}>
                Try the Corporate App
              </button>
            )}
          </div>

          {sections.map((sec) => (
            <div key={sec.label}>
              <div className="pav-section-label">{sec.label}</div>
              <div className="pav-grid">
                {sec.cards.map((c) => {
                  folioCounter++;
                  const folio = String(folioCounter).padStart(2, "0");
                  return <ProductCard key={c.name} card={c} folio={folio} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} onDetails={(card, f) => setDetailCard({ card, folio: f })} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />

      {applyProduct && (
        <ApplyModal isOpen={!!applyProduct} onClose={() => setApplyProduct(null)} product={applyProduct} />
      )}

      {detailCard && (
        <AccountDetailModal
          card={detailCard.card}
          folio={detailCard.folio}
          onClose={() => setDetailCard(null)}
          onApply={(name) => { setDetailCard(null); handleApply(name); }}
        />
      )}
    </div>
  );
}
