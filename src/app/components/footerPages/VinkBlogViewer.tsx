import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";
import { BRAND } from "../../brand";

interface Props { isOpen: boolean; onClose: () => void; }
const P = BRAND.crimsonDeep;
const GOLD = BRAND.gold;

const THEMES = [
  { icon: "🚕", title: "Life on the Road", desc: "Real stories and practical money advice for taxi drivers, commuters, and the people who keep South Africa's transport economy moving." },
  { icon: "💡", title: "Financial Inclusion", desc: "How digital payment infrastructure can reach people traditional banking has left out — the thinking behind why VINK exists." },
  { icon: "🏦", title: "Banking Explained", desc: "Plain-language breakdowns of how fees, credit, and rewards actually work, without the jargon." },
  { icon: "📈", title: "Business Growth", desc: "Guidance for taxi associations, spaza shop owners, and small operators on managing cash flow and growing sustainably." },
];

export function VinkBlogViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
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

        <section className="rounded-2xl p-5" style={{ background: "var(--vk-warn-bg)", border: "1px solid color-mix(in srgb, #FDE68A var(--vk-wash), var(--vk-surface))" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--vk-warn)" }}>
            The blog hasn't published yet — VINK is not currently in full operation. The first posts go live alongside our June 2027 launch. What follows is a preview of what we'll be writing about.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: "var(--vk-crimson-text)" }}>What We'll Write About</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {THEMES.map((t, i) => (
              <div key={i} className="p-5 bg-surface rounded-xl border border-line">
                <span className="text-2xl mb-2 block">{t.icon}</span>
                <p className="font-bold text-fg mb-1">{t.title}</p>
                <p className="text-fg-muted text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-2 rounded-2xl p-6 border border-line">
          <h2 className="text-lg font-black mb-3" style={{ color: "var(--vk-crimson-text)" }}>Want to Be Notified?</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            We'll announce the blog's launch through our usual channels. In the meantime, our Social Responsibility page shares some of the thinking behind why we're building VINK the way we are.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
