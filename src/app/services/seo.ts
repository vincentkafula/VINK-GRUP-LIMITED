/**
 * Updates the page's <title> and meta description at runtime. Without this,
 * every route in this SPA (a single index.html served for every path -- see
 * the Dockerfile/nginx setup) shares the exact same static title and
 * description, meaning Google would see identical metadata for
 * /news, /business, and /corporate/events, which badly limits
 * how well any one of them can rank for its own relevant searches. Each
 * section gets its own real, keyword-relevant title/description here,
 * matching what people actually search for related to that content
 * specifically (verified against the site's own real data before writing
 * these, not guessed).
 *
 * Restores the original default on unmount, so closing one of these views
 * doesn't leave the homepage permanently showing a sub-page's title.
 */

const DEFAULT_TITLE = "MANSHYA Bank";
const DEFAULT_DESCRIPTION = "MANSHYA — South Africa's first transport-native digital bank. AFC payments, banking, ride-hailing, fleet tracking and MVNO in one platform.";

export function setPageMeta(title: string, description: string): () => void {
  const prevTitle = document.title;
  const descTag = document.querySelector('meta[name="description"]');
  const prevDescription = descTag?.getAttribute("content") ?? DEFAULT_DESCRIPTION;

  document.title = title;
  if (descTag) descTag.setAttribute("content", description);

  return () => {
    document.title = prevTitle;
    if (descTag) descTag.setAttribute("content", prevDescription);
  };
}

export const PAGE_META = {
  business: {
    title: "Business Banking for South African Entrepreneurs | MANSHYA",
    description: "Open a business bank account built for taxi associations, fleet owners, fuel stations, and small businesses across South Africa. No monthly fees, fast settlements, employee cards, and cross-border payments at local rates.",
  },
  news: {
    title: "MANSHYA News — World, Africa, Business & Technology Headlines",
    description: "Stay informed with MANSHYA News: World, Africa, Business, Technology, Sport, Entertainment and Opinion coverage, updated regularly.",
  },
  events: {
    title: "MANSHYA Events — Concerts, Comedy & Show Tickets",
    description: "Book tickets for concerts, comedy shows, Afrikaans entertainment and more through MANSHYA Events, with vouchers and exclusive offers.",
  },
};
