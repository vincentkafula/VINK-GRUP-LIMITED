import { LogIn } from "lucide-react";

/**
 * Replaces what used to be a separate, independent login form in each of
 * several dashboards (Vehicle Tracking, Mobile Network, Banking,
 * Passenger, Driver, Management Hub) — all of which called the exact same
 * real /api/auth/login backend under the hood, just through different
 * frontend service files each keeping their own separate token. That
 * meant someone already signed in from the main menu could still be
 * shown a second, unrelated-looking credentials form here.
 *
 * There is now exactly one place to sign in: the Login button in the
 * main site header. Every dashboard that needs a session checks for one
 * on mount (see the getMainToken() bridge in each dashboard's top-level
 * component) and only falls back to this message if none exists yet.
 */
export function SignInElsewhere({ onClose, label = "This area" }: { onClose: () => void; label?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4" style={{ color: "#fff" }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
        <LogIn className="w-7 h-7" style={{ color: "#8884AA" }} />
      </div>
      <div>
        <p className="text-base font-bold">Sign in required</p>
        <p className="text-sm mt-1 max-w-xs" style={{ color: "#8884AA" }}>
          {label} uses the same one sign-in as the rest of VINK. Use the <strong>Login</strong> button in the main menu, then come back here.
        </p>
      </div>
      <button onClick={onClose}
        className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#1FAE58,#5FC97F)" }}>
        Close
      </button>
    </div>
  );
}
