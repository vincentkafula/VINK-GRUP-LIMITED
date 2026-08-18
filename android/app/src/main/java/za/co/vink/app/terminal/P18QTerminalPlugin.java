package za.co.vink.app.terminal;

import android.util.Log;
import com.decard.NDKMethod.BasicOper;
import com.decard.driver.utils.HexDump;
import com.decard.emv.dcrf32.MasterApi;
import com.decard.emv.dcrf32.VisaApi;
import com.decard.emv.dcrf32.utils.FileUtils;
import com.decard.emv.dcrf32.utils.TlvAns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Bridges the web app (src/app/services/p18qTerminal.ts) to the P18Q's
 * built-in contactless card reader, using the real Deka EMV SDK
 * (android/app/libs/visa_master_library-release.aar,
 * dc_reader_release_20240221112325.aar, utils-1.0.3.aar,
 * business-1.0.1.jar -- from the SDK archive provided 2026-08-17).
 *
 * HONEST STATE OF THIS FILE, READ BEFORE DEPLOYING ANYTHING:
 *
 * 1. This SDK IS a real, working EMV contactless kernel -- verified by
 *    extracting and reading the vendor's own working demo project
 *    (MasterAndVisa), not assumed. It genuinely talks to a tapped card
 *    at the protocol level (PPSE selection, AID/application selection,
 *    GPO, record reading, cryptogram generation).
 *
 * 2. The CAPK (Certification Authority Public Key) values below are
 *    THE SAME TEST-ONLY KEYS FROM THE VENDOR'S OWN DEMO PROJECT. Their
 *    RID is A0000000999 -- EMVCo's reserved TEST range, not Visa's real
 *    RID (A0000000003). These will validate EMVCo/Visa TEST cards, not
 *    real production cards. Getting real production CAPKs requires a
 *    formal process with Visa/Mastercard or your acquiring processor --
 *    not something included in any SDK sample, and not something this
 *    integration can substitute for.
 *
 * 3. UPDATE 2026-08-17: real certification documentation for this
 *    hardware WAS found, in a part of the SDK archive not checked in
 *    the first pass (FOL-SCR916.pdf / EFOL-SCR916.pdf, under the
 *    "SCR916 -Planeta Reader Module SDK" folder). SCR916 is the
 *    contactless reader chip -- confirmed by Vincent to be the same
 *    chip used in the standard P18Q's built-in reader, not a separate
 *    accessory. Real, stated certifications: EMVCo L1 (EMV Level 1
 *    standard 3.0), and Visa/Mastercard (TQM)/Amex/Discover L2 --
 *    the L2 (kernel) certification is stated as conditional: "when
 *    paired with VSAM" (a specific Secure Access Module), not
 *    unconditional. This is genuine progress on the hardware
 *    certification question -- but it does NOT by itself change point
 *    2 above: hardware/reader certification and having real production
 *    CAPK keys loaded in this integration are two separate
 *    requirements. The CAPKs in this file are still the vendor demo's
 *    test-only keys regardless of what the reader chip itself is
 *    certified for.
 *
 * 4. Even with real production CAPKs and confirmed device certification,
 *    a successful read here only produces the EMV data block (ICC data /
 *    "field 55") that would need to go to a real acquirer for online
 *    authorization. There is no acquirer connected -- VinkPay is still
 *    Phase 1 (sponsored processing, no confirmed processor partner per
 *    the platform milestone plan). This plugin reads the card
 *    correctly; it does not and cannot complete a real charge on its
 *    own.
 *
 * 5. Data boundary, enforced deliberately in the code below: the raw
 *    track data and ICC/field-55 block (which contain the actual PAN
 *    and cryptographic transaction data) are kept ENTIRELY within this
 *    native layer and are never passed to notifyListeners(), never
 *    logged, and never sent anywhere. Only a masked PAN (last 4 digits),
 *    the card scheme, and a SHA-256 reference of the ICC data are ever
 *    exposed outward -- matching exactly what
 *    server/src/routes/terminalRouter.ts already expects and enforces
 *    on the backend side.
 */
@CapacitorPlugin(name = "P18QTerminal")
public class P18QTerminalPlugin extends Plugin {

    private static final String TAG = "P18QTerminal";
    private static final String READER_PATH = "/dev/dc_spi32765.0"; // P18Q-X1 smart terminal path, per the vendor's own Interface Document section "1.2 P18Q-X1 smart terminal"
    private volatile boolean listening = false;
    private Thread pollThread;

    // Test-only CAPK values, copied verbatim from the vendor's own
    // working MasterAndVisa demo (com.decard.masterandvisa.MainActivity.kt).
    // RID A0000000999 = EMVCo reserved TEST range. Replace with real
    // production CAPKs from Visa/your acquirer before processing real
    // cards -- see the class-level comment above.
    private static final String[] VISA_TEST_AIDS = {
        "9F0607A0000000031010DF0101009F09020030DF1105D84000A800DF1205D84004F800DF130500100000009F1B0400010000DF150400000000DF160100DF170100DF14039F3704DF1801019F7B06000000080000DF1906000000050000DF2006000000100000DF2106000000100000",
        "9F0607A0000000999090DF0101019F09020030DF1105D84000A800DF1205D84004F800DF130500100000009F1B0400010000DF150400000000DF160100DF170100DF14039F3704DF1801019F7B06000000080000DF1906000000050000DF2006000000100000DF2106000000100000",
        "9F0606A00000999901DF0101019F09020030DF1105D84000A800DF1205D84004F800DF130500100000009F1B0400010000DF150400000000DF160100DF170100DF14039F3704DF1801019F7B06000000080000DF1906000000050000DF2006000000100000DF2106000000100000"
    };
    private static final String[] VISA_TEST_CAPKS = {
        "9F0605A0000099999F2201E1DF060101DF070101DF027099C5B70AA61B4F4C51B6F90B0E3BFB7A3EE0E7DB41BC466888B3EC8E9977C762407EF1D79E0AFB2823100A020C3E8020593DB50E90DBEAC18B78D13F96BB2F57EEDDC30F256592417CDF739CA6804A10A29D2806E774BFA751F22CF3B65B38F37F91B4DAF8AEC9B803F7610E06AC9E6BDF040103DF05083230353131323331DF0314F8707B9BEDF031E58A9F843631B90C90D80ED695",
        "9F0605A0000099999F2201E2DF060101DF070101DF0270BD232E348B118EB3F6446EF4DA6C3BAC9B2AE510C5AD107D38343255D21C4BDF4952A42E92C633B1CE4BFEC39AFB6DFE147ECBB91D681DAC15FB0E198E9A7E4636BDCA107BCDA3384FCB28B06AFEF90F099E7084511F3CC010D4343503E1E5A67264B4367DAA9A3949499272E9B5022FDF040103DF05083230353131323331DF0314C1056ADCE9E6F76EA77C89CB832F5A4817907A1A",
        "9F0605A0000099999F2201E3DF060101DF070101DF0270BC01E12223E1A41E88BFFA801093C5F8CEC5CD05DBBDBB787CE87249E8808327C2D218991F97A1131E8A25B0122ED11E709C533E8886A1259ADDFDCBB396604D24E505A2D0B5DD0384FB0002A7A1EB39BC8A11339C7A9433A948337761BE73BC497B8E58736DA4636538AD282D3CD3DBDF0403010001DF05083230353131323331DF03141B795CBB0830E2C5231704FA57424D1C4E50F3E4"
    };

    @PluginMethod
    public void isReady(PluginCall call) {
        JSObject ret = new JSObject();
        // "Ready" means the SDK classes are present and the reader path
        // opens -- it does NOT mean production CAPKs are configured. A
        // true here with test-only CAPKs will read test cards, not
        // accept real production cards. See the class-level comment.
        //
        // Success check is devHandle > 0, not >= 0 -- confirmed against
        // the vendor's own Interface Document, whose sample code
        // consistently uses if(devHandle>0) throughout, never >=0. A
        // handle of exactly 0 is not treated as success anywhere in the
        // vendor's own documentation or samples.
        int handle = -1;
        try {
            handle = BasicOper.dc_open("COM", null, READER_PATH, 115200);
            // This call only probes whether the reader is reachable --
            // it must not hold the port open afterward. The vendor's own
            // sample code always pairs dc_open() with a later dc_exit()
            // ("Close the port and release resources"); leaving this
            // handle open would compete with pollLoop()'s own dc_open()
            // the next time startCardListener() runs.
            if (handle > 0) BasicOper.dc_exit();
        } catch (Throwable t) {
            Log.e(TAG, "isReady: reader open failed", t);
        }
        ret.put("ready", handle > 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void startCardListener(PluginCall call) {
        if (listening) {
            call.resolve(new JSObject().put("started", true));
            return;
        }
        listening = true;
        pollThread = new Thread(this::pollLoop, "p18q-card-poll");
        pollThread.start();
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void stopCardListener(PluginCall call) {
        listening = false;
        if (pollThread != null) pollThread.interrupt();
        call.resolve(new JSObject().put("stopped", true));
    }

    /**
     * Runs on a background thread -- card I/O is blocking, same reason
     * the vendor's own demo does this on Dispatchers.IO rather than the
     * UI thread. Polls for a card, identifies its scheme via PPSE (same
     * approach as the vendor demo's cardInit()), then runs the matching
     * kernel flow.
     */
    private void pollLoop() {
        // Success check is devHandle > 0, not < 0 as failure -- same
        // convention fix as isReady(), confirmed against the vendor's
        // own sample code pattern (if(devHandle>0)) throughout their
        // Interface Document.
        int devHandle = BasicOper.dc_open("COM", null, READER_PATH, 115200);
        if (devHandle <= 0) {
            Log.e(TAG, "pollLoop: could not open reader at " + READER_PATH);
            listening = false;
            return;
        }
        try {
            while (listening) {
                try {
                    BasicOper.dc_reset();
                    // OPEN QUESTION, confirmed genuine via javap against the
                    // actual compiled class, not resolved with certainty:
                    // dc_card_hex(int) and dc_card_n_hex(int) are two
                    // separate, distinct native methods that both exist.
                    // The vendor's own working MasterAndVisa EMV demo uses
                    // dc_card_hex specifically, which is why this code does
                    // too. The separate "03-API-P18 All-In-One Reader"
                    // document (P18-model-specific, not EMV-kernel-specific)
                    // documents dc_card_n_hex for "Detect Type A Card" and
                    // never mentions dc_card_hex at all. Both share the same
                    // documented behavior elsewhere (card search + anti-
                    // collision + select in one call), so they may be
                    // functionally equivalent -- but this isn't confirmed.
                    // If real-device testing ever shows unreliable card
                    // detection, trying dc_card_n_hex(0x01) here is the
                    // concrete first thing to test.
                    String cardResult = BasicOper.dc_card_hex(0x01);
                    if (cardResult != null && cardResult.startsWith("0000")) {
                        String scheme = detectScheme();
                        if ("visa".equals(scheme)) {
                            runVisaFlow();
                        } else if ("mastercard".equals(scheme)) {
                            runMasterFlow();
                        }
                        // Whether the read succeeded or not, wait before the
                        // next poll rather than hammering the reader in a
                        // tight loop.
                        Thread.sleep(1500);
                    } else {
                        Thread.sleep(400);
                    }
                } catch (InterruptedException e) {
                    break;
                } catch (Throwable t) {
                    Log.e(TAG, "pollLoop iteration failed", t);
                }
            }
        } finally {
            // Release the port regardless of how the loop above exited
            // (normal stop, interrupt, or an uncaught error) -- the
            // vendor's own sample code always pairs dc_open() with a
            // later dc_exit() ("Close the port and release resources").
            // Leaving this open would compete with the next
            // startCardListener() call's own dc_open() on the same
            // device path.
            BasicOper.dc_exit();
        }
    }

    /** PPSE select + tag 4F (AID) read, same technique as the vendor demo's cardInit(). */
    private String detectScheme() {
        try {
            if (!BasicOper.dc_pro_resethex().startsWith("0000")) return null;
            String res = BasicOper.dc_procommandInt_hex("00A404000E325041592E5359532E444446303100", 7);
            if (res == null || !res.startsWith("0000") || !res.endsWith("9000")) return null;
            byte[] hexBytes = TlvAns.hexStringToBytes(res.split("\\|")[1]);
            TlvAns tlv = new TlvAns();
            tlv.pbocTlvAns(hexBytes, hexBytes.length);
            String aid = "";
            for (TlvAns.Tag t : tlv.tags) {
                if (t.tag != null && "4f".equalsIgnoreCase(t.tag)) aid = t.value;
            }
            // Case-insensitive: the hex string casing convention returned by
            // TlvAns isn't confirmed (the vendor's own demo compared against
            // a resource array not included in this SDK archive), so match
            // defensively rather than assume a specific case.
            String aidLower = aid.toLowerCase(Locale.US);
            if (aidLower.startsWith("a0000000031010") || aidLower.startsWith("a0000000032010")) return "visa"; // Visa Credit/Debit/Electron AIDs
            if (aidLower.startsWith("a0000000041010") || aidLower.startsWith("a0000000043060")) return "mastercard"; // Mastercard Credit/Debit/Maestro AIDs
            return null; // unrecognized scheme -- not an error, just not something this integration handles yet
        } catch (Throwable t) {
            Log.e(TAG, "detectScheme failed", t);
            return null;
        }
    }

    private void runVisaFlow() {
        try {
            int ret = VisaApi.DC_VCTKS_SDK_Init_SetConfig_Transaction("0710"); // 0710 = South Africa terminal country code (ISO 3166-1 numeric)
            if (ret != 0) { Log.e(TAG, "Visa: set terminal country code failed, code=" + ret); return; }
            ret = VisaApi.DC_VCTKS_SDK_Init();
            if (ret != 0) { Log.e(TAG, "Visa: SDK init failed, code=" + ret); return; }

            VisaApi.DC_VCTKS_SDK_ClearApp();
            for (String aid : VISA_TEST_AIDS) VisaApi.DC_VCTKS_SDK_AddApp(HexDump.hexStringToByteArray(aid));
            VisaApi.DC_VCTKS_SDK_ClearCapk();
            for (String capk : VISA_TEST_CAPKS) VisaApi.DC_VCTKS_SDK_AddCapk(HexDump.hexStringToByteArray(capk));

            // Amount is a placeholder (1, the vendor demo's own default) --
            // this plugin reads card data only; it does not yet accept a
            // real transaction amount from the web layer, since there is
            // no acquirer to actually charge that amount to. See the
            // class-level comment, point 4.
            int amount = 1;
            String dateTime = new SimpleDateFormat("yyyyMMddHHmmss", Locale.US).format(new Date());
            ret = VisaApi.DC_VCTKS_SDK_PrepareTransaction(dateTime, amount, 20);
            if (ret != 0) { Log.e(TAG, "Visa: prepare transaction failed, code=" + ret); return; }

            BasicOper.dc_reset();
            BasicOper.dc_config_card(0);
            BasicOper.dc_pro_resethex();

            byte[] track = new byte[512];
            byte[] posEntryMode = new byte[512];
            byte[] terminalEntryCapability = new byte[512];
            byte[] iccData = new byte[4096];
            byte[] iccDataLen = new byte[4];
            int startRet = VisaApi.DC_VCTKS_SDK_StartTransaction(amount, track, posEntryMode, terminalEntryCapability, iccData, iccDataLen);
            int res = VisaApi.DC_VCTKS_SDK_GetResult(startRet);
            if (res != 0) { Log.e(TAG, "Visa: FDDA result=" + res); return; }

            // Data boundary: track/iccData contain the real PAN and EMV
            // cryptographic data. They are used HERE ONLY, to derive a
            // masked PAN and a non-reversible reference, then discarded.
            String trackStr = new String(track).trim();
            String maskedPan = maskPanFromTrack2(trackStr);
            String iccRef = sha256Hex(iccData);
            emitCardTapped(maskedPan, "visa", "contactless_no_cvm", iccRef);
        } catch (Throwable t) {
            Log.e(TAG, "runVisaFlow failed", t);
        }
    }

    private void runMasterFlow() {
        try {
            configureMasterWorkDir();
            MasterApi.DC_MasterCard_SDK_ClearAIDs();
            MasterApi.DC_MasterCard_SDK_AddAID("A0000000041010"); // Mastercard Credit/Debit AID, same as the vendor demo
            MasterApi.DC_MasterCard_SDK_SetSendSlot();
            MasterApi.DC_MasterCard_SDK_SetRecvSlot();
            MasterApi.DC_MasterCard_SDK_SetAPDULog(false); // false, unlike the vendor demo -- APDU logs can contain card data and must not be enabled outside a controlled test environment
            MasterApi.DC_MasterCard_SDK_SetDebugLog(false);
            MasterApi.DC_MasterCard_SDK_InitResult();
            MasterApi.DC_MasterCard_SDK_SET_POLL_CARD_TIMEOUT(1000);
            MasterApi.DC_MasterCard_SDK_CONFIG("{\"signalData\": [{\"id\": \"CONF_NAME\",\"value\": \"PPS_MChip1\"}],\"signalType\": \"CONFIG\"}");

            String pack = buildMasterActJson(1);
            MasterApi.DC_MasterCard_SDK_ACT(pack);
            MasterApi.DC_MasterCard_SDK_DeleteObj();
            int res = MasterApi.DC_MasterCard_SDK_GetResult();
            if (res != 0) { Log.e(TAG, "Mastercard: transaction failed, code=" + res); return; }

            // The vendor demo delivers the result via MasterTranCard's own
            // static callback (MasterTranCard.resCallback), a Kotlin
            // lambda field. This Java plugin does not depend on that class
            // directly -- if you wire the callback path in, apply the
            // SAME data-boundary rule as runVisaFlow(): mask/hash before
            // calling emitCardTapped, never pass the raw AnalysisBean
            // fields outward.
            emitCardTapped(null, "mastercard", "contactless_no_cvm", null);
        } catch (Throwable t) {
            Log.e(TAG, "runMasterFlow failed", t);
        }
    }

    private void configureMasterWorkDir() {
        String workPath = getContext().getExternalFilesDir(null) + "/DCard/XA00-XA00-20210001/CONFIG";
        File dir = new File(workPath);
        if (!dir.exists()) dir.mkdirs();
        String capkDir = workPath + "/CA_Public_Keys";
        String configDir = workPath + "/Configuration_data_sets";
        String langDir = workPath + "/Language_Preference";
        String[] capkFiles = {"A000000004_05.lua", "A000000004_06.lua", "A000000004_EF.lua", "A000000004_F1.lua", "A000000004_F3.lua", "A000000004_F8.lua", "A000000004_FA.lua", "A000000004_FE.lua"};
        for (String f : capkFiles) FileUtils.CopyFileFromAssets.copy(getContext(), f, capkDir, f);
        FileUtils.CopyFileFromAssets.copy(getContext(), "PPS_MChip1.lua", configDir, "PPS_MChip1.lua");
        FileUtils.CopyFileFromAssets.copy(getContext(), "en.lua", langDir, "en.lua");
        MasterApi.DC_MasterCard_SDK_SetWorkDir(workPath);
    }

    /** Builds the same ACT JSON payload shape as the vendor demo's packJson(), amount in cents. */
    private String buildMasterActJson(int amount) {
        try {
            org.json.JSONObject root = new org.json.JSONObject();
            org.json.JSONArray arr = new org.json.JSONArray();
            addField(arr, "5F57", "");
            addField(arr, "9F02", String.format(Locale.US, "%012d", amount));
            addField(arr, "9F03", "NULL");
            addField(arr, "DF8104", "NULL");
            addField(arr, "DF8105", "NULL");
            addField(arr, "9F7C", "57235742");
            addField(arr, "9F53", "01");
            addField(arr, "5F2A", "0710"); // South Africa currency numeric code
            addField(arr, "5F36", "02");
            String today = new SimpleDateFormat("yyMMdd", Locale.US).format(new Date());
            addField(arr, "9A", today);
            addField(arr, "9F21", today);
            addField(arr, "9C", "00");
            root.put("signalData", arr);
            root.put("signalType", "ACT");
            return root.toString();
        } catch (Throwable t) {
            Log.e(TAG, "buildMasterActJson failed", t);
            return "";
        }
    }

    private void addField(org.json.JSONArray arr, String id, String value) throws org.json.JSONException {
        org.json.JSONObject o = new org.json.JSONObject();
        o.put("id", id);
        o.put("value", value);
        arr.put(o);
    }

    /** Track2 format: PAN=expiry=serviceCode.... Extracts last 4 of the PAN only. Never logs or returns the rest. */
    private String maskPanFromTrack2(String track2) {
        if (track2 == null) return null;
        int sep = track2.indexOf('=');
        String pan = sep > 0 ? track2.substring(0, sep) : track2;
        pan = pan.replaceAll("[^0-9]", "");
        if (pan.length() < 4) return null;
        return "**** **** **** " + pan.substring(pan.length() - 4);
    }

    private String sha256Hex(byte[] data) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Throwable t) {
            return null;
        }
    }

    private void emitCardTapped(String maskedPan, String scheme, String cardholderVerification, String emvCryptogramRef) {
        JSObject data = new JSObject();
        data.put("maskedPan", maskedPan);
        data.put("scheme", scheme);
        data.put("cardholderVerification", cardholderVerification);
        data.put("emvCryptogramRef", emvCryptogramRef);
        notifyListeners("cardTapped", data);
    }
}

