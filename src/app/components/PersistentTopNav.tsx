import vinkLogo from "../../imports/LOGO_FINAL.png";

export type SiteSection = "Personal" | "Business" | "Corporate" | "Marketplace" | null;

interface Props {
  active: SiteSection;
  onSelect: (section: Exclude<SiteSection, null>) => void;
  onHome: () => void;
}

const ITEMS: Exclude<SiteSection, null>[] = ["Personal", "Business", "Corporate", "Marketplace"];

/**
 * A slim nav strip that stays visible above every full-screen site page
 * (Personal / Business / Corporate / Marketplace and everything nested under
 * them), so switching sections never requires backing out to the homepage
 * first. Rendered once in App.tsx, above all overlays.
 */
export function PersistentTopNav({ active, onSelect, onHome }: Props) {
  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] bg-white/97 backdrop-blur border-b border-black/[0.06] shadow-[0_1px_0_rgba(0,0,0,0.02)]"
      style={{ height: 52 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">
        <button onClick={onHome} className="shrink-0" aria-label="VINK home">
          <img src={vinkLogo} alt="VINK" className="h-7 w-auto object-contain" />
        </button>
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {ITEMS.map(item => (
            <button
              key={item}
              onClick={() => onSelect(item)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                active === item ? "text-[#6B5ED7] bg-[#F3F0FF]" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
