"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudyNote } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, dangerBtnClass } from "@/lib/ui";

export default function PelajaranPage() {
  const supabase = createClient();
  const [items, setItems] = useState<StudyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [progress, setProgress] = useState(0);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("study_notes")
      .select("*")
      .order("updated_at", { ascending: false });
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

    await supabase.from("study_notes").insert({
      user_id: user.id,
      title,
      category: category || "Umum",
      content: content || null,
      progress,
    });

    setTitle("");
    setCategory("");
    setContent("");
    setProgress(0);
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function updateProgress(note: StudyNote, value: number) {
    setItems((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, progress: value } : n))
    );
    await supabase
      .from("study_notes")
      .update({ progress: value, updated_at: new Date().toISOString() })
      .eq("id", note.id);
  }

  async function handleDelete(id: string) {
    await supabase.from("study_notes").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Modul 03
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Pelajaran
          </h1>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Topik Baru"}
        </button>
      </header>

      {showForm && (
        <HudPanel>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Judul Topik</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder="Bahasa Jerman A2"
                />
              </div>
              <div>
                <label className={labelClass}>Kategori (opsional)</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                  placeholder="Bahasa"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Catatan</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={`${inputClass} min-h-24`}
                placeholder="Ringkasan, link materi, progress belajar..."
              />
            </div>
            <div>
              <label className={labelClass}>Progress awal: {progress}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : "Simpan Topik"}
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
          <p className="text-sm text-slate-500">Belum ada topik belajar.</p>
        </HudPanel>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((note) => {
            const expanded = expandedId === note.id;
            return (
              <HudPanel key={note.id}>
                <div className="flex justify-between items-start mb-2 gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {note.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-600">{note.category}</p>
                  </div>
                  <button onClick={() => handleDelete(note.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </div>

                <div className="h-1.5 bg-panel2 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-cyan-glow rounded-full transition-all"
                    style={{ width: `${note.progress}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={note.progress}
                  onChange={(e) => updateProgress(note, Number(e.target.value))}
                  className="w-full accent-cyan-500 mb-3"
                  aria-label={`Progress ${note.title}`}
                />

                {note.content && (
                  <>
                    <button
                      onClick={() => setExpandedId(expanded ? null : note.id)}
                      className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                    >
                      {expanded ? "Tutup catatan ▾" : "Lihat catatan ▸"}
                    </button>
                    {expanded && (
                      <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">
                        {note.content}
                      </p>
                    )}
                  </>
                )}
              </HudPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
