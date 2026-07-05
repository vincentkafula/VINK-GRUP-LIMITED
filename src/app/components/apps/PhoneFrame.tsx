/**
 * Shared phone frame wrapper for all mobile app UIs.
 * Renders content inside a realistic phone bezel on desktop,
 * or full-screen on actual mobile viewports.
 */
import { Battery, Wifi, Signal } from "lucide-react";

interface Props {
  children: React.ReactNode;
  statusBarColor?: string;
  statusBarTextLight?: boolean;
  time?: string;
}

export function PhoneFrame({ children, statusBarColor = "#fff", statusBarTextLight = false, time }: Props) {
  const now = time ?? new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  const textColor = statusBarTextLight ? "text-white" : "text-gray-800";

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 text-xs font-semibold z-10"
        style={{ background: statusBarColor, color: statusBarTextLight ? "#fff" : "#1F2937" }}>
        <span className={textColor}>{now}</span>
        <div className={`flex items-center gap-1.5 ${textColor}`}>
          <Signal className="w-3 h-3" />
          <Wifi className="w-3 h-3" />
          <Battery className="w-3.5 h-3.5" />
        </div>
      </div>
      {/* App content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>
      {/* Home indicator */}
      <div className="flex justify-center py-2 flex-shrink-0" style={{ background: statusBarColor }}>
        <div className="w-28 h-1 rounded-full bg-gray-300" />
      </div>
    </div>
  );
}

/** Full-screen mobile overlay — wraps PhoneFrame in a fixed overlay */
export function MobileAppOverlay({ children, onClose, appName, bgColor = "#fff" }: {
  children: React.ReactNode; onClose: () => void; appName: string; bgColor?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      {/* Phone shell — centered on desktop, full-screen on mobile */}
      <div className="relative w-full max-w-sm h-full max-h-[780px] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-gray-800"
        style={{ background: bgColor }}>
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-20" />
        {/* Volume/power buttons */}
        <div className="absolute left-0 top-20 w-1 h-8 bg-gray-700 rounded-r" />
        <div className="absolute left-0 top-32 w-1 h-8 bg-gray-700 rounded-r" />
        <div className="absolute right-0 top-24 w-1 h-12 bg-gray-700 rounded-l" />
        {/* Content */}
        <div className="h-full pt-6">
          {children}
        </div>
      </div>
      {/* Close button outside frame */}
      <button onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 transition-colors">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
