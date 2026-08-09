import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const THEMES = [
  { icon: "🚕", title: "Life on the Road", desc: "Real stories and practical money advice for taxi drivers, commuters, and the people who keep South Africa's transport economy moving." },
  { icon: "💡", title: "Financial Inclusion", desc: "How digital payment infrastructure can reach people traditional banking has left out — the thinking behind why VINK exists." },
  { icon: "🏦", title: "Banking Explained", desc: "Plain-language breakdowns of how fees, credit, and rewards actually work, without the jargon." },
  { icon: "📈", title: "Business Growth", desc: "Guidance for taxi associations, spaza shop owners, and small operators on managing cash flow and growing sustainably." },
];

export function VinkBlogViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,#0F172A,${P})` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Coming Soon</span>
          <h1 className="text-4xl font-black mb-3">The VINK Blog</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            Stories, insights, and practical guidance for the people VINK is built for.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            The blog hasn't published yet — VINK is not currently in full operation. The first posts go live alongside our June 2027 launch. What follows is a preview of what we'll be writing about.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>What We'll Write About</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {THEMES.map((t, i) => (
              <div key={i} className="p-5 bg-white rounded-xl border border-gray-200">
                <span className="text-2xl mb-2 block">{t.icon}</span>
                <p className="font-bold text-gray-900 mb-1">{t.title}</p>
                <p className="text-gray-600 text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Want to Be Notified?</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            We'll announce the blog's launch through our usual channels. In the meantime, VINK at the World Economic Forum and Social Responsibility already share some of the thinking behind why we're building VINK the way we are.
          </p>
        </section>
      </div>
    </div>
  );
}
