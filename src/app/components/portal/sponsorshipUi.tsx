/** Small pieces both sponsorship screens use: the colours for an outcome, and the pill that shows one (an outcome is always written as well as coloured). */
export const TONE: Record<string, { bg: string; fg: string }> = {
  ok: { bg: "var(--vk-ok-bg)", fg: "var(--vk-ok)" }, warn: { bg: "var(--vk-warn-bg)", fg: "var(--vk-warn)" }, bad: { bg: "var(--vk-bad-bg)", fg: "var(--vk-bad)" }, plain: { bg: "var(--vk-surface-2)", fg: "var(--vk-fg)" },
};
export const toneOf = (s: string) => (s === "approved" || s === "agreement_pending" ? "ok" : s === "declined" ? "bad" : s === "more_information_required" ? "warn" : "plain");
export function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>{children}</span>;
}
