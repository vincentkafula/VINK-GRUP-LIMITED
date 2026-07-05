import { useState } from "react";
import { Wifi, WifiOff, X, Server } from "lucide-react";
import { isDemoMode, setDemoMode } from "../services/demoMode";

interface DemoModeBannerProps {
  /** Dark variant for dark-bg dashboards (MVNO, Healing Apple) */
  dark?: boolean;
}

export function DemoModeBanner({ dark = false }: DemoModeBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoMode() || dismissed) return null;

  const handleExit = () => {
    setDemoMode(false);
    localStorage.removeItem("mvno_token");
    localStorage.removeItem("bank_token");
    localStorage.removeItem("ha_token");
    window.location.reload();
  };

  if (dark) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2 flex-shrink-0"
        style={{ background: "#F59E0B22", borderBottom: "1px solid #F59E0B44" }}>
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#FCD34D" }} />
        <p className="text-xs flex-1" style={{ color: "#FDE68A" }}>
          <span className="font-bold">Demo Mode</span> — backend offline. All data is simulated. Start the server: <code className="font-mono bg-black/20 px-1 rounded">cd server && pnpm dev</code>
        </p>
        <button onClick={handleExit} title="Retry connection"
          className="text-[10px] font-semibold px-2 py-1 rounded flex items-center gap-1 hover:bg-white/10 transition-colors flex-shrink-0"
          style={{ color: "#FCD34D", border: "1px solid #F59E0B44" }}>
          <Server className="w-3 h-3" /> Retry
        </button>
        <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: "#FCD34D" }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 flex-shrink-0"
      style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}>
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
      <p className="text-xs text-amber-700 flex-1">
        <span className="font-bold">Demo Mode</span> — backend server is offline. Showing simulated data. To connect: <code className="font-mono bg-amber-100 px-1 rounded text-amber-800">cd server && pnpm dev</code>
      </p>
      <button onClick={handleExit} title="Retry live connection"
        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 bg-amber-100 hover:bg-amber-200 transition-colors text-amber-700 flex-shrink-0 border border-amber-200">
        <Server className="w-3 h-3" /> Retry Live
      </button>
      <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Floating pill for phone-frame dashboards */
export function DemoModePill() {
  const [dismissed, setDismissed] = useState(false);
  if (!isDemoMode() || dismissed) return null;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg"
      style={{ background: "#F59E0B", boxShadow: "0 4px 12px rgba(245,158,11,0.4)" }}>
      <WifiOff className="w-3 h-3 text-white" />
      <span className="text-[10px] font-bold text-white">DEMO MODE</span>
      <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white ml-0.5">
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}
