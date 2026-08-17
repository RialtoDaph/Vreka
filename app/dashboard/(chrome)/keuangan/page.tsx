"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { localMonthKey } from "@/lib/date";
import { buildKeuanganStats, type KeuanganStats } from "@/lib/keuanganStats";
import { buildAccountBalances } from "@/lib/accountBalances";
import type { Account } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import TransactionsTab from "@/components/keuangan/TransactionsTab";
import RecurringTab from "@/components/keuangan/RecurringTab";
import DebtsTab from "@/components/keuangan/DebtsTab";
import SavingsTab from "@/components/keuangan/SavingsTab";
import AccountsTab from "@/components/keuangan/AccountsTab";
import AnalyticsTab from "@/components/keuangan/AnalyticsTab";
import BudgetsTab from "@/components/keuangan/BudgetsTab";
import { ghostBtnClass } from "@/lib/ui";

const TABS = [
  { key: "transaksi", label: "Transaksi" },
  { key: "rekening", label: "Rekening" },
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
  const [kekayaanTotal, setKekayaanTotal] = useState<number | null>(null);
  const [accountCount, setAccountCount] = useState(0);

  const [research, setResearch] = useState<{ text: string; sources: { label: string; url: string }[] } | null>(
    null
  );
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

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
        } else if (t.type === "income" && key === currentMonth) {
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
    // Re-runs on every tab switch, same as the tab bodies below (each is
    // conditionally rendered, so mounting one already re-fetches its own
    // data fresh) -- without this, adding/editing a transaction elsewhere
    // left this header card showing stale numbers until a full page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    // Kekayaan Total needs every transaction ever recorded (not just the
    // trailing few months loadStats() pulls), since it's starting_balance +
    // the full lifetime net per account -- kept as its own query instead of
    // folded into loadStats() so that heavier all-time read stays isolated.
    async function loadKekayaan() {
      const [{ data: accountRows }, { data: txRows }] = await Promise.all([
        supabase.from("accounts").select("*"),
        supabase.from("transactions").select("account_id, to_account_id, type, amount"),
      ]);
      const accounts = (accountRows ?? []) as Account[];
      setAccountCount(accounts.length);
      const { total } = buildAccountBalances(accounts, txRows ?? []);
      setKekayaanTotal(total);
    }
    loadKekayaan();
    // Same reasoning as loadStats() above -- re-run on tab switch so this
    // doesn't go stale after a transaction/account change on another tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function askResearch() {
    setResearchLoading(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/assistant/market-research", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setResearchError(json.error ?? "Gagal ambil riset pasar.");
        return;
      }
      setResearch({ text: json.text, sources: Array.isArray(json.sources) ? json.sources : [] });
    } catch {
      setResearchError("Gagal ambil riset pasar.");
    } finally {
      setResearchLoading(false);
    }
  }

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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-400 mb-2">
              Kekayaan Total
            </p>
            <p className="font-mono text-xl font-bold text-mint-glow">
              {kekayaanTotal !== null ? formatCurrency(kekayaanTotal) : "…"}
            </p>
            <p className="text-[11.5px] text-slate-400 mt-1.5">
              {accountCount > 0 ? `Dari ${accountCount} rekening` : "Belum ada rekening — cek tab Rekening"}
            </p>
          </HudPanel>
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-400 mb-2">
              Saldo Bulan Ini
            </p>
            <p className="font-mono text-xl font-bold text-mint-glow">{formatCurrency(stats.saldo)}</p>
            <p className="text-[11.5px] text-slate-400 mt-1.5">Pemasukan − pengeluaran</p>
          </HudPanel>
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-400 mb-2">
              Pengeluaran Bulan Ini
            </p>
            <p className="font-mono text-xl font-bold text-amber-glow">
              {formatCurrency(stats.expenseThisMonth)}
            </p>
            <p className="text-[11.5px] text-slate-400 mt-1.5">
              {stats.expensePctOfAverage !== null
                ? `${stats.expensePctOfAverage}% dari rata-rata bulan sebelumnya`
                : "Belum ada histori bulan sebelumnya"}
            </p>
          </HudPanel>
          <HudPanel>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-slate-400 mb-2">
              Progress Tabungan
            </p>
            <p className="font-mono text-xl font-bold text-cyan-glow">
              {stats.savingsProgressPct !== null ? `${stats.savingsProgressPct}%` : "—"}
            </p>
            <p className="text-[11.5px] text-slate-400 mt-1.5">{stats.savingsHint}</p>
          </HudPanel>
        </div>
      )}

      <HudPanel>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-display font-semibold text-white tracking-wide text-sm">
            Riset Pasar
          </h2>
          {!research && !researchLoading && (
            <button onClick={askResearch} className={ghostBtnClass}>
              Minta riset
            </button>
          )}
          {research && !researchLoading && (
            <button onClick={askResearch} className={ghostBtnClass}>
              ↻ Refresh
            </button>
          )}
        </div>
        {researchLoading && <p className="text-xs font-mono text-slate-400">Nyari info...</p>}
        {researchError && <p className="text-xs text-rose-glow">{researchError}</p>}
        {research && (
          <>
            <p className="text-sm text-slate-300 leading-relaxed mb-2">{research.text}</p>
            {research.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {research.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] border border-cyan-glow/30 text-cyan-glow rounded-full px-2 py-0.5 bg-cyan-glow/[.06] hover:bg-cyan-glow/10"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        {!research && !researchLoading && !researchError && (
          <p className="text-xs text-slate-400">
            Harga emas, kurs USD/EUR, dan satu berita teknologi -- buat bahan mikir nabung & investasi (web
            search real-time, bukan basa-basi).
          </p>
        )}
      </HudPanel>

      <div className="flex gap-1 border-b border-line text-sm font-mono overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-cyan-glow text-cyan-glow"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transaksi" && <TransactionsTab />}
      {tab === "rekening" && <AccountsTab />}
      {tab === "pos-tetap" && <RecurringTab />}
      {tab === "utang" && <DebtsTab />}
      {tab === "tabungan" && <SavingsTab />}
      {tab === "anggaran" && <BudgetsTab />}
      {tab === "analitik" && <AnalyticsTab />}
    </div>
  );
}
