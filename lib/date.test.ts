import { afterEach, describe, expect, it } from "vitest";
import { currentMonthKey, localDateKey, localMonthKey, todayKey } from "./date";

const originalTZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTZ;
});

describe("localDateKey", () => {
  it("uses the local calendar day, not the UTC day, in a positive-offset timezone", () => {
    process.env.TZ = "Asia/Jakarta"; // UTC+7
    // 17:30 UTC on Aug 1 is already 00:30 WIB on Aug 2.
    const d = new Date("2026-08-01T17:30:00Z");
    expect(localDateKey(d)).toBe("2026-08-02");
  });

  it("matches the UTC day when the local timezone is UTC", () => {
    process.env.TZ = "UTC";
    const d = new Date("2026-08-01T17:30:00Z");
    expect(localDateKey(d)).toBe("2026-08-01");
  });

  it("regression: toISOString().slice(0,10) would have gotten this wrong", () => {
    process.env.TZ = "Asia/Jakarta";
    const d = new Date("2026-08-01T17:30:00Z");
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-01"); // the old, wrong value
    expect(localDateKey(d)).toBe("2026-08-02"); // the real WIB calendar day
  });
});

describe("todayKey", () => {
  it("returns a well-formed YYYY-MM-DD string", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("localMonthKey / currentMonthKey", () => {
  it("uses the local month across a month-boundary UTC offset", () => {
    process.env.TZ = "Asia/Jakarta";
    // 17:30 UTC on Jul 31 is already 00:30 WIB on Aug 1 -- a new month locally.
    const d = new Date("2026-07-31T17:30:00Z");
    expect(localMonthKey(d)).toBe("2026-08");
  });

  it("returns a well-formed YYYY-MM string", () => {
    expect(currentMonthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
});
