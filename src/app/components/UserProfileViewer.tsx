import { useState, useRef } from "react";
import { X, User, Shield, CreditCard, Bell, Settings, LogOut, Camera, CheckCircle, Clock, AlertTriangle, ChevronRight, Eye, EyeOff, Edit3, Phone, Mail, MapPin, Calendar, FileText, Star, Smartphone, Globe } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

const P = "#5B2D8E";
const GOLD = "#F5A623";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSignOut?: () => void;
}

type ProfileTab = "overview" | "kyc" | "security" | "notifications" | "cards" | "preferences";

const KYC_STEPS = [
  { key: "email", label: "Email verified", done: true },
  { key: "phone", label: "Phone number confirmed", done: true },
  { key: "id", label: "SA ID / Passport uploaded", done: true },
  { key: "selfie", label: "Selfie verification", done: true },
  { key: "address", label: "Proof of address", done: false },
  { key: "enhanced", label: "Enhanced due diligence (Enhanced KYC)", done: false },
];

const SECURITY_EVENTS = [
  { action: "Sign in", device: "Chrome · MacBook Pro", location: "Cape Town, ZA", time: "2 minutes ago", current: true },
  { action: "Sign in", device: "Vink Banking App · iPhone 15", location: "Cape Town, ZA", time: "3 hours ago", current: false },
  { action: "Password changed", device: "Chrome · Windows PC", location: "Johannesburg, ZA", time: "5 days ago", current: false },
  { action: "Card freeze (Virtual card ••4291)", device: "Vink Banking App · Samsung S24", location: "Cape Town, ZA", time: "12 days ago", current: false },
];

const NOTIF_PREFS = [
  { key: "transactions", label: "Transaction alerts", desc: "Every debit and credit on your account", enabled: true },
  { key: "security", label: "Security alerts", desc: "Login attempts, password changes, suspicious activity", enabled: true },
  { key: "kyc", label: "KYC & compliance", desc: "Document expiry, verification status changes", enabled: true },
  { key: "loans", label: "Loan updates", desc: "Application status, repayment reminders", enabled: true },
  { key: "promotions", label: "Promotions & offers", desc: "Special deals, VinkPoints bonuses", enabled: false },
  { key: "travel", label: "Club travel", desc: "Booking confirmations, seat availability alerts", enabled: true },
  { key: "statements", label: "Monthly statements", desc: "When your statement is ready to download", enabled: true },
];

export function UserProfileViewer({ isOpen, onClose, onSignOut }: Props) {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [editMode, setEditMode] = useState(false);
  const [showId, setShowId] = useState(false);
  const [showAccountNo, setShowAccountNo] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(NOTIF_PREFS);
  const [twoFaEnabled, setTwoFaEnabled] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    firstName: "Vincent",
    lastName: "Kafula",
    email: "vincent.kafula@vink.co.za",
    phone: "+27 21 007 0772",
    idNumber: "9203145800086",
    dob: "1992-03-14",
    address: "24 Buitenkant Street",
    city: "Cape Town",
    province: "Western Cape",
    postalCode: "8001",
    nationality: "South African",
    tier: "Premium",
    kycStatus: "partial",
    memberSince: "March 2024",
    referralCode: "VINK-VKAFULA8",
    vinkPoints: 14820,
    accountNo: "VINK012847291",
  });

  if (!isOpen) return null;

  const kycDone = KYC_STEPS.filter(s => s.done).length;
  const kycPct = Math.round((kycDone / KYC_STEPS.length) * 100);

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",      label: "Overview",      icon: <User className="w-4 h-4" /> },
    { id: "kyc",           label: "Verification",  icon: <Shield className="w-4 h-4" /> },
    { id: "security",      label: "Security",      icon: <Shield className="w-4 h-4" /> },
    { id: "cards",         label: "Cards & Limits",icon: <CreditCard className="w-4 h-4" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "preferences",   label: "Preferences",   icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 flex flex-col" style={{ background: "#0A0A14", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Avatar & name */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-start gap-3 mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-xl" style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                {profile.firstName[0]}{profile.lastName[0]}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: GOLD }}
              >
                <Camera className="w-3 h-3 text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-base leading-tight">{profile.firstName} {profile.lastName}</p>
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold mt-1" style={{ background: `${GOLD}22`, color: GOLD }}>{profile.tier} Member</span>
              <p className="text-xs text-white/40 mt-1">Since {profile.memberSince}</p>
            </div>
          </div>

          {/* KYC status bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-white/50">KYC Verification</span>
              <span className="font-semibold" style={{ color: kycPct === 100 ? "#10B981" : GOLD }}>{kycPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${kycPct}%`, background: kycPct === 100 ? "#10B981" : GOLD }} />
            </div>
            {kycPct < 100 && (
              <p className="text-[10px] text-white/40">Complete verification to unlock all products</p>
            )}
          </div>

          {/* VinkPoints */}
          <div className="mt-4 p-3 rounded-xl flex items-center gap-3" style={{ background: `${P}22`, border: `1px solid ${P}44` }}>
            <Star className="w-5 h-5" style={{ color: GOLD }} />
            <div>
              <p className="text-xs text-white/50">VinkPoints Balance</p>
              <p className="text-base font-black" style={{ color: GOLD }}>{profile.vinkPoints.toLocaleString()} pts</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
              style={{
                background: tab === t.id ? `${P}33` : "transparent",
                color: tab === t.id ? "#fff" : "rgba(255,255,255,0.5)",
                borderLeft: tab === t.id ? `3px solid ${P}` : "3px solid transparent",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F8F7FF]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <img src={vinkLogo} alt="Vink" className="h-8 w-auto" />
            <span className="text-gray-400">/</span>
            <span className="font-semibold text-gray-800">{tabs.find(t => t.id === tab)?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {tab === "overview" && (
              <button
                onClick={() => setEditMode(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: editMode ? `${P}15` : "transparent", color: P, border: `1.5px solid ${P}44` }}
              >
                <Edit3 className="w-3.5 h-3.5" />
                {editMode ? "Save Changes" : "Edit Profile"}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="max-w-2xl space-y-6">
              {/* Personal Information */}
              <Section title="Personal Information" icon={<User className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First Name" value={profile.firstName} edit={editMode} onChange={v => setProfile(p => ({ ...p, firstName: v }))} />
                  <Field label="Last Name" value={profile.lastName} edit={editMode} onChange={v => setProfile(p => ({ ...p, lastName: v }))} />
                  <Field label="Email Address" value={profile.email} icon={<Mail className="w-3.5 h-3.5 text-gray-400" />} edit={false} verified />
                  <Field label="Phone Number" value={profile.phone} icon={<Phone className="w-3.5 h-3.5 text-gray-400" />} edit={editMode} onChange={v => setProfile(p => ({ ...p, phone: v }))} />
                  <Field label="Date of Birth" value={profile.dob} type="date" icon={<Calendar className="w-3.5 h-3.5 text-gray-400" />} edit={editMode} onChange={v => setProfile(p => ({ ...p, dob: v }))} />
                  <Field label="Nationality" value={profile.nationality} icon={<Globe className="w-3.5 h-3.5 text-gray-400" />} edit={false} />
                </div>
                {/* ID Number — masked */}
                <div className="mt-4 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">SA ID Number</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-800">
                      {showId ? profile.idNumber : profile.idNumber.substring(0, 6) + "•••••••"}
                    </span>
                    <button onClick={() => setShowId(v => !v)} className="text-gray-400 hover:text-gray-600 ml-auto">
                      {showId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <span className="flex items-center gap-1 text-xs text-green-600 font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Verified</span>
                  </div>
                </div>
              </Section>

              {/* Address */}
              <Section title="Residential Address" icon={<MapPin className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="Street Address" value={profile.address} edit={editMode} onChange={v => setProfile(p => ({ ...p, address: v }))} />
                  </div>
                  <Field label="City" value={profile.city} edit={editMode} onChange={v => setProfile(p => ({ ...p, city: v }))} />
                  <Field label="Province" value={profile.province} edit={editMode} onChange={v => setProfile(p => ({ ...p, province: v }))} />
                  <Field label="Postal Code" value={profile.postalCode} edit={editMode} onChange={v => setProfile(p => ({ ...p, postalCode: v }))} />
                  <Field label="Country" value="South Africa" edit={false} />
                </div>
              </Section>

              {/* Account Details */}
              <Section title="Account Details" icon={<CreditCard className="w-4 h-4" />}>
                <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Primary Account Number</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-800">
                      {showAccountNo ? profile.accountNo : "VINK••••••••••"}
                    </span>
                    <button onClick={() => setShowAccountNo(v => !v)} className="text-gray-400 hover:text-gray-600 ml-auto">
                      {showAccountNo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Referral Code</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold" style={{ color: P }}>{profile.referralCode}</span>
                    <button className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${P}15`, color: P }}>
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Earn 500 VinkPoints for every friend who joins</p>
                </div>
              </Section>
            </div>
          )}

          {/* ── KYC TAB ── */}
          {tab === "kyc" && (
            <div className="max-w-2xl space-y-6">
              {/* Progress */}
              <div className="p-6 rounded-2xl" style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white/70 text-sm">Verification Level</p>
                    <p className="text-2xl font-black text-white">Enhanced KYC</p>
                    <p className="text-white/70 text-sm mt-1">{kycDone} of {KYC_STEPS.length} steps completed</p>
                  </div>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white" style={{ background: "rgba(255,255,255,0.2)" }}>
                    {kycPct}%
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${kycPct}%` }} />
                </div>
              </div>

              <Section title="Verification Steps" icon={<Shield className="w-4 h-4" />}>
                <div className="space-y-3">
                  {KYC_STEPS.map(step => (
                    <div key={step.key} className="flex items-center gap-3 p-3 rounded-xl border transition-all" style={{ borderColor: step.done ? "#10B98122" : "#F59E0B22", background: step.done ? "#F0FDF4" : "#FFFBEB" }}>
                      {step.done
                        ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        : <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      }
                      <span className="text-sm font-medium text-gray-700 flex-1">{step.label}</span>
                      {step.done
                        ? <span className="text-xs text-green-600 font-semibold">Complete</span>
                        : <button className="text-xs font-semibold px-3 py-1 rounded-lg text-white" style={{ background: GOLD }}>Start</button>
                      }
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Documents Uploaded" icon={<FileText className="w-4 h-4" />}>
                <div className="space-y-3">
                  {[
                    { name: "SA Green ID Book", status: "verified", date: "Uploaded 12 Mar 2024" },
                    { name: "Selfie verification photo", status: "verified", date: "Uploaded 12 Mar 2024" },
                    { name: "Proof of address", status: "required", date: "Not uploaded" },
                  ].map(doc => (
                    <div key={doc.name} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.date}</p>
                      </div>
                      {doc.status === "verified"
                        ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Verified</span>
                        : <button className="text-xs font-semibold px-3 py-1 rounded-lg text-white" style={{ background: P }}>Upload</button>
                      }
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ── SECURITY TAB ── */}
          {tab === "security" && (
            <div className="max-w-2xl space-y-6">
              <Section title="Authentication" icon={<Shield className="w-4 h-4" />}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Two-Factor Authentication</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security with OTP verification</p>
                    </div>
                    <button
                      onClick={() => setTwoFaEnabled(v => !v)}
                      className="relative w-12 h-6 rounded-full transition-colors"
                      style={{ background: twoFaEnabled ? P : "#D1D5DB" }}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${twoFaEnabled ? "left-6" : "left-0.5"}`} />
                    </button>
                  </div>
                  <button className="w-full text-left flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Change Password</p>
                      <p className="text-xs text-gray-500 mt-0.5">Last changed 5 days ago</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                  <button className="w-full text-left flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Biometric Login</p>
                      <p className="text-xs text-gray-500 mt-0.5">Face ID / Fingerprint (mobile app)</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </Section>

              <Section title="Recent Login Activity" icon={<Smartphone className="w-4 h-4" />}>
                <div className="space-y-3">
                  {SECURITY_EVENTS.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                      <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${ev.current ? "bg-green-500" : "bg-gray-300"}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800">{ev.action}</p>
                          {ev.current && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Current</span>}
                        </div>
                        <p className="text-xs text-gray-500">{ev.device}</p>
                        <p className="text-xs text-gray-400">{ev.location} · {ev.time}</p>
                      </div>
                      {!ev.current && (
                        <button className="text-xs text-red-500 hover:text-red-700 font-semibold">Revoke</button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              <div className="p-4 rounded-xl border border-red-100 bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Danger Zone</p>
                    <p className="text-xs text-red-600 mt-1">These actions are irreversible. Please be certain before proceeding.</p>
                    <div className="flex gap-2 mt-3">
                      <button className="px-4 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors">
                        Freeze Account
                      </button>
                      <button className="px-4 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors">
                        Close Account
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CARDS & LIMITS TAB ── */}
          {tab === "cards" && (
            <div className="max-w-2xl space-y-6">
              {[
                { type: "Mastercard Debit", last4: "4291", expires: "09/28", status: "active", daily: 5000, monthly: 50000, spentToday: 850, spentMonth: 12480, color: "#5B2D8E", online: true, international: false, contactless: true },
                { type: "Virtual Card", last4: "7742", expires: "12/26", status: "active", daily: 2000, monthly: 20000, spentToday: 0, spentMonth: 3200, color: "#0F172A", online: true, international: true, contactless: false },
              ].map(card => (
                <div key={card.last4} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  {/* Card visual */}
                  <div className="p-5 flex justify-between items-start" style={{ background: `linear-gradient(135deg,${card.color},${card.color}99)` }}>
                    <div>
                      <p className="text-white/70 text-xs">{card.type}</p>
                      <p className="text-white font-mono text-lg tracking-widest mt-1">•••• •••• •••• {card.last4}</p>
                      <p className="text-white/60 text-xs mt-1">Expires {card.expires}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-400/20 text-green-300">Active</span>
                  </div>
                  {/* Limits & controls */}
                  <div className="p-4 space-y-3 bg-white">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <LimitBar label="Daily limit" spent={card.spentToday} limit={card.daily} />
                      <LimitBar label="Monthly limit" spent={card.spentMonth} limit={card.monthly} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[["Online payments", card.online], ["International", card.international], ["Contactless", card.contactless]].map(([label, val]) => (
                        <span key={label as string} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: val ? "#F0FDF4" : "#F9FAFB", color: val ? "#16A34A" : "#9CA3AF", border: `1px solid ${val ? "#BBF7D0" : "#E5E7EB"}` }}>
                          {val ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {label as string}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-gray-50" style={{ color: P, borderColor: `${P}30` }}>Manage Limits</button>
                      <button className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-colors">Freeze Card</button>
                    </div>
                  </div>
                </div>
              ))}
              <button className="w-full py-3 rounded-2xl text-sm font-semibold border-2 border-dashed transition-colors" style={{ borderColor: `${P}40`, color: P }}>
                + Apply for New Card
              </button>
            </div>
          )}

          {/* ── NOTIFICATIONS TAB ── */}
          {tab === "notifications" && (
            <div className="max-w-2xl">
              <Section title="Notification Preferences" icon={<Bell className="w-4 h-4" />}>
                <div className="space-y-3">
                  {notifPrefs.map(pref => (
                    <div key={pref.key} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{pref.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{pref.desc}</p>
                      </div>
                      <button
                        onClick={() => setNotifPrefs(prev => prev.map(p => p.key === pref.key ? { ...p, enabled: !p.enabled } : p))}
                        className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={{ background: pref.enabled ? P : "#D1D5DB" }}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${pref.enabled ? "left-5.5 translate-x-0.5" : "left-0.5"}`} style={{ left: pref.enabled ? "calc(100% - 22px)" : "2px" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ── PREFERENCES TAB ── */}
          {tab === "preferences" && (
            <div className="max-w-2xl space-y-6">
              <Section title="Language & Region" icon={<Globe className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-4">
                  {[{ label: "Language", options: ["English", "Afrikaans", "Zulu", "Xhosa", "Sotho"] }, { label: "Currency Display", options: ["ZAR (R)", "USD ($)", "EUR (€)"] }].map(sel => (
                    <div key={sel.label}>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">{sel.label}</label>
                      <select className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2" style={{ "--tw-ring-color": P } as React.CSSProperties}>
                        {sel.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Appearance" icon={<Settings className="w-4 h-4" />}>
                <div className="grid grid-cols-3 gap-3">
                  {["Light", "Dark", "System"].map(theme => (
                    <button key={theme} className="p-4 rounded-xl border-2 text-sm font-semibold transition-all" style={{ borderColor: theme === "Light" ? P : "#E5E7EB", color: theme === "Light" ? P : "#374151", background: theme === "Light" ? `${P}08` : "transparent" }}>
                      {theme}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <span style={{ color: P }}>{icon}</span>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, value, edit = false, type = "text", icon, verified, onChange }: { label: string; value: string; edit?: boolean; type?: string; icon?: React.ReactNode; verified?: boolean; onChange?: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
        <input
          type={type}
          value={value}
          readOnly={!edit}
          onChange={e => onChange?.(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm transition-all"
          style={{ paddingLeft: icon ? "2rem" : undefined, borderColor: edit ? "#5B2D8E" : "#E5E7EB", background: edit ? "#fff" : "#F9FAFB", color: "#1F2937" }}
        />
        {verified && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle className="w-4 h-4 text-green-500" />
          </span>
        )}
      </div>
    </div>
  );
}

function LimitBar({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = Math.min(100, (spent / limit) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">R{spent.toLocaleString()} / R{limit.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 80 ? "#EF4444" : pct > 60 ? GOLD : "#10B981" }} />
      </div>
    </div>
  );
}
