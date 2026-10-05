import { useEffect } from "react";

/** Sets the browser tab title for as long as a page is open, then puts the previous one back. Screen-reader users and tabs get the page's name. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = `${title} · VINK`;
    return () => { document.title = before; };
  }, [title]);
}
