"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection, DebtPayment } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import { currentMonthKey, todayKey } from "@/lib/date";
import { sumPaidByDebt, remainingDebtAmount } from "@/lib/debts";
import HudPanel from "@/components/HudPanel";
import { useConfirm } from "@/lib/useConfirm";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

type DirectionFilter = "semua" | DebtDirection;

const DIRECTION_FILTERS: { key: DirectionFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "i_owe", label: "Aku Berutang" },
  { key: "owed_to_me", label: "Piutang ke Aku" },
];

export default function DebtsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBusyId, setPayBusyId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("semua");
  const { confirm, confirmDialog } = useConfirm();

  const [partyName, setPartyName] = useState("");
  const [direction, setDirection] = useState<DebtDirection>("i_owe");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState("1");

  const period = currentMonthKey();

  function resetForm() {
    setEditingId(null);
    setPartyName("");
    setDirection("i_owe");
    setAmount("");
    setDueDate("");
    setNotes("");
    setIsRecurring(false);
    setRecurrenceDay("1");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(debt: Debt) {
    setEditingId(debt.id);
    setPartyName(debt.party_name);
    setDirection(debt.direction);
    setAmount(String(debt.amount).replace(".", ","));
    setDueDate(debt.due_date ?? "");
    setNotes(debt.notes ?? "");
    setIsRecurring(debt.is_recurring);
    setRecurrenceDay(String(debt.recurrence_day ?? 1));
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    // Payments aren't scoped to the current period -- the running balance
    // needs every payment ever made against a debt, not just this month's.
    const [{ data: debtRows }, { data: paymentRows }] = await Promise.all([
      supabase
        .from("debts")
        .select("*")
        .order("status", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("debt_payments").select("*"),
    ]);
    setItems(debtRows ?? []);
    setPayments(paymentRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!partyName || !amount || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Nominal atau nama pihak nggak valid. Cek lagi formatnya (misal 500.000).");
      return;
    }
    const day = Number(recurrenceDay);
    if (isRecurring && (!Number.isInteger(day) || day < 1 || day > 31)) {
      setError("Tanggal jatuh tempo bulanan harus antara 1-31.");
      return;
    }
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      setSaving(false);
      return;
    }

    const payload = {
      party_name: partyName,
      direction,
      amount: parsed,
      due_date: isRecurring ? null : dueDate || null,
      notes: notes || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring ? day : null,
    };

    const { error: saveError } = editingId
      ? await supabase.from("debts").update(payload).eq("id", editingId)
      : await supabase.from("debts").insert({ user_id: user.id, ...payload });

    if (saveError) {
      setError("Gagal simpan utang/piutang. Coba lagi.");
      setSaving(false);
      return;
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleStatus(debt: Debt) {
    setError(null);
    const newStatus = debt.status === "paid" ? "unpaid" : "paid";
    const { error: updateError } = await supabase
      .from("debts")
      .update({ status: newStatus })
      .eq("id", debt.id);
    if (updateError) {
      setError("Gagal update status. Coba lagi.");
      return;
    }
    load();
  }

  function startPay(debt: Debt) {
    setError(null);
    setPayingId(debt.id);
    setPayAmount(String(remaining(debt)).replace(".", ","));
  }

  function cancelPay() {
    setPayingId(null);
    setPayAmount("");
  }

  // Records a real installment: a transaction (so it shows up in the rest
  // of the app's cash flow -- budgets, analytics, exports) plus a
  // debt_payments row (so the debt's remaining balance actually shrinks).
  // A recurring debt's payment is tagged with the current period so it
  // can't be double-booked for the same month; a one-off debt just gets an
  // untagged installment, as many as it takes.
  async function handlePay(debt: Debt) {
    const parsed = parseAmount(payAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Nominal pembayaran nggak valid.");
      return;
    }
    setPayBusyId(debt.id);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesi login habis. Refresh halaman terus coba lagi.");
        return;
      }

      const category = debt.direction === "i_owe" ? "Cicilan/Utang" : "Piutang Diterima";
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          type: debt.direction === "i_owe" ? "expense" : "income",
          category,
          amount: parsed,
          description:
            debt.direction === "i_owe" ? `Cicilan ${debt.party_name}` : `Pembayaran dari ${debt.party_name}`,
          occurred_on: todayKey(),
        })
        .select("id")
        .single();
      if (txError || !tx) {
        setError("Gagal catat transaksi pembayaran. Coba lagi.");
        return;
      }

      // Fire-and-forget, same as TransactionsTab's manual form -- this path
      // creates a real expense transaction too, so it needs to trip a
      // budget threshold ("Cicilan/Utang" is a real budget category) just
      // as reliably as one entered by hand.
      if (debt.direction === "i_owe") {
        fetch("/api/keuangan/budget-alert-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category }),
        }).catch(() => {});
      }

      const { data: payment, error: paymentError } = await supabase
        .from("debt_payments")
        .insert({
          user_id: user.id,
          debt_id: debt.id,
          amount: parsed,
          transaction_id: tx.id,
          period: debt.is_recurring ? period : null,
          paid_on: todayKey(),
        })
        .select("*")
        .single();
      if (paymentError || !payment) {
        // The transaction's already in, so don't let the balance silently
        // look wrong -- tell the user to check instead of retrying blind
        // (a retry here would double-book the payment).
        setError(
          "Transaksi kesimpen, tapi catatan pembayarannya gagal ke-update. Refresh halaman buat lihat status terbaru."
        );
        return;
      }

      const nextPayments = [...payments, payment as DebtPayment];
      setPayments(nextPayments);
      const paidSoFar = nextPayments
        .filter((p) => p.debt_id === debt.id)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (Number(debt.amount) - paidSoFar <= 0 && debt.status !== "paid") {
        const { error: closeError } = await supabase
          .from("debts")
          .update({ status: "paid" })
          .eq("id", debt.id);
        if (!closeError) {
          setItems((prev) => prev.map((d) => (d.id === debt.id ? { ...d, status: "paid" } : d)));
        }
      }
      setPayingId(null);
      setPayAmount("");
    } catch {
      setError("Koneksi terputus pas nyimpen pembayaran. Coba lagi.");
    } finally {
      setPayBusyId(null);
    }
  }

  // Deleting the transaction cascades to the debt_payments row (same
  // pattern as RecurringTab's undo), so the balance and the rest of the
  // app's cash flow stay in sync automatically.
  async function handleUndoPayment(payment: DebtPayment) {
    if (undoingId) return;
    if (!(await confirm("Batalkan pembayaran ini? Transaksinya ikut kehapus."))) return;
    setUndoingId(payment.id);
    setError(null);
    const previousPayments = payments;
    const previousItems = items;
    setPayments((prev) => prev.filter((p) => p.id !== payment.id));
    try {
      const { error: deleteError } = payment.transaction_id
        ? await supabase.from("transactions").delete().eq("id", payment.transaction_id)
        : await supabase.from("debt_payments").delete().eq("id", payment.id);
      if (deleteError) {
        setPayments(previousPayments);
        setError("Gagal batalkan pembayaran. Coba lagi.");
        return;
      }
      const debt = items.find((d) => d.id === payment.debt_id);
      if (debt && debt.status === "paid") {
        const { error: reopenError } = await supabase
          .from("debts")
          .update({ status: "unpaid" })
          .eq("id", debt.id);
        if (!reopenError) {
          setItems((prev) => prev.map((d) => (d.id === debt.id ? { ...d, status: "unpaid" } : d)));
        }
      }
    } catch {
      setPayments(previousPayments);
      setItems(previousItems);
      setError("Koneksi terputus pas batalin. Coba lagi.");
    } finally {
      setUndoingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus catatan utang/piutang ini? Riwayat pembayarannya ikut hilang."))) return;
    setError(null);
    const previousItems = items;
    const previousPayments = payments;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPayments((prev) => prev.filter((p) => p.debt_id !== id));
    const { error: deleteError } = await supabase.from("debts").delete().eq("id", id);
    if (deleteError) {
      setItems(previousItems);
      setPayments(previousPayments);
      setError("Gagal hapus. Coba lagi.");
    }
  }

  const paidByDebt = useMemo(() => sumPaidByDebt(payments), [payments]);

  function remaining(debt: Debt): number {
    return remainingDebtAmount(debt.id, Number(debt.amount), paidByDebt);
  }

  function currentCyclePayment(debt: Debt): DebtPayment | undefined {
    if (!debt.is_recurring) return undefined;
    return payments.find((p) => p.debt_id === debt.id && p.period === period);
  }

  // Totals reflect only what's actually still owed -- a paid-off debt (or
  // one whose payments have brought its balance to zero) shouldn't keep
  // inflating "total utang/piutang"; it just stays in the list below
  // (struck through, tagged LUNAS) for the record.
  const unpaid = items.filter((d) => d.status === "unpaid" && remaining(d) > 0);
  const totalUtang = unpaid
    .filter((d) => d.direction === "i_owe")
    .reduce((sum, d) => sum + remaining(d), 0);
  const totalPiutang = unpaid
    .filter((d) => d.direction === "owed_to_me")
    .reduce((sum, d) => sum + remaining(d), 0);
  const filteredItems = items.filter(
    (d) => directionFilter === "semua" || d.direction === directionFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Catat Utang/Piutang"}
        </button>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      <div className="grid sm:grid-cols-2 gap-3.5">
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
            Total Utang (kamu berutang)
          </p>
          <p className="font-mono text-xl font-bold text-rose-glow">{formatCurrency(totalUtang)}</p>
        </HudPanel>
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
            Total Piutang (kamu ditagih)
          </p>
          <p className="font-mono text-xl font-bold text-mint-glow">{formatCurrency(totalPiutang)}</p>
        </HudPanel>
      </div>

      <div className="flex gap-2 flex-wrap">
        {DIRECTION_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setDirectionFilter(f.key)}
            className={`px-4 py-1.5 font-mono text-[11.5px] uppercase tracking-wider rounded-full border transition-colors ${
              directionFilter === f.key
                ? "border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow"
                : "border-line text-slate-400 hover:text-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex border border-line rounded-sm overflow-hidden text-sm font-mono w-fit">
              <button
                type="button"
                onClick={() => setDirection("i_owe")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  direction === "i_owe"
                    ? "bg-rose-glow/10 text-rose-glow"
                    : "text-slate-400"
                }`}
              >
                Aku Berutang
              </button>
              <button
                type="button"
                onClick={() => setDirection("owed_to_me")}
                className={`px-4 py-2 uppercase tracking-wider transition-colors ${
                  direction === "owed_to_me"
                    ? "bg-mint-glow/10 text-mint-glow"
                    : "text-slate-400"
                }`}
              >
                Piutang ke Aku
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="debt-party" className={labelClass}>Nama Pihak</label>
                <input
                  id="debt-party"
                  type="text"
                  required
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  className={inputClass}
                  placeholder="Bank / Nama orang"
                />
              </div>
              <div>
                <label htmlFor="debt-amount" className={labelClass}>Jumlah (€)</label>
                <input
                  id="debt-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="1.200,00"
                />
              </div>
              {!isRecurring && (
                <div>
                  <label htmlFor="debt-due-date" className={labelClass}>Jatuh Tempo (opsional)</label>
                  <input
                    id="debt-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label htmlFor="debt-notes" className={labelClass}>Catatan (opsional)</label>
                <input
                  id="debt-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-cyan-glow"
                />
                Berulang tiap bulan (misal transfer bank tiap tanggal tertentu)
              </label>
              {isRecurring && (
                <div className="mt-2.5 max-w-[10rem]">
                  <label htmlFor="debt-recurrence-day" className={labelClass}>Tanggal tiap bulan</label>
                  <input
                    id="debt-recurrence-day"
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update" : "Simpan"}
            </button>
          </form>
        </HudPanel>
      )}

      <HudPanel>
        {loading ? (
          <p className="text-sm text-slate-400">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada utang/piutang tercatat.</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-slate-400">Gak ada data di filter ini.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {filteredItems.map((debt) => {
              const paid = paidByDebt[debt.id] ?? 0;
              const left = remaining(debt);
              const pct = Math.min(100, Math.round((paid / Number(debt.amount)) * 100));
              const cyclePayment = currentCyclePayment(debt);
              const isPaying = payingId === debt.id;
              const isPayBusy = payBusyId === debt.id;
              return (
              <li
                key={debt.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">
                    {debt.party_name}
                    {debt.status === "paid" && (
                      <span className="ml-2 text-[10px] font-mono text-mint-glow border border-mint-glow/30 rounded-sm px-1.5 py-0.5">
                        LUNAS
                      </span>
                    )}
                    {cyclePayment && (
                      <span className="ml-2 text-[10px] font-mono text-cyan-glow border border-cyan-glow/30 rounded-sm px-1.5 py-0.5">
                        BULAN INI LUNAS
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    {debt.is_recurring
                      ? `Berulang · tiap tanggal ${debt.recurrence_day}`
                      : debt.due_date
                        ? `Jatuh tempo ${formatDate(debt.due_date)}`
                        : "Tanpa jatuh tempo"}
                  </p>
                  {debt.status !== "paid" && paid > 0 && (
                    <div className="mt-1.5 max-w-xs">
                      <div className="h-1.5 bg-panel2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-glow rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                        Udah dibayar {formatCurrency(paid)} dari {formatCurrency(Number(debt.amount))}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span
                      className={`font-mono text-sm block ${
                        debt.direction === "i_owe" ? "text-rose-glow" : "text-mint-glow"
                      } ${debt.status === "paid" ? "opacity-40 line-through" : ""}`}
                    >
                      {formatCurrency(debt.status === "paid" ? Number(debt.amount) : left)}
                    </span>
                    {debt.status !== "paid" && paid > 0 && (
                      <span className="text-[10px] font-mono text-slate-400">sisa</span>
                    )}
                  </div>

                  {debt.status !== "paid" &&
                    (isPaying ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          className={`${inputClass} w-28`}
                          placeholder="Nominal"
                          aria-label={`Nominal pembayaran ${debt.party_name}`}
                        />
                        <button
                          onClick={() => handlePay(debt)}
                          disabled={isPayBusy}
                          className={primaryBtnClass}
                        >
                          {isPayBusy ? "..." : "OK"}
                        </button>
                        <button onClick={cancelPay} className={ghostBtnClass}>
                          Batal
                        </button>
                      </div>
                    ) : cyclePayment ? (
                      <button
                        onClick={() => handleUndoPayment(cyclePayment)}
                        disabled={undoingId === cyclePayment.id}
                        className={ghostBtnClass}
                      >
                        {undoingId === cyclePayment.id ? "..." : "Batalkan"}
                      </button>
                    ) : (
                      <button onClick={() => startPay(debt)} className={ghostBtnClass}>
                        + Bayar
                      </button>
                    ))}

                  <button
                    onClick={() => toggleStatus(debt)}
                    className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                  >
                    {debt.status === "paid" ? "Buka lagi" : "Tandai lunas"}
                  </button>
                  <button onClick={() => startEdit(debt)} className={ghostBtnClass}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(debt.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </HudPanel>

      {confirmDialog}
    </div>
  );
}
