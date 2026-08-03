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

  const [title, setTitle] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => localDateKey(new Date()));
  const [category, setCategory] = useState<MilestoneCategory>("pendidikan");
  const [description, setDescription] = useState("");

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: insertError } = await supabase
      .from("life_milestones")
      .insert({
        user_id: user.id,
        title: title.trim(),
        occurred_on: occurredOn,
        category,
        description: description.trim() || null,
      })
      .select("*")
      .single();
    if (insertError || !data) {
      setError("Gagal nyimpen milestone. Coba lagi.");
      return;
    }
    setMilestones((prev) => [...prev, data].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)));
    setTitle("");
    setDescription("");
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const previous = milestones;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
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
        <button onClick={() => setShowForm((s) => !s)} className={ghostBtnClass}>
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
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
              <div>
                <label className={labelClass}>Judul</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Wisuda, kerja baru, dll"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tanggal</label>
                <input
                  type="date"
                  required
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
              <div>
                <label className={labelClass}>Kategori</label>
                <select
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
                <label className={labelClass}>Catatan (opsional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail singkat"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" className={primaryBtnClass}>
              Simpan
            </button>
          </form>
        </HudPanel>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Memuat timeline...</p>
        </HudPanel>
      ) : filtered.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Belum ada milestone. Tambah yang pertama lewat &quot;+ Milestone&quot;.</p>
        </HudPanel>
      ) : (
        <div>
          {before.length > 0 && (
            <div className="ml-[13px] border-l-2 border-line pl-6 space-y-4 mb-6">
              {before.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-gradient-to-r from-transparent to-cyan-glow/40" />
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-cyan-glow whitespace-nowrap">
              ✦ Mulai pakai Vreka{startDate ? ` · ${formatDate(startDate)}` : ""}
            </span>
            <span className="flex-1 h-px bg-gradient-to-l from-transparent to-cyan-glow/40" />
          </div>

          {since.length > 0 ? (
            <div className="ml-[13px] border-l-2 border-line pl-6 space-y-4">
              {since.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 ml-[13px] pl-6">
              Belum ada momen sejak mulai pakai Vreka.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ entry, onDelete }: { entry: LifeTimelineEntry; onDelete: (id: string) => void }) {
  const meta = MILESTONE_CATEGORY_META[entry.category];
  return (
    <div className="relative">
      <span
        className="absolute -left-[29px] top-1 w-2.5 h-2.5 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}80` }}
        aria-hidden="true"
      />
      <p className="font-mono text-[10px] text-slate-500 mb-0.5">
        {formatDate(entry.occurred_on)} · <span style={{ color: meta.color }}>{meta.label}</span>
      </p>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-slate-200">{entry.title}</p>
          {entry.description && <p className="text-xs text-slate-500 mt-0.5">{entry.description}</p>}
        </div>
        {!entry.auto && (
          <button
            onClick={() => onDelete(entry.id)}
            aria-label={`Hapus milestone ${entry.title}`}
            className="text-slate-600 hover:text-rose-glow text-sm leading-none shrink-0"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
