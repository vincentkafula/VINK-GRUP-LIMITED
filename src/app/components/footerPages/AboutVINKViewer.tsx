import { useEffect, useRef, type ReactNode } from "react";
import {
  X, Scale, Handshake, Star, Rocket, Lightbulb, ShieldCheck, Target, Globe2, MapPin, Building2, CreditCard, Smartphone,
  Wifi, Bus, Landmark, HeartHandshake, ArrowRight, Users,
} from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";
import { usePageTitle } from "../ds";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5C0A10";
const GOLD = "#C9A84C";

const STATS = [
  { v: "250,000+", l: "AFC devices" },
  { v: "15M", l: "daily commuters" },
  { v: "100%", l: "black-owned" },
  { v: "2018", l: "founded, Cape Town" },
];

const WHAT_WE_DO: { icon: ReactNode; title: string; desc: string }[] = [
  { icon: <Bus />, title: "Taxi and transport payments", desc: "Our AFC payment system lets passengers tap a card, scan a QR code or pay by phone on a minibus taxi, with balance enquiry, segmented charges and GPS location built in." },
  { icon: <Landmark />, title: "Everyday banking", desc: "Personal, business and corporate accounts, built around the people who already use our payment network." },
  { icon: <CreditCard />, title: "Cards", desc: "Debit and credit cards with rewards, instant notifications and a zero-liability guarantee on unauthorised transactions." },
  { icon: <Wifi />, title: "Global SIM", desc: "Connectivity for customers on the move: global coverage, high-speed data and clear calls on one SIM." },
  { icon: <Smartphone />, title: "The VINK app", desc: "Money, cards and travel in one place, with real-time fraud alerts sent straight to your phone." },
  { icon: <HeartHandshake />, title: "Safer, cleaner cities", desc: "A dedicated portion of VINK’s profits funds safer, cleaner, more inclusive cities, starting in seven cities across South Africa and Zambia." },
];

const VALUES: { icon: ReactNode; title: string; desc: string }[] = [
  { icon: <Scale />, title: "Integrity", desc: "We keep our promises, always, without compromise." },
  { icon: <Handshake />, title: "Honesty", desc: "We are transparent with customers, partners and regulators." },
  { icon: <Star />, title: "Customer excellence", desc: "We set the standard for service in South African fintech." },
  { icon: <Rocket />, title: "Empowerment", desc: "We build wealth and opportunity for taxi drivers, commuters and township communities." },
  { icon: <Lightbulb />, title: "Innovation", desc: "We bring world-class technology to the people who need it most." },
  { icon: <ShieldCheck />, title: "Anti-corruption", desc: "Zero tolerance. Always." },
];

const MILESTONES = [
  { year: "2018", text: "VINK incorporated (Reg: 2018/079316/07); AFC payment system developed." },
  { year: "2019", text: "Website launched; first taxi association partnerships established." },
  { year: "2020", text: "Driver Wallet, Smart Pay Card and Marshall Wallet products launched." },
  { year: "2021", text: "VINK MVNO agreement with Cell C; Nedbank API integration completed." },
  { year: "2022", text: "Business plan submitted for a R4.5 billion funding round." },
  { year: "Now", text: "Expansion to gyms, fuel stations and the VINK Online Store is under way." },
];

const SECTIONS = [
  { id: "about-story", label: "Our story" },
  { id: "about-purpose", label: "Mission & vision" },
  { id: "about-what", label: "What we do" },
  { id: "about-values", label: "Core values" },
  { id: "about-community", label: "Giving back" },
  { id: "about-ownership", label: "Ownership" },
  { id: "about-milestones", label: "Milestones" },
  { id: "about-office", label: "Head office" },
];

const go = (label: string) => window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label } }));

function Heading({ id, eyebrow, children }: { id: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{eyebrow}</p>
      <h2 id={id + "-h"} className="text-2xl font-bold text-crimson-text md:text-3xl">{children}</h2>
    </div>
  );
}

export function AboutVINKViewer({ isOpen, onClose }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  usePageTitle(isOpen ? "About VINK" : "");
  useEffect(() => { if (isOpen && scroller.current) scroller.current.scrollTop = 0; }, [isOpen]);
  if (!isOpen) return null;

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div ref={scroller} data-theme-aware className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-fg [&>*]:shrink-0">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-5 py-3 shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-5" /></button>
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden px-6 py-14 text-white md:py-20" style={{ background: `linear-gradient(135deg,#2E0B10 0%,${P} 55%,#7a1018 100%)` }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-20" style={{ background: `radial-gradient(circle,${GOLD} 0%,transparent 70%)` }} />
        <div className="relative mx-auto max-w-6xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "#E8D9B0" }}>
            <MapPin className="size-3.5" aria-hidden="true" /> Est. Cape Town, 2018
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-6xl">About VINK</h1>
          <p className="mt-2 text-lg font-medium text-white/90 md:text-xl">Vink Multi Services (Pty) Ltd.</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
            South Africa&apos;s first transport-native digital bank, built by a Cape Town native for the 15 million South Africans who board a minibus taxi every morning.
          </p>
          <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l} className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
                <dd className="text-xl font-bold leading-tight" style={{ color: "#E8D9B0" }}>{s.v}</dd>
                <dt className="text-xs uppercase tracking-wider text-white/75">{s.l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Section menu */}
      <nav aria-label="On this page" className="sticky top-[57px] z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)}
              className="inline-flex h-10 flex-shrink-0 items-center rounded-full px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-16 px-6 py-12">
        {/* Story */}
        <section id="about-story" aria-labelledby="about-story-h" className="scroll-mt-32">
          <Heading id="about-story" eyebrow="Who we are">Our story</Heading>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
              <p className="leading-relaxed">
                VINK was founded in 2018 in Cape Town by <strong>Vincent Kafula</strong>, a Cape Town native with deep roots in the public transport industry. Vincent saw a gap that no bank or fintech had filled: a payment system fast enough for the taxi industry, where 15 million South Africans board a minibus every single morning. He built one.
              </p>
              <p className="leading-relaxed">
                From a single idea in the Cape Town CBD to a fully developed AFC payment platform, VINK was born from the belief that financial tools should serve everyone, not just those with traditional banking histories.
              </p>
            </div>
            <aside className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg,#2E0B10,${P})` }}>
              <p className="text-3xl font-bold" style={{ color: "#E8D9B0" }}>R0.50</p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white/80">per taxi transaction</p>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                The lowest processing fee in the industry, shared across the ecosystem that makes each transaction possible: the financing bank, the driver&apos;s taxi association, neighbourhood watch initiatives in the area served, and a portion retained to seed a future VINK community bank built for taxi drivers.
              </p>
            </aside>
          </div>
        </section>

        {/* Mission & vision */}
        <section id="about-purpose" aria-labelledby="about-purpose-h" className="scroll-mt-32">
          <Heading id="about-purpose" eyebrow="Why we exist">Mission &amp; vision</Heading>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg,${P},#9B1C1C)` }}>
              <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-white/15 [&>svg]:size-6" aria-hidden="true"><Target /></span>
              <h3 className="mb-2 text-lg font-bold">Our mission</h3>
              <p className="text-sm leading-relaxed text-white/90">
                To develop integrated payment and financial services solutions for South Africa&apos;s public transport industry, empowering taxi operators, drivers and passengers with tools that are fast, affordable and built for their lives.
              </p>
            </div>
            <div className="rounded-2xl border-2 border-brand bg-surface p-6">
              <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand text-brand-fg [&>svg]:size-6" aria-hidden="true"><Globe2 /></span>
              <h3 className="mb-2 text-lg font-bold text-crimson-text">Our vision</h3>
              <p className="text-sm leading-relaxed text-fg-muted">
                To be the provider of high-value, high-quality and convergent AFC solutions to the taxi industry and public transport operators worldwide, and to build a pan-African financial services business that creates real economic opportunity in the communities we serve.
              </p>
            </div>
          </div>
        </section>

        {/* What we do */}
        <section id="about-what" aria-labelledby="about-what-h" className="scroll-mt-32">
          <Heading id="about-what" eyebrow="What we do">One network, many services</Heading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHAT_WE_DO.map((w) => (
              <li key={w.title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-surface-2 text-crimson-text [&>svg]:size-5" aria-hidden="true">{w.icon}</span>
                <h3 className="font-bold text-fg">{w.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{w.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Values */}
        <section id="about-values" aria-labelledby="about-values-h" className="scroll-mt-32">
          <Heading id="about-values" eyebrow="How we behave">Core values</Heading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((v) => (
              <li key={v.title} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md">
                <span className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg [&>svg]:size-5" aria-hidden="true">{v.icon}</span>
                <div>
                  <h3 className="font-bold text-fg">{v.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{v.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Giving back */}
        <section id="about-community" aria-labelledby="about-community-h" className="scroll-mt-32">
          <div className="grid items-center gap-6 rounded-3xl p-8 text-white md:grid-cols-[minmax(0,2fr)_auto]" style={{ background: `linear-gradient(135deg,#2E0B10,${P})` }}>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#E8D9B0" }}>Giving back</p>
              <h2 id="about-community-h" className="text-2xl font-bold md:text-3xl">Social Development</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
                A dedicated portion of VINK&apos;s profits funds programmes that help our cities become cleaner, safer, more inclusive and more economically vibrant. We are preparing to bring them to Cape Town, Johannesburg, Pretoria, Durban, Lusaka, Kitwe and Ndola, in partnership with local businesses, NGOs and non-profit organisations.
              </p>
            </div>
            <button type="button" onClick={() => { onClose(); go("Social Responsibility"); }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold" style={{ background: GOLD, color: "#14161d" }}>
              Learn more <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Ownership */}
        <section id="about-ownership" aria-labelledby="about-ownership-h" className="scroll-mt-32">
          <Heading id="about-ownership" eyebrow="Ownership">BBBEE &amp; ownership</Heading>
          <div className="flex gap-4 rounded-2xl border border-line bg-surface-2 p-6">
            <span className="hidden size-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg sm:flex [&>svg]:size-6" aria-hidden="true"><Users /></span>
            <p className="text-sm leading-relaxed md:text-base">
              VINK is a <strong>100% black-owned business</strong>. The founder, Vincent Kafula, holds 80% of the shares. The remaining shares are held by South African co-shareholders and beneficiaries, including a 10% stake held in trust for a minor beneficiary, reflecting the founder&apos;s commitment to generational wealth building.
            </p>
          </div>
        </section>

        {/* Milestones */}
        <section id="about-milestones" aria-labelledby="about-milestones-h" className="scroll-mt-32">
          <Heading id="about-milestones" eyebrow="Our journey">Company milestones</Heading>
          <ol className="relative space-y-6 border-l-2 pl-8" style={{ borderColor: P }}>
            {MILESTONES.map((m) => (
              <li key={m.year} className="relative">
                <span aria-hidden="true" className="absolute -left-[41px] top-1 flex size-5 items-center justify-center rounded-full border-2 border-surface" style={{ background: m.year === "Now" ? GOLD : P }} />
                <span className="inline-block rounded-md bg-surface-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-crimson-text">{m.year}</span>
                <p className="mt-2 text-sm leading-relaxed md:text-base">{m.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Head office */}
        <section id="about-office" aria-labelledby="about-office-h" className="scroll-mt-32">
          <Heading id="about-office" eyebrow="Find us">Head office</Heading>
          <div className="grid gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex gap-4">
              <span className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-crimson-text [&>svg]:size-6" aria-hidden="true"><Building2 /></span>
              <address className="not-italic">
                <p className="font-semibold">8 Rose Street, Cape Town CBD</p>
                <p className="text-sm text-fg-muted">State House Building, Cape Town, 8001</p>
                <p className="mt-2 text-xs text-fg-muted">Registration: 2018/079316/07 · CIPC registered · South Africa</p>
              </address>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => { onClose(); go("Contact Us"); }} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-brand-fg hover:opacity-90">Contact us <ArrowRight className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => { onClose(); go("Careers"); }} className="inline-flex h-11 items-center rounded-full border-2 border-brand px-6 text-sm font-semibold text-crimson-text hover:bg-surface-2">Careers</button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
