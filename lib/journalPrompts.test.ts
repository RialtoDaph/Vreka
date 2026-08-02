import { describe, expect, it } from "vitest";
import { promptForDate, REFLECTION_PROMPTS } from "./journalPrompts";

describe("promptForDate", () => {
  it("returns a valid prompt for any date", () => {
    const dates = [new Date("2026-01-01"), new Date("2026-12-31"), new Date("2024-02-29")];
    for (const d of dates) {
      expect(REFLECTION_PROMPTS).toContain(promptForDate(d));
    }
  });

  it("is deterministic for the same date", () => {
    const d = new Date("2026-06-15");
    expect(promptForDate(d)).toBe(promptForDate(new Date("2026-06-15")));
  });
});
