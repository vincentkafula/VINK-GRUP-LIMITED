import type { ComponentType, CSSProperties } from "react";

type IconType = ComponentType<{ className?: string; strokeWidth?: number | string; style?: CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

/**
 * A soft icon tile for light pages: a very light red wash with the icon in brand red. It replaces the dark glass medallion (PremiumIcon) on the home page, where a
 * row of dark squares looked heavy against the white and soft grey sections. It follows the theme through the tokens.
 */
export function SoftIcon({ icon: Icon, size = 48, className = "" }: { icon: IconType; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: "var(--vk-brand-soft)" }}>
      <Icon aria-hidden className="transition-transform duration-300 group-hover:scale-105" strokeWidth={1.7} style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46), color: "var(--vk-crimson-text)" }} />
    </span>
  );
}
