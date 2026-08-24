// VINK Management Panel — desktop shell.
//
// This wraps the real, live Management Panel (the same React app deployed
// at www.vink.co.za) in its own native window, rather than shipping a
// second copy of the app's code. The panel talks to a live backend
// (auth, real-time balances, WebSocket updates) — there is no meaningful
// "offline" mode for it, so bundling static assets instead of loading the
// live site would just mean stale screens with no way to actually sign in
// or see current data. Loading the deployed URL keeps this thin wrapper
// permanently in sync with whatever's in production, the same approach
// Slack, Discord, and most other "desktop app for a web product" tools use.
const { app, BrowserWindow, shell, Menu, session } = require("electron");
const path = require("node:path");

// Overridable at build/run time (e.g. for pointing a staging build at a
// different host) without needing a code change.
//
// Deliberately loads the site root, NOT /management-panel directly. A
// cold launch has no session yet (Electron's storage is a separate,
// empty profile from any browser the person normally uses), and landing
// straight on the panel's deep link with no token just shows its "you're
// not signed in" dead end -- the panel renders as a full-screen overlay,
// so the homepage's own Sign In button underneath it isn't visible or
// reachable without first dismissing that dialog. Starting at "/" shows
// the same login flow every user already knows from the website; signing
// in with a staff account (see DEV_CREDENTIALS.md) then routes into the
// Management Panel automatically, the same way it does on vink.co.za.
const APP_URL = process.env.VINK_APP_URL || "https://www.vink.co.za/";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "VINK Management Panel",
    icon: path.join(__dirname, "build", "icon.ico"),
    backgroundColor: "#0F3D24",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // No in-app menu bar needed for what is effectively a site-specific
  // browser — autoHideMenuBar above already keeps it out of the way, but
  // an entirely empty menu with no Reload item meant there was no way to
  // force a refresh if the window ever showed a stale cached page (see
  // the cache-clearing below) short of quitting and reopening the whole
  // app. Keep one minimal menu with a real Reload command instead of
  // removing the menu outright.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "View",
        submenu: [
          {
            label: "Reload",
            accelerator: "CmdOrCtrl+R",
            click: () => mainWindow?.webContents.reloadIgnoringCache(),
          },
        ],
      },
    ])
  );

  // Electron's default session keeps a real on-disk HTTP cache, same as
  // a normal browser — so once this window has loaded the site once, a
  // later app deploy to www.vink.co.za can go completely unnoticed here,
  // silently serving old cached HTML/JS instead of the "always shows
  // whatever's in production" behavior this shell is supposed to have.
  // Clear the cache before every load so a fresh launch always fetches
  // current content, not what happened to be cached from last time.
  session.defaultSession.clearCache().then(() => {
    mainWindow.loadURL(APP_URL);
  });

  // If a load ever fails outright (network blip, a deploy landing mid
  // request), retry once automatically after a short delay instead of
  // leaving the window stuck on a browser error page with no visible
  // way to recover.
  mainWindow.webContents.on("did-fail-load", (_event, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED — a normal cancelled navigation, not a real failure
    setTimeout(() => mainWindow?.webContents.reloadIgnoringCache(), 1500);
  });

  // Links that open a new window/tab (target="_blank", window.open, the
  // marketplace's "view listing" style links, etc.) should open in the
  // user's real default browser, not spawn a second frameless Electron
  // window with no address bar or way to navigate back.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Keep in-app navigation scoped to the vink.co.za origin. A link to an
  // external site (support docs, a payment provider's hosted page, etc.)
  // should still open in the system browser rather than navigating this
  // window away from the app entirely.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const allowed = new URL(APP_URL).hostname;
      if (target.hostname !== allowed) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — let Electron's own handling deal with it rather
      // than silently swallowing the navigation.
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // A reasonable, standard desktop User-Agent avoids any server-side or
  // client-side mobile/tablet detection treating this window as a phone
  // browser, which the real vink.co.za frontend does do for parts of the
  // UI (see the responsive breakpoints throughout src/app).
  session.defaultSession.setUserAgent(
    session.defaultSession
      .getUserAgent()
      .replace(/Electron\/[^\s]+\s?/, "")
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
