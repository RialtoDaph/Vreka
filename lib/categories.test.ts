import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./categories";

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
});
