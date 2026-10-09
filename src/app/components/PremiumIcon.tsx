import { useId, type ComponentType, type CSSProperties } from "react";

/**
 * A premium icon medallion: a squircle of dark glass with a lit metallic rim, a soft top gloss, an inner glow in the accent colour and a gradient-stroked
 * line icon that catches the light. It is drawn entirely with CSS and SVG, so it stays sharp at any size and on any screen (the old icons were small raster
 * images enlarged), costs no image download, and follows the accent colour it is given.
 *
 * accent must be a hex colour (#rrggbb): the rim, glow and icon are all derived from it with colour-mix.
 */
type IconType = ComponentType<{ className?: string; strokeWidth?: number | string; stroke?: string; style?: CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

export function PremiumIcon({ icon: Icon, accent, size = 72, dark = "#0B0614", className = "" }: { icon: IconType; accent: string; size?: number; dark?: string; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const radius = Math.round(size * 0.3);
  const inner = radius - 1.5;
  const tint = `color-mix(in srgb, ${accent} 45%, white)`;
  const iconSize = Math.round(size * 0.44);
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center group/icon ${className}`} style={{ width: size, height: size }}>
      {/* the colour of the light the medallion gives off */}
      <span className="absolute inset-0 blur-xl opacity-40 transition-opacity duration-300 group-hover:opacity-70 group-hover/icon:opacity-70" style={{ background: accent, borderRadius: radius }} />
      {/* the metallic rim: bright at the top left, falling to dark, with a second catch of light at the bottom right */}
      <span className="absolute inset-0" style={{ borderRadius: radius, padding: 1.5, background: `linear-gradient(145deg, ${tint} 0%, ${accent} 30%, color-mix(in srgb, ${accent} 25%, ${dark}) 62%, color-mix(in srgb, ${accent} 70%, white) 100%)`, boxShadow: `0 10px 22px -8px color-mix(in srgb, ${accent} 70%, transparent), 0 2px 4px rgba(0,0,0,0.45)` }}>
        <span className="relative block h-full w-full overflow-hidden" style={{ borderRadius: inner, background: `radial-gradient(120% 120% at 28% 12%, color-mix(in srgb, ${accent} 38%, ${dark}) 0%, ${dark} 58%, #05020B 100%)`, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.28), inset 0 -8px 14px rgba(0,0,0,0.5)" }}>
          {/* gloss across the top half */}
          <span className="absolute inset-x-[7%] top-[4%] h-[46%]" style={{ borderRadius: `${inner}px ${inner}px ${size}px ${size}px / ${inner}px ${inner}px 60% 60%`, background: "linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.04) 100%)" }} />
          {/* a slow sheen that crosses the medallion on hover */}
          <span className="absolute inset-y-0 -left-full w-full -skew-x-12 opacity-0 transition-all duration-700 ease-out group-hover/icon:left-full group-hover/icon:opacity-100 group-hover:left-full group-hover:opacity-100 motion-reduce:hidden" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)" }} />
          <span className="relative flex h-full w-full items-center justify-center">
            <svg width="0" height="0" className="absolute" focusable="false"><defs>
              <linearGradient id={`vk-ico-${gid}`} x1="15%" y1="0%" x2="85%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" /><stop offset="45%" stopColor={tint} /><stop offset="100%" stopColor={accent} />
              </linearGradient>
            </defs></svg>
            <Icon aria-hidden className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover/icon:-translate-y-0.5 group-hover/icon:scale-105 motion-reduce:transition-none" strokeWidth={1.6} stroke={`url(#vk-ico-${gid})`}
              style={{ width: iconSize, height: iconSize, filter: `drop-shadow(0 0 ${Math.round(size * 0.1)}px color-mix(in srgb, ${accent} 65%, transparent)) drop-shadow(0 1px 0 rgba(0,0,0,0.6))` }} />
          </span>
        </span>
      </span>
    </span>
  );
}
