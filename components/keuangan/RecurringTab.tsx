"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RecurringItem, RecurringItemCheck, TransactionType } from "@/lib/types";
import { formatCurrency, parseAmount } from "@/lib/format";
import { currentMonthKey, todayKey } from "@/lib/date";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORY_GROUPS, EXPENSE_CATEGORY_GROUPS } from "@/lib/categories";
import CategorySelect from "@/components/CategorySelect";
import HudPanel from "@/components/HudPanel";
import { useConfirm } from "@/lib/useConfirm";
import { Zap } from "lucide-react";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

export default function RecurringTab() {
  const supabase = createClient();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [checks, setChecks] = useState<RecurringItemCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [type, setType] = useState<TransactionType>("expense");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [autoPost, setAutoPost] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState("1");

  const period = currentMonthKey();

  function resetForm() {
    setEditingId(null);
    setType("expense");
    setName("");
    setCategory(EXPENSE_CATEGORIES[0]);
    setCategoryTouched(false);
    setAmount("");
    setAutoPost(false);
    setDayOfMonth("1");
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
    setAutoPost(item.auto_post);
    setDayOfMonth(String(item.day_of_month ?? 1));
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
    if (!name.trim() || !amount || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Nominal atau nama nggak valid. Cek lagi formatnya (misal 500.000).");
      return;
    }
    const day = Number(dayOfMonth);
    if (autoPost && (!Number.isInteger(day) || day < 1 || day > 31)) {
      setError("Tanggal auto-post harus antara 1-31.");
      return;
    }
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const payload = {
      type,
      category,
      name: name.trim(),
      amount: parsed,
      auto_post: autoPost,
      day_of_month: autoPost ? day : null,
    };

    const { error: saveError } = editingId
      ? await supabase.from("recurring_items").update(payload).eq("id", editingId)
      : await supabase.from("recurring_items").insert({ user_id: user.id, ...payload });

    if (saveError) {
      setError("Gagal simpan pos tetap. Coba lagi.");
      setSaving(false);
      return;
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus pos tetap ini? Riwayat centangnya ikut hilang."))) return;
    setError(null);
    const previousItems = items;
    const previousChecks = checks;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setChecks((prev) => prev.filter((c) => c.recurring_item_id !== id));
    const { error: deleteError } = await supabase.from("recurring_items").delete().eq("id", id);
    if (deleteError) {
      setItems(previousItems);
      setChecks(previousChecks);
      setError("Gagal hapus pos tetap. Coba lagi.");
    }
  }

  async function toggleCheck(item: RecurringItem) {
    if (togglingId) return;
    setTogglingId(item.id);
    setError(null);
    const existing = checks.find((c) => c.recurring_item_id === item.id);

    if (existing) {
      // Undo: hapus transaksi yang kebikin otomatis; check-nya ikut kehapus lewat cascade.
      const { error: undoError } = existing.transaction_id
        ? await supabase.from("transactions").delete().eq("id", existing.transaction_id)
        : await supabase.from("recurring_item_checks").delete().eq("id", existing.id);
      if (undoError) {
        setError("Gagal batal-centang. Coba lagi.");
      } else {
        setChecks((prev) => prev.filter((c) => c.id !== existing.id));
      }
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
          occurred_on: todayKey(),
        })
        .select("id")
        .single();

      if (txError || !tx) {
        setError("Gagal catat transaksi. Coba lagi.");
      } else {
        // Fire-and-forget, same as TransactionsTab's manual form -- checking
        // off a Pos Tetap creates a real expense transaction too, so it
        // needs to trip a budget threshold just as reliably as one entered
        // by hand.
        if (item.type === "expense") {
          fetch("/api/keuangan/budget-alert-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: item.category }),
          }).catch(() => {});
        }

        const { data: check, error: checkError } = await supabase
          .from("recurring_item_checks")
          .insert({
            user_id: user.id,
            recurring_item_id: item.id,
            transaction_id: tx.id,
            period,
          })
          .select("*")
          .single();
        if (checkError || !check) {
          // Transaksinya kesimpen tapi check-nya gagal -- jangan biarin diam-diam,
          // biar user tau harus refresh/cek manual daripada nyoba centang lagi
          // (yang bakal nyatet transaksi kedua).
          setError(
            "Transaksi kesimpen, tapi statusnya gagal ke-update. Refresh halaman buat lihat status terbaru."
          );
        } else {
          setChecks((prev) => [...prev, check]);
        }
      }
    }
    setTogglingId(null);
  }

  const categoryGroups = type === "income" ? INCOME_CATEGORY_GROUPS : EXPENSE_CATEGORY_GROUPS;
  const incomeItems = useMemo(() => items.filter((i) => i.type === "income"), [items]);
  const expenseItems = useMemo(() => items.filter((i) => i.type === "expense"), [items]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Tambah Pos Tetap"}
        </button>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex border border-line rounded-sm overflow-hidden text-sm font-mono w-fit">
              <button
                type="button"
                onClick={() => switchType("expense")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "expense" ? "bg-rose-glow/10 text-rose-glow" : "text-fg-subtle"
                }`}
              >
                Keluar
              </button>
              <button
                type="button"
                onClick={() => switchType("income")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "income" ? "bg-mint-glow/10 text-mint-glow" : "text-fg-subtle"
                }`}
              >
                Masuk
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="recurring-name" className={labelClass}>Nama Pos</label>
                <input
                  id="recurring-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Gaji / Netflix / Kirim Istri"
                />
              </div>
              <div>
                <label htmlFor="recurring-category" className={labelClass}>Kategori</label>
                <CategorySelect
                  id="recurring-category"
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setCategoryTouched(true);
                  }}
                  groups={categoryGroups}
                />
              </div>
              <div>
                <label htmlFor="recurring-amount" className={labelClass}>Nominal (€)</label>
                <input
                  id="recurring-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="1.200,00"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2.5 text-sm text-fg-muted cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={autoPost}
                  onChange={(e) => setAutoPost(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-cyan-glow"
                />
                Auto-post tiap bulan (nggak perlu dicentang manual)
              </label>
              {autoPost && (
                <div className="mt-2.5 max-w-[10rem]">
                  <label htmlFor="recurring-day" className={labelClass}>Tanggal tiap bulan</label>
                  <input
                    id="recurring-day"
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
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

      {confirmDialog}
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
        <h3 className="font-display font-semibold text-fg tracking-wide">{title}</h3>
        <span className={`font-mono text-sm ${toneClass}`}>{formatCurrency(total)}</span>
      </div>
      {items.length > 0 && (
        <p className="text-[11px] font-mono text-fg-subtle mb-3">
          Tercatat bulan ini: {checkedCount}/{items.length} ({formatCurrency(checkedTotal)})
        </p>
      )}

      {loading ? (
        <p className="text-sm text-fg-subtle">Memuat...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-subtle">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((item) => {
            const isChecked = checkedIds.has(item.id);
            const isBusy = togglingId === item.id;
            return (
              <li
                key={item.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
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
                      isChecked ? "text-fg-subtle line-through" : "text-fg-secondary"
                    }`}
                  >
                    {item.name}
                  </p>
                  <p className="text-[11px] font-mono text-fg-subtle">
                    {item.category}
                    {item.auto_post && (
                      <span className="text-cyan-glow inline-flex items-center gap-1">
                        {" · "}
                        <Zap aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
                        auto tgl {item.day_of_month}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-sm ${toneClass} ${isChecked ? "opacity-50" : ""}`}
                  >
                    {formatCurrency(Number(item.amount))}
                  </span>
                  <button onClick={() => onEdit(item)} className={ghostBtnClass}>
                    Edit
                  </button>
                  <button onClick={() => onDelete(item.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HudPanel>
  );
}
