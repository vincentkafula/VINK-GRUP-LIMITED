/**
 * Shared UI primitives for all application forms.
 * Used by: BusinessLoanApplicationViewer, CreditCardApplicationViewer, CorporateLoanApplicationViewer
 */
import { CheckCircle } from "lucide-react";

export const P     = "#5B2D8E";
export const PD    = "#3d1d63";
export const GOLD  = "#F5A623";
export const GREEN = "#10B981";

// ── Shared CSS class strings ──────────────────────────────────────────────────

export const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none " +
  "focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all " +
  "bg-white placeholder-gray-400 text-gray-800 hover:border-gray-300";

export const selectCls = inputCls + " cursor-pointer";

// ── Field label + input wrapper ───────────────────────────────────────────────

export function Field({
  label, children, full, required,
}: { label: string; children: React.ReactNode; full?: boolean; required?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Beautiful step progress tracker ──────────────────────────────────────────

interface Step { n: number; label: string; icon: React.ReactNode; }

export function StepTracker({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      <div className="flex items-start min-w-max px-1 gap-0">
        {steps.map((s, i) => {
          const done    = s.n < current;
          const active  = s.n === current;
          const pending = s.n > current;
          return (
            <div key={s.n} className="flex items-start">
              {/* Step bubble + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shadow-sm transition-all"
                  style={{
                    background: done   ? GREEN
                              : active ? `linear-gradient(135deg,${P},#9585EA)`
                              : "#E5E7EB",
                    color:   done || active ? "#fff" : "#9CA3AF",
                    boxShadow: active ? `0 4px 14px ${P}40` : "none",
                    transform: active ? "scale(1.12)" : "scale(1)",
                  }}
                >
                  {done ? <CheckCircle className="w-4 h-4" /> : s.icon}
                </div>
                <span
                  className="text-[9px] text-center leading-tight font-semibold whitespace-pre-line"
                  style={{ color: active ? P : done ? GREEN : "#9CA3AF" }}
                >
                  {s.label}
                </span>
              </div>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="flex-shrink-0 mt-4 mx-0.5 w-8 h-0.5 rounded-full transition-all duration-500"
                  style={{ background: done ? GREEN : "#E5E7EB" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step progress bar ──────────────────────────────────────────────────────────

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value}%`, background: `linear-gradient(90deg,${P},#9585EA)` }}
      />
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

export function FormCard({
  stepN, stepColor, title, subtitle, icon, children,
}: {
  stepN?: number;
  stepColor?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ background: `linear-gradient(135deg,${stepColor ?? P}10,${stepColor ?? P}05)`, borderBottom: `1px solid ${stepColor ?? P}15` }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm shadow-sm"
          style={{ background: `linear-gradient(135deg,${stepColor ?? P},${stepColor ?? "#9585EA"})` }}>
          {icon ?? stepN}
        </div>
        <div>
          <p className="text-sm font-black text-gray-900">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {/* Card body */}
      <div className="p-5 bg-white space-y-4">{children}</div>
    </div>
  );
}

// ── Document upload slot ──────────────────────────────────────────────────────

export function DocSlot({
  label, required, uploaded, onUpload,
}: {
  label: string; required?: boolean; uploaded: boolean; onUpload: () => void;
}) {
  return (
    <label
      className="flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.01]"
      style={{
        borderColor:  uploaded ? GREEN + "60" : "#E5E7EB",
        background:   uploaded ? GREEN + "06" : "#FAFAFA",
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: uploaded ? GREEN : "#F3F4F6" }}
      >
        {uploaded
          ? <CheckCircle className="w-4 h-4 text-white" />
          : <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 leading-snug">{label}</p>
        <p className="text-[10px] mt-0.5 font-medium" style={{ color: uploaded ? GREEN : required ? "#EF4444" : "#9CA3AF" }}>
          {uploaded ? "✓ Uploaded successfully" : required ? "Required" : "Optional"}
        </p>
      </div>
      <span
        className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
        style={{ background: uploaded ? GREEN + "20" : P + "12", color: uploaded ? "#059669" : P }}
      >
        {uploaded ? "Change" : "Upload"}
      </span>
      <input type="file" className="hidden" onChange={onUpload} />
    </label>
  );
}

// ── OTP input ─────────────────────────────────────────────────────────────────

export function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={e => {
            const digits = value.split("");
            digits[i] = e.target.value.replace(/\D/, "");
            onChange(digits.join("").slice(0, 6));
            if (e.target.value && e.target.nextElementSibling) {
              (e.target.nextElementSibling as HTMLInputElement).focus();
            }
          }}
          onKeyDown={e => {
            if (e.key === "Backspace" && !value[i] && e.currentTarget.previousElementSibling) {
              (e.currentTarget.previousElementSibling as HTMLInputElement).focus();
            }
          }}
          className="w-11 h-12 text-center text-xl font-black rounded-xl border-2 outline-none transition-all"
          style={{
            borderColor: value[i] ? P : "#E5E7EB",
            background:  value[i] ? P + "08" : "#FAFAFA",
            color: P,
          }}
        />
      ))}
    </div>
  );
}

// ── Verification badge ────────────────────────────────────────────────────────

export function VerifiedBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
      style={{ background: GREEN + "15", color: GREEN, border: `1px solid ${GREEN}30` }}>
      <CheckCircle className="w-3.5 h-3.5" />
      {label}
    </div>
  );
}

// ── Application hero ──────────────────────────────────────────────────────────

export function AppHero({
  title, subtitle, tag, gradient, children,
}: {
  title: string; subtitle: string; tag: string;
  gradient: string; children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden px-6 py-10 text-white"
      style={{ background: gradient }}>
      {/* Decorative orbs */}
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#fff,transparent)" }} />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#F5A623,transparent)" }} />
      <div className="max-w-2xl mx-auto relative z-10">
        <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-3"
          style={{ background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)" }}>
          {tag}
        </span>
        <h1 className="text-2xl md:text-3xl font-black leading-tight mb-1">{title}</h1>
        <p className="text-white/70 text-sm max-w-md">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

// ── Continue / Back button pair ───────────────────────────────────────────────

export function NavButtons({
  onBack, onNext, nextLabel = "Continue", disabled = false, hideBack = false,
}: {
  onBack?: () => void; onNext?: () => void;
  nextLabel?: string; disabled?: boolean; hideBack?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      {!hideBack && onBack
        ? <button onClick={onBack}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-800 transition-all">
            ← Back
          </button>
        : <div />
      }
      {onNext && (
        <button onClick={onNext} disabled={disabled}
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
          style={{
            background: disabled ? "#9CA3AF" : `linear-gradient(135deg,${P},#9585EA)`,
            boxShadow:  disabled ? "none" : `0 6px 20px ${P}35`,
          }}>
          {nextLabel}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
