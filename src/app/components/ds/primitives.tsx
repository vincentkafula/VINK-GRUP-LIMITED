import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, TriangleAlert, Inbox } from "lucide-react";
import { cn } from "../ui/utils";

/* ───────────────────────── Button ───────────────────────── */
const button = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-vk-md font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg shadow-card hover:bg-brand-hover",
        secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-bad text-white hover:opacity-90",
        gold: "bg-gold text-gold-fg shadow-card hover:brightness-105",
      },
      size: { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-base", icon: "size-11" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { loading?: boolean }
/** 44px minimum touch height (the md size), a visible focus ring from the base styles, and a busy state that also blocks double clicks. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, loading, disabled, children, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(button({ variant, size }), className)} {...rest}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

/* ───────────────────────── Card ───────────────────────── */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-vk-lg border border-line bg-surface shadow-card", className)} {...rest} />;
}
export function CardHeader({ title, action, className, children }: { title: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0"><h2 className="text-base font-semibold text-fg">{title}</h2>{children && <p className="mt-0.5 text-sm text-fg-muted">{children}</p>}</div>
      {action}
    </div>
  );
}

/* ───────────────────────── Badge ───────────────────────── */
const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", {
  variants: { tone: { neutral: "bg-surface-2 text-fg-muted", ok: "bg-ok-bg text-ok", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad", info: "bg-info-bg text-info", gold: "bg-gold/15 text-gold-text" } },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, ...rest }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) { return <span className={cn(badge({ tone }), className)} {...rest} />; }

/* ───────────────────────── Form fields: label, hint and error are always wired to the control ───────────────────────── */
interface FieldShell { label: string; hint?: string; error?: string | null; required?: boolean; className?: string }
const control = "w-full rounded-vk-md border bg-surface px-3.5 text-fg placeholder:text-fg-subtle transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-bad";
const border = "border-line-strong hover:border-fg-subtle";

function Shell({ label, hint, error, required, className, id, children }: FieldShell & { id: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean }) => ReactNode }) {
  const hintId = `${id}-hint`, errId = `${id}-err`;
  const describedBy = [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("block", className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined })}
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-bad"><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />{error}</p>}
    </div>
  );
}
export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell>(function TextField({ label, hint, error, required, className, id, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return <Shell label={label} hint={hint} error={error} required={required} className={className} id={fid}>{(p) => <input ref={ref} className={cn(control, border, "h-11 text-base sm:text-sm")} {...p} {...rest} />}</Shell>;
});
export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(function SelectField({ label, hint, error, required, className, id, children, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return <Shell label={label} hint={hint} error={error} required={required} className={className} id={fid}>{(p) => <select ref={ref} className={cn(control, border, "h-11 text-base sm:text-sm")} {...p} {...rest}>{children}</select>}</Shell>;
});
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(function TextAreaField({ label, hint, error, required, className, id, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return <Shell label={label} hint={hint} error={error} required={required} className={className} id={fid}>{(p) => <textarea ref={ref} className={cn(control, border, "min-h-24 py-2.5 text-base sm:text-sm")} {...p} {...rest} />}</Shell>;
});

/* ───────────────────────── States: loading, empty, error. Use these instead of one-off text. ───────────────────────── */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-vk-sm bg-surface-2", className)} {...rest} />;
}
/** A list-shaped placeholder; announces loading once to assistive technology. */
export function SkeletonList({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}
    </div>
  );
}
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted" aria-hidden="true">{icon ?? <Inbox className="size-6" />}</div>
      <div><p className="font-semibold text-fg">{title}</p>{children && <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{children}</p>}</div>
      {action}
    </div>
  );
}
export function ErrorState({ title = "Something went wrong", children, onRetry }: { title?: string; children?: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-bad-bg text-bad" aria-hidden="true"><TriangleAlert className="size-6" /></div>
      <div><p className="font-semibold text-fg">{title}</p>{children && <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{children}</p>}</div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
