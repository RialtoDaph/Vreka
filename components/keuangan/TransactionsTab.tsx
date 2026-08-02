"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import { downloadCsv } from "@/lib/csv";
import HudPanel from "@/components/HudPanel";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

const PAGE_SIZE = 100;

export default function TransactionsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setType("expense");
    setCategory(EXPENSE_CATEGORIES[0]);
    setCategoryTouched(false);
    setAmount("");
    setDescription("");
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(null);
    setScanError(null);
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
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(tx.receipt_path);
    setScanError(null);
    setShowForm(true);
  }

  async function handleReceiptFile(file: File | null) {
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setScanError(null);
    if (!showForm) setShowForm(true);

    setScanning(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/assistant/scan-receipt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Gagal baca struk.");
        return;
      }
      setType("expense");
      setAmount(String(data.amount).replace(".", ","));
      setCategory(data.category);
      setCategoryTouched(true);
      if (data.description) setDescription(data.description);
      if (data.occurred_on) setOccurredOn(data.occurred_on);
    } catch {
      setScanError("Gagal baca struk. Isi manual aja.");
    } finally {
      setScanning(false);
    }
  }

  async function handleViewReceipt(tx: Transaction) {
    if (!tx.receipt_path || viewingReceiptId) return;
    setViewingReceiptId(tx.id);
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(tx.receipt_path, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
    setViewingReceiptId(null);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    const rows = data ?? [];
    setItems(rows);
    // A full page back means there's likely more beyond it -- not a real
    // total count, but enough to know whether to show "load more" instead
    // of silently hiding everything past the first 100 with no indicator.
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(items.length, items.length + PAGE_SIZE - 1);
    const rows = data ?? [];
    setItems((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
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
    if (!amount || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Nominal nggak valid. Cek lagi formatnya (misal 50.000).");
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

    let receiptPath = existingReceiptPath;
    let uploadWarning: string | null = null;
    if (receiptFile) {
      setReceiptUploading(true);
      const ext = receiptFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, receiptFile);
      setReceiptUploading(false);
      if (uploadError) {
        uploadWarning = "Struk gagal diupload, tapi transaksinya tetap disimpan.";
      } else {
        receiptPath = path;
      }
    }

    const payload = {
      type,
      category,
      amount: parsed,
      description: description || null,
      occurred_on: occurredOn,
      receipt_path: receiptPath,
    };

    const { error: saveError } = editingId
      ? await supabase.from("transactions").update(payload).eq("id", editingId)
      : await supabase.from("transactions").insert({ user_id: user.id, ...payload });

    if (saveError) {
      setError("Gagal simpan transaksi. Coba lagi.");
      setSaving(false);
      return;
    }

    setError(uploadWarning);
    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Yakin mau hapus transaksi ini?")) return;
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error: deleteError } = await supabase.from("transactions").delete().eq("id", id);
    if (deleteError) {
      setItems(previous);
      setError("Gagal hapus transaksi. Coba lagi.");
    }
  }

  async function handleExport() {
    setExporting(true);
    const [y, m] = exportMonth.split("-").map(Number);
    const firstDay = `${exportMonth}-01`;
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .gte("occurred_on", firstDay)
      .lte("occurred_on", lastDay)
      .order("occurred_on", { ascending: true });
    const rows = (data ?? []) as Transaction[];
    // Round to whole Rupiah -- IDR has no meaningful fractional unit, and
    // summing floats otherwise leaves artifacts like 244.34999999999997
    // written straight into the exported file.
    const income = Math.round(
      rows.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0)
    );
    const expense = Math.round(
      rows.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0)
    );

    downloadCsv(`vreka-transaksi-${exportMonth}.csv`, [
      ["Laporan Keuangan", exportMonth],
      ["Total Pemasukan", income],
      ["Total Pengeluaran", expense],
      ["Saldo", income - expense],
      [],
      ["Tanggal", "Tipe", "Kategori", "Catatan", "Jumlah"],
      ...rows.map((t) => [
        t.occurred_on,
        t.type === "income" ? "Pemasukan" : "Pengeluaran",
        t.category,
        t.description ?? "",
        Math.round(Number(t.amount)),
      ]),
    ]);
    setExporting(false);
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center gap-2 flex-wrap">
        <input
          type="month"
          value={exportMonth}
          onChange={(e) => setExportMonth(e.target.value)}
          className={`${inputClass} w-auto`}
        />
        <button onClick={handleExport} disabled={exporting} className={ghostBtnClass}>
          {exporting ? "Export..." : "Export CSV"}
        </button>
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Catat Transaksi"}
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
                <label htmlFor="tx-amount" className={labelClass}>Jumlah (Rp)</label>
                <input
                  id="tx-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="50.000"
                />
              </div>
              <div>
                <label htmlFor="tx-category" className={labelClass}>
                  Kategori {categorizing && <span className="text-cyan-glow normal-case">(nebak...)</span>}
                </label>
                <select
                  id="tx-category"
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
                <label htmlFor="tx-date" className={labelClass}>Tanggal</label>
                <input
                  id="tx-date"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tx-description" className={labelClass}>Catatan (opsional)</label>
                <input
                  id="tx-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  className={inputClass}
                  placeholder="Makan siang tim"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Struk (opsional) {scanning && <span className="text-cyan-glow normal-case">(membaca struk...)</span>}
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt="Preview struk"
                    className="h-16 w-16 object-cover rounded-sm border border-line"
                  />
                ) : existingReceiptPath ? (
                  <span className="text-xs text-slate-500 font-mono">📎 Struk udah ada — upload baru buat ganti</span>
                ) : null}
                <label className={`${ghostBtnClass} cursor-pointer`}>
                  {receiptPreview || existingReceiptPath ? "Ganti Foto" : "📷 Upload/Scan Struk"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleReceiptFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {scanError && <p className="text-xs text-rose-glow mt-1.5">{scanError}</p>}
            </div>

            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving
                ? receiptUploading
                  ? "Upload struk..."
                  : "Menyimpan..."
                : editingId
                  ? "Update Transaksi"
                  : "Simpan Transaksi"}
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
                  <p className="text-[11px] font-mono text-slate-400">
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
                    {formatCurrency(Number(tx.amount))}
                  </span>
                  {tx.receipt_path && (
                    <button
                      onClick={() => handleViewReceipt(tx)}
                      disabled={viewingReceiptId === tx.id}
                      className={ghostBtnClass}
                      title="Lihat struk"
                    >
                      📎
                    </button>
                  )}
                  <button onClick={() => startEdit(tx)} className={ghostBtnClass}>
                    Edit
                  </button>
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
        {hasMore && !loading && (
          <div className="flex justify-center pt-4">
            <button onClick={loadMore} disabled={loadingMore} className={ghostBtnClass}>
              {loadingMore ? "Memuat..." : "Muat Lebih Banyak"}
            </button>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
