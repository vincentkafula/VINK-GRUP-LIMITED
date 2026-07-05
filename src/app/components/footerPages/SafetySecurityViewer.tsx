import { X, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";

const HOW_VMS_PROTECTS = [
  { icon: "🔍", title: "Real-time fraud monitoring", desc: "Every transaction is monitored 24/7 by our fraud detection engine. Unusual activity is flagged within milliseconds." },
  { icon: "📱", title: "Instant notifications",       desc: "Receive an SMS and app notification for every purchase — before, during, and after the transaction." },
  { icon: "✅", title: "Zero-liability guarantee",    desc: "You will never be held responsible for unauthorised transactions. If something goes wrong, VMS makes it right." },
  { icon: "🔐", title: "Two-factor authentication",   desc: "All VMS app logins require 2FA — protecting your account even if your password is compromised." },
  { icon: "🔒", title: "256-bit AES encryption",      desc: "All data in transit and at rest is protected with bank-grade 256-bit AES encryption." },
  { icon: "🏦", title: "Nedbank backbone security",   desc: "VMS's Nedbank API integration provides an additional layer of bank-grade security infrastructure." },
];

const TIPS = [
  "Never share your PIN, OTP, or card number with anyone — including people claiming to be VMS staff.",
  "Protect against SIM swap fraud: register your number on your bank's SIM swap notification service.",
  "Shield your card when tapping at any terminal — check for unusual devices attached to AFC machines.",
  "Only shop on websites beginning with \"https://\" and look for the padlock in your browser address bar.",
  "If you receive a suspicious call, SMS, or email claiming to be VMS, do not respond — call our fraud line immediately.",
  "Set up transaction limits in the VMS app to cap spending if your card is compromised.",
  "Report a lost or stolen card immediately via the VMS app or call +27 (0)21 007 0772.",
  "Never click links in unsolicited emails or SMS messages claiming to be from VMS.",
];

const STEPS = [
  "Freeze your card immediately via the VMS app (Settings → Card → Freeze Card).",
  "Call our 24-hour fraud line: +27 (0)21 007 0772.",
  "Dispute the unauthorised transaction via the app or email support@vink.com.",
  "VMS will investigate and resolve confirmed fraud claims within 5 business days.",
  "A replacement card will be issued at no cost if fraud is confirmed.",
];

export function SafetySecurityViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-14 px-6 text-white" style={{ background: "linear-gradient(135deg,#0F172A,#1E3A5F)" }}>
        <div className="max-w-4xl mx-auto flex items-center gap-6">
          <Shield className="w-16 h-16 text-green-400 flex-shrink-0" />
          <div>
            <h1 className="text-4xl font-black mb-2">Safety &amp; Security</h1>
            <p className="text-white/70 text-base max-w-xl">How VMS protects your money, your data, and your identity — and what to do if something goes wrong.</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-12">

        {/* How VMS protects you */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>How VMS Protects You</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {HOW_VMS_PROTECTS.map((item, i) => (
              <div key={i} className="p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <span className="text-3xl block mb-3">{item.icon}</span>
                <p className="font-bold text-gray-900 text-sm mb-1">{item.title}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security tips */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Security Tips for Customers</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {TIPS.map((tip, i) => (
              <div key={i} className={`flex items-start gap-4 px-5 py-4 ${i < TIPS.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: P }}>{i + 1}</div>
                <p className="text-sm text-gray-700 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What to do if compromised */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <h2 className="text-2xl font-black" style={{ color: P }}>What to Do If Your Card Is Compromised</h2>
          </div>
          <div className="bg-orange-50 rounded-2xl border border-orange-200 p-5 space-y-3">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: "#F59E0B" }}>{i + 1}</div>
                <p className="text-sm text-gray-800 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Emergency contacts */}
        <section className="grid sm:grid-cols-2 gap-4">
          <a href="tel:+27210070772"
            className="flex items-center gap-4 p-5 rounded-2xl text-white transition-all hover:opacity-90 no-underline"
            style={{ background: "#EF4444" }}>
            <CheckCircle className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="text-xs opacity-80 font-semibold uppercase">24h Fraud Line</p>
              <p className="text-xl font-black">+27 (0)21 007 0772</p>
            </div>
          </a>
          <a href="tel:+27614615035"
            className="flex items-center gap-4 p-5 rounded-2xl text-white transition-all hover:opacity-90 no-underline"
            style={{ background: "#DC2626" }}>
            <CheckCircle className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="text-xs opacity-80 font-semibold uppercase">24h Fraud Line</p>
              <p className="text-xl font-black">+27 (0)61 461 5035</p>
            </div>
          </a>
        </section>
      </div>
    </div>
  );
}
