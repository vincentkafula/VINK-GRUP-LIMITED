import { Search, Menu, User, ChevronDown, LifeBuoy, LogIn, Briefcase, Building2, Home } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { GetHelpModal } from "./GetHelpModal";
import { LoginModal } from "./LoginModal";
import { NotificationCenter } from "./NotificationCenter";
import { LaunchNotice, BrandMark, AppLink, SECTIONS, navItemClass, type Section } from "./SiteChrome";
import { ThemeToggle, useTheme, Sheet, Button } from "./ds";
import { CommandPalette, useCommandPalette, type PaletteItem } from "./ds/CommandPalette";

interface HeaderProps {
  onHome?: () => void;
  onDashboardSelect?: (id: string) => void;
  onSubNavClick?: (item: string) => void;
  onOpenProfile?: () => void;

  isLoggedIn?: boolean;
  userName?: string;
}

type NavItem = Section;

const PERSONAL_SUB_NAV = ["Account", "Credit Card", "Loan", "Invest", "Rewards"] as const;
const BUSINESS_SUB_NAV   = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Manage My Business"] as const;
const CORPORATE_SUB_NAV  = ["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"] as const;

/** What each sub-item tells the app (the same strings the app already understands) and the address it has. */
const subKey = (section: NavItem, item: string) => (section === "Business" ? (item === "Invest" ? "Business:Invest" : item) : section === "Corporate" ? `Corporate:${item}` : item);
const slug = (s: string) => s.toLowerCase().replace(/&/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
const subHref = (section: NavItem, item: string) => `/${section.toLowerCase()}/${slug(item)}`;
const SUBS: Record<NavItem, readonly string[]> = { Personal: PERSONAL_SUB_NAV, Business: BUSINESS_SUB_NAV, Corporate: CORPORATE_SUB_NAV };
const SECTION_ICON: Record<NavItem, React.ReactElement> = { Personal: <User className="size-4" />, Business: <Briefcase className="size-4" />, Corporate: <Building2 className="size-4" /> };

// The desktop staff app (see /desktop) loads this site with ?mode=staff so
// it can skip straight to signing in instead of showing the full consumer
// marketing homepage first — a back-office tool has no reason to lead with
// hero banners and product marketing. Regular browser visitors never carry
// this param, so nothing here changes for them.
//
// Read into sessionStorage once on first load rather than re-checking
// window.location.search every time: this SPA's own pushRoute() rewrites
// the URL on every navigation (e.g. opening the Management Panel, or
// closing it back to "/") without preserving the query string, so the
// param itself disappears from the address bar within a few clicks —
// sessionStorage survives that since it isn't tied to the current URL.
function isStaffMode() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("mode") === "staff") {
    sessionStorage.setItem("vink_staff_mode", "1");
  }
  return sessionStorage.getItem("vink_staff_mode") === "1";
}

export function Header({ onHome, onDashboardSelect, onSubNavClick, onOpenProfile, isLoggedIn = false, userName }: HeaderProps) {
  const [isHelpModalOpen, setIsHelpModalOpen]   = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(isStaffMode());
  const [mobileOpen, setMobileOpen]             = useState(false);
  const [activeNav, setActiveNav]               = useState<NavItem | null>(null);
  const [paletteOpen, setPaletteOpen]           = useCommandPalette();
  const theme = useTheme();

  // Re-open automatically after a logout while still in staff mode, so
  // closing the login modal (or signing out later) doesn't strand the
  // window back on the marketing homepage with no obvious way back in.
  useEffect(() => {
    if (isStaffMode() && !isLoggedIn) setIsLoginModalOpen(true);
  }, [isLoggedIn]);

  // Other screens (e.g. the VINK dashboard's "sign in required" card) can ask for the sign-in modal.
  // The strip over inner pages has its own search button; it asks this header to open the one palette.
  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener("vink:open-search", open);
    return () => window.removeEventListener("vink:open-search", open);
  }, [setPaletteOpen]);

  useEffect(() => {
    const open = () => setIsLoginModalOpen(true);
    window.addEventListener("vink:open-login", open);
    return () => window.removeEventListener("vink:open-login", open);
  }, []);

  const handleNavClick = (item: NavItem) => {
    if (item === "Personal") {
      setActiveNav(prev => (prev === "Personal" ? null : "Personal"));
      onSubNavClick?.("PersonalHome");
    } else if (item === "Business") {
      setActiveNav(prev => (prev === "Business" ? null : "Business"));
      onSubNavClick?.("BusinessHome");
    } else if (item === "Corporate") {
      setActiveNav(prev => (prev === "Corporate" ? null : "Corporate"));
    } else {
      setActiveNav(null);
    }
  };
  const goSub = (section: NavItem, item: string) => { onSubNavClick?.(subKey(section, item)); setActiveNav(null); setMobileOpen(false); };

  const paletteItems = useMemo<PaletteItem[]>(() => [
    { id: "home", label: "Home", group: "Go to", icon: <Home className="size-4" />, run: () => { setActiveNav(null); onHome?.(); } },
    ...SECTIONS.flatMap(({ label }) => SUBS[label].map((item) => ({ id: `${label}-${item}`, label: item, group: label, hint: label, keywords: [label], run: () => goSub(label, item) }))),
    { id: "help", label: "Get help", group: "Actions", icon: <LifeBuoy className="size-4" />, run: () => setIsHelpModalOpen(true) },
    ...(isLoggedIn ? [] : [{ id: "login", label: "Sign in", group: "Actions", icon: <LogIn className="size-4" />, run: () => setIsLoginModalOpen(true) }]),
    { id: "theme", label: `Theme: ${theme.choice === "light" ? "switch to dark" : theme.choice === "dark" ? "match my device" : "switch to light"}`, group: "Actions", keywords: ["dark", "light", "appearance"], run: theme.cycle },
  ], [isLoggedIn, theme.choice]);      // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <GetHelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSelectDashboard={onDashboardSelect}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />

      <a href="#main" className="skip-link">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <LaunchNotice />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-6">
              <a href="/" aria-label="VINK home" className="flex shrink-0 items-center" onClick={(e) => { e.preventDefault(); setActiveNav(null); onHome?.(); }}>
                <BrandMark height={44} />
              </a>

              <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
                {SECTIONS.map(({ label, href }) => (
                  <AppLink key={label} href={href} onNavigate={() => handleNavClick(label)} aria-expanded={activeNav === label} className={navItemClass(activeNav === label)}>{label}</AppLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search pages and actions" aria-keyshortcuts="Control+K Meta+K"
                className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:border sm:border-line sm:bg-surface sm:pr-2">
                <Search className="size-[18px]" aria-hidden="true" />
                <span className="hidden text-sm sm:inline">Search</span>
                <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium lg:inline">Ctrl K</kbd>
              </button>
              <ThemeToggle />

              {isLoggedIn ? (
                <>
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#0c0e14]"><NotificationCenter /></div>
                  <button type="button" onClick={onOpenProfile} className="flex min-h-11 items-center gap-2 rounded-full border border-line py-1 pl-1.5 pr-3 transition-colors hover:bg-surface-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-fg">{userName ? userName[0].toUpperCase() : <User className="size-4" aria-hidden="true" />}</span>
                    <span className="hidden text-sm font-medium text-fg sm:block">{userName ?? "Account"}</span>
                    <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <Button onClick={() => setIsLoginModalOpen(true)} size="md" className="px-4"><LogIn aria-hidden="true" />Login</Button>
              )}

              <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="mobile-menu"
                className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-2 md:hidden"><Menu className="size-6" aria-hidden="true" /></button>
            </div>
          </div>
        </div>

        {/* Section sub-navigation: the products inside the chosen section */}
        {activeNav && (
          <div className="border-t border-line bg-surface-2">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-12 items-center gap-1 overflow-x-auto scrollbar-none">
                <nav aria-label={`${activeNav} products`} className="flex items-center gap-1">
                  {SUBS[activeNav].map((item) => (
                    <AppLink key={item} href={subHref(activeNav, item)} onNavigate={() => goSub(activeNav, item)} className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium text-fg hover:bg-surface">{item}</AppLink>
                  ))}
                </nav>
                <button type="button" onClick={() => setIsHelpModalOpen(true)} className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-fg-muted hover:bg-surface hover:text-fg"><LifeBuoy className="size-4" aria-hidden="true" />Get help</button>
              </div>
            </div>
          </div>
        )}
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menu" side="left">
        <nav id="mobile-menu" aria-label="Mobile" className="flex flex-col p-3">
          {SECTIONS.map(({ label, href }) => (
            <details key={label} className="group rounded-vk-md" open={activeNav === label}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-vk-md px-3 text-base font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span className="text-fg-muted" aria-hidden="true">{SECTION_ICON[label]}</span>{label}<ChevronDown className="ml-auto size-4 text-fg-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="mb-2 ml-6 border-l border-line pl-2">
                <li><AppLink href={href} onNavigate={() => { handleNavClick(label); setMobileOpen(false); }} className="flex min-h-11 items-center rounded-vk-sm px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">{label} home</AppLink></li>
                {SUBS[label].map((item) => <li key={item}><AppLink href={subHref(label, item)} onNavigate={() => goSub(label, item)} className="flex min-h-11 items-center rounded-vk-sm px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">{item}</AppLink></li>)}
              </ul>
            </details>
          ))}
          <button type="button" onClick={() => { setMobileOpen(false); setIsHelpModalOpen(true); }} className="mt-1 flex min-h-12 items-center gap-3 rounded-vk-md px-3 text-base font-semibold text-fg hover:bg-surface-2"><LifeBuoy className="size-4 text-fg-muted" aria-hidden="true" />Get help</button>
          {!isLoggedIn && <Button className="mx-3 mt-4" onClick={() => { setMobileOpen(false); setIsLoginModalOpen(true); }}><LogIn aria-hidden="true" />Login</Button>}
        </nav>
      </Sheet>
    </>
  );
}
