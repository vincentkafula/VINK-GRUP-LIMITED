import { useState } from "react";
import { Home, Send, CreditCard, Clock, Star, Bell, ChevronRight, ArrowUpRight, ArrowDownLeft, Zap, Smartphone, ShoppingCart, Gift, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";
import { globalBankingApi } from "../../services/applicationsApi";

type Screen = "home" | "send" | "cards" | "history" | "rewards";

const PURPLE = "#5B2D8E";
const GOLD = "#F5A623";

const TRANSACTIONS = [
  { emoji: "🛒", name: "Shoprite Claremont",       amount: -284.50,  date: "Today",    cat: "Grocery" },
  { emoji: "💰", name: "Salary — VMS Corp",         amount: 18500.00, date: "Today",    cat: "Income" },
  { emoji: "⛽", name: "Shell Garage Observatory",  amount: -650.00,  date: "Yesterday",cat: "Fuel" },
  { emoji: "🏋️", name: "Planet Fitness",            amount: -299.00,  date: "18 Jun",   cat: "Health" },
  { emoji: "📺", name: "Netflix",                   amount: -199.00,  date: "17 Jun",   cat: "Entertainment" },
  { emoji: "🏥", name: "Netcare Life Healthcare",   amount: -1200.00, date: "16 Jun",   cat: "Medical" },
  { emoji: "🍕", name: "Steers",                    amount: -89.00,   date: "15 Jun",   cat: "Food" },
  { emoji: "💳", name: "Refund — Takealot",         amount: 340.00,   date: "14 Jun",   cat: "Refund" },
  { emoji: "📱", name: "MTN Airtime",               amount: -50.00,   date: "14 Jun",   cat: "Airtime" },
  { emoji: "🚕", name: "Vink Taxi Fare",            amount: -68.00,   date: "13 Jun",   cat: "Transport" },
  { emoji: "🏢", name: "City of Cape Town — Rates", amount: -1440.00, date: "12 Jun",   cat: "Municipal" },
  { emoji: "☕", name: "Truth Coffee Roasting",     amount: -42.00,   date: "11 Jun",   cat: "Food" },
];

const REWARDS_HISTORY = [
  { event: "Taxi Fare — Vink Ride",       pts: "+68",  date: "Today" },
  { event: "Shoprite Purchase",            pts: "+28",  date: "Today" },
  { event: "Monthly Salary Deposit",       pts: "+185", date: "Yesterday" },
  { event: "Shell Fuel Purchase",          pts: "+65",  date: "18 Jun" },
  { event: "Airtime Purchase",             pts: "+5",   date: "14 Jun" },
];

function HomeScreen() {
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F8F7FF" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <div>
          <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK</p>
          <p className="text-white/70 text-[10px]">Good morning, Thabo</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative">
            <Bell className="w-5 h-5 text-white/80" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400" />
          </button>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
            <span className="text-white text-xs font-bold">TN</span>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div className="mx-3 -mt-1 rounded-2xl p-5 shadow-xl" style={{ background: `linear-gradient(135deg, ${PURPLE}, #3B1A6E)` }}>
        <p className="text-white/60 text-xs">Vink Grain Account</p>
        <p className="text-white text-[28px] font-bold tracking-tight mt-1">R 12,847.50</p>
        <p className="text-white/50 text-xs mt-0.5">****  ****  ****  3421</p>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-white/50 text-[9px]">VINKPOINTS</p>
            <p className="font-bold text-xs" style={{ color: GOLD }}>4,230 pts · R42.30</p>
          </div>
          <div className="px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: GOLD, color: PURPLE }}>
            GOLD
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-4">
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex justify-between">
          {[
            ["Send",     "💸"], ["Receive", "📥"], ["Pay",     "📲"],
            ["Airtime",  "📱"], ["Electricity","⚡"],
          ].map(([label, emoji]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-sm"
                style={{ background: `${PURPLE}11`, border: `1.5px solid ${PURPLE}33` }}
              >
                {emoji}
              </div>
              <span className="text-gray-500 text-[9px] font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="px-3 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Recent</p>
          <button className="text-[10px] font-semibold" style={{ color: PURPLE }}>See all</button>
        </div>
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          {TRANSACTIONS.slice(0, 5).map((t, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {t.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-xs font-medium truncate">{t.name}</p>
                <p className="text-gray-400 text-[10px]">{t.date}</p>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${t.amount > 0 ? "text-green-600" : "text-gray-700"}`}>
                {t.amount > 0 ? "+" : ""}R{Math.abs(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Promo */}
      <div className="mx-3 mt-3 mb-4 rounded-2xl p-3 flex items-center gap-3" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}55` }}>
        <span className="text-2xl">🎁</span>
        <div>
          <p className="text-xs font-bold" style={{ color: PURPLE }}>Free Wi-Fi on VMS taxis!</p>
          <p className="text-gray-500 text-[10px]">Earn 2× VinkPoints on taxi rides this week</p>
        </div>
      </div>
    </div>
  );
}

const RECENT_RECIPIENTS = [
  { initials: "SD", name: "Sipho D.",    ref: "VMS-GBL-2024-00002" },
  { initials: "LM", name: "Lindiwe M.", ref: "VMS-GBL-2024-00003" },
  { initials: "BZ", name: "Busisiwe Z.", ref: "VMS-GBL-2024-00004" },
];

function SendScreen() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rail, setRail] = useState<"Instant"|"Standard"|"International">("Instant");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ ref: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!recipient.trim() || !amount || Number(amount) <= 0) {
      setError("Please enter a recipient and amount."); return;
    }
    if (Number(amount) > 12847.50) {
      setError("Amount exceeds available balance of R12,847.50."); return;
    }
    setError(null); setLoading(true);
    const r = await globalBankingApi.p2pTransfer("acc-001", recipient.trim(), Number(amount), "ZAR", note || undefined);
    setLoading(false);
    if (r.success) {
      setSuccess({ ref: r.data?.id ?? "TXN-" + Date.now(), amount });
    } else {
      setError(r.error ?? "Transfer failed. Please try again.");
    }
  };

  if (success) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-5 px-6" style={{ background: "#F8F7FF" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "#10B98122" }}>
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: PURPLE }}>R{Number(success.amount).toFixed(2)}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Sent successfully!</p>
          <p className="text-xs text-gray-400 mt-1 font-mono">{success.ref}</p>
        </div>
        <button onClick={() => { setSuccess(null); setAmount(""); setRecipient(""); setNote(""); }}
          className="w-full max-w-xs py-3.5 rounded-2xl font-bold text-sm text-white"
          style={{ background: `linear-gradient(135deg,${PURPLE},#7C3AED)` }}>
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Send Money</p>
        <p className="text-white/60 text-xs">Transfer to any Vink account</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Recipient */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">To (Vink Reference or Phone)</label>
          <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)}
            placeholder="VMS-GBL-2024-XXXXX or 082 555 1234"
            className="w-full mt-1.5 px-3 py-2.5 rounded-xl text-sm bg-white border text-gray-800 outline-none"
            style={{ borderColor: `${PURPLE}33` }} />
        </div>
        {/* Amount */}
        <div className="text-center py-4">
          <p className="text-gray-400 text-xs mb-1">Amount (ZAR)</p>
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl font-bold" style={{ color: PURPLE }}>R</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
              className="text-4xl font-bold text-center bg-transparent outline-none w-36" style={{ color: PURPLE }} />
          </div>
          <p className="text-gray-400 text-[10px] mt-1">Available: R12,847.50</p>
        </div>
        {/* Note */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">Reference (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Rent, Loan repayment"
            className="w-full mt-1.5 px-3 py-2.5 rounded-xl text-sm bg-white border text-gray-800 outline-none"
            style={{ borderColor: `${PURPLE}33` }} />
        </div>
        {/* Rail selector */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">Transfer Type</label>
          <div className="flex gap-1 mt-1.5 p-1 rounded-xl bg-white border" style={{ borderColor: `${PURPLE}22` }}>
            {(["Instant","Standard","International"] as const).map(r => (
              <button key={r} onClick={() => setRail(r)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ background: rail === r ? PURPLE : "transparent", color: rail === r ? "#fff" : PURPLE }}>
                {r}
              </button>
            ))}
          </div>
          <p className="text-gray-400 text-[10px] mt-1 text-center">
            {rail === "Instant" ? "Arrives within seconds · Fee: R2.50" : rail === "Standard" ? "Arrives same day · Free" : "3–5 business days · Fee: R45"}
          </p>
        </div>
        {/* Quick recipients */}
        <div>
          <p className="text-gray-500 text-xs font-semibold mb-2">Recent Recipients</p>
          <div className="flex gap-4">
            {RECENT_RECIPIENTS.map(({ initials, name, ref }) => (
              <button key={initials} onClick={() => setRecipient(ref)} className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg,${PURPLE},${GOLD})` }}>{initials}</div>
                <span className="text-gray-500 text-[10px]">{name}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}
        {/* Send button */}
        <button onClick={handleSend} disabled={loading}
          className="w-full py-3.5 rounded-2xl font-bold text-sm text-white mt-2 shadow-lg transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg,${PURPLE},#7C3AED)` }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Sending…" : "Send Now →"}
        </button>
      </div>
    </div>
  );
}

function CardsScreen() {
  const [frozen, setFrozen] = useState(false);
  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">My Cards</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Physical card */}
        <div className="rounded-2xl p-5 shadow-xl" style={{ background: `linear-gradient(135deg, ${PURPLE}, #1E0A3C)` }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold tracking-widest" style={{ color: GOLD }}>VINK</p>
              <p className="text-white/60 text-[9px] mt-0.5">Grain Account</p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[9px]">VISA</p>
              <div className="flex gap-0.5 mt-0.5">
                <div className="w-4 h-4 rounded-full bg-red-400 opacity-80" />
                <div className="w-4 h-4 rounded-full bg-amber-400 opacity-80 -ml-1.5" />
              </div>
            </div>
          </div>
          <p className="text-white text-sm font-mono tracking-widest mt-4">4520  ****  ****  3421</p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-white/40 text-[9px]">EXPIRES</p>
              <p className="text-white text-xs">08/28</p>
            </div>
            <div>
              <p className="text-white/40 text-[9px]">CARDHOLDER</p>
              <p className="text-white text-xs">THABO NKOSI</p>
            </div>
          </div>
          {frozen && (
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
              <div className="text-center">
                <span className="text-3xl">🔒</span>
                <p className="text-white font-bold text-sm mt-1">Card Frozen</p>
              </div>
            </div>
          )}
        </div>

        {/* Virtual card */}
        <div className="rounded-2xl p-5 shadow-lg" style={{ background: `linear-gradient(135deg, #F5A623, #E8830A)` }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-white/80">VINK VIRTUAL</p>
              <p className="text-white/60 text-[9px] mt-0.5">Online Purchases</p>
            </div>
            <span className="text-white text-[10px] font-bold border border-white/40 px-1.5 py-0.5 rounded-full">VIRTUAL</span>
          </div>
          <p className="text-white text-sm font-mono tracking-widest mt-4">8834  ****  ****  9012</p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-white/60 text-[9px]">EXPIRES</p>
              <p className="text-white text-xs">12/26</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-4 gap-2">
          {[
            ["🔒", frozen ? "Unfreeze" : "Freeze", () => setFrozen(!frozen)],
            ["📊", "Limits",   () => {}],
            ["🚫", "Report",   () => {}],
            ["💳", "New Virtual",() => {}],
          ].map(([icon, label, fn]) => (
            <button
              key={label as string}
              onClick={fn as () => void}
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-white shadow-sm active:scale-95 transition-transform"
            >
              <span className="text-base">{icon as string}</span>
              <span className="text-[9px] text-gray-500 font-medium text-center leading-tight">{label as string}</span>
            </button>
          ))}
        </div>

        {/* Spend bar */}
        <div className="rounded-2xl p-4 bg-white shadow-sm">
          <div className="flex justify-between mb-1">
            <p className="text-gray-700 text-xs font-semibold">Monthly Spend</p>
            <p className="text-xs font-bold" style={{ color: PURPLE }}>R3,847 / R15,000</p>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: "25.6%", background: `linear-gradient(90deg, ${PURPLE}, ${GOLD})` }} />
          </div>
          <p className="text-gray-400 text-[10px] mt-1">R11,153 remaining this month</p>
        </div>
      </div>
    </div>
  );
}

function HistoryScreen() {
  const [filter, setFilter] = useState<"All"|"Debits"|"Credits"|"Pending">("All");
  const filtered = filter === "All" ? TRANSACTIONS
    : filter === "Credits" ? TRANSACTIONS.filter(t => t.amount > 0)
    : filter === "Debits" ? TRANSACTIONS.filter(t => t.amount < 0)
    : [];

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Transaction History</p>
      </div>
      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2 flex-shrink-0 bg-white shadow-sm">
        {(["All","Debits","Credits","Pending"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: filter === f ? PURPLE : `${PURPLE}11`, color: filter === f ? "#fff" : PURPLE }}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          {(filtered.length === 0 ? [{ emoji: "⏳", name: "No pending transactions", amount: 0, date: "—", cat: "—" }] : filtered).map((t, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {t.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-xs font-medium truncate">{t.name}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-gray-400 text-[10px]">{t.date}</p>
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${PURPLE}11`, color: PURPLE }}>
                    {t.cat}
                  </span>
                </div>
              </div>
              {t.amount !== 0 && (
                <span className={`text-xs font-bold flex-shrink-0 ${t.amount > 0 ? "text-green-600" : "text-gray-700"}`}>
                  {t.amount > 0 ? "+" : ""}R{Math.abs(t.amount).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RewardsScreen() {
  const REDEEM = [
    ["🚕", "Taxi Fare",  "500 pts"],
    ["📱", "Airtime",    "100 pts"],
    ["🛒", "Grocery",   "300 pts"],
    ["💵", "Cash",      "1000 pts"],
    ["⛽", "Fuel",      "400 pts"],
  ];
  const progress = (4230 / 7500) * 100;

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">VinkPoints</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Balance */}
        <div
          className="rounded-2xl p-5 text-center shadow-xl"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #3B1A6E)` }}
        >
          <p className="text-white/60 text-xs">Your Balance</p>
          <p className="text-5xl font-bold mt-1" style={{ color: GOLD }}>4,230</p>
          <p className="text-white/60 text-xs">pts = R42.30 value</p>

          <div className="mt-4">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-white/60">Gold Member</span>
              <span style={{ color: GOLD }}>4,230 / 7,500 → Platinum</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/20">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GOLD}, #FFD700)` }} />
            </div>
          </div>
        </div>

        {/* Redeem */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Redeem Points</p>
          <div className="grid grid-cols-3 gap-2">
            {REDEEM.map(([icon, label, pts]) => (
              <button
                key={label}
                className="flex flex-col items-center gap-1 py-3 rounded-xl bg-white shadow-sm active:scale-95 transition-transform"
              >
                <span className="text-xl">{icon}</span>
                <span className="text-gray-700 text-[10px] font-semibold">{label}</span>
                <span className="text-[9px] font-bold" style={{ color: GOLD }}>{pts}</span>
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Points Earned</p>
          <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
            {REWARDS_HISTORY.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}22` }}>
                  <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-xs font-medium truncate">{r.event}</p>
                  <p className="text-gray-400 text-[10px]">{r.date}</p>
                </div>
                <span className="text-xs font-bold text-green-600">{r.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VinkBankingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");

  if (!isOpen) return null;

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "home",    label: "Home",    icon: <Home className="w-5 h-5" /> },
    { id: "send",    label: "Send",    icon: <Send className="w-5 h-5" /> },
    { id: "cards",   label: "Cards",   icon: <CreditCard className="w-5 h-5" /> },
    { id: "history", label: "History", icon: <Clock className="w-5 h-5" /> },
    { id: "rewards", label: "Rewards", icon: <Star className="w-5 h-5" /> },
  ];

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Bank" bgColor="#F8F7FF">
      <PhoneFrame statusBarColor={PURPLE} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {screen === "home"    && <HomeScreen />}
          {screen === "send"    && <SendScreen />}
          {screen === "cards"   && <CardsScreen />}
          {screen === "history" && <HistoryScreen />}
          {screen === "rewards" && <RewardsScreen />}
        </div>
        {/* Bottom tab bar */}
        <div className="flex-shrink-0 flex items-center border-t bg-white" style={{ borderColor: `${PURPLE}22` }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
              style={{ color: screen === tab.id ? PURPLE : "#9CA3AF" }}
            >
              {tab.icon}
              <span className="text-[9px] font-semibold">{tab.label}</span>
              {screen === tab.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: PURPLE }} />
              )}
            </button>
          ))}
        </div>
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
