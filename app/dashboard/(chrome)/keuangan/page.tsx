"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { localMonthKey } from "@/lib/date";
import { buildKeuanganStats, type KeuanganStats } from "@/lib/keuanganStats";
import { formatCurrency } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import TransactionsTab from "@/components/keuangan/TransactionsTab";
import RecurringTab from "@/components/keuangan/RecurringTab";
import DebtsTab from "@/components/keuangan/DebtsTab";
import SavingsTab from "@/components/keuangan/SavingsTab";
import AnalyticsTab from "@/components/keuangan/AnalyticsTab";
import BudgetsTab from "@/components/keuangan/BudgetsTab";

const TABS = [
  { key: "transaksi", label: "Transaksi" },
  { key: "pos-tetap", label: "Pos Tetap" },
  { key: "utang", label: "Utang / Piutang" },
  { key: "tabungan", label: "Tabungan" },
  { key: "anggaran", label: "Anggaran" },
  { key: "analitik", label: "Analitik" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function KeuanganPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>("transaksi");
  const [stats, setStats] = useState<KeuanganStats | null>(null);

  useEffect(() => {
    async function loadStats() {
      const now = new Date();
      // 3 full months back + the current month, so pastMonthsExpense has up
      // to 3 completed months to average against.
      const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const currentMonth = localMonthKey(now);

      const [{ data: txRows }, { data: goalRows }] = await Promise.all([
        supabase
          .from("transactions")
          .select("type, amount, occurred_on")
          .gte("occurred_on", rangeStart.toISOString().slice(0, 10)),
        supabase.from("savings_goals").select("name, current_amount, target_amount, deadline"),
      ]);

      const expenseByMonth = new Map<string, number>();
      let incomeThisMonth = 0;
      for (const t of txRows ?? []) {
        const key = localMonthKey(new Date(t.occurred_on));
        if (t.type === "expense") {
          expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + Number(t.amount));
        } else if (key === currentMonth) {
          incomeThisMonth += Number(t.amount);
        }
      }
      const expenseThisMonth = expenseByMonth.get(currentMonth) ?? 0;
      const pastMonthsExpense = Array.from(expenseByMonth.entries())
        .filter(([key]) => key !== currentMonth)
        .map(([, total]) => total);

      setStats(
        buildKeuanganStats({
          incomeThisMonth,
          expenseThisMonth,
          pastMonthsExpense,
          savingsGoals: goalRows ?? [],
        })
      );
    }
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
          Modul 01
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          Keuangan
        </h1>
      </header>

      {stats && (
        <div className="grid sm:grid-cols-3 gap-3.5">
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-500 mb-2">
              Saldo Bulan Ini
            </p>
            <p className="font-mono text-xl font-bold text-mint-glow">{formatCurrency(stats.saldo)}</p>
            <p className="text-[11.5px] text-slate-500 mt-1.5">Pemasukan − pengeluaran</p>
          </HudPanel>
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-500 mb-2">
              Pengeluaran Bulan Ini
            </p>
            <p className="font-mono text-xl font-bold text-amber-glow">
              {formatCurrency(stats.expenseThisMonth)}
            </p>
            <p className="text-[11.5px] text-slate-500 mt-1.5">
              {stats.expensePctOfAverage !== null
                ? `${stats.expensePctOfAverage}% dari rata-rata bulan sebelumnya`
                : "Belum ada histori bulan sebelumnya"}
            </p>
          </HudPanel>
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-500 mb-2">
              Progress Tabungan
            </p>
            <p className="font-mono text-xl font-bold text-cyan-glow">
              {stats.savingsProgressPct !== null ? `${stats.savingsProgressPct}%` : "—"}
            </p>
            <p className="text-[11.5px] text-slate-500 mt-1.5">{stats.savingsHint}</p>
          </HudPanel>
        </div>
      )}

      <div className="flex gap-1 border-b border-line text-sm font-mono overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-cyan-glow text-cyan-glow"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transaksi" && <TransactionsTab />}
      {tab === "pos-tetap" && <RecurringTab />}
      {tab === "utang" && <DebtsTab />}
      {tab === "tabungan" && <SavingsTab />}
      {tab === "anggaran" && <BudgetsTab />}
      {tab === "analitik" && <AnalyticsTab />}
    </div>
  );
}
