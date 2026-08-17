"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LifeMilestone, MilestoneCategory } from "@/lib/types";
import {
  MILESTONE_CATEGORY_META,
  deriveHabitStreakMilestones,
  deriveStudyMilestones,
  splitByStartDate,
  type LifeTimelineEntry,
  type TimelineCategory,
} from "@/lib/lifeTimeline";
import { formatDate } from "@/lib/format";
import { localDateKey } from "@/lib/date";
import { Rocket } from "lucide-react";
import HudPanel from "@/components/HudPanel";
import { errorBannerClass, ghostBtnClass, inputClass, labelClass, primaryBtnClass } from "@/lib/ui";

const FILTERS: { id: "all" | TimelineCategory; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "pendidikan", label: "Pendidikan" },
  { id: "karier", label: "Karier" },
  { id: "keluarga", label: "Keluarga" },
  { id: "otomatis", label: "Otomatis" },
];

const FORM_CATEGORIES: MilestoneCategory[] = ["pendidikan", "karier", "keluarga", "lainnya"];

export default function TimelineKehidupanPage() {
  const supabase = createClient();

  const [milestones, setMilestones] = useState<LifeMilestone[]>([]);
  const [autoEntries, setAutoEntries] = useState<LifeTimelineEntry[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TimelineCategory>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => localDateKey(new Date()));
  const [endedOn, setEndedOn] = useState("");
  const [category, setCategory] = useState<MilestoneCategory>("pendidikan");
  const [description, setDescription] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setOccurredOn(localDateKey(new Date()));
    setEndedOn("");
    setCategory("pendidikan");
    setDescription("");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(entry: LifeTimelineEntry) {
    setEditingId(entry.id);
    setTitle(entry.title);
    setOccurredOn(entry.occurred_on);
    setEndedOn(entry.ended_on ?? "");
    setCategory(entry.category as MilestoneCategory);
    setDescription(entry.description ?? "");
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setStartDate(user.created_at.slice(0, 10));

    const [{ data: milestoneRows }, { data: studyRows }, { data: habitRows }, { data: checkRows }] = await Promise.all([
      supabase.from("life_milestones").select("*").order("occurred_on", { ascending: true }),
      supabase.from("study_notes").select("id, title, progress, updated_at"),
      supabase.from("habits").select("id, title"),
      supabase.from("habit_checks").select("habit_id, period"),
    ]);
    setMilestones(milestoneRows ?? []);

    const study = deriveStudyMilestones(studyRows ?? []);
    const checksByHabit = new Map<string, string[]>();
    for (const c of checkRows ?? []) {
      const list = checksByHabit.get(c.habit_id) ?? [];
      list.push(c.period);
      checksByHabit.set(c.habit_id, list);
    }
    const streaks = (habitRows ?? []).flatMap((h) =>
      deriveHabitStreakMilestones(h.id, h.title, checksByHabit.get(h.id) ?? [])
    );
    setAutoEntries([...study, ...streaks]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    if (endedOn && endedOn < occurredOn) {
      setError("Tanggal selesai nggak boleh sebelum tanggal mulai.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      return;
    }
    const payload = {
      title: title.trim(),
      occurred_on: occurredOn,
      ended_on: endedOn || null,
      category,
      description: description.trim() || null,
    };

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from("life_milestones")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single();
      if (updateError || !data) {
        setError("Gagal update milestone. Coba lagi.");
        return;
      }
      setMilestones((prev) =>
        prev.map((m) => (m.id === editingId ? data : m)).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
      );
    } else {
      const { data, error: insertError } = await supabase
        .from("life_milestones")
        .insert({ user_id: user.id, ...payload })
        .select("*")
        .single();
      if (insertError || !data) {
        setError("Gagal nyimpen milestone. Coba lagi.");
        return;
      }
      setMilestones((prev) => [...prev, data].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)));
    }

    resetForm();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const previous = milestones;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    if (id === editingId) {
      resetForm();
      setShowForm(false);
    }
    const { error: deleteError } = await supabase.from("life_milestones").delete().eq("id", id);
    if (deleteError) {
      setMilestones(previous);
      setError("Gagal hapus milestone. Coba lagi.");
    }
  }

  const allEntries: LifeTimelineEntry[] = useMemo(() => {
    const manual: LifeTimelineEntry[] = milestones.map((m) => ({
      id: m.id,
      title: m.title,
      occurred_on: m.occurred_on,
      ended_on: m.ended_on,
      category: m.category,
      description: m.description,
      auto: false,
    }));
    return [...manual, ...autoEntries];
  }, [milestones, autoEntries]);

  const filtered = filter === "all" ? allEntries : allEntries.filter((e) => e.category === filter);
  const { before, since } = splitByStartDate(filtered, startDate ?? localDateKey(new Date()));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">Modul 07</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Timeline Kehidupan</h1>
        </div>
        <button onClick={toggleForm} className={ghostBtnClass}>
          {showForm ? "Batal" : "+ Milestone"}
        </button>
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.id
                ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow"
                : "border-line text-slate-400 hover:text-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="milestone-title" className={labelClass}>
                Judul
              </label>
              <input
                id="milestone-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Wisuda, kerja baru, dll"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="milestone-start" className={labelClass}>
                  Tanggal mulai
                </label>
                <input
                  id="milestone-start"
                  type="date"
                  required
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="milestone-end" className={labelClass}>
                  Tanggal selesai (opsional)
                </label>
                <input
                  id="milestone-end"
                  type="date"
                  value={endedOn}
                  onChange={(e) => setEndedOn(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
              <div>
                <label htmlFor="milestone-category" className={labelClass}>
                  Kategori
                </label>
                <select
                  id="milestone-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MilestoneCategory)}
                  className={inputClass}
                >
                  {FORM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {MILESTONE_CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="milestone-description" className={labelClass}>
                  Catatan (opsional)
                </label>
                <input
                  id="milestone-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail singkat"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" className={primaryBtnClass}>
              {editingId ? "Update Milestone" : "Simpan"}
            </button>
          </form>
        </HudPanel>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-400">Memuat timeline...</p>
        </HudPanel>
      ) : filtered.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-400">Belum ada milestone. Tambah yang pertama lewat &quot;+ Milestone&quot;.</p>
        </HudPanel>
      ) : (
        <div>
          {before.length > 0 && (
            <div className="ml-[13px] border-l-2 border-line pl-6 space-y-4 mb-6">
              {before.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} onEdit={startEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-gradient-to-r from-transparent to-cyan-glow/40" />
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-cyan-glow whitespace-nowrap flex items-center gap-1.5">
              <Rocket aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
              Mulai pakai Vreka{startDate ? ` · ${formatDate(startDate)}` : ""}
            </span>
            <span className="flex-1 h-px bg-gradient-to-l from-transparent to-cyan-glow/40" />
          </div>

          {since.length > 0 ? (
            <div className="ml-[13px] border-l-2 border-line pl-6 space-y-4">
              {since.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} onEdit={startEdit} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 ml-[13px] pl-6">
              Belum ada momen sejak mulai pakai Vreka.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: LifeTimelineEntry;
  onEdit: (entry: LifeTimelineEntry) => void;
  onDelete: (id: string) => void;
}) {
  const meta = MILESTONE_CATEGORY_META[entry.category];
  const dateLabel = entry.ended_on
    ? `${formatDate(entry.occurred_on)} – ${formatDate(entry.ended_on)}`
    : formatDate(entry.occurred_on);
  return (
    <div className="relative">
      <span
        className="absolute -left-[29px] top-1 w-2.5 h-2.5 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}80` }}
        aria-hidden="true"
      />
      <p className="font-mono text-[10px] text-slate-400 mb-0.5">
        {dateLabel} · <span style={{ color: meta.color }}>{meta.label}</span>
      </p>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-slate-200">{entry.title}</p>
          {entry.description && <p className="text-xs text-slate-400 mt-0.5">{entry.description}</p>}
        </div>
        {!entry.auto && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onEdit(entry)}
              aria-label={`Edit milestone ${entry.title}`}
              className="text-slate-400 hover:text-cyan-glow text-xs font-mono leading-none"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              aria-label={`Hapus milestone ${entry.title}`}
              className="text-slate-400 hover:text-rose-glow text-sm leading-none"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
