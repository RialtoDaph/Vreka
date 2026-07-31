"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType } from "@/lib/types";
import { formatRupiah, formatDate } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function TransactionsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      category,
      amount: Number(amount),
      description: description || null,
      occurred_on: occurredOn,
    });

    setAmount("");
    setDescription("");
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("transactions").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className={primaryBtnClass}
        >
          {showForm ? "Batal" : "+ Catat Transaksi"}
        </button>
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleAdd} className="space-y-4">
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
                <label className={labelClass}>Jumlah (Rp)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="50000"
                />
              </div>
              <div>
                <label className={labelClass}>Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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
                  className={inputClass}
                  placeholder="Makan siang tim"
                />
              </div>
            </div>

            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : "Simpan Transaksi"}
            </button>
          </form>
        </HudPanel>
      )}

      <HudPanel>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada transaksi. Mulai catat di atas.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {items.map((tx) => (
              <li
                key={tx.id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {tx.category}
                    {tx.description ? (
                      <span className="text-slate-500"> · {tx.description}</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600">
                    {formatDate(tx.occurred_on)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-sm ${
                      tx.type === "income" ? "text-mint-glow" : "text-rose-glow"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatRupiah(Number(tx.amount))}
                  </span>
                  <button
                    onClick={() => handleDelete(tx.id)}
                    className={dangerBtnClass}
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>
    </div>
  );
}
