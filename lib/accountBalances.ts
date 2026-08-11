import type { Account, Transaction } from "@/lib/types";

export type AccountBalance = { account: Account; balance: number };

export type AccountBalances = {
  perAccount: AccountBalance[];
  /** Net of transactions with no account_id -- still real money, still counted in `total`. */
  unassigned: number;
  total: number;
};

type BalanceTx = Pick<Transaction, "account_id" | "type" | "amount">;

export function buildAccountBalances(accounts: Account[], transactions: BalanceTx[]): AccountBalances {
  const netByAccount = new Map<string, number>();
  let unassigned = 0;

  for (const t of transactions) {
    const signed = t.type === "income" ? Number(t.amount) : -Number(t.amount);
    if (t.account_id) {
      netByAccount.set(t.account_id, (netByAccount.get(t.account_id) ?? 0) + signed);
    } else {
      unassigned += signed;
    }
  }

  const perAccount = accounts.map((account) => ({
    account,
    balance: Number(account.starting_balance) + (netByAccount.get(account.id) ?? 0),
  }));

  const total = perAccount.reduce((sum, a) => sum + a.balance, 0) + unassigned;

  return { perAccount, unassigned, total };
}
