import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { ApplyModal } from "./ApplyModal";
import { publicApi } from "../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void }

const BRAND      = "#4B2D9E";
const BRAND_DARK = "#3a2180";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News", "Get Help"];
const ACTIVE_IDX = 9;

const NEWS_TABS = ["News", "Careers", "Property", "Autotrader", "Marketplaces"];

const ARTICLES = [
  { thumb: "linear-gradient(135deg,#1a3a5c,#2980b9)", tag: null,            title: "Splurge exposed: Leather loungers, skinny jeans and R10 000 for a bucket",                                              time: "12h ago" },
  { thumb: "linear-gradient(135deg,#5c1a1a,#c0392b)", tag: null,            title: "Top job after murder charges provisionally withdrawn",                                                                    time: "12h ago" },
  { thumb: "linear-gradient(135deg,#1a5c1a,#27ae60)", tag: "LIVE",          title: "BREAKING NEWS LIVE | Veld fire leads to OR Tambo International Airport closing one of its two runways...",             time: "12h ago" },
  { thumb: "linear-gradient(135deg,#4a1a5c,#8e44ad)", tag: "FOR SUBSCRIBERS",title: "Adriaan Basson | We have the people to fix SA. So let's do it",                                                       time: "12h ago" },
  { thumb: "linear-gradient(135deg,#1a4a5c,#16a085)", tag: null,            title: "Senzo Meyiwa: One of the accused claims existence of second docket has prejudiced him",                                 time: "12h ago" },
  { thumb: "linear-gradient(135deg,#5c4a1a,#d4ac0d)", tag: "Sponsored Content", title: "Stand a chance to win a Nokia X10 smartphone Valued at R6,999 this Women's Month",                               time: null },
];

const MORE_NEWS = [
  { bg: "linear-gradient(135deg,#1a7a2e,#27ae60)", title: "Senzo Meyiwa: One of the accused claims existence of second docket has prejudiced him" },
  { bg: "linear-gradient(135deg,#1a3a5c,#2980b9)", title: "Senzo Meyiwa: One of the accused claims existence of second docket has prejudiced him" },
  { bg: "linear-gradient(135deg,#5c1a1a,#c0392b)", title: "Senzo Meyiwa: One of the accused claims existence of second docket has prejudiced him" },
];

const TRENDING = [
  "BREAKING NEWS LIVE | Veld fire leads to OR Tambo International Airport closing one of its two runways",
  "Malema says EFF will kiss frogs to reach its destination",
  "Richards Bay surgeon faces shock murder charge after death of patient",
  "SILENCED | Tembisa Hospital splurge exposed: Leather loungers, skinny jeans and R10 000 for a bucket",
  "'They'll soon take over our homes': Sabie residents gripped by fear as zama zamas divert services",
];

export function BusinessNewsViewer({ isOpen, onClose, onNavigate }: Props) {
  const [activeNewsTab, setActiveNewsTab] = useState("News");
  const [insureForm, setInsureForm] = useState({ first: "", last: "", contact: "" });
  const [newsletter, setNewsletter] = useState({ name: "", email: "" });
  const [subscribing, setSubscribing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

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
          <button key={item} onClick={() => onNavigate(item)} style={{ textDecoration: "none", color: i === ACTIVE_IDX ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 13, padding: "13px 16px", whiteSpace: "nowrap", borderBottom: `3px solid ${i === ACTIVE_IDX ? "#fff" : "transparent"}`, fontWeight: i === ACTIVE_IDX ? 600 : 400, background: "transparent", border: "none", borderBottomWidth: 3, borderBottomStyle: "solid", borderBottomColor: i === ACTIVE_IDX ? "#fff" : "transparent", cursor: "pointer", fontFamily: "inherit" }}>{item}</button>
        ))}
      </nav>

      {/* News sub-nav */}
      <div style={{ background: "#f7f7f9", borderBottom: "1px solid #e8e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 0 }}>
          {NEWS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveNewsTab(tab)}
              style={{ background: "transparent", border: "none", color: activeNewsTab === tab ? BRAND : "#5a5a72", fontWeight: activeNewsTab === tab ? 700 : 500, fontSize: 13, padding: "12px 16px", borderBottom: `2px solid ${activeNewsTab === tab ? BRAND : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Subscribe</button>
          <button style={{ background: "transparent", color: BRAND, border: `1.5px solid ${BRAND}`, borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign in</button>
        </div>
      </div>

      {/* News layout: main + sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }} className="news-layout-grid">
        <style>{`@media(max-width:960px){.news-layout-grid{grid-template-columns:1fr!important}}`}</style>

        {/* ── MAIN CONTENT ── */}
        <div>
          {/* Hero placeholder */}
          <div style={{ width: "100%", height: 220, background: "linear-gradient(135deg,#1a3a5c,#2980b9)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "flex-end", padding: 20 }}>
            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600 }}>Featured Story</span>
          </div>

          {/* Articles grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }} className="articles-grid">
            <style>{`@media(max-width:600px){.articles-grid{grid-template-columns:1fr!important}}`}</style>
            {ARTICLES.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, cursor: "pointer", padding: "10px 0", borderBottom: "1px solid #f0f0f5" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fafafa"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <div style={{ width: 80, height: 60, borderRadius: 6, flexShrink: 0, background: a.thumb }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {a.tag && (
                    <div style={{
                      fontSize: 10, fontWeight: 700, marginBottom: 4, display: "inline-block", padding: "2px 6px", borderRadius: 3,
                      background: a.tag === "LIVE" ? "#e74c3c" : a.tag === "FOR SUBSCRIBERS" ? BRAND : "#f0f0f0",
                      color: a.tag === "Sponsored Content" ? "#5a5a72" : "#fff",
                    }}>{a.tag}</div>
                  )}
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1e1e2e", lineHeight: 1.4, margin: 0 }}>{a.title}</p>
                  {a.time && <p style={{ fontSize: 11, color: "#5a5a72", marginTop: 4 }}>{a.time}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* More News */}
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1e1e2e", marginBottom: 16 }}>More News</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="more-news-grid">
            <style>{`@media(max-width:600px){.more-news-grid{grid-template-columns:1fr!important}}`}</style>
            {MORE_NEWS.map((n, i) => (
              <div key={i} style={{ cursor: "pointer" }}>
                <div style={{ width: "100%", height: 120, borderRadius: 8, marginBottom: 10, background: n.bg }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "#1e1e2e", lineHeight: 1.4 }}>{n.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Trending */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${BRAND}` }}>Title Comes Here</h4>
            {TRENDING.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < TRENDING.length - 1 ? 14 : 0, paddingBottom: i < TRENDING.length - 1 ? 14 : 0, borderBottom: i < TRENDING.length - 1 ? "1px solid #e8e8f0" : "none" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: BRAND, flexShrink: 0, width: 24 }}>{i + 1}</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1e1e2e", lineHeight: 1.4, margin: 0 }}>{t}</p>
              </div>
            ))}
          </div>

          {/* Car Insurance Quote */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ width: "100%", height: 120, background: "linear-gradient(135deg,#b8860b,#daa520)" }} />
            <div style={{ padding: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: BRAND, marginBottom: 14 }}>Start a Car Insurance Quote</h4>
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
                A Friendly advisor will call you back<br />Licensed insurer and FSP. Premiums are risk profile dependent. Ts and Cs apply
              </p>
            </div>
          </div>

          {/* Newsletter */}
          <div style={{ border: "1.5px solid #e8e8f0", borderRadius: 10, padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 6, paddingBottom: 10, borderBottom: `2px solid ${BRAND}` }}>Newsletters</h4>
            <p style={{ fontSize: 13, color: "#1e1e2e", margin: "12px 0 10px" }}>State of the Nation · Weekly</p>
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
        <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 6 }}>Terms and Conditions Apply</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>*These four Business Platinum Checkings meet different needs — choose what&apos;s right for you.</p>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>Note: Shari&apos;ah-compliant investment options are available on request.</p>
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
