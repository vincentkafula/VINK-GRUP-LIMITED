"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type Role = "ADMIN" | "OPERATOR" | "AGENT" | "VIEWER";
export interface User { sub: string; email: string; role: Role; operatorId?: number }

interface Ctx { user: User | null; ready: boolean; login(email: string, password: string): Promise<void>; logout(): void; can(...roles: Role[]): boolean }
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: { id: string; email: string; role: Role; operatorId: number | null } }>("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(r.token);
    setUser({ sub: r.user.id, email: r.user.email, role: r.user.role, operatorId: r.user.operatorId ?? undefined });
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); window.location.href = "/login"; }, []);
  const can = useCallback((...roles: Role[]) => !!user && (user.role === "ADMIN" || roles.includes(user.role)), [user]);

  return <AuthCtx.Provider value={{ user, ready, login, logout, can }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
