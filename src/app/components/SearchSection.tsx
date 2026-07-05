import { CreditCard } from "lucide-react";

const BADGES = ["Instant Approval", "Tap & Go Payments", "Earn on Every Ride"];

export function SearchSection() {
  return (
    <div className="border-b" style={{ background: "linear-gradient(90deg,#f8f7ff 0%,#ede9fe 50%,#f8f7ff 100%)", borderColor: "#e4e0f8" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-gray-800">
                Find the card that fits <span style={{ color: "#6B5ED7" }}>your journey.</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Checking your options takes 60 seconds and won&apos;t affect your credit score.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {BADGES.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "#ede9fe", color: "#6B5ED7" }}>
                  {b}
                </span>
              ))}
            </div>
          </div>
          <button className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)", boxShadow: "0 4px 14px rgba(107,94,215,.35)" }}>
            <CreditCard className="w-4 h-4" />
            Find My Card
          </button>
        </div>
      </div>
    </div>
  );
}
