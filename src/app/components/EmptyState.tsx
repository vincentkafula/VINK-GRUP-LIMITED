/** Reusable empty-state component for lists, search results, and API returns. */
import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, emoji, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {emoji && <span className="text-5xl mb-4">{emoji}</span>}
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <p className="text-base font-bold text-gray-700 mb-1">{title}</p>
      {body && <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{body}</p>}
      {action && (
        <button onClick={action.onClick}
          className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#5B2D8E" }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Skeleton shimmer for loading states */
export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded-full bg-gray-200"
          style={{ width: `${60 + (i % 3) * 20}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(260px, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-gray-100 h-48" />
      ))}
    </div>
  );
}
