import { describe, expect, it } from "vitest";
import { buildMonthGrid, dateKey, isSameMonth } from "./calendarGrid";

describe("buildMonthGrid", () => {
  it("returns exactly 42 dates", () => {
    expect(buildMonthGrid(new Date("2026-08-15")).length).toBe(42);
  });

  it("starts on a Sunday and ends on a Saturday", () => {
    const grid = buildMonthGrid(new Date("2026-08-15"));
    expect(grid[0].getDay()).toBe(0);
    expect(grid[41].getDay()).toBe(6);
  });

  it("includes every day of the target month", () => {
    const grid = buildMonthGrid(new Date("2026-08-01"));
    const keys = new Set(grid.map(dateKey));
    for (let day = 1; day <= 31; day++) {
      expect(keys.has(`2026-08-${String(day).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("handles February in a leap year (29 days)", () => {
    const grid = buildMonthGrid(new Date("2024-02-10"));
    const keys = new Set(grid.map(dateKey));
    expect(keys.has("2024-02-29")).toBe(true);
    expect(keys.has("2024-03-01")).toBe(true); // trailing padding day
  });

  it("the grid start is on or before the 1st of the month", () => {
    const monthDate = new Date("2026-08-15");
    const grid = buildMonthGrid(monthDate);
    const firstOfMonth = new Date(2026, 7, 1);
    expect(grid[0].getTime()).toBeLessThanOrEqual(firstOfMonth.getTime());
  });
});

describe("isSameMonth", () => {
  it("is true for two dates in the same month/year", () => {
    expect(isSameMonth(new Date("2026-08-01"), new Date("2026-08-31"))).toBe(true);
  });

  it("is false across a month boundary", () => {
    expect(isSameMonth(new Date("2026-08-31"), new Date("2026-09-01"))).toBe(false);
  });

  it("is false across a year boundary for the same month number", () => {
    expect(isSameMonth(new Date("2025-08-15"), new Date("2026-08-15"))).toBe(false);
  });
});
