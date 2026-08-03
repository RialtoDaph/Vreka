import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, _resetRateLimitsForTests } from "./rateLimit";

beforeEach(() => {
  _resetRateLimitsForTests();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit within the window", () => {
    const now = 1000;
    expect(checkRateLimit("k", 3, 60000, now).ok).toBe(true);
    expect(checkRateLimit("k", 3, 60000, now + 10).ok).toBe(true);
    expect(checkRateLimit("k", 3, 60000, now + 20).ok).toBe(true);
  });

  it("blocks once the limit is hit within the window", () => {
    const now = 1000;
    checkRateLimit("k", 2, 60000, now);
    checkRateLimit("k", 2, 60000, now + 10);
    const result = checkRateLimit("k", 2, 60000, now + 20);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the window has elapsed", () => {
    const now = 1000;
    checkRateLimit("k", 1, 60000, now);
    expect(checkRateLimit("k", 1, 60000, now + 30000).ok).toBe(false);
    expect(checkRateLimit("k", 1, 60000, now + 60001).ok).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const now = 1000;
    checkRateLimit("a", 1, 60000, now);
    expect(checkRateLimit("a", 1, 60000, now + 10).ok).toBe(false);
    expect(checkRateLimit("b", 1, 60000, now + 10).ok).toBe(true);
  });
});
