"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ghostBtnClass } from "@/lib/ui";

// Semua tabel yang RLS-scope ke user_id — daftar ini sengaja eksplisit
// (bukan introspeksi otomatis) biar jelas tabel apa aja yang keikut kalau
// ada modul baru ditambah nanti.
const EXPORTABLE_TABLES = [
  "transactions",
  "recurring_items",
  "recurring_item_checks",
  "debts",
  "debt_payment_checks",
  "savings_goals",
  "budgets",
  "tasks",
  "task_subtasks",
  "study_notes",
  "study_sessions",
  "study_resources",
  "habits",
  "habit_checks",
  "journal_entries",
  "life_milestones",
  "canvas_nodes",
  "canvas_arrows",
  "daily_briefings",
  "assistant_memories",
  "assistant_messages",
  "assistant_audit_log",
] as const;

export default function DataExport() {
  const supabase = createClient();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const entries = await Promise.all(
        EXPORTABLE_TABLES.map(async (table) => {
          const { data, error } = await supabase.from(table).select("*");
          if (error) throw new Error(`${table}: ${error.message}`);
          return [table, data ?? []] as const;
        })
      );
      const payload = {
        exported_at: new Date().toISOString(),
        data: Object.fromEntries(entries),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vreka-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal export data.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
          Data & Privasi
        </p>
        <p className="text-slate-300 text-sm">
          Download semua data kamu di Vreka (satu file JSON) — buat backup atau pindah platform.
        </p>
        {error && <p className="text-xs text-rose-glow mt-1">{error}</p>}
      </div>
      <button onClick={handleExport} disabled={exporting} className={ghostBtnClass}>
        {exporting ? "Nyiapin..." : "Export Semua Data"}
      </button>
    </div>
  );
}
