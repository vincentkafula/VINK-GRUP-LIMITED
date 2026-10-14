"use client";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Table, messageOf, useLoad } from "@/components/ui";
import { api, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Device { id: string; name: string; routeId: number | null; status: string; rotation: number; lastSeenAt: string | null; lastSeq: number; fareVersion: number }

export default function Devices() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<{ devices: Device[] }>("/api/devices"));
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<{ id: string; secret: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (d: Device, what: "rotate" | "revoke") => {
    const msg = what === "rotate" ? `Issue a new secret for ${d.id}? The old one stops working at once; the device must be updated.` : `Revoke ${d.id}? It will no longer be able to sync. Use this for a lost or stolen device.`;
    if (!window.confirm(msg)) return;
    try { const r = await api<{ secret?: string }>(`/api/devices/${d.id}/${what}`, { method: "POST" }); if (r.secret) setSecret({ id: d.id, secret: r.secret }); await reload(); } catch (e) { setErr(messageOf(e)); }
  };
  const stale = (d: Device) => !d.lastSeenAt || Date.now() - new Date(d.lastSeenAt).getTime() > 15 * 60_000;

  return (
    <>
      <PageHeader title="Devices" sub="Validators and terminals. Each signs its reports with its own secret." actions={can("OPERATOR") && <Button onClick={() => setAdding(true)}>Register a device</Button>} />
      {(error || err) && <ErrorNote error={(error ?? err)!} retry={reload} />}
      <Card>
        {loading && !data ? <Loading /> : data && (
          <Table rowKey={(d) => d.id} rows={data.devices} empty="No devices registered." cols={[
            { h: "Device", f: (d) => <span className="font-mono">{d.id}</span> }, { h: "Name", f: (d) => d.name }, { h: "Route", f: (d) => d.routeId ?? "—" },
            { h: "Status", f: (d) => <Badge>{d.status}</Badge> },
            { h: "Last seen", f: (d) => <span className={d.status === "ACTIVE" && stale(d) ? "text-amber-700" : ""}>{when(d.lastSeenAt)}</span> },
            { h: "Sent so far", right: true, f: (d) => d.lastSeq }, { h: "Fares v", right: true, f: (d) => d.fareVersion },
            { h: "", f: (d) => (can("OPERATOR") && d.status === "ACTIVE" ? <span className="flex gap-3"><button className="underline" onClick={() => act(d, "rotate")}>New secret</button><button className="text-red-700 underline" onClick={() => act(d, "revoke")}>Revoke</button></span> : can("OPERATOR") ? <button className="underline" onClick={() => act(d, "rotate")}>Re-issue</button> : null) },
          ]} />
        )}
      </Card>
      {adding && <Register onClose={() => setAdding(false)} onDone={async (s) => { setAdding(false); setSecret(s); await reload(); }} />}
      {secret && (
        <Modal title={`Secret for ${secret.id}`} onClose={() => setSecret(null)}>
          <p className="mb-2 text-sm">Copy this into the device&apos;s <code>DEVICE_SECRET</code> setting now. It is not stored anywhere and cannot be shown again.</p>
          <code className="block break-all rounded-md bg-slate-100 p-3 text-xs select-all">{secret.secret}</code>
          <div className="mt-4 flex justify-end"><Button onClick={() => setSecret(null)}>I have copied it</Button></div>
        </Modal>
      )}
    </>
  );
}

function Register({ onClose, onDone }: { onClose(): void; onDone(s: { id: string; secret: string }): void }) {
  const [id, setId] = useState(""); const [name, setName] = useState(""); const [routeId, setRouteId] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const r = await api<{ secret: string }>("/api/devices", { method: "POST", body: { id: id.trim(), name: name.trim(), routeId: routeId ? Number(routeId) : undefined } }); onDone({ id: id.trim(), secret: r.secret }); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Register a device" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorNote error={error} />}
        <Field label="Device id" hint="3 to 32 letters, digits, - or _, for example VAL-0007"><Input required value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bus 12, front door" /></Field>
        <Field label="Route number (optional)"><Input type="number" value={routeId} onChange={(e) => setRouteId(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Registering…" : "Register"}</Button></div>
      </form>
    </Modal>
  );
}
