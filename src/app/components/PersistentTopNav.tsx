import { X, Search } from "lucide-react";
import { LaunchNotice, BrandMark, AppLink, SECTIONS, navItemClass, NOTICE_H, BAR_H } from "./SiteChrome";
import { ThemeToggle } from "./ds";

export type SiteSection = "Personal" | "Business" | "Corporate" | null;

interface Props {
  active: SiteSection;
  onSelect: (section: Exclude<SiteSection, null>) => void;
  onHome: () => void;
}

/**
 * A slim nav strip that stays visible above every full-screen site page
 * (Personal / Business / Corporate and everything nested under
 * them), so switching sections never requires backing out to the homepage
 * first. Rendered once in App.tsx, above all overlays.
 *
 * Its height is a contract: notice + bar = 88px, and the rule in styles/theme.css
 * (.has-persistent-nav .fixed.inset-0) offsets every full-screen page by exactly that.
 * Search opens the same palette as the home header (it listens for "vink:open-search").
 */
export function PersistentTopNav({ active, onSelect, onHome }: Props) {
  return (
    <div className="fixed inset-x-0 top-0 z-[100]" style={{ height: NOTICE_H + BAR_H }}>
      <LaunchNotice />
      <div className="border-b border-line bg-surface/95 backdrop-blur-md" style={{ height: BAR_H }}>
        <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="VINK home" onClick={(e) => { e.preventDefault(); onHome(); }} className="flex shrink-0 items-center"><BrandMark height={36} /></a>
          <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

          <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {SECTIONS.map(({ label, href }) => (
              <AppLink key={label} href={href} current={active === label} onNavigate={() => onSelect(label)} className={navItemClass(active === label)}>{label}</AppLink>
            ))}
          </nav>

          <div className="flex-1" />
          <button type="button" onClick={() => window.dispatchEvent(new Event("vink:open-search"))} aria-label="Search pages and actions" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"><Search className="size-[18px]" aria-hidden="true" /></button>
          <ThemeToggle className="shrink-0" />
          <button type="button" onClick={onHome} aria-label="Close and return to the home page" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <span className="hidden sm:inline">Close</span><X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
