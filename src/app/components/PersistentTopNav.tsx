import { User, Briefcase, Building2, ShoppingBag, X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

export type SiteSection = "Personal" | "Business" | "Corporate" | "Marketplace" | null;

interface Props {
  active: SiteSection;
  onSelect: (section: Exclude<SiteSection, null>) => void;
  onHome: () => void;
}

const ITEMS: { label: Exclude<SiteSection, null>; icon: React.ReactNode }[] = [
  { label: "Personal",    icon: <User className="w-3.5 h-3.5" /> },
  { label: "Business",    icon: <Briefcase className="w-3.5 h-3.5" /> },
  { label: "Corporate",   icon: <Building2 className="w-3.5 h-3.5" /> },
  { label: "Marketplace", icon: <ShoppingBag className="w-3.5 h-3.5" /> },
];

/**
 * A slim nav strip that stays visible above every full-screen site page
 * (Personal / Business / Corporate / Marketplace and everything nested under
 * them), so switching sections never requires backing out to the homepage
 * first. Rendered once in App.tsx, above all overlays.
 */
export function PersistentTopNav({ active, onSelect, onHome }: Props) {
  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] bg-white/95 backdrop-blur-md border-b border-black/[0.07] shadow-[0_1px_2px_rgba(21,10,51,0.04)]"
      style={{ height: 56 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center gap-3 sm:gap-4">
        <button onClick={onHome} className="shrink-0 opacity-90 hover:opacity-100 transition-opacity" aria-label="VINK home">
          <img src={vinkLogo} alt="VINK" className="h-7 w-auto object-contain" />
        </button>

        <span className="hidden sm:block w-px h-5 bg-black/10 shrink-0" />

        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {ITEMS.map(({ label, icon }) => {
            const isActive = active === label;
            return (
              <button
                key={label}
                onClick={() => onSelect(label)}
                className="relative whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all duration-150"
                style={{
                  color: isActive ? "#fff" : "#6B7280",
                  background: isActive ? "linear-gradient(135deg,#6B5ED7,#5B2D8E)" : "transparent",
                  boxShadow: isActive ? "0 4px 14px -4px rgba(91,45,142,0.5)" : "none",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F6F5FF"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span className={isActive ? "text-white" : "text-[#6B5ED7]"}>{icon}</span>
                <span className="hidden xs:inline sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        <button
          onClick={onHome}
          className="hidden sm:flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-[12px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
        >
          Close <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
