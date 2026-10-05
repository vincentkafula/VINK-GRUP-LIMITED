/* eslint-disable @typescript-eslint/no-explicit-any -- notification rows are untyped API JSON */
import { useCallback, useEffect, useRef, useState } from "react";
import "./manshya.css";
import { getSession, clearSession } from "../../services/apiClient";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { api } from "./api";
import { DialogHost, ToastHost, showList, toast } from "./dialogs";
import { PageHost, type FilterStore } from "./PageHost";
import { TestModeBanner } from "./TestModeBanner";
import { HomeFor } from "./Home";
import { Icon } from "./icons";
import { NAV, SHARED, isGroup, type Mode, type NavEntry } from "./nav";
import { themeEvents } from "./pages/account";
import { list, Row } from "./kit";
import { when } from "./format";

/** The VINK dashboards are for customer accounts only (the server enforces this too). */
export const CUSTOMER_ROLE = "customer";
/** Passenger ("personal") accounts use the same payments and banking dashboard. The server enforces this too (manshya/access.ts). */
const DASHBOARD_ROLES = [CUSTOMER_ROLE, "personal"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the user chooses to sign out (session already cleared). */
  onSignOut?: () => void;
}

const applyTheme = (t: string | undefined): "light" | "dark" | undefined => (t === "light" || t === "dark" ? t : undefined);

export function ManshyaDashboard({ isOpen, onClose, onSignOut }: Props) {
  useBodyScrollLock(isOpen);
  const session = getSession();
  const [authProblem, setAuthProblem] = useState<null | "expired" | "not_customer">(null);
  const [mode, setMode] = useState<Mode>("online");
  const [page, setPage] = useState("home");
  const [theme, setTheme] = useState<"light" | "dark" | undefined>();
  const [me, setMe] = useState<{ id: string; name: string; verified: boolean } | null>(null);
  const [unread, setUnread] = useState(0);
  const filters = useRef<FilterStore>({});

  const isCustomer = DASHBOARD_ROLES.includes(session?.role ?? "");
  const allowed = isOpen && isCustomer && !authProblem;

  const onAuthError = useCallback((e: Error & { status?: number; code?: string }) => {
    setAuthProblem(e.status === 401 ? "expired" : e.code === "customer_only" ? "not_customer" : null);
  }, []);

  // Load who we are, the chosen theme and the unread count — only once we know this is a customer.
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    (async () => {
      try {
        const [m, s] = await Promise.all([api("/me"), api("/settings")]);
        if (!live) return;
        setMe(m);
        setTheme(applyTheme(s.display?.theme));
      } catch (e) { onAuthError(e as Error & { status?: number }); }
    })();
    return () => { live = false; };
  }, [allowed, onAuthError]);

  useEffect(() => {
    const h = (e: Event) => setTheme(applyTheme((e as CustomEvent<string>).detail));
    themeEvents.addEventListener("theme", h);
    return () => themeEvents.removeEventListener("theme", h);
  }, []);

  const refreshBell = useCallback(async () => {
    try { const n = await api("/notifications"); setUnread(n.unread || 0); return n; } catch { return null; }
  }, []);
  useEffect(() => {
    if (!allowed) return;
    void refreshBell();
    const t = window.setInterval(refreshBell, 60000);
    return () => window.clearInterval(t);
  }, [allowed, refreshBell]);

  if (!isOpen) return null;

  const signOut = () => { clearSession(); setAuthProblem(null); onClose(); onSignOut?.(); };

  if (!allowed) {
    const message = authProblem === "expired"
      ? "Your session has expired. Please sign in again."
      : "The VINK dashboard is for customer accounts. Please sign in with a customer account to continue.";
    return (
      <div className="mn" data-theme={theme} role="dialog" aria-modal="true" aria-label="VINK sign-in required">
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="card" style={{ maxWidth: 440 }}>
            <div className="logo" style={{ width: "auto", padding: 0, color: "var(--side)", marginBottom: 10 }}>manshya<i>.</i></div>
            <h2>Customer sign-in required</h2>
            <p style={{ color: "var(--mute)" }}>{message}</p>
            <div className="dact">
              <button className="btn g" onClick={onClose}>Back</button>
              <button className="btn p" onClick={signOut}>Sign in</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const go = (id: string) => {
    if (id === "logout") return signOut();
    setPage(id);
    document.querySelector(".mn")?.scrollTo?.(0, 0);
  };
  const switchMode = (m: Mode) => { setMode(m); setPage("home"); };

  const openBell = async () => {
    const n = await refreshBell();
    if (!n) return;
    void showList("Notifications", list(n.data, (x: any, i: number) => (
      <Row key={i} title={x.title} sub={`${x.body || ""} · ${when(x.created_at)}`} />
    )));
    try { await api("/notifications/read", { method: "POST" }); await refreshBell(); } catch (e) { toast((e as Error).message); }
  };

  const firstName = (session?.name || me?.name || "").split(/\s+/)[0] || "there";
  // The Banking tab is kept, but without the "manshya finance" product name.
  const tabs: [Mode, string, string, string][] = [
    ["online", "Online payments", "cart", "manshya pay"], ["pos", "In-person payments", "dev", "manshya tap"], ["bank", "Banking", "bank", "My banking"],
  ];

  return (
    <div className="mn" data-mode={mode} data-page={page === "home" ? undefined : page} data-theme={theme} role="dialog" aria-modal="true" aria-label="VINK business dashboard">
      <TestModeBanner />
      <div className="bar">
        <div className="logo">manshya<i>.</i></div>
        <div className="tabs" role="group" aria-label="Payment type">
          {tabs.map(([m, small, icon, label]) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => switchMode(m)}>
              <small>{small}</small><b><Icon name={icon} />{label}</b>
            </button>
          ))}
        </div>
        <button className="bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={openBell}>
          <Icon name="bell" />{unread > 0 && <b>{unread}</b>}
        </button>
        <div className="who"><b>{session?.name}</b>Business Dashboard</div>
        <button className="bell" aria-label="Close dashboard" onClick={onClose} style={{ fontSize: 22 }}>×</button>
      </div>

      <div className="wrap">
        <aside>
          <Menu entries={NAV[mode]} page={page} go={go} />
          <hr />
          <Menu entries={SHARED} page={page} go={go} />
        </aside>
        <main>
          {page === "home"
            ? <HomeFor mode={mode} name={firstName} merchantId={me?.id} verified={me?.verified} />
            : <PageHost key={page} id={page} filters={filters} onAuthError={onAuthError} />}
        </main>
      </div>
      <DialogHost />
      <ToastHost />
    </div>
  );
}

function Menu({ entries, page, go }: { entries: NavEntry[]; page: string; go: (id: string) => void }) {
  return (
    <>
      {entries.map((e) => isGroup(e) ? (
        <Group key={e.label} label={e.label} icon={e.icon} kids={e.kids} page={page} go={go} />
      ) : (
        <a key={e.id} href="#" className={page === e.id ? "on" : ""} onClick={(ev) => { ev.preventDefault(); go(e.id); }}>
          <Icon name={e.icon} />{e.label}
        </a>
      ))}
    </>
  );
}

function Group({ label, icon, kids, page, go }: { label: string; icon: string; kids: [string, string][]; page: string; go: (id: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const active = kids.some(([id]) => id === page);
  useEffect(() => { if (active && ref.current) ref.current.open = true; }, [active]);
  return (
    <details ref={ref} className={active ? "act" : ""} open={kids.some(([id]) => id === "home") || undefined}>
      <summary><Icon name={icon} />{label}</summary>
      {kids.map(([id, text]) => (
        <a key={id} href="#" className={page === id ? "on" : ""} onClick={(ev) => { ev.preventDefault(); go(id); }}>{text}</a>
      ))}
    </details>
  );
}
