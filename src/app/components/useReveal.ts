import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Entrance motion: content eases up into place as it scrolls into view. Spread the result onto an element that already exists:
 *   const r = useReveal(80);   <div ref={r.ref} style={r.style} className={"... " + r.className}>
 * The motion itself is in styles/premium.css (.vkp-reveal / .is-in).
 *
 * The rule is by position, not by an observer: an element is revealed once its top is above the bottom of the screen, which covers content that is on
 * screen AND content that was scrolled past (the End key, a link to the footer, dragging the scrollbar). One shared scroll listener serves every element
 * and removes itself when nothing is left waiting. Nothing is ever left hidden: with a reduced-motion setting, or where the layout cannot be measured, the
 * content is shown straight away.
 */
type Item = { el: HTMLElement; show: () => void };
const waiting = new Set<Item>();
let frame = 0, listening = false, resizeWatch: ResizeObserver | undefined;

const reached = (el: HTMLElement) => el.getBoundingClientRect().top < window.innerHeight * 0.94;
function sweep() {
  frame = 0;
  waiting.forEach((it) => { if (reached(it.el)) { waiting.delete(it); it.show(); } });
  if (!waiting.size) stopListening();
}
const schedule = () => { if (!frame) frame = requestAnimationFrame(sweep); };
function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
  if (typeof ResizeObserver !== "undefined") { resizeWatch = new ResizeObserver(schedule); resizeWatch.observe(document.documentElement); }   // the page grew (an image loaded): look again
}
function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
  resizeWatch?.disconnect(); resizeWatch = undefined;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>(delayMs = 0) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(() => typeof requestAnimationFrame === "undefined" || (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (reached(el)) { setShown(true); return; }   // already on screen at load
    const item: Item = { el, show: () => setShown(true) };
    waiting.add(item); startListening();
    return () => { waiting.delete(item); if (!waiting.size) stopListening(); };
  }, [shown]);
  return { ref, className: "vkp-reveal" + (shown ? " is-in" : ""), style: delayMs ? ({ transitionDelay: `${delayMs}ms` } as CSSProperties) : undefined };
}
