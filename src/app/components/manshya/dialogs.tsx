/* eslint-disable @typescript-eslint/no-explicit-any -- answers are whatever the form fields produce (text, cents, files) */
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";

/* Dialogs and toasts for the Manshya screens. They are called from async handlers
   ("ask for an amount, then call the API"), so they are exposed as plain functions backed
   by two host components (<DialogHost/>, <ToastHost/>) that the dashboard mounts once. */

type Render = (close: () => void) => ReactNode;
interface Open { id: number; render: Render; onClosed: () => void }

let setOpen: ((o: Open | null) => void) | null = null;
let current: Open | null = null;
let nextId = 1;
let pushToast: ((msg: string) => void) | null = null;

export const toast = (msg: string): void => { pushToast?.(msg); };

/** Show any content in the dialog. Resolves when the dialog closes. */
export function showDialog(render: Render): Promise<void> {
  return new Promise((resolve) => {
    if (!setOpen) return resolve();
    current?.onClosed();   // a new dialog replaces the old one
    const o: Open = { id: nextId++, render, onClosed: () => { if (current === o) current = null; resolve(); } };
    current = o;
    setOpen(o);
  });
}

export function DialogHost() {
  const [open, set] = useState<Open | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { setOpen = set; return () => { setOpen = null; }; }, []);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) { try { d.showModal(); } catch { /* not attached yet */ } }
  }, [open]);
  if (!open) return null;
  const close = () => { ref.current?.close(); };
  return (
    <dialog
      key={open.id}
      ref={ref}
      onClose={() => { open.onClosed(); set((cur) => (cur && cur.id === open.id ? null : cur)); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
    >
      {open.render(close)}
    </dialog>
  );
}

export function ToastHost() {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    pushToast = (m) => {
      setMsg(m); setOn(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOn(false), 3800);
    };
    return () => { pushToast = null; window.clearTimeout(timer.current); };
  }, []);
  return <div id="toast" role="status" className={on ? "on" : ""}>{msg}</div>;
}

/* ---------- ask(): a small form dialog ---------- */

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "date" | "password" | "textarea" | "select" | "file";
  options?: [string, string][];
  /** Typed in rand, returned in cents. */
  money?: boolean;
  required?: boolean;
  placeholder?: string;
}
export type Answers = Record<string, any>;

const readFile = (file: File) => new Promise<string>((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = no;
  r.readAsDataURL(file);
});

function AskForm({ title, fields, cta, done }: { title: string; fields: Field[]; cta: string; done: (v: Answers | null) => void }) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const out: Answers = {};
    for (const f of fields) {
      const el = form.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (f.type === "file") {
        const file = (el as HTMLInputElement).files?.[0];
        if (!file) continue;
        if (file.size > 2 * 1024 * 1024) { toast("That file is over 2 MB"); return; }
        out[f.name] = { filename: file.name, contentBase64: await readFile(file) };
        continue;
      }
      const v = el.value.trim();
      if (v === "") continue;
      out[f.name] = f.money ? Math.round(parseFloat(v) * 100) : v;
    }
    done(out);
  };
  return (
    <form onSubmit={submit}>
      <h3>{title}</h3>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.type === "textarea" ? (
            <textarea name={f.name} rows={7} required={f.required !== false} placeholder={f.placeholder} />
          ) : f.type === "file" ? (
            <input name={f.name} type="file" accept=".pdf,.png,.jpg,.jpeg" required />
          ) : f.type === "select" ? (
            <select name={f.name}>{(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          ) : (
            <input
              name={f.name}
              type={f.money ? "number" : f.type ?? "text"}
              {...(f.money ? { step: "0.01", min: "1" } : {})}
              required={f.required !== false}
              placeholder={f.placeholder}
              autoComplete="off"
            />
          )}
        </label>
      ))}
      <div className="dact">
        <button type="button" className="btn g" onClick={() => done(null)}>Cancel</button>
        <button className="btn p">{cta}</button>
      </div>
    </form>
  );
}

/** Ask for some values. Money fields are typed in rand and returned in cents. null = cancelled. */
export function ask(title: string, fields: Field[], cta: string): Promise<Answers | null> {
  return new Promise((resolve) => {
    let answer: Answers | null = null;
    showDialog((close) => <AskForm title={title} fields={fields} cta={cta} done={(v) => { answer = v; close(); }} />).then(() => resolve(answer));
  });
}

/** A value shown once (API key, cash code, ...). */
export function secret(title: string, value: string, hint: string): Promise<void> {
  return showDialog((close) => (
    <>
      <h3>{title}</h3>
      <p className="note2">{hint}</p>
      <code className="k">{value}</code>
      <div className="dact"><button className="btn p" onClick={close}>Done</button></div>
    </>
  ));
}

/** Title + scrolling body + Close button (statements, histories, ...). */
export function showList(title: string, body: ReactNode, extra?: ReactNode): Promise<void> {
  return showDialog((close) => (
    <>
      <h3>{title}</h3>
      {extra}
      <div className="stmt">{body}</div>
      <div className="dact"><button className="btn g" onClick={close}>Close</button></div>
    </>
  ));
}

