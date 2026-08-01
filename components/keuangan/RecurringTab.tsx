"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RecurringItem, RecurringItemCheck, TransactionType } from "@/lib/types";
import { formatCurrency, parseAmount } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export default function RecurringTab() {
  const supabase = createClient();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [checks, setChecks] = useState<RecurringItemCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [type, setType] = useState<TransactionType>("expense");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [amount, setAmount] = useState("");

  const period = currentPeriod();

  function resetForm() {
    setEditingId(null);
    setType("expense");
    setName("");
    setCategory(EXPENSE_CATEGORIES[0]);
    setCategoryTouched(false);
    setAmount("");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function switchType(t: TransactionType) {
    setType(t);
    if (!categoryTouched) {
      setCategory(t === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    }
  }

  function startEdit(item: RecurringItem) {
    setEditingId(item.id);
    setType(item.type);
    setName(item.name);
    setCategory(item.category);
    setCategoryTouched(true);
    setAmount(String(item.amount).replace(".", ","));
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const [{ data: itemRows }, { data: checkRows }] = await Promise.all([
      supabase.from("recurring_items").select("*").order("created_at", { ascending: true }),
      supabase.from("recurring_item_checks").select("*").eq("period", period),
    ]);
    setItems(itemRows ?? []);
    setChecks(checkRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!name.trim() || !amount || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);

    const payload = { type, category, name: name.trim(), amount: parsed };

    if (editingId) {
      await supabase.from("recurring_items").update(payload).eq("id", editingId);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("recurring_items").insert({ user_id: user.id, ...payload });
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("recurring_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setChecks((prev) => prev.filter((c) => c.recurring_item_id !== id));
  }

  async function toggleCheck(item: RecurringItem) {
    if (togglingId) return;
    setTogglingId(item.id);
    const existing = checks.find((c) => c.recurring_item_id === item.id);

    if (existing) {
      // Undo: hapus transaksi yang kebikin otomatis; check-nya ikut kehapus lewat cascade.
      if (existing.transaction_id) {
        await supabase.from("transactions").delete().eq("id", existing.transaction_id);
      } else {
        await supabase.from("recurring_item_checks").delete().eq("id", existing.id);
      }
      setChecks((prev) => prev.filter((c) => c.id !== existing.id));
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setTogglingId(null);
        return;
      }
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          type: item.type,
          category: item.category,
          amount: item.amount,
          description: item.name,
          occurred_on: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();

      if (!txError && tx) {
        const { data: check } = await supabase
          .from("recurring_item_checks")
          .insert({
            user_id: user.id,
            recurring_item_id: item.id,
            transaction_id: tx.id,
            period,
          })
          .select("*")
          .single();
        if (check) setChecks((prev) => [...prev, check]);
      }
    }
    setTogglingId(null);
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const incomeItems = useMemo(() => items.filter((i) => i.type === "income"), [items]);
  const expenseItems = useMemo(() => items.filter((i) => i.type === "expense"), [items]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Tambah Pos Tetap"}
        </button>
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex border border-line rounded-sm overflow-hidden text-sm font-mono w-fit">
              <button
                type="button"
                onClick={() => switchType("expense")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "expense" ? "bg-rose-glow/10 text-rose-glow" : "text-slate-500"
                }`}
              >
                Keluar
              </button>
              <button
                type="button"
                onClick={() => switchType("income")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "income" ? "bg-mint-glow/10 text-mint-glow" : "text-slate-500"
                }`}
              >
                Masuk
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nama Pos</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Gaji / Netflix / Kirim Istri"
                />
              </div>
              <div>
                <label className={labelClass}>Kategori</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setCategoryTouched(true);
                  }}
                  className={inputClass}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Nominal (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="500,00"
                />
              </div>
            </div>

            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update Pos Tetap" : "Simpan Pos Tetap"}
            </button>
          </form>
        </HudPanel>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <RecurringSection
          title="Pemasukan Tetap"
          tone="mint"
          items={incomeItems}
          checks={checks}
          loading={loading}
          togglingId={togglingId}
          emptyText="Belum ada pemasukan tetap. Tambahin misalnya Gaji."
          onToggle={toggleCheck}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
        <RecurringSection
          title="Pengeluaran Tetap"
          tone="rose"
          items={expenseItems}
          checks={checks}
          loading={loading}
          togglingId={togglingId}
          emptyText="Belum ada pengeluaran tetap. Tambahin misalnya Sewa Rumah."
          onToggle={toggleCheck}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function RecurringSection({
  title,
  tone,
  items,
  checks,
  loading,
  togglingId,
  emptyText,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  tone: "mint" | "rose";
  items: RecurringItem[];
  checks: RecurringItemCheck[];
  loading: boolean;
  togglingId: string | null;
  emptyText: string;
  onToggle: (item: RecurringItem) => void;
  onEdit: (item: RecurringItem) => void;
  onDelete: (id: string) => void;
}) {
  const toneClass = tone === "mint" ? "text-mint-glow" : "text-rose-glow";
  const total = items.reduce((sum, i) => sum + Number(i.amount), 0);
  const checkedIds = new Set(checks.map((c) => c.recurring_item_id));
  const checkedCount = items.filter((i) => checkedIds.has(i.id)).length;
  const checkedTotal = items
    .filter((i) => checkedIds.has(i.id))
    .reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <HudPanel>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display font-semibold text-white tracking-wide">{title}</h3>
        <span className={`font-mono text-sm ${toneClass}`}>{formatCurrency(total)}</span>
      </div>
      {items.length > 0 && (
        <p className="text-[11px] font-mono text-slate-500 mb-3">
          Tercatat bulan ini: {checkedCount}/{items.length} ({formatCurrency(checkedTotal)})
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((item) => {
            const isChecked = checkedIds.has(item.id);
            const isBusy = togglingId === item.id;
            return (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isBusy}
                  onChange={() => onToggle(item)}
                  className="h-4 w-4 shrink-0 cursor-pointer disabled:opacity-50 accent-cyan-glow"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm truncate ${
                      isChecked ? "text-slate-500 line-through" : "text-slate-200"
                    }`}
                  >
                    {item.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600">{item.category}</p>
                </div>
                <span
                  className={`font-mono text-sm shrink-0 ${toneClass} ${
                    isChecked ? "opacity-50" : ""
                  }`}
                >
                  {formatCurrency(Number(item.amount))}
                </span>
                <button onClick={() => onEdit(item)} className={ghostBtnClass}>
                  Edit
                </button>
                <button onClick={() => onDelete(item.id)} className={dangerBtnClass}>
                  Hapus
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HudPanel>
  );
}
