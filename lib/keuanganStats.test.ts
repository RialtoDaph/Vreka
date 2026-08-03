import { describe, expect, it } from "vitest";
import { buildKeuanganStats } from "./keuanganStats";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("buildKeuanganStats", () => {
  it("computes saldo as income minus expense", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 3000,
      expenseThisMonth: 1200,
      pastMonthsExpense: [],
      savingsGoals: [],
    });
    expect(stats.saldo).toBe(1800);
  });

  it("returns null expense average with no prior-month history", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 1000,
      expenseThisMonth: 500,
      pastMonthsExpense: [],
      savingsGoals: [],
    });
    expect(stats.expensePctOfAverage).toBeNull();
  });

  it("compares this month's expense against the average of prior months", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 710,
      pastMonthsExpense: [1000, 900, 1100], // avg 1000
      savingsGoals: [],
    });
    expect(stats.expensePctOfAverage).toBe(71);
  });

  it("returns null savings progress with no goals", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 0,
      pastMonthsExpense: [],
      savingsGoals: [],
    });
    expect(stats.savingsProgressPct).toBeNull();
    expect(stats.savingsHint).toBe("Belum ada target tabungan.");
  });

  it("aggregates progress across every goal combined, not the average of each %", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 0,
      pastMonthsExpense: [],
      savingsGoals: [
        { name: "A", current_amount: 100, target_amount: 100, deadline: null }, // 100%
        { name: "B", current_amount: 0, target_amount: 300, deadline: null }, // 0%
      ],
    });
    // Combined: 100 / 400 = 25%, not (100% + 0%) / 2 = 50%.
    expect(stats.savingsProgressPct).toBe(25);
  });

  it("hints the nearest upcoming deadline among goals that have one", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 0,
      pastMonthsExpense: [],
      savingsGoals: [
        { name: "Liburan", current_amount: 10, target_amount: 100, deadline: daysFromNow(90) },
        { name: "Dana Darurat", current_amount: 50, target_amount: 100, deadline: daysFromNow(12) },
        { name: "Tanpa deadline", current_amount: 0, target_amount: 100, deadline: null },
      ],
    });
    expect(stats.savingsHint).toBe("Dana Darurat — 12 hari lagi");
  });

  it("ignores a deadline that's already past when picking the hint", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 0,
      pastMonthsExpense: [],
      savingsGoals: [
        { name: "Lewat", current_amount: 0, target_amount: 100, deadline: daysFromNow(-5) },
        { name: "Masih Jauh", current_amount: 0, target_amount: 100, deadline: daysFromNow(30) },
      ],
    });
    expect(stats.savingsHint).toBe("Masih Jauh — 30 hari lagi");
  });

  it("falls back to the least-progressed goal's name when none has an upcoming deadline", () => {
    const stats = buildKeuanganStats({
      incomeThisMonth: 0,
      expenseThisMonth: 0,
      pastMonthsExpense: [],
      savingsGoals: [
        { name: "Hampir Selesai", current_amount: 90, target_amount: 100, deadline: null },
        { name: "Baru Mulai", current_amount: 5, target_amount: 100, deadline: null },
      ],
    });
    expect(stats.savingsHint).toBe("Baru Mulai");
  });
});
