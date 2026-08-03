"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("semua");

  const [partyName, setPartyName] = useState("");
  const [direction, setDirection] = useState<DebtDirection>("i_owe");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setEditingId(null);
    setPartyName("");
    setDirection("i_owe");
    setAmount("");
    setDueDate("");
    setNotes("");
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
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("debts")
      .select("*")
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
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
      party_name: partyName,
      direction,
      amount: parsed,
      due_date: dueDate || null,
      notes: notes || null,
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

  async function handleDelete(id: string) {
    if (!window.confirm("Yakin mau hapus catatan utang/piutang ini?")) return;
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error: deleteError } = await supabase.from("debts").delete().eq("id", id);
    if (deleteError) {
      setItems(previous);
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
            {filteredItems.map((debt) => (
              <li
                key={debt.id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {debt.party_name}
                    {debt.status === "paid" && (
                      <span className="ml-2 text-[10px] font-mono text-mint-glow border border-mint-glow/30 rounded-sm px-1.5 py-0.5">
                        LUNAS
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600">
                    {debt.due_date ? `Jatuh tempo ${formatDate(debt.due_date)}` : "Tanpa jatuh tempo"}
                  </p>
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
            ))}
          </ul>
        )}
      </HudPanel>
    </div>
  );
}
