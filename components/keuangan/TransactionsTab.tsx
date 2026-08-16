"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Account, Transaction, TransactionKind } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORY_GROUPS, EXPENSE_CATEGORY_GROUPS } from "@/lib/categories";
import { downloadCsv } from "@/lib/csv";
import HudPanel from "@/components/HudPanel";
import CategorySelect from "@/components/CategorySelect";
import { useConfirm } from "@/lib/useConfirm";
import { Paperclip, Camera } from "lucide-react";
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
  const [viewMonth, setViewMonth] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const { confirm, confirmDialog } = useConfirm();

  const [type, setType] = useState<TransactionKind>("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");

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
    setAccountId("");
    setToAccountId("");
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(null);
    setScanError(null);
  }

  async function handleDescriptionBlur() {
    if (editingId || categoryTouched || !description.trim() || type === "transfer") return;
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
    setAccountId(tx.account_id ?? "");
    setToAccountId(tx.to_account_id ?? "");
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

  // viewMonth "" means "semua bulan" (the original unfiltered, paginated
  // view) -- set, it scopes both load() and loadMore() to that month's
  // occurred_on range so browsing a past month doesn't need paging through
  // everything newer than it first.
  function monthRange(month: string): { firstDay: string; lastDay: string } {
    const [y, m] = month.split("-").map(Number);
    return { firstDay: `${month}-01`, lastDay: new Date(y, m, 0).toISOString().slice(0, 10) };
  }

  function baseQuery() {
    let query = supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (viewMonth) {
      const { firstDay, lastDay } = monthRange(viewMonth);
      query = query.gte("occurred_on", firstDay).lte("occurred_on", lastDay);
    }
    return query;
  }

  async function load() {
    setLoading(true);
    const { data } = await baseQuery().range(0, PAGE_SIZE - 1);
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
    const { data } = await baseQuery().range(items.length, items.length + PAGE_SIZE - 1);
    const rows = data ?? [];
    setItems((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  useEffect(() => {
    async function loadAccounts() {
      const { data } = await supabase.from("accounts").select("*").order("created_at", { ascending: true });
      setAccounts(data ?? []);
    }
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountLabel = new Map(accounts.map((a) => [a.id, a.name]));

  const monthSummary =
    viewMonth &&
    items.reduce(
      (acc, t) => {
        if (t.type === "income") acc.income += Number(t.amount);
        else if (t.type === "expense") acc.expense += Number(t.amount);
        return acc;
      },
      { income: 0, expense: 0 }
    );

  function switchType(t: TransactionKind) {
    setType(t);
    if (t === "income") setCategory(INCOME_CATEGORIES[0]);
    else if (t === "expense") setCategory(EXPENSE_CATEGORIES[0]);
    else setCategory("Transfer");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!amount || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Nominal nggak valid. Cek lagi formatnya (misal 50.000).");
      return;
    }
    if (type === "transfer" && (!accountId || !toAccountId || accountId === toAccountId)) {
      setError("Pilih rekening asal dan tujuan yang beda.");
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
      account_id: accountId || null,
      to_account_id: type === "transfer" ? toAccountId : null,
    };

    const { error: saveError } = editingId
      ? await supabase.from("transactions").update(payload).eq("id", editingId)
      : await supabase.from("transactions").insert({ user_id: user.id, ...payload });

    if (saveError) {
      setError("Gagal simpan transaksi. Coba lagi.");
      setSaving(false);
      return;
    }

    // Fire-and-forget -- a budget-threshold push shouldn't block or fail
    // the transaction save itself.
    if (type === "expense") {
      fetch("/api/keuangan/budget-alert-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      }).catch(() => {});
    }

    setError(uploadWarning);
    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus transaksi ini?"))) return;
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
    // Round to whole cents -- EUR has a meaningful fractional unit (unlike
    // the Rupiah this used to be), so this can't round to the nearest whole
    // number anymore; it only exists to clean up float-sum artifacts like
    // 244.34999999999997 before they land in the exported file.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const income = round2(
      rows.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0)
    );
    const expense = round2(
      rows.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0)
    );

    downloadCsv(`vreka-transaksi-${exportMonth}.csv`, [
      ["Laporan Keuangan", exportMonth],
      ["Total Pemasukan", income],
      ["Total Pengeluaran", expense],
      ["Saldo", round2(income - expense)],
      [],
      ["Tanggal", "Tipe", "Kategori", "Catatan", "Jumlah"],
      ...rows.map((t) => [
        t.occurred_on,
        t.type === "income" ? "Pemasukan" : t.type === "expense" ? "Pengeluaran" : "Transfer",
        t.category,
        t.description ?? "",
        round2(Number(t.amount)),
      ]),
    ]);
    setExporting(false);
  }

  const categoryGroups = type === "income" ? INCOME_CATEGORY_GROUPS : EXPENSE_CATEGORY_GROUPS;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="tx-view-month" className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
            Lihat bulan
          </label>
          <input
            id="tx-view-month"
            type="month"
            value={viewMonth}
            onChange={(e) => setViewMonth(e.target.value)}
            className={`${inputClass} w-auto`}
          />
          {viewMonth && (
            <button onClick={() => setViewMonth("")} className={ghostBtnClass}>
              Semua Bulan
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {monthSummary && (
        <p className="font-mono text-xs text-slate-400 flex items-center gap-3 flex-wrap">
          <span>Pemasukan: <span className="text-mint-glow">{formatCurrency(monthSummary.income)}</span></span>
          <span>Pengeluaran: <span className="text-rose-glow">{formatCurrency(monthSummary.expense)}</span></span>
          <span>Saldo: {formatCurrency(monthSummary.income - monthSummary.expense)}</span>
          {hasMore && <span className="text-slate-600">(masih ada data lebih lanjut, muat lebih dulu buat total akurat)</span>}
        </p>
      )}

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
              <button
                type="button"
                onClick={() => switchType("transfer")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  type === "transfer"
                    ? "bg-cyan-glow/10 text-cyan-glow"
                    : "text-slate-500"
                }`}
              >
                Transfer
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-amount" className={labelClass}>Jumlah (€)</label>
                <input
                  id="tx-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="25,50"
                />
              </div>
              {type !== "transfer" && (
                <div>
                  <label htmlFor="tx-category" className={labelClass}>
                    Kategori {categorizing && <span className="text-cyan-glow normal-case">(nebak...)</span>}
                  </label>
                  <CategorySelect
                    id="tx-category"
                    value={category}
                    onChange={(c) => {
                      setCategory(c);
                      setCategoryTouched(true);
                    }}
                    groups={categoryGroups}
                  />
                </div>
              )}
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
              {type === "transfer" ? (
                <>
                  <div>
                    <label htmlFor="tx-account" className={labelClass}>Dari Rekening</label>
                    <select
                      id="tx-account"
                      required
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Pilih rekening</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tx-to-account" className={labelClass}>Ke Rekening</label>
                    <select
                      id="tx-to-account"
                      required
                      value={toAccountId}
                      onChange={(e) => setToAccountId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Pilih rekening</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="tx-account" className={labelClass}>Rekening (opsional)</label>
                  <select
                    id="tx-account"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Belum ditandain</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <Paperclip aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Struk udah ada — upload baru buat ganti
                  </span>
                ) : null}
                <label className={`${ghostBtnClass} cursor-pointer inline-flex items-center gap-1.5`}>
                  {receiptPreview || existingReceiptPath ? (
                    "Ganti Foto"
                  ) : (
                    <>
                      <Camera aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Upload/Scan Struk
                    </>
                  )}
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
            {viewMonth ? "Nggak ada transaksi di bulan ini." : "Belum ada transaksi. Mulai catat di atas."}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {items.map((tx) => (
              <li
                key={tx.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {tx.type === "transfer"
                      ? `Transfer: ${accountLabel.get(tx.account_id ?? "") ?? "?"} → ${accountLabel.get(tx.to_account_id ?? "") ?? "?"}`
                      : tx.category}
                    {tx.description ? (
                      <span className="text-slate-500"> · {tx.description}</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    {formatDate(tx.occurred_on)}
                    {tx.type !== "transfer" && ` · ${accountLabel.get(tx.account_id ?? "") ?? "Belum ditandain"}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-sm ${
                      tx.type === "income"
                        ? "text-mint-glow"
                        : tx.type === "expense"
                          ? "text-rose-glow"
                          : "text-cyan-glow"
                    }`}
                  >
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "⇄ "}
                    {formatCurrency(Number(tx.amount))}
                  </span>
                  {tx.receipt_path && (
                    <button
                      onClick={() => handleViewReceipt(tx)}
                      disabled={viewingReceiptId === tx.id}
                      className={ghostBtnClass}
                      title="Lihat struk"
                      aria-label="Lihat struk"
                    >
                      <Paperclip aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
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

      {confirmDialog}
    </div>
  );
}
