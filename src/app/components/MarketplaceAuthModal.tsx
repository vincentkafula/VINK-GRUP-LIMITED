import { useState } from "react";
import { X, User, Store, Loader2, Eye, EyeOff } from "lucide-react";
import { mktAuth, type MktAuthUser } from "../services/marketplaceApi";

type Tab = "signin" | "customer" | "seller";

interface Props {
  onClose: () => void;
  onAuthenticated: (user: MktAuthUser, seller: { id: string; storeName: string; status: string } | null) => void;
}

function Field({ label, value, onChange, type = "text", required = true, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={isPw ? (show ? "text" : "password") : type}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC]"
        />
        {isPw && (
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </span>
    </label>
  );
}

export function MarketplaceAuthModal({ onClose, onAuthenticated }: Props) {
  const [tab, setTab] = useState<Tab>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign in
  const [siUsername, setSiUsername] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Customer registration
  const [cName, setCName] = useState("");
  const [cUsername, setCUsername] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");

  // Seller registration
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPassword, setSPassword] = useState("");
  const [sStoreName, setSStoreName] = useState("");
  const [sDescription, setSDescription] = useState("");
  const [sPhone, setSPhone] = useState("");

  const handleSignIn = async () => {
    setError(null);
    if (!siUsername || !siPassword) { setError("Enter your username and password."); return; }
    setLoading(true);
    const r = await mktAuth.login(siUsername, siPassword);
    setLoading(false);
    if (r.success && r.token) onAuthenticated(r.user, JSON.parse(localStorage.getItem("mkt_seller") ?? "null"));
    else setError((r as { error?: string }).error ?? "Sign in failed. Check your username and password.");
  };

  const handleCustomerRegister = async () => {
    setError(null);
    if (!cName || !cUsername || !cEmail || !cPassword) { setError("All fields are required."); return; }
    if (cPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const r = await mktAuth.registerCustomer({ username: cUsername, password: cPassword, name: cName, email: cEmail });
    setLoading(false);
    if (r.success && r.token) onAuthenticated(r.user, null);
    else setError((r as { error?: string }).error ?? "Registration failed.");
  };

  const handleSellerRegister = async () => {
    setError(null);
    if (!sName || !sUsername || !sEmail || !sPassword || !sStoreName) { setError("Name, username, email, password and store name are required."); return; }
    if (sPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const r = await mktAuth.registerSeller({ username: sUsername, password: sPassword, name: sName, email: sEmail, storeName: sStoreName, description: sDescription, phone: sPhone });
    setLoading(false);
    if (r.success && r.token) onAuthenticated(r.user, r.seller as { id: string; storeName: string; status: string });
    else setError((r as { error?: string }).error ?? "Registration failed.");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-lg font-black text-[#131921]">vink<span className="text-[#FF9900]">.</span> marketplace</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="flex border-b border-gray-100 shrink-0">
          {([
            { id: "signin" as Tab, label: "Sign In" },
            { id: "customer" as Tab, label: "New Customer" },
            { id: "seller" as Tab, label: "Sell on Vink" },
          ]).map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setError(null); }}
              className="flex-1 text-xs font-semibold py-2.5 border-b-2 transition-colors"
              style={{ borderColor: tab === t.id ? "#FF9900" : "transparent", color: tab === t.id ? "#131921" : "#9CA3AF" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium">{error}</div>}

          {tab === "signin" && (
            <div>
              <Field label="Username" value={siUsername} onChange={setSiUsername} />
              <Field label="Password" value={siPassword} onChange={setSiPassword} type="password" />
              <button onClick={handleSignIn} disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "#FF9900" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><User className="w-4 h-4" /> Sign In</>}
              </button>
              <p className="text-[11px] text-gray-400 mt-3 text-center">Don't have an account? Use the tabs above to register.</p>
            </div>
          )}

          {tab === "customer" && (
            <div>
              <Field label="Full name" value={cName} onChange={setCName} />
              <Field label="Username" value={cUsername} onChange={setCUsername} />
              <Field label="Email" value={cEmail} onChange={setCEmail} type="email" />
              <Field label="Password" value={cPassword} onChange={setCPassword} type="password" placeholder="At least 8 characters" />
              <button onClick={handleCustomerRegister} disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "#131921" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><User className="w-4 h-4" /> Create customer account</>}
              </button>
            </div>
          )}

          {tab === "seller" && (
            <div>
              <Field label="Store name" value={sStoreName} onChange={setSStoreName} />
              <Field label="Store description" value={sDescription} onChange={setSDescription} required={false} />
              <Field label="Your full name" value={sName} onChange={setSName} />
              <Field label="Username" value={sUsername} onChange={setSUsername} />
              <Field label="Email" value={sEmail} onChange={setSEmail} type="email" />
              <Field label="Phone" value={sPhone} onChange={setSPhone} required={false} />
              <Field label="Password" value={sPassword} onChange={setSPassword} type="password" placeholder="At least 8 characters" />
              <button onClick={handleSellerRegister} disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "#131921" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Store className="w-4 h-4" /> Create seller account</>}
              </button>
              <p className="text-[11px] text-gray-400 mt-3">Your store won't be visible to shoppers until the marketplace team approves it — usually within a business day.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
