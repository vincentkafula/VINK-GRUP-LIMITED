import { X, Smartphone, Globe, MessageSquare, CreditCard } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const CHANNELS = [
  { icon: <Smartphone className="w-6 h-6" />, title: "VINK App", desc: "The primary way to manage your account — check your balance, view transactions in real time, freeze your card, and apply for new products. Available on iOS and Android at launch." },
  { icon: <Globe className="w-6 h-6" />, title: "Online Banking", desc: "Full account management from any browser, for the moments you're at a desk rather than on your phone. Same real-time transaction view as the app." },
  { icon: <MessageSquare className="w-6 h-6" />, title: "USSD Banking", desc: "Check your balance and recent transactions from any phone, no data or smartphone required — built for the commuters and drivers who need banking to work everywhere, not just on the latest device." },
  { icon: <CreditCard className="w-6 h-6" />, title: "Tap-and-Go (AFC Devices)", desc: "Your card works instantly at any VINK-enabled taxi validator or partner merchant terminal — no app needed for the transaction itself, just tap and go." },
];

export function BankingChannelsViewer({ isOpen, onClose }: Props) {
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
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Access Channels</span>
          <h1 className="text-4xl font-black mb-3">App, Online, and Other Ways to Bank</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            VINK is built to work wherever you are — smartphone, desktop, or neither.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. These channels go live when we launch in June 2027.
          </p>
        </section>

        <section>
          <div className="space-y-4">
            {CHANNELS.map((c, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200">
                <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#EAF7EE", color: P }}>{c.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 mb-1">{c.title}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Why So Many Channels?</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            South Africa's transport economy runs on every kind of device, from the latest smartphone to a basic feature phone. Banking that only works in an app leaves people out. VINK is designed so that no matter what device you're carrying, you can still check your balance, see your transactions, and know your money is where it should be.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
