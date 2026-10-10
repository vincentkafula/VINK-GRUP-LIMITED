/**
 * The brand colours that components need as JavaScript values (inline styles, charts, gradients).
 * One place to change them: a brand designer edits this file and src/styles/tokens.css together; brand.test.ts fails if the two disagree.
 * Prefer the CSS tokens (bg-brand, text-fg ...) in styles; use these only where a literal colour string is required.
 */
export const BRAND = {
  crimson: "#8B0000",        // = --vk-brand (light)
  crimsonLight: "#9B1C1C",
  crimsonDeep: "#5C0A10",
  crimsonInk: "#2E0B10",
  gold: "#C9A84C",           // = --vk-gold
  ok: "#10B981",             // status colours used by charts and badges
  warn: "#F59E0B",
  bad: "#EF4444",
  info: "#3B82F6",
} as const;
