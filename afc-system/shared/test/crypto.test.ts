import { describe, it, expect } from "vitest";
import { aesCmac } from "../src/crypto/cmac";
import { diversifyAes128 } from "../src/crypto/kdf";

const hex = (s: string) => Buffer.from(s.replace(/\s/g, ""), "hex");

describe("AES-CMAC (RFC 4493 test vectors)", () => {
  const key = hex("2b7e151628aed2a6abf7158809cf4f3c");
  it("empty message", () => expect(aesCmac(key, Buffer.alloc(0)).toString("hex")).toBe("bb1d6929e95937287fa37d129b756746"));
  it("16 bytes", () => expect(aesCmac(key, hex("6bc1bee22e409f96e93d7e117393172a")).toString("hex")).toBe("070a16b46b4d4144f79bdd9dd04a287c"));
  it("40 bytes", () => expect(aesCmac(key, hex("6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51 30c81c46a35ce411")).toString("hex")).toBe("dfa66747de9ae63030ca32611497c827"));
  it("64 bytes", () => expect(aesCmac(key, hex("6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51 30c81c46a35ce411e5fbc1191a0a52ef f69f2445df4f9b17ad2b417be66c3710")).toString("hex")).toBe("51f0bebf7e3b9d92fc49741779363cfe"));
  it("chaining from a non-zero IV is the same as prefixing the IV-XORed first block", () => {
    const iv = hex("000102030405060708090a0b0c0d0e0f"), m = hex("6bc1bee22e409f96e93d7e117393172a");
    expect(aesCmac(key, m, iv).equals(aesCmac(key, m))).toBe(false);
    expect(aesCmac(key, m, iv).length).toBe(16);
  });
});

describe("key diversification (NXP AN10922, AES-128 example)", () => {
  it("matches the published vector", () => {
    const master = hex("00112233445566778899AABBCCDDEEFF");
    const uid = hex("04782E21801D80"), aid = hex("3042F5"), sys = hex("4E585020416275");
    expect(diversifyAes128(master, uid, aid, sys).toString("hex").toUpperCase()).toBe("A8DD63A3B89D54B37CA802473FDA9175");
  });
  it("different cards and different system identifiers give different keys", () => {
    const m = Buffer.alloc(16, 7), aid = hex("4b5601");
    const a = diversifyAes128(m, hex("04000000000001"), aid, Buffer.from("AFC1"));
    expect(a.equals(diversifyAes128(m, hex("04000000000002"), aid, Buffer.from("AFC1")))).toBe(false);
    expect(a.equals(diversifyAes128(m, hex("04000000000001"), aid, Buffer.from("AFC2")))).toBe(false);
  });
  it("rejects wrong sizes", () => {
    expect(() => diversifyAes128(Buffer.alloc(8), Buffer.alloc(7), Buffer.alloc(3), Buffer.alloc(1))).toThrow();
    expect(() => diversifyAes128(Buffer.alloc(16), Buffer.alloc(4), Buffer.alloc(3), Buffer.alloc(1))).toThrow();
  });
});
