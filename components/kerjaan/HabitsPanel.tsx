"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Habit, HabitCheck } from "@/lib/types";
import { computeStreak } from "@/lib/habits";
import { todayKey } from "@/lib/date";
import HudPanel from "@/components/HudPanel";
import { inputClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

export default function HabitsPanel() {
  const supabase = createClient();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checksByHabit, setChecksByHabit] = useState<Record<string, HabitCheck[]>>({});
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAdding(false);
      return;
    }
    const { data } = await supabase
      .from("habits")
      .insert({ user_id: user.id, title })
      .select("*")
      .single();
    if (data) setHabits((prev) => [...prev, data]);
    setNewTitle("");
    setAdding(false);
  }

  async function toggleToday(habit: Habit) {
    const today = todayKey();
    const existing = (checksByHabit[habit.id] ?? []).find((c) => c.period === today);
    if (existing) {
      setChecksByHabit((prev) => ({
        ...prev,
        [habit.id]: (prev[habit.id] ?? []).filter((c) => c.id !== existing.id),
      }));
      await supabase.from("habit_checks").delete().eq("id", existing.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("habit_checks")
        .insert({ user_id: user.id, habit_id: habit.id, period: today })
        .select("*")
        .single();
      if (data) {
        setChecksByHabit((prev) => ({ ...prev, [habit.id]: [...(prev[habit.id] ?? []), data] }));
      }
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("habits").delete().eq("id", id);
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <HudPanel>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-white tracking-wide">Kebiasaan</h2>
      </div>

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
            return (
              <li key={habit.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={checkedToday}
                  onChange={() => toggleToday(habit)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-cyan-glow"
                />
                <span className="text-sm text-slate-200 flex-1 truncate">{habit.title}</span>
                {streak > 0 && (
                  <span className="text-xs font-mono text-amber-glow shrink-0">🔥 {streak} hari</span>
                )}
                <button onClick={() => handleDelete(habit.id)} className={dangerBtnClass}>
                  Hapus
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HudPanel>
  );
}
