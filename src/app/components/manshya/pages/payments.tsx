/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the VINK API; fields are read directly as in the original dashboard */
import type { ReactNode } from "react";
import { api, ask, toast, secret, showList, showDialog, download, R, dt, when, enc, accountOptions, table, tag, btn, cards, note, H2, RunBtn, list, type Page } from "../kit";
import { publicApi } from "../api";

/* Instant / QR / cash / international payments, statements, cards, rewards, vehicle licence, support, buyer account. */

export const payments: Record<string, Page> = {};
const P = payments;

/* ---------- pay, request, cash ---------- */
const flows = {
  payshap: async () => {
    const v = await ask("Instant payment to a cellphone number", [
      { name: "fromAccountId", label: "From", type: "select", options: await accountOptions() }, { name: "shapId", label: "Their cellphone number" },
      { name: "amount", label: "Amount in rand", money: true }, { name: "reference", label: "Reference", required: false },
    ], "Pay now");
    if (!v) return;
    await api("/bank/payshap", { method: "POST", idem: true, body: v });
    toast(`Sent ${R(v.amount)}`);
  },
  qr: async () => {
    const v = await ask("Scan or paste a VINK QR code", [
      { name: "payload", label: "QR code text" }, { name: "fromAccountId", label: "Pay from", type: "select", options: await accountOptions() },
    ], "Next");
    if (!v) return;
    const q = await api("/bank/qr/parse", { method: "POST", body: { payload: v.payload } });
    let amount = q.amount;
    if (amount === null) {
      const a = await ask(`Pay ${q.merchant}`, [{ name: "amount", label: "Amount in rand", money: true }], "Next");
      if (!a) return;
      amount = a.amount;
    }
    if (!(await ask(`Pay ${R(amount)} to ${q.merchant}?`, [], "Pay"))) return;
    await api("/bank/qr/pay", { method: "POST", idem: true, body: { payload: v.payload, fromAccountId: v.fromAccountId, amount } });
    toast("Paid");
  },
  rtp: async () => {
    const v = await ask("Request money", [
      { name: "fromAccountId", label: "Pay me into", type: "select", options: await accountOptions() }, { name: "payerAccountNumber", label: "Their account number" },
      { name: "amount", label: "Amount in rand", money: true }, { name: "note", label: "What for?", required: false },
    ], "Send request");
    if (v) { await api("/bank/requests", { method: "POST", body: v }); toast("Request sent"); }
  },
  cash: async () => {
    const v = await ask("Send cash", [
      { name: "fromAccountId", label: "From", type: "select", options: await accountOptions() }, { name: "phone", label: "Their cellphone number" }, { name: "amount", label: "Amount in rand", money: true },
    ], "Send");
    if (!v) return;
    const c = await api("/bank/cash", { method: "POST", idem: true, body: v });
    await secret("Cash code", c.code, `Give this code to ${c.phone}. They collect ${R(c.amount)} at an ATM or till before ${when(c.expires_at)}. It cannot be shown again.`);
  },
};

P["b/pay"] = async () => {
  const [r, c] = await Promise.all([api("/bank/requests"), api("/bank/cash")]);
  return {
    title: "Pay and request money", sub: "Instant payments, QR codes, requests between customers and cash for someone without a bank account.",
    actions: [
      { label: "Instant payment", p: true, fn: flows.payshap }, { label: "Pay a QR code", fn: flows.qr }, { label: "Request money", fn: flows.rtp }, { label: "Send cash", fn: flows.cash },
    ],
    content: (
      <>
        <H2>Requests to you</H2>
        {table([
          { h: "From", f: (x: any) => x.from }, { h: "For", f: (x: any) => x.note || "—" }, { h: "Status", f: (x: any) => tag(x.status) }, { h: "Amount", r: true, f: (x: any) => R(x.amount) },
          { h: "", f: (x: any) => (x.status === "pending" ? <>{btn("Pay", "ok|" + x.id)}{btn("Decline", "no|" + x.id, "d")}</> : null) },
        ], r.incoming, "No requests.")}
        <H2 top>Requests you sent</H2>
        {table([
          { h: "To", f: (x: any) => x.to }, { h: "For", f: (x: any) => x.note || "—" }, { h: "Status", f: (x: any) => tag(x.status) }, { h: "Amount", r: true, f: (x: any) => R(x.amount) },
          { h: "", f: (x: any) => (x.status === "pending" ? btn("Cancel", "cn|" + x.id, "d") : null) },
        ], r.outgoing, "None sent.")}
        <H2 top>Cash sent</H2>
        {table([
          { h: "Sent", f: (x: any) => dt(x.created_at) }, { h: "To", f: (x: any) => x.phone }, { h: "Expires", f: (x: any) => dt(x.expires_at) }, { h: "Status", f: (x: any) => tag(x.status) },
          { h: "Amount", r: true, f: (x: any) => R(x.amount) }, { h: "", f: (x: any) => (x.status === "active" ? btn("Cancel", "cc|" + x.id, "d") : null) },
        ], c.data, "No cash sent.")}
      </>
    ),
    on: {
      ok: async (id) => {
        const v = await ask("Pay this request", [{ name: "fromAccountId", label: "Pay from", type: "select", options: await accountOptions() }], "Pay");
        if (v) { await api(`/bank/requests/${id}/approve`, { method: "POST", idem: true, body: v }); toast("Paid"); }
      },
      no: async (id) => { await api(`/bank/requests/${id}/decline`, { method: "POST" }); },
      cn: async (id) => { await api(`/bank/requests/${id}/cancel`, { method: "POST" }); },
      cc: async (id) => { await api(`/bank/cash/${id}/cancel`, { method: "POST" }); toast("Cancelled. The money is back in your account."); },
    },
  };
};

P["b/receive"] = async ({ F }) => {
  const a = (await api("/bank/accounts")).data;
  const id = F("acc") || a[0].id;
  const [sh, qr] = await Promise.all([api(`/bank/accounts/${id}/share`), api("/bank/qr", { method: "POST", body: { accountId: id } })]);
  return {
    title: "Receive money", sub: "Share your details, or let someone scan your QR code to pay you.",
    filters: [{ name: "acc", type: "select", label: "Account", options: a.map((x: any): [string, string] => [x.id, `${x.name} ··${x.number.slice(-4)}`]) }],
    actions: [
      {
        label: "Email my details", p: true, fn: async () => {
          const v = await ask("Email account details", [{ name: "to", label: "Send to", type: "email" }], "Send");
          if (v) { await api(`/bank/accounts/${id}/statement/email`, { method: "POST", body: { to: v.to, what: "details" } }); toast("Sent"); }
        },
      },
      {
        label: "Copy details", fn: async () => {
          try { await navigator.clipboard.writeText(sh.text); toast("Copied"); } catch { await secret("Account details", sh.text.replace(/\n/g, " · "), "Copy this text."); }
        },
      },
    ],
    content: (
      <>
        <div className="cards3">
          <div style={{ gridColumn: "span 2" }}><span>Account details</span><pre style={{ margin: "6px 0 0", font: "inherit", whiteSpace: "pre-wrap" }}>{sh.text}</pre></div>
          <div>
            <span>Pay me by QR</span>
            {/* the SVG is generated by the server's QR library from the account number only */}
            <div style={{ maxWidth: 200, background: "#fff", padding: 8, borderRadius: 12, marginTop: 6 }} aria-label={`QR code for account ${qr.account_number}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
          </div>
        </div>
        {note("Anyone with a VINK app can scan this code to pay you. The code cannot be edited without breaking it.")}
      </>
    ),
  };
};

/* ---------- international ---------- */
P["b/intl"] = async () => {
  const [d, meta] = await Promise.all([api("/bank/international"), api("/bank/international/purposes")]);
  return {
    title: "International payments", sub: "Send money abroad at a rate we lock for 60 seconds.",
    actions: [{
      label: "Send money abroad", p: true, fn: async () => {
        const v = await ask("How much do you want to send?", [
          { name: "currency", label: "Currency", type: "select", options: meta.currencies.map((c: string): [string, string] => [c, c]) },
          { name: "foreignAmount", label: "Amount they receive", money: true },
        ], "Get a rate");
        if (!v) return;
        const q = await api("/bank/fx/quote", { method: "POST", body: v });
        const w = await ask(`${R(q.foreign_amount)} ${q.currency} costs ${R(q.total)} (rate ${q.rate.toFixed(4)}, fee ${R(q.fee)}). Rate locked for 60 seconds.`, [
          { name: "fromAccountId", label: "Pay from", type: "select", options: await accountOptions() }, { name: "name", label: "Recipient name" },
          { name: "country", label: "Country (2 letters, e.g. GB)" }, { name: "swift", label: "Bank SWIFT/BIC code" }, { name: "account", label: "IBAN or account number" },
          { name: "purpose", label: "Reason for payment", type: "select", options: meta.data.map((p: string): [string, string] => [p, p]) },
        ], "Send");
        if (!w) return;
        await api("/bank/international", {
          method: "POST", idem: true,
          body: { quoteId: q.id, fromAccountId: w.fromAccountId, purpose: w.purpose, beneficiary: { name: w.name, country: String(w.country).toUpperCase(), swift: w.swift, account: w.account } },
        });
        toast("Payment sent");
      },
    }],
    content: (
      <>
        {note("International payments are reported to the authorities. You must give a reason for each one, and limits apply.")}
        {table([
          { h: "Sent", f: (r: any) => dt(r.created_at) }, { h: "To", f: (r: any) => `${r.beneficiary.name} (${r.beneficiary.country})` }, { h: "Reason", f: (r: any) => r.purpose },
          { h: "Status", f: (r: any) => tag(r.status) }, { h: "They get", r: true, f: (r: any) => `${R(r.foreign_amount)} ${r.currency}` }, { h: "You paid", r: true, f: (r: any) => R(r.zar_amount + r.fee) },
        ], d.data, "No international payments yet.")}
      </>
    ),
  };
};

/* ---------- statements ---------- */
P["b/statements"] = async ({ F }) => {
  const a = (await api("/bank/accounts")).data;
  const q = `from=${F("from")}&to=${F("to")}`;
  return {
    title: "Statements", sub: "Download an electronically stamped PDF, a CSV, or email one. Anyone can check a stamp is genuine.",
    filters: [{ name: "from", type: "date", label: "From" }, { name: "to", type: "date", label: "To" }],
    content: table([
      { h: "Account", f: (r: any) => `${r.name} ··${r.number.slice(-4)}` }, { h: "Balance", r: true, f: (r: any) => R(r.balance) },
      { h: "", f: (r: any) => <>{btn("PDF", "pdf|" + r.id)}{btn("CSV", "csv|" + r.id)}{btn("Email", "em|" + r.id)}</> },
    ], a),
    on: {
      pdf: async (id) => { await download(`/bank/accounts/${id}/statement.pdf?${q}`, "statement.pdf"); },
      csv: async (id) => { await download(`/bank/accounts/${id}/statement.csv?${q}`, "statement.csv"); },
      em: async (id) => {
        const v = await ask("Email this statement", [{ name: "to", label: "Send to", type: "email" }], "Send");
        if (v) { await api(`/bank/accounts/${id}/statement/email`, { method: "POST", body: { to: v.to, what: "statement", from: F("from") || undefined, periodTo: F("to") || undefined } }); toast("Sent"); }
      },
    },
  };
};

/* ---------- cards ---------- */
P["b/cards"] = async () => {
  const [d, health] = await Promise.all([api("/bank/cards"), publicApi("/health").catch(() => ({}))]);
  const patch = (id: string, b: object) => api("/bank/cards/" + id, { method: "PATCH", body: b });
  return {
    title: "Cards", sub: "Order cards, freeze them, block lost ones and choose where each card works.",
    actions: [{
      label: "Order a card", p: true, fn: async () => {
        const v = await ask("Order a card", [
          { name: "accountId", label: "Linked account", type: "select", options: await accountOptions() },
          { name: "kind", label: "Type", type: "select", options: [["debit", "Debit card (posted to you)"], ["virtual", "Virtual card (instant, online use)"]] },
          { name: "limit", label: "Monthly limit in rand", money: true, required: false }, { name: "dailyLimit", label: "Daily limit in rand", money: true, required: false },
        ], "Order");
        if (v) { await api("/bank/cards", { method: "POST", body: v }); toast("Card ordered. Activate it when it arrives."); }
      },
    }],
    content: table([
      { h: "Card", f: (c: any) => <>{c.kind} ·· {c.last4}{c.wallets.length > 0 && <><br /><small>{c.wallets.join(", ")} wallet</small></>}</> },
      { h: "Status", f: (c: any) => <>{tag(c.status)}{c.blocked_reason && <> <small>{c.blocked_reason}</small></>}</> },
      { h: "Limits", f: (c: any) => <>{R(c.daily_limit)} a day<br /><small>{R(c.limit)} a month</small></> },
      {
        h: "Works for", f: (c: any) => ["blocked", "inactive"].includes(c.status) ? "—" : (
          <>
            {btn("Tap: " + (c.tap ? "on" : "off"), `ctl|${c.id}|tap|${!c.tap}`)}
            {btn("Online: " + (c.online ? "on" : "off"), `ctl|${c.id}|online|${!c.online}`)}
            {btn("Abroad: " + (c.international ? "on" : "off"), `ctl|${c.id}|international|${!c.international}`)}
          </>
        ),
      },
      {
        h: "", f: (c: any) => c.status === "blocked" ? null : c.status === "inactive" ? btn("Activate", "act|" + c.id) : (
          <>
            {btn(c.status === "active" ? "Freeze" : "Unfreeze", `fr|${c.id}|${c.status === "active" ? "frozen" : "active"}`)}
            {btn("Limits", "lim|" + c.id)}{btn("Wallet", "wal|" + c.id)}{btn("Lost or stolen", "blk|" + c.id, "d")}{btn("Activity", "ctx|" + c.id)}
            {(health as any).mode === "test" && btn("Sandbox purchase", "try|" + c.id)}
          </>
        ),
      },
    ], d.data, "No cards yet."),
    on: {
      act: async (id) => { await api(`/bank/cards/${id}/activate`, { method: "POST" }); toast("Card activated"); },
      fr: async (id, s) => { await patch(id, { status: s }); },
      ctl: async (id, k, v) => { await patch(id, { [k]: v === "true" }); },
      lim: async (id) => {
        const v = await ask("Card limits", [{ name: "dailyLimit", label: "Daily limit in rand", money: true, required: false }, { name: "limit", label: "Monthly limit in rand", money: true, required: false }], "Save");
        if (v) await patch(id, v);
      },
      wal: async (id) => {
        const v = await ask("Link to a digital wallet", [
          { name: "wallet", label: "Wallet", type: "select", options: [["apple", "Apple Pay"], ["google", "Google Pay"], ["samsung", "Samsung Pay"]] },
          { name: "action", label: "Action", type: "select", options: [["add", "Link"], ["remove", "Unlink"]] },
        ], "Save");
        if (v) await api(`/bank/cards/${id}/wallets`, { method: "POST", body: v });
      },
      blk: async (id) => {
        const v = await ask("Block this card for good?", [
          { name: "reason", label: "What happened?", type: "select", options: [["lost", "I lost it"], ["stolen", "It was stolen"], ["fraud", "I see payments I did not make"]] },
        ], "Block and replace");
        if (v) { await api(`/bank/cards/${id}/block`, { method: "POST", body: v }); toast("Card blocked. A replacement is ordered."); }
      },
      ctx: async (id) => {
        const t = await api("/bank/cards/transactions?cardId=" + id);
        await showList("Card activity", list(t.data, (x: any, i) => (
          <div className="row" key={i}>
            <div><b>{x.descriptor || x.channel}</b><span>{when(x.created_at)} · {x.status}{x.reason ? ` (${x.reason.replace(/_/g, " ")})` : ""}</span></div>
            <em>{R(x.amount)}</em>
          </div>
        )));
      },
      try: async (id) => {
        const v = await ask("Try a purchase (sandbox)", [
          { name: "amount", label: "Amount in rand", money: true },
          { name: "channel", label: "How", type: "select", options: [["chip", "Chip and PIN"], ["tap", "Tap"], ["online", "Online"], ["international", "Abroad"]] },
        ], "Try it");
        if (!v) return;
        const r = await api(`/bank/cards/${id}/authorize`, { method: "POST", body: { ...v, descriptor: "Sandbox purchase" } });
        toast(r.approved ? "Approved" : "Declined: " + r.reason.replace(/_/g, " "));
      },
    },
  };
};

/* ---------- rewards, vehicle ---------- */
P["b/rewards"] = async () => {
  const r = await api("/rewards");
  return {
    title: "Rewards", sub: "Cashback on airtime, data, electricity and card spending.",
    actions: [{
      label: "Redeem to my account", p: true, fn: async () => {
        const v = await ask("Redeem cashback", [{ name: "accountId", label: "Into", type: "select", options: await accountOptions() }], "Redeem");
        if (v) { const x = await api("/rewards/redeem", { method: "POST", body: v }); toast(`${R(x.redeemed)} added to your account`); }
      },
    }],
    content: (
      <>
        {cards([["Cashback balance", R(r.balance)]])}
        <H2>Special offers</H2>
        {table([{ h: "Offer", f: (o: any) => o.title }, { h: "", f: (o: any) => o.ends }], r.offers)}
        <H2 top>History</H2>
        {table([
          { h: "When", f: (x: any) => dt(x.created_at) }, { h: "What", f: (x: any) => x.memo }, { h: "Amount", r: true, f: (x: any) => R(x.amount) },
        ], r.history, "No cashback yet. Buy airtime or use a card to start earning.")}
      </>
    ),
  };
};

P["b/vehicle"] = async () => {
  const d = await api("/vehicle/renewals");
  return {
    title: "Vehicle licence renewal", sub: "Renew a licence disc and have the new one delivered.",
    actions: [{
      label: "Renew a licence", p: true, fn: async () => {
        const a = await ask("Which vehicle?", [{ name: "plate", label: "Registration number" }], "Look up");
        if (!a) return;
        const i = await api("/vehicle/lookup", { method: "POST", body: { plate: a.plate } });
        const v = await ask(`${i.make} ${i.model}, licence ${i.expires < new Date().toISOString().slice(0, 10) ? "expired" : "expires"} ${i.expires}. Renewal ${R(i.fee)}, delivery ${R(i.delivery_fee)}.`, [
          { name: "accountId", label: "Pay from", type: "select", options: await accountOptions() },
          { name: "address", label: "Delivery address (leave blank to collect)", required: false },
        ], "Renew");
        if (!v) return;
        await api("/vehicle/renew", { method: "POST", idem: true, body: { plate: a.plate, accountId: v.accountId, ...(v.address ? { delivery: { address: v.address } } : {}) } });
        toast("Renewal paid");
      },
    }],
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Vehicle", f: (r: any) => r.plate }, { h: "Delivery", f: (r: any) => r.delivery || "Collect" },
      { h: "Reference", f: (r: any) => r.reference || "—" }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Paid", r: true, f: (r: any) => R(r.amount) },
    ], d.data, "No renewals yet."),
  };
};

/* ---------- support ---------- */
async function thread(id: string): Promise<void> {
  const t = await api("/support/tickets/" + id);
  let reply = false;
  await showDialog((close) => (
    <>
      <h3>{t.subject}</h3>
      <div className="stmt">
        {t.messages.map((m: any, i: number) => (
          <div className="row" key={i}>
            <div><b>{m.author === "customer" ? "You" : "Support"}</b><span>{when(m.created_at)}</span><div style={{ marginTop: 4, color: "var(--ink)" }}>{m.body}</div></div>
          </div>
        ))}
      </div>
      <div className="dact">
        <button className="btn g" onClick={close}>Close</button>
        {t.status !== "closed" && <button className="btn p" onClick={() => { reply = true; close(); }}>Reply</button>}
      </div>
    </>
  ));
  if (!reply) return;
  const v = await ask("Reply", [{ name: "message", label: "Your message" }], "Send");
  if (v) {
    try { await api(`/support/tickets/${id}/messages`, { method: "POST", body: v }); } catch (e) { toast((e as Error).message); }
    await thread(id);
  }
}

P["b/support"] = async ({ F }) => {
  const type = F("type");
  const [tk, fq, loc] = await Promise.all([api("/support/tickets"), api("/support/faqs?q=" + enc(F("q"))), api("/support/locations" + (type ? "?type=" + type : ""))]);
  const digits = (s: string) => String(s).replace(/\D/g, "");
  const c = fq.contact;
  return {
    title: "Support", sub: "We are here to help. Report a problem, message us, or pick up the phone.",
    filters: [
      { name: "q", label: "Search help" },
      { name: "type", type: "select", label: "Branches and ATMs", options: [["", "Branches and ATMs"], ["branch", "Branches only"], ["atm", "ATMs only"]] },
    ],
    actions: [
      {
        label: "Report lost or stolen card, or fraud", p: true, fn: async () => {
          const cs = (await api("/bank/cards")).data.filter((x: any) => x.status !== "blocked");
          const v = await ask("Report a problem", [
            { name: "kind", label: "What happened?", type: "select", options: [["lost_card", "I lost my card"], ["stolen_card", "My card was stolen"], ["fraud", "I see payments I did not make"], ["suspicious_payment", "Something looks suspicious"]] },
            { name: "cardId", label: "Which card? (it will be blocked)", type: "select", options: [["", "No card"], ...cs.map((x: any): [string, string] => [x.id, `${x.kind} ·· ${x.last4}`])] },
            { name: "details", label: "Tell us more", required: false },
          ], "Report");
          if (!v) return;
          if (!v.cardId) delete v.cardId;
          await api("/support/report-fraud", { method: "POST", body: v });
          toast("Reported. Our team will contact you.");
        },
      },
      {
        label: "New message", fn: async () => {
          const v = await ask("Contact support", [
            { name: "category", label: "About", type: "select", options: [["general", "Something else"], ["payments", "Payments"], ["card", "A card"], ["account", "My account"]] },
            { name: "subject", label: "Subject" }, { name: "message", label: "Your message" },
          ], "Send");
          if (v) await api("/support/tickets", { method: "POST", body: v });
        },
      },
    ],
    content: (
      <>
        {cards([
          ["Call us", <a href={`tel:+${digits(c.phone)}`}>{c.phone}</a>],
          ["WhatsApp", <a href={`https://wa.me/${digits(c.whatsapp)}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a>],
          ["Email", <a href={`mailto:${c.email}`}>{c.email}</a>],
        ])}
        <H2>Your messages</H2>
        {table([
          { h: "Updated", f: (r: any) => dt(r.updated_at) }, { h: "Subject", f: (r: any) => r.subject }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "", f: (r: any) => btn("Open", "tk|" + r.id) },
        ], tk.data, "No messages yet.")}
        <H2 top>Help centre</H2>
        {fq.faqs.map((f: any, i: number) => (
          <details className="card" style={{ marginBottom: 8 }} key={"f" + i}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{f.q}</summary><p style={{ margin: "8px 0 0", color: "var(--mute)" }}>{f.a}</p></details>
        ))}
        {fq.guides.map((g: any, i: number) => (
          <details className="card" style={{ marginBottom: 8 }} key={"g" + i}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to: {g.title}</summary>
            <ol style={{ margin: "8px 0 0", color: "var(--mute)" }}>{g.steps.map((s: string, j: number) => <li key={j}>{s}</li>)}</ol>
          </details>
        ))}
        <H2 top>Branches and ATMs</H2>
        {table([{ h: "Name", f: (p: any) => p.name }, { h: "Address", f: (p: any) => p.address }, { h: "Hours", f: (p: any) => p.hours }], loc.data)}
      </>
    ),
    on: { tk: async (id) => { await thread(id); } },
  };
};

/* ---------- buyer account (matched to a verified email) ---------- */
const buyer = (title: string, sub: string, load: () => Promise<any>, render: (d: any) => ReactNode, handlers: Record<string, (...a: string[]) => Promise<void> | void> = {}): Page => async () => {
  const st = await api("/buyer/status");
  if (!st.verified) {
    return {
      title, sub,
      content: (
        <>
          {note(st.email ? `We will email a 6 digit code to ${st.email} to confirm it is you.` : "Add your email under Personal information first.")}
          <RunBtn fn={async () => {
            await api("/buyer/verify/start", { method: "POST" });
            const v = await ask("Enter the 6 digit code we emailed you", [{ name: "code", label: "Code" }], "Verify");
            if (v) { await api("/buyer/verify/confirm", { method: "POST", body: v }); toast("Email verified"); }
          }}>Send me a code</RunBtn>
        </>
      ),
    };
  }
  const d = await load();
  return { title, sub, content: render(d), on: handlers };
};

P["buyer/me"] = buyer("My buyer account", "Everything you have bought through VINK, matched to your verified email.", () => api("/buyer/purchases"),
  (d) => table([
    { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Business", f: (r: any) => r.merchant }, { h: "For", f: (r: any) => r.reference || "—" },
    { h: "Status", f: (r: any) => tag(r.status) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
  ], d.data, "No purchases found."));

P["buyer/subs"] = buyer("My subscriptions", "Pause or cancel anything you pay for regularly.", () => api("/buyer/subscriptions"),
  (d) => table([
    { h: "Business", f: (r: any) => r.merchant }, { h: "Amount", r: true, f: (r: any) => R(r.amount) }, { h: "Every", f: (r: any) => r.interval }, { h: "Next", f: (r: any) => dt(r.next_charge_at) },
    { h: "Status", f: (r: any) => tag(r.status) },
    {
      h: "", f: (r: any) => r.status === "cancelled" ? null : (
        <>{r.status === "active" ? btn("Pause", `st|${r.id}|paused`) : btn("Resume", `st|${r.id}|active`)}{btn("Cancel", `st|${r.id}|cancelled`, "d")}</>
      ),
    },
  ], d.data, "No subscriptions."),
  { st: async (id, s) => { await api("/buyer/subscriptions/" + id, { method: "PATCH", body: { status: s } }); } });

P["buyer/cards"] = buyer("My card agreements", "Cards you allowed a business to keep. Removing one stops its future charges.", () => api("/buyer/cards"),
  (d) => (
    <>
      {note(d.agreement.text)}
      {table([
        { h: "Business", f: (r: any) => r.merchant }, { h: "Card", f: (r: any) => `${r.brand} ··${r.last4}` }, { h: "Expires", f: (r: any) => r.expiry },
        { h: "Agreement", f: (r: any) => (r.agreed_at ? `v${r.agreed_version}, ${dt(r.agreed_at)}` : "None on file") }, { h: "", f: (r: any) => btn("Remove", "rm|" + r.id, "d") },
      ], d.data, "No saved cards.")}
    </>
  ),
  { rm: async (id) => { await api("/buyer/cards/" + id, { method: "DELETE" }); toast("Card removed"); } });
