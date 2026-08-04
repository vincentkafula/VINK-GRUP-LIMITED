import { useState, useEffect } from "react";
import { X, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { ApplyModal } from "./ApplyModal";
import { publicApi, newsApi, type NewsArticleSummary } from "../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void }

const BRAND      = "#0B5C2E";
const BRAND_DARK = "#0F3D24";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News", "Get Help"];
const ACTIVE_IDX = 9;

const NEWS_TABS = ["All", "World", "Africa", "Business", "Technology", "Sport", "Entertainment", "Opinion"];

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function BusinessNewsViewer({ isOpen, onClose, onNavigate }: Props) {
  const [activeNewsTab, setActiveNewsTab] = useState("All");
  const [articles, setArticles] = useState<NewsArticleSummary[]>([]);
  const [trending, setTrending] = useState<NewsArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [insureForm, setInsureForm] = useState({ first: "", last: "", contact: "" });
  const [newsletter, setNewsletter] = useState({ name: "", email: "" });
  const [subscribing, setSubscribing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      newsApi.list({ category: activeNewsTab === "All" ? undefined : activeNewsTab, limit: 12 }),
      newsApi.trending(),
    ]).then(([listRes, trendRes]) => {
      if (listRes.success) setArticles(listRes.data ?? []);
      if (trendRes.success) setTrending(trendRes.data ?? []);
    }).finally(() => setLoading(false));
  }, [isOpen, activeNewsTab]);

  if (!isOpen) return null;

  const handleNewsletterSubscribe = async () => {
    if (!newsletter.email.includes("@")) { toast.error("Please enter a valid email address."); return; }
    setSubscribing(true);
    const r = await publicApi.newsletter(newsletter.email);
    setSubscribing(false);
    if (r.success) { toast.success("Subscribed! Check your inbox for confirmation."); setNewsletter({ name: "", email: "" }); }
    else toast.error(r.error ?? "Couldn't subscribe right now — please try again.");
  };

  const handleInsuranceQuote = () => {
    if (!insureForm.first || !insureForm.last || !insureForm.contact) { toast.error("Please fill in your name and contact number."); return; }
    onNavigate("Insure");
  };

  const [lead, ...rest] = articles;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#fff", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 15 }}>

      {/* Top nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #e8e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img src={vinkLogo} alt="VINK" style={{ height: 38, width: "auto", objectFit: "contain" }} />
          <ul style={{ display: "flex", gap: 4, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
            {TOP_NAV.map((item, i) => (
              <li key={item}><a href="#" style={{ textDecoration: "none", color: i === 1 ? BRAND : "#5a5a72", fontSize: 14, fontWeight: i === 1 ? 600 : 400, padding: "8px 12px", borderRadius: 4, display: "block" }}>{item}</a></li>
            ))}
          </ul>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontSize: 14, cursor: "pointer" }}>🔒 Login</button>
          <button onClick={onClose} style={{ background: "transparent", border: "1.5px solid #e8e8f0", borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#5a5a72" }} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Business sub-nav */}
      <nav style={{ background: BRAND, display: "flex", padding: "0 32px", overflowX: "auto" }}>
        {BIZ_SUBNAV.map((item, i) => (
          <button key={item} onClick={() => onNavigate(item)} style={{ textDecoration: "none", color: i === ACTIVE_IDX ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 13, padding: "13px 16px", whiteSpace: "nowrap", background: "transparent", border: "none", borderBottomWidth: 3, borderBottomStyle: "solid", borderBottomColor: i === ACTIVE_IDX ? "#fff" : "transparent", fontWeight: i === ACTIVE_IDX ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>{item}</button>
        ))}
      </nav>

      {/* News sub-nav */}
      <div style={{ background: "#f7f7f9", borderBottom: "1px solid #e8e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {NEWS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveNewsTab(tab)}
              style={{ background: "transparent", border: "none", color: activeNewsTab === tab ? BRAND : "#5a5a72", fontWeight: activeNewsTab === tab ? 700 : 500, fontSize: 13, padding: "12px 14px", borderBottom: `2px solid ${activeNewsTab === tab ? BRAND : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={handleNewsletterSubscribe} style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Subscribe</button>
        </div>
      </div>

      {/* News layout: main + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }} className="news-layout-grid">
        <style>{`@media(max-width:960px){.news-layout-grid{grid-template-columns:1fr!important}}`}</style>

        {/* ── MAIN CONTENT ── */}
        <div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} /></div>
          ) : articles.length === 0 ? (
            <p style={{ color: "#5a5a72", padding: "40px 0", textAlign: "center" }}>No stories in this category yet.</p>
          ) : (
            <>
              {lead && (
                <div style={{ display: "flex", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #e8e8f0", cursor: "pointer" }}>
                  <div style={{ width: 160, height: 110, borderRadius: 8, flexShrink: 0, background: lead.heroGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{lead.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, display: "inline-block", padding: "2px 6px", borderRadius: 3, background: `${BRAND}15`, color: BRAND }}>{lead.category}</div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: "#1e1e2e", lineHeight: 1.4, margin: 0 }}>{lead.title}</p>
                    <p style={{ fontSize: 13, color: "#5a5a72", marginTop: 6, lineHeight: 1.5 }}>{lead.summary}</p>
                    <p style={{ fontSize: 11, color: "#9a9ab0", marginTop: 8 }}>{timeAgo(lead.publishedAt)} · {lead.readMinutes} min read</p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 32 }}>
                {rest.map(a => (
                  <div key={a.slug} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #f0f0f5", cursor: "pointer" }}>
                    <div style={{ width: 80, height: 60, borderRadius: 6, flexShrink: 0, background: a.heroGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{a.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, display: "inline-block", padding: "2px 6px", borderRadius: 3, background: `${BRAND}15`, color: BRAND }}>{a.category}</div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#1e1e2e", lineHeight: 1.4, margin: 0 }}>{a.title}</p>
                      <p style={{ fontSize: 11, color: "#9a9ab0", marginTop: 4 }}>{timeAgo(a.publishedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Trending */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${BRAND}`, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp className="w-4 h-4" /> Most Read
            </h4>
            {trending.map((t, i) => (
              <div key={t.slug} style={{ display: "flex", gap: 12, marginBottom: i < trending.length - 1 ? 14 : 0, paddingBottom: i < trending.length - 1 ? 14 : 0, borderBottom: i < trending.length - 1 ? "1px solid #e8e8f0" : "none" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: BRAND, flexShrink: 0, width: 24 }}>{i + 1}</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1e1e2e", lineHeight: 1.4, margin: 0 }}>{t.title}</p>
              </div>
            ))}
          </div>

          {/* Business Insurance Quote */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ width: "100%", height: 120, background: `linear-gradient(135deg,${BRAND},#128A43)` }} />
            <div style={{ padding: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: BRAND, marginBottom: 14 }}>Get a Business Insurance Quote</h4>
              {[
                { label: "First Name", key: "first" as const, type: "text" },
                { label: "Last Name",  key: "last" as const,  type: "text" },
                { label: "Contact Number", key: "contact" as const, type: "tel" },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 11, color: "#5a5a72", marginBottom: 3 }}>{f.label}</label>
                  <input type={f.type} value={insureForm[f.key]}
                    onChange={e => setInsureForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", border: "1px solid #e8e8f0", borderRadius: 4, padding: "7px 10px", fontSize: 13, color: "#1e1e2e", outline: "none" }} />
                </div>
              ))}
              <button style={{ width: "100%", background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 }}
                onClick={handleInsuranceQuote}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Submit</button>
              <p style={{ fontSize: 10, color: "#5a5a72", marginTop: 8, lineHeight: 1.4, textAlign: "center" }}>
                A VINK advisor will call you back<br />Licensed insurer and FSP. Premiums are risk profile dependent. Ts and Cs apply
              </p>
            </div>
          </div>

          {/* Newsletter */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 6, paddingBottom: 10, borderBottom: `2px solid ${BRAND}` }}>VINK Business Newsletter</h4>
            <p style={{ fontSize: 13, color: "#1e1e2e", margin: "12px 0 10px" }}>Top stories across business, technology, and world news · Weekly</p>
            {[
              { label: "First Name",     key: "name" as const,  type: "text" },
              { label: "Email Address",  key: "email" as const, type: "email" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 11, color: "#5a5a72", marginBottom: 3 }}>{f.label}</label>
                <input type={f.type} value={newsletter[f.key]}
                  onChange={e => setNewsletter(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", border: "1px solid #e8e8f0", borderRadius: 4, padding: "7px 10px", fontSize: 13, color: "#1e1e2e", outline: "none" }} />
              </div>
            ))}
            <button style={{ width: "100%", background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: 10, fontSize: 13, fontWeight: 600, cursor: subscribing ? "default" : "pointer", opacity: subscribing ? 0.7 : 1, marginTop: 10 }}
              disabled={subscribing} onClick={handleNewsletterSubscribe}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>{subscribing ? "Subscribing..." : "Subscribe"}</button>
          </div>

        </div>
      </div>

      {/* T&C Banner */}
      <div style={{ textAlign: "center", background: "#f7f7f9", padding: "28px 24px" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 6 }}>Ready to Grow Your Business with VINK?</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>Explore business accounts, credit, loans, and insurance built around how your business actually operates.</p>
        <button style={{ marginTop: 14, background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onClick={() => setApplyOpen(true)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Continue an Application</button>
      </div>

      <Footer />

      <ApplyModal isOpen={applyOpen} onClose={() => setApplyOpen(false)} product="Business Services Enquiry" />
    </div>
  );
}
