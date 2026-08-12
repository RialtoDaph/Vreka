// Shared between DebtsTab (the UI), buildMemoryMapData, and Aslan's system
// prompt context -- all three need "how much of this debt is actually left
// after partial payments", and duplicating this reduction three separate
// ways is exactly how the memoryMap/context copies fell out of sync with
// the debt_payments feature when it shipped (they were never updated to
// know payments existed at all).
export type DebtPaymentRow = { debt_id: string; amount: number | string };

export function sumPaidByDebt(payments: DebtPaymentRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of payments) {
    map[p.debt_id] = (map[p.debt_id] ?? 0) + Number(p.amount);
  }
  return map;
}

export function remainingDebtAmount(
  debtId: string,
  debtAmount: number,
  paidByDebt: Record<string, number>
): number {
  return Math.max(0, Number(debtAmount) - (paidByDebt[debtId] ?? 0));
}
