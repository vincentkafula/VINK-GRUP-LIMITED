import { useState, useEffect, useRef } from "react";
import { Bell, X, Check, CheckCheck, Trash2, Settings, TrendingUp, Shield, CreditCard, Tag, AlertCircle, Plane, ChevronRight } from "lucide-react";

const P = "#5B2D8E";
const GOLD = "#F5A623";

type NotifType = "transaction" | "security" | "account" | "promotion" | "system" | "kyc" | "loan" | "travel";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  icon: string;
  is_read: boolean;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const DEMO_NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "transaction", title: "Money Received", body: "R12,500.00 credited to your Everyday Account from Employer Payroll", icon: "💸", is_read: false, created_at: new Date(Date.now() - 5 * 60000).toISOString(), action_label: "View Transaction" },
  { id: "n2", type: "security", title: "New Device Login", body: "A new sign-in was detected from Chrome on MacBook Pro. If this wasn't you, secure your account immediately.", icon: "🔒", is_read: false, created_at: new Date(Date.now() - 32 * 60000).toISOString(), action_label: "Review Activity" },
  { id: "n3", type: "travel", title: "Club Booking Confirmed", body: "Your seat on Cape Town → New York (15 Jul 2026) is confirmed. Reference: VMS-CB-2026-48291", icon: "✈️", is_read: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), action_label: "View Booking" },
  { id: "n4", type: "kyc", title: "KYC Verification Approved", body: "Your identity has been verified. You now have full access to all VMS financial products.", icon: "✅", is_read: true, created_at: new Date(Date.now() - 6 * 3600000).toISOString() },
  { id: "n5", type: "promotion", title: "Double VinkPoints This Weekend", body: "Earn 2x VinkPoints on all card purchases Friday – Sunday. Use your Vink card everywhere.", icon: "⭐", is_read: true, created_at: new Date(Date.now() - 24 * 3600000).toISOString(), action_label: "Learn More" },
  { id: "n6", type: "loan", title: "Loan Application Update", body: "Your Personal Loan application (VMS-PL-2026-33847) is under review. Expected decision within 24 hours.", icon: "📋", is_read: true, created_at: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), action_label: "Track Application" },
  { id: "n7", type: "account", title: "Statement Ready", body: "Your May 2026 bank statement is ready to download.", icon: "📄", is_read: true, created_at: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), action_label: "Download" },
  { id: "n8", type: "transaction", title: "Card Payment", body: "R850.00 paid at Woolworths Food Gardens — Visa card ending 4291", icon: "💳", is_read: true, created_at: new Date(Date.now() - 5 * 24 * 3600000).toISOString() },
];

const TYPE_COLORS: Record<NotifType, string> = {
  transaction: "#10B981",
  security: "#EF4444",
  account: P,
  promotion: GOLD,
  system: "#6B7280",
  kyc: "#3B82F6",
  loan: "#8B5CF6",
  travel: "#F59E0B",
};

const TYPE_ICONS: Record<NotifType, React.ReactNode> = {
  transaction: <TrendingUp className="w-3.5 h-3.5" />,
  security: <Shield className="w-3.5 h-3.5" />,
  account: <CreditCard className="w-3.5 h-3.5" />,
  promotion: <Tag className="w-3.5 h-3.5" />,
  system: <AlertCircle className="w-3.5 h-3.5" />,
  kyc: <Check className="w-3.5 h-3.5" />,
  loan: <CreditCard className="w-3.5 h-3.5" />,
  travel: <Plane className="w-3.5 h-3.5" />,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

interface Props {
  className?: string;
}

export function NotificationCenter({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const shown = filter === "unread" ? notifications.filter(n => !n.is_read) : notifications;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Simulate real-time notification arriving
  useEffect(() => {
    const timer = setTimeout(() => {
      setNotifications(prev => [
        {
          id: "n-live",
          type: "transaction",
          title: "Tap Payment",
          body: "R14.00 fare collected — AFC device SN-88291 · Khayelitsha → CBD",
          icon: "🚌",
          is_read: false,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  const markRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  const remove = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
  const clearAll = () => setNotifications([]);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-white" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: "#EF4444" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 top-12 w-96 max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden z-[200] border border-white/10"
          style={{ background: "#0F0A1E" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: GOLD }} />
              <span className="font-bold text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "#EF4444" }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Mark all read">
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button onClick={clearAll} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Clear all">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 px-4 py-2 border-b border-white/10">
            {(["all", "unread"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors capitalize"
                style={{
                  background: filter === f ? P : "rgba(255,255,255,0.05)",
                  color: filter === f ? "#fff" : "rgba(255,255,255,0.5)",
                }}
              >
                {f} {f === "unread" && unreadCount > 0 ? `(${unreadCount})` : ""}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Bell className="w-10 h-10 mb-3" style={{ color: "rgba(255,255,255,0.2)" }} />
                <p className="text-white/40 text-sm">
                  {filter === "unread" ? "All caught up!" : "No notifications yet"}
                </p>
              </div>
            ) : (
              shown.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="group relative flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 border-b border-white/5"
                  style={{ background: !n.is_read ? "rgba(91,45,142,0.08)" : "transparent" }}
                >
                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: P }} />
                  )}

                  {/* Icon bubble */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${TYPE_COLORS[n.type]}22` }}
                  >
                    {n.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                        style={{ color: TYPE_COLORS[n.type], background: `${TYPE_COLORS[n.type]}18` }}
                      >
                        {TYPE_ICONS[n.type]}
                        {n.type}
                      </span>
                      <span className="text-[11px] text-white/35 ml-auto">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-white leading-tight">{n.title}</p>
                    <p className="text-xs text-white/55 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                    {n.action_label && (
                      <button className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: GOLD }}>
                        {n.action_label} <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={e => { e.stopPropagation(); remove(n.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
            <button className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
              <Settings className="w-3.5 h-3.5" />
              Notification settings
            </button>
            <button className="text-xs font-semibold" style={{ color: GOLD }}>
              View all activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
