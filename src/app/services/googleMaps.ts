// Loads the Google Maps JavaScript API once, on demand, and tells callers plainly when it cannot be used.
//
// The key is a BROWSER key: it is visible to anyone who opens the page, so its protection is on Google's side. In the Google Cloud
// console restrict it to (1) the "Maps JavaScript API" only and (2) your site addresses (HTTP referrers such as https://www.vink.co.za/*).
// It is supplied at build time as VITE_GOOGLE_MAPS_KEY. Without it, or if Google rejects it, the dashboards keep using the built-in
// drawn map, so nothing breaks.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GMaps = any;

export const GOOGLE_MAPS_KEY: string = ((import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? "").trim();

export type MapsFailure = "no_key" | "script_failed" | "timeout" | "auth_failed";
export class MapsUnavailable extends Error {
  constructor(readonly reason: MapsFailure) { super(reason); }
}

const CALLBACK = "__vinkMapsReady";
const AUTH_EVENT = "vink:maps-auth-failed";
let pending: Promise<GMaps> | null = null;

/** Called when Google reports a rejected key AFTER the script loaded (it does so asynchronously, when the first map is drawn). */
export function onMapsAuthFailure(fn: () => void): () => void {
  window.addEventListener(AUTH_EVENT, fn);
  return () => window.removeEventListener(AUTH_EVENT, fn);
}

export function loadGoogleMaps(key: string = GOOGLE_MAPS_KEY, timeoutMs = 15_000): Promise<GMaps> {
  if (!key) return Promise.reject(new MapsUnavailable("no_key"));
  if (pending) return pending;
  const w = window as unknown as Record<string, unknown> & { google?: { maps?: GMaps } };
  w.gm_authFailure = () => window.dispatchEvent(new Event(AUTH_EVENT));

  pending = new Promise<GMaps>((resolve, reject) => {
    const finish = async () => {
      try {
        await w.google!.maps!.importLibrary("maps");
        await w.google!.maps!.importLibrary("marker");
        resolve(w.google!.maps);
      } catch { reject(new MapsUnavailable("script_failed")); }
    };
    if (w.google?.maps?.importLibrary) { void finish(); return; }          // already on the page (another bundle or hot reload)
    const timer = setTimeout(() => reject(new MapsUnavailable("timeout")), timeoutMs);
    w[CALLBACK] = () => { clearTimeout(timer); void finish(); };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${CALLBACK}`;
    s.async = true; s.defer = true;
    s.onerror = () => { clearTimeout(timer); reject(new MapsUnavailable("script_failed")); };
    document.head.appendChild(s);
  }).catch((e) => { pending = null; throw e; });                                // a later visit may try again
  return pending;
}

/** Test helper: forget the loaded script state. */
export function resetGoogleMapsForTests() { pending = null; }
