import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

const FOCUS_AREAS = [
  { icon: "🚌", title: "Transport Safety",          desc: "Taxi industry road safety campaigns, CCTV deployment, and community crime prevention initiatives." },
  { icon: "🎓", title: "Youth Entrepreneurship",    desc: "Business skills workshops for young people in Western Cape townships — equipping the next generation of South African entrepreneurs." },
  { icon: "🏘️", title: "Community Safety",          desc: "Neighbourhood watch and CCID community safety initiatives. 5% of every VINK taxi transaction goes directly to neighbourhood watch in the area served." },
  { icon: "⚽", title: "Grassroots Sport",           desc: "Football leagues, athletics, and martial arts at community level — supporting healthy, active communities." },
];

const ELIGIBILITY = [
  "Non-profit organisations, community sport teams, school programmes, or community events",
  "Priority given to Western Cape applicants; national applications considered",
  "Clear community benefit aligned with VINK values required",
  "Minimum request: R5,000 · Maximum: R500,000 per application",
];

export function SponsorshipViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Community Investment</span>
          <h1 className="text-4xl font-black mb-3">Sponsorship &amp; Community Investment</h1>
          <p className="text-white/80 text-lg max-w-2xl leading-relaxed">
            VINK sponsors programmes that uplift the communities our customers live and work in — with a focus on transport safety, youth education, township economic development, and sport.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-12">
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Our Focus Areas</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {FOCUS_AREAS.map((f, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <span className="text-3xl flex-shrink-0">{f.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 mb-1">{f.title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl p-6" style={{ background: "#F3F0FB" }}>
          <h2 className="text-xl font-black mb-4" style={{ color: P }}>Eligibility Criteria</h2>
          <ul className="space-y-3">
            {ELIGIBILITY.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs"
                  style={{ background: P }}>✓</span>
                <p className="text-gray-700 text-sm">{item}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-4" style={{ color: P }}>How to Apply</h2>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 text-sm text-gray-700">
            <p>Submit a sponsorship proposal to <a href="mailto:sponsorships@vink.co.za" className="font-bold" style={{ color: P }}>sponsorships@vink.co.za</a>.</p>
            <p><strong>Include in your proposal:</strong></p>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Organisation background and mission</li>
              <li>Event or programme details and dates</li>
              <li>Requested amount</li>
              <li>Expected community reach and impact</li>
              <li>Proof of NPO or community organisation registration</li>
            </ul>
            <p>VINK reviews applications on a <strong>quarterly basis</strong>. Successful applicants will be contacted within 6 weeks of the review date.</p>
          </div>
        </section>

        <section className="rounded-2xl p-8 text-center text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
          <h3 className="text-xl font-black mb-2">Ready to Apply?</h3>
          <p className="text-white/75 text-sm mb-4">Send your proposal to our sponsorship team.</p>
          <a href="mailto:sponsorships@vink.co.za"
            className="inline-block px-7 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
            style={{ background: GOLD, color: "#222" }}>
            sponsorships@vink.co.za
          </a>
        </section>
      </div>
    </div>
  );
}
