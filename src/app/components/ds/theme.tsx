import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

/**
 * Light, dark, or follow the device. The choice is remembered in this browser; "system" tracks the device live.
 * The theme is applied as a `dark` class on <html> (the tokens in styles/tokens.css do the rest).
 */
export type ThemeChoice = "light" | "dark" | "system";
const KEY = "vink-theme";

const read = (): ThemeChoice => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" || v === "system" ? v : "system"; } catch { return "system"; } };
const prefersDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
export const resolveTheme = (c: ThemeChoice): "light" | "dark" => (c === "system" ? (prefersDark() ? "dark" : "light") : c);

export function applyTheme(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0c0e14" : "#faf8f4");
}

interface Ctx { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void; cycle: () => void }
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(read);
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolveTheme(read()));

  useEffect(() => {
    const r = resolveTheme(choice); setResolved(r); applyTheme(r);
    if (choice !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => { const n = mq.matches ? "dark" : "light"; setResolved(n); applyTheme(n); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => { setChoiceState(c); try { localStorage.setItem(KEY, c); } catch { /* storage blocked: the choice lasts for this visit */ } }, []);
  const cycle = useCallback(() => setChoice(choice === "light" ? "dark" : choice === "dark" ? "system" : "light"), [choice, setChoice]);
  const value = useMemo(() => ({ choice, resolved, setChoice, cycle }), [choice, resolved, setChoice, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) return { choice: "system", resolved: resolveTheme("system"), setChoice: () => {}, cycle: () => {} };      // outside a provider (tests): harmless defaults
  return c;
}

const LABEL: Record<ThemeChoice, string> = { light: "Light theme", dark: "Dark theme", system: "Match my device" };

/** One button that cycles light, dark, device. The label says what is on now and what a press does next. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { choice, cycle } = useTheme();
  const next: ThemeChoice = choice === "light" ? "dark" : choice === "dark" ? "system" : "light";
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  return (
    <button type="button" onClick={cycle} aria-label={`${LABEL[choice]}. Switch to: ${LABEL[next].toLowerCase()}`} title={LABEL[choice]}
      className={`inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg ${className}`}>
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
