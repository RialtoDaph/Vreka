import { daysUntil } from "@/lib/format";

export type KeuanganStatsInput = {
  incomeThisMonth: number;
  expenseThisMonth: number;
  /** Expense totals for each of the previous months (current month excluded). */
  pastMonthsExpense: number[];
  savingsGoals: {
    name: string;
    current_amount: number;
    target_amount: number;
    deadline: string | null;
  }[];
};

export type KeuanganStats = {
  saldo: number;
  expenseThisMonth: number;
  /** null when there's no prior-month history to compare against. */
  expensePctOfAverage: number | null;
  /** null when the user has no savings goals at all. */
  savingsProgressPct: number | null;
  savingsHint: string;
};

export function buildKeuanganStats(input: KeuanganStatsInput): KeuanganStats {
  const saldo = input.incomeThisMonth - input.expenseThisMonth;

  let expensePctOfAverage: number | null = null;
  if (input.pastMonthsExpense.length > 0) {
    const avg = input.pastMonthsExpense.reduce((s, v) => s + v, 0) / input.pastMonthsExpense.length;
    expensePctOfAverage = avg > 0 ? Math.round((input.expenseThisMonth / avg) * 100) : null;
  }

  let savingsProgressPct: number | null = null;
  let savingsHint = "Belum ada target tabungan.";
  if (input.savingsGoals.length > 0) {
    const totalCurrent = input.savingsGoals.reduce((s, g) => s + Number(g.current_amount), 0);
    const totalTarget = input.savingsGoals.reduce((s, g) => s + Number(g.target_amount), 0);
    savingsProgressPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

    const upcoming = input.savingsGoals
      .map((g) => ({ goal: g, days: g.deadline ? daysUntil(g.deadline) : null }))
      .filter((x): x is { goal: (typeof input.savingsGoals)[number]; days: number } => x.days !== null && x.days >= 0)
      .sort((a, b) => a.days - b.days)[0];

    if (upcoming) {
      savingsHint = `${upcoming.goal.name} — ${upcoming.days} hari lagi`;
    } else {
      const leastProgressed = [...input.savingsGoals].sort(
        (a, b) => Number(a.current_amount) / Number(a.target_amount) - Number(b.current_amount) / Number(b.target_amount)
      )[0];
      savingsHint = leastProgressed.name;
    }
  }

  return {
    saldo,
    expenseThisMonth: input.expenseThisMonth,
    expensePctOfAverage,
    savingsProgressPct,
    savingsHint,
  };
}
