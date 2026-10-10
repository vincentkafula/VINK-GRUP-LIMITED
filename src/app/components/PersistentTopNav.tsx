import { Search, LogIn, User, ChevronDown } from "lucide-react";
import { LaunchNotice, BrandMark, AppLink, SECTIONS, navItemClass, NOTICE_H, BAR_H } from "./SiteChrome";
import { ThemeToggle, Button } from "./ds";

export type SiteSection = "Personal" | "Business" | "Corporate" | null;

interface Props {
  active: SiteSection;
  onSelect: (section: Exclude<SiteSection, null>) => void;
  onHome: () => void;
  /** The account button: Login when nobody is signed in, otherwise the person's name. The same as on the home page. */
  isLoggedIn?: boolean;
  userName?: string;
  onLogin?: () => void;
  onProfile?: () => void;
}

/**
 * A slim nav strip that stays visible above every full-screen site page
 * (Personal / Business / Corporate and everything nested under
 * them), so switching sections never requires backing out to the homepage
 * first. Rendered once in App.tsx, above all overlays.
 *
 * There is no Close button: the logo is the way back to the home page.
 *
 * It is drawn exactly like the home page header (same height, logo size, spacing and buttons) so the header never moves or changes between pages.
 * Its height is a contract: notice + bar = 97px, and the rule in styles/theme.css
 * (.has-persistent-nav .fixed.inset-0) offsets every full-screen page by exactly that.
 * Search opens the same palette as the home header (it listens for "vink:open-search").
 */
export function PersistentTopNav({ active, onSelect, onHome, isLoggedIn = false, userName, onLogin, onProfile }: Props) {
  return (
    <div data-persistent-nav className="fixed inset-x-0 top-0 z-[100]" style={{ height: NOTICE_H + BAR_H }}>
      <LaunchNotice />
      <div className="border-b border-line bg-surface" style={{ height: BAR_H }}>
        <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="VINK home" onClick={(e) => { e.preventDefault(); onHome(); }} className="flex shrink-0 items-center"><BrandMark height={44} /></a>
          <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

          <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {SECTIONS.map(({ label, href }) => (
              <AppLink key={label} href={href} current={active === label} onNavigate={() => onSelect(label)} className={navItemClass(active === label)}>{label}</AppLink>
            ))}
          </nav>

          <div className="flex-1" />
          <button type="button" onClick={() => window.dispatchEvent(new Event("vink:open-search"))} aria-label="Search pages and actions" aria-keyshortcuts="Control+K Meta+K"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:border sm:border-line sm:bg-surface sm:pr-2">
            <Search className="size-[18px]" aria-hidden="true" />
            <span className="hidden text-sm sm:inline">Search</span>
            <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium lg:inline">Ctrl K</kbd>
          </button>
          <ThemeToggle className="shrink-0" />
          {isLoggedIn ? (
            <button type="button" onClick={onProfile} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line py-1 pl-1.5 pr-3 transition-colors hover:bg-surface-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-fg">{userName ? userName[0].toUpperCase() : <User className="size-4" aria-hidden="true" />}</span>
              <span className="hidden text-sm font-medium text-fg sm:block">{userName ?? "Account"}</span>
              <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
            </button>
          ) : (
            <Button onClick={onLogin} size="md" className="shrink-0 px-4"><LogIn aria-hidden="true" />Login</Button>
          )}
        </div>
      </div>
    </div>
  );
}
