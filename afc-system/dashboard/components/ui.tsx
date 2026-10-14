"use client";
import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ApiError } from "@/lib/api";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = { primary: "bg-slate-900 text-white hover:bg-slate-700", ghost: "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50", danger: "bg-red-600 text-white hover:bg-red-500" }[variant];
  return <button {...p} className={cx("inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50", v, className)} />;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}
const inputCls = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">{title}</h2><div className="flex gap-2">{actions}</div></header>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold", tone === "warn" ? "text-amber-600" : "text-slate-900")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const badge: Record<string, string> = { ACTIVE: "bg-emerald-100 text-emerald-800", ok: "bg-emerald-100 text-emerald-800", LOADED: "bg-emerald-100 text-emerald-800", BLOCKED: "bg-red-100 text-red-800", LOST: "bg-red-100 text-red-800", HIGH: "bg-red-100 text-red-800", denied: "bg-red-100 text-red-800", REVOKED: "bg-red-100 text-red-800", MEDIUM: "bg-amber-100 text-amber-800", PENDING_LOAD: "bg-amber-100 text-amber-800", EXPIRED: "bg-slate-200 text-slate-700", LOW: "bg-slate-100 text-slate-700", CANCELLED: "bg-slate-200 text-slate-700" };
export const Badge = ({ children }: { children: string }) => <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", badge[children] ?? "bg-slate-100 text-slate-700")}>{children.replace(/_/g, " ").toLowerCase()}</span>;

export function Table<T>({ cols, rows, empty = "Nothing to show.", rowKey }: { cols: { h: string; f: (r: T) => ReactNode; right?: boolean }[]; rows: T[]; empty?: string; rowKey: (r: T) => string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">{cols.map((c) => <th key={c.h} className={cx("px-3 py-2 font-medium", c.right && "text-right")}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={rowKey(r)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{cols.map((c) => <td key={c.h} className={cx("px-3 py-2", c.right && "text-right tabular-nums")}>{c.f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("mt-10 w-full rounded-lg bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-md")}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h3 className="font-semibold">{title}</h3><button aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-900">✕</button></header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const messageOf = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

/** Loads data when the page opens and again on demand; shows the error instead of stale or empty numbers. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => { setLoading(true); setError(null); try { setData(await fn()); } catch (e) { setError(messageOf(e)); } finally { setLoading(false); } }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

export const ErrorNote = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}{retry && <button onClick={retry} className="ml-3 font-medium underline">Try again</button>}</div>
);
export const Loading = () => <p className="py-6 text-center text-sm text-slate-500">Loading…</p>;

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div><div className="flex gap-2">{actions}</div></div>;
}
