"use client";

import { useEffect, useState } from "react";
import { Coffee, Timer } from "lucide-react";
import HudPanel from "@/components/HudPanel";
import { primaryBtnClass, ghostBtnClass } from "@/lib/ui";

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
// the per-note stopwatch on the page) -- pinned near the top of the page so
// it's the first thing visible, not buried inside a note card.
export default function PomodoroTimer() {
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
        <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-fg-subtle mb-1">
          {isBreak ? (
            <Coffee aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2} />
          ) : (
            <Timer aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2} />
          )}
          {isBreak ? "Waktunya istirahat" : "Fokus Pomodoro"}
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
