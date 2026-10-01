/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { api, ask, toast, showList, R, dt, when, accountOptions, table, tag, btn, H2, Gap, list, type Page } from "../kit";
import { pctOf } from "../format";

/* Credit and insurance. */

export const credit: Record<string, Page> = {};
const P = credit;

P["b/credit"] = async () => {
  const [prods, apps, facs] = await Promise.all([api("/credit/products"), api("/credit/applications"), api("/credit/facilities")]);
  const name: Record<string, string> = Object.fromEntries(prods.data.map((p: any) => [p.id, p.name]));
  const offers = apps.data.filter((a: any) => a.status === "offered" && a.expires_at > new Date().toISOString());
  return {
    title: "Credit", sub: "Offers are based on your sales over the last 90 days. Repay early at any time, there is no penalty.",
    actions: [{
      label: "Apply for credit", p: true, fn: async () => {
        const a = await ask("What do you need?", [
          { name: "product", label: "Product", type: "select", options: prods.data.map((p: any): [string, string] => [p.id, `${p.name} · ${pctOf(p.apr)} a year`]) },
          { name: "requested", label: "How much in rand", money: true },
          { name: "accountId", label: "Pay it into", type: "select", options: await accountOptions() },
        ], "Next");
        if (!a) return;
        const body: any = { product: a.product, requested: a.requested, accountId: a.accountId };
        const p = prods.data.find((x: any) => x.id === a.product);
        if (p.terms) {
          const t = await ask("How long to repay?", [{ name: "termMonths", label: "Months", type: "select", options: p.terms.map((m: number): [string, string] => [String(m), `${m} months`]) }], "See my offer");
          if (!t) return;
          body.termMonths = parseInt(t.termMonths, 10);
        }
        const r = await api("/credit/apply", { method: "POST", body });
        toast(r.status === "offered" ? `You are offered ${R(r.offered_limit)}` : `Not this time: ${r.reason}`);
      },
    }],
    content: (
      <>
        {offers.length > 0 && (
          <>
            <H2>Your offers</H2>
            {table([
              { h: "Product", f: (a: any) => name[a.product] }, { h: "Rate", f: (a: any) => pctOf(a.apr) + (a.term_months ? ` over ${a.term_months} months` : "") },
              { h: "Expires", f: (a: any) => dt(a.expires_at) }, { h: "Offer", r: true, f: (a: any) => R(a.offered_limit) },
              { h: "", f: (a: any) => <>{btn("Accept", "acc|" + a.id)}{btn("Decline", "dec|" + a.id, "d")}</> },
            ], offers)}
            <Gap />
          </>
        )}
        <H2>Your credit</H2>
        {table([
          { h: "Product", f: (f: any) => name[f.product] }, { h: "Owed", r: true, f: (f: any) => R(f.owed) }, { h: "Available", r: true, f: (f: any) => (f.term_months ? "—" : R(f.available)) },
          { h: "Next payment", f: (f: any) => (f.term_months && f.status === "active" ? `${R(f.instalment)} on ${dt(f.next_due)}` : "—") },
          { h: "Status", f: (f: any) => <>{tag(f.status)}{f.missed > 0 && <> <span className="tag s3">{f.missed} missed</span></>}</> },
          {
            h: "", f: (f: any) => f.status !== "active" ? null : (
              <>{!f.term_months && btn("Draw", "drw|" + f.id)}{btn("Repay", "rep|" + f.id)}{btn("Statement", "stm|" + f.id)}</>
            ),
          },
        ], facs.data, "No credit yet.")}
        <H2 top>Applications</H2>
        {table([
          { h: "Date", f: (a: any) => dt(a.created_at) }, { h: "Product", f: (a: any) => name[a.product] }, { h: "Asked", r: true, f: (a: any) => R(a.requested) },
          { h: "Result", f: (a: any) => <>{tag(a.status)}{a.reason && <> <small>{a.reason}</small></>}</> },
        ], apps.data, "No applications.")}
      </>
    ),
    on: {
      acc: async (id) => { if (!(await ask("Accept this offer?", [], "Accept"))) return; await api(`/credit/applications/${id}/accept`, { method: "POST", idem: true }); toast("Accepted"); },
      dec: async (id) => { await api(`/credit/applications/${id}/decline`, { method: "POST" }); },
      drw: async (id) => {
        const v = await ask("Draw from your credit", [{ name: "accountId", label: "Into", type: "select", options: await accountOptions() }, { name: "amount", label: "Amount in rand", money: true }], "Draw");
        if (v) { await api(`/credit/facilities/${id}/draw`, { method: "POST", idem: true, body: v }); toast("Done"); }
      },
      rep: async (id) => {
        const v = await ask("Repay", [{ name: "accountId", label: "From", type: "select", options: await accountOptions() }, { name: "amount", label: "Amount in rand (blank = everything owed)", money: true, required: false }], "Repay");
        if (v) { await api(`/credit/facilities/${id}/repay`, { method: "POST", idem: true, body: v }); toast("Repaid"); }
      },
      stm: async (id) => {
        const s = await api("/credit/facilities/" + id);
        await showList("Credit statement", list(s.data, (x: any, i) => (
          <div className="row" key={i}><div><b>{x.memo || x.kind}</b><span>{when(x.date)}</span></div><em>{R(x.amount)}</em></div>
        )), <p className="note2">Owed {R(s.facility.owed)} at {pctOf(s.facility.apr)} a year.</p>);
      },
    },
  };
};

P["b/insurance"] = async () => {
  const [prods, pols, cls] = await Promise.all([api("/insurance/products"), api("/insurance/policies"), api("/insurance/claims")]);
  const name: Record<string, string> = Object.fromEntries(prods.data.map((p: any) => [p.id, p.name]));
  return {
    title: "Insurance", sub: "Cover for your family and your business. Premiums come out of your account every month.",
    actions: [
      {
        label: "Get cover", p: true, fn: async () => {
          const a = await ask("Choose cover", [{ name: "product", label: "Product", type: "select", options: prods.data.map((p: any): [string, string] => [p.id, `${p.name}: ${p.summary}`]) }], "Next");
          if (!a) return;
          const p = prods.data.find((x: any) => x.id === a.product);
          const c = await ask(p.name, [{ name: "cover", label: "Cover amount", type: "select", options: p.covers.map((v: number): [string, string] => [String(v), R(v)]) }], "Get a quote");
          if (!c) return;
          const q = await api("/insurance/quote", { method: "POST", body: { product: p.id, cover: parseInt(c.cover, 10) } });
          const b = await ask(`${R(q.cover)} cover costs ${R(q.premium)} a month${q.waiting_days ? ` (natural causes covered after ${q.waiting_days} days)` : ""}`, [
            { name: "accountId", label: "Pay from", type: "select", options: await accountOptions() }, { name: "beneficiary", label: "Who gets the payout?", required: false },
          ], "Buy now");
          if (!b) return;
          await api("/insurance/policies", { method: "POST", idem: true, body: { product: p.id, cover: q.cover, accountId: b.accountId, beneficiary: b.beneficiary } });
          toast("You are covered");
        },
      },
      {
        label: "Make a claim", fn: async () => {
          const act = pols.data.filter((p: any) => p.status === "active");
          if (!act.length) throw new Error("You need active cover to claim");
          const v = await ask("Make a claim", [
            { name: "policyId", label: "Policy", type: "select", options: act.map((p: any): [string, string] => [p.id, `${name[p.product]} ${R(p.cover)}`]) },
            { name: "cause", label: "What happened?", type: "select", options: [["accident", "An accident or theft"], ["natural", "Natural causes"]] },
            { name: "amount", label: "Amount claimed in rand", money: true }, { name: "description", label: "Tell us what happened", type: "textarea" },
          ], "Submit");
          if (!v) return;
          const r = await api("/insurance/claims", { method: "POST", body: v });
          toast(r.status === "rejected" ? r.reason : "Claim sent. We will decide within a few days.");
        },
      },
    ],
    content: (
      <>
        <H2>Your cover</H2>
        {table([
          { h: "Product", f: (p: any) => name[p.product] }, { h: "For", f: (p: any) => p.beneficiary || "—" }, { h: "Natural causes from", f: (p: any) => dt(p.waiting_until) },
          { h: "Next premium", f: (p: any) => (p.status === "active" ? dt(p.next_due) : "—") }, { h: "Status", f: (p: any) => tag(p.status === "lapsed" ? "lapsed" : p.status) },
          { h: "Premium", r: true, f: (p: any) => R(p.premium) }, { h: "Cover", r: true, f: (p: any) => R(p.cover) },
          { h: "", f: (p: any) => (["active", "lapsed"].includes(p.status) ? btn("Cancel", "cn|" + p.id, "d") : null) },
        ], pols.data, "No cover yet.")}
        <H2 top>Claims</H2>
        {table([
          { h: "Date", f: (c: any) => dt(c.created_at) }, { h: "Cause", f: (c: any) => c.cause },
          { h: "Status", f: (c: any) => <>{tag(c.status === "submitted" ? "pending" : c.status)}{c.reason && <> <small>{c.reason}</small></>}</> },
          { h: "Claimed", r: true, f: (c: any) => R(c.amount) }, { h: "Paid", r: true, f: (c: any) => (c.paid ? R(c.paid) : "—") },
        ], cls.data, "No claims.")}
      </>
    ),
    on: { cn: async (id) => { await api(`/insurance/policies/${id}/cancel`, { method: "POST" }); toast("Cover cancelled"); } },
  };
};
