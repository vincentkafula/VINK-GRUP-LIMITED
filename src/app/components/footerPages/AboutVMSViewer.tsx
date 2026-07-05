import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }

const VALUES = [
  { icon: "⚖️", title: "Integrity",        desc: "We keep our promises, always, without compromise." },
  { icon: "🤝", title: "Honesty",           desc: "We are transparent with customers, partners, and regulators." },
  { icon: "⭐", title: "Customer Excellence", desc: "We set the standard for service in South African fintech." },
  { icon: "🚀", title: "Empowerment",       desc: "We build wealth and opportunity for taxi drivers, commuters, and township communities." },
  { icon: "💡", title: "Innovation",        desc: "We bring world-class technology to the people who need it most." },
  { icon: "🛡️", title: "Anti-Corruption",   desc: "Zero tolerance. Always." },
];

const MILESTONES = [
  { year: "2018", text: "VMS incorporated (Reg: 2018/079316/07); AFC payment system developed." },
  { year: "2019", text: "Website launched; first taxi association partnerships established." },
  { year: "2020", text: "Driver Wallet, Smart Pay Card, and Marshall Wallet products launched." },
  { year: "2021", text: "VMS MVNO agreement with Cell C; Nedbank API integration completed." },
  { year: "2022", text: "Business plan submitted for R4.5 billion funding round." },
  { year: "Now",  text: "Expansion to gyms, fuel stations, and Vink Online Store underway." },
];

const P = "#5B2D8E";
const GOLD = "#F5A623";

export function AboutVMSViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="relative py-20 px-6 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 50%,#7B4DB5 100%)` }}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle at 70% 50%,#fff,transparent 60%)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>
            Est. Cape Town, 2018
          </span>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            About Vink Multi<br />Services (Pty) Ltd.
          </h1>
          <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
            South Africa&apos;s first transport-native digital bank — built by a Cape Town native, for the 15 million South Africans who board a minibus taxi every morning.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-6 max-w-lg">
            {[{ v: "250,000+", l: "AFC Devices" }, { v: "15M", l: "Daily Commuters" }, { v: "100%", l: "Black-Owned" }].map((s, i) => (
              <div key={i}>
                <p className="text-2xl font-black" style={{ color: GOLD }}>{s.v}</p>
                <p className="text-white/60 text-xs mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-12">

        {/* Founding Story */}
        <section>
          <h2 className="text-2xl font-black mb-4" style={{ color: P }}>Our Founding Story</h2>
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <p className="text-gray-700 leading-relaxed mb-4">
              Vink Group (Pty) Ltd. was founded in 2018 in Cape Town by <strong>Vincent Kafula</strong> — a Cape Town native with deep roots in the public transport industry. Vincent saw a gap that no bank or fintech had filled: a payment system fast enough for the taxi industry, where 15 million South Africans board a minibus every single morning. He built one.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              From a single idea in the Cape Town CBD to a fully developed AFC payment platform, VMS was born from the belief that financial tools should serve everyone — not just those with traditional banking histories.
            </p>
            <p className="text-gray-600 leading-relaxed">
              VMS charges just R0.50 per taxi transaction — the lowest processing fee in the industry. Of that: 10% goes to the financing bank, 5% to the driver&apos;s taxi association, 5% to neighbourhood watch in the area served, and 10% is retained to seed a future VMS community bank specifically designed for taxi drivers.
            </p>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="text-lg font-black mb-3">Our Mission</h3>
            <p className="text-white/85 text-sm leading-relaxed">
              To develop integrated payment and financial services solutions for South Africa&apos;s public transport industry, empowering taxi operators, drivers, and passengers with tools that are fast, affordable, and built for their lives.
            </p>
          </div>
          <div className="rounded-2xl p-6 border-2" style={{ borderColor: P }}>
            <div className="text-3xl mb-3">🌍</div>
            <h3 className="text-lg font-black mb-3" style={{ color: P }}>Our Vision</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              To be the provider of high-value, high-quality, and convergent AFC solutions to taxi industry and public transport operators worldwide — and to build a pan-African financial services business that creates real economic opportunity in the communities we serve.
            </p>
          </div>
        </section>

        {/* Core Values */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Core Values</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VALUES.map((v, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <span className="text-2xl flex-shrink-0">{v.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{v.title}</p>
                  <p className="text-gray-500 text-xs mt-1 leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BBBEE */}
        <section className="rounded-2xl p-6" style={{ background: "#F3F0FB" }}>
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>BBBEE &amp; Ownership</h2>
          <p className="text-gray-700 text-sm leading-relaxed">
            VMS is a <strong>100% black-owned business</strong>. The founder, Vincent Kafula, holds 80% of the shares. The remaining shares are held by South African co-shareholders and beneficiaries — including a 10% stake held in trust for a minor beneficiary, reflecting the founder&apos;s commitment to generational wealth building.
          </p>
        </section>

        {/* Timeline */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Company Milestones</h2>
          <div className="relative pl-6 border-l-2" style={{ borderColor: P }}>
            {MILESTONES.map((m, i) => (
              <div key={i} className="mb-6 relative">
                <div className="absolute -left-[29px] top-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-black"
                  style={{ background: P }}>•</div>
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ background: "#EDE9FE", color: P }}>{m.year}</span>
                <p className="text-gray-700 text-sm mt-2 leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Head Office */}
        <section className="rounded-2xl p-6 bg-gray-900 text-white">
          <h2 className="text-lg font-black mb-3">Head Office</h2>
          <p className="text-white/80 text-sm">8 Rose Street, Cape Town CBD<br />State House Building, Cape Town, 8001</p>
          <p className="text-white/60 text-xs mt-2">Registration: 2018/079316/07 · CIPC Registered · South Africa</p>
        </section>
      </div>
    </div>
  );
}
