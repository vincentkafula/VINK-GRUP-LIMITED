import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../services/config";
import { getToken } from "../services/apiClient";
import { IdentityCard, type IdentityView } from "./footerPages/IdentityCard";

/**
 * The "confirm that a real person is applying" step, for the confirmation screen of any application that goes to /api/applications: an account, a credit card, a business or
 * corporate loan, a SIM, or the invest and rewards forms. It asks the server where this application's check stands and shows the card, or shows NOTHING when identity checks are not
 * switched on or the lookup fails, so it can never get in the way of a confirmation screen. The applicant proves the application is theirs with the reference and the email address
 * they applied with (or, signed in, with their login).
 *
 * For a BUSINESS or corporate application it can show a second card, "Verify your business" (KYB), beneath the first. That card appears only when the server says it is a business verification and it
 * is switched on, so a server that does not know about it (which would answer with the person's status) can never produce a second, mislabelled identity card.
 */
export function ApplicationIdentityStep({ refNo, email, supportEmail = "support@vink.co.za" }: { refNo: string; email?: string; supportEmail?: string }) {
  const [view, setView] = useState<IdentityView | null>(null), [biz, setBiz] = useState<IdentityView | null>(null);
  const ask = useCallback(async (party?: "company"): Promise<IdentityView | null> => {
    const login = getToken();
    const res = await fetch(`${API_BASE}/api/identity/status`, { method: "POST", headers: { "Content-Type": "application/json", ...(login ? { Authorization: `Bearer ${login}` } : {}) }, body: JSON.stringify({ kind: "application", ref: refNo, ...(party ? { party } : {}), ...(email ? { email } : {}) }) });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: IdentityView } | null;
    return res.ok && json?.success && json.data ? json.data : null;
  }, [refNo, email]);
  const load = useCallback(async () => {
    if (!refNo) return;
    // the person and the business are asked about separately, and either may fail without affecting the other or the screen
    const [p, b] = await Promise.all([ask().catch(() => null), ask("company").catch(() => null)]);
    if (p) setView(p);
    if (b) setBiz(b.party === "company" ? b : null);                                      // only ever a business check, never the person's status shown a second time
  }, [ask, refNo]);
  useEffect(() => { void load(); }, [load]);
  const showPerson = !!view?.enabled, showBiz = !!biz?.enabled;
  if (!showPerson && !showBiz) return null;
  return (
    <div className="vc" style={{ marginTop: 16, textAlign: "left", width: "100%", maxWidth: 640, marginInline: "auto" }}>
      {showPerson && <IdentityCard identity={view!} kind="application" refNo={refNo} email={email} supportEmail={supportEmail} onChanged={() => void load()} />}
      {showBiz && <IdentityCard identity={biz!} kind="application" party="company" refNo={refNo} email={email} supportEmail={supportEmail} onChanged={() => void load()} />}
    </div>
  );
}
