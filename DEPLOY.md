# VINK — Railway Deployment Guide

## Architecture

```
Railway Service 1: vink-frontend   (React/Vite → nginx)
Railway Service 2: vink-backend    (Express + WebSocket)
Supabase:          Edge Function  (Hono — applications, banking, ride-hailing, municipalities)
```

---

## Step 1 — Deploy Supabase Edge Function

In the Figma Make settings panel → Supabase → Deploy Edge Function.

The edge function handles:
- `/make-server-3f39932e/applications/*` — Application forms
- `/make-server-3f39932e/otp/*` — OTP verification
- `/make-server-3f39932e/global/*` — Global banking
- `/make-server-3f39932e/financial/*` — Financial reports
- `/make-server-3f39932e/ride/*` — Ride-hailing system
- `/make-server-3f39932e/municipalities/*` — SA municipality directory

---

## Step 2 — Deploy Express Backend to Railway

1. Create a new Railway project
2. Add a service → **Deploy from GitHub**
3. Set **Root Directory** to `server/`
4. Set environment variables:

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 64>
ALLOWED_ORIGINS=https://YOUR-FRONTEND.up.railway.app
SUPABASE_URL=https://rkuamkxvdnwsefbhampg.supabase.co
SUPABASE_SERVICE_KEY=<your service role key>
```

5. Railway auto-detects Node.js. Build: `npm install && npm run build`. Start: `npm start`.
6. Note the backend URL: `https://vink-backend-XXXX.up.railway.app`

---

## Step 3 — Deploy Frontend to Railway

1. Add a second service to the same Railway project
2. **Root Directory**: `/` (project root)
3. Set environment variables:

```env
VITE_API_URL=https://vink-backend-XXXX.up.railway.app
VITE_SUPABASE_PROJECT_ID=rkuamkxvdnwsefbhampg
VITE_SUPABASE_URL=https://rkuamkxvdnwsefbhampg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. Build command: `npm install && npm run build`
5. Start command: `npm start`

---

## Step 4 — Update CORS after first deploy

Once both services are live, update the backend `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://vink-frontend-XXXX.up.railway.app,http://localhost:5173
```

---

## Health Checks

| Service | URL |
|---|---|
| Frontend | `https://vink-frontend.up.railway.app/health` |
| Backend  | `https://vink-backend.up.railway.app/health` |
| Supabase | `https://rkuamkxvdnwsefbhampg.supabase.co/functions/v1/make-server-3f39932e/health` |

---

## Local Development

```bash
# Terminal 1 — Backend
cd server && npm install && npm run dev

# Terminal 2 — Frontend
npm install && npm run dev
```

Frontend: http://localhost:5173
Backend:  http://localhost:3001
