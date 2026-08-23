// Minimal service worker whose only job is to make the site installable
// as a desktop/Windows app (Chrome/Edge require a registered service
// worker with a fetch handler for the "Install app" prompt to appear
// reliably).
//
// Deliberately does NOT cache JS/CSS bundle chunks itself. Every deploy
// replaces those files under new hashed names, and main.tsx already has
// to work around stale-chunk references after a deploy (see the
// `vite:preloadError` handler there) — a caching service worker would
// make that problem worse by serving old chunks back from its own cache
// instead of letting the browser fetch the new ones. This just passes
// requests straight through to the network, with the CacheStorage lookup
// only as a last-resort fallback while offline (which will simply miss,
// since nothing is ever written to it) rather than served stale content.
const CACHE_NAME = "vink-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
