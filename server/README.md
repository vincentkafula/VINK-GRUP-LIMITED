# Vink MVNO Backend

Node.js + Express + WebSocket backend for the MVNO Network Operations dashboard.

## Quick Start

```bash
cd server
pnpm dev        # development with hot-reload
pnpm build      # compile TypeScript → dist/
pnpm start      # run compiled build
```

## Default Credentials

| Username     | Password      | Role            |
|--------------|---------------|-----------------|
| superadmin   | Admin@1234    | Super Admin     |
| noc1         | Noc@5678      | NOC Engineer    |
| billing1     | Bill@9012     | Billing Admin   |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login → JWT |
| GET | /api/kpis/current | Live KPI snapshot |
| GET | /api/kpis/history | 24h KPI history |
| GET | /api/subscribers | Paginated subscriber list |
| POST | /api/subscribers | Create subscriber |
| GET | /api/network/towers | Cell tower list |
| GET | /api/network/calls/stats | Call statistics |
| GET | /api/network/sms/stats | SMS statistics |
| GET | /api/billing/summary | Revenue summary |
| GET | /api/fraud/alerts | Fraud alert list |
| GET | /api/fraud/summary | Fraud statistics |
| GET | /api/provisioning/sims/stats | SIM inventory stats |
| GET | /api/support/stats | Ticket statistics |
| GET | /api/interconnects/summary | Roaming + routes |
| GET | /api/alerts | System alerts |
| WS  | ws://localhost:3001/ws | Live event feed |

## WebSocket Events

Connect to `ws://localhost:3001/ws`. Events broadcast automatically:

- `kpi_update` — every 5s
- `fraud_detected` — when new fraud is simulated
- `new_alert` / `alert_resolved` — system alert changes
- `tower_status_change` — tower goes online/offline
- `sms_stats` — every 15s
- `billing_event` — every 10s
- `subscriber_update` — new activations

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | HTTP port |
| JWT_SECRET | (dev default) | Change in production |
| ALLOWED_ORIGINS | http://localhost:5173 | CORS allowed origins |
