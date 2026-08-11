import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_GROUPS,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_GROUPS,
} from "./categories";

describe("categories", () => {
  it("has no duplicate income categories", () => {
    expect(new Set(INCOME_CATEGORIES).size).toBe(INCOME_CATEGORIES.length);
  });

  it("has no duplicate expense categories", () => {
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it("includes a catch-all 'Lainnya' category on both lists (used as the default category)", () => {
    expect(INCOME_CATEGORIES).toContain("Lainnya");
    expect(EXPENSE_CATEGORIES).toContain("Lainnya");
  });

  it("has no blank category names", () => {
    for (const c of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
      expect(c.trim()).toBe(c);
      expect(c.length).toBeGreaterThan(0);
    }
  });

  // The grouped structures are a separate, hand-maintained view onto the
  // same flat lists (for CategorySelect's dropdown) -- this is the guard
  // against the two silently drifting apart when only one gets updated.
  it("income category groups cover the flat income list exactly, no more no less", () => {
    const grouped = INCOME_CATEGORY_GROUPS.flatMap((g) => g.items);
    expect(new Set(grouped)).toEqual(new Set(INCOME_CATEGORIES));
    expect(grouped.length).toBe(INCOME_CATEGORIES.length);
  });

  it("expense category groups cover the flat expense list exactly, no more no less", () => {
    const grouped = EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items);
    expect(new Set(grouped)).toEqual(new Set(EXPENSE_CATEGORIES));
    expect(grouped.length).toBe(EXPENSE_CATEGORIES.length);
  });
});
