"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Budget } from "@/lib/types";
import { formatCurrency, parseAmount } from "@/lib/format";
import { localDateKey } from "@/lib/date";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function BudgetsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [monthlyLimit, setMonthlyLimit] = useState("");

  function resetForm() {
    setEditingId(null);
    setCategory(EXPENSE_CATEGORIES[0]);
    setMonthlyLimit("");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(budget: Budget) {
    setEditingId(budget.id);
    setCategory(budget.category);
    setMonthlyLimit(String(budget.monthly_limit).replace(".", ","));
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const now = new Date();
    const firstDayOfMonth = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1));

    const [{ data: budgets }, { data: txMonth }] = await Promise.all([
      supabase.from("budgets").select("*").order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("category, amount")
        .eq("type", "expense")
        .gte("occurred_on", firstDayOfMonth),
    ]);

    const totals: Record<string, number> = {};
    for (const t of txMonth ?? []) {
      totals[t.category] = (totals[t.category] ?? 0) + Number(t.amount);
    }
    setSpent(totals);
    setItems(budgets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(monthlyLimit);
    if (!monthlyLimit || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);

    if (editingId) {
      await supabase.from("budgets").update({ monthly_limit: parsed }).eq("id", editingId);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Satu kategori cuma boleh punya satu anggaran (unique constraint),
      // jadi kalau user pilih kategori yang udah ada, ini efektifnya update.
      await supabase
        .from("budgets")
        .upsert(
          { user_id: user.id, category, monthly_limit: parsed },
          { onConflict: "user_id,category" }
        );
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("budgets").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const budgetedCategories = new Set(items.map((b) => b.category));
  const availableCategories = editingId
    ? EXPENSE_CATEGORIES
    : EXPENSE_CATEGORIES.filter((c) => !budgetedCategories.has(c));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={toggleForm}
          disabled={!editingId && availableCategories.length === 0}
          className={primaryBtnClass}
        >
          {showForm ? "Batal" : "+ Anggaran Baru"}
        </button>
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Kategori</label>
                <select
                  value={category}
                  disabled={!!editingId}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Batas Bulanan (Rp)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  className={inputClass}
                  placeholder="500.000"
                />
              </div>
            </div>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update Anggaran" : "Simpan Anggaran"}
            </button>
          </form>
        </HudPanel>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Memuat...</p>
        </HudPanel>
      ) : items.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-500">
            Belum ada anggaran. Set batas bulanan per kategori biar Aslan bisa
            ngingetin kalau kepake kebanyakan.
          </p>
        </HudPanel>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((budget) => {
            const used = spent[budget.category] ?? 0;
            const pct = Math.round((used / Number(budget.monthly_limit)) * 100);
            const over = pct >= 100;
            const near = pct >= 90 && pct < 100;
            const barColor = over ? "bg-rose-glow" : near ? "bg-amber-glow" : "bg-cyan-glow";
            const textColor = over ? "text-rose-glow" : near ? "text-amber-glow" : "text-slate-400";
            return (
              <HudPanel key={budget.id}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-semibold text-slate-100">{budget.category}</h3>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEdit(budget)} className={ghostBtnClass}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(budget.id)} className={dangerBtnClass}>
                      Hapus
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-panel2 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className={`flex justify-between text-xs font-mono mb-1 ${textColor}`}>
                  <span>{formatCurrency(used)}</span>
                  <span>
                    {formatCurrency(Number(budget.monthly_limit))} · {pct}%
                  </span>
                </div>
                {over && (
                  <p className="text-[11px] text-rose-glow">Anggaran bulan ini kebobolan.</p>
                )}
              </HudPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
