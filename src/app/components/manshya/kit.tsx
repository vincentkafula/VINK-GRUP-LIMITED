/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { createContext, useContext, type ReactNode } from "react";
import { ask, toast, secret, showList, showDialog, type Field } from "./dialogs";
import { api, download } from "./api";
import { R, dt, when } from "./format";

/* The building blocks of a dashboard page. A page is an async function that loads its data
   and returns a View (title, actions, filters, content). <PageHost/> renders it, re-runs it
   after every action, and reports errors as a toast. */

export interface Action { label: string; p?: boolean; fn: () => Promise<void> | void }
export interface FilterDef { name: string; label: string; type?: "select" | "date" | "search"; options?: [string, string][] }
export interface View {
  title: string;
  sub?: string;
  actions?: Action[];
  filters?: FilterDef[];
  content?: ReactNode;
  /** Handlers for <Lnk d="name|arg|arg"> buttons. */
  on?: Record<string, (...args: string[]) => Promise<void> | void>;
}
export interface PageCtx {
  /** Current value of a filter on this page ("" when unset). */
  F: (name: string) => string;
  /** Set a filter value from an action; the page reloads when the action finishes. */
  setF: (name: string, value: string) => void;
}
export type Page = (c: PageCtx) => Promise<View>;

export interface ViewRuntime {
  /** Run a handler: on failure toast the message, on success reload the page. */
  run: (fn: () => Promise<void> | void) => Promise<void>;
  on: NonNullable<View["on"]>;
}
export const ViewRuntimeContext = createContext<ViewRuntime>({ run: async (fn) => { await fn(); }, on: {} });

/** Status label -> colour class. */
const CLS: Record<string, string> = {
  paid: "s1", completed: "s1", active: "s1", approved: "s1", online: "s1", open: "s2", pending: "s2", processing: "s2", pending_approval: "s2", paused: "s2", invited: "s2",
  partially_refunded: "s2", frozen: "s2", offered: "s2", failed: "s3", declined: "s3", stopped: "s3", cancelled: "s3", past_due: "s3", rejected: "s3", refunded: "s3",
  suspended: "s3", removed: "s3", offline: "s3", lapsed: "s3",
};
export const tag = (s: string, label?: string) => (
  <span className={`tag ${CLS[s] || "s2"}`}>{label ?? String(s).replace(/_/g, " ")}</span>
);

/** A link-style button inside a table. `d` is "handlerName|arg|arg", resolved against View.on. */
export function Lnk({ d, danger, children }: { d: string; danger?: boolean; children: ReactNode }) {
  const { run, on } = useContext(ViewRuntimeContext);
  return (
    <button className={`lnk ${danger ? "d" : ""}`} onClick={() => run(() => { const [n, ...args] = d.split("|"); return on[n]?.(...args); })}>
      {children}
    </button>
  );
}
/** A regular button inside page content that runs `fn` (errors toast, then the page reloads). */
export function RunBtn({ fn, cls = "btn p", children }: { fn: () => Promise<void> | void; cls?: string; children: ReactNode }) {
  const { run } = useContext(ViewRuntimeContext);
  return <button className={cls} onClick={() => run(fn)}>{children}</button>;
}
export const btn = (label: string, d: string, cls = "") => <Lnk d={d} danger={cls === "d"}>{label}</Lnk>;

export interface Col<T> { h: string; r?: boolean; f: (row: T) => ReactNode }
export function table<T>(cols: Col<T>[], rows: T[], empty = "Nothing here yet.") {
  if (!rows.length) return <div className="card"><p className="empty">{empty}</p></div>;
  return (
    <div className="card" style={{ padding: "8px 14px" }}>
      <div className="scroll">
        <table>
          <thead><tr>{cols.map((c, i) => <th key={i} className={c.r ? "r" : ""}>{c.h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{cols.map((c, ci) => <td key={ci} className={c.r ? "r" : ""}>{c.f(row)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const cards = (items: [string, ReactNode][]) => (
  <div className="cards3">{items.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
);
export const note = (t: ReactNode) => <div className="note2">{t}</div>;
export const pct = (n: number) => <div className="pbar" role="img" aria-label={`${n}%`}><i style={{ width: `${n}%` }} /></div>;
export const H2 = ({ top, children }: { top?: boolean; children: ReactNode }) => <h2 style={{ margin: top ? "20px 0 10px" : "0 0 10px" }}>{children}</h2>;
export const Gap = () => <div style={{ height: 16 }} />;

/** On/off switch row. `d` is dispatched like a Lnk when toggled. */
export function Sw({ on, d, label }: { on: boolean; d: string; label: string }) {
  const { run, on: handlers } = useContext(ViewRuntimeContext);
  return (
    <div className="tl" style={{ marginBottom: 8 }}>
      {label}
      <button className="sw" role="switch" aria-checked={on} aria-label={label} onClick={() => run(() => { const [n, ...args] = d.split("|"); return handlers[n]?.(...args); })} />
    </div>
  );
}

/* ----- forms on a page (profile, settings) ----- */

let pageEl: HTMLElement | null = null;
export const setPageElement = (el: HTMLElement | null) => { pageEl = el; };

export function form(fields: { name: string; label: string; type?: "select"; options?: [string, string][] }[], vals: Record<string, any> = {}) {
  return (
    <div className="fm" key={JSON.stringify(vals)}>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.type === "select"
            ? <select data-fld={f.name} defaultValue={vals[f.name]}>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : <input data-fld={f.name} defaultValue={vals[f.name] || ""} autoComplete="off" />}
        </label>
      ))}
    </div>
  );
}
/** Read every form field currently on the page. */
export const collect = (): Record<string, string> =>
  Object.fromEntries([...(pageEl?.querySelectorAll<HTMLInputElement>("[data-fld]") ?? [])].map((e) => [e.dataset.fld!, e.value.trim()]));

/* ----- shared flows used by several pages ----- */

export const enc = encodeURIComponent;

export async function accountOptions(): Promise<[string, string][]> {
  const { data } = await api("/bank/accounts");
  return data.map((a: any) => [a.id, `${a.name} ··${a.number.slice(-4)} (${R(a.balance)})`]);
}
export async function benOptions(): Promise<[string, string][]> {
  return (await api("/bank/beneficiaries")).data.map((b: any) => [b.id, `${b.name} · ${b.bank}`]);
}
/** Payout/transfer destinations: your own accounts and saved beneficiaries. */
export async function destOptions(): Promise<[string, string][]> {
  const [a, b] = await Promise.all([accountOptions(), api("/bank/beneficiaries")]);
  return [...a.map((x): [string, string] => ["acc:" + x[0], x[1]]), ...b.data.map((x: any): [string, string] => ["ben:" + x.id, `${x.name} · ${x.bank}`])];
}
export const dest = (v: string) => (v.startsWith("acc:") ? { type: "bank_account", accountId: v.slice(4) } : { type: "beneficiary", beneficiaryId: v.slice(4) });

export const list = <T,>(rows: T[], render: (row: T, i: number) => ReactNode) =>
  rows.length ? rows.map((r, i) => render(r, i)) : <p className="empty">Nothing here yet.</p>;

export const Row = ({ lead, title, sub, right }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="row">{lead}<div><b>{title}</b>{sub != null && <span>{sub}</span>}</div>{right}</div>
);

export { R, dt, when, ask, toast, secret, showList, showDialog, download, api };
export type { Field };
