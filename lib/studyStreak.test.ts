import { describe, expect, it } from "vitest";
import { computeStreak } from "./studyStreak";

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const today = new Date("2026-08-16T10:00:00Z");
    const dates = ["2026-08-16T08:00:00Z", "2026-08-15T08:00:00Z", "2026-08-14T08:00:00Z"];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it("doesn't break the streak if today has no activity yet, counting from yesterday", () => {
    const today = new Date("2026-08-16T02:00:00Z");
    const dates = ["2026-08-15T08:00:00Z", "2026-08-14T08:00:00Z"];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("breaks the streak when there's a gap", () => {
    const today = new Date("2026-08-16T10:00:00Z");
    const dates = ["2026-08-16T08:00:00Z", "2026-08-14T08:00:00Z"];
    expect(computeStreak(dates, today)).toBe(1);
  });

  it("returns 0 when there's no activity at all", () => {
    expect(computeStreak([], new Date("2026-08-16T10:00:00Z"))).toBe(0);
  });

  it("ignores null/undefined entries", () => {
    const today = new Date("2026-08-16T10:00:00Z");
    expect(computeStreak([null, undefined, "2026-08-16T08:00:00Z"], today)).toBe(1);
  });

  it("counts each calendar day once even with multiple sessions that day", () => {
    const today = new Date("2026-08-16T10:00:00Z");
    const dates = ["2026-08-16T08:00:00Z", "2026-08-16T09:00:00Z", "2026-08-15T08:00:00Z"];
    expect(computeStreak(dates, today)).toBe(2);
  });
});
