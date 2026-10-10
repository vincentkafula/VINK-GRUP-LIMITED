import { createHmac, timingSafeEqual } from "crypto";

/**
 * WhatsApp Business Platform (Cloud API) from Meta.
 *   WHATSAPP_PHONE_NUMBER_ID   the id of VINK's WhatsApp number (not the phone number itself)
 *   WHATSAPP_TOKEN             a permanent system-user token with the whatsapp_business_messaging permission
 *   WHATSAPP_VERIFY_TOKEN      any secret text; typed into Meta when the webhook is set up
 *   META_APP_SECRET            the app secret: every message Meta sends us is signed with it, and a message with a bad signature is refused
 *   WHATSAPP_NUMBER            the number as the public dials it, digits only with the country code (27821234567): for the Chat on WhatsApp button and QR code
 *   WHATSAPP_REOPEN_TEMPLATE   (optional) the name of an approved message template used to start a conversation again after the 24-hour window has closed
 * Every call returns { ok, id } or { ok: false, error }; the token never appears in an error.
 */
export interface WaConfig { phoneNumberId: string; token: string; verifyToken: string; appSecret: string; number: string; reopenTemplate: string; reopenLanguage: string; graphVersion: string }

export function waConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WaConfig {
  const v = (k: string) => env[k]?.trim() || "";
  return {
    phoneNumberId: v("WHATSAPP_PHONE_NUMBER_ID"), token: v("WHATSAPP_TOKEN"), verifyToken: v("WHATSAPP_VERIFY_TOKEN"), appSecret: v("META_APP_SECRET") || v("WHATSAPP_APP_SECRET"),
    number: v("WHATSAPP_NUMBER").replace(/\D+/g, ""), reopenTemplate: v("WHATSAPP_REOPEN_TEMPLATE"), reopenLanguage: v("WHATSAPP_REOPEN_LANGUAGE") || "en", graphVersion: v("META_GRAPH_VERSION") || "v21.0",
  };
}
/** Whether VINK can send and receive: the number and token, and the app secret to check what Meta sends. */
export const waReady = (c: WaConfig) => !!(c.phoneNumberId && c.token && c.appSecret);

/** True when the X-Hub-Signature-256 header matches the body, signed with the app secret. */
export function verifyWaSignature(raw: Buffer, header: unknown, secret: string): boolean {
  if (!secret || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  const want = createHmac("sha256", secret).update(raw).digest();
  let got: Buffer; try { got = Buffer.from(header.slice(7), "hex"); } catch { return false; }
  return got.length === want.length && timingSafeEqual(got, want);
}

export type WaResult = { ok: true; id: string } | { ok: false; error: string };

export function createWaClient(deps: { config: WaConfig; fetchImpl?: typeof fetch }) {
  const { config } = deps, doFetch = deps.fetchImpl ?? fetch;
  async function send(payload: Record<string, unknown>): Promise<WaResult> {
    if (!waReady(config)) return { ok: false, error: "WhatsApp is not set up (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN and META_APP_SECRET)" };
    try {
      const res = await doFetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...payload }) });
      const j = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok || j.error) return { ok: false, error: `${j.error?.message ?? `WhatsApp answered ${res.status}`}${j.error?.code ? ` (code ${j.error.code})` : ""}`.split(config.token).join("[token]").slice(0, 300) };
      const id = j.messages?.[0]?.id; return id ? { ok: true, id } : { ok: false, error: "WhatsApp did not return a message id" };
    } catch (e) { return { ok: false, error: `Could not reach WhatsApp: ${e instanceof Error ? e.message : "network error"}`.split(config.token).join("[token]").slice(0, 300) }; }
  }
  return {
    sendText: (to: string, body: string) => send({ to, type: "text", text: { body: body.slice(0, 4096), preview_url: false } }),
    sendTemplate: (to: string, name: string, language: string, params: string[] = []) => send({ to, type: "template", template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p.slice(0, 1000) })) }] } : {}) } }),
    markRead: async (messageId: string): Promise<void> => { await send({ status: "read", message_id: messageId }).catch(() => undefined); },
  };
}
export type WaClient = ReturnType<typeof createWaClient>;
