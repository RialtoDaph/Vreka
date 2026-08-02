import { describe, expect, it } from "vitest";
import { computeStreak } from "./habits";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("computeStreak", () => {
  it("returns 0 for no checks at all", () => {
    expect(computeStreak(new Set())).toBe(0);
  });

  it("counts today alone as a streak of 1", () => {
    expect(computeStreak(new Set([daysAgo(0)]))).toBe(1);
  });

  it("counts consecutive days including today", () => {
    expect(computeStreak(new Set([daysAgo(0), daysAgo(1), daysAgo(2)]))).toBe(3);
  });

  it("still shows the streak from yesterday when today isn't checked yet", () => {
    expect(computeStreak(new Set([daysAgo(1), daysAgo(2), daysAgo(3)]))).toBe(3);
  });

  it("stops counting at a gap", () => {
    expect(computeStreak(new Set([daysAgo(0), daysAgo(1), daysAgo(3)]))).toBe(2);
  });

  it("resets to 0 when neither today nor yesterday is checked, even with older checks", () => {
    expect(computeStreak(new Set([daysAgo(3), daysAgo(4)]))).toBe(0);
  });
});
