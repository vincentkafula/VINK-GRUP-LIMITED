import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { departmentOfAddresses } from "../config/departments.js";

export interface InboundEmail {
  id: string; resendId: string; from: string; to: string[]; subject: string; /** The department the email was addressed to (null if none of ours). */ department: string | null;
  text: string | null; html: string | null; receivedAt: string;
}
export type NewInbound = Omit<InboundEmail, "id" | "receivedAt" | "department"> & { receivedAt?: string };

export interface InboundStore {
  /** Idempotent on resendId: a repeated delivery of the same email returns false and stores nothing. */
  save(m: NewInbound): Promise<boolean>;
  list(limit: number, offset: number, department?: string): Promise<InboundEmail[]>;
  get(id: string): Promise<InboundEmail | null>;
  /** The id and department of the stored email that came with this Resend id (so its attachments can be recorded against it). */
  find(resendId: string): Promise<{ id: string; department: string | null } | null>;
}

export class MemoryInboundStore implements InboundStore {
  rows: InboundEmail[] = [];
  async save(m: NewInbound) {
    if (this.rows.some((r) => r.resendId === m.resendId)) return false;
    this.rows.unshift({ ...m, department: departmentOfAddresses(m.to)?.key ?? null, id: randomUUID(), receivedAt: m.receivedAt ?? new Date().toISOString() });
    return true;
  }
  async list(limit: number, offset: number, department?: string) { return this.rows.filter((r) => !department || r.department === department).slice(offset, offset + limit); }
  async get(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async find(resendId: string) { const r = this.rows.find((x) => x.resendId === resendId); return r ? { id: r.id, department: r.department } : null; }
}

const map = (r: Record<string, unknown>): InboundEmail => ({
  id: r.id as string, resendId: r.resend_id as string, from: r.from_addr as string, to: r.to_addrs as string[],
  subject: r.subject as string, department: (r.department as string) ?? null, text: (r.text_body as string) ?? null, html: (r.html_body as string) ?? null,
  receivedAt: new Date(r.received_at as string).toISOString(),
});

export class PgInboundStore implements InboundStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async save(m: NewInbound) {
    const r = await this.pool.query(
      `INSERT INTO inbound_emails (id, resend_id, from_addr, to_addrs, subject, text_body, html_body, received_at, department)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now()),$9) ON CONFLICT (resend_id) DO NOTHING`,
      [randomUUID(), m.resendId, m.from, m.to, m.subject, m.text, m.html, m.receivedAt ?? null, departmentOfAddresses(m.to)?.key ?? null]);
    return (r.rowCount ?? 0) > 0;
  }
  async list(limit: number, offset: number, department?: string) {
    const r = department
      ? await this.pool.query(`SELECT * FROM inbound_emails WHERE department = $3 ORDER BY received_at DESC LIMIT $1 OFFSET $2`, [limit, offset, department])
      : await this.pool.query(`SELECT * FROM inbound_emails ORDER BY received_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return r.rows.map(map);
  }
  async get(id: string) {
    const r = await this.pool.query(`SELECT * FROM inbound_emails WHERE id = $1`, [id]);
    return r.rows[0] ? map(r.rows[0]) : null;
  }
  async find(resendId: string) {
    const r = await this.pool.query(`SELECT id, department FROM inbound_emails WHERE resend_id = $1`, [resendId]);
    return r.rows[0] ? { id: r.rows[0].id as string, department: (r.rows[0].department as string) ?? null } : null;
  }
}
