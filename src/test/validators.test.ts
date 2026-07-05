import { describe, it, expect } from "vitest";
import { validators } from "../app/hooks/useFormValidation";

describe("validators.saId", () => {
  const rule = validators.saId();
  it("accepts a valid 13-digit SA ID", () => expect(rule("8912245082082")).toBeNull());
  it("rejects fewer than 13 digits",   () => expect(rule("12345")).toBeTruthy());
  it("rejects non-numeric characters", () => expect(rule("A910203123456")).toBeTruthy());
  it("rejects empty string",           () => expect(rule("")).toBeTruthy());
});

describe("validators.saPhone", () => {
  const rule = validators.saPhone();
  it("accepts +27 format",   () => expect(rule("+27821234567")).toBeNull());
  it("accepts 0 prefix",     () => expect(rule("0821234567")).toBeNull());
  it("rejects short number", () => expect(rule("+2782123")).toBeTruthy());
  it("rejects empty",        () => expect(rule("+27 ")).toBeTruthy());
});

describe("validators.email", () => {
  const rule = validators.email();
  it("accepts valid email",     () => expect(rule("test@vink.com")).toBeNull());
  it("rejects missing @",       () => expect(rule("testATvink.com")).toBeTruthy());
  it("rejects missing domain",  () => expect(rule("test@")).toBeTruthy());
  it("rejects empty",           () => expect(rule("")).toBeTruthy());
});

describe("validators.cipc", () => {
  const rule = validators.cipc();
  it("accepts valid CIPC format",  () => expect(rule("2018/079316/07")).toBeNull());
  it("rejects wrong format",       () => expect(rule("2018079316")).toBeTruthy());
  it("rejects empty",              () => expect(rule("")).toBeTruthy());
});

describe("validators.minAmount", () => {
  const rule = validators.minAmount(1000, "Loan amount");
  it("accepts amount above minimum",  () => expect(rule("5000")).toBeNull());
  it("accepts exact minimum",         () => expect(rule("1000")).toBeNull());
  it("rejects amount below minimum",  () => expect(rule("500")).toBeTruthy());
  it("rejects empty",                 () => expect(rule("")).toBeTruthy());
});
