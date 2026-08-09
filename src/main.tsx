import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import "./styles/fonts.css";
import App from "./app/App";
import { initCurrency } from "./app/services/currencyStore";

// After every deployment, this build's chunk files (like
// PersonalLandingViewer-xxxxx.js) get replaced with new ones under new
// hashed filenames, and the old ones are gone from the server. Anyone who
// already had the site open in a tab from before the deploy is still
// running the old index.html, which references the old filenames -- so
// the moment they navigate to a lazy-loaded section, the browser 404s
// trying to fetch a file that no longer exists, and the page goes blank.
// Vite dispatches a "vite:preloadError" event for exactly this failure
// mode; the fix it recommends is a one-time reload, which re-fetches the
// current index.html and gets the visitor back to a working, up-to-date
// page. Guarded with sessionStorage so a genuine, unrelated network
// outage doesn't cause an infinite reload loop -- it reloads once, and
// if the page still can't load after that, it stops and lets the error
// surface normally instead of looping forever.
window.addEventListener("vite:preloadError", () => {
  const key = "vink-reloaded-after-preload-error";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  window.location.reload();
});

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found in index.html");

initCurrency();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
