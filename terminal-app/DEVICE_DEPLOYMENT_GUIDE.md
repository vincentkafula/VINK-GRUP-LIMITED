# P18Q Device Deployment Guide

Three separate procedures, all using a USB flash drive but for
genuinely different things. Don't confuse them.

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

## 3. Card reader firmware upgrade (the EMV reader chip's own firmware -- not the device OS, not the app)

A third, separate thing again. This updates the firmware running
*inside the physical contactless reader module itself* -- the
component `P18QTerminalPlugin.java` actually talks to via `BasicOper`,
`VisaApi`, and `MasterApi`. Directly relevant to the EMV integration:
if card detection or reading is ever unreliable in a way that looks
like a hardware/firmware issue rather than an app bug, checking for
a reader firmware update is a legitimate first troubleshooting step,
separate from anything in the app's own code.

**This requires installing a separate, dedicated app first**
(`DeCard_Firmware_Upgrade_Tool_V1.0.3.apk`) -- not the VINK Terminal
app, a vendor-provided maintenance tool. Install this the same way as
any `.apk` (via the `DecardApk` USB method above, or ADB) before
following the steps below.

**Steps:**
1. Prepare a **FAT32-formatted** USB flash drive specifically (not
   exFAT or NTFS -- this matters, unlike the `DecardApk` method above
   which doesn't specify a filesystem requirement).
2. Create a `/DECARD_ANDROID/firmware` folder in the root directory,
   and copy the reader firmware package (a `.drv` file) into it. If
   this is the first time using this tool, the vendor recommends just
   copying their entire provided `DECARD_ANDROID` folder to the drive
   root directly, rather than recreating the folder structure by hand.
3. Open the DeCard Firmware Upgrade Tool app on the device, then
   insert the USB drive -- it auto-detects and loads the firmware
   package from the drive.
4. Once the firmware file is auto-selected, tap the upgrade button to
   start.
5. The device powers off automatically when the firmware upgrade
   finishes. After it restarts, the upgrade tool app lets you confirm
   whether the upgrade succeeded.

**Note:** unlike the `DecardApk` app-install method, this specifically
needs its own dedicated upgrade tool app running and open on the
device *before* inserting the drive -- it's not a passive
"plug in and it installs" flow the way app installation is.

## 4. Diagnostics -- capturing SAM and RF logs

Two separate log-capture procedures, useful when card reading behaves
unexpectedly on real hardware. This is the concrete way to actually
investigate the open `dc_card_hex` vs `dc_card_n_hex` question flagged
directly in `P18QTerminalPlugin.java`'s `pollLoop()` -- if card
detection is ever unreliable, these logs are what would show whether
it's an RF/reader-level issue versus something in the app's own EMV
kernel handling.

### SAM (Secure Access Module) log
1. Run the SAM card application (a vendor-provided test/demo app
   distinct from VINK Terminal).
2. Use its "read PSAM log" / "write PSAM log" functions as needed.
3. Pull the resulting log file to your computer:
   ```
   adb pull /sdcard/data/data/DecardP18qDemo.txt
   ```

### RF (radio frequency / contactless reader) log
1. Run the actual business application being diagnosed (for this
   project, that's VINK Terminal itself -- tap a card, let the flow
   complete, then close the app). This is the step that produces the
   RF activity worth capturing.
2. Run the separate `DcReadRFLog` vendor diagnostic app, tap
   **"read log"**.
3. Tap **"save log"** -- written to `/sdcard/DcReadRFLog.txt` on the
   device. Pull it the same way as the SAM log above if you need it on
   a computer (`adb pull /sdcard/DcReadRFLog.txt`).

**When this is worth doing:** if a real device ever shows card taps
not being detected reliably, or the wrong card scheme being identified
(Visa vs. Mastercard), capturing an RF log immediately after
reproducing the issue -- before doing anything else on the device --
is the vendor-recommended way to get a real diagnostic trace, rather
than guessing from app-level logs (`Log.e(TAG, ...)` calls) alone.
