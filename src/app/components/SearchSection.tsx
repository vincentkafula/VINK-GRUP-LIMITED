import { CreditCard } from "lucide-react";
import { Button } from "./ds";

const BADGES = ["Instant Approval", "Tap & Go Payments", "Earn on Every Ride"];

export function SearchSection({ onFindCard }: { onFindCard?: () => void }) {
  return (
    <section aria-label="Find a card" className="dark border-b border-white/10 text-fg" style={{ background: "#4a0d14" }}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-fg">
                Find the card that fits <span className="text-gold-text">your journey.</span>
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Checking your options takes 60 seconds and won&apos;t affect your credit score.
              </p>
            </div>
            <ul className="hidden items-center gap-2 md:flex">
              {BADGES.map((b) => (
                <li key={b} className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold-text">{b}</li>
              ))}
            </ul>
          </div>
          <Button onClick={onFindCard} className="shrink-0"><CreditCard aria-hidden="true" />Find My Card</Button>
        </div>
      </div>
    </section>
  );
}
