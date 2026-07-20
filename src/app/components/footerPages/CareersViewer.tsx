import { X, MapPin, Briefcase, Clock } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const GOLD = "#F5A623";

const BENEFITS = [
  { icon: "💰", title: "Competitive Salaries",     desc: "Market-rate salaries with annual performance reviews" },
  { icon: "🏠", title: "Hybrid Working",            desc: "Flexible hybrid arrangements for Cape Town-based roles" },
  { icon: "📚", title: "Learning Budget",            desc: "Annual development budget per employee" },
  { icon: "💪", title: "Gym Access",                 desc: "Planet Fitness, Zones & Virgin Active at R20/visit" },
  { icon: "🌴", title: "21 Days Leave",              desc: "Annual leave plus all South African public holidays" },
  { icon: "🎯", title: "Mission-Driven",             desc: "Work that genuinely changes lives — not just another bank" },
];

const ROLES = [
  { title: "Senior Software Engineer",           dept: "Backend / API",           location: "Cape Town",   type: "Permanent" },
  { title: "AFC Device Installation Technician", dept: "Operations",              location: "Western Cape", type: "Contract" },
  { title: "Business Development Manager",       dept: "Sales",                   location: "Cape Town",   type: "Permanent" },
  { title: "Compliance Officer",                 dept: "Legal & Compliance",      location: "Cape Town",   type: "Permanent" },
  { title: "UX/UI Designer",                     dept: "Product",                 location: "Cape Town",   type: "Permanent" },
  { title: "Customer Support Agent",             dept: "Client Services",         location: "Cape Town",   type: "Permanent" },
  { title: "Data Analyst",                       dept: "Finance",                 location: "Cape Town",   type: "Permanent" },
  { title: "Taxi Industry Relations Manager",    dept: "Business Development",    location: "Cape Town",   type: "Permanent" },
  { title: "Payroll & HR Administrator",         dept: "Human Resources",         location: "Cape Town",   type: "Permanent" },
  { title: "Marketing Coordinator",              dept: "Marketing",               location: "Cape Town",   type: "Permanent" },
];

const STEPS = [
  "Browse open roles below and find your fit",
  "Submit your CV and a brief motivation letter via the online form",
  "Shortlisted candidates contacted within 5 business days",
  "Interview process: one screening call + one in-person or video panel",
];

export function CareersViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-20 px-6 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg,#1B1837 0%,${P} 60%,#7B4DB5 100%)` }}>
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Join the Team</span>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            Build the Future of<br />African Payments.
          </h1>
          <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
            At VINK, you&apos;re not just building software — you&apos;re building the financial infrastructure for 15 million South Africans who take a taxi every day.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "rgba(255,255,255,.15)" }}>
              🚀 {ROLES.length} Open Roles
            </span>
            <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "rgba(255,255,255,.15)" }}>
              📍 Cape Town, South Africa
            </span>
            <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "rgba(255,255,255,.15)" }}>
              🌍 100% Black-Owned
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-12">

        {/* Benefits */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Why Work at VINK?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map((b, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-purple-200 hover:bg-purple-50 transition-all">
                <span className="text-2xl">{b.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{b.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-snug">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Open Roles */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Open Roles</h2>
          <div className="space-y-3">
            {ROLES.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow group cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm group-hover:text-purple-700 transition-colors">{r.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-500"><Briefcase className="w-3 h-3" />{r.dept}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{r.location}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3 h-3" />{r.type}</span>
                  </div>
                </div>
                <button className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90"
                  style={{ background: P }}>Apply</button>
              </div>
            ))}
          </div>
        </section>

        {/* How to Apply */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>How to Apply</h2>
          <div className="relative pl-6 border-l-2" style={{ borderColor: P }}>
            {STEPS.map((step, i) => (
              <div key={i} className="mb-5 relative">
                <div className="absolute -left-[30px] top-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black"
                  style={{ background: P }}>{i + 1}</div>
                <p className="text-gray-700 text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 p-5 rounded-2xl border-2" style={{ borderColor: P }}>
            <p className="text-sm font-semibold text-gray-800 mb-1">Application Email</p>
            <a href="mailto:careers@vink.co.za" className="font-bold text-lg" style={{ color: P }}>careers@vink.co.za</a>
          </div>
        </section>

        {/* Graduate Programme */}
        <section className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg,#1B1837,${P})` }}>
          <h2 className="text-xl font-black mb-2">Graduate &amp; Internship Programme</h2>
          <p className="text-white/80 text-sm leading-relaxed mb-4">
            VINK offers a 12-month paid internship programme for recent graduates in Computer Science, Finance, Marketing, and Business Management. Applications open annually in January.
          </p>
          <a href="mailto:intern@vink.co.za" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-white transition-all hover:opacity-90"
            style={{ color: P }}>
            Email intern@vink.co.za
          </a>
        </section>
      </div>
    </div>
  );
}
