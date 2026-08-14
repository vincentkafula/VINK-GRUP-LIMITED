# VINK Mobile Apps — Path to Google Play & Apple App Store

This documents the real, complete path from where the codebase stands
today to actual store submission. Everything under "Done" was built and
verified in this session. Everything under "Remaining" requires action
outside this environment — a developer account, a Mac, payment, or a
human-reviewed submission — none of which this environment has access to.

## Done

- **Capacitor installed and configured** (`capacitor.config.ts`), wrapping
  the existing React web app (`dist/`) into native iOS and Android shells.
  This is the standard, legitimate way to take a web app to both stores
  without a full native rewrite.
- **Both native projects generated**: `android/` (a real Gradle project)
  and `ios/` (a real Xcode project) via `npx cap add android` / `ios`.
- **Real app icons and splash screens generated** from VINK's actual logo
  (`src/imports/LOGO_FINAL.png`) on the brand's own green
  (`#0F3D24`, taken from `index.html`'s `theme-color` and
  `public/manifest.json` — not invented), via `@capacitor/assets`. 87
  Android assets and 10 iOS assets across every required density.
- **Android permissions** (`android/app/src/main/AndroidManifest.xml`):
  location (ride tracking), network state (WebSocket reconnect),
  notifications — each mapped to a real, existing feature, not requested
  speculatively.
- **iOS usage descriptions** (`ios/App/App/Info.plist`): the human-readable
  strings Apple requires for location/camera access. Missing these causes
  an automatic App Store review rejection.
- **WebSocket infrastructure verified live**, not just code that compiles:
  a real client connected to the backend's `/ws` endpoint, sent a ping,
  got a pong. A real webhook request with a valid HMAC signature triggered
  a `payment_confirmed` event that was actually broadcast and received
  over the same connection. `src/app/services/liveSocket.ts` is the
  general-purpose client any screen can use; `DriveDashboardViewer`'s
  Preview page already does, with a genuine Live/Demo status badge.

## Remaining — requires you, specifically

### 1. Developer accounts (you'll need both, regardless of platform)
- **Apple Developer Program** — apple.com/developer, $99/year. Apple
  requires this be tied to a real business with a DUNS number (a free
  business identifier — apply at dnb.com if VINK doesn't have one yet;
  can take 5–30 business days to issue).
- **Google Play Developer account** — play.google.com/console, $25
  one-time. Faster to set up than Apple's; a personal or business account
  both work, though a business listing looks more credible to users.

### 2. A Mac, for the iOS side specifically
Xcode — the only tool that can compile an iOS app — runs on macOS only.
There is no way around this for iOS specifically; Android's toolchain
(Android Studio, Gradle) runs on Windows, Mac, or Linux, so that side is
more flexible.

### 3. Build the actual binaries
Once you have a Mac with Xcode installed, and Android Studio for the
Android side:
```
npm run build                # rebuilds dist/ from the latest source
npx cap sync                 # copies the fresh build into both native projects
npx cap open ios             # opens the Xcode project
npx cap open android         # opens the Android Studio project
```
From there, each IDE's own "Archive" (Xcode) / "Generate Signed Bundle"
(Android Studio) flow produces the actual `.ipa` (iOS) and `.aab`
(Android) files the stores require.

### 4. Code signing
- **iOS**: Xcode can auto-manage this once your Apple Developer account
  is signed in — it generates and manages the signing certificate and
  provisioning profile for you.
- **Android**: you'll generate a signing keystore yourself (Android
  Studio's "Generate Signed Bundle" wizard does this) and **must keep it
  safe** — losing it means you can never update the app under the same
  listing again; Google can't recover it for you.

### 5. Store listing assets
Both stores require, beyond the binary itself: a set of real device
screenshots (not the ones from this session's design work — actual
screenshots taken from the running app on a device or simulator), a short
and long description, a privacy policy URL (VINK's existing site has one,
or needs one specifically covering what the mobile app collects — location,
in particular), and a support contact.

### 6. Submit for review
- **Apple**: typically 24–48 hours for review, sometimes longer for a
  first submission from a new developer account. Apps requesting
  location or camera access get closer scrutiny — the usage-description
  strings already added to `Info.plist` are the first thing reviewers
  check.
- **Google Play**: usually faster, often same-day for straightforward
  apps, though first-time developer accounts sometimes get an additional
  review pass.

## What this means practically

Everything code-side that doesn't require a payment, an account, or a
Mac is done and verified. The remaining steps are genuinely yours to
do — I can help with anything code-related that comes up during that
process (build errors, permission issues, adjusting what the app
requests access to), but account creation, payment, and the final
submission itself have to happen through you.
