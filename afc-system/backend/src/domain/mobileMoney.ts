import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mobile-money providers each sign and shape their callbacks differently. An adapter turns ONE provider's callback into the single event the
 * rest of the system understands, and refuses anything it cannot verify. The system never trusts a callback an adapter did not accept.
 *
 * To add a real provider (MTN MoMo, Airtel Money, Orange, a bank's payment-link service ...):
 *   1. write an adapter below: check the provider's signature/IP rules on the RAW body, map their fields to MobileMoneyEvent;
 *   2. register it in ADAPTERS;
 *   3. set MOBILE_MONEY_PROVIDER=<name> and the provider's shared secret in MOBILE_MONEY_WEBHOOK_SECRET.
 * The reference you return must be the provider's own transaction id: it is the idempotency key, so a retried callback can never credit twice.
 * Amounts are whole cents. The card is identified by the account/reference the passenger entered when paying (the card UID).
 */
export interface MobileMoneyEvent { reference: string; cardUid: string; amount: number; status: "SUCCESS" | "FAILED" }
export interface AdapterInput { headers: Record<string, string | string[] | undefined>; rawBody: string; secret: string }
export interface MobileMoneyAdapter {
  readonly name: string;
  /** The verified event, or null if the signature is wrong or the body is not what this provider sends. Never throws on hostile input. */
  parse(input: AdapterInput): MobileMoneyEvent | null;
}

const header = (h: AdapterInput["headers"], n: string): string => { const v = h[n]; return Array.isArray(v) ? v[0] ?? "" : v ?? ""; };
const eq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const json = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The small signed format used by the tests and the README: HMAC-SHA256 (hex) of the raw body in x-signature, body = the event itself. */
export const genericHmacAdapter: MobileMoneyAdapter = {
  name: "generic",
  parse({ headers, rawBody, secret }) {
    const want = createHmac("sha256", secret).update(rawBody).digest();
    const sig = header(headers, "x-signature");
    if (!/^[0-9a-f]{64}$/i.test(sig) || !eq(Buffer.from(sig, "hex"), want)) return null;
    const b = obj(json(rawBody));
    if (!b || typeof b.reference !== "string" || typeof b.cardUid !== "string" || !Number.isInteger(b.amount) || (b.status !== "SUCCESS" && b.status !== "FAILED")) return null;
    return { reference: b.reference, cardUid: b.cardUid, amount: b.amount as number, status: b.status };
  },
};

/**
 * AN ILLUSTRATION of a differently shaped provider (not a real one): base64 HMAC over `timestamp.body`, a timestamp that must be fresh, nested
 * fields, an amount as a decimal string in rand, and a state word. Shows what a real adapter has to deal with.
 */
export const exampleProviderAdapter: MobileMoneyAdapter = {
  name: "example",
  parse({ headers, rawBody, secret }) {
    const ts = header(headers, "x-example-timestamp"), sig = header(headers, "x-example-signature");
    if (!/^\d{10}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null;
    const want = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
    if (!eq(Buffer.from(sig, "base64"), want)) return null;
    const b = obj(json(rawBody)), t = obj(b?.transaction);
    if (!b || !t || typeof t.id !== "string" || typeof t.account !== "string" || typeof t.amount !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(t.amount)) return null;
    const [r, c = ""] = t.amount.split(".");
    const status = b.state === "COMPLETED" ? "SUCCESS" : b.state === "FAILED" || b.state === "CANCELLED" ? "FAILED" : null;
    return status ? { reference: t.id, cardUid: t.account.toLowerCase(), amount: Number(r) * 100 + Number(c.padEnd(2, "0")), status } : null;
  },
};

export const ADAPTERS: Record<string, MobileMoneyAdapter> = { [genericHmacAdapter.name]: genericHmacAdapter, [exampleProviderAdapter.name]: exampleProviderAdapter };
