import { useState } from "react";
import { ZoomIn } from "lucide-react";

/**
 * An image that magnifies where the mouse is when the pointer rolls over it, so a card's design and detail can be seen up close without opening anything.
 * Only a mouse or pen zooms: a finger never does (a tap on a phone opens the card instead), and nothing changes for people who reduce motion except that the
 * zoom is instant rather than eased. The image keeps its frame; the part outside the frame is clipped while zoomed.
 */
export function ZoomImage({ src, alt, zoom = 2, className = "", showIcon = true }: { src: string; alt: string; zoom?: number; className?: string; showIcon?: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setAt({ x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) });
  };
  return (
    <div className="relative w-full h-full overflow-hidden" data-zoom={at ? "on" : "off"} onPointerEnter={move} onPointerMove={move} onPointerLeave={() => setAt(null)} onPointerCancel={() => setAt(null)}>
      <img loading="lazy" decoding="async" src={src} alt={alt} draggable={false} className={`${className} motion-safe:transition-transform motion-safe:duration-150 ease-out will-change-transform`}
        style={at ? { transform: `scale(${zoom})`, transformOrigin: `${at.x}% ${at.y}%` } : { transform: "scale(1)" }} />
      {showIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 hidden [@media(hover:hover)]:flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white transition-opacity duration-150" style={{ opacity: at ? 0 : 0.85 }}>
          <ZoomIn className="h-3.5 w-3.5" />
        </span>)}
    </div>
  );
}
