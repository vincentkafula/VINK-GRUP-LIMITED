import { useState, useCallback } from "react";

type Rules<T> = {
  [K in keyof T]?: (value: T[K], allValues: T) => string | null;
};

/**
 * Generic form validation hook.
 * Usage:
 *   const { errors, validate, clearError } = useFormValidation(form, rules);
 *   if (!validate()) return; // aborts if invalid
 */
export function useFormValidation<T extends Record<string, unknown>>(
  values: T,
  rules: Rules<T>
) {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let valid = true;
    for (const key in rules) {
      const rule = rules[key as keyof T];
      if (!rule) continue;
      const error = rule(values[key as keyof T] as T[keyof T], values);
      if (error) {
        newErrors[key as keyof T] = error;
        valid = false;
      }
    }
    setErrors(newErrors);
    return valid;
  }, [values, rules]);

  const clearError = useCallback((field: keyof T) => {
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  return { errors, validate, clearError, clearAll };
}

// ─── Common SA validators ──────────────────────────────────────────────────────

export const validators = {
  required: (label = "This field") => (v: unknown) =>
    !v || String(v).trim() === "" ? `${label} is required` : null,

  saId: () => (v: unknown) => {
    const s = String(v ?? "").replace(/\s/g, "");
    if (!s) return "SA ID number is required";
    if (!/^\d{13}$/.test(s)) return "SA ID must be exactly 13 digits";
    return null;
  },

  saPhone: () => (v: unknown) => {
    const s = String(v ?? "").replace(/\s/g, "");
    if (!s || s === "+27") return "Phone number is required";
    if (!/^(\+27|0)[0-9]{9}$/.test(s)) return "Enter a valid South African phone number";
    return null;
  },

  email: () => (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s) return "Email address is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Enter a valid email address";
    return null;
  },

  cipc: () => (v: unknown) => {
    const s = String(v ?? "").replace(/\s/g, "");
    if (!s) return "CIPC registration number is required";
    // South African CIPC format: YYYY/NNNNNN/NN
    if (!/^\d{4}\/\d{6}\/\d{2}$/.test(s)) return "Use format: YYYY/NNNNNN/NN (e.g. 2018/079316/07)";
    return null;
  },

  minAmount: (min: number, label = "Amount") => (v: unknown) => {
    const n = Number(v);
    if (!v || isNaN(n)) return `${label} is required`;
    if (n < min) return `${label} must be at least R${min.toLocaleString("en-ZA")}`;
    return null;
  },

  minLength: (min: number, label = "This field") => (v: unknown) => {
    const s = String(v ?? "").trim();
    if (s.length < min) return `${label} must be at least ${min} characters`;
    return null;
  },
};
