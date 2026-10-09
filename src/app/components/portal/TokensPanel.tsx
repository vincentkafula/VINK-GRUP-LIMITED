import { useEffect, useState } from "react";
import { API_BASE } from "../../services/config";
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
const KIND: Record<string, string> = { payout_sent: "Paid to your debit card", payout_declined: "Payout declined, tokens returned", top_up: "Tokens bought", fare: "Fare", transfer_out: "Sent", transfer_in: "Received", to_bank: "Moved to bank account", cash_out: "Cash-out requested", refund: "Refund", cashout_paid: "Cash-out paid", cashout_rejected: "Cash-out returned", marshal_fee: "Association levy", per_trip_pay: "Per trip", weekly_cash_payment: "Weekly payment", monthly_salary: "Salary" };
const key = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const toCents = (v: string) => { const n = Math.round(Number(v.replace(",", ".")) * 100); return Number.isFinite(n) ? n : NaN; };

export function TokensPanel({ segment, color }: { segment: TokenSegment; color: string }) {
  const call = portalClient(segment);
  const [load, reload] = useLoad<{ wallets: WalletView[]; payoutCards?: PayoutCardRow[]; cardEntry?: CardEntry; cardOptions?: CardOptions; issuedCards?: IssuedCardRow[]; role: string | null }>(() => call("/tokens"));
  return (
    <div className="space-y-4">
      <Status load={load}>{(d) => d.wallets.length === 0
        ? <OpenWallet call={call} color={color} onDone={reload} />
        : <>{d.wallets.map((w) => <Wallet key={w.currency} w={w} cards={d.payoutCards ?? []} entry={d.cardEntry ?? { hosted: false, raw: true }} options={d.cardOptions ?? { brands: [] }} issued={(d.issuedCards ?? []).filter((c) => c.currency === w.currency)} call={call} color={color} reload={reload} />)}</>}</Status>
      {segment === "association" && <RouteFares call={call} color={color} />}
    </div>
  );
}

type Call = ReturnType<typeof portalClient>;
interface IssuedCardRow { id: string; brand: string; last4: string; expiry: string; status: string; currency: string; form?: "virtual" | "physical"; activated?: boolean; delivery?: string }
interface CardOptions { brands: string[] }
const ISSUED_STATUS: Record<string, [string, string]> = { active: ["Active", "#10B981"], frozen: ["Frozen", "#F59E0B"], blocked: ["Blocked", "#EF4444"] };
/** How a card may be added: in the processor's secure card form (hosted) and/or by typing the number here (raw, sandbox test cards only). */
interface CardEntry { hosted: boolean; raw: boolean }
interface PayoutCardRow { id: string; brand: string; last4: string; expiry: string; status: string }
interface CashOutRow { id: string; amountCents: number; currency: string; reason: string; status: string; card: string | null; problem: string | null; requestedAt: string }
const CARD_STATUS: Record<string, [string, string]> = { verified: ["Ready for payouts", "#10B981"], needs_review: ["Being checked by VINK", "#F59E0B"], rejected: ["Not accepted", "#EF4444"] };
const PAYOUT_STATUS: Record<string, [string, string]> = { requested: ["Waiting to be sent", "#F59E0B"], processing: ["With the card service", "#38BDF8"], paid: ["Paid", "#10B981"], rejected: ["Not paid, tokens returned", "#EF4444"] };

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

function Wallet({ w, cards, entry, options, issued, call, color, reload }: { w: WalletView; cards: PayoutCardRow[]; entry: CardEntry; options: CardOptions; issued: IssuedCardRow[]; call: Call; color: string; reload: () => void }) {
  const [pan, setPan] = useState(""); const [exp, setExp] = useState(""); const [nameOnCard, setNameOnCard] = useState(""); const [pickCard, setPickCard] = useState("");
  const [outs, reloadOuts] = useLoad<{ cashOuts: CashOutRow[] }>(() => call("/tokens/cash-outs"));
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

        <VinkCards issued={issued} options={options} cur={cur} call={call} color={color} reload={reload} act={act} />

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
          <p className="text-xs text-fg-muted mb-2">Move tokens into your own VINK bank account at once. Or pay them out to <b>your own debit card</b>: the system sends the money to the card as soon as you ask (minimum {money(1000, cur)}). A payout is only ever made to your own debit card: never to a bank account, and never by hand.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={outAmt} onChange={(e) => setOutAmt(e.target.value)} placeholder="0.00" /></label>
            <ActionButton label="Move to my bank account" color={color} onRun={async () => { const amountCents = toCents(outAmt); if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Enter an amount above zero" }; return act("Moved to your bank account", () => call("/tokens/redeem", { method: "POST", body: { currency: cur, amountCents, key: key() } }), () => setOutAmt(""))(); }} />
            {cards.filter((c) => c.status === "verified").length > 1 && <label className="block"><span className="text-[11px] text-fg-muted">Pay to</span><select className={inputCls + " mt-1 !w-auto"} value={pickCard} onChange={(e) => setPickCard(e.target.value)}><option value="">Latest card</option>{cards.filter((c) => c.status === "verified").map((c) => <option key={c.id} value={c.id}>{c.brand} ****{c.last4}</option>)}</select></label>}
            <ActionButton label="Pay to my debit card" color="#64748B" onRun={async () => { const amountCents = toCents(outAmt); if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Enter an amount above zero" }; const r = await call<{ message?: string }>("/tokens/cash-out", { method: "POST", body: { currency: cur, amountCents, ...(pickCard ? { cardId: pickCard } : {}) } }); if ("error" in r) return { error: r.error }; setOutAmt(""); reload(); reloadOuts(); return { message: r.data.message ?? "Requested" }; }} />
          </div>
          {cards.filter((c) => c.status === "verified").length === 0 && <p className="text-xs text-warn mt-2">You need a verified debit card of your own before money can be paid out. Add one below.</p>}
        </section>

        <section aria-label="My debit cards">
          <p className="text-sm font-semibold text-fg mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> My debit cards for payouts</p>
          {cards.length === 0 ? <Empty>No debit card yet.</Empty> : (
            <ul className="space-y-2">{cards.map((c) => {
              const [label, tone] = CARD_STATUS[c.status] ?? [c.status, "#94A3B8"];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                  <span className="text-sm text-fg">{c.brand === "visa" ? "Visa" : "Mastercard"} debit ****{c.last4} · {c.expiry} <Badge text={label} color={tone} /></span>
                  <ActionButton small label="Remove" color="#64748B" onRun={act("Card removed", () => call(`/tokens/payout-cards/${c.id}`, { method: "DELETE" }))} />
                </li>);
            })}</ul>)}
          {entry.hosted ? <SecureCardForm call={call} color={color} onAdded={reload} />
            : entry.raw ? <>
            <p className="text-xs text-warn mt-3">Sandbox: only test cards work for now (for example Visa 4111 1111 1111 1111, any future date). Never enter a real card number.</p>
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <label className="block"><span className="text-[11px] text-fg-muted">Card number</span><input className={inputCls + " mt-1"} value={pan} onChange={(e) => setPan(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="4111 1111 1111 1111" /></label>
              <label className="block"><span className="text-[11px] text-fg-muted">Expiry (MM/YY)</span><input className={inputCls + " mt-1 !w-28"} value={exp} onChange={(e) => setExp(e.target.value)} autoComplete="off" placeholder="12/34" /></label>
              <label className="block"><span className="text-[11px] text-fg-muted">Name on the card</span><input className={inputCls + " mt-1"} value={nameOnCard} onChange={(e) => setNameOnCard(e.target.value)} autoComplete="off" /></label>
              <ActionButton label="Add debit card" color={color} onRun={async () => { const r = await call<{ message?: string }>("/tokens/payout-cards", { method: "POST", body: { primaryAccountNumber: pan, expiry: exp, cardholderName: nameOnCard } }); if ("error" in r) return { error: r.error }; setPan(""); setExp(""); setNameOnCard(""); reload(); return { message: r.data.message ?? "Card added." }; }} />
            </div>
            </>
            : <p className="text-xs text-fg-subtle mt-3">Adding a card is not available yet.</p>}
        </section>

        <Status load={outs}>{({ cashOuts }) => !cashOuts || cashOuts.length === 0 ? null : (
          <TableCard title="Payouts to my card" color={color} columns={["When", "Amount", "Card", "Status"]} rows={cashOuts.map((c) => {
            const [label, tone] = PAYOUT_STATUS[c.status] ?? [c.status, "#94A3B8"];
            return [when(c.requestedAt), money(c.amountCents, c.currency), c.card ?? "—", <span key="s"><Badge text={label} color={tone} />{c.problem ? <span className="block text-[11px] text-fg-subtle">{c.problem}</span> : null}</span>];
          })} />)}</Status>

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

/**
 * Adds a debit card through the processor's secure card form. The form is a separate page shown in a frame: the card number is typed into it and goes
 * straight to the processor, never into this page or to VINK's servers. The page only learns that the form finished (a session id), then asks VINK to add that card.
 */
function SecureCardForm({ call, color, onAdded }: { call: Call; color: string; onAdded: () => void }) {
  const [session, setSession] = useState<{ sessionId: string; src: string } | null>(null);
  const [note, setNote] = useState<{ error?: string; message?: string } | null>(null);
  useEffect(() => {
    if (!session) return;
    const origin = new URL(session.src, window.location.href).origin;
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== origin) return;                                                                            // only the card form itself
      const d = e.data as { type?: unknown; sessionId?: unknown } | null;
      if (!d || d.type !== "vink-card-complete" || d.sessionId !== session.sessionId) return;
      setSession(null);
      const r = await call<{ message?: string }>("/tokens/payout-cards/from-session", { method: "POST", body: { sessionId: session.sessionId } });
      if ("error" in r) { setNote({ error: r.error }); return; }
      setNote({ message: r.data.message ?? "Card added." }); onAdded();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [session, call, onAdded]);
  return (
    <div className="mt-3">
      {!session && <ActionButton label="Add debit card" color={color} onRun={async () => {
        setNote(null);
        const r = await call<{ sessionId: string; fieldsUrl: string }>("/tokens/payout-cards/session", { method: "POST", body: {} });
        if ("error" in r) return { error: r.error };
        setSession({ sessionId: r.data.sessionId, src: /^https?:/i.test(r.data.fieldsUrl) ? r.data.fieldsUrl : `${API_BASE}${r.data.fieldsUrl}` });
        return { message: "Enter the card details below." };
      }} />}
      {session && (
        <div>
          <iframe title="Secure card form" src={session.src} className="w-full rounded-lg" style={{ height: 300, border: "1px solid var(--vk-line)", background: "#fff" }} referrerPolicy="no-referrer" />
          <button type="button" className="text-xs text-fg-subtle underline mt-2" onClick={() => setSession(null)}>Cancel</button>
        </div>)}
      {note?.error && <p role="alert" className="text-xs text-bad mt-2">{note.error}</p>}
      {note?.message && <p role="status" className="text-xs text-ok mt-2">{note.message}</p>}
      <p className="text-xs text-fg-subtle mt-2">Your card number goes straight to the card processor. VINK never sees it.</p>
    </div>);
}

const DELIVERY_TEXT: Record<string, string> = { ordered: "Ordered: VINK will send it to you", shipped: "On its way: activate it when it arrives", activated: "Active" };
const BRAND_NAME: Record<string, string> = { visa: "Visa", mastercard: "Mastercard" };
type Act = (label: string, run: () => Promise<{ error: string } | { data: unknown }>, done?: () => void) => () => Promise<{ error: string } | { message: string }>;

/** The holder's VINK debit cards: choose Visa or Mastercard, virtual and/or physical (a physical card is delivered to the holder and activated on arrival). */
function VinkCards({ issued, options, cur, call, color, reload, act }: { issued: IssuedCardRow[]; options: CardOptions; cur: string; call: Call; color: string; reload: () => void; act: Act }) {
  const live = issued.filter((c) => c.status !== "blocked");
  const has = (form: string) => live.some((c) => (c.form ?? "virtual") === form);
  const brands = options.brands.length ? options.brands : ["visa", "mastercard"];
  const [brand, setBrand] = useState(brands.length === 1 ? brands[0] : "");
  const [form, setForm] = useState<"virtual" | "physical">(has("virtual") ? "physical" : "virtual");
  const [d, setD] = useState({ nameOnCard: "", addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "", country: "ZA", phone: "" });
  const [digits, setDigits] = useState<Record<string, string>>({});
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const field = (k: keyof typeof d, label: string, ph = "", cls = "") => <label key={k} className="block"><span className="text-[11px] text-fg-muted">{label}</span><input className={inputCls + " mt-1 " + cls} value={d[k]} onChange={set(k)} placeholder={ph} autoComplete="off" /></label>;
  const bothHeld = has("virtual") && has("physical");
  return (
    <section aria-label="My VINK debit cards">
      <p className="text-sm font-semibold text-fg mb-1 flex items-center gap-2"><CreditCard className="w-4 h-4" /> My VINK debit cards <Badge text="sandbox" color="#94A3B8" /></p>
      <p className="text-xs text-fg-muted mb-2">A Visa or Mastercard debit card that spends your tokens at shops, online and at cash machines (the bank's cash-machine fee applies). Cash machines need the physical card, which is delivered to you. Each purchase is approved only if your tokens cover it, and they leave your wallet at once.</p>
      {issued.length > 0 && (
        <ul className="space-y-2 mb-3">{issued.map((c) => {
          const [label, tone] = ISSUED_STATUS[c.status] ?? [c.status, "#94A3B8"];
          const physical = c.form === "physical", waiting = physical && c.activated === false && c.status !== "blocked";
          const setStatus = (status: string, msg: string) => act(msg, () => call(`/tokens/card/${c.id}/status`, { method: "POST", body: { status } }));
          return (
            <li key={c.id} className="rounded-lg p-3 space-y-2" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-fg">{BRAND_NAME[c.brand] ?? c.brand} {physical ? "physical" : "virtual"} debit ****{c.last4} · {c.expiry} <Badge text={waiting ? (DELIVERY_TEXT[c.delivery ?? "ordered"] ?? "Waiting") : label} color={waiting ? "#38BDF8" : tone} /></span>
                <span className="flex gap-2">
                  {c.status === "active" && !waiting && <ActionButton small label="Freeze" color="#F59E0B" onRun={setStatus("frozen", "Card frozen")} />}
                  {c.status === "frozen" && <ActionButton small label="Unfreeze" color="#10B981" onRun={setStatus("active", "Card unfrozen")} />}
                  {c.status !== "blocked" && <ActionButton small label="Block for good" color="#EF4444" onRun={setStatus("blocked", "Card blocked")} />}
                </span>
              </div>
              {waiting && c.delivery === "shipped" && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block"><span className="text-[11px] text-fg-muted">Last four digits printed on the card</span><input className={inputCls + " mt-1 !w-28"} inputMode="numeric" maxLength={4} value={digits[c.id] ?? ""} onChange={(e) => setDigits((x) => ({ ...x, [c.id]: e.target.value }))} autoComplete="off" /></label>
                  <ActionButton label="Activate my card" color={color} onRun={act("Your card is active", () => call(`/tokens/card/${c.id}/activate`, { method: "POST", body: { last4: digits[c.id] ?? "" } }))} />
                </div>)}
            </li>);
        })}</ul>)}
      {!bothHeld ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-fg">Get a card</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Card</span><select className={inputCls + " mt-1 !w-auto"} value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">Choose…</option>{brands.map((b) => <option key={b} value={b}>{BRAND_NAME[b] ?? b}</option>)}</select></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Type</span><select className={inputCls + " mt-1 !w-auto"} value={form} onChange={(e) => setForm(e.target.value as "virtual" | "physical")}>
              {!has("virtual") && <option value="virtual">Virtual (instant, online and in apps)</option>}{!has("physical") && <option value="physical">Physical (delivered to you, for cash machines)</option>}</select></label>
          </div>
          {form === "physical" && (
            <div className="flex flex-wrap items-end gap-3">
              {field("nameOnCard", "Name to print on the card", "T NKOSI")}{field("addressLine1", "Street address", "12 Long Street")}{field("addressLine2", "Suburb (optional)")}
              {field("city", "Town or city")}{field("province", "Province (optional)", "", "!w-32")}{field("postalCode", "Postal code", "", "!w-24")}
              <label className="block"><span className="text-[11px] text-fg-muted">Country</span><select className={inputCls + " mt-1 !w-auto"} value={d.country} onChange={set("country")}><option value="ZA">South Africa</option><option value="ZM">Zambia</option></select></label>
              {field("phone", "Phone for the courier", "082 000 0000")}
            </div>)}
          <ActionButton label={form === "physical" ? "Order my physical card" : "Get my virtual card"} color={color} onRun={async () => {
            if (!brand) return { error: "Choose Visa or Mastercard" };
            const r = await call("/tokens/card", { method: "POST", body: { currency: cur, brand, form, ...(form === "physical" ? { delivery: d } : {}) } });
            if ("error" in r) return { error: r.error }; reload();
            return { message: form === "physical" ? "Your card is ordered. We will tell you when it is on its way." : "Your card is ready." };
          }} />
        </div>) : <p className="text-xs text-fg-subtle">You have a virtual and a physical card. Block one for good if you need a new one.</p>}
      <p className="text-xs text-fg-subtle mt-2">The full card number and security code are only shown by the card processor's secure screen once VINK is live. You need your identity verified before a card can be issued.</p>
    </section>);
}
