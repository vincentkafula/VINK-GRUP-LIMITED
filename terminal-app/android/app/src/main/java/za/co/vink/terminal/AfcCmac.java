package za.co.vink.terminal;

import java.util.Arrays;

/**
 * AES-CMAC (RFC 4493) written against a "encrypt one 16-byte block" function, so the same code runs on a key that lives inside the Android Keystore
 * (which can encrypt with it but never reveal it) and, in tests, on an ordinary JDK key. No Android imports: it is run on a plain JVM against the
 * RFC 4493 test vectors (see afc-system/docs/DEVICE.md).
 */
final class AfcCmac {
    /** Encrypts exactly one 16-byte block with AES-128 (ECB, no padding) under a key this code never sees. */
    interface Block { byte[] encrypt(byte[] block) throws Exception; }

    private AfcCmac() {}

    private static byte[] dbl(byte[] in) {
        byte[] out = new byte[16];
        int carry = 0;
        for (int i = 15; i >= 0; i--) { int v = (in[i] & 0xff) << 1 | carry; out[i] = (byte) v; carry = (v >> 8) & 1; }
        if ((in[0] & 0x80) != 0) out[15] ^= (byte) 0x87;
        return out;
    }

    static byte[] mac(Block aes, byte[] msg) throws Exception {
        byte[] k1 = dbl(aes.encrypt(new byte[16]));
        byte[] k2 = dbl(k1);
        int n = (msg.length + 15) / 16;
        boolean complete = msg.length > 0 && msg.length % 16 == 0;
        if (n == 0) n = 1;
        byte[] last = new byte[16];
        int off = (n - 1) * 16;
        if (complete) {
            for (int i = 0; i < 16; i++) last[i] = (byte) (msg[off + i] ^ k1[i]);
        } else {
            int rem = msg.length - off;
            System.arraycopy(msg, off, last, 0, rem);
            last[rem] = (byte) 0x80;
            for (int i = 0; i < 16; i++) last[i] ^= k2[i];
        }
        byte[] x = new byte[16];
        for (int b = 0; b < n - 1; b++) {
            byte[] y = new byte[16];
            for (int i = 0; i < 16; i++) y[i] = (byte) (x[i] ^ msg[b * 16 + i]);
            x = aes.encrypt(y);
        }
        byte[] y = new byte[16];
        for (int i = 0; i < 16; i++) y[i] = (byte) (x[i] ^ last[i]);
        return Arrays.copyOf(aes.encrypt(y), 16);
    }

    static byte[] fromHex(String s) {
        if (s == null || s.length() % 2 != 0) throw new IllegalArgumentException("bad hex");
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }
}
