import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { requestLogger } from "./middleware/logger.js";
import authRouter from "./routes/auth.js";
import kpisRouter from "./routes/kpis.js";
import subscribersRouter from "./routes/subscribers.js";
import networkRouter from "./routes/network.js";
import billingRouter from "./routes/billing.js";
import fraudRouter from "./routes/fraud.js";
import provisioningRouter from "./routes/provisioning.js";
import supportRouter from "./routes/support.js";
import interconnectsRouter from "./routes/interconnects.js";
import alertsRouter from "./routes/alerts.js";
import vehiclesRouter from "./routes/vehicles.js";
import ridesRouter from "./routes/rides.js";
import healingDriversRouter from "./routes/healingDrivers.js";
import passengersRouter from "./routes/passengers.js";
import sosRouter from "./routes/sos.js";
import bankAccountsRouter from "./routes/bankAccounts.js";
import bankCardsRouter from "./routes/bankCards.js";
import bankPaymentsRouter from "./routes/bankPayments.js";
import bankTreasuryRouter from "./routes/bankTreasury.js";
import bankComplianceRouter from "./routes/bankCompliance.js";
import bankUsersRouter from "./routes/bankUsers.js";
import marketplaceRouter from "./routes/marketplaceRouter.js";
import publicRouter from "./routes/public.js";
import globalBankingRouter from "./routes/globalBanking.js";
import financialReportsRouter from "./routes/financialReports.js";
import levySystemRouter from "./routes/levySystem.js";
import afcRouter from "./routes/afc.js";
import { startSimulator } from "./services/simulator.js";
import { startVehicleSimulator } from "./services/vehicleSimulator.js";
import type { WsEvent } from "./types/mvno.js";
import type { VehicleWsMessage } from "./types/vehicles.js";

const PORT = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:4173")
  .split(",").map((o: string) => o.trim());

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow all Railway subdomains in production
  if (process.env.NODE_ENV === "production" && origin.endsWith(".up.railway.app")) return true;
  return false;
};

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

// Rate limiting — 300 req/min per IP
app.use("/api", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth",          authRouter);
app.use("/api/kpis",          kpisRouter);
app.use("/api/subscribers",   subscribersRouter);
app.use("/api/network",       networkRouter);
app.use("/api/billing",       billingRouter);
app.use("/api/fraud",         fraudRouter);
app.use("/api/provisioning",  provisioningRouter);
app.use("/api/support",       supportRouter);
app.use("/api/interconnects", interconnectsRouter);
app.use("/api/alerts",        alertsRouter);
app.use("/api/vehicles",      vehiclesRouter);
app.use("/api/ha/rides",           ridesRouter);
app.use("/api/bank/accounts",      bankAccountsRouter);
app.use("/api/bank/cards",         bankCardsRouter);
app.use("/api/bank/payments",      bankPaymentsRouter);
app.use("/api/bank/treasury",      bankTreasuryRouter);
app.use("/api/bank/compliance",    bankComplianceRouter);
app.use("/api/bank/users",         bankUsersRouter);
app.use("/api/marketplace",        marketplaceRouter);
app.use("/api/public",             publicRouter);
app.use("/api/global",             globalBankingRouter);
app.use("/api/financial",          financialReportsRouter);
app.use("/api/levy",              levySystemRouter);
app.use("/api/afc",                afcRouter);
app.use("/api/ha/drivers",    healingDriversRouter);
app.use("/api/ha/passengers", passengersRouter);
app.use("/api/ha/sos",        sosRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// API index
app.get("/api", (_req, res) => {
  res.json({
    name: "Vink MVNO Backend API",
    version: "1.0.0",
    endpoints: [
      "POST   /api/auth/login",
      "GET    /api/auth/me",
      "POST   /api/auth/logout",
      "GET    /api/kpis/current",
      "GET    /api/kpis/history",
      "GET    /api/subscribers",
      "POST   /api/subscribers",
      "GET    /api/subscribers/:id",
      "PATCH  /api/subscribers/:id",
      "DELETE /api/subscribers/:id",
      "GET    /api/subscribers/:id/cdrs",
      "GET    /api/subscribers/:id/tickets",
      "GET    /api/network/towers",
      "GET    /api/network/towers/:id",
      "PATCH  /api/network/towers/:id",
      "GET    /api/network/calls",
      "GET    /api/network/calls/stats",
      "GET    /api/network/sessions",
      "GET    /api/network/sms",
      "GET    /api/network/sms/stats",
      "GET    /api/billing/cdrs",
      "GET    /api/billing/invoices",
      "GET    /api/billing/invoices/:id",
      "PATCH  /api/billing/invoices/:id/mark-paid",
      "GET    /api/billing/summary",
      "GET    /api/fraud/alerts",
      "PATCH  /api/fraud/alerts/:id/resolve",
      "PATCH  /api/fraud/alerts/:id/block",
      "GET    /api/fraud/intercepts",
      "GET    /api/fraud/summary",
      "GET    /api/provisioning/sims",
      "GET    /api/provisioning/sims/stats",
      "POST   /api/provisioning/sims/activate",
      "PATCH  /api/provisioning/sims/:iccid/suspend",
      "POST   /api/provisioning/sims/batch",
      "GET    /api/provisioning/porting",
      "POST   /api/provisioning/porting",
      "PATCH  /api/provisioning/porting/:id",
      "GET    /api/support/tickets",
      "POST   /api/support/tickets",
      "GET    /api/support/tickets/:id",
      "PATCH  /api/support/tickets/:id",
      "PATCH  /api/support/tickets/:id/assign",
      "GET    /api/support/stats",
      "GET    /api/interconnects/roaming",
      "PATCH  /api/interconnects/roaming/:id",
      "GET    /api/interconnects/routes",
      "PATCH  /api/interconnects/routes/:id",
      "GET    /api/interconnects/summary",
      "GET    /api/alerts",
      "GET    /api/alerts/summary",
      "PATCH  /api/alerts/:id/acknowledge",
      "PATCH  /api/alerts/:id/resolve",
      "WS     ws://localhost:3001/ws  (events: kpi_update, new_alert, alert_resolved, subscriber_update, call_update, data_session_update, fraud_detected, tower_status_change, sms_stats, billing_event)",
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
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

function broadcast(event: WsEvent | VehicleWsMessage): void {
  const payload = JSON.stringify(event);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress ?? "unknown";
  console.log(`[WS] Client connected  (${ip})  total=${clients.size + 1}`);
  clients.add(ws);

  // Send welcome + current state
  ws.send(JSON.stringify({
    event: "connected",
    timestamp: new Date().toISOString(),
    data: { message: "Connected to Vink MVNO live feed", clientCount: clients.size },
  }));

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw.toString());
      // Ping/pong keep-alive
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
    } catch { /* ignore */ }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected  total=${clients.size}`);
  });

  ws.on("error", err => console.error("[WS] Socket error:", err.message));
});

// ─── Start Simulators ────────────────────────────────────────────────────────
const stopSimulator        = startSimulator(broadcast);
const stopVehicleSimulator = startVehicleSimulator(broadcast);

// ─── Boot ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log("");
  console.log("  \x1b[35m▲ Vink Backend\x1b[0m  v1.1.0");
  console.log(`  \x1b[2mHTTP\x1b[0m   → http://localhost:${PORT}`);
  console.log(`  \x1b[2mAPI\x1b[0m    → http://localhost:${PORT}/api`);
  console.log(`  \x1b[2mWS\x1b[0m     → ws://localhost:${PORT}/ws`);
  console.log(`  \x1b[2mHealth\x1b[0m → http://localhost:${PORT}/health`);
  console.log("");
  console.log("  \x1b[32m●\x1b[0m MVNO simulator running");
  console.log("  \x1b[32m●\x1b[0m Vehicle tracking simulator running (50 vehicles)");
  console.log("");
});

process.on("SIGTERM", () => { stopSimulator(); stopVehicleSimulator(); server.close(() => process.exit(0)); });
process.on("SIGINT",  () => { stopSimulator(); stopVehicleSimulator(); server.close(() => process.exit(0)); });
