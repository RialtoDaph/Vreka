import { describe, expect, it } from "vitest";
import { buildAccountBalances } from "./accountBalances";
import type { Account } from "@/lib/types";

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    user_id: "user-1",
    name: "BCA",
    starting_balance: 0,
    is_primary: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildAccountBalances", () => {
  it("adds starting balance to net income/expense for that account", () => {
    const result = buildAccountBalances(
      [account({ id: "acc-1", starting_balance: 1000 })],
      [
        { account_id: "acc-1", type: "income", amount: 500 },
        { account_id: "acc-1", type: "expense", amount: 200 },
      ]
    );
    expect(result.perAccount).toEqual([{ account: expect.objectContaining({ id: "acc-1" }), balance: 1300 }]);
  });

  it("keeps unassigned transactions out of any account but still in the total", () => {
    const result = buildAccountBalances(
      [account({ id: "acc-1", starting_balance: 1000 })],
      [
        { account_id: "acc-1", type: "income", amount: 500 },
        { account_id: null, type: "expense", amount: 100 },
      ]
    );
    expect(result.perAccount[0].balance).toBe(1500);
    expect(result.unassigned).toBe(-100);
    expect(result.total).toBe(1400);
  });

  it("sums balances across multiple accounts into the total", () => {
    const result = buildAccountBalances(
      [account({ id: "acc-1", starting_balance: 1000 }), account({ id: "acc-2", starting_balance: 500 })],
      [
        { account_id: "acc-1", type: "income", amount: 200 },
        { account_id: "acc-2", type: "expense", amount: 50 },
      ]
    );
    expect(result.total).toBe(1650);
  });

  it("returns just the starting balances when there are no transactions at all", () => {
    const result = buildAccountBalances([account({ starting_balance: 250 })], []);
    expect(result.total).toBe(250);
    expect(result.unassigned).toBe(0);
  });
});
