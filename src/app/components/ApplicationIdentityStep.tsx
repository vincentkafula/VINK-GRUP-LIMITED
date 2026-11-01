import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../services/config";
import { getToken } from "../services/apiClient";
import { IdentityCard, type IdentityView } from "./footerPages/IdentityCard";

/**
 * The "confirm that a real person is applying" step, for the confirmation screen of any application that goes to /api/applications: an account, a credit card, a business or
 * corporate loan, a SIM, or the invest and rewards forms. It asks the server where this application's check stands and shows the card, or shows NOTHING when identity checks are not
 * switched on or the lookup fails, so it can never get in the way of a confirmation screen. The applicant proves the application is theirs with the reference and the email address
 * they applied with (or, signed in, with their login).
 */
export function ApplicationIdentityStep({ refNo, email, supportEmail = "support@vink.co.za" }: { refNo: string; email?: string; supportEmail?: string }) {
  const [view, setView] = useState<IdentityView | null>(null);
  const load = useCallback(async () => {
    if (!refNo) return;
    try {
      const login = getToken();
      const res = await fetch(`${API_BASE}/api/identity/status`, { method: "POST", headers: { "Content-Type": "application/json", ...(login ? { Authorization: `Bearer ${login}` } : {}) }, body: JSON.stringify({ kind: "application", ref: refNo, ...(email ? { email } : {}) }) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: IdentityView } | null;
      if (res.ok && json?.success && json.data) setView(json.data);
    } catch { /* the step simply does not appear: a confirmation screen must never fail because of it */ }
  }, [refNo, email]);
  useEffect(() => { void load(); }, [load]);
  if (!view?.enabled) return null;
  return <div className="vc" style={{ marginTop: 16, textAlign: "left", width: "100%", maxWidth: 640, marginInline: "auto" }}><IdentityCard identity={view} kind="application" refNo={refNo} email={email} supportEmail={supportEmail} onChanged={() => void load()} /></div>;
}
