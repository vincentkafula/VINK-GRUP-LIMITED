/**
 * Vink Mobile App — Main Home Screen
 * Matches the attached design exactly.
 * Every tile directly opens the corresponding built dashboard/viewer.
 */
import { useState } from "react";
import { Bell, Home, Grid, Plus, Mail, User } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

// ─── Tile definitions — icon, label, colour, target screen ───────────────────
const TILES = [
  { id: "login",        label: "Login",         bg: "#EDE9FE", fg: "#7C3AED", icon: LoginIcon },
  { id: "message",      label: "Message",       bg: "#D1FAE5", fg: "#059669", icon: MessageIcon },
  { id: "contactus",    label: "Contact Us",    bg: "#FEF3C7", fg: "#D97706", icon: PhoneIcon },
  { id: "marketplace",  label: "Market Place",  bg: "#FEE2E2", fg: "#DC2626", icon: MarketIcon },
  { id: "buy",          label: "Buy",           bg: "#DBEAFE", fg: "#2563EB", icon: CartIcon },
  { id: "connect",      label: "Connect",       bg: "#D1FAE5", fg: "#059669", icon: ConnectIcon },
  { id: "payments",     label: "Payments",      bg: "#FEF3C7", fg: "#D97706", icon: PayIcon },
  { id: "transfer",     label: "Transfer",      bg: "#EDE9FE", fg: "#7C3AED", icon: TransferIcon },
  { id: "cards",        label: "Cards",         bg: "#DBEAFE", fg: "#2563EB", icon: CardIcon },
  { id: "device",       label: "Device",        bg: "#D1FAE5", fg: "#059669", icon: DeviceIcon },
  { id: "guardme",      label: "Guard Me",      bg: "#FEE2E2", fg: "#DC2626", icon: ShieldIcon },
  { id: "insurance",    label: "Insurance",     bg: "#DBEAFE", fg: "#2563EB", icon: InsureIcon },
  { id: "vinktv",        label: "VINK TV",        bg: "#D1FAE5", fg: "#059669", icon: TVIcon },
  { id: "cardlesscash", label: "Cardless Cash", bg: "#EDE9FE", fg: "#7C3AED", icon: CashIcon },
  { id: "elections",    label: "Elections",     bg: "#FEF3C7", fg: "#D97706", icon: ElectionIcon },
  { id: "scantopay",    label: "Scan to Pay",   bg: "#FEE2E2", fg: "#DC2626", icon: ScanIcon },
  { id: "restaurant",   label: "Restaurant",    bg: "#D1FAE5", fg: "#059669", icon: RestIcon },
  { id: "travel",       label: "Travel",        bg: "#DBEAFE", fg: "#2563EB", icon: TravelIcon },
  { id: "forex",        label: "Forex",         bg: "#FEE2E2", fg: "#DC2626", icon: ForexIcon },
  { id: "setting",      label: "Setting",       bg: "#F3F4F6", fg: "#6B7280", icon: SettingIcon },
];

// ─── SVG Icon components ──────────────────────────────────────────────────────
function LoginIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>;
}
function MessageIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function PhoneIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.1 4.18 2 2 0 0 1 5.08 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L9.4 9.57a16 16 0 0 0 6 6l.95-.93a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 23 17z"/></svg>;
}
function MarketIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function CartIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
function ConnectIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>;
}
function PayIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function TransferIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
}
function CardIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><rect x="4" y="14" width="4" height="2" rx="1" fill={color}/></svg>;
}
function DeviceIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3"/></svg>;
}
function ShieldIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function InsureIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function TVIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><polyline points="16 2 12 7 8 2"/></svg>;
}
function CashIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
}
function ElectionIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
}
function ScanIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}
function RestIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>;
}
function TravelIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2a1 1 0 0 0-.5 1.7l2.1 2.1-2.5 2.5a1 1 0 0 0 .3 1.6l5.1 2.2 2.2 5.1a1 1 0 0 0 1.6.3l2.5-2.5 2.1 2.1a1 1 0 0 0 1.7-.5z"/></svg>;
}
function ForexIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function SettingIcon({ color }: { color: string }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function VinkMobileApp({ isOpen, onClose, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<"home" | "grid" | "mail" | "profile">("home");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      {/* Phone shell */}
      <div className="relative w-full max-w-sm h-full max-h-[780px] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-gray-800 flex flex-col bg-white">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-20" />
        {/* Side buttons */}
        <div className="absolute left-0 top-20 w-1 h-8 bg-gray-700 rounded-r" />
        <div className="absolute left-0 top-32 w-1 h-8 bg-gray-700 rounded-r" />
        <div className="absolute right-0 top-24 w-1 h-12 bg-gray-700 rounded-l" />

        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-7 pb-1 flex-shrink-0 text-[11px] font-semibold text-gray-800">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div className="px-5 pt-2 pb-4">

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 font-medium">Hello,</p>
                <p className="text-xl font-black text-gray-900">Vincent Kafula</p>
              </div>
              <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center" onClick={() => onNavigate("contactus")}>
                <Bell className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Featured banner */}
            <div
              className="rounded-2xl p-5 mb-5 relative overflow-hidden cursor-pointer"
              style={{ background: "linear-gradient(135deg,#5B2D8E 0%,#7C3AED 50%,#9585EA 100%)", minHeight: 120 }}
              onClick={() => onNavigate("payments")}
            >
              <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-20 bg-white pointer-events-none" />
              <div className="absolute -bottom-8 right-8 w-24 h-24 rounded-full opacity-15 bg-white pointer-events-none" />
              <div className="relative z-10">
                <span className="text-white/70 text-[10px] font-bold uppercase tracking-widest">FEATURED</span>
                <p className="text-white text-2xl font-black leading-tight mt-1">Secure<br />Payments</p>
                <button className="mt-3 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm transition-all border border-white/25">
                  Make Payment
                </button>
              </div>
              {/* Card illustration */}
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-20 h-14 rounded-lg opacity-40 border-2 border-white/50"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <div className="w-6 h-4 rounded m-2 bg-white/40" />
                <div className="mx-2 space-y-1"><div className="h-1 rounded bg-white/30 w-full" /><div className="h-1 rounded bg-white/30 w-3/4" /></div>
              </div>
            </div>

            {/* Service grid */}
            <div className="grid grid-cols-3 gap-3">
              {TILES.map(tile => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    onClick={() => onNavigate(tile.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 hover:shadow-md hover:scale-[1.03] active:scale-[0.97] transition-all"
                    style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: tile.bg }}>
                      <Icon color={tile.fg} />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">{tile.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom tab bar */}
        <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-around">
          <button onClick={() => setActiveTab("home")} className="flex flex-col items-center gap-0.5">
            <Home className="w-5 h-5" style={{ color: activeTab === "home" ? "#5B2D8E" : "#9CA3AF" }} />
            <span className="text-[9px] font-semibold" style={{ color: activeTab === "home" ? "#5B2D8E" : "#9CA3AF" }}>Home</span>
          </button>
          <button onClick={() => { setActiveTab("grid"); onNavigate("marketplace"); }} className="flex flex-col items-center gap-0.5">
            <Grid className="w-5 h-5" style={{ color: activeTab === "grid" ? "#5B2D8E" : "#9CA3AF" }} />
            <span className="text-[9px] font-semibold" style={{ color: activeTab === "grid" ? "#5B2D8E" : "#9CA3AF" }}>Apps</span>
          </button>
          {/* FAB */}
          <button onClick={() => onNavigate("scantopay")}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg -mt-4"
            style={{ background: "#10B981", boxShadow: "0 4px 14px rgba(16,185,129,0.5)" }}>
            <Plus className="w-6 h-6" />
          </button>
          <button onClick={() => { setActiveTab("mail"); onNavigate("message"); }} className="flex flex-col items-center gap-0.5">
            <Mail className="w-5 h-5" style={{ color: activeTab === "mail" ? "#5B2D8E" : "#9CA3AF" }} />
            <span className="text-[9px] font-semibold" style={{ color: activeTab === "mail" ? "#5B2D8E" : "#9CA3AF" }}>Messages</span>
          </button>
          <button onClick={() => { setActiveTab("profile"); onNavigate("login"); }} className="flex flex-col items-center gap-0.5">
            <User className="w-5 h-5" style={{ color: activeTab === "profile" ? "#5B2D8E" : "#9CA3AF" }} />
            <span className="text-[9px] font-semibold" style={{ color: activeTab === "profile" ? "#5B2D8E" : "#9CA3AF" }}>Profile</span>
          </button>
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2 bg-white flex-shrink-0">
          <div className="w-28 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Close button outside frame */}
        <button onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center z-30">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
