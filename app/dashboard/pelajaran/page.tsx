"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudyNote } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import { inputClass, labelClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

type QuizQuestion = { question: string; options: string[]; correct_index: number };

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

  const [quizNoteId, setQuizNoteId] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

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
                  {note.content && (
                    <button
                      onClick={() => setExpandedId(expanded ? null : note.id)}
                      className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                    >
                      {expanded ? "Tutup catatan ▾" : "Lihat catatan ▸"}
                    </button>
                  )}
                  {note.content && (
                    <button
                      onClick={() => startQuiz(note)}
                      className="text-xs font-mono text-amber-glow/80 hover:text-amber-glow"
                    >
                      🧠 Mode Kuis
                    </button>
                  )}
                </div>

                {expanded && note.content && (
                  <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">
                    {note.content}
                  </p>
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
