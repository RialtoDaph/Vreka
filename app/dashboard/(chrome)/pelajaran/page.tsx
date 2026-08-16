"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Flashcard, StudyNote, StudyResource } from "@/lib/types";
import { nextReview, type ReviewRating } from "@/lib/spacedRepetition";
import { computeStreak } from "@/lib/studyStreak";
import { formatDate } from "@/lib/format";
import { useConfirm } from "@/lib/useConfirm";
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

// Only one study timer can run at a time (see the `disabled` guard on the
// "Mulai Sesi" button below), so a single key is enough -- no need to
// namespace it per note.
const TIMER_STORAGE_KEY = "vreka-pelajaran-timer";

function clearSavedTimer() {
  try {
    window.localStorage.removeItem(TIMER_STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled -- the timer just won't survive
    // a refresh, which is the pre-existing behavior anyway.
  }
}

const POMODORO_STORAGE_KEY = "vreka-pelajaran-pomodoro";
const POMODORO_WORK_SECONDS = 25 * 60;
const POMODORO_BREAK_SECONDS = 5 * 60;

type PomodoroPhase = "work" | "break";
type PomodoroSaved = { phase: PomodoroPhase; endAt: number };

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Standalone 25/5 Pomodoro widget, independent of any single note (unlike
// the per-note stopwatch below) -- pinned near the top of the page so it's
// the first thing visible, not buried inside a note card.
function PomodoroTimer() {
  const [phase, setPhase] = useState<PomodoroPhase>("work");
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(POMODORO_WORK_SECONDS);
  const [cycles, setCycles] = useState(0);

  // Restore a running timer across refresh, same endAt-timestamp approach
  // as the per-note session timer uses.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POMODORO_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PomodoroSaved>;
      if (!saved.endAt || (saved.phase !== "work" && saved.phase !== "break")) return;
      const left = Math.round((saved.endAt - Date.now()) / 1000);
      if (left <= 0) {
        window.localStorage.removeItem(POMODORO_STORAGE_KEY);
        return;
      }
      setPhase(saved.phase);
      setEndAt(saved.endAt);
      setRemaining(left);
      setRunning(true);
    } catch {
      // Corrupted entry -- ignore rather than crashing the page.
    }
  }, []);

  useEffect(() => {
    if (!running || !endAt) return;
    // Fake-timer test runs (and real backgrounded-tab throttling) can fire
    // several queued 1s ticks in a burst before React re-renders and this
    // effect's cleanup clears the interval -- without this guard each of
    // those stale ticks re-runs the completion branch, over-counting cycles.
    let completed = false;
    const interval = setInterval(() => {
      if (completed) return;
      const left = Math.round((endAt - Date.now()) / 1000);
      if (left > 0) {
        setRemaining(left);
        return;
      }
      completed = true;
      clearInterval(interval);
      const next: PomodoroPhase = phase === "work" ? "break" : "work";
      setRunning(false);
      setEndAt(null);
      setPhase(next);
      setRemaining(next === "work" ? POMODORO_WORK_SECONDS : POMODORO_BREAK_SECONDS);
      if (phase === "work") setCycles((c) => c + 1);
      try {
        window.localStorage.removeItem(POMODORO_STORAGE_KEY);
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [running, endAt, phase]);

  function start() {
    const target = Date.now() + remaining * 1000;
    setEndAt(target);
    setRunning(true);
    try {
      window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify({ phase, endAt: target }));
    } catch {
      // ignore
    }
  }

  function pause() {
    setRunning(false);
    setEndAt(null);
    try {
      window.localStorage.removeItem(POMODORO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function reset() {
    setRunning(false);
    setEndAt(null);
    setPhase("work");
    setRemaining(POMODORO_WORK_SECONDS);
    try {
      window.localStorage.removeItem(POMODORO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const isBreak = phase === "break";
  const fullDuration = isBreak ? POMODORO_BREAK_SECONDS : POMODORO_WORK_SECONDS;

  return (
    <HudPanel glow className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1">
          {isBreak ? "⏸ Waktunya istirahat" : "🍅 Fokus Pomodoro"}
          {cycles > 0 ? ` · ${cycles} sesi selesai` : ""}
        </p>
        <p className={`font-mono text-3xl font-bold ${isBreak ? "text-mint-glow" : "text-cyan-glow"}`}>
          {formatClock(remaining)}
        </p>
      </div>
      <div className="flex gap-2">
        {running ? (
          <button onClick={pause} className={ghostBtnClass}>
            Jeda
          </button>
        ) : (
          <button onClick={start} className={primaryBtnClass}>
            {remaining === fullDuration ? "Mulai" : "Lanjut"}
          </button>
        )}
        <button onClick={reset} className={ghostBtnClass}>
          Reset
        </button>
      </div>
    </HudPanel>
  );
}

export default function PelajaranPage() {
  const supabase = createClient();
  const [items, setItems] = useState<StudyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [progress, setProgress] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");

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

  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [flashcardsByNote, setFlashcardsByNote] = useState<Record<string, Flashcard[]>>({});
  const [flashcardNoteId, setFlashcardNoteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: noteRows }, { data: sessionRows }, { data: resourceRows }, { data: flashcardRows }] =
      await Promise.all([
        supabase.from("study_notes").select("*").order("updated_at", { ascending: false }),
        supabase.from("study_sessions").select("note_id, minutes, created_at"),
        supabase.from("study_resources").select("*").order("created_at", { ascending: true }),
        supabase.from("flashcards").select("*").order("due_at", { ascending: true }),
      ]);
    setItems(noteRows ?? []);
    const totals: Record<string, number> = {};
    const dates: string[] = [];
    for (const s of sessionRows ?? []) {
      totals[s.note_id] = (totals[s.note_id] ?? 0) + s.minutes;
      dates.push(s.created_at);
    }
    setSessionTotals(totals);
    setSessionDates(dates);
    const grouped: Record<string, StudyResource[]> = {};
    for (const r of (resourceRows ?? []) as StudyResource[]) {
      (grouped[r.note_id] ??= []).push(r);
    }
    setResourcesByNote(grouped);
    const cardsGrouped: Record<string, Flashcard[]> = {};
    for (const c of (flashcardRows ?? []) as Flashcard[]) {
      (cardsGrouped[c.note_id] ??= []).push(c);
    }
    setFlashcardsByNote(cardsGrouped);
    setLoading(false);
  }

  useEffect(() => {
    if (!activeTimerNoteId || !timerStart) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimerNoteId, timerStart]);

  // Restores a timer that was still running when the tab got closed or
  // refreshed, instead of just silently losing the in-progress session.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { noteId?: string; startedAt?: number };
      if (!saved.noteId || !saved.startedAt) return;
      setActiveTimerNoteId(saved.noteId);
      setTimerStart(saved.startedAt);
      setElapsedSeconds(Math.floor((Date.now() - saved.startedAt) / 1000));
    } catch {
      // Corrupted entry -- ignore it rather than crashing the page.
    }
  }, []);

  // A restored timer can point at a note that was deleted (or belongs to
  // another account) while the tab was closed -- without this, "Mulai
  // Sesi" on every other note stays disabled forever with no visible timer
  // to stop.
  useEffect(() => {
    if (!activeTimerNoteId || items.length === 0) return;
    if (!items.some((n) => n.id === activeTimerNoteId)) {
      setActiveTimerNoteId(null);
      setTimerStart(null);
      setElapsedSeconds(0);
      clearSavedTimer();
    }
  }, [items, activeTimerNoteId]);

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
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
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

  function startEdit(note: StudyNote) {
    setError(null);
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditCategory(note.category);
    setEditContent(note.content ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(note: StudyNote) {
    const nextTitle = editTitle.trim();
    if (!nextTitle) return;
    setError(null);
    const nextCategory = editCategory.trim() || "Umum";
    const nextContent = editContent.trim() || null;
    const { error: updateError } = await supabase
      .from("study_notes")
      .update({
        title: nextTitle,
        category: nextCategory,
        content: nextContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", note.id);
    if (updateError) {
      setError("Gagal update topik. Coba lagi.");
      return;
    }
    setItems((prev) =>
      prev.map((n) =>
        n.id === note.id ? { ...n, title: nextTitle, category: nextCategory, content: nextContent } : n
      )
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus topik ini? Catatan, resource, dan riwayat sesinya ikut hilang."))) return;
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
    const startedAt = Date.now();
    setActiveTimerNoteId(noteId);
    setTimerStart(startedAt);
    setElapsedSeconds(0);
    try {
      window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ noteId, startedAt }));
    } catch {
      // Storage unavailable -- timer still works for this tab session, it
      // just won't survive a refresh.
    }
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
          setSessionDates((prev) => [...prev, new Date().toISOString()]);
        }
      }
    }
    setActiveTimerNoteId(null);
    setTimerStart(null);
    setElapsedSeconds(0);
    clearSavedTimer();
  }

  async function handleAddResource(noteId: string) {
    const label = resourceLabel.trim();
    const url = resourceUrl.trim();
    if (!label || !url) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      return;
    }
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

  async function addFlashcard(noteId: string, front: string, back: string) {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: insertError } = await supabase
      .from("flashcards")
      .insert({ user_id: user.id, note_id: noteId, front, back })
      .select("*")
      .single();
    if (insertError || !data) {
      setError("Gagal tambah kartu. Coba lagi.");
      return;
    }
    setFlashcardsByNote((prev) => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), data] }));
  }

  async function addFlashcards(noteId: string, drafts: { front: string; back: string }[]) {
    if (drafts.length === 0) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: insertError } = await supabase
      .from("flashcards")
      .insert(drafts.map((d) => ({ user_id: user.id, note_id: noteId, front: d.front, back: d.back })))
      .select("*");
    if (insertError || !data) {
      setError("Gagal simpan kartu. Coba lagi.");
      return;
    }
    setFlashcardsByNote((prev) => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), ...data] }));
  }

  async function deleteFlashcard(card: Flashcard) {
    setError(null);
    const previous = flashcardsByNote;
    setFlashcardsByNote((prev) => ({
      ...prev,
      [card.note_id]: (prev[card.note_id] ?? []).filter((c) => c.id !== card.id),
    }));
    const { error: deleteError } = await supabase.from("flashcards").delete().eq("id", card.id);
    if (deleteError) {
      setFlashcardsByNote(previous);
      setError("Gagal hapus kartu. Coba lagi.");
    }
  }

  async function rateFlashcard(card: Flashcard, rating: ReviewRating): Promise<Flashcard> {
    const next = nextReview(card, rating);
    const lastReviewedAt = new Date().toISOString();
    const updated: Flashcard = { ...card, ...next, last_reviewed_at: lastReviewedAt };
    setFlashcardsByNote((prev) => ({
      ...prev,
      [card.note_id]: (prev[card.note_id] ?? []).map((c) => (c.id === card.id ? updated : c)),
    }));
    const { error: updateError } = await supabase
      .from("flashcards")
      .update({
        ease_factor: next.ease_factor,
        interval_days: next.interval_days,
        repetitions: next.repetitions,
        due_at: next.due_at,
        last_reviewed_at: lastReviewedAt,
      })
      .eq("id", card.id);
    if (updateError) {
      setError("Gagal simpen progress kartu. Coba lagi.");
    }
    return updated;
  }

  async function generateFlashcards(note: StudyNote): Promise<{ front: string; back: string }[]> {
    const res = await fetch("/api/assistant/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: note.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Gagal bikin kartu.");
    }
    return data.cards;
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

  const flashcardReviewDates = Object.values(flashcardsByNote)
    .flat()
    .map((c) => c.last_reviewed_at);
  const streak = computeStreak([...sessionDates, ...flashcardReviewDates]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Modul 03
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Pelajaran
          </h1>
          {streak > 0 && (
            <p className="font-mono text-xs text-amber-glow mt-1">🔥 {streak} hari beruntun belajar</p>
          )}
        </div>
        <button onClick={() => setShowForm((s) => !s)} className={primaryBtnClass}>
          {showForm ? "Batal" : "+ Topik Baru"}
        </button>
      </header>

      <PomodoroTimer />

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
            const editing = editingId === note.id;
            return (
              <HudPanel key={note.id}>
                {editing ? (
                  <div className="space-y-2 mb-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={`${inputClass} text-sm`}
                      placeholder="Judul topik"
                    />
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className={`${inputClass} text-sm`}
                      placeholder="Kategori"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className={`${inputClass} text-sm min-h-20`}
                      placeholder="Catatan"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={cancelEdit} className={ghostBtnClass}>
                        Batal
                      </button>
                      <button
                        onClick={() => saveEdit(note)}
                        disabled={!editTitle.trim()}
                        className={primaryBtnClass}
                      >
                        Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {note.title}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-600">{note.category}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(note)}
                        className="text-xs font-mono text-cyan-glow/80 hover:text-cyan-glow"
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDelete(note.id)} className={dangerBtnClass}>
                        Hapus
                      </button>
                    </div>
                  </div>
                )}

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
                  <button
                    onClick={() => setFlashcardNoteId(flashcardNoteId === note.id ? null : note.id)}
                    className="text-xs font-mono text-mint-glow/80 hover:text-mint-glow"
                  >
                    🗂️ Kartu
                    {(() => {
                      const due = (flashcardsByNote[note.id] ?? []).filter(
                        (c) => new Date(c.due_at) <= new Date()
                      ).length;
                      return due > 0 ? ` (${due} due)` : "";
                    })()}
                  </button>
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
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={resourceLabel}
                          onChange={(e) => setResourceLabel(e.target.value)}
                          placeholder="Label"
                          className={`${inputClass} text-xs py-1.5 w-full sm:w-1/3 min-w-0`}
                        />
                        <input
                          type="url"
                          value={resourceUrl}
                          onChange={(e) => setResourceUrl(e.target.value)}
                          placeholder="https://..."
                          className={`${inputClass} text-xs py-1.5 min-w-0 flex-1`}
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

                {flashcardNoteId === note.id && (
                  <FlashcardPanel
                    note={note}
                    cards={flashcardsByNote[note.id] ?? []}
                    onClose={() => setFlashcardNoteId(null)}
                    onAdd={(front, back) => addFlashcard(note.id, front, back)}
                    onDelete={deleteFlashcard}
                    onGenerate={() => generateFlashcards(note)}
                    onSaveGenerated={(drafts) => addFlashcards(note.id, drafts)}
                    onRate={rateFlashcard}
                  />
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

      {confirmDialog}
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

type GeneratedCard = { front: string; back: string; selected: boolean };

function FlashcardPanel({
  note,
  cards,
  onClose,
  onAdd,
  onDelete,
  onGenerate,
  onSaveGenerated,
  onRate,
}: {
  note: StudyNote;
  cards: Flashcard[];
  onClose: () => void;
  onAdd: (front: string, back: string) => Promise<void>;
  onDelete: (card: Flashcard) => void;
  onGenerate: () => Promise<{ front: string; back: string }[]>;
  onSaveGenerated: (drafts: { front: string; back: string }[]) => Promise<void>;
  onRate: (card: Flashcard, rating: ReviewRating) => Promise<Flashcard>;
}) {
  const [mode, setMode] = useState<"list" | "review">("list");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeneratedCard[] | null>(null);
  const [savingCandidates, setSavingCandidates] = useState(false);

  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const dueNow = cards.filter((c) => new Date(c.due_at) <= new Date());

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setAdding(true);
    await onAdd(front.trim(), back.trim());
    setFront("");
    setBack("");
    setAdding(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const drafts = await onGenerate();
      setCandidates(drafts.map((d) => ({ ...d, selected: true })));
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Gagal bikin kartu.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidates() {
    if (!candidates) return;
    const selected = candidates.filter((c) => c.selected).map(({ front, back }) => ({ front, back }));
    if (selected.length === 0) return;
    setSavingCandidates(true);
    await onSaveGenerated(selected);
    setSavingCandidates(false);
    setCandidates(null);
  }

  function startReview() {
    setReviewQueue(dueNow);
    setReviewedCount(0);
    setFlipped(false);
    setMode("review");
  }

  async function rate(rating: ReviewRating) {
    const card = reviewQueue[0];
    if (!card) return;
    const updated = await onRate(card, rating);
    setReviewQueue((prev) => {
      const rest = prev.slice(1);
      return rating === "again" ? [...rest, updated] : rest;
    });
    setReviewedCount((c) => c + 1);
    setFlipped(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-line/60 space-y-3">
      {mode === "list" ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-mono text-slate-500">
              {cards.length} kartu · {dueNow.length} due hari ini
            </p>
            <button onClick={startReview} disabled={dueNow.length === 0} className={primaryBtnClass}>
              Mulai Review ({dueNow.length})
            </button>
          </div>

          <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Depan (kata/istilah)"
              className={`${inputClass} text-xs py-1.5 flex-1 min-w-0`}
            />
            <input
              type="text"
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Belakang (jawaban)"
              className={`${inputClass} text-xs py-1.5 flex-1 min-w-0`}
            />
            <button type="submit" disabled={adding} className={ghostBtnClass}>
              +
            </button>
          </form>

          {note.content && (
            <div>
              <button onClick={handleGenerate} disabled={generating} className={ghostBtnClass}>
                {generating ? "Bikin kartu..." : "✨ Generate dari Catatan"}
              </button>
              {generateError && <p className="text-xs text-rose-glow mt-1.5">{generateError}</p>}
            </div>
          )}

          {candidates && (
            <div className="space-y-2 border border-line/60 rounded-sm p-2.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                Kartu hasil generate -- pilih yang mau disimpan
              </p>
              {candidates.map((c, i) => (
                <label key={i} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={(e) =>
                      setCandidates((prev) =>
                        prev ? prev.map((p, pi) => (pi === i ? { ...p, selected: e.target.checked } : p)) : prev
                      )
                    }
                    className="mt-0.5"
                  />
                  <span className="text-slate-300">
                    <span className="text-slate-100">{c.front}</span> — {c.back}
                  </span>
                </label>
              ))}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCandidates}
                  disabled={savingCandidates || candidates.every((c) => !c.selected)}
                  className={primaryBtnClass}
                >
                  {savingCandidates ? "Menyimpan..." : "Simpan Terpilih"}
                </button>
                <button onClick={() => setCandidates(null)} className={ghostBtnClass}>
                  Batal
                </button>
              </div>
            </div>
          )}

          {cards.length > 0 && (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="flex-1 truncate">{c.front}</span>
                  <span className="font-mono text-[10px] text-slate-600 shrink-0">
                    {new Date(c.due_at) <= new Date() ? "due" : formatDate(c.due_at)}
                  </span>
                  <button
                    onClick={() => onDelete(c)}
                    className="text-[10px] text-rose-glow/70 hover:text-rose-glow font-mono shrink-0"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-300 font-mono">
            Tutup
          </button>
        </>
      ) : reviewQueue.length === 0 ? (
        <div className="text-center space-y-2 py-2">
          <p className="text-sm text-mint-glow">🎉 Review selesai! {reviewedCount} kartu direview.</p>
          <button onClick={() => setMode("list")} className={ghostBtnClass}>
            Kembali
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-slate-500">
            {reviewQueue.length} kartu tersisa · {reviewedCount} udah direview
          </p>
          <div
            onClick={() => setFlipped((f) => !f)}
            className="cursor-pointer border border-line rounded-sm p-6 text-center min-h-24 flex items-center justify-center bg-panel2"
          >
            <p className="text-sm text-slate-100">{flipped ? reviewQueue[0].back : reviewQueue[0].front}</p>
          </div>
          {!flipped ? (
            <button onClick={() => setFlipped(true)} className={`${primaryBtnClass} w-full`}>
              Balik Kartu
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => rate("again")}
                className="text-xs py-2 rounded-sm border border-rose-glow/40 text-rose-glow hover:bg-rose-glow/10"
              >
                Lupa
              </button>
              <button
                onClick={() => rate("hard")}
                className="text-xs py-2 rounded-sm border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/10"
              >
                Susah
              </button>
              <button
                onClick={() => rate("good")}
                className="text-xs py-2 rounded-sm border border-cyan-glow/40 text-cyan-glow hover:bg-cyan-glow/10"
              >
                Oke
              </button>
              <button
                onClick={() => rate("easy")}
                className="text-xs py-2 rounded-sm border border-mint-glow/40 text-mint-glow hover:bg-mint-glow/10"
              >
                Gampang
              </button>
            </div>
          )}
          <button onClick={() => setMode("list")} className="text-[11px] text-slate-500 hover:text-slate-300 font-mono">
            Hentikan review
          </button>
        </div>
      )}
    </div>
  );
}
