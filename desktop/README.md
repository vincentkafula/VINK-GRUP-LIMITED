# VINK Management Panel — Windows Desktop App

A real, downloadable Windows installer for the Management Panel — not a
browser-install PWA. This is a thin [Electron](https://www.electronjs.org/)
shell that loads the live panel at `https://www.vink.co.za/management-panel`
in its own native window, with its own icon, Start Menu entry, and taskbar
presence, and no browser chrome (address bar, tabs) around it.

It always shows the current production app — there's nothing to keep in
sync, because it never ships a copy of the app's code, just the shell
around it.

## Getting the installer

Building a real `.exe` requires an actual Windows machine — not something
available in a Linux CI/dev sandbox — so it's built by
`.github/workflows/build-desktop.yml` on GitHub's hosted Windows runner.
Two ways to get a copy:

**Stable download (recommended):** push a tag like `desktop-v1.0.0`:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This builds the installer and publishes it to the repo's **Releases**
page (`github.com/vincentkafula/VINK-GRUP-LIMITED/releases`) with the
`.exe` attached — a permanent link, exactly like downloading any other
desktop software.

**One-off build:** go to the repo's **Actions** tab →
"Build VINK Management Panel (Windows)" → **Run workflow**. Once it
finishes (a few minutes), the installer is attached to that run as a
downloadable artifact.

Either way produces two files in `desktop/release/`:
- `VINK Management Panel Setup <version>.exe` — the installer (NSIS,
  lets the user pick an install location, adds Start Menu + desktop
  shortcuts, includes an uninstaller).
- `VINK Management Panel <version>.exe` (portable) — a single
  self-contained exe that runs without installing, for anyone who'd
  rather not install anything system-wide.

## Building locally (only possible on an actual Windows machine)

```bash
cd desktop
npm install
npm run build:win
```

Output lands in `desktop/release/`.

## Files

- `main.js` — the entire app. Creates the window, points it at
  `APP_URL`, and makes sure external links (support docs, payment
  provider pages, anything off the vink.co.za domain) open in the
  user's real default browser instead of a second bare Electron window.
- `package.json` — electron-builder config: app id, product name, icon,
  NSIS installer options.
- `build/icon.ico` — multi-resolution Windows icon, generated from the
  existing `public/icons/icon-512x512.png`.

## Signing in

The app opens on the normal VINK Bank homepage, same as the website —
click **Sign In** and log in with a staff account (see
`DEV_CREDENTIALS.md`, e.g. `admin` / `Admin@1234`). Staff roles route
into the Management Panel automatically after login, exactly like on
vink.co.za. Your session is remembered between launches (Electron
persists `localStorage` to disk the same way a browser does), so this is
only needed once until the session expires.

## Pointing it at a different URL

Set `VINK_APP_URL` before launching (useful for a staging build):

```bash
VINK_APP_URL=https://staging.vink.co.za/management-panel npm start
```

## Auto-update

Not wired up yet. Right now, getting a new version means downloading and
re-running the installer again — since the app itself always loads the
live site, a new installer is only actually needed if `main.js`,
`package.json`'s build config, or the icon changes; ordinary app updates
already show up automatically the next time the window loads, no
reinstall required. If unattended updates for *this shell* end up
mattering later, `electron-updater` (from the same electron-builder
project) is the natural next step — it wasn't added now to avoid setting
up an update server/feed for a wrapper that rarely needs to change.
