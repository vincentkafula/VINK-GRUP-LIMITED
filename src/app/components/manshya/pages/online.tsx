/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { Fragment } from "react";
import { api, ask, toast, download, showList, R, dt, enc, destOptions, dest, table, tag, btn, cards, note, H2, Gap, type Page } from "../kit";
import { payoutNow, addBeneficiary, requestsPage } from "./shared";

export const online: Record<string, Page> = {};
const P = online;

P["o/tx"] = async ({ F }) => {
  const d = await api(`/payments?channel=online&limit=50&q=${enc(F("q"))}&status=${F("status")}`);
  return {
    title: "Online transaction history", sub: "Payments from your website, payment links and buttons.",
    filters: [
      { name: "q", label: "Search name, email or reference" },
      { name: "status", type: "select", label: "Status", options: [["", "All statuses"], ["paid", "Paid"], ["pending", "Pending"], ["failed", "Failed"], ["partially_refunded", "Partly refunded"], ["refunded", "Refunded"]] },
    ],
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Customer", f: (r: any) => r.customer.name || r.customer.email || "—" },
      { h: "Reference", f: (r: any) => r.reference || r.id }, { h: "Method", f: (r: any) => r.method }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "Fee", r: true, f: (r: any) => R(r.fee) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
      { h: "", f: (r: any) => (["paid", "partially_refunded"].includes(r.status) ? btn("Refund", "refund|" + r.id) : null) },
    ], d.data),
    on: {
      refund: async (id) => {
        const v = await ask("Refund payment", [{ name: "amount", label: "Amount in rand (blank = refund everything)", money: true, required: false }], "Refund");
        if (!v) return;
        await api(`/payments/${id}/refund`, { method: "POST", idem: true, body: v.amount ? { amount: v.amount } : {} });
        toast("Refunded");
      },
    },
  };
};

P["o/unified"] = async ({ F }) => {
  const q = `q=${enc(F("q"))}&type=${F("type")}&from=${F("from")}&to=${F("to")}`;
  const d = await api(`/transactions?limit=100&${q}`);
  return {
    title: "Unified transaction history", sub: "Payments, payouts, transfers and bill payments in one list.",
    actions: [{ label: "Download CSV", fn: async () => { await download(`/transactions?format=csv&${q}`, "transactions.csv"); } }],
    filters: [
      { name: "q", label: "Search" },
      { name: "type", type: "select", label: "Type", options: [["", "Everything"], ["payment", "Payments"], ["payout", "Payouts"], ["transfer", "Transfers"], ["bill", "Bills and prepaid"]] },
      { name: "from", type: "date", label: "From" }, { name: "to", type: "date", label: "To" },
    ],
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Type", f: (r: any) => r.type }, { h: "Description", f: (r: any) => r.label }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "Amount", r: true, f: (r: any) => <b style={{ color: r.amount > 0 ? "var(--ok)" : "inherit" }}>{r.amount > 0 ? "+ " : ""}{R(r.amount)}</b> },
    ], d.data),
  };
};

P["o/subs"] = async ({ F }) => {
  const d = await api(`/subscriptions?status=${F("status")}`);
  return {
    title: "Customer subscriptions", sub: "Recurring card charges on your customers’ saved cards.",
    filters: [{ name: "status", type: "select", label: "Status", options: [["", "All"], ["active", "Active"], ["paused", "Paused"], ["past_due", "Past due"], ["cancelled", "Cancelled"]] }],
    actions: [{
      label: "New subscription", p: true, fn: async () => {
        const cs = (await api("/saved-cards")).data;
        if (!cs.length) throw new Error("Save a customer card first (Reports, Customer saved cards)");
        const v = await ask("New subscription", [
          { name: "savedCardId", label: "Customer card", type: "select", options: cs.map((c: any) => [c.id, `${c.customer_email} · ${c.brand} ··${c.last4}`]) },
          { name: "amount", label: "Amount in rand", money: true },
          { name: "interval", label: "Charge", type: "select", options: [["monthly", "Monthly"], ["weekly", "Weekly"]] },
          { name: "customerName", label: "Customer name", required: false },
        ], "Start");
        if (v) await api("/subscriptions", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Customer", f: (r: any) => r.customer_name || r.customer_email }, { h: "Amount", r: true, f: (r: any) => R(r.amount) }, { h: "Every", f: (r: any) => r.interval },
      { h: "Next charge", f: (r: any) => dt(r.next_charge_at) }, { h: "Status", f: (r: any) => tag(r.status) },
      {
        h: "", f: (r: any) => r.status === "cancelled" ? null : (
          <>
            {r.status === "paused" || r.status === "past_due" ? btn("Resume", `sub|${r.id}|active`) : btn("Pause", `sub|${r.id}|paused`)}
            {btn("Cancel", `sub|${r.id}|cancelled`, "d")}
          </>
        ),
      },
    ], d.data),
    on: { sub: async (id, s) => { await api("/subscriptions/" + id, { method: "PATCH", body: { status: s } }); } },
  };
};

P["o/disputes"] = async () => {
  const d = await api("/disputes");
  return {
    title: "Disputes", sub: "When a customer disputes a payment, the money is held until it is decided. Add your evidence here.",
    content: table([
      { h: "Opened", f: (r: any) => dt(r.created_at) }, { h: "Payment", f: (r: any) => r.payment_id }, { h: "Reason", f: (r: any) => r.reason || "—" },
      { h: "Your evidence", f: (r: any) => (r.evidence ? r.evidence.slice(0, 60) : "—") }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "Held", r: true, f: (r: any) => R(r.amount) }, { h: "", f: (r: any) => (r.status === "open" ? btn("Add evidence", "ev|" + r.id) : null) },
    ], d.data, "No disputes."),
    on: {
      ev: async (id) => {
        const v = await ask("Add your evidence", [{ name: "evidence", label: "What happened? Mention delivery, receipts or messages." }], "Submit");
        if (v) await api(`/disputes/${id}/evidence`, { method: "POST", body: v });
      },
    },
  };
};

P["o/payouts"] = async () => {
  const [b, p] = await Promise.all([api("/balance"), api("/payouts")]);
  const wait = p.data.filter((x: any) => x.status === "pending_approval"), done = p.data.filter((x: any) => x.status !== "pending_approval");
  return {
    title: "Payout manager", sub: "Move your available balance to a bank account.",
    actions: [{ label: "Request payout", p: true, fn: payoutNow }],
    content: (
      <>
        {cards([["Total balance", R(b.total)], ["Retained", R(b.retained)], ["Available", R(b.available)], ["Available for payout", R(b.available_for_payout)]])}
        {note(`Each payout costs ${R(b.payout_fee)}. Large payouts requested by a finance user wait for an admin to approve them. Retained money is released once your business is verified.`)}
        {wait.length > 0 && (
          <>
            <H2>Waiting for approval</H2>
            {table([
              { h: "Requested", f: (r: any) => dt(r.created_at) }, { h: "Amount", r: true, f: (r: any) => R(r.gross) },
              { h: "", f: (r: any) => <>{btn("Approve", "apv|" + r.id)}{btn("Reject", "rjt|" + r.id, "d")}</> },
            ], wait)}
            <Gap />
          </>
        )}
        {table([
          { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "To", f: (r: any) => r.destination.type.replace("_", " ") },
          { h: "Net", r: true, f: (r: any) => R(r.net) }, { h: "Status", f: (r: any) => tag(r.status) },
        ], done.slice(0, 8), "No payouts yet.")}
      </>
    ),
    on: {
      apv: async (id) => { await api(`/payouts/${id}/approve`, { method: "POST" }); toast("Payout approved"); },
      rjt: async (id) => { await api(`/payouts/${id}/reject`, { method: "POST" }); },
    },
  };
};

P["o/payacc"] = async () => {
  const [a, b] = await Promise.all([api("/bank/accounts"), api("/bank/beneficiaries")]);
  return {
    title: "Payout accounts", sub: "Where your payouts can go.", actions: [{ label: "Add bank account", p: true, fn: addBeneficiary }],
    content: (
      <>
        <H2>Your Manshya accounts</H2>
        {table([{ h: "Account", f: (r: any) => r.name }, { h: "Number", f: (r: any) => r.number }, { h: "Balance", r: true, f: (r: any) => R(r.balance) }], a.data)}
        <H2 top>Other banks</H2>
        {table([
          { h: "Name", f: (r: any) => r.name }, { h: "Bank", f: (r: any) => r.bank }, { h: "Account", f: (r: any) => "··" + r.account_number.slice(-4) },
          { h: "", f: (r: any) => btn("Remove", "rm|" + r.id, "d") },
        ], b.data, "No outside accounts yet.")}
      </>
    ),
    on: { rm: async (id) => { await api("/bank/beneficiaries/" + id, { method: "DELETE" }); toast("Removed"); } },
  };
};

P["o/sched"] = async () => {
  const d = await api("/payout-schedules");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    title: "Payout schedule", sub: "Automatic payouts of everything available, once the minimum is reached.",
    actions: [{
      label: "New schedule", p: true, fn: async () => {
        const v = await ask("New payout schedule", [
          { name: "frequency", label: "How often", type: "select", options: [["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"]] },
          { name: "day", label: "Weekday 0 (Sunday) to 6, or day of month 1 to 28 (ignored for daily)", type: "number", required: false },
          { name: "minAmount", label: "Minimum payout in rand", money: true, required: false },
          { name: "to", label: "Pay out to", type: "select", options: await destOptions() },
        ], "Create");
        if (!v) return;
        const body: any = { frequency: v.frequency, destination: dest(v.to) };
        if (v.frequency !== "daily") body.day = parseInt(v.day, 10);
        if (v.minAmount) body.minAmount = v.minAmount;
        await api("/payout-schedules", { method: "POST", body });
      },
    }],
    content: table([
      { h: "When", f: (r: any) => (r.frequency === "daily" ? "Every day" : r.frequency === "weekly" ? "Every " + days[r.day] : `Day ${r.day} of the month`) },
      { h: "Minimum", r: true, f: (r: any) => R(r.min_amount) }, { h: "To", f: (r: any) => r.destination.type.replace("_", " ") },
      { h: "Last run", f: (r: any) => dt(r.last_run_at) }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "", f: (r: any) => <>{btn(r.status === "active" ? "Pause" : "Resume", `st|${r.id}|${r.status === "active" ? "paused" : "active"}`)}{btn("Delete", `st|${r.id}|deleted`, "d")}</> },
    ], d.data, "No schedules yet."),
    on: { st: async (id, s) => { await api("/payout-schedules/" + id, { method: "PATCH", body: { status: s } }); } },
  };
};

P["o/payhist"] = async () => {
  const d = await api("/payouts");
  return {
    title: "Payout history",
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "To", f: (r: any) => r.destination.type.replace("_", " ") }, { h: "Gross", r: true, f: (r: any) => R(r.gross) },
      { h: "Fee", r: true, f: (r: any) => R(r.fee) }, { h: "Net", r: true, f: (r: any) => R(r.net) }, { h: "Status", f: (r: any) => tag(r.status) },
    ], d.data, "No payouts yet."),
  };
};

P["o/fees"] = async ({ F }) => {
  const q = `from=${F("from")}&to=${F("to")}`;
  const d = await api(`/reports/fees?${q}`), t = d.totals;
  return {
    title: "Fees report", sub: "What you paid to process payments and send payouts.",
    actions: [{ label: "Download CSV", fn: async () => { await download(`/reports/fees?format=csv&${q}`, "fees.csv"); } }],
    filters: [{ name: "from", type: "date", label: "From" }, { name: "to", type: "date", label: "To" }],
    content: (
      <>
        {cards([["Sales volume", R(t.volume)], ["Processing fees", R(t.processing_fees)], ["Payout fees", R(t.payout_fees)], ["Total fees", R(t.total_fees)]])}
        {table([
          { h: "Day", f: (r: any) => r.day }, { h: "Channel", f: (r: any) => r.channel }, { h: "Transactions", r: true, f: (r: any) => r.transactions },
          { h: "Volume", r: true, f: (r: any) => R(r.volume) }, { h: "Fees", r: true, f: (r: any) => R(r.fees) },
        ], d.rows, "No sales in this period.")}
      </>
    ),
  };
};

/** Compare with a gateway settlement file (paste a CSV). */
async function compareWithGateway() {
  const v = await ask("Compare with your gateway’s settlement file", [
    { name: "csv", label: "Paste the file. Columns: gateway_ref, amount (rand), date (optional).", type: "textarea", placeholder: "gateway_ref,amount,date\nmock_ab12,125.50,2026-10-01" },
  ], "Compare");
  if (!v) return;
  const r = await api("/reports/reconciliation/import", { method: "POST", body: v }), s = r.summary;
  const section = (t: string, rows: any[], line: (x: any) => string) => rows.length > 0 && (
    <Fragment key={t}>
      <h4 style={{ margin: "12px 0 4px" }}>{t}</h4>
      {rows.slice(0, 8).map((x, i) => <div className="row" key={i}><div>{line(x)}</div></div>)}
    </Fragment>
  );
  await showList("Settlement comparison", (
    <>
      {section("Amount or status differs", r.amount_mismatch, (x) => `${x.gateway_ref}: file ${R(x.file_amount)}, ours ${R(x.our_amount)} (${x.our_status})`)}
      {section("In the file but not in our records", r.not_in_our_records, (x) => `${x.gateway_ref}: ${R(x.file_amount)}`)}
      {section("In our records but not in the file", r.missing_from_file, (x) => `${x.gateway_ref}: ${R(x.amount)}`)}
      {!s.amount_mismatch && !s.not_in_our_records && !s.missing_from_file && <p>Everything matches.</p>}
    </>
  ), <p className="note2">{s.matched} of {s.rows} rows match ({R(s.matched_total)}).</p>);
}

P["o/recon"] = async ({ F }) => {
  const q = `from=${F("from")}&to=${F("to")}`;
  const d = await api(`/reports/reconciliation?${q}`), s = d.summary;
  return {
    title: "Reconciliation", sub: "Checks that every payment has a matching ledger entry.",
    actions: [
      { label: "Download CSV", fn: async () => { await download(`/reports/reconciliation?format=csv&${q}`, "reconciliation.csv"); } },
      { label: "Compare with gateway file", fn: compareWithGateway },
    ],
    filters: [{ name: "from", type: "date", label: "From" }, { name: "to", type: "date", label: "To" }],
    content: (
      <>
        {cards([["Payments", s.payments], ["Payments total", R(s.payments_total)], ["Ledger total", R(s.ledger_total)], ["Difference", R(s.difference)], ["Unmatched", s.unmatched]])}
        {note(d.ledger_ok ? "Ledger check passed: every entry balances." : "Ledger check FAILED: contact support.")}
        {s.unmatched > 0 && table([
          { h: "Payment", f: (r: any) => r.id }, { h: "Issue", f: (r: any) => r.issue },
          { h: "Payment", r: true, f: (r: any) => R(r.payment_amount) }, { h: "Ledger", r: true, f: (r: any) => R(r.ledger_amount) },
        ], d.unmatched)}
        {table([{ h: "Day", f: (r: any) => r.day }, { h: "Payments", r: true, f: (r: any) => r.count }, { h: "Total", r: true, f: (r: any) => R(r.total) }], d.days, "No payments in this period.")}
      </>
    ),
  };
};

P["o/cards"] = async ({ F }) => {
  const d = await api(`/saved-cards?q=${enc(F("q"))}`);
  return {
    title: "Customer saved cards", sub: "Cards your customers saved for repeat payments. Only a gateway token is stored, never the card number.",
    filters: [{ name: "q", label: "Search customer email" }],
    actions: [{
      label: "Save a card", p: true, fn: async () => {
        const v = await ask("Save a customer card", [
          { name: "customerEmail", label: "Customer email", type: "email" },
          { name: "brand", label: "Brand", type: "select", options: ["Visa", "Mastercard", "Amex", "Diners"].map((x): [string, string] => [x, x]) },
          { name: "last4", label: "Last 4 digits" }, { name: "expiry", label: "Expiry (MM/YY)" }, { name: "token", label: "Gateway token" },
        ], "Save");
        if (v) await api("/saved-cards", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Customer", f: (r: any) => r.customer_email }, { h: "Card", f: (r: any) => `${r.brand} ··${r.last4}` }, { h: "Expires", f: (r: any) => r.expiry },
      { h: "Saved", f: (r: any) => dt(r.created_at) }, { h: "", f: (r: any) => btn("Remove", "rm|" + r.id, "d") },
    ], d.data, "No saved cards."),
    on: { rm: async (id) => { await api("/saved-cards/" + id, { method: "DELETE" }); toast("Card removed and its subscriptions cancelled"); } },
  };
};

P["o/req"] = requestsPage("Search payment requests", "Open payment requests waiting to be paid.", false);
P["o/reqhist"] = requestsPage("Payment request history", "Paid, cancelled and expired requests.", true);
