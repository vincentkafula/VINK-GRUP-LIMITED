import { useState } from "react";
import { CheckCircle, ArrowRight, User, Shield, CreditCard, Smartphone, Star, X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

const P = "#5B2D8E";
const GOLD = "#F5A623";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type OnboardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { n: 1, label: "Welcome" },
  { n: 2, label: "Profile" },
  { n: 3, label: "Verification" },
  { n: 4, label: "First Product" },
  { n: 5, label: "Download App" },
  { n: 6, label: "Done!" },
];

const PRODUCTS = [
  { id: "everyday", label: "Everyday Account", desc: "Zero-fee transactional account with free debit card", icon: "💳", popular: true },
  { id: "savings", label: "Savings Account", desc: "Earn 6.5% p.a. interest on your savings", icon: "🏦", popular: false },
  { id: "invest", label: "Investment Account", desc: "Unit trusts, fixed deposits, and tax-free savings", icon: "📈", popular: false },
  { id: "sim", label: "VMS SIM Card", desc: "One SIM for South Africa and 80+ countries", icon: "📱", popular: false },
];

export function OnboardingFlow({ isOpen, onClose, onComplete }: Props) {
  const [step, setStep] = useState<OnboardStep>(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(["everyday"]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("+27 ");
  const [idNumber, setIdNumber] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPopia, setAcceptedPopia] = useState(false);

  if (!isOpen) return null;

  const toggleProduct = (id: string) => {
    setSelectedProducts(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const canProceed = () => {
    if (step === 2) return firstName.trim().length > 0 && lastName.trim().length > 0 && phone.length > 4;
    if (step === 3) return idNumber.length >= 13 && acceptedTerms && acceptedPopia;
    if (step === 4) return selectedProducts.length > 0;
    return true;
  };

  const next = () => {
    if (step < 6) setStep((step + 1) as OnboardStep);
    else { onComplete?.(); onClose(); }
  };

  const pct = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl" style={{ background: step === 1 ? `linear-gradient(135deg,${P},#9585EA)` : "#fff" }}>

        {/* Progress bar */}
        <div className="h-1" style={{ background: "rgba(0,0,0,0.1)" }}>
          <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: step === 1 ? "rgba(255,255,255,0.5)" : GOLD }} />
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: step === 1 ? "1px solid rgba(255,255,255,0.15)" : "1px solid #F3F4F6" }}>
          <img src={vinkLogo} alt="Vink" className="h-8 w-auto" style={{ filter: step === 1 ? "brightness(0) invert(1)" : "none" }} />
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: step === 1 ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>
              Step {step} of {STEPS.length}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: step === 1 ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2 pt-4 px-6">
          {STEPS.map(s => (
            <div
              key={s.n}
              className="flex items-center justify-center transition-all duration-300"
              style={{
                width: s.n === step ? 28 : 8,
                height: 8,
                borderRadius: s.n === step ? 4 : "50%",
                background: s.n < step
                  ? (step === 1 ? "rgba(255,255,255,0.7)" : "#10B981")
                  : s.n === step
                  ? (step === 1 ? "#fff" : P)
                  : (step === 1 ? "rgba(255,255,255,0.25)" : "#E5E7EB"),
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-6 min-h-64">

          {/* Step 1 — Welcome */}
          {step === 1 && (
            <div className="text-center space-y-5">
              <div className="text-6xl">👋</div>
              <div>
                <h1 className="text-2xl font-black text-white">Welcome to VMS Banking</h1>
                <p className="text-white/70 mt-2 text-sm leading-relaxed">
                  South Africa's most complete financial super-app. Let's set up your account in under 3 minutes.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  { icon: "💳", title: "Zero-fee banking", desc: "No monthly fees on your Everyday Account" },
                  { icon: "🌍", title: "Global transfers", desc: "Send money to 5 currencies instantly" },
                  { icon: "🚌", title: "Transport payments", desc: "Tap-and-go on minibus taxis" },
                  { icon: "✈️", title: "Club Travel", desc: "Group flight & bus deals up to 35% off" },
                ].map(item => (
                  <div key={item.title} className="p-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <p className="text-xl mb-1">{item.icon}</p>
                    <p className="text-white text-xs font-bold">{item.title}</p>
                    <p className="text-white/60 text-[11px] mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Profile */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4" style={{ color: P }} />
                  <h2 className="text-lg font-black text-gray-900">Your basic details</h2>
                </div>
                <p className="text-sm text-gray-500">This is used for your account and FICA compliance.</p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">First Name *</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Thabo" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Last Name *</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Nkosi" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Mobile Number *</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 72 123 4567" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Verification */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4" style={{ color: P }} />
                  <h2 className="text-lg font-black text-gray-900">Identity Verification</h2>
                </div>
                <p className="text-sm text-gray-500">Required by FICA and the FSCA. Takes 30 seconds.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">SA ID Number / Passport Number *</label>
                <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="13-digit SA ID number" maxLength={13} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-purple-500 font-mono" />
              </div>
              <div className="p-3 rounded-xl border border-blue-100 bg-blue-50 text-xs text-blue-700">
                📸 You will need to upload a clear photo of your ID document and a selfie to complete verification.
              </div>
              <div className="space-y-3">
                {[
                  { key: "terms", label: "I agree to the VMS Terms & Conditions and Privacy Policy", state: acceptedTerms, set: setAcceptedTerms },
                  { key: "popia", label: "I consent to my personal information being processed in accordance with POPIA", state: acceptedPopia, set: setAcceptedPopia },
                ].map(item => (
                  <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                    <button
                      onClick={() => item.set(!item.state)}
                      className="w-5 h-5 mt-0.5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all"
                      style={{ borderColor: item.state ? P : "#D1D5DB", background: item.state ? P : "#fff" }}
                    >
                      {item.state && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <span className="text-sm text-gray-600">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Products */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4" style={{ color: P }} />
                  <h2 className="text-lg font-black text-gray-900">Choose your products</h2>
                </div>
                <p className="text-sm text-gray-500">Select what you'd like to open. You can add more later.</p>
              </div>
              <div className="space-y-2">
                {PRODUCTS.map(prod => (
                  <button
                    key={prod.id}
                    onClick={() => toggleProduct(prod.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
                    style={{
                      borderColor: selectedProducts.includes(prod.id) ? P : "#E5E7EB",
                      background: selectedProducts.includes(prod.id) ? `${P}08` : "#fff",
                    }}
                  >
                    <span className="text-2xl">{prod.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800">{prod.label}</p>
                        {prod.popular && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${GOLD}22`, color: GOLD }}>Popular</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{prod.desc}</p>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0" style={{ borderColor: selectedProducts.includes(prod.id) ? P : "#D1D5DB", background: selectedProducts.includes(prod.id) ? P : "#fff" }}>
                      {selectedProducts.includes(prod.id) && <CheckCircle className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5 — Download App */}
          {step === 5 && (
            <div className="space-y-5 text-center">
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Smartphone className="w-5 h-5" style={{ color: P }} />
                  <h2 className="text-lg font-black text-gray-900">Download the Vink App</h2>
                </div>
                <p className="text-sm text-gray-500">Get the full experience on your phone. Your account works on web too.</p>
              </div>
              <div className="flex gap-3 justify-center">
                {[
                  { store: "App Store", icon: "🍎", sub: "Download on the" },
                  { store: "Google Play", icon: "🤖", sub: "Get it on" },
                ].map(s => (
                  <button key={s.store} className="flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all hover:scale-105" style={{ borderColor: P, background: `${P}08` }}>
                    <span className="text-2xl">{s.icon}</span>
                    <div>
                      <p className="text-[10px] text-gray-500">{s.sub}</p>
                      <p className="text-sm font-bold text-gray-900">{s.store}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-4 rounded-2xl text-left" style={{ background: `${P}08`, border: `1.5px dashed ${P}40` }}>
                <p className="text-xs font-bold" style={{ color: P }}>🔗 Or scan the QR code</p>
                <div className="mt-2 w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center mx-auto text-xs text-gray-400">QR Code</div>
              </div>
            </div>
          )}

          {/* Step 6 — Done */}
          {step === 6 && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto" style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>🎉</div>
              <div>
                <h2 className="text-xl font-black text-gray-900">You're all set, {firstName || "welcome"}!</h2>
                <p className="text-sm text-gray-500 mt-2">Your VMS account is being set up. You'll receive an email with your account details shortly.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  { icon: "✅", text: "Profile created" },
                  { icon: "✅", text: "KYC submitted" },
                  { icon: "⏳", text: "Account activation (minutes)" },
                  { icon: "⏳", text: "Card production (3–5 days)" },
                ].map(item => (
                  <div key={item.text} className="flex items-center gap-2 text-sm text-gray-700">
                    <span>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 rounded-2xl" style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4" style={{ color: GOLD }} />
                  <p className="text-sm font-semibold text-gray-800">Welcome bonus: <span style={{ color: GOLD }}>500 VinkPoints</span> added to your account!</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-8 pb-8 flex gap-3">
          {step > 1 && step < 6 && (
            <button
              onClick={() => setStep((step - 1) as OnboardStep)}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold border-2 transition-colors"
              style={{ borderColor: step === 1 ? "rgba(255,255,255,0.3)" : "#E5E7EB", color: step === 1 ? "rgba(255,255,255,0.8)" : "#6B7280" }}
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            disabled={!canProceed()}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
            style={{
              background: !canProceed() ? "#D1D5DB" : step === 1 ? "rgba(255,255,255,0.25)" : `linear-gradient(135deg,${P},#9585EA)`,
              color: !canProceed() ? "#9CA3AF" : "#fff",
              border: step === 1 ? "2px solid rgba(255,255,255,0.4)" : "none",
            }}
          >
            {step === 1 ? "Get Started" : step === 6 ? "Go to Dashboard" : "Continue"}
            {step !== 6 && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
