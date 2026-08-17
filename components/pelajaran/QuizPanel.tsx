"use client";

import { primaryBtnClass, ghostBtnClass } from "@/lib/ui";

export type QuizQuestion = { question: string; options: string[]; correct_index: number };

export default function QuizPanel({
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
        <p className="text-xs text-fg-subtle font-mono">Bikin soal...</p>
      ) : error ? (
        <p className="text-xs text-rose-glow">{error}</p>
      ) : (
        <>
          {questions.map((q, qIndex) => (
            <div key={qIndex}>
              <p className="text-xs text-fg-secondary mb-1.5">
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
                              : "border-line text-fg-subtle hover:border-slate-500"
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
        <button onClick={onClose} className="text-[11px] text-fg-subtle hover:text-fg-muted font-mono">
          Batal kuis
        </button>
      )}
    </div>
  );
}
