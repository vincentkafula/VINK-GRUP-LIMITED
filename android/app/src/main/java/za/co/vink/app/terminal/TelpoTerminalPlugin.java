package za.co.vink.app.terminal;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges the web app (src/app/services/telpoTerminal.ts) to the physical
 * Telpo T-T20's card-reading hardware.
 *
 * HONEST STATE OF THIS FILE: there is no certified EMV kernel integrated
 * here. Every method below is a real, correctly-structured Capacitor
 * plugin method -- the plumbing is genuine -- but startCardListener()
 * currently just returns a clear "not integrated" error rather than
 * fabricating tap events or guessing at Telpo's actual SDK API, which
 * this project does not have access to.
 *
 * WHAT HAPPENS ONCE THE REAL TELPO SDK IS AVAILABLE:
 * 1. Telpo ships their SDK as a .aar file. Drop it into
 *    android/app/libs/ and add
 *      implementation files('libs/telpo-sdk.aar')
 *    to android/app/build.gradle's dependencies block.
 * 2. Import Telpo's real card-reader API (their actual class/package
 *    names, which will be in their SDK's own documentation -- do not
 *    guess at these; using a class that doesn't exist won't compile,
 *    and using the wrong method signature will fail confusingly at
 *    runtime instead).
 * 3. In startCardListener() below, replace the "not integrated" JSObject
 *    result with a real call into Telpo's card-reader listener/callback
 *    API, translating their SDK's tap-event callback into the
 *    "cardTapped" event this class already fires correctly via
 *    notifyListeners() -- that part of the plumbing does not need to
 *    change.
 * 4. Whatever masked PAN / scheme / EMV cryptogram reference Telpo's SDK
 *    returns should be sent, unmodified in shape, straight to
 *    POST /api/terminal/tap (see server/src/routes/terminalRouter.ts) --
 *    that endpoint already rejects anything that looks like a full,
 *    unmasked card number, so the masking discipline is enforced on
 *    both ends, not just trusted from the device.
 */
@CapacitorPlugin(name = "TelpoTerminal")
public class TelpoTerminalPlugin extends Plugin {

    private boolean listening = false;

    @PluginMethod
    public void startCardListener(PluginCall call) {
        // See the class-level comment above. This is deliberately NOT a
        // simulated tap or fabricated success response -- a caller that
        // thinks this succeeded when no real reader is attached is a
        // worse failure mode than a caller that gets a clear error.
        JSObject ret = new JSObject();
        ret.put("started", false);
        ret.put("error", "Telpo SDK not integrated. See the comment at the top of TelpoTerminalPlugin.java for the real integration steps once Telpo's SDK is available.");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopCardListener(PluginCall call) {
        listening = false;
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        // Reports whether a real card reader is actually available on
        // this device -- always false until step 2-3 above are done.
        // The web app should check this before offering "tap to pay" in
        // the UI at all, rather than showing a control that will always
        // fail.
        JSObject ret = new JSObject();
        ret.put("ready", false);
        call.resolve(ret);
    }

    /**
     * Called from inside the real Telpo SDK's own tap callback once
     * integrated (see step 3 in the class comment) -- fires the
     * "cardTapped" event up to the web app. This method itself is
     * correct and ready to use as-is; it is not part of what needs
     * rewriting when the real SDK arrives.
     */
    private void emitCardTapped(String maskedPan, String scheme, String cardholderVerification, String emvCryptogramRef) {
        JSObject data = new JSObject();
        data.put("maskedPan", maskedPan);
        data.put("scheme", scheme);
        data.put("cardholderVerification", cardholderVerification);
        data.put("emvCryptogramRef", emvCryptogramRef);
        notifyListeners("cardTapped", data);
    }
}
