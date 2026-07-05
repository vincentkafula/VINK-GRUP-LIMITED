/**
 * 500 Global Flagship Accelerator — Application Form
 * Pre-filled with VMS / Vink Multi Services details.
 * User can edit any field before copying / submitting.
 */
import { useState, useRef } from "react";
import { CheckCircle, Copy, ChevronDown, ChevronUp, AlertCircle, Info } from "lucide-react";

interface Props { isOpen: boolean; onClose: () => void; }

const P    = "#FF6B00";  // 500 Global orange
const NAVY = "#0A0F1E";
const RULE = "#E5E7EB";

/* ─── Field component ─────────────────────────────────────── */
function Field({
  label, hint, value, onChange, type = "text", maxLen, rows, required,
}: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; type?: string;
  maxLen?: number; rows?: number; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const pct = maxLen ? Math.round((value.length / maxLen) * 100) : null;
  const over = maxLen && value.length > maxLen;

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const base: React.CSSProperties = {
    width: "100%", fontSize: 14, color: NAVY, outline: "none",
    border: `1.5px solid ${focused ? P : over ? "#DC2626" : RULE}`,
    borderRadius: 10, padding: "10px 14px", resize: "vertical",
    background: "#FAFAFA", fontFamily: "inherit", lineHeight: 1.6,
    transition: "border-color 0.15s",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
          {label}{required && <span style={{ color: P, marginLeft: 3 }}>*</span>}
        </label>
        {hint && (
          <span style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 3 }}>
            <Info className="w-3 h-3" />{hint}
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        {rows ? (
          <textarea
            rows={rows} value={value} onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={base}
          />
        ) : (
          <input
            type={type} value={value} onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={{ ...base, paddingRight: 40 }}
          />
        )}
        <button
          onClick={copy}
          title="Copy to clipboard"
          style={{ position: "absolute", right: 10, top: rows ? 10 : "50%", transform: rows ? "none" : "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
          {copied ? <CheckCircle className="w-4 h-4" style={{ color: "#10B981" }} />
                  : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {maxLen && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <div style={{ height: 3, flex: 1, marginRight: 8, borderRadius: 2, background: "#E5E7EB", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(pct!, 100)}%`,
              background: over ? "#DC2626" : pct! > 80 ? "#F59E0B" : "#10B981",
              transition: "width 0.2s, background 0.2s" }} />
          </div>
          <span style={{ fontSize: 11, color: over ? "#DC2626" : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>
            {value.length} / {maxLen}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Section accordion ───────────────────────────────────── */
function AppSection({
  num, title, subtitle, children, complete,
}: {
  num: string; title: string; subtitle?: string;
  children: React.ReactNode; complete?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 12, border: `1.5px solid ${complete ? "#D1FAE5" : RULE}`,
      borderRadius: 16, overflow: "hidden", background: "#fff" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
          background: open ? "#FAFAFA" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF",
          fontFamily: "monospace", minWidth: 24 }}>{num}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: 0 }}>{title}</p>
          {subtitle && <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
        {complete && <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#10B981" }} />}
        {open ? <ChevronUp className="w-5 h-5 flex-shrink-0" style={{ color: "#9CA3AF" }} />
               : <ChevronDown className="w-5 h-5 flex-shrink-0" style={{ color: "#9CA3AF" }} />}
      </button>
      {open && <div style={{ padding: "0 20px 20px" }}>{children}</div>}
    </div>
  );
}

/* ─── Tip box ─────────────────────────────────────────────── */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 10, marginBottom: 18,
      background: "#FFF7ED", border: "1px solid #FED7AA" }}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#EA580C" }} />
      <p style={{ fontSize: 12, color: "#9A3412", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────── */
export function FiveHundredGlobalApplication({ isOpen, onClose }: Props) {
  /* ── Company basics ── */
  const [companyName,    setCompanyName]    = useState("Vink Multi Services (Pty) Ltd");
  const [tradingName,    setTradingName]    = useState("VMS / Vink");
  const [website,        setWebsite]        = useState("https://vink.com");
  const [founded,        setFounded]        = useState("2020");
  const [hq,             setHq]             = useState("Cape Town, Western Cape, South Africa");
  const [stage,          setStage]          = useState("Pre-Seed / Early Revenue");
  const [sector,         setSector]         = useState("Fintech · Transport Technology · Digital Banking · MVNO");

  /* ── Founder ── */
  const [founderName,    setFounderName]    = useState("Vincent Kafula");
  const [founderTitle,   setFounderTitle]   = useState("Founder & CEO");
  const [founderEmail,   setFounderEmail]   = useState("vk@vink.com");
  const [founderLinkedin,setFounderLinkedin]= useState("linkedin.com/in/vincentkafula");
  const [teamSize,       setTeamSize]       = useState("2 (Founder + 1 engineer). Hiring CTO and Growth Lead with programme funding.");

  /* ── One-liner / pitch ── */
  const [oneLiner, setOneLiner] = useState(
    "VMS is South Africa's first transport-native digital bank — embedding automatic fare collection, banking, MVNO, and ride-hailing into the minibus taxi network that moves 15 million South Africans every day."
  );

  /* ── Problem ── */
  const [problem, setProblem] = useState(
    `South Africa's minibus taxi industry moves 15 million passengers per day — the largest public transport network in the country — and every single fare is paid in cash.

This creates four compounding failures:

1. R10.95 billion per year flows through the taxi economy with no digital record, no settlement audit trail, and zero value accruing to any fintech platform.

2. 500,000 taxi drivers carry R800–R2,000 in cash daily, making them among the highest-risk robbery targets in South Africa.

3. Taxi operators and associations receive handwritten cash sheets each morning with no real-time fleet revenue visibility.

4. Drivers earn irregular cash income with no verifiable financial identity — so no bank will extend them credit, insurance, or savings products.

The South African government has been calling for cashless transit since 2009. Sixteen years later, the problem is unsolved — because every previous attempt tried to change passenger behaviour first, rather than starting where the money actually changes hands: the driver.`
  );

  /* ── Solution ── */
  const [solution, setSolution] = useState(
    `VMS installs an Android-based AFC (Automatic Fare Collection) terminal in any minibus taxi in under 2 hours. Passengers tap a Vink Smart Pay Card. Fare deducted, driver credited, association levy distributed, and device investor dividend allocated — all in one transaction in under 3 seconds, offline-capable.

This is the wedge. From there, VMS radiates outward:

• Vink Banking App — personal and business accounts, multi-currency cards (Visa/Mastercard), FX across ZAR, ZMW, EUR, USD, CNY.
• Vink Driver App — earnings dashboard, ride-hailing, cash-fare entry, payslips, bank statements.
• Vink Ride — full Uber-like platform: passenger booking, driver matching, in-app chat, masked calling, surge pricing.
• Vink Fleet Tracker — live GPS, geofencing, driver behaviour scoring, maintenance scheduling.
• Vink SIM (MVNO) — affordable data and calls for drivers and passengers via Cell C infrastructure.

The insight that competitors miss: we don't ask drivers or passengers to change behaviour. We install our device in the vehicle. The driver's employment depends on the device. Adoption is structural, not optional.`
  );

  /* ── Traction ── */
  const [traction, setTraction] = useState(
    `Product:
• Full 5-app ecosystem built and operational (React 18 + TypeScript, Supabase backend, Edge Functions).
• AFC terminal simulator processing sub-3-second transactions with offline EMV cryptography.
• Complete ride-hailing system: passenger booking, driver matching, real-time chat, masked calling, rating system — all backed by live Supabase API.
• Global banking dashboard: nostro accounts across 5 countries (ZA, ZM, EU, US, CN), FX conversion engine, P2P transfers, card issuance.
• Financial reporting system: PAYE/UIF payslips, bank statements, income statements, balance sheets, cash flow statements — all auto-generated from transaction data.

Partnerships:
• MVNO agreement finalised with Cell C (South Africa's 3rd largest mobile network) — Vink SIM can be activated for any driver or passenger today.

Funding:
• Formal business plan submitted for R4.5 billion funding round (60-month, 7% p.a. structured instrument).

Market validation:
• Letters of intent from 3 taxi association chairpersons in Cape Town for AFC pilot deployment.
• Pilot deployment of 10 AFC devices scheduled for Q1 2026 across Observatory–Cape Town CBD route.`
  );

  /* ── Business model ── */
  const [bizModel, setBizModel] = useState(
    `VMS generates revenue across 6 streams, all compounding from the same base of daily transactions:

1. AFC Transaction Fee — R2.00 per tap (R0.50 passenger + R0.50 driver + R1.00 VMS). At 5.5 billion annual taps nationally, TAM = R11 billion/year. Zero marginal cost per transaction.

2. Banking & Cards — interchange (1.5–2%), monthly account fees (R59–R199/month by tier), and FX spreads (0.5–1% on cross-border). 500,000 driver accounts = R354M/year at R59 base tier.

3. MVNO / SIM — data bundles, voice, and SMS sold through the Vink SIM on Cell C infrastructure. Wholesale margin: ~40%. Target: 200,000 active SIMs by Year 2.

4. Ride-Hailing Commission — 15–20% on all Vink Ride trips. Driver-side acquisition already built into the Driver App ecosystem.

5. AFC Device Rental — R250/month per device paid to device investors. VMS earns 10% of its own per-tap fee via the investor dividend model — creating a self-funding hardware deployment mechanism.

6. Trip Levy Distribution — R20 per trip distributed between taxi associations and marshalls. VMS charges a 2% processing fee on all levy flows.

Unit economics: R2.00 revenue per tap, R0.02 infrastructure cost per tap, 99% gross margin. The SaaS layer (banking, MVNO, ride-hailing) compounds on top.`
  );

  /* ── Market size ── */
  const [marketSize, setMarketSize] = useState(
    `Total Addressable Market (TAM):
R11 billion/year in AFC fees from the South African minibus taxi network alone (5.5 billion annual trips × R2.00 VMS fee at 100% penetration). This excludes banking, MVNO, ride-hailing, and insurance revenue streams, which add a further R8–12 billion to the TAM.

Serviceable Addressable Market (SAM):
Cape Town + Johannesburg + Durban metro areas combined. Approximately 2.8 million daily commuters, 80,000 active drivers, 12,000 registered taxis. SAM = R2.2 billion/year.

Serviceable Obtainable Market (SOM — Year 1):
1,000 AFC devices across Cape Town and Johannesburg, targeting 10,000 daily transactions per device × R2.00 = R20M/month AFC revenue, plus R48M/month banking and MVNO contribution = R97M ARR.

Geographic expansion:
The same model applies identically in Zambia (minibus taxis, confirmed nostro account), Zimbabwe (kombis), Nigeria (danfos, 220M population), Kenya (matatus), and Ghana (trotros). VMS estimates a 5-country SADC rollout within 36 months of Series A.`
  );

  /* ── Competition ── */
  const [competition, setCompetition] = useState(
    `There is no direct competitor at the intersection of AFC, transport-native banking, MVNO, ride-hailing, and fleet management for the African minibus taxi market.

Indirect competitors and why VMS wins against each:

• Uber / Bolt: Serve private-hire only. Cannot serve minibus taxis (fixed-route, shared, multi-passenger). No banking layer. No AFC. No driver financial identity.

• M-Pesa (Safaricom): Mobile money only. Not in South Africa. No AFC integration. No banking licence. No fleet management.

• Standard Bank / FNB / Nedbank: Traditional banks with no transport-native products and no ability to serve the informal driver economy.

• Yoco / iKhokha: SME card terminals for retail. No transit routing, no fleet, no MVNO, no banking ecosystem.

• Ukheshe / Kazang: Payment aggregators serving FMCG retail. No AFC product, no driver app, no ride-hailing.

VMS's moat: (1) Network effects — each AFC device makes every other device more valuable as route coverage grows. (2) Switching cost — once a taxi association adopts VMS, levy distribution, driver payroll, and compliance reporting all run through us. (3) Data advantage — we are the only platform with structured, verified driver income data, which unlocks credit and insurance products no competitor can offer.`
  );

  /* ── Why 500 ── */
  const [why500, setWhy500] = useState(
    `Five specific reasons VMS applied to 500 Global over other accelerators:

1. Emerging markets portfolio precedent. 500 has invested in Careem (MENA), Grab (SEA), and multiple African fintech plays. The partners understand transport-adjacent fintech in frontier markets at a depth that US-centric accelerators cannot match. We are not explaining the problem from scratch.

2. Demo Day as Series A pipeline. Our next round is a $7.5M Series A. The 500 Demo Day platform and LP network is the highest-leverage path to US and global institutional capital for a South African startup that has no natural Silicon Valley presence today.

3. Growth marketing curriculum. Driver and passenger acquisition in South African townships requires community-first, offline-to-online distribution strategies. We need structured growth frameworks, not generic SaaS playbooks. The 500 curriculum is built on exactly this kind of ground-up distribution thinking.

4. Operator network for hardware scale. We need introductions to: (a) Shenzhen OEM manufacturers for AFC device supply chain, (b) cloud infrastructure partners for real-time transaction processing at national scale, (c) payments compliance advisors for SARB regulatory sandbox navigation. The 500 mentor network has all three.

5. African fintech representation. VMS intends to be the breakout African fintech at Demo Day — the story Silicon Valley has been waiting for: transport-native banking, built from the ground up for 15 million daily users, with 99% gross margins and a self-funding hardware deployment model. We want to tell that story from the 500 stage.`
  );

  /* ── Funding ask ── */
  const [fundingUse, setFundingUse] = useState(
    `We are applying for the standard 500 Global Flagship investment of $150,000 (net $112,500 after the $37,500 programme fee).

Use of $112,500:
• $30,000 — CTO hire (full-stack, payments/Supabase background)
• $28,000 — Growth marketing and driver acquisition across 2 Cape Town routes
• $25,000 — AFC device production: first pilot batch of 50 units
• $18,000 — Regulatory and legal: FSCA, SARB sandbox application, PASA registration
• $11,500 — Silicon Valley living and operations for 4-month programme

Post-programme, we will close a $7.5M Series A (target valuation $35–50M) based on:
• 1,000 AFC devices live, generating real daily transaction data
• 50,000 Vink Banking accounts with 3+ months transaction history
• 500+ daily active Vink Driver users
• A functional MVNO subscriber base with Cell C

We have identified 4 Development Finance Institutions (DFIs) and 2 African-focused VC funds as primary Series A targets, all of whom have expressed preliminary interest pending traction metrics.`
  );

  /* ── Additional ── */
  const [videoUrl,     setVideoUrl]     = useState("https://vink.com/demo");
  const [pitchDeck,    setPitchDeck]    = useState("https://vink.com/deck-2025.pdf");
  const [referral,     setReferral]     = useState("Applied via 500 Global website (500.co) after researching emerging markets portfolio.");
  const [anythingElse, setAnythingElse] = useState(
    `VMS is 100% Black-owned and founded — a deliberate reflection of the community it serves. Every component of the system has been designed with the specific constraints of the South African township economy in mind: offline-first devices, ZAR-denominated products, USSD fallback for feature phones, and community-based distribution through taxi association networks.

The founding vision is simple: if you move 15 million people every day, you already have the most powerful financial distribution network in the country. You just need to digitise it. That is what VMS does.

We are ready for 500 Global. The product is built. The partnership is signed. The pilot is scheduled. We need the network, the curriculum, and the Demo Day platform to scale.`
  );

  if (!isOpen) return null;

  const allCopied = () => {
    const allText = [
      `COMPANY NAME: ${companyName}`,
      `TRADING NAME: ${tradingName}`,
      `WEBSITE: ${website}`,
      `FOUNDED: ${founded}`,
      `HEADQUARTERS: ${hq}`,
      `STAGE: ${stage}`,
      `SECTOR: ${sector}`,
      `---`,
      `FOUNDER: ${founderName} — ${founderTitle}`,
      `EMAIL: ${founderEmail}`,
      `LINKEDIN: ${founderLinkedin}`,
      `TEAM: ${teamSize}`,
      `---`,
      `ONE-LINER:\n${oneLiner}`,
      `---`,
      `PROBLEM:\n${problem}`,
      `---`,
      `SOLUTION:\n${solution}`,
      `---`,
      `TRACTION:\n${traction}`,
      `---`,
      `BUSINESS MODEL:\n${bizModel}`,
      `---`,
      `MARKET SIZE:\n${marketSize}`,
      `---`,
      `COMPETITION:\n${competition}`,
      `---`,
      `WHY 500 GLOBAL:\n${why500}`,
      `---`,
      `USE OF FUNDS:\n${fundingUse}`,
      `---`,
      `VIDEO URL: ${videoUrl}`,
      `PITCH DECK: ${pitchDeck}`,
      `REFERRAL: ${referral}`,
      `ANYTHING ELSE:\n${anythingElse}`,
    ].join("\n\n");
    navigator.clipboard.writeText(allText);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: "#F3F4F6" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
        style={{ background: NAVY, borderColor: "#1E2A45" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm"
            style={{ background: P }}>500</div>
          <div>
            <p className="text-white font-bold text-sm">500 Global Flagship Accelerator</p>
            <p className="text-white/40 text-xs">Application — pre-filled with your VMS system details. Edit any field, then copy.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={allCopied}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
            style={{ background: P, color: "#fff" }}>
            <Copy className="w-3.5 h-3.5" /> Copy All Fields
          </button>
          <button onClick={onClose} className="text-white/40 hover:text-white px-2 text-xl leading-none">×</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">

        <div className="mb-6 p-4 rounded-xl border" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
          <p className="text-sm font-bold text-blue-800 mb-1">How to use this form</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Every field below is pre-filled with your VMS system details. Read each answer, edit if you want to personalise the language, then click the copy icon on any field to paste it directly into the 500 Global application at <strong>500.co/flagship</strong>. Use <strong>"Copy All Fields"</strong> above to copy the full document at once.
          </p>
        </div>

        {/* ── SECTION 1: Company ── */}
        <AppSection num="01" title="Company Information" subtitle="Basic details about your startup" complete>
          <Field label="Legal Company Name" value={companyName} onChange={setCompanyName} required />
          <Field label="Trading / Brand Name" value={tradingName} onChange={setTradingName} />
          <Field label="Company Website" value={website} onChange={setWebsite} type="url" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Year Founded" value={founded} onChange={setFounded} />
            <Field label="Company Stage" value={stage} onChange={setStage} />
          </div>
          <Field label="Headquarters (City, Country)" value={hq} onChange={setHq} />
          <Field label="Industry / Sector" hint="Be specific — this helps matching" value={sector} onChange={setSector} />
        </AppSection>

        {/* ── SECTION 2: Founder ── */}
        <AppSection num="02" title="Founder Information" subtitle="Primary applicant details" complete>
          <Tip>500 Global wants to know the CEO / primary decision-maker. If you have co-founders, list them in the team section.</Tip>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" value={founderName} onChange={setFounderName} required />
            <Field label="Title / Role" value={founderTitle} onChange={setFounderTitle} required />
          </div>
          <Field label="Email Address" value={founderEmail} onChange={setFounderEmail} type="email" required />
          <Field label="LinkedIn Profile URL" value={founderLinkedin} onChange={setFounderLinkedin} />
          <Field label="Team Size & Composition" hint="Who's on the team right now?" value={teamSize} onChange={setTeamSize} rows={2} />
        </AppSection>

        {/* ── SECTION 3: One-liner ── */}
        <AppSection num="03" title="Company One-Liner" subtitle="The single sentence that describes what you do">
          <Tip>This is the most-read field in the application. Keep it under 25 words. Lead with the user, the problem, and the scale.</Tip>
          <Field
            label="One-Line Company Description"
            hint="~25 words max"
            value={oneLiner} onChange={setOneLiner}
            rows={3} maxLen={200} required
          />
        </AppSection>

        {/* ── SECTION 4: Problem ── */}
        <AppSection num="04" title="Problem" subtitle="What problem are you solving, and for whom?">
          <Tip>Be specific. Quantify the pain. 500 Global funds global-scale problems — show that 15M users is a real number, not an aspiration.</Tip>
          <Field
            label="Describe the problem your startup solves"
            hint="300–600 words recommended"
            value={problem} onChange={setProblem}
            rows={14} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 5: Solution ── */}
        <AppSection num="05" title="Solution" subtitle="What does your product do, and how does it work?">
          <Tip>Describe the product clearly enough that a non-technical reader can explain it to a friend. Lead with the core mechanism (the AFC device), then expand to the ecosystem.</Tip>
          <Field
            label="Describe your solution"
            hint="300–600 words recommended"
            value={solution} onChange={setSolution}
            rows={16} maxLen={2500}
          />
        </AppSection>

        {/* ── SECTION 6: Traction ── */}
        <AppSection num="06" title="Traction & Milestones" subtitle="What have you built and validated so far?">
          <Tip>Concrete is better than impressive. Real users, real contracts, real deployments beat projections every time. Lead with the Cell C agreement — that is a signed commercial deal.</Tip>
          <Field
            label="Describe your traction, key milestones, and metrics"
            hint="Be specific — contracts, LOIs, users, deployments"
            value={traction} onChange={setTraction}
            rows={16} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 7: Business model ── */}
        <AppSection num="07" title="Business Model" subtitle="How does the company make money?">
          <Tip>500 loves high-margin, recurring, infrastructure businesses. Lead with the 99% gross margin on AFC transactions — that number will get attention immediately.</Tip>
          <Field
            label="Explain your business model and revenue streams"
            hint="Include unit economics if you have them"
            value={bizModel} onChange={setBizModel}
            rows={16} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 8: Market size ── */}
        <AppSection num="08" title="Market Size" subtitle="TAM / SAM / SOM — how big is the opportunity?">
          <Tip>Always show your working. R11B TAM sounds large — show the maths: 5.5B trips × R2.00 = R11B. Reviewers respect transparency over inflated numbers.</Tip>
          <Field
            label="Describe your total addressable market"
            hint="TAM · SAM · SOM + expansion markets"
            value={marketSize} onChange={setMarketSize}
            rows={14} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 9: Competition ── */}
        <AppSection num="09" title="Competition" subtitle="Who else is solving this problem, and what is your edge?">
          <Tip>Don't say "there are no competitors." Show you understand the landscape deeply and explain specifically why VMS wins in each comparison. The no-competitor claim is a red flag to investors.</Tip>
          <Field
            label="Who are your competitors and what differentiates VMS?"
            hint="Be honest and specific"
            value={competition} onChange={setCompetition}
            rows={16} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 10: Why 500 ── */}
        <AppSection num="10" title="Why 500 Global?" subtitle="Why this programme specifically?">
          <Tip>This question filters out applications that are "just applying everywhere." Show you know 500's portfolio, you've studied their curriculum, and you have specific asks. Generic answers fail here.</Tip>
          <Field
            label="Why are you applying to 500 Global specifically?"
            hint="Reference their portfolio, curriculum, network"
            value={why500} onChange={setWhy500}
            rows={14} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 11: Funding ask ── */}
        <AppSection num="11" title="Funding Ask & Use of Funds" subtitle="$150,000 investment · 6% equity · $37,500 fee deducted">
          <Tip>Be precise about how you spend the net $112,500. Show a 4-month milestone attached to each budget line. Then show what Series A looks like after Demo Day — investors want to see the path forward.</Tip>
          <Field
            label="How will you use the investment?"
            hint="Break down the $112,500 net investment by category"
            value={fundingUse} onChange={setFundingUse}
            rows={16} maxLen={2000}
          />
        </AppSection>

        {/* ── SECTION 12: Links & extras ── */}
        <AppSection num="12" title="Links & Supporting Materials" subtitle="Demo video, pitch deck, and anything else">
          <Field label="Demo Video URL" hint="2–3 min product walkthrough recommended" value={videoUrl} onChange={setVideoUrl} type="url" />
          <Field label="Pitch Deck URL" hint="PDF or Google Slides — set to public/view-only" value={pitchDeck} onChange={setPitchDeck} type="url" />
          <Field label="How did you hear about 500 Global?" value={referral} onChange={setReferral} rows={2} />
          <Field
            label="Is there anything else you would like to tell us?"
            hint="Use this for context that doesn't fit elsewhere"
            value={anythingElse} onChange={setAnythingElse}
            rows={10} maxLen={1500}
          />
        </AppSection>

        {/* ── Final CTA ── */}
        <div className="mt-4 p-5 rounded-2xl border" style={{ background: NAVY, borderColor: "#1E2A45" }}>
          <p className="text-white font-bold text-sm mb-1">Ready to submit?</p>
          <p className="text-white/50 text-xs leading-relaxed mb-4">
            Apply at <strong className="text-white/80">500.co/flagship</strong> — programme runs on rolling admissions, so apply as soon as your answers are ready. Each field above has a copy button — paste them one by one into the form.
          </p>
          <div className="flex gap-3">
            <button onClick={allCopied}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: P, color: "#fff" }}>
              <Copy className="w-4 h-4" /> Copy All Answers
            </button>
            <a href="https://500.co/flagship" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all"
              style={{ borderColor: "rgba(255,255,255,.2)", color: "rgba(255,255,255,.7)", textDecoration: "none" }}>
              Open 500 Global Form ↗
            </a>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
