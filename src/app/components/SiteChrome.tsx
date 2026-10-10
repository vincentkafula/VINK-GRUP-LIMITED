import type { MouseEvent, ReactNode } from "react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

/** Pieces shared by the home header and the strip that stays on top of inner pages, so the two always look and behave the same. */

/** The header is the same height on every page: the notice, then a 64px bar and its 1px rule (the bar here includes the rule). theme.css offsets full-screen pages by NOTICE_H + BAR_H. */
export const NOTICE_H = 32, BAR_H = 65;

/** The pre-launch notice. It is a legal statement, so it stays on every page; only its length changes with the screen. */
export function LaunchNotice() {
  return (
    <div role="note" className="flex items-center justify-center bg-[#0c0e14] px-3 text-center text-[11.5px] font-medium leading-none text-[#f3f1ec] sm:text-[13px]" style={{ height: NOTICE_H }}>
      <span className="sm:hidden">Not yet in full operation · preview only · <span className="text-[#e0c068]">launch June 2027</span></span>
      <span className="hidden sm:inline">VINK is not yet in full operation. All information on this site is a preview. <span className="font-semibold text-[#e0c068]">Full launch: June 2027.</span></span>
    </div>
  );
}

/** The crest. The source image is large, so it is only ever drawn small. */
export function BrandMark({ height = 36 }: { height?: number }) {
  return <img src={vinkLogo} alt="VINK" decoding="async" style={{ height, width: "auto" }} className="object-contain" />;
}

export type Section = "Personal" | "Business" | "Corporate";
export const SECTIONS: { label: Section; href: string }[] = [
  { label: "Personal", href: "/personal" },
  { label: "Business", href: "/business" },
  { label: "Corporate", href: "/corporate" },
];

/**
 * A real link (it has an address: it can be copied, opened in a new tab, and read by search engines) that still runs the app's own handler on a plain click.
 * A click with Ctrl, Cmd, Shift or the middle button is left to the browser.
 */
export function AppLink({ href, onNavigate, className, children, current, ...rest }: { href: string; onNavigate: () => void; className?: string; children: ReactNode; current?: boolean; "aria-expanded"?: boolean; "aria-controls"?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); onNavigate();
  };
  return <a href={href} onClick={onClick} aria-current={current ? "page" : undefined} className={className} {...rest}>{children}</a>;
}

export const navItemClass = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${active ? "bg-brand text-brand-fg" : "text-fg hover:bg-surface-2"}`;
