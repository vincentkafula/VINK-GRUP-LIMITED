/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./manshya.css";
import { getSession } from "../../services/apiClient";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { api as rawApi, openBlob, MANSHYA_BASE } from "./api";
import { ask, secret, toast, DialogHost, ToastHost } from "./dialogs";
import { R, dt } from "./format";
import { TestModeBanner } from "./TestModeBanner";

/* Staff back office: applications, KYC, merchants, fraud, disputes, credit, claims, support, audit.
   Staff accounts only (owner / superadmin). The server enforces it; this screen just says so politely. */

export const BACK_OFFICE_ROLES = ["owner", "superadmin"];
const BASE = `${MANSHYA_BASE}/admin`;
const api = <T = any,>(path: string, opts?: Parameters<typeof rawApi>[1]) => rawApi<T>(path, opts, BASE);

const GOOD = ["approved", "active", "won", "answered", "dismissed"], BAD = ["rejected", "suspended", "lost", "confirmed"];
const tag = (s: string) => <span className={`tag ${GOOD.includes(s) ? "g" : BAD.includes(s) ? "r" : ""}`}>{String(s).replace(/_/g, " ")}</span>;
const Lk = ({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) => (
  <button className={`lnk ${danger ? "d" : ""}`} onClick={onClick}>{children}</button>
);

interface Col<T> { h: string; r?: boolean; f: (row: T) => ReactNode }
function Table<T>({ cols, rows, empty = "Nothing waiting." }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <div className="card empty">{empty}</div>;
  return (
    <div className="card">
      <table>
        <thead><tr>{cols.map((c, i) => <th key={i} className={c.r ? "r" : ""}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{cols.map((c, ci) => <td key={ci} className={c.r ? "r" : ""}>{c.f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const Kpis = ({ items }: { items: [string, ReactNode][] }) => <div className="kp">{items.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>;
const confirm = async (title: string, cta: string) => !!(await ask(title, [], cta));

const TABS = {
  overview: "Overview", applications: "Applications", kyc: "KYC queue", merchants: "Merchants", transactions: "Transactions", fraud: "Fraud flags",
  disputes: "Disputes", credit: "Credit", claims: "Insurance claims", support: "Support", audit: "Audit log",
} as const;
type Tab = keyof typeof TABS;

export function ManshyaAdmin({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useBodyScrollLock(isOpen);
  const session = getSession();
  const allowed = !!session && BACK_OFFICE_ROLES.includes(session.role);
  const [tab, setTab] = useState<Tab>("overview");
  const [mq, setMq] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [body, setBody] = useState<ReactNode>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const act = (fn: () => Promise<void>) => async () => { try { await fn(); } catch (e) { toast((e as Error).message); } reload(); };

  useEffect(() => {
    if (!isOpen || !allowed) return;
    let live = true;
    (async () => {
      try {
        const node = await PAGES[tab]({ act, mq, setMq, flagged, setFlagged });
        if (live) setBody(node);
      } catch (e) { if (live) setBody(<div className="card">{(e as Error).message}</div>); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, allowed, tab, mq, flagged, tick]);

  if (!isOpen) return null;

  return (
    <div className="mka" role="dialog" aria-modal="true" aria-label="Manshya back office">
      <TestModeBanner />
      <header>
        <b>manshya<i>.</i> back office</b>
        {allowed && <nav>{(Object.keys(TABS) as Tab[]).map((k) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{TABS[k]}</button>)}</nav>}
        <button className="lnk" style={{ color: "#fff", marginLeft: "auto" }} onClick={onClose}>Close</button>
      </header>
      <main>
        {allowed ? body : (
          <div className="card">
            <h1>Staff sign-in required</h1>
            <p>The back office is for staff accounts. Sign in with a staff account to continue.</p>
          </div>
        )}
      </main>
      <DialogHost />
      <ToastHost />
    </div>
  );
}

interface Ctx { act: (fn: () => Promise<void>) => () => Promise<void>; mq: string; setMq: (v: string) => void; flagged: boolean; setFlagged: (v: boolean) => void }

const PAGES: Record<Tab, (c: Ctx) => Promise<ReactNode>> = {
  async overview() {
    const o = await api("/overview");
    return (
      <>
        <h1>Overview</h1>
        <Kpis items={[["Merchants", o.merchants.total], ["Suspended", o.merchants.suspended], ["Volume, 30 days", R(o.last_30_days.volume)], ["Fee revenue", R(o.platform.fee_revenue)], ["Disputes held", R(o.platform.disputes_held)], ["Ledger balanced", o.platform.ledger_ok ? "Yes" : "NO"]]} />
        <h1>Waiting for you</h1>
        <Kpis items={Object.entries(o.queue).map(([k, v]): [string, ReactNode] => [k.replace("_", " "), v as number])} />
      </>
    );
  },

  async applications({ act }) {
    const d = await api("/applications");
    const decide = (r: any, decision: "approve" | "reject") => act(async () => {
      let note = "", override = false;
      if (decision === "reject") {
        const v = await ask("Reject application", [{ name: "note", label: "Reason to send the applicant (optional)", required: false }], "Reject");
        if (!v) return;
        note = v.note ?? "";
      } else if (r.identity_status === "refer") {
        if (!(await confirm("The identity check was referred. Approve anyway?", "Approve anyway"))) return;
        override = true;
      }
      const res = await api(`/applications/${r.id}/decide`, { method: "POST", body: { decision, note, override } });
      if (res.api_key) await secret("Approved", res.api_key, "Give this API key to the merchant securely. It cannot be shown again.");
    });
    return (
      <>
        <h1>Applications</h1>
        <Table rows={d.data} cols={[
          { h: "Business", f: (r: any) => r.business_name }, { h: "Owner", f: (r: any) => r.owner_name }, { h: "Email", f: (r: any) => r.email },
          { h: "ID check", f: (r: any) => (r.identity_status === "verified" ? tag("approved") : <span className="tag r">{r.identity_status}</span>) },
          { h: "Status", f: (r: any) => tag(r.status) },
          { h: "", f: (r: any) => r.status === "submitted" ? <><Lk onClick={decide(r, "approve")}>Approve</Lk><Lk danger onClick={decide(r, "reject")}>Reject</Lk></> : null },
        ]} />
      </>
    );
  },

  async kyc({ act }) {
    const d = await api("/kyc");
    const review = (id: string, status: "approved" | "rejected") => act(async () => {
      let note: string | undefined;
      if (status === "rejected") {
        const v = await ask("Reject document", [{ name: "note", label: "Why is it rejected?" }], "Reject");
        if (!v) return;
        note = v.note;
      }
      await api(`/documents/${id}/review`, { method: "POST", body: { status, note } });
    });
    return (
      <>
        <h1>Documents to review</h1>
        <Table rows={d.data} cols={[
          { h: "Merchant", f: (r: any) => r.merchant }, { h: "Type", f: (r: any) => r.type.replace(/_/g, " ") }, { h: "File", f: (r: any) => r.filename }, { h: "Sent", f: (r: any) => dt(r.created_at) },
          {
            h: "", f: (r: any) => (
              <>
                {r.has_file && <Lk onClick={act(() => openBlob(`/documents/${r.id}/file`, BASE))}>View file</Lk>}
                <Lk onClick={review(r.id, "approved")}>Approve</Lk><Lk danger onClick={review(r.id, "rejected")}>Reject</Lk>
              </>
            ),
          },
        ]} />
      </>
    );
  },

  async merchants({ act, mq, setMq }) {
    const d = await api("/merchants?q=" + encodeURIComponent(mq));
    const suspend = (id: string, status: "suspended" | "active") => act(async () => {
      const v = await ask(status === "suspended" ? "Suspend merchant" : "Reinstate merchant", [{ name: "reason", label: status === "suspended" ? "Reason for suspending" : "Reason for reinstating" }], status === "suspended" ? "Suspend" : "Reinstate");
      if (v) await api(`/merchants/${id}/status`, { method: "POST", body: { status, reason: v.reason } });
    });
    return (
      <>
        <h1>Merchants</h1>
        <p><input placeholder="Search name or id" defaultValue={mq} onBlur={(e) => e.currentTarget.value !== mq && setMq(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") setMq(e.currentTarget.value); }} /></p>
        <Table rows={d.data} cols={[
          { h: "Name", f: (r: any) => r.name }, { h: "Verified", f: (r: any) => (r.verified ? "Yes" : "No") }, { h: "Status", f: (r: any) => tag(r.status) },
          { h: "Balance", r: true, f: (r: any) => R(r.balance.total) },
          { h: "", f: (r: any) => r.status === "active" ? <Lk danger onClick={suspend(r.id, "suspended")}>Suspend</Lk> : <Lk onClick={suspend(r.id, "active")}>Reinstate</Lk> },
        ]} />
      </>
    );
  },

  async transactions({ act, flagged, setFlagged }) {
    const d = await api("/transactions?limit=100&flagged=" + (flagged ? 1 : 0));
    const dispute = (id: string) => act(async () => {
      const v = await ask("Open a dispute", [
        { name: "amount", label: "Amount to dispute in rand (blank = everything left)", money: true, required: false }, { name: "reason", label: "Reason", required: false },
      ], "Open dispute");
      if (!v) return;
      await api("/disputes", { method: "POST", body: { paymentId: id, reason: v.reason || "", ...(v.amount ? { amount: v.amount } : {}) } });
      toast("Dispute opened and the money is on hold");
    });
    return (
      <>
        <h1>Transactions</h1>
        <p><label><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.currentTarget.checked)} style={{ minWidth: 0 }} /> Flagged only</label></p>
        <Table empty="No transactions." rows={d.data} cols={[
          { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Merchant", f: (r: any) => r.merchant }, { h: "Channel", f: (r: any) => r.channel }, { h: "Status", f: (r: any) => tag(r.status) },
          { h: "Flag", f: (r: any) => (r.flagged ? <span className="tag r">flagged</span> : null) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
          { h: "", f: (r: any) => (r.status === "paid" ? <Lk onClick={dispute(r.id)}>Open dispute</Lk> : null) },
        ]} />
      </>
    );
  },

  async fraud({ act }) {
    const d = await api("/fraud-flags?status=open");
    const resolve = (id: string, outcome: string) => act(async () => { await api(`/fraud-flags/${id}/resolve`, { method: "POST", body: { outcome } }); });
    return (
      <>
        <h1>Open fraud flags</h1>
        <p className="empty">These are alerts for a person to look at. Nothing is blocked automatically.</p>
        <Table rows={d.data} cols={[
          { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Merchant", f: (r: any) => r.merchant }, { h: "Rule", f: (r: any) => r.rule.replace("_", " ") }, { h: "Detail", f: (r: any) => r.detail },
          { h: "", f: (r: any) => <><Lk onClick={resolve(r.id, "dismissed")}>Dismiss</Lk><Lk danger onClick={resolve(r.id, "confirmed")}>Confirm fraud</Lk></> },
        ]} />
      </>
    );
  },

  async disputes({ act }) {
    const d = await api("/disputes");
    const resolve = (id: string, outcome: "merchant" | "customer") => act(async () => {
      const ok = await confirm(outcome === "customer" ? "Return the money to the customer and charge the chargeback fee?" : "Release the held money back to the merchant?", "Yes, decide");
      if (ok) await api(`/disputes/${id}/resolve`, { method: "POST", body: { outcome } });
    });
    return (
      <>
        <h1>Disputes and chargebacks</h1>
        <Table empty="No disputes." rows={d.data} cols={[
          { h: "Opened", f: (r: any) => dt(r.created_at) }, { h: "Payment", f: (r: any) => r.payment_id }, { h: "Reason", f: (r: any) => r.reason || "—" },
          { h: "Evidence", f: (r: any) => (r.evidence || "—").slice(0, 80) }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Held", r: true, f: (r: any) => R(r.amount) },
          { h: "", f: (r: any) => r.status === "open" ? <><Lk onClick={resolve(r.id, "merchant")}>Merchant wins</Lk><Lk danger onClick={resolve(r.id, "customer")}>Customer wins</Lk></> : null },
        ]} />
      </>
    );
  },

  async credit({ act }) {
    const d = await api("/credit");
    const decide = (id: string, decision: "approve" | "decline") => act(async () => {
      const body: Record<string, unknown> = { decision };
      if (decision === "approve") {
        const v = await ask("Offer a credit limit", [{ name: "limit", label: "Credit limit to offer, in rand", money: true }], "Offer");
        if (!v) return;
        body.offeredLimit = v.limit;
      } else {
        const v = await ask("Decline application", [{ name: "reason", label: "Reason" }], "Decline");
        if (!v) return;
        body.reason = v.reason;
      }
      await api(`/credit/applications/${id}/decide`, { method: "POST", body });
    });
    return (
      <>
        <h1>Credit applications</h1>
        <Table empty="No applications." rows={d.applications} cols={[
          { h: "Merchant", f: (r: any) => r.merchant }, { h: "Product", f: (r: any) => r.product.replace("_", " ") }, { h: "Asked", r: true, f: (r: any) => R(r.requested) },
          { h: "Result", f: (r: any) => <>{tag(r.status)}{r.reason && ` ${r.reason}`}</> }, { h: "Offer", r: true, f: (r: any) => (r.offered_limit ? R(r.offered_limit) : "—") },
          { h: "", f: (r: any) => ["declined", "offered"].includes(r.status) ? <><Lk onClick={decide(r.id, "approve")}>Offer a limit</Lk><Lk danger onClick={decide(r.id, "decline")}>Decline</Lk></> : null },
        ]} />
        <h1>Facilities</h1>
        <Table empty="None yet." rows={d.facilities} cols={[
          { h: "Merchant", f: (r: any) => r.merchant }, { h: "Product", f: (r: any) => r.product.replace("_", " ") },
          { h: "Status", f: (r: any) => <>{tag(r.status)}{r.missed > 0 && <> <span className="tag r">{r.missed} missed</span></>}</> },
          { h: "Owed", r: true, f: (r: any) => R(r.owed) }, { h: "Limit", r: true, f: (r: any) => R(r.limit) },
        ]} />
      </>
    );
  },

  async claims({ act }) {
    const d = await api("/claims");
    const decide = (id: string, decision: "approve" | "decline") => act(async () => {
      const body: Record<string, unknown> = { decision };
      if (decision === "decline") {
        const v = await ask("Decline claim", [{ name: "reason", label: "Reason" }], "Decline");
        if (!v) return;
        body.reason = v.reason;
      }
      await api(`/claims/${id}/decide`, { method: "POST", body });
    });
    return (
      <>
        <h1>Insurance claims</h1>
        <Table empty="No claims." rows={d.data} cols={[
          { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Merchant", f: (r: any) => r.merchant }, { h: "Product", f: (r: any) => r.product }, { h: "Cause", f: (r: any) => r.cause },
          { h: "What happened", f: (r: any) => (r.description || "").slice(0, 80) }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Claimed", r: true, f: (r: any) => R(r.amount) },
          { h: "", f: (r: any) => r.status === "submitted" ? <><Lk onClick={decide(r.id, "approve")}>Pay</Lk><Lk danger onClick={decide(r.id, "decline")}>Decline</Lk></> : null },
        ]} />
      </>
    );
  },

  async support({ act }) {
    const d = await api("/support");
    const reply = (id: string) => act(async () => {
      const v = await ask("Reply to ticket", [{ name: "message", label: "Your reply", type: "textarea" }], "Send");
      if (v) await api(`/support/${id}/reply`, { method: "POST", body: { message: v.message } });
    });
    return (
      <>
        <h1>Support tickets</h1>
        <Table empty="No tickets." rows={d.data} cols={[
          { h: "Updated", f: (r: any) => dt(r.updated_at) }, { h: "Merchant", f: (r: any) => r.merchant }, { h: "Category", f: (r: any) => r.category }, { h: "Subject", f: (r: any) => r.subject },
          { h: "Status", f: (r: any) => tag(r.status) }, { h: "", f: (r: any) => <Lk onClick={reply(r.id)}>Reply</Lk> },
        ]} />
      </>
    );
  },

  async audit() {
    const d = await api("/audit?limit=150");
    return (
      <>
        <h1>Audit log</h1>
        <Table empty="Nothing yet." rows={d.data} cols={[
          { h: "When", f: (r: any) => dt(r.created_at) }, { h: "Who", f: (r: any) => r.actor || "—" }, { h: "Merchant", f: (r: any) => r.merchant_id }, { h: "Action", f: (r: any) => r.action },
          { h: "Result", r: true, f: (r: any) => r.status },
        ]} />
      </>
    );
  },
};
