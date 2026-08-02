"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudyNote, StudyResource } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

type QuizQuestion = { question: string; options: string[]; correct_index: number };

export default function PelajaranPage() {
  const supabase = createClient();
  const [items, setItems] = useState<StudyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [progress, setProgress] = useState(0);

  const [quizNoteId, setQuizNoteId] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [sessionTotals, setSessionTotals] = useState<Record<string, number>>({});
  const [activeTimerNoteId, setActiveTimerNoteId] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [resourcesByNote, setResourcesByNote] = useState<Record<string, StudyResource[]>>({});
  const [resourceLabel, setResourceLabel] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: noteRows }, { data: sessionRows }, { data: resourceRows }] = await Promise.all([
      supabase.from("study_notes").select("*").order("updated_at", { ascending: false }),
      supabase.from("study_sessions").select("note_id, minutes"),
      supabase.from("study_resources").select("*").order("created_at", { ascending: true }),
    ]);
    setItems(noteRows ?? []);
    const totals: Record<string, number> = {};
    for (const s of sessionRows ?? []) {
      totals[s.note_id] = (totals[s.note_id] ?? 0) + s.minutes;
    }
    setSessionTotals(totals);
    const grouped: Record<string, StudyResource[]> = {};
    for (const r of (resourceRows ?? []) as StudyResource[]) {
      (grouped[r.note_id] ??= []).push(r);
    }
    setResourcesByNote(grouped);
    setLoading(false);
  }

  useEffect(() => {
    if (!activeTimerNoteId || !timerStart) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimerNoteId, timerStart]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error: saveError } = await supabase.from("study_notes").insert({
      user_id: user.id,
      title,
      category: category || "Umum",
      content: content || null,
      progress,
    });

    if (saveError) {
      setError("Gagal simpan topik. Coba lagi.");
      setSaving(false);
      return;
    }

    setTitle("");
    setCategory("");
    setContent("");
    setProgress(0);
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function updateProgress(note: StudyNote, value: number) {
    setError(null);
    const previous = items;
    setItems((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, progress: value } : n))
    );
    const { error: updateError } = await supabase
      .from("study_notes")
      .update({ progress: value, updated_at: new Date().toISOString() })
      .eq("id", note.id);
    if (updateError) {
      setItems(previous);
      setError("Gagal update progress. Coba lagi.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Yakin mau hapus topik ini? Catatan, resource, dan riwayat sesinya ikut hilang.")) return;
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error: deleteError } = await supabase.from("study_notes").delete().eq("id", id);
    if (deleteError) {
      setItems(previous);
      setError("Gagal hapus topik. Coba lagi.");
    }
  }

  function startTimer(noteId: string) {
    setActiveTimerNoteId(noteId);
    setTimerStart(Date.now());
    setElapsedSeconds(0);
  }

  async function stopTimer(note: StudyNote) {
    // Klik start lalu langsung stop (< 10 detik) dianggap nggak sengaja,
    // jangan dicatet sebagai sesi belajar.
    if (elapsedSeconds >= 10) {
      const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: insertError } = await supabase
          .from("study_sessions")
          .insert({ user_id: user.id, note_id: note.id, minutes });
        if (insertError) {
          setError("Sesi belajar gagal kesimpen. Coba lagi.");
        } else {
          setSessionTotals((prev) => ({ ...prev, [note.id]: (prev[note.id] ?? 0) + minutes }));
        }
      }
    }
    setActiveTimerNoteId(null);
    setTimerStart(null);
    setElapsedSeconds(0);
  }

  async function handleAddResource(noteId: string) {
    const label = resourceLabel.trim();
    const url = resourceUrl.trim();
    if (!label || !url) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: insertError } = await supabase
      .from("study_resources")
      .insert({ user_id: user.id, note_id: noteId, label, url })
      .select("*")
      .single();
    if (insertError || !data) {
      setError("Gagal tambah resource. Coba lagi.");
      return;
    }
    setResourcesByNote((prev) => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), data] }));
    setResourceLabel("");
    setResourceUrl("");
  }

  async function deleteResource(resource: StudyResource) {
    setError(null);
    const previous = resourcesByNote;
    setResourcesByNote((prev) => ({
      ...prev,
      [resource.note_id]: (prev[resource.note_id] ?? []).filter((r) => r.id !== resource.id),
    }));
    const { error: deleteError } = await supabase.from("study_resources").delete().eq("id", resource.id);
    if (deleteError) {
      setResourcesByNote(previous);
      setError("Gagal hapus resource. Coba lagi.");
    }
  }

  function closeQuiz() {
    setQuizNoteId(null);
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizError(null);
  }

  async function startQuiz(note: StudyNote) {
    closeQuiz();
    setQuizNoteId(note.id);
    setQuizLoading(true);
    try {
      const res = await fetch("/api/assistant/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuizError(data.error ?? "Gagal bikin kuis.");
        return;
      }
      setQuizQuestions(data.questions);
    } catch {
      setQuizError("Gagal bikin kuis. Coba lagi.");
    } finally {
      setQuizLoading(false);
    }
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

      {error && <p className={errorBannerClass}>{error}</p>}

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

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(expanded ? null : note.id)}
                    className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                  >
                    {expanded ? "Tutup detail ▾" : "Lihat detail ▸"}
                  </button>
                  {note.content && (
                    <button
                      onClick={() => startQuiz(note)}
                      className="text-xs font-mono text-amber-glow/80 hover:text-amber-glow"
                    >
                      🧠 Mode Kuis
                    </button>
                  )}
                  {activeTimerNoteId === note.id ? (
                    <button
                      onClick={() => stopTimer(note)}
                      className="text-xs font-mono text-rose-glow animate-pulse"
                    >
                      ⏱ {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")} — Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => startTimer(note.id)}
                      disabled={!!activeTimerNoteId}
                      className="text-xs font-mono text-slate-500 hover:text-slate-300 disabled:opacity-40"
                    >
                      ⏱ Mulai Sesi
                      {sessionTotals[note.id] ? ` (total ${sessionTotals[note.id]}m)` : ""}
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="mt-2 space-y-3">
                    {note.content && (
                      <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.content}</p>
                    )}

                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                        Resource
                      </p>
                      {(resourcesByNote[note.id] ?? []).length === 0 ? (
                        <p className="text-xs text-slate-600">Belum ada link resource.</p>
                      ) : (
                        <ul className="space-y-1 mb-2">
                          {(resourcesByNote[note.id] ?? []).map((r) => (
                            <li key={r.id} className="flex items-center gap-2">
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-cyan-glow/80 hover:text-cyan-glow truncate flex-1"
                              >
                                🔗 {r.label}
                              </a>
                              <button
                                onClick={() => deleteResource(r)}
                                className="text-[10px] text-rose-glow/70 hover:text-rose-glow font-mono shrink-0"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={resourceLabel}
                          onChange={(e) => setResourceLabel(e.target.value)}
                          placeholder="Label"
                          className={`${inputClass} text-xs py-1.5 w-1/3`}
                        />
                        <input
                          type="url"
                          value={resourceUrl}
                          onChange={(e) => setResourceUrl(e.target.value)}
                          placeholder="https://..."
                          className={`${inputClass} text-xs py-1.5`}
                        />
                        <button
                          onClick={() => handleAddResource(note.id)}
                          className={ghostBtnClass}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {quizNoteId === note.id && (
                  <QuizPanel
                    loading={quizLoading}
                    error={quizError}
                    questions={quizQuestions}
                    answers={quizAnswers}
                    submitted={quizSubmitted}
                    currentProgress={note.progress}
                    onAnswer={(qIndex, optIndex) =>
                      setQuizAnswers((prev) => ({ ...prev, [qIndex]: optIndex }))
                    }
                    onSubmit={() => setQuizSubmitted(true)}
                    onApplyScore={(score) => {
                      updateProgress(note, score);
                      closeQuiz();
                    }}
                    onClose={closeQuiz}
                  />
                )}
              </HudPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuizPanel({
  loading,
  error,
  questions,
  answers,
  submitted,
  currentProgress,
  onAnswer,
  onSubmit,
  onApplyScore,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  questions: QuizQuestion[];
  answers: Record<number, number>;
  submitted: boolean;
  currentProgress: number;
  onAnswer: (qIndex: number, optIndex: number) => void;
  onSubmit: () => void;
  onApplyScore: (score: number) => void;
  onClose: () => void;
}) {
  const answeredAll = questions.length > 0 && questions.every((_, i) => answers[i] !== undefined);
  const score =
    questions.length > 0
      ? Math.round(
          (questions.filter((q, i) => answers[i] === q.correct_index).length / questions.length) * 100
        )
      : 0;

  return (
    <div className="mt-3 pt-3 border-t border-line/60 space-y-3">
      {loading ? (
        <p className="text-xs text-slate-500 font-mono">Bikin soal...</p>
      ) : error ? (
        <p className="text-xs text-rose-glow">{error}</p>
      ) : (
        <>
          {questions.map((q, qIndex) => (
            <div key={qIndex}>
              <p className="text-xs text-slate-200 mb-1.5">
                {qIndex + 1}. {q.question}
              </p>
              <div className="space-y-1">
                {q.options.map((opt, optIndex) => {
                  const selected = answers[qIndex] === optIndex;
                  const isCorrect = optIndex === q.correct_index;
                  const showResult = submitted;
                  return (
                    <button
                      key={optIndex}
                      type="button"
                      disabled={submitted}
                      onClick={() => onAnswer(qIndex, optIndex)}
                      className={`w-full text-left text-xs px-2.5 py-1.5 rounded-sm border transition-colors ${
                        showResult && isCorrect
                          ? "border-mint-glow/50 bg-mint-glow/10 text-mint-glow"
                          : showResult && selected && !isCorrect
                            ? "border-rose-glow/50 bg-rose-glow/10 text-rose-glow"
                            : selected
                              ? "border-cyan-glow/50 bg-cyan-glow/10 text-cyan-glow"
                              : "border-line text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {!submitted ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!answeredAll}
              className={primaryBtnClass}
            >
              Selesai
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono text-cyan-glow">Skor: {score}%</span>
              {score > currentProgress && (
                <button onClick={() => onApplyScore(score)} className={primaryBtnClass}>
                  Update progress ke {score}%
                </button>
              )}
              <button onClick={onClose} className={ghostBtnClass}>
                Tutup
              </button>
            </div>
          )}
        </>
      )}
      {!loading && !error && (
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-300 font-mono">
          Batal kuis
        </button>
      )}
    </div>
  );
}
