package za.co.vink.terminal;

import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyProtection;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.SecretKeySpec;

/**
 * The master keys for the fare system, held in the Android Keystore. After import they can be USED (here: to encrypt single blocks, which is all
 * AES-CMAC needs) but the app can no longer read them back, and the Keystore will not export them. One entry per role (PICC, ADMIN, DEBIT, CREDIT, TICKET).
 *
 * What this does and does not give: the key bytes pass through this app's memory once, at provisioning. After that, malware that takes over the app
 * can still ask for diversified card keys, but cannot copy the master key off the device. Whether the Keystore is backed by a secure element / TEE
 * on a given P18Q unit depends on the unit: isHardwareBacked() reports what the device says. A SAM (secure access module) in one of the four SAM slots
 * would be stronger still (the key never enters the app at all); that is not implemented here.
 */
final class AfcKeyStore {
    private static final String PROVIDER = "AndroidKeyStore";
    private static String alias(String role) {
        switch (role) { case "PICC": case "ADMIN": case "DEBIT": case "CREDIT": case "TICKET": return "afc_master_" + role.toLowerCase(); default: throw new IllegalArgumentException("unknown key role"); }
    }
    private static KeyStore store() throws Exception { KeyStore ks = KeyStore.getInstance(PROVIDER); ks.load(null); return ks; }

    static boolean has(String role) throws Exception { return store().containsAlias(alias(role)); }

    /** Imports a 16-byte key. Refuses to replace an existing key unless told to (a replaced master key would orphan every card issued under it). */
    static void importKey(String role, byte[] key, boolean replace) throws Exception {
        if (key.length != 16) throw new IllegalArgumentException("a master key is 16 bytes");
        KeyStore ks = store();
        if (ks.containsAlias(alias(role))) { if (!replace) throw new IllegalStateException("a key for " + role + " is already installed"); ks.deleteEntry(alias(role)); }
        KeyProtection prot = new KeyProtection.Builder(KeyProperties.PURPOSE_ENCRYPT).setBlockModes(KeyProperties.BLOCK_MODE_ECB).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build();
        ks.setEntry(alias(role), new KeyStore.SecretKeyEntry(new SecretKeySpec(key, "AES")), prot);
    }

    static void remove(String role) throws Exception { store().deleteEntry(alias(role)); }

    private static AfcCmac.Block blockFor(String role) throws Exception {
        final SecretKey key = (SecretKey) store().getKey(alias(role), null);
        if (key == null) throw new IllegalStateException("no key installed for " + role);
        final Cipher c = Cipher.getInstance("AES/ECB/NoPadding");
        return block -> { c.init(Cipher.ENCRYPT_MODE, key); return c.doFinal(block); };
    }

    /** AES-CMAC of `input` under the role's master key. For card key diversification (NXP AN10922) the input is already 01 || UID || AID || system id || role. */
    static byte[] cmac(String role, byte[] input) throws Exception { return AfcCmac.mac(blockFor(role), input); }

    /** True if the Keystore says this key lives in secure hardware (TEE or secure element). False means software-backed: still not exportable by the app, but not hardware-protected. */
    static boolean hardwareBacked(String role) throws Exception {
        SecretKey key = (SecretKey) store().getKey(alias(role), null);
        if (key == null) return false;
        KeyInfo info = (KeyInfo) SecretKeyFactory.getInstance(key.getAlgorithm(), PROVIDER).getKeySpec(key, KeyInfo.class);
        return info.isInsideSecureHardware();
    }
}
