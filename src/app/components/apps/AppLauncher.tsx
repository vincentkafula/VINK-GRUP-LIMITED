/**
 * VMS Super App Launcher
 * Shows all 5 downloadable apps as an app-store-style grid.
 * Each app can be launched directly or "downloaded".
 */
import { useState } from "react";
import { X, Star, Download, ChevronRight, CheckCircle, Smartphone } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLaunchApp: (appId: string) => void;
}

const APPS = [
  {
    id: "afc",
    name: "Vink AFC Terminal",
    subtitle: "Telpo T-T20 · Automatic Fare Collection",
    description: "Runs on the Telpo T-T20 — a 7-inch Android 12 transit validator with ISO 14443 Type A/B NFC, EMV Contactless L1 (Visa Paywave · Mastercard Paypass), 1D/2D QR decoding, face recognition, 4G LTE, GPS, and 4 SAM slots. Processes fares in under 3 seconds offline. IP65 · IK08 · CE · RoHS certified.",
    platform: ["iOS", "Android"],
    category: "Transport · Payments · Fare Collection",
    version: "v3.2.1",
    size: "24.7 MB",
    rating: 4.8,
    reviews: "2,847",
    gradient: "linear-gradient(135deg,#5B2D8E,#9585EA)",
    emoji: "🚌",
    badge: "T-T20 Hardware",
    badgeColor: "#F5A623",
    features: [
      "Telpo T-T20 · Android 12 · Quad-Core 2.0 GHz · 7\" 720×1280",
      "ISO 14443 A/B NFC · Mifare · EMV L1 · Paywave · Paypass",
      "1D/2D QR hard decoding · Face recognition (dual-lens RGB+IR)",
      "4G LTE · WiFi · Bluetooth · GPS built-in · 4× SAM slots",
      "Offline mode (< R500): 280–520ms · Online fast path: 600–900ms",
      "IP65 · IK08 · CE · RoHS · -20°C to 60°C · DC 9–40V",
    ],
  },
  {
    id: "tracking",
    name: "Vink Fleet Tracker",
    subtitle: "Vehicle Tracking & Monitoring",
    description: "Monitor your entire fleet in real time from any device. Live GPS, geofencing, driver behaviour scoring, speed alerts, and automated border-crossing notifications across the SADC region.",
    platform: ["iOS", "Android"],
    category: "Fleet Management",
    version: "v2.8.0",
    size: "31.2 MB",
    rating: 4.7,
    reviews: "1,203",
    gradient: "linear-gradient(135deg,#065F46,#10B981)",
    emoji: "📍",
    badge: "iOS & Android",
    badgeColor: "#10B981",
    features: ["Live GPS tracking", "Geofence alerts", "Driver behaviour scoring", "SADC cross-border support", "Theft recovery triggers"],
  },
  {
    id: "banking",
    name: "Vink Banking",
    subtitle: "Personal & Business Banking",
    description: "Your full Vink bank account in your pocket. Send money, manage cards, earn VinkPoints, pay utility bills, and access all your financial products — available 24/7 on iOS and Android.",
    platform: ["iOS", "Android"],
    category: "Banking & Finance",
    version: "v5.1.3",
    size: "42.8 MB",
    rating: 4.9,
    reviews: "15,842",
    gradient: "linear-gradient(135deg,#3B2D8E,#7B6FE8)",
    emoji: "💳",
    badge: "Most Downloaded",
    badgeColor: "#EF4444",
    features: ["Instant money transfers", "Card management & virtual cards", "VinkPoints rewards", "Bill payments & airtime", "Investment account access"],
  },
  {
    id: "driver",
    name: "Vink Driver",
    subtitle: "Earn. Drive. Get Paid.",
    description: "Built for taxi drivers, e-hailing operators, and delivery drivers. Accept ride requests, navigate to passengers, track your earnings in real time, and get paid directly to your Vink Driver Wallet.",
    platform: ["iOS", "Android"],
    category: "Gig Economy · Transport",
    version: "v4.0.2",
    size: "28.5 MB",
    rating: 4.6,
    reviews: "8,429",
    gradient: "linear-gradient(135deg,#0F172A,#14B8A6)",
    emoji: "🚗",
    badge: "For Drivers",
    badgeColor: "#14B8A6",
    features: ["Real-time ride requests", "Turn-by-turn navigation", "Earnings & payout tracking", "FICA-compliant documents", "SOS emergency button"],
  },
  {
    id: "passenger",
    name: "Vink Go",
    subtitle: "Rides, Buses, Flights & Hotels",
    description: "Book a taxi, charter a bus, catch a flight, or reserve a hotel — all from one app. Vink Go connects passengers to South Africa's transport network with accessible vehicle options for medical needs.",
    platform: ["iOS", "Android"],
    category: "Travel & Transport",
    version: "v3.5.1",
    size: "38.4 MB",
    rating: 4.8,
    reviews: "22,107",
    gradient: "linear-gradient(135deg,#BE185D,#EC4899)",
    emoji: "✈️",
    badge: "Top Rated",
    badgeColor: "#F59E0B",
    features: ["Taxi & e-hailing booking", "Intercity bus bookings", "Domestic flight search", "Hotel reservations", "Accessible & medical transport"],
  },
  {
    id: "ride",
    name: "Vink Ride",
    subtitle: "Book Rides · Earn as a Driver",
    description: "South Africa's transport-native ride-hailing app. Request a taxi or e-hail, track your driver live, chat and call through masked numbers, pay with card or cash, and rate your trip — all in one place.",
    platform: ["iOS", "Android"],
    category: "Transport · Ride-Hailing",
    version: "v1.2.0",
    size: "34.1 MB",
    rating: 4.8,
    reviews: "5,214",
    gradient: "linear-gradient(135deg,#BE185D,#EC4899)",
    emoji: "🚕",
    badge: "New",
    badgeColor: "#10B981",
    features: ["Real-time driver tracking", "In-app chat & masked calling", "Multiple vehicle types", "Cash, card & wallet payments", "Promo codes & ratings system"],
  },
  {
    id: "revenue",
    name: "VMS Revenue Dashboard",
    subtitle: "AFC Revenue Distribution & Investor Portal",
    description: "The backend operations dashboard for managing fare revenue splits. Track per-tap earnings across Passenger, Driver, VMS Platform, Investor, Association, and Marshall accounts in real time. Simulate taps, set levy agreements, and view investor portfolios.",
    platform: ["Web"],
    category: "Operations · Finance",
    version: "v1.0.0",
    size: "Internal",
    rating: 5.0,
    reviews: "Internal",
    gradient: "linear-gradient(135deg,#5B2D8E,#F5A623)",
    emoji: "💹",
    badge: "Operations",
    badgeColor: "#5B2D8E",
    features: [
      "Per-tap revenue split (Passenger R0.50 · Driver R0.50 · VMS R1.00)",
      "10% of VMS fee → device investor (R0.10/tap)",
      "R20 trip levy → Association + Marshall per agreed %",
      "R250/month device rental → Investor",
      "Tap simulator with full audit trail",
      "Marshall % agreement management",
    ],
  },
];

export function AppLauncher({ isOpen, onClose, onLaunchApp }: Props) {
  const [selectedApp, setSelectedApp] = useState<typeof APPS[0] | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = (appId: string) => {
    setDownloading(appId);
    setTimeout(() => {
      setDownloaded(prev => new Set([...prev, appId]));
      setDownloading(null);
    }, 1500);
  };

  const P = "#5B2D8E";

  if (selectedApp) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0A0A14]">
        {/* App detail header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/10"
          style={{ background: "#0A0A14" }}>
          <button onClick={() => setSelectedApp(null)} className="p-2 rounded-full hover:bg-white/10 text-white/70 transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <span className="text-white font-bold flex-1">{selectedApp.name}</span>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-w-lg mx-auto w-full px-5 py-6 space-y-6">
          {/* App hero */}
          <div className="flex items-start gap-5">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl flex-shrink-0 shadow-xl"
              style={{ background: selectedApp.gradient }}>
              {selectedApp.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-white leading-tight">{selectedApp.name}</h1>
              <p className="text-sm text-white/60 mt-0.5">{selectedApp.subtitle}</p>
              <p className="text-xs mt-1" style={{ color: selectedApp.badgeColor }}>{selectedApp.category}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className="w-3 h-3" fill={s <= Math.round(selectedApp.rating) ? "#F5A623" : "transparent"} stroke="#F5A623" />
                  ))}
                </div>
                <span className="text-white/50 text-xs">{selectedApp.rating} ({selectedApp.reviews} ratings)</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => { onLaunchApp(selectedApp.id); onClose(); }}
              className="flex-1 py-3 rounded-2xl text-sm font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)`, boxShadow: `0 6px 20px ${P}40` }}>
              Open App
            </button>
            {downloaded.has(selectedApp.id) ? (
              <button className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: "#10B98120", color: "#10B981", border: "1px solid #10B98140" }}>
                <CheckCircle className="w-4 h-4" />Downloaded
              </button>
            ) : (
              <button
                onClick={() => handleDownload(selectedApp.id)}
                disabled={downloading === selectedApp.id}
                className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ background: "#ffffff15", color: "#fff", border: "1px solid rgba(255,255,255,.2)" }}>
                {downloading === selectedApp.id ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Downloading…</>
                ) : (
                  <><Download className="w-4 h-4" />Download</>
                )}
              </button>
            )}
          </div>

          {/* Info pills */}
          <div className="flex flex-wrap gap-2">
            {selectedApp.platform.map(p => (
              <span key={p} className="text-[10px] font-bold px-3 py-1.5 rounded-full text-white/70 border border-white/20">{p}</span>
            ))}
            <span className="text-[10px] font-bold px-3 py-1.5 rounded-full text-white/70 border border-white/20">{selectedApp.version}</span>
            <span className="text-[10px] font-bold px-3 py-1.5 rounded-full text-white/70 border border-white/20">{selectedApp.size}</span>
          </div>

          {/* Description */}
          <div>
            <p className="text-white/50 text-xs uppercase tracking-wide font-bold mb-2">About</p>
            <p className="text-white/80 text-sm leading-relaxed">{selectedApp.description}</p>
          </div>

          {/* Features */}
          <div>
            <p className="text-white/50 text-xs uppercase tracking-wide font-bold mb-3">Key Features</p>
            <div className="space-y-2">
              {selectedApp.features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#ffffff08" }}>
                  <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: selectedApp.badgeColor }} />
                  <span className="text-white/80 text-sm">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* System info */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff08" }}>
            <p className="text-white/50 text-xs uppercase tracking-wide font-bold">System Information</p>
            {[
              { label: "Developer", value: "Vink Group (Pty) Ltd." },
              { label: "Backend API", value: "VMS Central API v2 · Cape Town" },
              { label: "Real-time", value: "WebSocket · sub-100ms latency" },
              { label: "Security", value: "256-bit AES · JWT Auth · FICA Compliant" },
              { label: "Data", value: "VMS MVNO · Cell C 4G/LTE" },
            ].map((item, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-white/40 text-xs">{item.label}</span>
                <span className="text-white/70 text-xs font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#0A0A14" }}>

      {/* Header */}
      <div className="sticky top-0 z-10 px-5 py-4 border-b border-white/10 flex items-center justify-between"
        style={{ background: "#0A0A14" }}>
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="h-8 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          <div>
            <p className="text-sm font-black text-white">VMS App Ecosystem</p>
            <p className="text-[10px] text-white/50">5 connected apps · 1 backend system</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Hero banner */}
      <div className="px-5 py-6" style={{ background: "linear-gradient(135deg,#1A0533 0%,#3B2D8E 50%,#5B4EC7 100%)" }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Super App Ecosystem</span>
          </div>
          <h1 className="text-2xl font-black text-white leading-tight mb-2">
            5 Apps. One System.<br />Built for South Africa.
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            Each app operates independently, downloads separately, and connects to the same VMS backend — powering taxis, drivers, passengers, businesses, and fleet operators across South Africa.
          </p>
          <div className="flex gap-3 mt-4">
            {APPS.map(app => (
              <div key={app.id} className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg"
                style={{ background: app.gradient }}>
                {app.emoji}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture note */}
      <div className="max-w-lg mx-auto w-full px-5 py-4">
        <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: "#F5A62315", border: "1px solid #F5A62330" }}>
          <span className="text-lg flex-shrink-0">🔗</span>
          <p className="text-white/70 text-xs leading-relaxed">
            All 5 apps share a single Express/WebSocket backend. Users download each app separately from the App Store or Play Store. Authentication, wallets, and real-time events are unified across all apps via the VMS Central API.
          </p>
        </div>
      </div>

      {/* App grid */}
      <div className="max-w-lg mx-auto w-full px-5 pb-8 space-y-3">
        <p className="text-white/50 text-xs uppercase tracking-wide font-bold">Available Apps</p>
        {APPS.map(app => (
          <div key={app.id}
            className="rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            style={{ background: "#111120" }}>
            <div className="flex items-center gap-4 p-4" onClick={() => setSelectedApp(app)}>
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-lg"
                style={{ background: app.gradient }}>
                {app.emoji}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm leading-tight truncate">{app.name}</p>
                    <p className="text-white/50 text-xs mt-0.5">{app.subtitle}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: app.badgeColor + "20", color: app.badgeColor }}>
                    {app.badge}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className="w-2.5 h-2.5" fill={s <= Math.round(app.rating) ? "#F5A623" : "transparent"} stroke="#F5A623" />
                    ))}
                  </div>
                  <span className="text-white/40 text-[10px]">{app.rating}</span>
                  <span className="text-white/30 text-[10px]">·</span>
                  <div className="flex gap-1">
                    {app.platform.map(p => (
                      <span key={p} className="text-[9px] px-1.5 py-0.5 rounded border border-white/15 text-white/40">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <button onClick={() => { onLaunchApp(app.id); onClose(); }}
                className="text-xs font-black px-4 py-2 rounded-xl text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                Open App
              </button>
              <div className="flex items-center gap-3">
                {downloaded.has(app.id) ? (
                  <span className="text-xs font-bold flex items-center gap-1" style={{ color: "#10B981" }}>
                    <CheckCircle className="w-3.5 h-3.5" />Downloaded
                  </span>
                ) : (
                  <button onClick={() => handleDownload(app.id)} disabled={downloading === app.id}
                    className="text-xs font-semibold flex items-center gap-1.5 text-white/50 hover:text-white transition-colors">
                    {downloading === app.id
                      ? <><div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />Installing…</>
                      : <><Download className="w-3.5 h-3.5" />Install</>
                    }
                  </button>
                )}
                <button onClick={() => setSelectedApp(app)} className="text-white/30 hover:text-white/60 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
