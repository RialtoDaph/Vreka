import { describe, expect, it } from "vitest";
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from "./mfaRecovery";

describe("generateRecoveryCode", () => {
  it("produces a 5-5 dash-formatted code from the confusion-free alphabet", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it("generates distinct codes across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(20);
  });
});

describe("normalizeRecoveryCode", () => {
  it("uppercases and strips non-alphanumeric characters", () => {
    expect(normalizeRecoveryCode("ab12c-de34f")).toBe("AB12CDE34F");
    expect(normalizeRecoveryCode("AB12C DE34F")).toBe("AB12CDE34F");
    expect(normalizeRecoveryCode("AB12CDE34F")).toBe("AB12CDE34F");
  });
});

describe("hashRecoveryCode", () => {
  it("hashes formatting variants of the same code identically", async () => {
    const a = await hashRecoveryCode("ab12c-de34f");
    const b = await hashRecoveryCode("AB12C DE34F");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes different codes differently", async () => {
    const a = await hashRecoveryCode("AB12C-DE34F");
    const b = await hashRecoveryCode("AB12C-DE34G");
    expect(a).not.toBe(b);
  });
});
