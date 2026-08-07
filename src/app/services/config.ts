/**
 * The one place the frontend's backend URL is defined. Every service file
 * (apiClient, marketplaceApi, mvnoApi, bankingApi, healingAppleApi,
 * vehicleApi, currencyStore, applicationsApi) and any component that needs
 * to build a raw fetch/FormData request (e.g. JobApplicationViewer, which
 * can't use the JSON-only api() wrapper because it uploads files) imports
 * API_BASE from here — not its own copy of this fallback logic.
 *
 * Configuration, in order of precedence:
 * 1. VITE_API_URL — set this in Railway's environment variables (or a
 *    local .env file) to point the frontend at a specific backend. This
 *    is the "connect them with a variable" mechanism: change this one
 *    value and every part of the frontend follows, without touching code.
 * 2. If unset and running on localhost, falls back to the local dev
 *    backend (http://localhost:3001).
 * 3. If unset and NOT on localhost — meaning VITE_API_URL genuinely
 *    wasn't configured for this deployment — falls back to VINK's known
 *    production backend, so a misconfigured build still points somewhere
 *    real rather than failing outright. This should not be relied on
 *    long-term; set VITE_API_URL explicitly in the deployment's
 *    environment variables instead.
 */

const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const API_BASE: string = import.meta.env.VITE_API_URL
  ?? (isLocalhost ? "http://localhost:3001" : "https://vink-grup-limited-production.up.railway.app");

/** Same backend, as a WebSocket URL (wss:// instead of https://, ws:// instead of http://) — used by mvnoApi's live feed. */
export const API_BASE_WS: string = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/^http/, "ws") + "/ws"
  : (isLocalhost ? "ws://localhost:3001/ws" : "wss://vink-grup-limited-production.up.railway.app/ws");
