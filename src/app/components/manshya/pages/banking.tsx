/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the VINK API; fields are read directly as in the original dashboard */
import { api, ask, toast, showList, R, dt, when, accountOptions, benOptions, table, tag, btn, cards, note, H2, pct, list, type Page } from "../kit";
import { monthName, shiftMonth, thisMonth } from "../format";
import { addBeneficiary, statementDialog } from "./shared";
import { buyFlow, purchases } from "./account";

export const banking: Record<string, Page> = {};
const P = banking;

P["b/accounts"] = async () => {
  const d = await api("/bank/accounts");
  return {
    title: "Accounts and statements",
    actions: [{
      label: "Open an account", p: true, fn: async () => {
        const v = await ask("Open an account", [{ name: "name", label: "Name" }, { name: "kind", label: "Type", type: "select", options: [["current", "Current"], ["savings", "Savings"]] }], "Open");
        if (v) await api("/bank/accounts", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Account", f: (r: any) => r.name }, { h: "Type", f: (r: any) => r.kind }, { h: "Number", f: (r: any) => r.number }, { h: "Balance", r: true, f: (r: any) => R(r.balance) },
      { h: "", f: (r: any) => <>{btn("Rename", "rn|" + r.id)}{btn("Statement", "stm|" + r.id)}</> },
    ], d.data),
    on: {
      rn: async (id) => { const v = await ask("Rename account", [{ name: "name", label: "New name" }], "Save"); if (v) await api("/bank/accounts/" + id, { method: "PATCH", body: v }); },
      stm: async (id) => { await statementDialog(id); },
    },
  };
};

P["b/savings"] = async () => {
  const d = await api("/bank/savings-goals");
  const move = (dir: 1 | -1) => async (id: string) => {
    const v = await ask(dir > 0 ? "Save money" : "Withdraw money", [
      { name: "acc", label: dir > 0 ? "From" : "To", type: "select", options: await accountOptions() },
      { name: "amount", label: "Amount in rand", money: true },
    ], dir > 0 ? "Save" : "Withdraw");
    if (v) await api(`/bank/savings-goals/${id}/${dir > 0 ? "deposit" : "withdraw"}`, { method: "POST", idem: true, body: { [dir > 0 ? "fromAccountId" : "toAccountId"]: v.acc, amount: v.amount } });
  };
  return {
    title: "Savings goals", sub: "Flexible goals, fixed-term goals and automatic saving.",
    actions: [{
      label: "New goal", p: true, fn: async () => {
        const v = await ask("New savings goal", [
          { name: "name", label: "Goal name" }, { name: "target", label: "Target in rand", money: true },
          { name: "lockUntil", label: "Lock until (optional, for fixed-term)", type: "date", required: false },
          { name: "autoAmount", label: "Save automatically, rand (optional)", money: true, required: false },
          { name: "autoFrequency", label: "How often", type: "select", options: [["weekly", "Weekly"], ["monthly", "Monthly"]] },
          { name: "autoFromAccountId", label: "Take it from", type: "select", options: await accountOptions() },
        ], "Create");
        if (!v) return;
        const body: any = { name: v.name, target: v.target };
        if (v.lockUntil) body.lockUntil = new Date(v.lockUntil).toISOString();
        if (v.autoAmount) Object.assign(body, { autoAmount: v.autoAmount, autoFrequency: v.autoFrequency, autoFromAccountId: v.autoFromAccountId });
        await api("/bank/savings-goals", { method: "POST", body });
      },
    }],
    content: table([
      { h: "Goal", f: (r: any) => <>{r.name}{r.locked && <> <span className="tag s2">locked to {r.lock_until.slice(0, 10)}</span></>}</> },
      { h: "Progress", f: (r: any) => <>{pct(r.progress_pct)}<small>{r.progress_pct}%</small></> },
      { h: "Saved", r: true, f: (r: any) => R(r.saved) }, { h: "Target", r: true, f: (r: any) => R(r.target) },
      { h: "Auto", f: (r: any) => (r.auto ? `${R(r.auto.amount)} ${r.auto.frequency}` : "—") },
      { h: "", f: (r: any) => <>{btn("Save", "sv|" + r.id)}{btn("Withdraw", "wd|" + r.id)}{btn("Close", "cl|" + r.id, "d")}</> },
    ], d.data, "No goals yet."),
    on: { sv: move(1), wd: move(-1), cl: async (id) => { await api("/bank/savings-goals/" + id, { method: "DELETE" }); } },
  };
};

P["b/ben"] = async () => {
  const d = await api("/bank/beneficiaries");
  return {
    title: "Beneficiaries", actions: [{ label: "Add beneficiary", p: true, fn: addBeneficiary }],
    content: table([
      { h: "Name", f: (r: any) => r.name }, { h: "Bank", f: (r: any) => r.bank }, { h: "Account", f: (r: any) => "··" + r.account_number.slice(-4) },
      { h: "", f: (r: any) => <>{btn("Edit", "ed|" + r.id)}{btn("History", "hi|" + r.id)}{btn("Delete", "rm|" + r.id, "d")}</> },
    ], d.data, "No beneficiaries yet."),
    on: {
      ed: async (id) => {
        const v = await ask("Edit beneficiary", [
          { name: "name", label: "Name", required: false }, { name: "bank", label: "Bank", required: false }, { name: "accountNumber", label: "Account number", required: false },
        ], "Save");
        if (v) await api("/bank/beneficiaries/" + id, { method: "PATCH", body: v });
      },
      hi: async (id) => {
        const h = await api(`/bank/beneficiaries/${id}/history`);
        await showList("Payment history", list(h.data, (x: any, i) => (
          <div className="row" key={i}><div><b>{x.reference || "Payment"}</b><span>{when(x.created_at)}</span></div><em>{R(x.amount)}</em></div>
        )));
      },
      rm: async (id) => { await api("/bank/beneficiaries/" + id, { method: "DELETE" }); toast("Deleted. Scheduled payments to them were cancelled."); },
    },
  };
};

P["b/sched"] = async () => {
  const d = await api("/bank/scheduled-payments");
  return {
    title: "Scheduled and recurring payments", sub: "Pay later, or repeat a payment every week or month.",
    actions: [{
      label: "New scheduled payment", p: true, fn: async () => {
        const bens = await benOptions();
        if (!bens.length) throw new Error("Add a beneficiary first");
        const v = await ask("Schedule a payment", [
          { name: "fromAccountId", label: "From", type: "select", options: await accountOptions() },
          { name: "beneficiaryId", label: "To", type: "select", options: bens },
          { name: "amount", label: "Amount in rand", money: true },
          { name: "frequency", label: "Repeat", type: "select", options: [["once", "Just once"], ["weekly", "Every week"], ["monthly", "Every month"]] },
          { name: "startDate", label: "First payment on", type: "date" },
          { name: "reference", label: "Reference", required: false },
        ], "Schedule");
        if (v) await api("/bank/scheduled-payments", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Next payment", f: (r: any) => dt(r.next_run_at) }, { h: "Reference", f: (r: any) => r.reference || "—" }, { h: "Repeats", f: (r: any) => r.frequency },
      { h: "Status", f: (r: any) => tag(r.status) }, { h: "Last result", f: (r: any) => r.last_result || "—" }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
      { h: "", f: (r: any) => (r.status === "active" ? btn("Cancel", "cn|" + r.id, "d") : null) },
    ], d.data, "Nothing scheduled."),
    on: { cn: async (id) => { await api("/bank/scheduled-payments/" + id, { method: "DELETE" }); } },
  };
};

P["b/transfers"] = async () => {
  const d = await api("/bank/transfers");
  return {
    title: "Transfer history",
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) },
      { h: "Type", f: (r: any) => (r.kind === "beneficiary" ? "To another bank" : r.kind === "own" ? "Own accounts" : "To VINK account") },
      { h: "Reference", f: (r: any) => r.reference || "—" }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
    ], d.data, "No transfers yet."),
  };
};

P["b/bills"] = async () => {
  const d = await api("/bills/purchases");
  return {
    title: "Bills and prepaid", sub: "Airtime, data, SMS, electricity, water, vouchers, TV and municipal bills.",
    actions: [{ label: "Buy or pay", p: true, fn: () => buyFlow("/bills/purchase") }],
    content: purchases(d.data),
  };
};

P["b/debit"] = async () => {
  const d = await api("/bank/debit-orders");
  const act = (a: string) => async (id: string) => { await api(`/bank/debit-orders/${id}/${a}`, { method: "POST" }); };
  return {
    title: "Debit orders", sub: "Approve or decline new requests, stop an order, or dispute a recent collection.",
    actions: [{
      label: "Simulate a request (sandbox)", fn: async () => {
        const v = await ask("Simulate a debit order request", [
          { name: "accountId", label: "Account", type: "select", options: await accountOptions() }, { name: "creditor", label: "Company" }, { name: "amount", label: "Amount in rand", money: true },
        ], "Send");
        if (v) await api("/bank/debit-orders/simulate", { method: "POST", body: { ...v, frequency: "monthly" } });
      },
    }],
    content: table([
      { h: "Company", f: (r: any) => r.creditor }, { h: "Reference", f: (r: any) => r.reference || "—" }, { h: "Repeats", f: (r: any) => r.frequency },
      { h: "Status", f: (r: any) => <>{tag(r.status)}{r.disputed && <> <span className="tag s2">disputed</span></>}</> },
      { h: "Last collection", f: (r: any) => (r.last_collected_at ? dt(r.last_collected_at) : r.last_result ? r.last_result : "—") },
      { h: "Amount", r: true, f: (r: any) => R(r.amount) },
      {
        h: "", f: (r: any) => r.status === "pending_approval"
          ? <>{btn("Approve", "ap|" + r.id)}{btn("Decline", "dc|" + r.id, "d")}</>
          : r.status === "active"
            ? <>{btn("Stop", "sp|" + r.id, "d")}{r.last_collected_at && !r.disputed && btn("Dispute", "ds|" + r.id)}{btn("Sandbox: collect", "co|" + r.id)}</>
            : null,
      },
    ], d.data, "No debit orders."),
    on: { ap: act("approve"), dc: act("decline"), sp: act("stop"), ds: act("dispute"), co: act("simulate-collect") },
  };
};

P["b/insights"] = async ({ F, setF }) => {
  const d = await api("/bank/insights" + (F("month") ? "?month=" + F("month") : ""));
  const bars = (rows: any[]) => table([
    { h: "Category", f: (r: any) => r.category }, { h: "Share", f: (r: any) => <>{pct(r.share)}<small>{r.share}%</small></> }, { h: "Total", r: true, f: (r: any) => R(r.total) },
  ], rows, "Nothing this month.");
  return {
    title: "Money insights", sub: monthName(d.month),
    actions: [
      { label: "◀ Previous", fn: () => { setF("month", shiftMonth(d.month, -1)); } },
      { label: "Next ▶", fn: () => { const n = shiftMonth(d.month, 1); if (n <= thisMonth()) setF("month", n); } },
    ],
    content: (
      <>
        {cards([["Money in", R(d.money_in)], ["Money out", R(d.money_out)], ["Net cash flow", R(d.net)]])}
        <H2>Where your money went</H2>
        {bars(d.spending)}
        <H2 top>Where it came from</H2>
        {bars(d.income)}
        {note("Moving money between your own accounts is not counted as spending.")}
      </>
    ),
  };
};
