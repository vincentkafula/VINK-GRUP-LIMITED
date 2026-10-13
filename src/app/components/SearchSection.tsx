import { CheckCircle2, CreditCard } from "lucide-react";
import { Button } from "./ds";

const BADGES = ["Instant Approval", "Tap & Go Payments", "Earn on Every Ride"];

export function SearchSection({ onFindCard }: { onFindCard?: () => void }) {
  return (
    <section aria-label="Find a card" className="relative z-20 -mt-9 px-4 pb-2 text-fg sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-line bg-surface px-5 py-4 shadow-overlay sm:px-7">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg,#c8102e,#e8405b 50%,#101828)" }} />
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-fg">
                Find the card that fits <span className="text-brand">your journey.</span>
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Checking your options takes 60 seconds and won&apos;t affect your credit score.
              </p>
            </div>
            <ul className="hidden items-center gap-2 md:flex">
              {BADGES.map((b) => (
                <li key={b} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg-muted"><CheckCircle2 aria-hidden="true" className="size-3.5 text-crimson-text" />{b}</li>
              ))}
            </ul>
          </div>
          <Button onClick={onFindCard} className="shrink-0 shadow-[0_16px_30px_-12px_rgba(200,16,46,0.75)]"><CreditCard aria-hidden="true" />Find My Card</Button>
        </div>
      </div>
    </section>
  );
}
