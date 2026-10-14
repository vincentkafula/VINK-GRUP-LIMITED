/** A small bar chart in plain SVG (no chart library): one bar per label, height proportional to value. */
export function Bars({ items, format }: { items: { label: string; value: number }[]; format: (n: number) => string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">No data for this period.</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const w = 100 / items.length;
  return (
    <figure>
      <svg viewBox="0 0 100 44" className="h-48 w-full" role="img" aria-label="Bar chart">
        {items.map((it, i) => {
          const h = (it.value / max) * 34;
          const bw = Math.min(w * 0.7, 12);
          return (
            <g key={it.label}>
              <rect x={i * w + (w - bw) / 2} y={38 - h} width={bw} height={Math.max(h, 0.3)} rx={0.6} className="fill-slate-800"><title>{`${it.label}: ${format(it.value)}`}</title></rect>
              <text x={i * w + w / 2} y={42.5} textAnchor="middle" fontSize={items.length > 12 ? 2 : 2.8} className="fill-slate-500">{it.label.length > 6 ? it.label.slice(-5) : it.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{items.map((i) => `${i.label} ${format(i.value)}`).join(", ")}</figcaption>
    </figure>
  );
}
