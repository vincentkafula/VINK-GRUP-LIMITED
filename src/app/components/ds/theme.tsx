import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light or dark, nothing else. A visitor who has not chosen sees the light theme (the brand's soft, light palette), whatever their device is set to; the choice is
 * remembered in this browser. There is no "follow the device" setting: a value of "system" saved by an earlier version is read as light.
 * The theme is applied as a `dark` class on <html> (the tokens in styles/tokens.css do the rest).
 */
export type ThemeChoice = "light" | "dark";
const KEY = "vink-theme";

const read = (): ThemeChoice => { try { const v = localStorage.getItem(KEY); return v === "dark" ? "dark" : "light"; } catch { return "light"; } };
export const resolveTheme = (c: ThemeChoice): "light" | "dark" => c;

export function applyTheme(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0c111d" : "#ffffff");
}

interface Ctx { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void; cycle: () => void }
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(read);
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolveTheme(read()));

  useEffect(() => {
    const r = resolveTheme(choice); setResolved(r); applyTheme(r);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => { setChoiceState(c); try { localStorage.setItem(KEY, c); } catch { /* storage blocked: the choice lasts for this visit */ } }, []);
  const cycle = useCallback(() => setChoice(choice === "light" ? "dark" : "light"), [choice, setChoice]);
  const value = useMemo(() => ({ choice, resolved, setChoice, cycle }), [choice, resolved, setChoice, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) return { choice: "light", resolved: "light", setChoice: () => {}, cycle: () => {} };      // outside a provider (tests): harmless defaults
  return c;
}

const LABEL: Record<ThemeChoice, string> = { light: "Light theme", dark: "Dark theme" };

/** One button that switches between light and dark. The label says what is on now and what a press does next. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { choice, cycle } = useTheme();
  const next: ThemeChoice = choice === "light" ? "dark" : "light";
  const Icon = choice === "light" ? Sun : Moon;
  return (
    <button type="button" onClick={cycle} aria-label={`${LABEL[choice]}. Switch to: ${LABEL[next].toLowerCase()}`} title={LABEL[choice]}
      className={`inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg ${className}`}>
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
