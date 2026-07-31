"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Task, TaskPriority } from "@/lib/types";
import { formatDateTime, daysUntil } from "@/lib/format";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, dangerBtnClass } from "@/lib/ui";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "text-slate-400 border-line",
  medium: "text-amber-glow border-amber-glow/40",
  high: "text-rose-glow border-rose-glow/40",
};

export default function KerjaanPage() {
  const supabase = createClient();
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("status", { ascending: true })
      .order("deadline", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("tasks").insert({
      user_id: user.id,
      title,
      description: description || null,
      deadline: deadline || null,
      priority,
      status: "todo",
    });

    setTitle("");
    setDescription("");
    setDeadline("");
    setPriority("medium");
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleStatus(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const todoItems = items.filter((i) => i.status === "todo");
  const doneItems = items.filter((i) => i.status === "done");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Modul 02
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Kerjaan
          </h1>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ To-do Baru"}
        </button>
      </header>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelClass}>Judul</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                placeholder="Kirim laporan mingguan"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Deadline (opsional)</label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Prioritas</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className={inputClass}
                >
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Catatan (opsional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </form>
        </HudPanel>
      )}

      <HudPanel>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : todoItems.length === 0 ? (
          <p className="text-sm text-slate-500">Gak ada to-do aktif. Santai dulu.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {todoItems.map((task) => {
              const d = daysUntil(task.deadline);
              const urgent = d !== null && d <= 2;
              return (
                <li
                  key={task.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      onClick={() => toggleStatus(task)}
                      aria-label="Tandai selesai"
                      className="mt-0.5 w-4 h-4 shrink-0 rounded-sm border border-line hover:border-cyan-glow transition-colors"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-slate-500 truncate">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[10px] font-mono border rounded-sm px-1.5 py-0.5 ${PRIORITY_TONE[task.priority]}`}
                        >
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                        {task.deadline && (
                          <span
                            className={`text-[10px] font-mono ${urgent ? "text-rose-glow" : "text-slate-500"}`}
                          >
                            {formatDateTime(task.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(task.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </HudPanel>

      {doneItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((s) => !s)}
            className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300 mb-2"
          >
            {showDone ? "▾" : "▸"} Selesai ({doneItems.length})
          </button>
          {showDone && (
            <HudPanel>
              <ul className="divide-y divide-line/60">
                {doneItems.map((task) => (
                  <li
                    key={task.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => toggleStatus(task)}
                        aria-label="Buka lagi"
                        className="w-4 h-4 shrink-0 rounded-sm bg-cyan-glow/20 border border-cyan-glow/50"
                      />
                      <span className="text-sm text-slate-500 line-through truncate">
                        {task.title}
                      </span>
                    </div>
                    <button onClick={() => handleDelete(task.id)} className={dangerBtnClass}>
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            </HudPanel>
          )}
        </div>
      )}
    </div>
  );
}
