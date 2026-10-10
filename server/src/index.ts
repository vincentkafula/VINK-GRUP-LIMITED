import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { requestLogger } from "./middleware/logger.js";
import { createDbAuthRouter, createMemoryAuthRouter } from "./auth/instance.js";
import { createOriginPolicy } from "./auth/origins.js";
import { LiveHub, type VerifiedToken } from "./services/liveHub.js";
import jwt from "jsonwebtoken";
import fraudRiskRouter from "./routes/fraudRiskRouter.js";
import terminalRouter from "./routes/terminalRouter.js";
import { createTokenService } from "./services/tokenService.js";
import { createTokenTerminalRouter, createTokenAdminRouter, createTokenRetailRouter } from "./portal/tokenRoutes.js";
import { authenticateRetailTerminal } from "./services/retailAuth.js";
import { getCardRail, getAccountValidationProvider, getIssuingProvider } from "./payments/providers/registry.js";
import { authenticateTerminal } from "./services/terminalAuth.js";
import retailRouter from "./routes/retailRouter.js";
import routeRouter from "./routes/routeRouter.js";
import bankAccountsRouter from "./routes/bankAccounts.js";
import bankCardsRouter from "./routes/bankCards.js";
import bankPaymentsRouter from "./routes/bankPayments.js";
import bankTreasuryRouter from "./routes/bankTreasury.js";
import bankComplianceRouter from "./routes/bankCompliance.js";
import bankUsersRouter from "./routes/bankUsers.js";
import geoCurrencyRouter from "./routes/geoCurrency.js";
import rbacRouter, { MODULE_SECTIONS } from "./routes/rbac.js";
import { createDepartmentsRouter, loadCustomDepartments } from "./routes/departmentsRouter.js";
import { setBroadcaster } from "./services/wsBroadcast.js";
import applicationsRouter from "./routes/applicationsRouter.js";
import otpRouter from "./routes/otpRouter.js";
import jobsRouter from "./routes/jobsRouter.js";
import mastercardRouter from "./routes/mastercard.js";
import visaRouter from "./routes/visa.js";
import publicRouter from "./routes/public.js";
import globalBankingRouter from "./routes/globalBanking.js";
import financialReportsRouter from "./routes/financialReports.js";
import levySystemRouter from "./routes/levySystem.js";
import afcRouter from "./routes/afc.js";
import { createManshyaModule } from "./manshya/mount.js";
import { createPaymentsSandboxRouter } from "./payments/sandboxRoutes.js";
import { createIssuerRouter, type TokenCardAuthoriser } from "./payments/issuerRoutes.js";
import { createPaymentologyFastRouter } from "./payments/paymentologyFast.js";
import { createOpsMonitor, sinksFromEnv } from "./services/opsMonitor.js";
import { SandboxHostedFields, createSandboxVaultRouter } from "./payments/providers/hostedFields.js";
import { MOCK_CARD_SCENARIOS } from "./payments/providers/mockCardRail.js";
import { listedOrigins } from "./auth/origins.js";
import { createSchemeSettlement } from "./services/schemeSettlement.js";
import { createOpsAdminRouter } from "./routes/opsAdminRouter.js";
import { createContactService } from "./services/contactService.js";
import { createContactRouter, createContactAdminRouter } from "./routes/contactRouter.js";
import { createMailService } from "./services/mailService.js";
import { createMailRouter, createShareRouter } from "./routes/mailRouter.js";
import { createMailFiles } from "./services/mailFiles.js";
import { createScanner } from "./services/fileScan.js";
import { liveStartBlockers } from "./payments/goLive.js";
import { createEmailSender } from "./auth/email.js";
import { hasDb, pool } from "./db/pool.js";
import { migrateAndSeed } from "./db/migrate.js";
import { requireAuth, requireRole, JWT_SECRET } from "./middleware/auth.js";
import { createPortalRouter } from "./routes/portal.js";
import { createBankAdminRouter, manshyaBankCore, seedBankLinks, readChannelAccounts } from "./portal/bankLinks.js";
import { syncManshyaFees } from "./config/manshyaFeeSync.js";
import { createMoneyEngine, manshyaLedgerPort, walletLedgerAccount } from "./services/moneyEngine.js";
import { createLimitGuard } from "./config/limitGuard.js";
import { createCrossBorder } from "./services/crossBorderService.js";
import { createBankFeedRouter } from "./routes/bankFeed.js";
import { refreshRates, ratesAreFresh } from "./services/fxRates.js";
import { createPooledStore } from "./portal/pooledAccounts.js";
import { checkReadiness } from "./config/readiness.js";
import { reserveAccount } from "./services/poolService.js";
import type { CountryConfig } from "./config/countryConfig.js";
import { createMoneyAdminRouter } from "./routes/moneyAdminRouter.js";
import { createFieldCrypto } from "./portal/fieldCrypto.js";
import { createConfigAdminRouter, createConfigReader } from "./config/configService.js";
import { createInboundRouter } from "./inbound/router.js";
import { createMetaClient, metaConfigFromEnv } from "./services/social/meta.js";
import { createSocialService } from "./services/social/socialService.js";
import { createSocialRouter } from "./routes/socialRouter.js";
import { waConfigFromEnv, createWaClient } from "./services/whatsapp/cloud.js";
import { createWhatsAppService } from "./services/whatsapp/whatsappService.js";
import { createWhatsAppWebhookRouter, createWhatsAppInfoRouter, createWhatsAppRouter } from "./routes/whatsappRouter.js";
import { PgInboundStore, MemoryInboundStore } from "./inbound/store.js";

const PORT = Number(process.env.PORT) || 3001;

// Which browser origins may call the API. Explicit allow-list only (the production sites, ALLOWED_ORIGINS, FRONTEND_URL); the old
// "any *.up.railway.app" rule is gone. See auth/origins.ts.
const isAllowedOrigin = createOriginPolicy();

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1); // trust exactly one hop (Railway's edge) for correct client IP; `true` trusts every hop unconditionally, which is a rate-limit bypass vector

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true }));

// Rate limiting — 300 req/min per IP, general baseline for the whole API
app.use("/api", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// VINK payments & banking. Mounted BEFORE the global JSON parser on purpose: its
// gateway webhooks need the raw request body to verify signatures, and its document
// upload route accepts larger bodies than the 1mb default below. The module applies
// its own body limits. Access is by login: customers get the dashboard API, staff the
// back office (see manshya/access.ts).
const manshya = createManshyaModule();
app.use("/api/manshya", manshya.router);
// Card issuer-processor real-time authorisations (raw body needed for the signature, so also before the JSON parser).
// VINK token cards are decided by the token service, which is created further down; the issuer endpoint asks it through this bridge when a request arrives.
const tokenCardsBridge: TokenCardAuthoriser = { authorise: async (a) => (tokenService ? tokenService.authoriseCardSpend(a) : null), reverse: async (a) => (tokenService ? tokenService.reverseCardSpend(a) : null), isActive: async (p, c) => (tokenService ? tokenService.cardIsActive(p, c) : null) };
app.use("/api/payments/issuer", createIssuerRouter(manshya.payments, manshya, tokenCardsBridge));
app.use("/api/payments/issuer", createPaymentologyFastRouter({ tokens: tokenCardsBridge, secret: process.env.PAYMENTOLOGY_FAST_SECRET?.trim() || null }));


// Files in department mail: attachments of incoming email, files staff attach, and the expiring links for big ones (services/mailFiles.ts).
const mailEmail = createEmailSender();
const mailFiles = pool ? createMailFiles({ db: pool, apiKey: process.env.RESEND_API_KEY?.trim() || undefined, scanner: createScanner(process.env) }) : undefined;

const mailService = pool ? createMailService({ db: pool, mail: mailEmail, files: mailFiles }) : undefined;
// Emails scheduled to be sent later: send the ones that are due, every 30 seconds (and once shortly after start-up, for any missed during a restart).
if (mailService && process.env.NODE_ENV !== "test") {
  const tick = () => mailService.sendDue().catch((e) => console.error("[mail] scheduled send failed:", e instanceof Error ? e.message : e));
  setTimeout(tick, 15_000).unref(); setInterval(tick, 30_000).unref();
}

// Posts to Facebook, Instagram and Threads, by hand or automatic (services/social). Scheduled and automatic posts are sent by a worker that runs every minute.
const metaConfig = metaConfigFromEnv();
const socialService = pool ? createSocialService({ db: pool, meta: createMetaClient({ config: metaConfig }), config: metaConfig }) : undefined;
if (socialService && process.env.NODE_ENV !== "test") {
  const tick = () => socialService.tick().catch((e) => console.error("[social] worker failed:", e instanceof Error ? e.message : e));
  setTimeout(tick, 20_000).unref(); setInterval(tick, 60_000).unref();
}

// Customer chat on WhatsApp (services/whatsapp): Meta calls the webhook (raw body for its signature, so before the JSON parser); staff answer from the Management Panel.
const waConfig = waConfigFromEnv();
const whatsappService = pool && mailService ? createWhatsAppService({ db: pool, wa: createWaClient({ config: waConfig }), config: waConfig, departmentsFor: (u) => mailService.departmentsFor(u) }) : undefined;
if (whatsappService) app.use("/api/webhooks/whatsapp", createWhatsAppWebhookRouter({ svc: whatsappService, config: waConfig }));
app.use("/api/whatsapp", createWhatsAppInfoRouter({ config: waConfig }));

// Incoming email from Resend (raw body for the signature check, so also before the JSON parser). Staff-only list endpoints.
app.use("/api/inbound", createInboundRouter({
  files: mailFiles,
  onStored: mailService ? (id) => mailService.fileNewEmail(id) : undefined,
  store: pool ? new PgInboundStore(pool) : new MemoryInboundStore(),
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || undefined,
  apiKey: process.env.RESEND_API_KEY?.trim() || undefined,
  guard: [requireAuth, requireRole("owner", "superadmin")],
}));

// The bank's signed feed of credits to the pooled accounts: raw body for the signature, so also before the JSON parser. Wired up below once the money engine exists.
const bankFeed: { router?: express.Router } = {};
app.use("/api/webhooks/bank-credits", (req, res, next) => (bankFeed.router ? bankFeed.router(req, res, next) : next()));

app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);


// Auth-specific rate limiting — the general limit above is 100x too
// permissive to slow down credential-guessing (300 login attempts/min
// is no protection at all). 10 attempts per 15 minutes per IP is tight
// enough to make brute-forcing impractical while still allowing a
// legitimate user who mistypes their password a few times to recover
// without waiting long. Counts successful requests too (not just
// failures) deliberately -- an attacker who succeeds on attempt 3
// still consumed 3 of the 10, so the window can't be gamed by mixing
// in occasional valid logins.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many attempts. Please wait 15 minutes and try again." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/change-password", authLimiter);
// Emailed-link and token endpoints: tight enough to stop guessing and email flooding, loose enough for normal use.
app.use(["/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/verify-email", "/api/auth/resend-verification"],
  rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: "Too many attempts. Please wait 15 minutes and try again." } }));
app.use("/api/auth/refresh", rateLimit({ windowMs: 15 * 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ─── Routes ──────────────────────────────────────────────────────────────────
// Writes through the role dashboards are throttled per client (reads are not): 120 changes a minute is far above real use.
app.use("/api/portal", rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false, skip: (req) => req.method === "GET" }));
// Bank accounts for the dashboards: the Banking module (VINK) is the single source of truth for numbers, balances and transactions.
const pooled = createPooledStore(pool);
const bankDeps = { core: manshyaBankCore(manshya), crypto: createFieldCrypto(process.env, JWT_SECRET), channels: () => pooled.forCurrency("ZAR") };
// Country configuration (staff only; changes are maker-checked). `configReader` serves the active profile to the rest of the platform.
export const configReader = createConfigReader(pool);
// The money engine and the pooled-account tools share one ledger port. The Banking module asks the limit guard before it sends money out, using a cached copy of the active ZA profile.
const moneyLedger = manshyaLedgerPort(manshya as never);
// VINK tokens (the closed-loop points system): a holder with a token wallet is paid in, and pays out of, tokens everywhere the engine moves money.
const cardRail = getCardRail(manshya.payments);
const cardIssuer = getIssuingProvider(manshya.payments);
let opsMonitor: ReturnType<typeof createOpsMonitor> | null = null;
const gateContext = () => ({ cfg: manshya.payments, fastSecretSet: !!process.env.PAYMENTOLOGY_FAST_SECRET?.trim(), alertSinks: opsMonitor?.sinkNames().length ?? 0 });
// Card numbers are entered in a separate card form (the processor's hosted fields; in the sandbox, a stand-in page) so they never reach VINK's page or API.
const sandboxMode = manshya.payments.mode === "sandbox";
const hostedFields = sandboxMode ? new SandboxHostedFields(cardRail.vault, new Set([...MOCK_CARD_SCENARIOS.map((c) => c.pan), ...(manshya.payments.visaDirect?.extraTestPans ?? [])])) : null;
if (hostedFields) app.use("/api/payments/sandbox-vault", createSandboxVaultRouter(hostedFields, listedOrigins()));          // sandbox only: stands in for the processor's card form
const tokenService = pool ? createTokenService({ externalPayouts: manshya.payments.externalPayouts, hosted: hostedFields ?? undefined, acceptRawCardNumbers: sandboxMode, db: pool, ledger: moneyLedger, reader: configReader, rail: cardRail, validator: getAccountValidationProvider(manshya.payments), extraTestPans: manshya.payments.visaDirect?.extraTestPans, issuer: cardIssuer }) : null;
const moneyEngine = pool ? createMoneyEngine({ db: pool, ledger: moneyLedger, reader: configReader, tokenParty: tokenService?.partyOf }) : null;
if (moneyEngine) tokenService?.bindEngine(moneyEngine);
let zaProfile: CountryConfig | null = null;
(manshya.config as unknown as { limitGuard: unknown }).limitGuard = createLimitGuard(() => zaProfile);
const crossBorder = moneyEngine && pool ? createCrossBorder({ db: pool, ledger: moneyLedger, engine: moneyEngine, reader: configReader }) : undefined;
if (moneyEngine) bankFeed.router = createBankFeedRouter({ deps: { db: pool!, ledger: moneyLedger, engine: moneyEngine, reader: configReader }, secret: process.env.BANK_WEBHOOK_SECRET?.trim() || undefined });
const channelAccounts = () => pooled.forCurrency("ZAR");
app.use("/api/portal",        createPortalRouter(pool, bankDeps, {
  channels: (currency) => pooled.forCurrency(currency), crossBorder, tokens: tokenService ?? undefined,
  wallets: (userId) => { const b = moneyLedger.balance(walletLedgerAccount("ZMW", userId)); return b ? [{ currency: "ZMW", balanceCents: b }] : []; },
}));
if (pool) app.use("/api/admin/departments", requireAuth, requireRole("owner", "superadmin"), createDepartmentsRouter({ db: pool, moduleSections: MODULE_SECTIONS }));
if (pool) app.use("/api/admin/money", requireAuth, requireRole("owner", "superadmin"), createMoneyAdminRouter({ db: pool, ledger: moneyLedger, reader: configReader, engine: moneyEngine ?? undefined, channels: channelAccounts, pooled, crossBorder }));
if (pool) app.use("/api/admin/config", requireAuth, requireRole("owner", "superadmin"), createConfigAdminRouter({ db: pool, reader: configReader, readiness: async (cfg) => {
  const cur = cfg.currency.code, acc = pooled.forCurrency(cur);
  const pairs = cfg.corridors.filter((k) => k.enabled).map((k) => `${k.from === "ZA" ? "ZAR" : "ZMW"}-${k.to === "ZA" ? "ZAR" : "ZMW"}`);
  return checkReadiness(cfg, { pooledAccounts: { in_person: !!acc.in_person, online: !!acc.online }, bankFeedConfigured: !!process.env.BANK_WEBHOOK_SECRET?.trim(), ratesFresh: pairs.length === 0 || (await ratesAreFresh(pool!, pairs)), reserveCents: moneyLedger.balance(reserveAccount(cur)) });
}, onActivate: (country, cfg) => { if (country === "ZA") { zaProfile = cfg; console.log("[config] VINK fees synced:", syncManshyaFees(manshya.config as never, cfg).join(", ") || "no change"); } } }));
if (pool) app.use("/api/admin/bank-links", requireAuth, requireRole("owner", "superadmin"), createBankAdminRouter({ db: pool, ...bankDeps }));
app.use("/api/auth",          (hasDb ? createDbAuthRouter() : createMemoryAuthRouter()).router);
app.use("/api/fraud-risk",    fraudRiskRouter);
if (tokenService && pool) {
  app.use("/api/terminal/token", createTokenTerminalRouter({ db: pool, tokens: tokenService, authenticate: authenticateTerminal }));          // before the general terminal routes
  if (moneyEngine) app.use("/api/retail/token", createTokenRetailRouter({ db: pool, ledger: moneyLedger, engine: moneyEngine, reader: configReader, authenticate: authenticateRetailTerminal }));          // before the general retail routes
  {
    const monitor = createOpsMonitor({ db: pool, ledger: moneyLedger, sinks: sinksFromEnv(process.env, createEmailSender()) });
    opsMonitor = monitor;
    app.use("/api/admin/ops", requireAuth, requireRole("owner", "superadmin"), createOpsAdminRouter({ db: pool, ledger: moneyLedger, monitor, settlement: createSchemeSettlement(pool), gateContext: gateContext }));
  }
  app.use("/api/admin/tokens", requireAuth, requireRole("owner", "superadmin"), createTokenAdminRouter({ db: pool, tokens: tokenService, sandbox: manshya.payments.mode === "sandbox" }));
}
app.use("/api/terminal",      terminalRouter);
app.use("/api/retail",        retailRouter);
app.use("/api/routes",        routeRouter);
app.use("/api/bank/accounts",      bankAccountsRouter);
app.use("/api/bank/cards",         bankCardsRouter);
app.use("/api/bank/payments",      bankPaymentsRouter);
app.use("/api/bank/treasury",      bankTreasuryRouter);
app.use("/api/bank/compliance",    bankComplianceRouter);
app.use("/api/bank/users",         bankUsersRouter);
app.use("/api/geo",                geoCurrencyRouter);
app.use("/api/currency",           geoCurrencyRouter);
app.use("/api/rbac",               rbacRouter);
app.use("/api/mastercard",         mastercardRouter);
app.use("/api/visa",               visaRouter);
app.use("/api/applications",       applicationsRouter);
app.use("/api/otp",                otpRouter);
app.use("/api/jobs",               jobsRouter);
app.use("/api/public",             publicRouter);
// Messages to a VINK department: stored, then emailed to the department, with a receipt to the sender (see services/contactService.ts).
const contactService = pool ? createContactService({ db: pool, mail: createEmailSender() }) : null;
if (contactService) {
  app.use("/api/contact", createContactRouter(contactService));
  app.use("/api/admin/contact", requireAuth, requireRole("owner", "superadmin"), createContactAdminRouter({ db: pool!, svc: contactService }));
  // Department mail for the management panel: owners and superadmins see every department, a department manager sees only the department(s) they are approved for.
  app.use("/api/shared-files", createShareRouter(mailFiles!));          // public: the link is the secret, and it expires
  app.use("/api/mail", requireAuth, createMailRouter({ db: pool!, svc: mailService! }));
  if (socialService) app.use("/api/admin/social", requireAuth, createSocialRouter({ db: pool!, svc: socialService }));
  if (whatsappService) app.use("/api/admin/whatsapp", requireAuth, createWhatsAppRouter({ db: pool!, svc: whatsappService }));
}
app.use("/api/global",             globalBankingRouter);
app.use("/api/financial",          financialReportsRouter);
app.use("/api/levy",              levySystemRouter);
app.use("/api/afc",                afcRouter);
app.use("/api/payments/sandbox",   createPaymentsSandboxRouter());

// Health check
let migrationFailed = false;

app.get("/health", (_req, res) => {
  res.json({
    status: migrationFailed ? "degraded" : "ok",
    uptime: process.uptime(), timestamp: new Date().toISOString(), database: hasDb ? "connected" : "in-memory",
    migrationFailed,
  });
});

/**
 * GET /health/schema -- a real, checkable way to confirm the database
 * migration actually completed, rather than only ever finding out via
 * server logs. Directly relevant here: boot()'s own migrateAndSeed()
 * call is wrapped in a try/catch that logs a failure and still starts
 * the server anyway ("server will still start, but ... will error
 * until this is fixed") -- meaning a genuinely failed migration
 * (permissions issue, transient connection problem during deploy,
 * etc.) leaves the server running indefinitely with an out-of-date
 * schema and no obvious symptom apart from specific endpoints failing,
 * unless someone happens to check the logs at the right moment. This
 * endpoint checks for the presence of account_number specifically
 * (the column POST /api/applications depends on), so a real "could not
 * generate account number" report can be diagnosed directly rather
 * than guessed at.
 */
app.get("/health/schema", async (_req, res) => {
  if (!hasDb || !pool) {
    res.json({ hasDb: false, note: "No DATABASE_URL configured -- running on in-memory demo data, schema checks don't apply." });
    return;
  }
  try {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'applications' AND column_name IN ('account_number', 'rejected_at')
    `);
    const found = rows.map((r: { column_name: string }) => r.column_name);
    res.json({
      hasDb: true,
      applicationsAccountNumberColumn: found.includes("account_number"),
      applicationsRejectedAtColumn: found.includes("rejected_at"),
      note: found.length === 2 ? "Schema is up to date." : "Migration has not completed -- restart the server to re-run migrateAndSeed(), or check startup logs for the actual migration error.",
    });
  } catch (err) {
    res.status(500).json({ hasDb: true, error: "Could not query schema state", detail: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/admin/migrate -- lets an admin re-run migrateAndSeed()
 * directly, without needing to restart the whole Railway service.
 * Built specifically because /health/schema confirmed a real,
 * concrete need: the live database's account_number/rejected_at
 * columns were genuinely missing, meaning the migration either never
 * ran or failed silently (boot()'s own try/catch logs a migration
 * failure but still starts the server regardless -- see that comment
 * for why this leaves no obvious symptom otherwise). Safe to call
 * repeatedly: every statement in schema.sql is idempotent (CREATE
 * TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO
 * NOTHING), the same guarantee boot()'s own call already relies on.
 * Requires real admin auth rather than being open, since this
 * touches the database even though it's idempotent -- an open
 * endpoint that runs database migrations on request is a reasonable
 * thing to gate even when the operation itself is safe to repeat.
 */
app.post("/api/admin/migrate", requireAuth, requireRole("owner", "superadmin"), async (_req, res) => {
  if (!hasDb) {
    res.status(503).json({ success: false, error: "No DATABASE_URL configured -- nothing to migrate." });
    return;
  }
  try {
    await migrateAndSeed();
    migrationFailed = false;
    res.json({ success: true, message: "Migration re-run completed successfully." });
  } catch (err) {
    migrationFailed = true;
    console.error("[db] Manual migration re-run failed:", err);
    res.status(500).json({ success: false, error: "Migration failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

// API index
app.get("/api", (_req, res) => {
  res.json({
    name: "VINK Banking & Payments API",
    version: "1.0.0",
    note: "Grouped by mount point, not every individual route — a fully expanded list drifted out of date before and stopped reflecting reality. Each prefix below covers multiple GET/POST/PATCH endpoints.",
    endpoints: [
      "POST   /api/auth/login",
      "GET    /api/auth/me",
      "POST   /api/auth/logout",
      "/api/fraud-risk/*        — fraud/risk flags on applications and transactions",
      "/api/terminal/*          — AFC card terminal registration, tap ingestion, device management",
      "/api/retail/*            — retail merchant card-payment terminals",
      "/api/routes/*            — vehicle route assignment for AFC off-route fine enforcement",
      "/api/bank/accounts/*     — personal/business/corporate bank accounts",
      "/api/bank/cards/*        — bank cards",
      "/api/bank/payments/*     — transfers, instant payouts",
      "/api/bank/treasury/*     — treasury operations, ledger backfill & reconciliation",
      "/api/bank/compliance/*   — banking compliance",
      "/api/bank/users/*        — bank customer accounts",
      "/api/geo/*, /api/currency/*  — geolocation and currency conversion",
      "/api/rbac/*              — staff role-based access control",
      "/api/mastercard/*        — Mastercard integration status",
      "/api/visa/*              — Visa integration status",
      "/api/applications/*      — personal/business/corporate account applications",
      "/api/otp/*               — one-time-passcode verification",
      "/api/jobs/*              — job applications (HR)",
      "/api/public/*            — public contact form, newsletter signup, account applications",
      "/api/global/*            — multi-currency global banking",
      "/api/financial/*         — financial reports",
      "/api/levy/*              — AFC trip levy, driver/owner/investor/marshall revenue split",
      "/api/afc/*               — AFC device fleet management",
      "/api/payments/issuer/*   — card issuer-processor real-time authorisation webhook",
      "/api/payments/sandbox/*  — staff-only sandbox card-servicing tools (404 in live mode)",
      "/api/manshya/*           — VINK payments & banking (customer accounts); /api/manshya/admin/* is the staff back office",
      "WS     ws://localhost:3001/ws  (events: terminal.tap_received, terminal.fault_reported, route.violation, retail.transaction_received, retail.fault_reported)",
    ],
  });
});

// 404 fallback
app.use((_req, res) => res.status(404).json({ success: false, error: "Endpoint not found" }));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
// Maximum message size is small: clients only ever send an auth message or a ping.
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
const hub = new LiveHub((token) => {
  try { return jwt.verify(token, JWT_SECRET) as VerifiedToken; } catch { return null; }
}, 5000, (m) => console.log(m));
hub.attach(wss);
setBroadcaster((event) => hub.broadcast(event));

// ─── Start Simulators ────────────────────────────────────────────────────────

// ─── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  if (hasDb) {
    try {
      await migrateAndSeed();
      if (pool) await loadCustomDepartments(pool).then((l) => { if (l.length) console.log(`[departments] ${l.length} custom department(s) loaded`); }).catch((e) => console.error("[departments] could not load the custom departments (the built-in ones still work):", e instanceof Error ? e.message : e));
      if (pool) await seedBankLinks({ db: pool, ...bankDeps }).catch((e) => console.error("[seed] bank links failed (server continues):", e instanceof Error ? e.message : e));
      if (pool && manshya.payments.mode === "live") {
        // Real money starts only when every item on the go-live gate is satisfied (confirmed beforehand, in sandbox mode, on this database).
        const blockers = await liveStartBlockers(pool, { cfg: manshya.payments, fastSecretSet: !!process.env.PAYMENTOLOGY_FAST_SECRET?.trim(), alertSinks: sinksFromEnv(process.env, createEmailSender()).length });
        if (blockers.length) { console.error("[go-live] PAYMENTS_MODE=live is refused until these are satisfied:\n  - " + blockers.join("\n  - ")); process.exit(1); }
      }
      await pooled.refresh();
      if (pool) await configReader.active("ZA").then((a) => { zaProfile = a.config; return syncManshyaFees(manshya.config as never, a.config); }).catch((e) => console.error("[config] fee sync failed:", e instanceof Error ? e.message : e));
      if (pool && process.env.FX_AUTO !== "off") {
        // Exchange rates for cross-border quotes: fetched every hour while a route is open (and once at start). See services/fxRates.ts for the sources and safety rules.
        const refresh = async () => {
          const open = (await Promise.all((["ZA", "ZM"] as const).map((c) => configReader.active(c)))).some((a) => a.config.corridors.some((k) => k.enabled));
          if (!open) return;
          const results = await refreshRates(pool!, { pairs: ["ZAR-ZMW", "ZMW-ZAR"] });
          for (const r of results) if (r.status !== "updated") console.warn(`[fx] ${r.pair}: ${r.status}${r.reason ? " - " + r.reason : ""}`);
        };
        void refresh().catch((e) => console.error("[fx] refresh failed:", e instanceof Error ? e.message : e));
        setInterval(() => { refresh().catch((e) => console.error("[fx] refresh failed:", e instanceof Error ? e.message : e)); }, 3600_000).unref();
      }
      if (contactService) setInterval(() => { contactService.retryUnsent().catch((e) => console.error("[contact] retry failed:", e instanceof Error ? e.message : e)); }, 300_000).unref();
      if (opsMonitor && process.env.OPS_MONITOR !== "off") {
        // Every five minutes: reconcile, and tell a person about anything new or still open (see services/opsMonitor.ts).
        const mon = opsMonitor;
        setInterval(() => { mon.check().catch((e) => console.error("[ops] check failed:", e instanceof Error ? e.message : e)); }, 300_000).unref();
      }
      if (pool && process.env.MONEY_ENGINE !== "off") {
        // Settles confirmed taps, closes trips, creates the marshal fee / agreement payments and pays what is due. Safe to repeat: every posting is idempotent.
        const engine = moneyEngine!;
        let running = false;
        setInterval(() => {
          if (running) return; running = true;
          configReader.active("ZA").then((a) => { zaProfile = a.config; }).catch(() => {});
          engine.runCycle().catch((e) => console.error("[money] cycle failed:", e instanceof Error ? e.message : e)).then(() => tokenService?.processPayouts()).catch((e) => console.error("[token] payouts failed:", e instanceof Error ? e.message : e)).finally(() => { running = false; });
        }, 30_000).unref();
      }
    } catch (err) {
      migrationFailed = true;
      console.error("[db] Migration failed — server will still start, but /api/auth will error until this is fixed:", err);
    }
  } else {
    console.log("[db] DATABASE_URL not set — auth is running on in-memory demo data.");
  }

  server.listen(PORT, () => {
    console.log("");
    console.log("  \x1b[35m▲ VINK Backend\x1b[0m  v1.1.0");
    console.log(`  \x1b[2mHTTP\x1b[0m   → http://localhost:${PORT}`);
    console.log(`  \x1b[2mAPI\x1b[0m    → http://localhost:${PORT}/api`);
    console.log(`  \x1b[2mWS\x1b[0m     → ws://localhost:${PORT}/ws`);
    console.log(`  \x1b[2mHealth\x1b[0m → http://localhost:${PORT}/health`);
    console.log(`  \x1b[2mDB\x1b[0m     → ${hasDb ? "Postgres connected" : "in-memory (no DATABASE_URL)"}`);
    console.log("");
    console.log("");
  });
}

boot();

const shutdown = () => { server.close(() => { try { manshya.db.close(); } catch { /* already closed */ } process.exit(0); }); };
process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);
