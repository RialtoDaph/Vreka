"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SavingsGoal } from "@/lib/types";
import { formatCurrency, formatDate, formatGrams, parseAmount } from "@/lib/format";
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

export default function SavingsTab() {
  const supabase = createClient();
  const [items, setItems] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFundId, setAddFundId] = useState<string | null>(null);
  const [addFundValue, setAddFundValue] = useState("");
  const [addFundGrams, setAddFundGrams] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");
  const [assetType, setAssetType] = useState<"cash" | "gold">("cash");
  const [totalGrams, setTotalGrams] = useState("");

  function resetForm() {
    setEditingId(null);
    setName("");
    setTarget("");
    setCurrent("");
    setDeadline("");
    setAssetType("cash");
    setTotalGrams("");
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
    setAssetType(goal.asset_type);
    setTotalGrams(goal.total_grams ? String(goal.total_grams).replace(".", ",") : "");
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
    if (!name || !target || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setError("Nama atau target nggak valid. Cek lagi formatnya (misal 10.000.000).");
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

    const parsedGrams = totalGrams ? parseAmount(totalGrams) : 0;
    const payload = {
      name,
      target_amount: parsedTarget,
      current_amount: Number.isFinite(parsedCurrent) ? parsedCurrent : 0,
      deadline: deadline || null,
      asset_type: assetType,
      total_grams: assetType === "gold" && Number.isFinite(parsedGrams) ? parsedGrams : 0,
    };

    const { error: saveError } = editingId
      ? await supabase.from("savings_goals").update(payload).eq("id", editingId)
      : await supabase.from("savings_goals").insert({ user_id: user.id, ...payload });

    if (saveError) {
      setError("Gagal simpan target tabungan. Coba lagi.");
      setSaving(false);
      return;
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleAddFund(goal: SavingsGoal) {
    const add = parseAmount(addFundValue);
    if (!Number.isFinite(add) || !add) {
      setError("Nominal dana nggak valid.");
      return;
    }
    const patch: { current_amount: number; total_grams?: number } = {
      current_amount: Number(goal.current_amount) + add,
    };
    if (goal.asset_type === "gold") {
      const grams = parseAmount(addFundGrams);
      if (!Number.isFinite(grams) || grams <= 0) {
        setError("Berat emas (gram) nggak valid.");
        return;
      }
      patch.total_grams = Number(goal.total_grams) + grams;
    }
    setError(null);
    const { error: updateError } = await supabase
      .from("savings_goals")
      .update(patch)
      .eq("id", goal.id);
    if (updateError) {
      setError(goal.asset_type === "gold" ? "Gagal catat pembelian emas. Coba lagi." : "Gagal tambah dana. Coba lagi.");
      return;
    }
    setAddFundId(null);
    setAddFundValue("");
    setAddFundGrams("");
    load();
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus target tabungan ini?"))) return;
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error: deleteError } = await supabase.from("savings_goals").delete().eq("id", id);
    if (deleteError) {
      setItems(previous);
      setError("Gagal hapus. Coba lagi.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={toggleForm} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Target Baru"}
        </button>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="savings-name" className={labelClass}>Nama Target</label>
                <input
                  id="savings-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Dana Darurat"
                />
              </div>
              <div>
                <label htmlFor="savings-asset-type" className={labelClass}>Jenis Target</label>
                <select
                  id="savings-asset-type"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as "cash" | "gold")}
                  className={inputClass}
                >
                  <option value="cash">Tabungan Biasa</option>
                  <option value="gold">Emas Batangan</option>
                </select>
              </div>
              <div>
                <label htmlFor="savings-target" className={labelClass}>Target (€)</label>
                <input
                  id="savings-target"
                  type="text"
                  inputMode="decimal"
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={inputClass}
                  placeholder="5.000,00"
                />
              </div>
              <div>
                <label htmlFor="savings-current" className={labelClass}>Sudah Terkumpul (opsional)</label>
                <input
                  id="savings-current"
                  type="text"
                  inputMode="decimal"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
              {assetType === "gold" && (
                <div>
                  <label htmlFor="savings-grams" className={labelClass}>Sudah Punya (gram, opsional)</label>
                  <input
                    id="savings-grams"
                    type="text"
                    inputMode="decimal"
                    value={totalGrams}
                    onChange={(e) => setTotalGrams(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              )}
              <div>
                <label htmlFor="savings-deadline" className={labelClass}>Deadline (opsional)</label>
                <input
                  id="savings-deadline"
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
          <p className="text-sm text-fg-subtle">Memuat...</p>
        </HudPanel>
      ) : items.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-fg-subtle">Belum ada target tabungan.</p>
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
                  <h3 className="text-sm font-semibold text-fg">{goal.name}</h3>
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
                <div className="flex justify-between text-xs font-mono text-fg-subtle mb-3">
                  <span>{formatCurrency(Number(goal.current_amount))}</span>
                  <span>{formatCurrency(Number(goal.target_amount))} · {pct}%</span>
                </div>
                {goal.asset_type === "gold" && Number(goal.total_grams) > 0 && (
                  <p className="text-[11px] text-fg-subtle mb-3">
                    {formatGrams(Number(goal.total_grams))} · rata-rata{" "}
                    {formatCurrency(Number(goal.current_amount) / Number(goal.total_grams))}/gram
                  </p>
                )}
                {goal.deadline && (
                  <p className="text-[11px] text-fg-subtle mb-3">
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
                      placeholder={goal.asset_type === "gold" ? "Harga beli (€)" : "Nominal"}
                      aria-label={
                        goal.asset_type === "gold"
                          ? `Harga beli emas untuk ${goal.name}`
                          : `Tambah dana ke ${goal.name}`
                      }
                    />
                    {goal.asset_type === "gold" && (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={addFundGrams}
                        onChange={(e) => setAddFundGrams(e.target.value)}
                        className={inputClass}
                        placeholder="Gram"
                        aria-label={`Berat emas untuk ${goal.name}`}
                      />
                    )}
                    <button onClick={() => handleAddFund(goal)} className={primaryBtnClass}>
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddFundId(goal.id)}
                    className={ghostBtnClass}
                  >
                    {goal.asset_type === "gold" ? "+ Beli Emas" : "+ Tambah Dana"}
                  </button>
                )}
              </HudPanel>
            );
          })}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
