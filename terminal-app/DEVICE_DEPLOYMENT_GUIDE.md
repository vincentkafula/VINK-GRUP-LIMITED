# P18Q Device Deployment Guide

Two separate procedures, both using a USB flash drive but for different
things. Don't confuse them.

## 1. Installing/updating the VINK Terminal app itself (USB "DecardApk" method)

This is the practical production deployment path for `terminal-app` --
simpler and more appropriate for non-technical device buyers than
Google Play Store, which is more suited to the main consumer app.

**Steps:**
1. On any USB flash drive, create a folder named exactly `DecardApk` in
   the root directory.
2. Copy the built `.apk` file into that folder.
3. Insert the flash drive into the P18Q's USB port and power on the
   device.
4. The device detects the app in that folder and installs/runs it
   automatically. Some installs require a manual confirmation tap on
   the device screen (standard Android install prompt) -- this varies
   by device/firmware configuration.

**What's still needed before this is usable:** an actual built
`terminal-app/android` `.apk` (debug or signed release). As of this
writing, the project has been synced and typechecks/builds cleanly,
but no real Android Studio build has been completed yet -- this is
the same "build it in Android Studio, on your machine" step already
underway for the main `android/` project. Once a real `.apk` exists
(from **Build > Generate Signed Bundle / APK > APK**, not the Play
Store `.aab` bundle format), this USB method is the fastest way to get
it onto a real device buyer's unit for testing or production use,
without needing Play Store publication, review, or even needing the
buyer to have a Google account.

**For updates:** replacing the `.apk` in the `DecardApk` folder and
re-inserting the drive with a fresh power-on should update an already-
installed copy the same way -- worth confirming this specific update
(not just first-install) behavior once real devices are available to
test against.

## 2. OTA firmware upgrade (device's Android OS itself, not the app)

This is unrelated to the VINK Terminal app -- it updates the P18Q's
own underlying system firmware. Only relevant if the device itself
needs a firmware update (e.g., a security patch or OS-level fix from
the manufacturer), not for app deployment.

**Steps:**
1. Place the OTA package (`.zip`) in the root directory of a USB flash
   drive.
2. Insert into the device's USB port.
3. On the device: **Settings -> System -> Advanced -> System Update ->
   Upgrade**.
4. Do not power off during the upgrade -- the device restarts
   automatically when done.

**Package types:**
- **Full package** (~500MB): named as `<product-model>-ota-<version>.zip`
  (e.g., `p18q_x1-ota-20201111.114648.zip`). Can upgrade from any prior
  version.
- **Differential/incremental package** (~50MB): named as
  `<product-model>-ota-<original-version>-<upgraded-version>.zip`
  (e.g., `f11_x1-ota-20201124.120622-20201208.170826.zip`). Requires
  the device to already be on the exact original version named in the
  filename.

**Checking the current firmware version on a device:**
**Settings -> System -> Advanced -> About Device** -- version number
shown at the bottom.

**Model-name quirk worth knowing:** `p18q_dual` and `p18q_dual_extend`
share identical hardware and are mutually upgradable, but the OTA
package's embedded product-model string must match the device's
current model name exactly, or the upgrade will be rejected. If they
don't match, the vendor's documentation says the model name embedded
in the package filename can be manually edited to match (e.g. renaming
`p18q_dual_extend-ota-20220530.113925.zip` to
`p18q_dual-ota-20220530.113925.zip` or vice versa) -- confirm the
device's actual current model via the same About Device screen before
attempting this, and treat this rename as a vendor-documented but
still fairly manual workaround, not a routine step.
