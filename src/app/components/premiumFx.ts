import type { MouseEvent } from "react";

/**
 * Small pointer effects for the premium home sections. They only set CSS variables on the element; the look itself is in styles/premium.css.
 * Nothing here changes what a card says or does, and with a touch screen or a reduced-motion setting nothing moves.
 */

/** A soft light that follows the mouse across a card: spread onto the card element (`<div {...spot}>`) and give it the .vkp-spot class. */
export const spot = {
  onMouseMove: (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  },
};
