"use client";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Staff { id: string; email: string; name: string; role: string; operatorId: number | null; active: boolean; createdAt: string }

export default function Users() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<{ users: Staff[] }>("/api/users"));
  const [adding, setAdding] = useState(false); const [err, setErr] = useState<string | null>(null);
  const patch = async (u: Staff, body: object) => { setErr(null); try { await api(`/api/users/${u.id}`, { method: "PATCH", body }); await reload(); } catch (e) { setErr(messageOf(e)); } };

  return (
    <>
      <PageHeader title="Staff" sub="Who can sign in, and what each role can do" actions={<Button onClick={() => setAdding(true)}>Add a person</Button>} />
      <Card className="mb-5"><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li><b>Admin</b>: everything, including staff accounts, discounts, time rules and the audit log.</li>
        <li><b>Operator</b>: the routes and money of their own operator: fares, devices, blocking cards, reports, alerts.</li>
        <li><b>Agent</b>: registers cards and records top-ups at a counter. No reports.</li>
        <li><b>Viewer</b>: can look at cards, fares, devices and reports but change nothing.</li>
      </ul></Card>
      {(error || err) && <ErrorNote error={(error ?? err)!} retry={reload} />}
      <Card>
        {loading && !data ? <Loading /> : data && (
          <Table rowKey={(u) => u.id} rows={data.users} cols={[
            { h: "Email", f: (u) => u.email }, { h: "Name", f: (u) => u.name }, { h: "Role", f: (u) => u.role.toLowerCase() }, { h: "Operator", f: (u) => u.operatorId ?? "—" },
            { h: "Active", f: (u) => <Badge>{u.active ? "ACTIVE" : "REVOKED"}</Badge> }, { h: "Added", f: (u) => when(u.createdAt) },
            { h: "", f: (u) => (u.email === user?.email ? <span className="text-slate-400">you</span> : <span className="flex gap-3"><button className="underline" onClick={() => patch(u, { active: !u.active })}>{u.active ? "Deactivate" : "Reactivate"}</button><button className="underline" onClick={() => { const p = window.prompt(`New password for ${u.email} (at least 10 characters, letters and a digit):`); if (p) void patch(u, { password: p }); }}>Reset password</button></span>) },
          ]} />
        )}
      </Card>
      {adding && <Add onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await reload(); }} />}
    </>
  );
}

function Add({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState("AGENT"); const [operatorId, setOperatorId] = useState("1");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/users", { method: "POST", body: { email, name, password, role, operatorId: role === "OPERATOR" ? Number(operatorId) : undefined } }); onDone(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a person" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorNote error={error} />}
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value)}><option value="AGENT">Agent</option><option value="VIEWER">Viewer</option><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></Select></Field>
        {role === "OPERATOR" && <Field label="Operator number"><Input type="number" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} /></Field>}
        <Field label="Temporary password" hint="At least 10 characters with letters and a digit. Ask them to change it after signing in."><Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</Button></div>
      </form>
    </Modal>
  );
}
