"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function TransactionsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );

  function resetForm() {
    setEditingId(null);
    setType("expense");
    setCategory(EXPENSE_CATEGORIES[0]);
    setCategoryTouched(false);
    setAmount("");
    setDescription("");
    setOccurredOn(new Date().toISOString().slice(0, 10));
  }

  async function handleDescriptionBlur() {
    if (editingId || categoryTouched || !description.trim()) return;
    setCategorizing(true);
    try {
      const res = await fetch("/api/assistant/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, description: description.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.category === "string" && !categoryTouched) {
          setCategory(data.category);
        }
      }
    } catch {
      // gagal nebak kategori bukan hal fatal, user masih bisa pilih manual
    } finally {
      setCategorizing(false);
    }
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(tx: Transaction) {
    setEditingId(tx.id);
    setType(tx.type);
    setCategory(tx.category);
    setCategoryTouched(true);
    setAmount(String(tx.amount).replace(".", ","));
    setDescription(tx.description ?? "");
    setOccurredOn(tx.occurred_on);
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchType(t: TransactionType) {
    setType(t);
    setCategory(t === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!amount || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);

    const payload = {
      type,
      category,
      amount: parsed,
      description: description || null,
      occurred_on: occurredOn,
    };

    if (editingId) {
      await supabase.from("transactions").update(payload).eq("id", editingId);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("transactions").insert({ user_id: user.id, ...payload });
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("transactions").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const incomeItems = useMemo(
    () => items.filter((t) => t.type === "income"),
    [items]
  );
  const expenseItems = useMemo(
    () => items.filter((t) => t.type === "expense"),
    [items]
  );
  const totalIncome = useMemo(
    () => incomeItems.reduce((sum, t) => sum + Number(t.amount), 0),
    [incomeItems]
  );
  const totalExpense = useMemo(
    () => expenseItems.reduce((sum, t) => sum + Number(t.amount), 0),
    [expenseItems]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Catat Transaksi"}
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
                  type === "expense"
                    ? "bg-rose-glow/10 text-rose-glow"
                    : "text-slate-500"
                }`}
              >
                Keluar
              </button>
              <button
                type="button"
                onClick={() => switchType("income")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "income"
                    ? "bg-mint-glow/10 text-mint-glow"
                    : "text-slate-500"
                }`}
              >
                Masuk
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Jumlah (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="50,00"
                />
              </div>
              <div>
                <label className={labelClass}>
                  Kategori {categorizing && <span className="text-cyan-glow normal-case">(nebak...)</span>}
                </label>
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
                <label className={labelClass}>Tanggal</label>
                <input
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Catatan (opsional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  className={inputClass}
                  placeholder="Makan siang tim"
                />
              </div>
            </div>

            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update Transaksi" : "Simpan Transaksi"}
            </button>
          </form>
        </HudPanel>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <TransactionTable
          title="Pemasukan"
          tone="mint"
          items={incomeItems}
          total={totalIncome}
          loading={loading}
          emptyText="Belum ada pemasukan tercatat."
          onEdit={startEdit}
          onDelete={handleDelete}
        />
        <TransactionTable
          title="Pengeluaran"
          tone="rose"
          items={expenseItems}
          total={totalExpense}
          loading={loading}
          emptyText="Belum ada pengeluaran tercatat."
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function TransactionTable({
  title,
  tone,
  items,
  total,
  loading,
  emptyText,
  onEdit,
  onDelete,
}: {
  title: string;
  tone: "mint" | "rose";
  items: Transaction[];
  total: number;
  loading: boolean;
  emptyText: string;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const toneClass = tone === "mint" ? "text-mint-glow" : "text-rose-glow";

  return (
    <HudPanel>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-white tracking-wide">
          {title}
        </h3>
        <span className={`font-mono text-sm ${toneClass}`}>
          {formatCurrency(total)}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-slate-500 border-b border-line">
                <th className="pb-2 pr-3 font-normal">Tanggal</th>
                <th className="pb-2 pr-3 font-normal">Kategori</th>
                <th className="pb-2 pr-3 font-normal">Catatan</th>
                <th className="pb-2 pr-3 font-normal text-right">Jumlah</th>
                <th className="pb-2 font-normal text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-[11px] font-mono text-slate-500">
                    {formatDate(tx.occurred_on)}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-200 whitespace-nowrap">
                    {tx.category}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500 max-w-[180px] truncate">
                    {tx.description ?? "-"}
                  </td>
                  <td className={`py-2.5 pr-3 text-right font-mono whitespace-nowrap ${toneClass}`}>
                    {formatCurrency(Number(tx.amount))}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => onEdit(tx)} className={ghostBtnClass}>
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(tx.id)}
                      className={`${dangerBtnClass} ml-3`}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td
                  colSpan={3}
                  className="pt-2.5 text-[11px] font-mono uppercase tracking-wider text-slate-500"
                >
                  Total
                </td>
                <td className={`pt-2.5 text-right font-mono font-semibold whitespace-nowrap ${toneClass}`}>
                  {formatCurrency(total)}
                </td>
                <td className="pt-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </HudPanel>
  );
}
