import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  swap: <path d="M7 7h13l-3-3M17 17H4l3 3" />,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  chart: <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />,
  send: <path d="M3 11l18-8-8 18-2-8z" />,
  gear: <><circle cx="12" cy="12" r="3.5" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  bank: <path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />,
  out: <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />,
  dev: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  cart: <><path d="M3 4h3l2 12h10l2-8H7" /><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>,
  rec: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  tag: <><path d="M3 12l9-9h9v9l-9 9z" /><circle cx="16" cy="8" r="1" /></>,
  warn: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  bell: <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 004 0" />,
};

export function Icon({ name }: { name: string }) {
  return <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}
