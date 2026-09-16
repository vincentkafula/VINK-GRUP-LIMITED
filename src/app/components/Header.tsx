import { Search, Menu, X, User, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { GetHelpModal } from "./GetHelpModal";
import { LoginModal } from "./LoginModal";
import { NotificationCenter } from "./NotificationCenter";
import vinkLogoLight from "../../imports/LOGO_FINAL.png";

interface HeaderProps {
  onHome?: () => void;
  onDashboardSelect?: (id: string) => void;
  onSubNavClick?: (item: string) => void;
  onOpenProfile?: () => void;

  isLoggedIn?: boolean;
  userName?: string;
}

type NavItem = "Personal" | "Business" | "Corporate";

const PERSONAL_SUB_NAV = ["Account", "Credit Card", "Loan", "Invest", "Rewards"] as const;
const BUSINESS_SUB_NAV   = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Manage My Business"] as const;
const CORPORATE_SUB_NAV  = ["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"] as const;

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

  // Re-open automatically after a logout while still in staff mode, so
  // closing the login modal (or signing out later) doesn't strand the
  // window back on the marketing homepage with no obvious way back in.
  useEffect(() => {
    if (isStaffMode() && !isLoggedIn) setIsLoginModalOpen(true);
  }, [isLoggedIn]);

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
    if (mobileOpen) setMobileOpen(false);
  };

  const showPersonalSubNav  = activeNav === "Personal";
  const showBusinessSubNav  = activeNav === "Business";
  const showCorporateSubNav = activeNav === "Corporate";

  return (
    <>
      <GetHelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSelectDashboard={onDashboardSelect}
      />

      <header className="bg-white shadow-sm sticky top-0 z-40">

        {/* ── Launch status notice — visible on every page this header renders on ── */}
        <div className="text-white text-center px-4 py-2 text-[12.5px] sm:text-sm font-semibold leading-snug"
          style={{ background: "linear-gradient(90deg,#4C1D95,#7C3AED)" }}>
          VINK is not yet in full operation — all information on this site is a preview.{" "}
          <span className="whitespace-nowrap">Full launch: June 2027.</span>
        </div>

        {/* ── Main nav bar ──────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 sm:h-24">

            {/* Logo */}
            <div className="flex items-center gap-6">
              <a href="/" className="flex-shrink-0" onClick={(e) => { e.preventDefault(); setActiveNav(null); onHome?.(); }}>
                {/* Light logo on white nav — 180px wide on desktop, 120px on mobile (brand guide: desktop navbar 160-200px) */}
                <img
                  src={vinkLogoLight}
                  alt="VINK Group"
                  className="w-[120px] sm:w-[180px] h-auto object-contain"
                  loading="eager"
                />
              </a>

              {/* Mobile hamburger */}
              <button className="md:hidden p-1" onClick={() => setMobileOpen(o => !o)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Desktop nav items */}
              <nav className="hidden md:flex items-center gap-1">
                {(["Personal", "Business", "Corporate"] as NavItem[]).map(item => (
                  <button
                    key={item}
                    onClick={() => handleNavClick(item)}
                    className={`px-4 py-2 rounded-lg text-base font-semibold transition-all ${
                      activeNav === item
                        ? "text-[#128A43] bg-[#EAF7EE]"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right: Search + Notifications + Login/Profile */}
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <Search className="w-4 h-4 text-gray-500" />
              </button>

              {isLoggedIn ? (
                <>
                  {/* Notification bell — dark background for contrast */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1F1035" }}>
                    <NotificationCenter />
                  </div>
                  {/* Profile button */}
                  <button
                    onClick={onOpenProfile}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "linear-gradient(135deg,#0B5C2E,#5FC97F)" }}>
                      {userName ? userName[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700 hidden sm:block">{userName ?? "Account"}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="bg-[#128A43] text-white px-5 py-1.5 rounded-full hover:bg-[#128A43] transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  Login
                </button>
              )}

              {/* Management access is via Login only */}
            </div>
          </div>

          {/* Mobile nav dropdown */}
          {mobileOpen && (
            <div className="md:hidden border-t border-gray-100 py-3 flex flex-col gap-1">
              {(["Personal", "Business", "Corporate"] as NavItem[]).map(item => (
                <button
                  key={item}
                  onClick={() => handleNavClick(item)}
                  className={`text-base px-4 py-2.5 rounded-lg text-left w-full transition-colors font-semibold ${
                    activeNav === item
                      ? "text-[#128A43] bg-[#EAF7EE]"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Personal sub-nav ── */}
        {showPersonalSubNav && (
          <div className="bg-[#128A43] transition-all">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-10">
                <nav className="flex items-center gap-5 overflow-x-auto scrollbar-none">
                  {PERSONAL_SUB_NAV.map(item => (
                    <button key={item} onClick={() => { onSubNavClick?.(item); setActiveNav(null); }}
                      className="whitespace-nowrap text-white/90 text-xs hover:text-white transition-colors hover:underline underline-offset-4">
                      {item}
                    </button>
                  ))}
                </nav>
                <button onClick={() => setIsHelpModalOpen(true)} className="whitespace-nowrap text-white/90 text-xs hover:text-white transition-colors ml-4">
                  Get Help
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Business sub-nav ── */}
        {showBusinessSubNav && (
          <div className="bg-[#128A43] transition-all">
            <div className="max-w-7xl mx-auto px-2 sm:px-4">
              <div className="flex items-center h-10 overflow-x-auto scrollbar-none">
                <nav className="flex items-center gap-0.5">
                  {BUSINESS_SUB_NAV.map(item => (
                    <button key={item} onClick={() => { onSubNavClick?.(item === "Invest" ? "Business:Invest" : item); setActiveNav(null); }}
                      className="whitespace-nowrap text-white/90 hover:text-white transition-colors hover:underline underline-offset-4 px-3"
                      style={{ fontSize: 12 }}>
                      {item}
                    </button>
                  ))}
                </nav>
                <button onClick={() => setIsHelpModalOpen(true)} className="whitespace-nowrap text-white/90 text-xs hover:text-white transition-colors ml-auto pl-4 flex-shrink-0">
                  Get Help
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Corporate sub-nav ── */}
        {showCorporateSubNav && (
          <div style={{ background: "#0B5C2E" }} className="transition-all">
            <div className="max-w-7xl mx-auto px-2 sm:px-4">
              <div className="flex items-center h-10 overflow-x-auto scrollbar-none">
                <nav className="flex items-center gap-0.5">
                  {CORPORATE_SUB_NAV.map(item => (
                    <button key={item}
                      onClick={() => { onSubNavClick?.(`Corporate:${item}`); setActiveNav(null); }}
                      className="whitespace-nowrap text-white/90 hover:text-white transition-colors hover:underline underline-offset-4 px-3"
                      style={{ fontSize: 12 }}>
                      {item}
                    </button>
                  ))}
                </nav>
                <button onClick={() => setIsHelpModalOpen(true)} className="whitespace-nowrap text-white/90 text-xs hover:text-white transition-colors ml-auto pl-4 flex-shrink-0">
                  Get Help
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
