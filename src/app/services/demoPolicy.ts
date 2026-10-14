/**
 * Demo data (invented balances, a fake "superadmin" sign-in) is for local development and for deliberate demos only.
 * On the live site a network failure must show an error, never made-up numbers: someone looking at a balance has to be able
 * to trust it. Set VITE_ALLOW_DEMO=true in a build to switch demo mode on for a showcase; development builds allow it by default.
 */
export const DEMO_ALLOWED: boolean = import.meta.env.DEV === true || import.meta.env.VITE_ALLOW_DEMO === "true";

// A flag left in the browser by an older version must not switch fake data on.
if (!DEMO_ALLOWED) { try { localStorage.removeItem("vink_demo"); } catch { /* storage unavailable */ } }
