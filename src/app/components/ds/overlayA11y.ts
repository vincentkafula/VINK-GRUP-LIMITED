import { useEffect } from "react";

/**
 * Accessibility for the full-screen pages the app opens as overlays (about 70 of them, each hand-built as `fixed inset-0`).
 * Rather than rewrite each one, this watches the page and gives every such overlay what a dialog needs:
 *   - role="dialog", aria-modal and a name (taken from its first heading, else its first image's alt),
 *   - focus moved into it when it opens, kept inside it with Tab, and returned to what had it when it closes,
 *   - Escape closes the top one (by pressing its own close button, so each page's own close logic runs).
 * Anything that already manages itself (Radix dialogs and sheets, toasts, anything with a role or data-state) is left alone.
 */
const CANDIDATE = ".fixed.inset-0:not([role]):not([data-state]):not([data-overlay-ignore]):not([aria-hidden=true])";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

function nameOf(el: HTMLElement): string | null {
  const h = el.querySelector("h1, h2, [role=heading]");
  const t = h?.textContent?.trim();
  if (t) return t.slice(0, 80);
  const alt = el.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt");
  return alt ? alt.slice(0, 80) : null;
}

export function enhanceOverlays(root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>(CANDIDATE).forEach((el) => {
    // purely decorative layers (a dimming backdrop with no content) are not dialogs
    if (!el.querySelector(FOCUSABLE) && !el.textContent?.trim()) return;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    const n = nameOf(el); el.setAttribute("aria-label", n ?? "VINK");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.dataset.vinkOverlay = "1";
    out.push(el);
  });
  return out;
}

const overlays = () => [...document.querySelectorAll<HTMLElement>("[data-vink-overlay='1']")].filter((e) => e.isConnected && visible(e));
/** The top-most overlay: the one drawn last among the highest z-index. */
export function topOverlay(): HTMLElement | null {
  const list = overlays(); if (!list.length) return null;
  const z = (e: HTMLElement) => Number(getComputedStyle(e).zIndex) || 0;
  return list.reduce((a, b) => (z(b) >= z(a) ? b : a));
}

function closeButton(el: HTMLElement): HTMLButtonElement | null {
  const byLabel = el.querySelector<HTMLButtonElement>('button[aria-label="Close" i], button[aria-label^="Close" i], button[aria-label*="close" i]');
  if (byLabel) return byLabel;
  // a button whose only content is the X icon (the common hand-built close button)
  return [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => !b.textContent?.trim() && b.querySelector("svg.lucide-x")) ?? null;
}

export function useOverlayA11y(): void {
  useEffect(() => {
    const returnTo = new WeakMap<HTMLElement, HTMLElement | null>();
    let known = new Set<HTMLElement>();

    const sync = () => {
      const found = new Set(enhanceOverlays());
      overlays().forEach((e) => found.add(e));
      for (const el of found) if (!known.has(el)) {                         // opened
        returnTo.set(el, document.activeElement instanceof HTMLElement ? document.activeElement : null);
        if (!el.contains(document.activeElement)) requestAnimationFrame(() => { (el.querySelector<HTMLElement>("[autofocus]") ?? el).focus({ preventScroll: true }); });
      }
      for (const el of known) if (!found.has(el) || !el.isConnected) {      // closed
        const back = returnTo.get(el); if (back && back.isConnected && !overlays().length) back.focus({ preventScroll: true });
      }
      known = found;
    };

    const onKey = (e: KeyboardEvent) => {
      const top = topOverlay(); if (!top) return;
      if (e.key === "Escape" && !e.defaultPrevented) {
        if (document.querySelector("[data-radix-popper-content-wrapper], [role=dialog][data-state=open]")) return;        // a Radix layer above handles its own Escape
        const b = closeButton(top); if (b) { e.preventDefault(); b.click(); }
      } else if (e.key === "Tab") {
        const nav = document.querySelector<HTMLElement>("[data-persistent-nav]");                // the section strip stays reachable above an overlay
        const items = [...(nav ? nav.querySelectorAll<HTMLElement>(FOCUSABLE) : []), ...top.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
        if (!items.length) { e.preventDefault(); top.focus(); return; }
        const first = items[0], last = items[items.length - 1], active = document.activeElement as HTMLElement | null;
        if ((!top.contains(active) && !nav?.contains(active)) || (active === top)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };

    sync();
    let queued = false;                                               // many DOM changes in one frame cost one scan
    const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKey);
    return () => { mo.disconnect(); document.removeEventListener("keydown", onKey); };
  }, []);
}
