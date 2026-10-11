/**
 * The brand colours that components need as JavaScript values (inline styles, charts, gradients).
 * One place to change them: a brand designer edits this file and src/styles/tokens.css together; brand.test.ts fails if the two disagree.
 * Prefer the CSS tokens (bg-brand, text-fg ...) in styles; use these only where a literal colour string is required.
 *
 * Brand: red #C8102E, with navy #101828 for structure and headings. White text on #C8102E is 5.9:1 (AA).
 */
export const BRAND = {
  crimson: "#C8102E",        // = --vk-brand: primary actions, links, active states
  crimsonHover: "#A50F27",   // = --vk-brand-hover (also the darker end of red gradients)
  crimsonDeep: "#8F1027",    // = --vk-brand-active: pressed state, and the deep red used to tell chart series apart
  crimsonOnDark: "#FF6B81",  // red as TEXT or an icon on a dark surface (#C8102E is only 3.0:1 on navy; this is 6.5:1)
  crimsonSoft: "#FEF2F4",    // a very light red wash for selected rows and subtle highlights on light surfaces
  navy: "#101828",           // = --vk-navy: structural bars and dark sections
  navy2: "#182230",          // = --vk-navy-2: a raised or active item on navy
  gold: "#C9A84C",           // DATA colour only (ratings stars, chart series, regions). Not a brand accent any more; --vk-gold now aliases the brand red
  ok: "#10B981",             // status colours used by charts and badges. Deliberately not brand colours
  warn: "#F59E0B",
  bad: "#EF4444",
  info: "#3B82F6",
} as const;
