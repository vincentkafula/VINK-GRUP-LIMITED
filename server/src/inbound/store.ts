import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface InboundEmail {
  id: string; resendId: string; from: string; to: string[]; subject: string;
  text: string | null; html: string | null; receivedAt: string;
}
export type NewInbound = Omit<InboundEmail, "id" | "receivedAt"> & { receivedAt?: string };

export interface InboundStore {
  /** Idempotent on resendId: a repeated delivery of the same email returns false and stores nothing. */
  save(m: NewInbound): Promise<boolean>;
  list(limit: number, offset: number): Promise<InboundEmail[]>;
  get(id: string): Promise<InboundEmail | null>;
}

export class MemoryInboundStore implements InboundStore {
  rows: InboundEmail[] = [];
  async save(m: NewInbound) {
    if (this.rows.some((r) => r.resendId === m.resendId)) return false;
    this.rows.unshift({ ...m, id: randomUUID(), receivedAt: m.receivedAt ?? new Date().toISOString() });
    return true;
  }
  async list(limit: number, offset: number) { return this.rows.slice(offset, offset + limit); }
  async get(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
}

const map = (r: Record<string, unknown>): InboundEmail => ({
  id: r.id as string, resendId: r.resend_id as string, from: r.from_addr as string, to: r.to_addrs as string[],
  subject: r.subject as string, text: (r.text_body as string) ?? null, html: (r.html_body as string) ?? null,
  receivedAt: new Date(r.received_at as string).toISOString(),
});

export class PgInboundStore implements InboundStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async save(m: NewInbound) {
    const r = await this.pool.query(
      `INSERT INTO inbound_emails (id, resend_id, from_addr, to_addrs, subject, text_body, html_body, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now())) ON CONFLICT (resend_id) DO NOTHING`,
      [randomUUID(), m.resendId, m.from, m.to, m.subject, m.text, m.html, m.receivedAt ?? null]);
    return (r.rowCount ?? 0) > 0;
  }
  async list(limit: number, offset: number) {
    const r = await this.pool.query(`SELECT * FROM inbound_emails ORDER BY received_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return r.rows.map(map);
  }
  async get(id: string) {
    const r = await this.pool.query(`SELECT * FROM inbound_emails WHERE id = $1`, [id]);
    return r.rows[0] ? map(r.rows[0]) : null;
  }
}
