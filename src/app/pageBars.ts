/**
 * Every public page used to draw its own top bar (the VINK logo and an X). With the site header (PersistentTopNav) above every page that is a second logo, and a
 * second way to close, so the page's own bar is hidden and the logo in the header is the way back to the home page.
 *
 * The bar is found rather than edited into each of the ~40 pages: it is the block that holds the page's logo and sits first in the page. It is marked with
 * data-page-bar, and theme.css hides the marked bars while the header is shown. A logo inside the footer, a dialog (login, help) or the header itself is left alone.
 */
export const PAGE_BAR_ATTR = "data-page-bar";

export function markPageBars(root: ParentNode = document): number {
  let marked = 0;
  for (const logo of root.querySelectorAll<HTMLImageElement>('.fixed.inset-0 img[alt="VINK"]')) {
    if (logo.closest("footer, [role='dialog'], [aria-modal='true'], [data-persistent-nav]")) continue;
    const page = logo.closest<HTMLElement>(".fixed.inset-0");
    if (!page) continue;
    // the bar: the nearest block around the logo that is a nav, sticky, or has a bottom border
    let bar: HTMLElement | null = logo.parentElement;
    while (bar && bar !== page && !(bar.tagName === "NAV" || /\bsticky\b|\bborder-b\b/.test(bar.className) || /sticky|borderBottom/.test(bar.getAttribute("style") ?? ""))) bar = bar.parentElement;
    if (!bar || bar === page) continue;
    // ...and it must be the first thing on the page, so a logo further down the page is never hidden
    let first = true;
    for (let el: HTMLElement | null = bar; el && el !== page; el = el.parentElement) if (el.parentElement && el.parentElement.firstElementChild !== el) { first = false; break; }
    if (!first) continue;
    if (!bar.hasAttribute(PAGE_BAR_ATTR)) { bar.setAttribute(PAGE_BAR_ATTR, ""); marked++; }
  }
  return marked;
}
