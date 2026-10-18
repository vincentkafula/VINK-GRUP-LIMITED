/**
 * Whether the server told this tab, at sign-in, that the account must use two-factor sign-in but has not set it up (it answers mfaEnrollRequired when the platform rule
 * AUTH_REQUIRE_STAFF_MFA is on). It lives for the tab only, and is cleared at the next sign-in and when two-factor is switched on.
 */
const KEY = "vink_mfa_enrol";
export const mfaEnrolRequired = (): boolean => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMfaEnrolRequired = (on: boolean): void => { try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* storage blocked: the prompt just does not appear */ } };
