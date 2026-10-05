/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the VINK API; fields are read directly as in the original dashboard */
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ask, toast, showList } from "./dialogs";
import { accountOptions, list, Row } from "./kit";
import { R, K, initials, when, monthName, shiftMonth, thisMonth, cumulative } from "./format";
import { payoutNow, newPaymentRequest, addBeneficiary } from "./pages/shared";
import { Icon } from "./icons";
import type { Mode } from "./nav";

/* The three home screens: online payments, card machines, banking. */

const run = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { toast((e as Error).message); } };

/* ---------- online ---------- */
interface OnlineData {
  month: string; previous_month: string;
  stats: { unique_shoppers: number; total_transactions: number; total_amount: number; avg_value: number };
  balance: { total: number; retained: number; available: number; payout_fee: number; available_for_payout: number };
  series: { current: { day: number; total: number }[]; previous: { day: number; total: number }[] };
  recent: any[];
}

export function OnlineHome({ name, merchantId, verified }: { name: string; merchantId?: string; verified?: boolean }) {
  const [month, setMonth] = useState<string | null>(null);
  const [d, setD] = useState<OnlineData | null>(null);
  const [methods, setMethods] = useState<Record<string, boolean> | null>(null);

  const load = useCallback(async (m: string | null) => {
    const data: OnlineData = await api("/dashboard/online" + (m ? "?month=" + m : ""));
    setD(data);
    setMonth(data.month);
  }, []);
  useEffect(() => { run(() => load(null)); }, [load]);
  useEffect(() => { run(async () => setMethods((await api("/settings")).payment_methods)); }, []);

  const step = (delta: number) => run(async () => {
    const n = shiftMonth(month || thisMonth(), delta);
    if (n > thisMonth()) return;
    await load(n);
  });
  const payout = () => run(async () => { await payoutNow(); await load(month); });
  const toggle = (k: string) => run(async () => {
    const next = !methods?.[k];
    await api("/settings", { method: "PUT", body: { payment_methods: { [k]: next } } });
    setMethods({ ...methods, [k]: next });
  });

  // chart: cumulative sales per day, this month against last month
  const today = month === thisMonth() ? new Date().getUTCDate() : 31;
  const cur = d ? cumulative(d.series.current, today) : [];
  const prev = d ? cumulative(d.series.previous, 31) : [];
  const max = Math.max(1, ...cur, ...prev);
  const pt = (v: number, i: number): [number, number] => [38 + (i / 30) * 518, 195 - (v / max) * 175];
  const poly = (a: number[]) => a.map((v, i) => pt(v, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  const [dx, dy] = pt(cur[cur.length - 1] || 0, Math.max(cur.length - 1, 0));
  const b = d?.balance;

  return (
    <>
      <div className="stats" data-view="online">
        <div><span>Unique shoppers</span><b>{d?.stats.unique_shoppers ?? "—"}</b></div>
        <div><span>Total transactions</span><b>{d?.stats.total_transactions ?? "—"}</b></div>
        <div><span>Total amount</span><b>{d ? R(d.stats.total_amount) : "—"}</b></div>
        <div><span>Avg. value per transaction</span><b>{d ? R(d.stats.avg_value) : "—"}</b></div>
        <div className="month">
          <button aria-label="Previous month" onClick={() => step(-1)}>◀</button>
          <span>{month ? monthName(month) : ""}</span>
          <button aria-label="Next month" onClick={() => step(1)}>▶</button>
        </div>
      </div>
      <div className="pad" data-view="online">
        {verified === false && <div className="note"><Icon name="warn" /><div>Account pending verification. Upload your documents under Account, Verification documents to release your retained balance.</div></div>}
        <div className="wel" data-view="online">
          <div><h1>Welcome back, {name}</h1><p>{new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
          <div className="mid"><b>Merchant ID:</b> {merchantId ?? "—"}<br />API keys are under Settings, Developer settings.</div>
        </div>
        <section className="grid" data-view="online">
          <div className="card">
            <h2>Sales, month on month</h2>
            <div className="lg">
              <span><i style={{ background: "var(--chart)" }} />{d ? monthName(d.previous_month).split(" ")[0] : ""}</span>
              <span><i style={{ background: "var(--acc)" }} />{month ? monthName(month).split(" ")[0] : ""}</span>
            </div>
            <svg className="chart" viewBox="0 0 560 200" preserveAspectRatio="none" role="img" aria-label="Sales this month against last month">
              <g stroke="var(--line)"><line x1="38" y1="20" x2="560" y2="20" /><line x1="38" y1="80" x2="560" y2="80" /><line x1="38" y1="140" x2="560" y2="140" /><line x1="38" y1="195" x2="560" y2="195" /></g>
              <g fill="var(--mute)" fontSize="11">
                {[max, (max * 2) / 3, max / 3, 0].map((v, i) => <text key={i} x="0" y={[24, 84, 144, 198][i]}>{K(Math.round(v))}</text>)}
              </g>
              <polyline fill="none" stroke="var(--chart)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={poly(prev)} />
              <polyline fill="none" stroke="var(--acc)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" points={poly(cur)} />
              <circle cx={dx} cy={dy} r="6" fill="var(--acc)" stroke="var(--card)" strokeWidth="3" />
            </svg>
            <div className="axis"><span>1</span><span>6</span><span>11</span><span>16</span><span>21</span><span>26</span></div>
          </div>
          <div className="card">
            <h2>Account balance</h2>
            <div className="l"><span>Balance total</span><b>{b ? R(b.total) : "—"}</b></div>
            <div className="l"><span>Balance retained</span><b>{b ? R(b.retained) : "—"}</b></div>
            <div className="l"><span>Balance available</span><b>{b ? R(b.available) : "—"}</b></div>
            <div className="l"><span>Payout fee</span><b>{b ? R(b.payout_fee) : "—"}</b></div>
            <div className="l t"><span>Available for payout</span><b>{b ? R(b.available_for_payout) : "—"}</b></div>
            <button className="btn p w" onClick={payout}>Request payout</button>
          </div>
        </section>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Recent transactions <a href="#" onClick={(e) => { e.preventDefault(); void run(newPaymentRequest); }}>Request a payment</a></h2>
          <div>
            {d && list(d.recent, (p, i) => (
              <Row key={i} lead={<span className="ini">{initials(p.customer.name || p.reference)}</span>} title={p.customer.name || p.reference || p.id}
                sub={`${when(p.created_at)} · ${String(p.status).replace("_", " ")}`} right={<em>{R(p.amount)}</em>} />
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Payment types</h2>
          <div className="tiles">
            {([["card", "Cards"], ["eft", "Instant EFT"], ["qr", "QR code"]] as const).map(([k, label]) => (
              <div key={k} className={`tl ${methods && !methods[k] ? "off" : ""}`}>
                {label}
                <button className="sw" role="switch" aria-checked={!!methods?.[k]} aria-label={label} onClick={() => toggle(k)} />
              </div>
            ))}
            <div className="tl off">Buy now, pay later<button className="sw" role="switch" aria-checked="false" aria-label="Buy now, pay later (not available yet)" disabled /></div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ---------- card machines ---------- */
export function PosHome() {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => { setD(await api("/dashboard/pos")); }, []);
  useEffect(() => { run(load); }, [load]);
  const devices: any[] = d?.devices ?? [];

  const addDevice = () => run(async () => {
    const v = await ask("Add a card machine", [{ name: "name", label: "Name" }], "Add");
    if (v) { await api("/pos/devices", { method: "POST", body: v }); await load(); }
  });
  const sale = () => run(async () => {
    if (!devices.length) return toast("Add a card machine first");
    const v = await ask("Record a card machine sale", [
      { name: "deviceId", label: "Machine", type: "select", options: devices.map((x) => [x.id, x.name]) },
      { name: "amount", label: "Amount in rand", money: true },
      { name: "method", label: "Method", type: "select", options: [["card", "Card"], ["qr", "QR code"]] },
    ], "Charge");
    if (!v) return;
    const p = await api("/pos/sales", { method: "POST", idem: true, body: v });
    toast(p.status === "paid" ? `Paid ${R(p.amount)}` : `Payment ${p.status}`);
    await load();
  });

  return (
    <div className="pad" data-view="pos">
      <section className="ban" data-view="pos">
        <div><h1>Accept payments anywhere you do business</h1><p>Introducing our <em>NEW</em> in-person<br />payments solution</p></div>
        <div className="art"><div className="ph"><i /><i /><i /><i /></div></div>
      </section>
      <section className="feats" data-view="pos">
        <div><span><Icon name="cash" /></span>From only 2.5% processing fee</div>
        <div><span><Icon name="grid" /></span>Manage transactions centrally from your VINK dashboard</div>
        <div><span><Icon name="rec" /></span>Send instant digital receipts</div>
        <div><span><Icon name="tag" /></span>Increase revenue by selling airtime, data, vouchers and more</div>
      </section>
      <section className="ord">
        <h2>Order your device now from only R999!</h2>
        <div className="devs"><div className="d1">tap</div><div className="d2">tap</div></div>
        <p className="fee">+ R49 a month connectivity fee</p>
        <p style={{ color: "var(--mute)", maxWidth: 560, margin: "0 auto 18px", fontSize: 14 }}>Accept in-person payments with a secure, fully mobile touchscreen device with dual SIM connectivity. Free delivery.</p>
        <button className="btn p" onClick={() => toast("Device orders open soon. You can add a sandbox machine below to try it out.")}>Order a device</button> <button className="btn g" onClick={sale}>Record a sale</button>
      </section>
      <section className="card">
        <h2>Card machines <a href="#" onClick={(e) => { e.preventDefault(); addDevice(); }}>Add device</a></h2>
        <p style={{ margin: "-6px 0 12px", color: "var(--mute)", fontSize: 14 }}>
          {d && `Today: ${R(d.today.sales)} from ${d.today.transactions} sales · ${d.today.declined} declined · fees ${R(d.today.fees)}`}
        </p>
        <div>
          {d && list(devices, (x, i) => (
            <Row key={i} lead={<i className={`dot ${x.online ? "" : "off"}`} />} title={x.name}
              sub={`${x.online ? "Online" : "Offline"} · ${x.today_count} sales today`} right={<em>{R(x.today_total)}</em>} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- banking ---------- */
export function BankHome() {
  const [d, setD] = useState<any>(null);
  const [home, setHome] = useState({ show_quick_actions: true, show_activity: true, show_accounts: true });

  const load = useCallback(async () => {
    setD(await api("/dashboard/bank"));
    try { setHome((await api("/settings")).home); } catch { /* keep the defaults */ }
  }, []);
  useEffect(() => { run(load); }, [load]);

  const send = () => run(async () => {
    const [accts, bens] = await Promise.all([accountOptions(), api("/bank/beneficiaries")]);
    if (!bens.data.length) return toast("Add a beneficiary first");
    const v = await ask("Send money", [
      { name: "fromAccountId", label: "From", type: "select", options: accts },
      { name: "beneficiaryId", label: "To", type: "select", options: bens.data.map((b: any) => [b.id, `${b.name} · ${b.bank}`]) },
      { name: "amount", label: "Amount in rand", money: true }, { name: "reference", label: "Reference (shown to the recipient)", required: false },
    ], "Send");
    if (!v) return;
    await api("/bank/transfers", { method: "POST", idem: true, body: { type: "beneficiary", ...v } });
    toast(`Sent ${R(v.amount)}`);
    await load();
  });
  const own = () => run(async () => {
    const accts = await accountOptions();
    if (accts.length < 2) return toast("You need two accounts to move money between them");
    const v = await ask("Move money between accounts", [
      { name: "fromAccountId", label: "From", type: "select", options: accts },
      { name: "toAccountId", label: "To", type: "select", options: accts.slice().reverse() },
      { name: "amount", label: "Amount in rand", money: true },
    ], "Move");
    if (!v) return;
    await api("/bank/transfers", { method: "POST", idem: true, body: { type: "own", ...v } });
    toast("Money moved");
    await load();
  });
  const card = () => run(async () => {
    const v = await ask("Issue a business card", [
      { name: "accountId", label: "Linked account", type: "select", options: await accountOptions() },
      { name: "limit", label: "Monthly limit in rand", money: true, required: false, placeholder: "12,000" },
    ], "Issue card");
    if (!v) return;
    await api("/bank/cards", { method: "POST", body: v });
    toast("Card issued");
    await load();
  });
  const payout = () => run(async () => { await payoutNow(); await load(); });
  const statement = () => run(async () => {
    const a = d?.accounts?.[0];
    if (!a) return;
    const s = await api(`/bank/accounts/${a.id}/statement?limit=25`);
    await showList(`Statement · ${a.name}`, list(s.data, (x: any, i) => (
      <div className="row" key={i}>
        <div><b>{x.memo || x.kind}</b><span>{when(x.date)}</span></div>
        <div style={{ textAlign: "right" }}><em className={x.amount > 0 ? "in" : ""}>{x.amount > 0 ? "+ " : ""}{R(x.amount)}</em><br /><span>{R(x.balance)}</span></div>
      </div>
    )));
  });
  const freeze = (c: any) => run(async () => {
    await api("/bank/cards/" + c.id, { method: "PATCH", body: { status: c.status === "active" ? "frozen" : "active" } });
    await load();
  });

  const actions: [string, string, () => void][] = [
    ["Send money", "send", send], ["Between accounts", "swap", own], ["Add beneficiary", "user", () => run(addBeneficiary)], ["Issue a card", "card", card],
  ];

  return (
    <div className="pad" data-view="bank">
      <div className="wel" style={{ display: "flex" }}><div><h1>Banking</h1><p>Business current account · {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div></div>
      <section className="bh">
        <small>Total balance</small>
        <div className="big">{d ? R(d.total) : "—"}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
          <button className="btn p" onClick={send}>Send money</button>
          <button className="btn d" onClick={payout}>Move payout to account</button>
        </div>
      </section>
      {home.show_quick_actions && (
        <section className="qa">
          {actions.map(([label, icon, fn]) => <button key={label} onClick={fn}><span><Icon name={icon} /></span>{label}</button>)}
        </section>
      )}
      <section className="grid" data-view="bank">
        {home.show_activity && (
          <div className="card">
            <h2>Recent activity <a href="#" onClick={(e) => { e.preventDefault(); statement(); }}>View statement</a></h2>
            <div>
              {d && list(d.activity, (x: any, i) => (
                <Row key={i} lead={<span className="ini">{initials(x.memo)}</span>} title={x.memo || x.kind} sub={`${when(x.date)} · ${x.account}`}
                  right={<em className={x.amount > 0 ? "in" : ""}>{x.amount > 0 ? "+ " : ""}{R(x.amount)}</em>} />
              ))}
            </div>
          </div>
        )}
        <div className="card">
          {home.show_accounts && (
            <>
              <h2>Accounts</h2>
              <div>{d?.accounts.map((a: any) => <div className="l" key={a.id}><span>{a.name} ··{a.number.slice(-4)}</span><b>{R(a.balance)}</b></div>)}</div>
            </>
          )}
          <h2 style={{ marginTop: home.show_accounts ? 22 : 0 }}>Cards <a href="#" onClick={(e) => { e.preventDefault(); card(); }}>Issue card</a></h2>
          <div>
            {d && list(d.cards, (c: any, i) => (
              <Row key={i} lead={<span className="ini"><Icon name="card" /></span>} title={`${c.brand} ·· ${c.last4}`} sub={`${c.status} · limit ${R(c.limit)}`}
                right={["active", "frozen"].includes(c.status) ? (
                  <button className={`tag ${c.status === "active" ? "s1" : "s2"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => freeze(c)}>
                    {c.status === "active" ? "Freeze" : "Unfreeze"}
                  </button>
                ) : null} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function HomeFor({ mode, ...rest }: { mode: Mode; name: string; merchantId?: string; verified?: boolean }) {
  return mode === "online" ? <OnlineHome {...rest} /> : mode === "pos" ? <PosHome /> : <BankHome />;
}
