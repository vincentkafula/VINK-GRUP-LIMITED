# VINK Router CWMP Client

A real, verified TR-069/CWMP client -- the device-side software a VINK
router would run to talk to a real GenieACS ACS instance
(`server/src/services/genieAcsClient.ts` is the server-side
counterpart, already built and verified against GenieACS's own docs).

## What's real here

- The actual CWMP session protocol: `Inform` first (required by spec),
  `InformResponse`, an empty-POST poll loop, and handling of
  `GetParameterValues`, `SetParameterValues`, `Reboot`, and `Download`
  RPCs from the ACS.
- SOAP/XML envelope construction and parsing, matching the real,
  verified structure -- cross-checked against the official Broadband
  Forum TR-069 spec PDF and multiple independent worked examples
  before any of it was written.
- The Connection Request listener (`GET /ConnectionRequest`), so a
  real ACS can trigger an immediate session rather than waiting for
  the next periodic check-in -- confirmed consistent with
  `genieAcsClient.ts`'s own `connection_request` query parameter.
- Verified with a real, full end-to-end session test: a local HTTP
  server acting as a fake ACS, exchanging real messages with this
  client, including a genuine `GetParameterValues` round-trip that
  returned the correct value from the parameter store.

## What's honestly NOT built

- **Full OpenWrt firmware.** This is application-level Node.js code
  implementing a protocol, not a kernel, driver set, or firmware
  build. Needs real router hardware to build and test against, the
  same limitation the retail-pos-app/till-app card readers have for
  their own hardware.
- **Real hardware integration for the parameter model.** WiFi SSID,
  WAN status, and every other parameter in `parameterModel.ts` is an
  honest in-memory store standing in for what real hardware state
  would populate. Wiring `GetParameterValues`/`SetParameterValues` to
  actually read/change hostapd config, modem state, etc. is a separate
  integration step for whichever specific hardware this runs on.
- **A real, IEEE-assigned OUI.** The placeholder `00147F` is in the
  correct 6-hex-digit shape but is not an OUI actually assigned to
  VINK -- a real one needs IEEE registration before production use.
- **TransferComplete RPC** for reporting a firmware download's actual
  completion asynchronously -- `Download` is acknowledged, but the
  follow-up completion report isn't implemented yet.
- **Bootstrap-vs-boot distinction.** The spec has a real difference
  between `0 BOOTSTRAP` (first-ever contact with an ACS) and `1 BOOT`
  (every other startup), which needs state persisted across restarts
  to tell apart. This client always sends `1 BOOT`, a simplification
  worth knowing about rather than silently treating as equivalent.

## Running it

```
npm install
npm run build
CWMP_ACS_URL=http://your-genieacs-host:7557/ CWMP_SERIAL_NUMBER=REAL-SERIAL npm start
```
