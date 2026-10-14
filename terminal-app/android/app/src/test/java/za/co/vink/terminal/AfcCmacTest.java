package za.co.vink.terminal;

import static org.junit.Assert.assertEquals;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import org.junit.Test;

/** AES-CMAC against the RFC 4493 test vectors, using an ordinary JDK key in place of the Keystore key. */
public class AfcCmacTest {
    private static final String MSG = "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710";

    private static String mac(int len) throws Exception {
        final Cipher c = Cipher.getInstance("AES/ECB/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(AfcCmac.fromHex("2b7e151628aed2a6abf7158809cf4f3c"), "AES"));
        return AfcCmac.toHex(AfcCmac.mac(c::doFinal, AfcCmac.fromHex(MSG.substring(0, len * 2))));
    }

    @Test public void emptyMessage() throws Exception { assertEquals("bb1d6929e95937287fa37d129b756746", mac(0)); }
    @Test public void oneBlock() throws Exception { assertEquals("070a16b46b4d4144f79bdd9dd04a287c", mac(16)); }
    @Test public void fortyBytes() throws Exception { assertEquals("dfa66747de9ae63030ca32611497c827", mac(40)); }
    @Test public void sixtyFourBytes() throws Exception { assertEquals("51f0bebf7e3b9d92fc49741779363cfe", mac(64)); }
}
