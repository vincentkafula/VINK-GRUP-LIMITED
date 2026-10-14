package za.co.vink.terminal;

import android.util.Log;
import com.decard.NDKMethod.BasicOper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fare-collection (AFC) bridge between the web view and the P18Q's built-in reader, through the Decard SDK (BasicOper). It is deliberately thin:
 * it moves bytes and keeps nothing but the journal file and the Keystore keys. Every decision (fares, tickets, what to write to a card) is made in the
 * shared TypeScript code (afc-system/shared) which this plugin only gives hands to: see afc-system/terminal/src/plugin.ts for the contract.
 *
 * STATE OF THIS FILE, READ BEFORE DEPLOYING: it compiles against the vendor's classes.jar (checked), and its pure parts (AfcCmac) are run on a JVM against the RFC 4493
 * vectors. The calls into BasicOper have NOT been run on a P18Q. The SDK documents its answers as "0000|<hex>" strings; the parsing below follows the
 * vendor's own samples. Points to check on the bench first, in this order:
 *   1. poll(): that dc_card_hex(1) gives the UID of a DESFire card and an Ultralight, and that dc_pro_resethex() succeeds only for ISO 14443-4 cards (DESFire).
 *   2. ulRead(): that dc_read_hex(page) on an Ultralight returns 16 bytes (four pages), as the TypeScript expects; ulWrite(): that dc_write_hex(page, 8 hex chars) writes one 4-byte page.
 *   3. ulcAuth() / ulcSetKey(): the byte order the SDK expects for the 16-byte key (the chip stores the two key halves reversed; the SDK should hide that, but check by writing a key and authenticating).
 *   4. apdu(): that dc_pro_commandhex returns the card's answer including the two status bytes, as the existing EMV code assumes.
 *   5. beep(): the unit of dc_beep (the vendor sample suggests 10 ms steps).
 */
@CapacitorPlugin(name = "AfcDevice")
public class AfcDevicePlugin extends Plugin {
    private static final String TAG = "AfcDevice";
    private static final String READER_PATH = "/dev/dc_spi32765.0";     // same path as P18QTerminalPlugin (vendor Interface Document, section 1.2)
    /** The SDK is not re-entrant: every reader call goes through this one thread. */
    private final ExecutorService reader = Executors.newSingleThreadExecutor(r -> new Thread(r, "afc-reader"));
    private boolean open = false;

    interface Work { void run(PluginCall call) throws Exception; }
    private void onReader(PluginCall call, Work w) {
        reader.execute(() -> { try { w.run(call); } catch (Throwable t) { Log.e(TAG, "call failed", t); call.reject(String.valueOf(t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage())); } });
    }

    /** The SDK answers "0000|data" on success and another code otherwise. Returns the data part ("" when there is none) or throws. */
    private static String ok(String answer, String what) {
        if (answer == null) throw new IllegalStateException(what + ": no answer from the reader");
        if (!answer.startsWith("0000")) throw new IllegalStateException(what + ": reader code " + answer);
        int bar = answer.indexOf('|');
        return bar < 0 ? "" : answer.substring(bar + 1);
    }

    /* ───────────────── reader ───────────────── */

    @PluginMethod public void open(PluginCall call) {
        onReader(call, c -> {
            if (!open) {
                int h = BasicOper.dc_open("COM", null, READER_PATH, 115200);
                if (h <= 0) throw new IllegalStateException("could not open the reader at " + READER_PATH);
                open = true;
            }
            c.resolve(new JSObject().put("open", true));
        });
    }

    @PluginMethod public void close(PluginCall call) {
        onReader(call, c -> { if (open) { BasicOper.dc_exit(); open = false; } c.resolve(); });
    }

    /** Looks for a card. {present:false} when none; otherwise its UID (hex) and whether it speaks ISO 14443-4 (DESFire) or not (Ultralight). */
    @PluginMethod public void poll(PluginCall call) {
        onReader(call, c -> {
            BasicOper.dc_reset();
            String found = BasicOper.dc_card_hex(0x01);
            if (found == null || !found.startsWith("0000")) { c.resolve(new JSObject().put("present", false)); return; }
            String uid = ok(found, "card").toLowerCase();
            boolean iso4 = false;
            try { String ats = BasicOper.dc_pro_resethex(); iso4 = ats != null && ats.startsWith("0000"); } catch (Throwable ignored) { /* not a 14443-4 card */ }
            c.resolve(new JSObject().put("present", true).put("uid", uid).put("iso4", iso4));
        });
    }

    /** Sends one command to an ISO 14443-4 card (a DESFire wrapped command) and returns its answer including the two status bytes. */
    @PluginMethod public void apdu(PluginCall call) {
        final String hex = call.getString("hex");
        final int timeout = call.getInt("timeoutMs", 1000) / 100 > 0 ? call.getInt("timeoutMs", 1000) / 100 : 10;
        onReader(call, c -> {
            if (hex == null || !hex.matches("(?i)([0-9a-f]{2})+")) throw new IllegalArgumentException("hex required");
            c.resolve(new JSObject().put("hex", ok(BasicOper.dc_pro_commandhex(hex, timeout), "apdu").toLowerCase()));
        });
    }

    /* ───────────────── Ultralight / Ultralight C ───────────────── */

    @PluginMethod public void ulRead(PluginCall call) {
        final Integer page = call.getInt("page");
        onReader(call, c -> { if (page == null) throw new IllegalArgumentException("page required"); c.resolve(new JSObject().put("hex", ok(BasicOper.dc_read_hex(page), "read").toLowerCase())); });
    }

    @PluginMethod public void ulWrite(PluginCall call) {
        final Integer page = call.getInt("page");
        final String hex = call.getString("hex");
        onReader(call, c -> {
            if (page == null || hex == null || !hex.matches("(?i)[0-9a-f]{8}")) throw new IllegalArgumentException("page and 4 bytes of hex required");
            ok(BasicOper.dc_write_hex(page, hex), "write");
            c.resolve();
        });
    }

    @PluginMethod public void ulcAuth(PluginCall call) {
        final String key = call.getString("keyHex");
        onReader(call, c -> {
            if (key == null || !key.matches("(?i)[0-9a-f]{32}")) throw new IllegalArgumentException("a 16-byte key in hex is required");
            ok(BasicOper.dc_auth_ulc_hex(key), "authenticate");
            c.resolve();
        });
    }

    @PluginMethod public void ulcSetKey(PluginCall call) {
        final String key = call.getString("keyHex");
        onReader(call, c -> {
            if (key == null || !key.matches("(?i)[0-9a-f]{32}")) throw new IllegalArgumentException("a 16-byte key in hex is required");
            ok(BasicOper.dc_changekey_ulc_hex(key), "change key");
            c.resolve();
        });
    }

    /* ───────────────── feedback ───────────────── */

    @PluginMethod public void beep(PluginCall call) {
        final int units = call.getInt("units", 10);
        onReader(call, c -> { BasicOper.dc_beep(units); c.resolve(); });
    }

    /* ───────────────── journal: the device's durable memory (see JournalStore in afc-system/shared) ───────────────── */

    private File journalFile() { return new File(getContext().getFilesDir(), "afc-journal.log"); }

    @PluginMethod public void journalLoad(PluginCall call) {
        try {
            JSArray lines = new JSArray();
            File f = journalFile();
            if (f.exists()) try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) { String l; while ((l = r.readLine()) != null) lines.put(l); }
            call.resolve(new JSObject().put("lines", lines));
        } catch (Throwable t) { call.reject("journal load failed: " + t.getMessage()); }
    }

    /** Appends lines and does not answer until they are on storage (fsync). */
    @PluginMethod public void journalAppend(PluginCall call) {
        try {
            JSArray lines = call.getArray("lines");
            if (lines == null) throw new IllegalArgumentException("lines required");
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < lines.length(); i++) sb.append(lines.getString(i)).append('\n');
            synchronized (this) {
                try (FileOutputStream out = new FileOutputStream(journalFile(), true)) { out.write(sb.toString().getBytes(StandardCharsets.UTF_8)); out.flush(); out.getFD().sync(); }
            }
            call.resolve();
        } catch (Throwable t) { call.reject("journal append failed: " + t.getMessage()); }
    }

    /** Replaces the whole journal with one line: written to a temporary file, synced, then renamed over the old one, so a power cut leaves the old or the new, never half. */
    @PluginMethod public void journalReplace(PluginCall call) {
        try {
            String line = call.getString("line");
            if (line == null) throw new IllegalArgumentException("line required");
            synchronized (this) {
                File tmp = new File(getContext().getFilesDir(), "afc-journal.log.tmp");
                try (FileOutputStream out = new FileOutputStream(tmp, false)) { out.write((line + "\n").getBytes(StandardCharsets.UTF_8)); out.flush(); out.getFD().sync(); }
                if (!tmp.renameTo(journalFile())) throw new IllegalStateException("could not replace the journal");
            }
            call.resolve();
        } catch (Throwable t) { call.reject("journal replace failed: " + t.getMessage()); }
    }

    /* ───────────────── master keys in the Android Keystore ───────────────── */

    /** Installs a master key (once). Never logged, never returned. */
    @PluginMethod public void keyImport(PluginCall call) {
        try {
            String role = call.getString("role"), hex = call.getString("keyHex");
            if (role == null || hex == null || !hex.matches("(?i)[0-9a-f]{32}")) throw new IllegalArgumentException("role and a 16-byte key in hex are required");
            AfcKeyStore.importKey(role, AfcCmac.fromHex(hex), Boolean.TRUE.equals(call.getBoolean("replace", false)));
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "key import failed" : t.getMessage()); }
    }

    @PluginMethod public void keyStatus(PluginCall call) {
        try {
            JSObject roles = new JSObject();
            for (String r : new String[] { "PICC", "ADMIN", "DEBIT", "CREDIT", "TICKET" }) {
                JSObject s = new JSObject();
                boolean has = AfcKeyStore.has(r);
                s.put("installed", has).put("hardwareBacked", has && AfcKeyStore.hardwareBacked(r));
                roles.put(r, s);
            }
            call.resolve(new JSObject().put("roles", roles));
        } catch (Throwable t) { call.reject("key status failed: " + t.getMessage()); }
    }

    /** AES-CMAC of the input under the role's master key: the card-key diversification. Returns the 16-byte result. */
    @PluginMethod public void keyDiversify(PluginCall call) {
        try {
            String role = call.getString("role"), hex = call.getString("inputHex");
            if (role == null || hex == null || !hex.matches("(?i)([0-9a-f]{2})+")) throw new IllegalArgumentException("role and inputHex required");
            call.resolve(new JSObject().put("keyHex", AfcCmac.toHex(AfcKeyStore.cmac(role, AfcCmac.fromHex(hex)))));
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "diversify failed" : t.getMessage()); }
    }
}
