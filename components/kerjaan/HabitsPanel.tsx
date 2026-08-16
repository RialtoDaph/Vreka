"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Habit, HabitCheck } from "@/lib/types";
import { buildHeatmapCells, computeStreak } from "@/lib/habits";
import { todayKey } from "@/lib/date";
import HudPanel from "@/components/HudPanel";
import { useConfirm } from "@/lib/useConfirm";
import { inputClass, ghostBtnClass, dangerBtnClass, errorBannerClass } from "@/lib/ui";

type HeatmapRange = 7 | 30;

export default function HabitsPanel() {
  const supabase = createClient();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checksByHabit, setChecksByHabit] = useState<Record<string, HabitCheck[]>>({});
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>(7);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  async function load() {
    setLoading(true);
    const [{ data: habitRows }, { data: checkRows }] = await Promise.all([
      supabase.from("habits").select("*").order("created_at", { ascending: true }),
      supabase.from("habit_checks").select("*"),
    ]);
    setHabits(habitRows ?? []);
    const grouped: Record<string, HabitCheck[]> = {};
    for (const c of (checkRows ?? []) as HabitCheck[]) {
      (grouped[c.habit_id] ??= []).push(c);
    }
    setChecksByHabit(grouped);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAdding(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("habits")
      .insert({ user_id: user.id, title })
      .select("*")
      .single();
    if (insertError || !data) {
      setError("Gagal tambah kebiasaan. Coba lagi.");
      setAdding(false);
      return;
    }
    setHabits((prev) => [...prev, data]);
    setNewTitle("");
    setAdding(false);
  }

  async function toggleToday(habit: Habit) {
    setError(null);
    const today = todayKey();
    const previous = checksByHabit;
    const existing = (checksByHabit[habit.id] ?? []).find((c) => c.period === today);
    if (existing) {
      setChecksByHabit((prev) => ({
        ...prev,
        [habit.id]: (prev[habit.id] ?? []).filter((c) => c.id !== existing.id),
      }));
      const { error: deleteError } = await supabase.from("habit_checks").delete().eq("id", existing.id);
      if (deleteError) {
        setChecksByHabit(previous);
        setError("Gagal batal-centang. Coba lagi.");
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: insertError } = await supabase
        .from("habit_checks")
        .insert({ user_id: user.id, habit_id: habit.id, period: today })
        .select("*")
        .single();
      if (insertError || !data) {
        setError("Gagal centang kebiasaan. Coba lagi.");
        return;
      }
      setChecksByHabit((prev) => ({ ...prev, [habit.id]: [...(prev[habit.id] ?? []), data] }));
    }
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setEditValue(habit.title);
  }

  async function saveEdit(habit: Habit) {
    const title = editValue.trim();
    setEditingId(null);
    if (!title || title === habit.title) return;
    setError(null);
    const previous = habits;
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, title } : h)));
    const { error: updateError } = await supabase.from("habits").update({ title }).eq("id", habit.id);
    if (updateError) {
      setHabits(previous);
      setError("Gagal update kebiasaan. Coba lagi.");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus kebiasaan ini? Riwayat streak-nya ikut hilang."))) return;
    setError(null);
    const previous = habits;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    const { error: deleteError } = await supabase.from("habits").delete().eq("id", id);
    if (deleteError) {
      setHabits(previous);
      setError("Gagal hapus kebiasaan. Coba lagi.");
    }
  }

  return (
    <>
      <HudPanel>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-white tracking-wide">Kebiasaan</h2>
          {habits.length > 0 && (
            <div className="flex gap-0.5 border border-line rounded-md p-0.5">
              {([7, 30] as HeatmapRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setHeatmapRange(r)}
                  className={`px-2.5 py-1 font-mono text-[10px] uppercase rounded-[3px] ${
                    heatmapRange === r ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-500"
                  }`}
                >
                  {r} hari
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className={`${errorBannerClass} mb-3`}>{error}</p>}

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Kebiasaan baru — misal Olahraga, Baca buku"
            className={inputClass}
          />
          <button type="submit" disabled={adding} className={ghostBtnClass}>
            + Tambah
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : habits.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada kebiasaan yang dilacak.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {habits.map((habit) => {
              const periods = new Set((checksByHabit[habit.id] ?? []).map((c) => c.period));
              const checkedToday = periods.has(todayKey());
              const streak = computeStreak(periods);
              const cells = buildHeatmapCells(periods, heatmapRange);
              const cols = heatmapRange === 7 ? 7 : 15;
              return (
                <li key={habit.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checkedToday}
                      onChange={() => toggleToday(habit)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-cyan-glow"
                    />
                    {editingId === habit.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(habit)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit(habit);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        className={`${inputClass} text-sm py-1 flex-1`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(habit)}
                        title="Klik buat ganti nama"
                        className="text-sm text-slate-200 flex-1 truncate text-left bg-transparent border-none p-0 cursor-text"
                      >
                        {habit.title}
                      </button>
                    )}
                    {streak > 0 && (
                      <span className="text-xs font-mono text-amber-glow shrink-0">🔥 {streak} hari</span>
                    )}
                    <button onClick={() => handleDelete(habit.id)} className={dangerBtnClass}>
                      Hapus
                    </button>
                  </div>
                  <div
                    className="grid gap-[3px] mt-2 ml-7"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: 220 }}
                  >
                    {cells.map((done, i) => (
                      <span
                        key={i}
                        title={done ? "Selesai" : "Nggak dicentang"}
                        className={`aspect-square rounded-[2px] ${done ? "bg-cyan-glow" : "bg-line"}`}
                        style={{ opacity: done ? 1 : 0.6 }}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </HudPanel>

      {confirmDialog}
    </>
  );
}
