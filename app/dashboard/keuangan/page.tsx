"use client";

import { useState } from "react";
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
  const [tab, setTab] = useState<TabKey>("transaksi");

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
