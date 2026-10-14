# The P18Q bus validator (Decard SDK)

The whole tap flow also runs on the P18Q: the same fare, ticket, sync and journal code as the Raspberry Pi validator, in the terminal app's web view, with a thin native plugin that gives it hands (`terminal-app/android/.../AfcDevicePlugin.java`).

```
terminal-app web view                          native (Java)
  src/afc/boot.ts  ──registerPlugin("AfcDevice")──►  AfcDevicePlugin ──► Decard SDK (BasicOper) ──► reader
    └ @afc/terminal   (AfcTerminal: poll loop)                 ├ journal file (fsync, atomic replace)
        └ @afc/shared (TapProcessor, TicketProcessor,           └ AfcKeyStore (Android Keystore, AES-CMAC)
           SyncClient, JournalStore, crypto: noble)
```

## What was checked, and how

| Piece | Checked how |
|---|---|
| Shared fare/ticket/sync code runs with no Node built-ins | Bundled for the browser (`vite build`, no `node:` imports); same 200+ tests |
| Tap flow through the plugin contract (DESFire fare, Ultralight C ticket, one visit = one tap, 4-byte UID refused, journal write failure stops the fare, restart keeps taps) | `terminal/test/terminal.test.ts` against a fake plugin with software cards |
| Journal durability (crash replay, half-written last line, failed write retried, compaction) | `shared/test/journalStore.test.ts` |
| Java compiles against the vendor's real `classes.jar` and `android.jar` | `javac` (so every `BasicOper` method name and signature used exists) |
| AES-CMAC in Java (the Keystore path) | RFC 4493 vectors on a plain JVM (`AfcCmacTest.java`) |
| Ultralight C ticket logic | `shared/test/ultralightC.test.ts` against a software chip |

## What was NOT checked: do these on a real P18Q first

The `BasicOper` calls have never run on a unit. In this order (also at the top of `AfcDevicePlugin.java`):

1. `poll()`: `dc_card_hex(1)` returns the UID of a DESFire and of an Ultralight C; `dc_pro_resethex()` succeeds only for the DESFire.
2. `ulRead` / `ulWrite`: `dc_read_hex(page)` returns 16 bytes; `dc_write_hex(page, 8 hex)` writes one 4-byte page.
3. `ulcAuth` / `ulcSetKey`: write a key, then authenticate with it; check the key byte order (the chip stores the halves reversed, the SDK should hide that).
4. `apdu`: `dc_pro_commandhex` returns the card's answer including the two status bytes. Then run `npm run selftest -- --reader`-style steps against a **spare** DESFire.
5. `beep` unit.
6. Keystore: `keyStatus()` says whether the keys are hardware backed on your unit.

## Tickets on this device are Ultralight C

The SDK has no raw "type A" command, so the Ultralight EV1 password check cannot be made through it. Tickets for the P18Q are **MIFARE Ultralight C** (MF0ICU2): a 16-byte two-key 3DES key per card, derived from the `TICKET` master key, protects pages 4 and up (`AUTH0 = 4`, `AUTH1 = 1`: reads free, writes need the key). There is no configuration-lock bit on Ultralight C; the AUTH pages are themselves above `AUTH0`, so only the key holder can change them. The signature, UID binding, one-use record and server checks are the same as for EV1.

## Keys on the device

Import each master key once from a provisioning screen (`keyImport`; never logged, never returned). After that the web view and the app cannot read it back: every card key is `AES-CMAC(master, 01 || UID || AID || system id || role)` computed inside the Keystore (`keyDiversify`). A validator needs only `DEBIT` and `TICKET`.

- This stops the master key being copied off the device by anything that takes over the app. It does not stop such code from asking for card keys.
- Whether the Keystore is backed by secure hardware depends on the unit; `keyStatus()` reports `hardwareBacked`.
- An NXP SAM in one of the P18Q's SAM slots would keep keys out of the app entirely. **Not built:** it needs the SAM's command set (SAM AV3 documentation under NDA).
