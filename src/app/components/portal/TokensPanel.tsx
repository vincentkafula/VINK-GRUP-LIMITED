import { useState } from "react";
import { Coins, CreditCard, Send, Landmark } from "lucide-react";
import { SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";
import { CopyButton } from "./BankAccount";
import { money } from "./MoneyPanels";

/**
 * VINK tokens, for every portal user. Tokens are bought by paying money into the pooled bank account with your account number as the reference, and are
 * spent by tapping a VINK card. They only turn back into money through "move to my bank account" or a cash-out that staff pay. 1 token = R1 (K1 for kwacha).
 */
export type TokenSegment = "personal" | "driver" | "owner" | "marshal" | "association" | "investor";

interface WalletView {
  id: string; currency: string; role: string; status: string; kycTier?: string; accountNumber: string | null; balanceCents: number;
  payInto: { bank: string; holder: string; accountNumber: string; type: string } | null;
  cards: { id: string; last4: string; status: string }[];
  activity: { at: string; kind: string; amountCents: number; label: string }[];
}
const KIND: Record<string, string> = { top_up: "Tokens bought", fare: "Fare", transfer_out: "Sent", transfer_in: "Received", to_bank: "Moved to bank account", cash_out: "Cash-out requested", refund: "Refund", cashout_paid: "Cash-out paid", cashout_rejected: "Cash-out returned", marshal_fee: "Association levy", per_trip_pay: "Per trip", weekly_cash_payment: "Weekly payment", monthly_salary: "Salary" };
const key = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const toCents = (v: string) => { const n = Math.round(Number(v.replace(",", ".")) * 100); return Number.isFinite(n) ? n : NaN; };

export function TokensPanel({ segment, color }: { segment: TokenSegment; color: string }) {
  const call = portalClient(segment);
  const [load, reload] = useLoad<{ wallets: WalletView[]; role: string | null }>(() => call("/tokens"));
  return (
    <div className="space-y-4">
      <Status load={load}>{(d) => d.wallets.length === 0
        ? <OpenWallet call={call} color={color} onDone={reload} />
        : <>{d.wallets.map((w) => <Wallet key={w.currency} w={w} call={call} color={color} reload={reload} />)}</>}</Status>
      {segment === "association" && <RouteFares call={call} color={color} />}
    </div>
  );
}

type Call = ReturnType<typeof portalClient>;

function OpenWallet({ call, color, onDone }: { call: Call; color: string; onDone: () => void }) {
  const [currency, setCurrency] = useState("ZAR");
  return (
    <SectionPanel title="VINK tokens">
      <div className="p-4 space-y-3">
        <p className="text-sm text-fg-muted">Tokens are like a bus card: you buy them once, tap to pay in a second, and drivers are paid straight away. Open your wallet to get your account number.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="ZAR">Rand</option><option value="ZMW">Kwacha</option></select></label>
          <ActionButton label="Open my token wallet" color={color} onRun={async () => { const r = await call("/tokens/wallet", { method: "POST", body: { currency } }); if ("error" in r) return { error: r.error }; onDone(); }} />
        </div>
      </div>
    </SectionPanel>
  );
}

function Wallet({ w, call, color, reload }: { w: WalletView; call: Call; color: string; reload: () => void }) {
  const [card, setCard] = useState(""); const [to, setTo] = useState(""); const [sendAmt, setSendAmt] = useState(""); const [outAmt, setOutAmt] = useState("");
  const cur = w.currency;
  const act = (label: string, run: () => Promise<{ error: string } | { data: unknown }>, done?: () => void) => async () => { const r = await run(); if ("error" in r) return { error: r.error }; done?.(); reload(); return { message: label }; };
  return (
    <SectionPanel title={`VINK tokens · ${cur === "ZMW" ? "Kwacha" : "Rand"}`}>
      <div className="p-4 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Token balance" value={money(w.balanceCents, cur)} sub={`1 token = ${cur === "ZMW" ? "K1" : "R1"}`} icon={<Coins className="w-4 h-4" />} color={color} />
          <StatCard label="Verification level" value={(w.kycTier ?? "basic").replace(/^./, (c) => c.toUpperCase())} sub={w.status === "active" ? "Higher limits once VINK has checked your identity" : `Wallet ${w.status}`} icon={<Landmark className="w-4 h-4" />} color={w.status === "active" ? "#10B981" : "#F59E0B"} />
        </div>

        <section aria-label="Buy tokens" className="rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
          <p className="text-[11px] text-fg-muted">Buy tokens: pay money into the bank account below and write your account number as the payment reference.</p>
          <div className="flex flex-wrap items-center gap-3 mt-1"><p className="font-mono text-lg font-bold tracking-wider text-fg">{w.accountNumber ?? "…"}</p>{w.accountNumber && <CopyButton value={w.accountNumber} label="account number" color={color} />}</div>
          {w.payInto ? <p className="text-xs text-fg-muted mt-1">Pay into {w.payInto.holder} · {w.payInto.bank} · account {w.payInto.accountNumber}. Your tokens arrive when the bank reports the payment.</p> : <p className="text-xs text-warn mt-1">The bank account to pay into has not been set up yet.</p>}
        </section>

        <section aria-label="My cards">
          <p className="text-sm font-semibold text-fg mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> My VINK cards</p>
          {w.cards.length === 0 ? <Empty>No card yet. Enter the number printed on your VINK card to use it on a taxi device.</Empty> : (
            <ul className="space-y-2">{w.cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                <span className="text-sm text-fg">Card ending {c.last4} <Badge text={c.status} color={c.status === "active" ? "#10B981" : "#EF4444"} /></span>
                {c.status === "active" && <ActionButton small label="Block (lost)" color="#EF4444" onRun={act("Card blocked", () => call(`/tokens/cards/${c.id}/block`, { method: "POST", body: { lost: true } }))} />}
              </li>))}</ul>)}
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Card number</span><input className={inputCls + " mt-1"} value={card} onChange={(e) => setCard(e.target.value)} placeholder="04 A1 B2 C3" autoComplete="off" /></label>
            <ActionButton label="Add card" color={color} onRun={act("Card added", () => call("/tokens/cards", { method: "POST", body: { currency: cur, cardNumber: card } }), () => setCard(""))} />
          </div>
        </section>

        <section aria-label="Send tokens">
          <p className="text-sm font-semibold text-fg mb-2 flex items-center gap-2"><Send className="w-4 h-4" /> Send tokens</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Email or account number</span><input className={inputCls + " mt-1"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} placeholder="0.00" /></label>
            <ActionButton label="Send" color={color} onRun={async () => { const amountCents = toCents(sendAmt); if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Enter an amount above zero" }; return act("Tokens sent", () => call("/tokens/transfer", { method: "POST", body: { recipient: to, currency: cur, amountCents, key: key() } }), () => setSendAmt(""))(); }} />
          </div>
        </section>

        <section aria-label="Turn tokens into money">
          <p className="text-sm font-semibold text-fg mb-1">Turn tokens into money</p>
          <p className="text-xs text-fg-muted mb-2">Move tokens into your own VINK bank account at once, or ask for a cash-out (staff pay it into your bank, minimum {money(1000, cur)}). Tokens cannot be taken out any other way.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={outAmt} onChange={(e) => setOutAmt(e.target.value)} placeholder="0.00" /></label>
            <ActionButton label="Move to my bank account" color={color} onRun={async () => { const amountCents = toCents(outAmt); if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Enter an amount above zero" }; return act("Moved to your bank account", () => call("/tokens/redeem", { method: "POST", body: { currency: cur, amountCents, key: key() } }), () => setOutAmt(""))(); }} />
            <ActionButton label="Ask for a cash-out" color="#64748B" onRun={async () => { const amountCents = toCents(outAmt); if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Enter an amount above zero" }; return act("Cash-out requested", () => call("/tokens/cash-out", { method: "POST", body: { currency: cur, amountCents } }), () => setOutAmt(""))(); }} />
          </div>
        </section>

        {w.activity.length === 0 ? <Empty>Nothing yet. Buy tokens to get started.</Empty> : (
          <TableCard title="Latest activity" color={color} columns={["When", "What", "Amount"]} rows={w.activity.map((a) => [
            when(a.at), <span key="k">{KIND[a.kind] ?? a.kind.replace(/_/g, " ")}{a.label && a.label !== a.kind ? <span className="block text-[11px] text-fg-subtle">{a.label}</span> : null}</span>,
            <span key="a" className={a.amountCents < 0 ? "text-fg" : "text-ok"}>{a.amountCents < 0 ? "−" : "+"}{money(Math.abs(a.amountCents), cur)}</span>,
          ])} />)}
      </div>
    </SectionPanel>
  );
}

/** The association sets a fare per route; its members' devices charge exactly this. */
function RouteFares({ call, color }: { call: Call; color: string }) {
  const [load, reload] = useLoad<{ routes: { id: string; name: string; fareCents: number; currency: string; effectiveFrom: string | null; active: boolean }[] }>(() => call("/tokens/routes"));
  const [name, setName] = useState(""); const [fare, setFare] = useState(""); const [from, setFrom] = useState("");
  return (
    <SectionPanel title="Route fares">
      <div className="p-4 space-y-3">
        <p className="text-xs text-fg-muted">The driver picks the route on the device, and the passenger is charged this fare in tokens. Setting a route with the same name changes its fare.</p>
        <Status load={load}>{({ routes }) => routes.length === 0 ? <Empty>No routes yet. Add your first below.</Empty> : (
          <TableCard title="Routes" color={color} columns={["Route", "Fare", "From", ""]} rows={routes.map((r) => [
            <span key="n">{r.name}{!r.active && <Badge text="off" color="#94A3B8" />}</span>, money(r.fareCents, r.currency), r.effectiveFrom ?? "—",
            <ActionButton key="t" small label={r.active ? "Switch off" : "Switch on"} color="#64748B" onRun={async () => { const x = await call(`/tokens/routes/${r.id}/active`, { method: "POST", body: { active: !r.active } }); if ("error" in x) return { error: x.error }; reload(); }} />,
          ])} />)}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-[11px] text-fg-muted">Route</span><input className={inputCls + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} placeholder="Langa – Cape Town" /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Fare</span><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={fare} onChange={(e) => setFare(e.target.value)} placeholder="20.00" /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Effective from</span><input className={inputCls + " mt-1 !w-40"} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <ActionButton label="Save route" color={color} onRun={async () => { const fareCents = toCents(fare); if (!Number.isInteger(fareCents) || fareCents <= 0) return { error: "Enter the fare" }; const r = await call("/tokens/routes", { method: "PUT", body: { name, fareCents, effectiveFrom: from || undefined } }); if ("error" in r) return { error: r.error }; setName(""); setFare(""); reload(); return { message: "Route saved" }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
