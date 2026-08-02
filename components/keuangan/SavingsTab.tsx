"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SavingsGoal } from "@/lib/types";
import { formatCurrency, formatDate, parseAmount } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function SavingsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFundId, setAddFundId] = useState<string | null>(null);
  const [addFundValue, setAddFundValue] = useState("");

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");

  function resetForm() {
    setEditingId(null);
    setName("");
    setTarget("");
    setCurrent("");
    setDeadline("");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(goal: SavingsGoal) {
    setEditingId(goal.id);
    setName(goal.name);
    setTarget(String(goal.target_amount).replace(".", ","));
    setCurrent(String(goal.current_amount).replace(".", ","));
    setDeadline(goal.deadline ?? "");
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("savings_goals")
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedTarget = parseAmount(target);
    const parsedCurrent = current ? parseAmount(current) : 0;
    if (!name || !target || !Number.isFinite(parsedTarget) || parsedTarget <= 0) return;
    setSaving(true);

    const payload = {
      name,
      target_amount: parsedTarget,
      current_amount: Number.isFinite(parsedCurrent) ? parsedCurrent : 0,
      deadline: deadline || null,
    };

    if (editingId) {
      await supabase.from("savings_goals").update(payload).eq("id", editingId);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("savings_goals").insert({ user_id: user.id, ...payload });
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleAddFund(goal: SavingsGoal) {
    const add = parseAmount(addFundValue);
    if (!Number.isFinite(add) || !add) return;
    await supabase
      .from("savings_goals")
      .update({ current_amount: Number(goal.current_amount) + add })
      .eq("id", goal.id);
    setAddFundId(null);
    setAddFundValue("");
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("savings_goals").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Target Baru"}
        </button>
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Nama Target</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Dana Darurat"
                />
              </div>
              <div>
                <label className={labelClass}>Target (Rp)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={inputClass}
                  placeholder="10.000.000"
                />
              </div>
              <div>
                <label className={labelClass}>Sudah Terkumpul (opsional)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Deadline (opsional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update Target" : "Simpan Target"}
            </button>
          </form>
        </HudPanel>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Memuat...</p>
        </HudPanel>
      ) : items.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Belum ada target tabungan.</p>
        </HudPanel>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((goal) => {
            const pct = Math.min(
              100,
              Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100)
            );
            return (
              <HudPanel key={goal.id}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-semibold text-slate-100">{goal.name}</h3>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEdit(goal)} className={ghostBtnClass}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(goal.id)} className={dangerBtnClass}>
                      Hapus
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-panel2 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-cyan-glow rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono text-slate-400 mb-3">
                  <span>{formatCurrency(Number(goal.current_amount))}</span>
                  <span>{formatCurrency(Number(goal.target_amount))} · {pct}%</span>
                </div>
                {goal.deadline && (
                  <p className="text-[11px] text-slate-600 mb-3">
                    Deadline {formatDate(goal.deadline)}
                  </p>
                )}

                {addFundId === goal.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={addFundValue}
                      onChange={(e) => setAddFundValue(e.target.value)}
                      className={inputClass}
                      placeholder="Nominal"
                    />
                    <button onClick={() => handleAddFund(goal)} className={primaryBtnClass}>
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddFundId(goal.id)}
                    className={ghostBtnClass}
                  >
                    + Tambah Dana
                  </button>
                )}
              </HudPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
