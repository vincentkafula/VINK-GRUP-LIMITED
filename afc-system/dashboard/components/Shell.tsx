"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth, type Role } from "@/lib/auth";
import { cx } from "./ui";

const NAV: { href: string; label: string; roles: Role[] | "all" }[] = [
  { href: "/", label: "Overview", roles: ["VIEWER", "OPERATOR"] },
  { href: "/cards", label: "Cards", roles: "all" },
  { href: "/topups", label: "Top-ups", roles: ["AGENT", "OPERATOR", "VIEWER"] },
  { href: "/fares", label: "Fares & routes", roles: ["VIEWER", "OPERATOR"] },
  { href: "/devices", label: "Devices", roles: ["VIEWER", "OPERATOR"] },
  { href: "/reports", label: "Reports", roles: ["VIEWER", "OPERATOR"] },
  { href: "/anomalies", label: "Alerts", roles: ["VIEWER", "OPERATOR"] },
  { href: "/audit", label: "Audit log", roles: [] },
  { href: "/users", label: "Staff", roles: [] },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, ready, logout, can } = useAuth();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/login"); }, [ready, user, router]);
  if (!ready || !user) return <div className="p-10 text-sm text-slate-500">Loading…</div>;
  const items = NAV.filter((n) => n.roles === "all" || can(...n.roles));
  // an agent lands on Cards, not the overview they cannot read
  if (path === "/" && !can("VIEWER", "OPERATOR")) { router.replace("/cards"); return null; }
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-200">
        <div className="px-4 py-5"><div className="text-lg font-semibold text-white">AFC</div><div className="text-xs text-slate-400">Fare collection</div></div>
        <nav className="space-y-0.5 px-2">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={cx("block rounded-md px-3 py-2 text-sm", (n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "bg-slate-700 text-white" : "hover:bg-slate-800")}>{n.label}</Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-700 px-4 py-4 text-xs">
          <div className="truncate text-slate-300">{user.email}</div>
          <div className="mb-2 text-slate-500">{user.role.toLowerCase()}</div>
          <button onClick={logout} className="text-slate-300 underline hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
