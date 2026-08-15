import type { Account, Transaction } from "@/lib/types";

export type AccountBalance = { account: Account; balance: number };

export type AccountBalances = {
  perAccount: AccountBalance[];
  /** Net of transactions with no account_id -- still real money, still counted in `total`. */
  unassigned: number;
  total: number;
};

// to_account_id is only ever read for a "transfer" row -- optional so every
// existing income/expense caller doesn't need to spell out a field that's
// meaningless for them.
type BalanceTx = Pick<Transaction, "account_id" | "type" | "amount"> & { to_account_id?: string | null };

function addToAccount(netByAccount: Map<string, number>, accountId: string, delta: number) {
  netByAccount.set(accountId, (netByAccount.get(accountId) ?? 0) + delta);
}

export function buildAccountBalances(accounts: Account[], transactions: BalanceTx[]): AccountBalances {
  const netByAccount = new Map<string, number>();
  let unassigned = 0;

  for (const t of transactions) {
    // A transfer moves money between two of the user's own accounts --
    // it's neither income nor expense, so it never touches `unassigned`
    // (a transfer always names both accounts by the DB check constraint)
    // and nets to zero on the total, same as physically moving cash
    // between two wallets you already own.
    if (t.type === "transfer") {
      if (t.account_id) addToAccount(netByAccount, t.account_id, -Number(t.amount));
      if (t.to_account_id) addToAccount(netByAccount, t.to_account_id, Number(t.amount));
      continue;
    }
    const signed = t.type === "income" ? Number(t.amount) : -Number(t.amount);
    if (t.account_id) {
      addToAccount(netByAccount, t.account_id, signed);
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
