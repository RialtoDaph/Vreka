"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection, DebtPaymentCheck } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import { currentMonthKey } from "@/lib/date";
import HudPanel from "@/components/HudPanel";
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
  const [checks, setChecks] = useState<DebtPaymentCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("semua");

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
    const [{ data: debtRows }, { data: checkRows }] = await Promise.all([
      supabase
        .from("debts")
        .select("*")
        .order("status", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("debt_payment_checks").select("*").eq("period", period),
    ]);
    setItems(debtRows ?? []);
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

  // Marks/unmarks *this cycle* paid for a recurring debt -- separate from
  // toggleStatus, which closes out the debt entirely. A recurring debt
  // stays "unpaid" (still an ongoing obligation) across many paid cycles.
  async function toggleCheck(debt: Debt) {
    if (togglingId) return;
    setTogglingId(debt.id);
    setError(null);
    const existing = checks.find((c) => c.debt_id === debt.id);

    if (existing) {
      const { error: deleteError } = await supabase
        .from("debt_payment_checks")
        .delete()
        .eq("id", existing.id);
      if (deleteError) {
        setError("Gagal batal-centang. Coba lagi.");
      } else {
        setChecks((prev) => prev.filter((c) => c.id !== existing.id));
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesi login habis. Refresh halaman terus coba lagi.");
        setTogglingId(null);
        return;
      }
      const { data: check, error: insertError } = await supabase
        .from("debt_payment_checks")
        .insert({ user_id: user.id, debt_id: debt.id, period })
        .select("*")
        .single();
      if (insertError || !check) {
        setError("Gagal catat pembayaran. Coba lagi.");
      } else {
        setChecks((prev) => [...prev, check]);
      }
    }
    setTogglingId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Yakin mau hapus catatan utang/piutang ini? Riwayat pembayarannya ikut hilang.")) return;
    setError(null);
    const previousItems = items;
    const previousChecks = checks;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setChecks((prev) => prev.filter((c) => c.debt_id !== id));
    const { error: deleteError } = await supabase.from("debts").delete().eq("id", id);
    if (deleteError) {
      setItems(previousItems);
      setChecks(previousChecks);
      setError("Gagal hapus. Coba lagi.");
    }
  }

  // Totals reflect only what's still owed -- a paid-off debt shouldn't
  // keep inflating "total utang/piutang", it just stays in the list below
  // (struck through, tagged LUNAS) for the record.
  const unpaid = items.filter((d) => d.status === "unpaid");
  const totalUtang = unpaid
    .filter((d) => d.direction === "i_owe")
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPiutang = unpaid
    .filter((d) => d.direction === "owed_to_me")
    .reduce((sum, d) => sum + Number(d.amount), 0);
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
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
            Total Utang (kamu berutang)
          </p>
          <p className="font-mono text-xl font-bold text-rose-glow">{formatCurrency(totalUtang)}</p>
        </HudPanel>
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
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
                : "border-line text-slate-500 hover:text-slate-300"
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
                    : "text-slate-500"
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
                    : "text-slate-500"
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
                  placeholder="500.000"
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
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada utang/piutang tercatat.</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-slate-500">Gak ada data di filter ini.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {filteredItems.map((debt) => {
              const isChecked = checks.some((c) => c.debt_id === debt.id);
              const isBusy = togglingId === debt.id;
              const showCycleCheck = debt.is_recurring && debt.status === "unpaid";
              return (
              <li
                key={debt.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
              >
                <div className="min-w-0 flex items-center gap-3">
                  {showCycleCheck && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isBusy}
                      onChange={() => toggleCheck(debt)}
                      aria-label={`Sudah bayar ${debt.party_name} bulan ini`}
                      className="h-4 w-4 shrink-0 cursor-pointer disabled:opacity-50 accent-cyan-glow"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">
                      {debt.party_name}
                      {debt.status === "paid" && (
                        <span className="ml-2 text-[10px] font-mono text-mint-glow border border-mint-glow/30 rounded-sm px-1.5 py-0.5">
                          LUNAS
                        </span>
                      )}
                      {debt.is_recurring && isChecked && (
                        <span className="ml-2 text-[10px] font-mono text-cyan-glow border border-cyan-glow/30 rounded-sm px-1.5 py-0.5">
                          BULAN INI LUNAS
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] font-mono text-slate-600">
                      {debt.is_recurring
                        ? `Berulang · tiap tanggal ${debt.recurrence_day}`
                        : debt.due_date
                          ? `Jatuh tempo ${formatDate(debt.due_date)}`
                          : "Tanpa jatuh tempo"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-sm ${
                      debt.direction === "i_owe" ? "text-rose-glow" : "text-mint-glow"
                    } ${debt.status === "paid" ? "opacity-40 line-through" : ""}`}
                  >
                    {formatCurrency(Number(debt.amount))}
                  </span>
                  <button
                    onClick={() => toggleStatus(debt)}
                    className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                  >
                    {debt.status === "paid"
                      ? "Buka lagi"
                      : debt.is_recurring
                        ? "Tutup utang"
                        : "Tandai lunas"}
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
    </div>
  );
}
