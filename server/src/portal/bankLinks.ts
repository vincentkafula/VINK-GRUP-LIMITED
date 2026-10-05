import { Router, json } from "express";
import { h, uid, num, iso, isUuid, fail, isUniqueViolation, pageParams, audit, type Db } from "./common.js";
import { checkHolder, isBankRole, maskNumber, maskRegistration, rulesFor, type BankRole, type Holder, type HolderType } from "./bankRules.js";
import { CryptoUnavailable, type FieldCrypto } from "./fieldCrypto.js";
import { seedEnabled } from "../auth/seedRoleAccounts.js";

/**
 * Bank accounts for the dashboards. Every dashboard user is linked to ONE account held in the Banking module (VINK); this file never
 * keeps a second copy of the account number, balance or transactions: it reads them from the Banking module each time.
 *
 *   GET    /bank                 my link (or none), the rules for my role, and the payment-channel accounts shown on my dashboard
 *   GET    /bank/transactions    my account's recent transactions
 *   POST   /bank/link            link an account: validates the account type for my role, collects business details if needed
 *   PUT    /bank/link            change holder type / business details (validated again)
 *   DELETE /bank/link            remove the link
 *
 * A user can only ever see or change their own link (every query is keyed on the signed-in user). Admins see all links through the admin
 * router below. Every change is written to the audit log with only masked identifiers.
 */

/* ───────────────────────── the Banking module (VINK), seen through a small interface ───────────────────────── */
export interface CoreAccount { id: string; name: string; number: string; kind: string; balanceCents: number }
export interface CoreTransaction { at: string; kind: string; description: string; amountCents: number; balanceCents: number }
export interface BankCore {
  bankName: string; branchCode: string; currency: string;
  ensureMerchant(userId: string, name: string): void;
  accounts(userId: string): CoreAccount[];
  rename(userId: string, accountId: string, name: string): void;
  transactions(userId: string, accountId: string, limit: number): CoreTransaction[];
}

interface ManshyaHandle {
  db: { prepare(sql: string): { get(...a: unknown[]): unknown } };
  services: {
    createMerchant(name: string, o: { id: string }): unknown;
    listAccounts(m: { id: string }): { id: string; name: string; number: string; kind: string; balance: number }[];
    statement(m: { id: string }, accountId: string, q: { limit: number }): { data: { date: string; kind: string; memo: string | null; amount: number; balance: number }[] };
  };
  banking: { renameAccount(m: { id: string }, id: string, name: string): unknown };
  config: { bankName: string; branchCode: string };
}

/** Adapter over the real VINK core (the same instance the payments dashboards use). */
export function manshyaBankCore(mn: ManshyaHandle): BankCore {
  return {
    bankName: mn.config.bankName, branchCode: mn.config.branchCode, currency: "ZAR",
    ensureMerchant(userId, name) { if (!mn.db.prepare("SELECT 1 AS x FROM merchants WHERE id = ?").get(userId)) mn.services.createMerchant(name, { id: userId }); },
    accounts(userId) { return mn.db.prepare("SELECT 1 AS x FROM merchants WHERE id = ?").get(userId) ? mn.services.listAccounts({ id: userId }).map((a) => ({ id: a.id, name: a.name, number: a.number, kind: a.kind, balanceCents: a.balance })) : []; },
    rename(userId, accountId, name) { mn.banking.renameAccount({ id: userId }, accountId, name); },
    transactions(userId, accountId, limit) { return mn.services.statement({ id: userId }, accountId, { limit }).data.map((r) => ({ at: r.date, kind: r.kind, description: r.memo ?? r.kind, amountCents: r.amount, balanceCents: r.balance })); },
  };
}

/* ───────────────────────── payment channels (their accounts already exist; this only shows them) ───────────────────────── */
export type Channel = "online" | "in_person";
export const CHANNEL_LABEL: Record<Channel, string> = { online: "Online Payment", in_person: "In-Person Payment" };
/** Which dashboards show which channel account (an assumption to confirm: channels that move that role's money). */
export const CHANNELS_BY_ROLE: Record<BankRole, Channel[]> = {
  driver: ["in_person"], marshal: [], investor: ["in_person"], vehicle_owner: ["in_person", "online"], association: ["in_person", "online"],
};
export interface ChannelAccount { accountNumber: string; holder: string; bank: string; type: "Personal" | "Business" }

/**
 * The existing channel accounts come from PAYMENT_CHANNEL_ACCOUNTS (JSON): {"online":{"accountNumber":"…","holder":"…","bank":"…","type":"Business"},"in_person":{…}}.
 * Nothing is created from here. Invalid entries are ignored (and reported once in the log) so a typo cannot break a dashboard.
 */
export function readChannelAccounts(env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = console.warn): Partial<Record<Channel, ChannelAccount>> {
  const raw = env.PAYMENT_CHANNEL_ACCOUNTS?.trim();
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { warn("[bank] PAYMENT_CHANNEL_ACCOUNTS is not valid JSON; ignored"); return {}; }
  const out: Partial<Record<Channel, ChannelAccount>> = {};
  for (const ch of ["online", "in_person"] as const) {
    const c = (parsed as Record<string, Record<string, unknown>> | null)?.[ch];
    if (!c) continue;
    const ok = typeof c.accountNumber === "string" && /^\d{6,20}$/.test(c.accountNumber) && typeof c.holder === "string" && c.holder.trim() && typeof c.bank === "string" && c.bank.trim() && (c.type === "Personal" || c.type === "Business");
    if (!ok) { warn(`[bank] PAYMENT_CHANNEL_ACCOUNTS.${ch} is incomplete (needs accountNumber 6-20 digits, holder, bank, type Personal|Business); ignored`); continue; }
    out[ch] = { accountNumber: c.accountNumber as string, holder: String(c.holder).trim(), bank: String(c.bank).trim(), type: c.type as "Personal" | "Business" };
  }
  return out;
}

/* ───────────────────────── presentation ───────────────────────── */
interface LinkRow { id: string; user_id: string; manshya_account_id: string; holder_type: HolderType; business_name_enc: string | null; registration_number_enc: string | null; status: string; reviewed_by: string | null; reviewed_at: unknown; review_note: string | null; created_at: unknown; updated_at: unknown }
const TYPE_LABEL: Record<HolderType, "Personal" | "Business"> = { personal: "Personal", business: "Business" };

export interface Deps { db: Db; core: BankCore; crypto: FieldCrypto; channels?: () => Partial<Record<Channel, ChannelAccount>> }

async function userName(db: Db, id: string): Promise<string> {
  const r = (await db.query(`SELECT name FROM users WHERE id = $1`, [id])).rows[0];
  return String(r?.name ?? "Account holder");
}

async function present(d: Deps, link: LinkRow) {
  const acct = d.core.accounts(link.user_id).find((a) => a.id === link.manshya_account_id) ?? null;
  const business = link.holder_type === "business";
  const businessName = business && link.business_name_enc ? d.crypto.decrypt(link.business_name_enc) : null;
  return {
    id: link.id, status: link.status, reviewNote: link.review_note ?? null, updatedAt: iso(link.updated_at),
    holderName: businessName ?? (await userName(d.db, link.user_id)),
    accountType: TYPE_LABEL[link.holder_type], holderType: link.holder_type,
    businessName, registrationNumber: business && link.registration_number_enc ? d.crypto.decrypt(link.registration_number_enc) : null,
    bankName: d.core.bankName, branchCode: d.core.branchCode, currency: d.core.currency,
    accountMissing: !acct,
    accountNumber: acct?.number ?? null, accountName: acct?.name ?? null, accountKind: acct?.kind ?? null, accountId: link.manshya_account_id,
    balance: acct ? num(acct.balanceCents) / 100 : null,
  };
}

const getLink = async (db: Db, userId: string) => ((await db.query(`SELECT * FROM bank_account_links WHERE user_id = $1`, [userId])).rows[0] as unknown as LinkRow | undefined) ?? null;

/** Business details are stored encrypted. Returns the encrypted pair, or an error response for the caller to send. */
function sealHolder(crypto: FieldCrypto, v: Holder): { name: string | null; reg: string | null } {
  return v.holderType === "business" ? { name: crypto.encrypt(v.businessName!), reg: crypto.encrypt(v.registrationNumber!) } : { name: null, reg: null };
}
const cryptoDown = (res: Parameters<typeof fail>[0]) => fail(res, 503, "Business details cannot be saved yet because encryption is not configured on the server. Please contact support.");

/* ───────────────────────── the dashboards' router (mounted at /api/portal/<role>/bank) ───────────────────────── */
export function createBankRouter(d: Deps, role: BankRole): Router {
  const router = Router();
  const body = json({ limit: "10kb" });
  const channels = d.channels ?? (() => readChannelAccounts());

  router.get("/", h(async (req, res) => {
    const me = uid(req), link = await getLink(d.db, me);
    const cfg = channels();
    const channelCards = CHANNELS_BY_ROLE[role].map((c) => ({ channel: c, label: CHANNEL_LABEL[c], configured: !!cfg[c], ...(cfg[c] ?? {}) }));
    res.json({
      success: true, role, rules: rulesFor(role), channels: channelCards,
      link: link ? await present(d, link) : null,
      // Accounts of mine in the Banking module that could be linked (only while nothing is linked yet).
      accounts: link ? [] : d.core.accounts(me).map((a) => ({ id: a.id, name: a.name, kind: a.kind, number: a.number })),
    });
  }));

  router.get("/transactions", h(async (req, res) => {
    const link = await getLink(d.db, uid(req));
    if (!link) { fail(res, 404, "No bank account linked yet"); return; }
    const { limit } = pageParams(req, 15, 50);
    res.json({ success: true, currency: d.core.currency, transactions: d.core.transactions(link.user_id, link.manshya_account_id, limit).map((t) => ({ at: t.at, type: t.kind, description: t.description, amount: t.amountCents / 100, balance: t.balanceCents / 100 })) });
  }));

  router.post("/link", body, h(async (req, res) => {
    const me = uid(req);
    if (await getLink(d.db, me)) { fail(res, 409, "You already have a linked bank account. Edit it or remove it first."); return; }
    const c = checkHolder(role, req.body ?? {});
    if (!c.ok) { res.status(c.status).json({ success: false, error: c.message, code: c.code }); return; }

    let sealed: { name: string | null; reg: string | null };
    try { sealed = sealHolder(d.crypto, c.value); } catch (e) { if (e instanceof CryptoUnavailable) { cryptoDown(res); return; } throw e; }

    d.core.ensureMerchant(me, await userName(d.db, me));                          // the Banking module opens the account holder's first account
    const mine = d.core.accounts(me);
    const wanted = req.body?.accountId;
    const acct = wanted === undefined || wanted === null || wanted === "" ? (mine.find((a) => a.kind === "current") ?? mine[0]) : mine.find((a) => a.id === wanted);
    if (!acct) { fail(res, 400, "That account was not found in your Banking profile."); return; }
    if (c.value.holderType === "personal" && acct.name === "Business current") d.core.rename(me, acct.id, "Personal current");

    const status = c.value.holderType === "business" ? "pending_review" : "verified";     // personal: the account is the user's own; business: an admin checks the details
    try {
      await d.db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, business_name_enc, registration_number_enc, status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [me, acct.id, c.value.holderType, sealed.name, sealed.reg, status]);
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "That account is already linked."); return; } throw e; }
    await audit(d.db, req, "bank.link.create", null, { role, holderType: c.value.holderType, account: maskNumber(acct.number), registration: maskRegistration(c.value.registrationNumber), status });
    res.status(201).json({ success: true, link: await present(d, (await getLink(d.db, me))!) });
  }));

  router.put("/link", body, h(async (req, res) => {
    const me = uid(req), cur = await getLink(d.db, me);
    if (!cur) { fail(res, 404, "No bank account linked yet"); return; }
    const c = checkHolder(role, req.body ?? {});
    if (!c.ok) { res.status(c.status).json({ success: false, error: c.message, code: c.code }); return; }

    let sealed: { name: string | null; reg: string | null };
    try { sealed = sealHolder(d.crypto, c.value); } catch (e) { if (e instanceof CryptoUnavailable) { cryptoDown(res); return; } throw e; }
    const before = await present(d, cur);

    // Changing to a Business account, or changing a Business account's name or number, needs a fresh review. Personal is the user's own account.
    const detailsChanged = c.value.holderType === "business" && (before.businessName !== c.value.businessName || before.registrationNumber !== c.value.registrationNumber || cur.holder_type !== "business");
    const status = c.value.holderType === "personal" ? "verified" : detailsChanged ? "pending_review" : cur.status;
    const resetReview = detailsChanged || c.value.holderType === "personal";            // a previous approval or rejection no longer applies
    await d.db.query(
      `UPDATE bank_account_links SET holder_type = $2, business_name_enc = $3, registration_number_enc = $4, status = $5, reviewed_by = $6, reviewed_at = $7, review_note = $8, updated_at = now() WHERE user_id = $1`,
      [me, c.value.holderType, sealed.name, sealed.reg, status, resetReview ? null : cur.reviewed_by, resetReview ? null : cur.reviewed_at, resetReview ? null : cur.review_note]);
    await audit(d.db, req, "bank.link.update", null, {
      role, account: before.accountNumber ? maskNumber(before.accountNumber) : null,
      from: { holderType: before.holderType, registration: maskRegistration(before.registrationNumber), status: before.status },
      to: { holderType: c.value.holderType, registration: maskRegistration(c.value.registrationNumber), status },
    });
    res.json({ success: true, link: await present(d, (await getLink(d.db, me))!) });
  }));

  router.delete("/link", h(async (req, res) => {
    const me = uid(req), cur = await getLink(d.db, me);
    if (!cur) { fail(res, 404, "No bank account linked yet"); return; }
    const before = await present(d, cur);
    await d.db.query(`DELETE FROM bank_account_links WHERE user_id = $1`, [me]);
    await audit(d.db, req, "bank.link.remove", null, { role, account: before.accountNumber ? maskNumber(before.accountNumber) : null, holderType: before.holderType });
    res.json({ success: true });
  }));

  return router;
}

/* ───────────────────────── admin: every link, and review of business accounts (mounted at /api/admin/bank-links) ───────────────────────── */
export function createBankAdminRouter(d: Deps): Router {
  const router = Router();
  const body = json({ limit: "10kb" });

  router.get("/", h(async (req, res) => {
    const args: unknown[] = [];
    let where = "TRUE";
    const role = typeof req.query.role === "string" ? req.query.role : "";
    if (role) { if (!isBankRole(role)) { fail(res, 400, "Unknown role"); return; } args.push(role); where += ` AND u.role = $${args.length}`; }
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status) { if (!["verified", "pending_review", "rejected"].includes(status)) { fail(res, 400, "Unknown status"); return; } args.push(status); where += ` AND l.status = $${args.length}`; }
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80).toLowerCase() : "";
    if (q) { args.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where += ` AND (lower(u.name) LIKE $${args.length} OR lower(u.email) LIKE $${args.length})`; }
    const total = num((await db().query(`SELECT COUNT(*) AS n FROM bank_account_links l JOIN users u ON u.id = l.user_id WHERE ${where}`, args)).rows[0]?.n);
    const { limit, offset } = pageParams(req, 25, 100);
    const rows = (await db().query(`SELECT l.*, u.name AS user_name, u.email AS user_email, u.role AS user_role FROM bank_account_links l JOIN users u ON u.id = l.user_id WHERE ${where} ORDER BY (l.status = 'pending_review') DESC, l.updated_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset])).rows;
    const out = [];
    for (const r of rows) out.push({ user: { id: r.user_id, name: r.user_name, email: r.user_email, role: r.user_role }, ...(await present(d, r as unknown as LinkRow)) });
    await audit(d.db, req, "bank.admin.list", null, { rows: out.length, role: role || undefined, status: status || undefined });
    res.json({ success: true, total, limit, offset, links: out });
  }));
  const db = () => d.db;

  router.post("/:id/review", body, h(async (req, res) => {
    if (!isUuid(req.params.id) || typeof req.body?.approve !== "boolean") { fail(res, 400, "A link id and approve (true or false) are required"); return; }
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : null;
    if (req.body.approve === false && !note) { fail(res, 400, "Please give a reason when rejecting, so the user can fix it."); return; }
    const to = req.body.approve ? "verified" : "rejected";
    const r = await d.db.query(`UPDATE bank_account_links SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now() WHERE id = $1 AND holder_type = 'business' RETURNING user_id`, [req.params.id, to, uid(req), note]);
    if (!r.rows.length) { fail(res, 404, "Business link not found (only Business accounts are reviewed)"); return; }
    await audit(d.db, req, `bank.admin.${req.body.approve ? "approve" : "reject"}`, req.params.id, { note });
    res.json({ success: true, status: to });
  }));

  return router;
}

/* ───────────────────────── test data (same switch as the test accounts) ───────────────────────── */
const SEED: { env: string; role: BankRole; holder: Holder }[] = [
  { env: "SEED_DRIVER_EMAIL", role: "driver", holder: { holderType: "personal", businessName: null, registrationNumber: null } },
  { env: "SEED_MARSHAL_EMAIL", role: "marshal", holder: { holderType: "personal", businessName: null, registrationNumber: null } },
  { env: "SEED_INVESTOR_EMAIL", role: "investor", holder: { holderType: "personal", businessName: null, registrationNumber: null } },
  { env: "SEED_OWNER_EMAIL", role: "vehicle_owner", holder: { holderType: "business", businessName: "Test Owner (Pty) Ltd", registrationNumber: "2015/123456/07" } },
  { env: "SEED_ASSOCIATION_EMAIL", role: "association", holder: { holderType: "business", businessName: "Test Association NPC", registrationNumber: "2019/123456/08" } },
];
/** Links each seeded test account to a Banking-module account (verified), so every dashboard has a real account to show. Idempotent. */
export async function seedBankLinks(d: Deps, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log): Promise<void> {
  if (!seedEnabled(env)) return;
  let made = 0;
  for (const s of SEED) {
    const email = env[s.env]?.trim().toLowerCase();
    if (!email) continue;
    const u = (await d.db.query(`SELECT id, name FROM users WHERE lower(email) = $1 AND role = $2 LIMIT 1`, [email, s.role])).rows[0];
    if (!u || (await getLink(d.db, String(u.id)))) continue;
    const c = checkHolder(s.role, s.holder);
    if (!c.ok) continue;
    d.core.ensureMerchant(String(u.id), String(u.name));
    const acct = d.core.accounts(String(u.id)).find((a) => a.kind === "current");
    if (!acct) continue;
    if (c.value.holderType === "personal" && acct.name === "Business current") d.core.rename(String(u.id), acct.id, "Personal current");
    const sealed = sealHolder(d.crypto, c.value);
    await d.db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, business_name_enc, registration_number_enc, status) VALUES ($1,$2,$3,$4,$5,'verified')`, [u.id, acct.id, c.value.holderType, sealed.name, sealed.reg]);
    made++;
  }
  if (made) log(`[seed] linked ${made} test account(s) to Banking-module accounts`);
}

