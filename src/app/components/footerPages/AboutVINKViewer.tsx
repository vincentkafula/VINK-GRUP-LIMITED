import { useEffect, useRef, type ReactNode } from "react";
import {
  X, Scale, Handshake, Star, Rocket, Lightbulb, ShieldCheck, Target, Globe2, MapPin, CreditCard, Smartphone,
  Wifi, Bus, Landmark, HeartHandshake, ArrowRight,
} from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";
import { usePageTitle } from "../ds";
import { BRAND } from "../../brand";

interface Props { isOpen: boolean; onClose: () => void; }

const P = BRAND.crimson;

const STATS = [
  { v: "15M", l: "daily taxi commuters in SA (the market)" },
  { v: "15,000", l: "devices planned, Western Cape year one" },
  { v: "250,000+", l: "devices: our 5-year goal" },
  { v: "Jun 2027", l: "planned launch" },
];

const WHAT_WE_DO: { icon: ReactNode; title: string; desc: string }[] = [
  { icon: <Bus />, title: "Taxi and transport payments", desc: "Our AFC payment system is designed to let passengers tap a card, scan a QR code or pay by phone on a minibus taxi, paying the driver within seconds, with balance enquiry, segmented charges and GPS location built in." },
  { icon: <Landmark />, title: "Everyday banking", desc: "Planned personal, business and corporate accounts, built around the people who use our payment network." },
  { icon: <CreditCard />, title: "Cards", desc: "Planned debit and credit cards for drivers, owners, investors and commuters, issued through a sponsor bank." },
  { icon: <Wifi />, title: "Global SIM", desc: "A planned connectivity product for customers on the move. Our mobile network partner is yet to be agreed." },
  { icon: <Smartphone />, title: "The VINK app", desc: "Money, cards and travel in one place, with real-time fraud alerts, as we roll out." },
  { icon: <HeartHandshake />, title: "Safer, cleaner cities", desc: "We plan to fund programmes for safer, cleaner, more inclusive cities from a portion of VINK’s profits, starting in seven cities across South Africa and Zambia." },
];

const VALUES: { icon: ReactNode; title: string; desc: string }[] = [
  { icon: <Scale />, title: "Integrity", desc: "We keep our promises, always, without compromise." },
  { icon: <Handshake />, title: "Honesty", desc: "We are transparent with customers, partners and regulators." },
  { icon: <Star />, title: "Customer excellence", desc: "We set the standard for service in Southern African fintech." },
  { icon: <Rocket />, title: "Empowerment", desc: "We build wealth and opportunity for taxi drivers, commuters and township communities." },
  { icon: <Lightbulb />, title: "Innovation", desc: "We bring world-class technology to the people who need it most." },
  { icon: <ShieldCheck />, title: "Anti-corruption", desc: "Zero tolerance. Always." },
];

const SECTIONS = [
  { id: "about-story", label: "Our story" },
  { id: "about-purpose", label: "Mission & vision" },
  { id: "about-what", label: "What we are building" },
  { id: "about-values", label: "Core values" },
  { id: "about-community", label: "Giving back" },
];

const go = (label: string) => window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label } }));

function Heading({ id, eyebrow, children }: { id: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-8 text-center">
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{eyebrow}</p>
      <h2 id={id + "-h"} className="text-2xl font-bold text-crimson-text md:text-4xl">{children}</h2>
      <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-14 rounded-full" style={{ background: P }} />
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
      <header className="relative overflow-hidden px-6 py-14 text-white md:py-20" style={{ background: "#C8102E" }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-20" style={{ background: `radial-gradient(circle,#FFFFFF 0%,transparent 70%)` }} />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full opacity-10" style={{ background: "radial-gradient(circle,#FFFFFF 0%,transparent 70%)" }} />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "#FFFFFF" }}>
            <MapPin className="size-3.5" aria-hidden="true" /> Est. Cape Town, 2018
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-6xl">About VINK</h1>
          <p className="mt-2 text-lg font-medium text-white/90 md:text-xl">Vink Group (Pty) Ltd, trading as VINK</p>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
            We aim to be Southern Africa&apos;s first transport-native digital bank, built by a Cape Town native for the 15 million South Africans who board a minibus taxi every morning.
          </p>
          <dl className="mx-auto mt-10 grid w-full max-w-4xl grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-5 backdrop-blur-sm">
                <dd className="text-2xl font-bold leading-tight md:text-3xl" style={{ color: "#FFFFFF" }}>{s.v}</dd>
                <dt className="text-xs uppercase tracking-wider text-white/75">{s.l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Status: where we are today */}
      <div role="note" className="border-b border-line bg-surface-2 px-6 py-3 text-center text-sm text-fg">
        <strong>Where we are today:</strong> VINK is not yet operational. Our full launch is planned for June 2027. Everything on this page describes what we are building and our goals.
      </div>

      {/* Section menu */}
      <nav aria-label="On this page" className="sticky top-[57px] z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 [justify-content:safe_center]">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)}
              className="inline-flex h-10 flex-shrink-0 items-center rounded-full px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-20 px-6 py-14">
        {/* Story */}
        <section id="about-story" aria-labelledby="about-story-h" className="scroll-mt-32">
          <Heading id="about-story" eyebrow="Who we are">Our story</Heading>
          <div className="mx-auto flex max-w-4xl flex-col gap-6 text-center">
            <div className="space-y-4 rounded-3xl border border-line bg-surface p-8 shadow-card md:p-10">
              <p className="leading-relaxed">
                VINK was founded in 2018 in Cape Town by <strong>Vincent Kafula</strong>, a Cape Town native with deep roots in the public transport industry. Vincent saw a gap that no bank or fintech had filled: a payment system fast enough for the taxi industry, where 15 million South Africans board a minibus every single morning. He set out to build one.
              </p>
              <p className="leading-relaxed">
                VINK began from a simple observation: sitting in a taxi, it is hard for drivers to collect fares and to give change, especially in the morning. Drivers also depend on each fare to buy fuel and keep working. We are building a system that pays them within seconds, works on every route, and serves everyone, not just people with traditional banking histories.
              </p>
            </div>
            <aside className="rounded-3xl p-8 text-center text-white md:p-10" style={{ background: `linear-gradient(135deg,#101828,${P})` }}>
              <p className="text-5xl font-bold" style={{ color: "#FFFFFF" }}>R0.50</p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white/80">planned fee per taxi transaction</p>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
                Planned to be shared across the ecosystem that makes each transaction possible: the financing bank, the driver&apos;s taxi association, neighbourhood watch initiatives in the area served, and a portion retained to seed a future VINK community bank built for taxi drivers.
              </p>
            </aside>
          </div>
        </section>

        {/* Mission & vision */}
        <section id="about-purpose" aria-labelledby="about-purpose-h" className="scroll-mt-32">
          <Heading id="about-purpose" eyebrow="Why we exist">Mission &amp; vision</Heading>
          <div className="mx-auto grid max-w-5xl gap-6 text-center md:grid-cols-2">
            <div className="rounded-3xl p-8 text-white shadow-card" style={{ background: `linear-gradient(135deg,${P},#A50F27)` }}>
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/15 [&>svg]:size-7" aria-hidden="true"><Target /></span>
              <h3 className="mb-2 text-xl font-bold">Our mission</h3>
              <p className="text-sm leading-relaxed text-white/90">
                To develop integrated payment and financial services solutions for Southern Africa&apos;s public transport industry, empowering taxi operators, drivers and passengers with tools that are fast, affordable and built for their lives.
              </p>
            </div>
            <div className="rounded-3xl border-2 border-brand bg-surface p-8 shadow-card">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-fg [&>svg]:size-7" aria-hidden="true"><Globe2 /></span>
              <h3 className="mb-2 text-xl font-bold text-crimson-text">Our vision</h3>
              <p className="text-sm leading-relaxed text-fg-muted">
                To be the provider of high-value, high-quality and convergent AFC solutions to the taxi industry and public transport operators worldwide, and to build a pan-African financial services business that creates real economic opportunity in the communities we serve.
              </p>
            </div>
          </div>
        </section>

        {/* What we do */}
        <section id="about-what" aria-labelledby="about-what-h" className="scroll-mt-32">
          <Heading id="about-what" eyebrow="What we are building">One network, many services</Heading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHAT_WE_DO.map((w) => (
              <li key={w.title} className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand text-brand-fg [&>svg]:size-6" aria-hidden="true">{w.icon}</span>
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
              <li key={v.title} className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <span className="flex size-12 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-crimson-text ring-2 ring-brand [&>svg]:size-6" aria-hidden="true">{v.icon}</span>
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
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl p-8 text-center text-white md:p-12" style={{ background: `linear-gradient(135deg,#101828,${P})` }}>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#FFFFFF" }}>Giving back</p>
              <h2 id="about-community-h" className="text-2xl font-bold md:text-3xl">Social Development</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
                We plan to dedicate a portion of VINK&apos;s profits to programmes that help our cities become cleaner, safer, more inclusive and more economically vibrant. We are preparing to bring them to Cape Town, Johannesburg, Pretoria, Durban, Lusaka, Kitwe and Ndola, in partnership with local businesses, NGOs and non-profit organisations.
              </p>
            </div>
            <button type="button" onClick={() => { onClose(); go("Social Responsibility"); }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold" style={{ background: "#ffffff", color: BRAND.crimson }}>
              Learn more <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
