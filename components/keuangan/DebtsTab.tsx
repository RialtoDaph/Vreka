"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function DebtsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    if (!partyName || !amount || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);

    const payload = {
      party_name: partyName,
      direction,
      amount: parsed,
      due_date: dueDate || null,
      notes: notes || null,
    };

    if (editingId) {
      await supabase.from("debts").update(payload).eq("id", editingId);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("debts").insert({ user_id: user.id, ...payload });
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleStatus(debt: Debt) {
    const newStatus = debt.status === "paid" ? "unpaid" : "paid";
    await supabase.from("debts").update({ status: newStatus }).eq("id", debt.id);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("debts").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Catat Utang/Piutang"}
        </button>
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
                <label className={labelClass}>Nama Pihak</label>
                <input
                  type="text"
                  required
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  className={inputClass}
                  placeholder="Bank / Nama orang"
                />
              </div>
              <div>
                <label className={labelClass}>Jumlah (Rp)</label>
                <input
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
                <label className={labelClass}>Jatuh Tempo (opsional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Catatan (opsional)</label>
                <input
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
        ) : (
          <ul className="divide-y divide-line/60">
            {items.map((debt) => (
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
