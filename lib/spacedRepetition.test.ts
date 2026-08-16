import { describe, expect, it } from "vitest";
import { nextReview } from "./spacedRepetition";

const base = { ease_factor: 2.5, interval_days: 0, repetitions: 0 };
const now = new Date("2026-08-16T00:00:00Z");

describe("nextReview", () => {
  it("schedules a brand-new card 1 day out on a 'good' rating", () => {
    const result = nextReview(base, "good", now);
    expect(result.interval_days).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.due_at).toBe(new Date("2026-08-17T00:00:00Z").toISOString());
  });

  it("schedules the second 'good' review 6 days out", () => {
    const afterFirst = { ease_factor: 2.5, interval_days: 1, repetitions: 1 };
    const result = nextReview(afterFirst, "good", now);
    expect(result.interval_days).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("multiplies interval by ease factor from the third review onward", () => {
    const afterSecond = { ease_factor: 2.5, interval_days: 6, repetitions: 2 };
    const result = nextReview(afterSecond, "good", now);
    expect(result.interval_days).toBe(15); // round(6 * 2.5)
    expect(result.repetitions).toBe(3);
  });

  it("resets repetitions and interval to 0 on 'again', due immediately", () => {
    const learned = { ease_factor: 2.3, interval_days: 15, repetitions: 3 };
    const result = nextReview(learned, "again", now);
    expect(result.repetitions).toBe(0);
    expect(result.interval_days).toBe(0);
    expect(result.due_at).toBe(now.toISOString());
    expect(result.ease_factor).toBeLessThan(2.3);
  });

  it("never drops ease factor below the 1.3 floor", () => {
    const brittle = { ease_factor: 1.35, interval_days: 10, repetitions: 2 };
    const result = nextReview(brittle, "again", now);
    expect(result.ease_factor).toBe(1.3);
  });

  it("grows the interval further and bumps ease up on 'easy'", () => {
    const result = nextReview(base, "easy", now);
    expect(result.interval_days).toBe(2);
    expect(result.ease_factor).toBeGreaterThan(2.5);
  });

  it("grows the interval more gently and lowers ease on 'hard'", () => {
    const result = nextReview(base, "hard", now);
    expect(result.interval_days).toBe(1);
    expect(result.ease_factor).toBeLessThan(2.5);
  });
});
