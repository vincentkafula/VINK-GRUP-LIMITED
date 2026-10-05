/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the VINK API; fields are read directly as in the original dashboard */
import { api, ask, toast, secret, showList, R, dt, when, enc, destOptions, dest, table, tag, btn, Sw, form, collect, list, type Page } from "../kit";

/* Flows shared by several pages. */

export const payoutNow = async () => {
  const v = await ask("Request payout", [
    { name: "to", label: "Pay out to", type: "select", options: await destOptions() },
    { name: "amount", label: "Amount in rand (blank = everything available)", money: true, required: false },
  ], "Request payout");
  if (!v) return;
  const p = await api("/payouts", { method: "POST", idem: true, body: { amount: v.amount, destination: dest(v.to) } });
  toast(`Payout of ${R(p.net)} sent (fee ${R(p.fee)})`);
};

export const addBeneficiary = async () => {
  const v = await ask("Add a beneficiary", [
    { name: "name", label: "Name" }, { name: "bank", label: "Bank" }, { name: "accountNumber", label: "Account number" },
    { name: "branchCode", label: "Branch code (6 digits)", required: false },
  ], "Save");
  if (v) { await api("/bank/beneficiaries", { method: "POST", body: v }); toast("Beneficiary saved"); }
};

/** A payment link is sent to the customer's browser, so it points at the hosted checkout page. */
export const checkoutLink = (kind: "r" | "b", token: string) => `${location.origin}/pay?${kind}=${encodeURIComponent(token)}`;

export const newPaymentRequest = async () => {
  const v = await ask("Request a payment", [
    { name: "amount", label: "Amount in rand", money: true },
    { name: "description", label: "What is it for?", required: false },
    { name: "customerEmail", label: "Customer email", type: "email", required: false },
  ], "Create link");
  if (!v) return;
  const r = await api("/payment-requests", { method: "POST", body: v });
  const link = checkoutLink("r", r.token);
  try { await navigator.clipboard.writeText(link); toast("Payment link copied to your clipboard"); } catch { await secret("Payment link", link, "Send this link to your customer."); }
};

export const requestsPage = (title: string, sub: string, history: boolean): Page => async ({ F }) => {
  const d = await api(`/payment-requests?${history ? "history=1" : "status=open_or_processing"}&q=${enc(F("q"))}`);
  return {
    title, sub, filters: [{ name: "q", label: "Search description or email" }],
    actions: history ? [] : [{ label: "New payment request", p: true, fn: newPaymentRequest }],
    content: table([
      { h: "Created", f: (r: any) => dt(r.created_at) }, { h: "Description", f: (r: any) => r.description || r.id }, { h: "Customer", f: (r: any) => r.customer_email || "—" },
      { h: "Status", f: (r: any) => tag(r.status) }, { h: "Expires", f: (r: any) => dt(r.expires_at) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
      { h: "", f: (r: any) => (r.status === "open" ? btn("Cancel", "cancel|" + r.id, "d") : null) },
    ], d.data, history ? "No past requests." : "No open requests."),
    on: { cancel: async (id) => { await api(`/payment-requests/${id}/cancel`, { method: "POST" }); toast("Cancelled"); } },
  };
};

export const toggles = (section: "payment_methods" | "notifications", labels: Record<string, string>): Page => async () => {
  const s = (await api("/settings"))[section];
  return {
    title: { payment_methods: "Payment methods", notifications: "Notification settings" }[section],
    sub: section === "payment_methods" ? "Turn off a method and customers can no longer pay with it. At least one must stay on." : "Choose which events create an in-app notification.",
    content: <>{Object.entries(labels).map(([k, l]) => <Sw key={k} on={!!s[k]} d={`tg|${section}|${k}|${!s[k]}`} label={l} />)}</>,
    on: { tg: async (sec, k, v) => { await api("/settings", { method: "PUT", body: { [sec]: { [k]: v === "true" } } }); } },
  };
};

export const profilePage = (section: "personal" | "business", title: string, fields: { name: string; label: string }[]): Page => async () => {
  const p = await api("/account/profile");
  return {
    title, sub: "Used on invoices and for verification.",
    actions: [{ label: "Save", p: true, fn: async () => { await api("/account/profile", { method: "PUT", body: { [section]: collect() } }); toast("Saved"); } }],
    content: form(fields, p[section]),
  };
};

export const statementDialog = async (id: string) => {
  const s = await api(`/bank/accounts/${id}/statement?limit=40`);
  await showList("Statement", list(s.data, (x: any, i) => (
    <div className="row" key={i}>
      <div><b>{x.memo || x.kind}</b><span>{when(x.date)}</span></div>
      <div style={{ textAlign: "right" }}><em>{R(x.amount)}</em><br /><span>{R(x.balance)}</span></div>
    </div>
  )));
};

export {};
