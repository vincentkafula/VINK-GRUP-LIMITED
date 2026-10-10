import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { avatarColor, initialOf, listTime, type Label } from "./mailShared";

/** One line of a mailbox list, laid out like a webmail: tick box, star, a dot when it still needs an answer, the sender's round initial, sender, subject, a grey snippet, and the time. */
export function MailRow({ name, subject, preview, at, unread = false, starred = false, checked, onCheck, onStar, onOpen, openLabel, labels = [], note, actions }: {
  name: string; subject: string; preview: string; at: string; unread?: boolean; starred?: boolean; checked?: boolean; onCheck?: (on: boolean) => void; onStar?: () => void;
  /** Makes the whole line open something. */ onOpen?: () => void; openLabel?: string; labels?: Label[]; note?: ReactNode; actions?: ReactNode;
}) {
  return (
    <li className={`relative group border-b border-[#EEF1F6] last:border-b-0 ${checked ? "bg-[#EAF1FF]" : "hover:bg-[#F6F8FC]"}`}>
      {onOpen && <button type="button" onClick={onOpen} aria-label={openLabel ?? `${name}: ${subject}`} className="absolute inset-0 w-full h-full cursor-pointer" />}
      <div className="relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 pointer-events-none">
        <span className="pointer-events-auto relative z-10 flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onCheck ? <input type="checkbox" aria-label={`Select ${name}: ${subject}`} checked={!!checked} onChange={(e) => onCheck(e.target.checked)} className="h-4 w-4 rounded border-[#B8C2D6] accent-[#2F6BFF]" /> : <span className="w-4" />}
          {onStar ? (
            <button type="button" onClick={onStar} aria-label={starred ? "Remove star" : "Add star"} aria-pressed={starred} className="p-0.5 rounded hover:bg-[#E3E9F5]"><Star className="h-[18px] w-[18px]" fill={starred ? "#F5B400" : "none"} stroke={starred ? "#F5B400" : "#8A96AD"} /></button>
          ) : <span className="w-[22px]" />}
        </span>
        <span className="w-2 shrink-0" aria-hidden="true">{unread && <span role="img" aria-label="Needs an answer" className="block h-2 w-2 rounded-full bg-[#2F6BFF]" />}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: avatarColor(name) }} aria-hidden="true">{initialOf(name)}</span>
        <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-4">
          <span className={`block sm:w-44 sm:shrink-0 truncate text-sm text-[#1B2A44] ${unread ? "font-semibold" : ""}`}>{name}</span>
          <span className="block min-w-0 sm:flex sm:flex-1 sm:items-baseline sm:gap-3">
            <span className={`block sm:max-w-[45%] sm:shrink-0 truncate text-sm text-[#1B2A44] ${unread ? "font-semibold" : "font-medium"}`}>{subject}</span>
            {labels.length > 0 && <span className="hidden sm:inline-flex shrink-0 gap-1">{labels.map((l) => <span key={l.id} className="rounded px-1.5 py-px text-[10px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>)}</span>}
            <span className="block min-w-0 flex-1 truncate text-sm text-[#6B7A94]">{preview}</span>
          </span>
          {note && <span className="block text-[11px] text-[#6B7A94] truncate">{note}</span>}
        </span>
        <span className="shrink-0 text-xs text-[#4A5A78] tabular-nums">{listTime(at)}</span>
        {actions && <span className="pointer-events-auto relative z-10 shrink-0">{actions}</span>}
      </div>
    </li>
  );
}
