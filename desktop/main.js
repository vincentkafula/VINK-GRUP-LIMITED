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
const APP_URL =
  process.env.VINK_APP_URL || "https://www.vink.co.za/management-panel";

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
  // removing the menu entirely avoids a stray Alt-key flash revealing an
  // Electron default menu (File/Edit/View/...) that doesn't apply here.
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(APP_URL);

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
