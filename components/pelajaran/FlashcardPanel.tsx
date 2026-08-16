"use client";

import { useState } from "react";
import { Sparkles, X, PartyPopper } from "lucide-react";
import { Flashcard, StudyNote } from "@/lib/types";
import type { ReviewRating } from "@/lib/spacedRepetition";
import { formatDate } from "@/lib/format";
import { inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/ui";

type GeneratedCard = { front: string; back: string; selected: boolean };

export default function FlashcardPanel({
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
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={`${ghostBtnClass} inline-flex items-center gap-1.5`}
              >
                {generating ? (
                  "Bikin kartu..."
                ) : (
                  <>
                    <Sparkles aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Generate dari Catatan
                  </>
                )}
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
                    aria-label={`Hapus kartu ${c.front}`}
                    className="text-rose-glow/70 hover:text-rose-glow shrink-0"
                  >
                    <X aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
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
          <p className="flex items-center justify-center gap-1.5 text-sm text-mint-glow">
            <PartyPopper aria-hidden="true" className="w-4 h-4" strokeWidth={1.75} />
            Review selesai! {reviewedCount} kartu direview.
          </p>
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
