"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeStreak } from "@/lib/habits";
import { localDateKey, todayKey } from "@/lib/date";
import { daysUntil, formatDate } from "@/lib/format";
import { buildDailyBriefing, type BriefingColor, type DailyBriefing } from "@/lib/dailyBriefing";
import type { DailyBriefingRow } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import { ghostBtnClass, errorBannerClass } from "@/lib/ui";

const COLOR_CLASSES: Record<BriefingColor, { border: string; text: string; dot: string }> = {
  rose: { border: "border-l-rose-glow", text: "text-rose-glow", dot: "bg-rose-glow" },
  amber: { border: "border-l-amber-glow", text: "text-amber-glow", dot: "bg-amber-glow" },
  mint: { border: "border-l-mint-glow", text: "text-mint-glow", dot: "bg-mint-glow" },
  cyan: { border: "border-l-cyan-glow", text: "text-cyan-glow", dot: "bg-cyan-glow" },
  violet: { border: "border-l-violet-glow", text: "text-violet-glow", dot: "bg-violet-glow" },
};

export default function RingkasanPage() {
  const supabase = createClient();
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState("");

  const [insight, setInsight] = useState<{ text: string; sources: { label: string; url: string }[] } | null>(
    null
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [history, setHistory] = useState<DailyBriefingRow[]>([]);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setInsight(null);
    setInsightError(null);

    const now = new Date();
    const label = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);
    setDateLabel(label);

    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    try {
      const sevenDaysOut = new Date(startOfToday);
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
      const fourteenDaysAgo = new Date(startOfToday);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const [
        { data: txMonth },
        { data: budgets },
        { data: dueTasks },
        { data: overdueTasks },
        { data: habits },
        { data: habitChecks },
        { data: studyNotes },
        { data: journalEntries },
        { data: milestones },
        calendarRes,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("type, category, amount")
          .gte("occurred_on", firstDayOfMonth),
        supabase.from("budgets").select("category, monthly_limit"),
        supabase
          .from("tasks")
          .select("title")
          .neq("status", "done")
          .not("deadline", "is", null)
          .gte("deadline", startOfToday.toISOString())
          .lt("deadline", endOfToday.toISOString()),
        supabase
          .from("tasks")
          .select("title")
          .neq("status", "done")
          .not("deadline", "is", null)
          .lt("deadline", startOfToday.toISOString()),
        supabase.from("habits").select("id, title"),
        supabase.from("habit_checks").select("habit_id, period"),
        supabase.from("study_notes").select("title, progress, updated_at"),
        supabase.from("journal_entries").select("entry_date"),
        supabase
          .from("life_milestones")
          .select("title, occurred_on")
          .gte("occurred_on", todayKey())
          .lte("occurred_on", localDateKey(sevenDaysOut)),
        fetch(
          `/api/google/calendar/list?from=${startOfToday.toISOString()}&to=${endOfToday.toISOString()}`
        )
          .then((r) => r.json())
          .catch(() => ({ connected: false, events: [] })),
      ]);

      const income = (txMonth ?? [])
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expense = (txMonth ?? [])
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0);

      const spentByCategory = new Map<string, number>();
      for (const t of txMonth ?? []) {
        if (t.type !== "expense") continue;
        spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
      }
      const budgetAlerts = (budgets ?? [])
        .map((b) => ({
          category: b.category,
          pct: Math.round(((spentByCategory.get(b.category) ?? 0) / Number(b.monthly_limit)) * 100),
        }))
        .filter((x) => x.pct >= 90);

      const today = todayKey();
      const checksByHabit = new Map<string, Set<string>>();
      for (const c of habitChecks ?? []) {
        if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
        checksByHabit.get(c.habit_id)!.add(c.period);
      }
      const pendingHabits = (habits ?? [])
        .filter((h) => !(checksByHabit.get(h.id) ?? new Set()).has(today))
        .map((h) => ({ title: h.title, streak: computeStreak(checksByHabit.get(h.id) ?? new Set()) }));

      const staleStudyNotes = (studyNotes ?? [])
        .filter((n) => n.progress < 100 && new Date(n.updated_at) < fourteenDaysAgo)
        .map((n) => ({ title: n.title }));

      const journalPeriods = new Set((journalEntries ?? []).map((e) => e.entry_date));
      const journalStreak = computeStreak(journalPeriods);
      const journaledToday = journalPeriods.has(today);

      const upcomingMilestones = (milestones ?? []).map((m) => {
        const days = daysUntil(m.occurred_on) ?? 0;
        return { title: m.title, dateLabel: days === 0 ? "Hari ini" : `${days} hari lagi` };
      });

      const result = buildDailyBriefing(label, {
        income,
        expense,
        budgetAlerts,
        dueTasks: (dueTasks ?? []).map((t) => ({ title: t.title })),
        overdueTasks: (overdueTasks ?? []).map((t) => ({ title: t.title })),
        pendingHabits,
        calendarEvents: (calendarRes.events ?? []).map((e: { summary: string; start: string }) => ({
          summary: e.summary,
          start: e.start,
        })),
        calendarConnected: !!calendarRes.connected,
        hasStudyNotes: (studyNotes ?? []).length > 0,
        staleStudyNotes,
        hasJournalHistory: journalPeriods.size > 0,
        journaledToday,
        journalStreak,
        upcomingMilestones,
      });
      setBriefing(result);

      // Snapshot today's real computed summary for "Riwayat Briefing" --
      // opportunistic (whenever this page happens to load that day), never
      // backfilled, so a day with no visit is just genuinely absent from
      // the history instead of a fabricated entry.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("daily_briefings")
          .upsert(
            { user_id: user.id, briefing_date: today, preview: result.summaryText },
            { onConflict: "user_id,briefing_date" }
          );
      }
      const { data: historyRows } = await supabase
        .from("daily_briefings")
        .select("*")
        .lt("briefing_date", today)
        .order("briefing_date", { ascending: false })
        .limit(14);
      setHistory((historyRows ?? []) as DailyBriefingRow[]);
    } catch {
      setError("Gagal nyusun ringkasan. Coba refresh lagi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askInsight() {
    if (!briefing || briefing.priorities.length === 0) return;
    const top = briefing.priorities[0];
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch("/api/assistant/node-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeLabel: "Ringkasan Harian",
          label: top.title,
          fields: [{ k: top.tag, v: top.reason }],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInsightError(json.error ?? "Gagal ambil insight.");
        return;
      }
      setInsight({ text: json.text, sources: Array.isArray(json.sources) ? json.sources : [] });
    } catch {
      setInsightError("Gagal ambil insight.");
    } finally {
      setInsightLoading(false);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !briefing) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    setVoiceError(null);
    try {
      const res = await fetch("/api/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: briefing.summaryText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVoiceError(data.error ?? "Gagal bikin suara.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } catch {
      setVoiceError("Gagal muterin audio.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Ringkasan Harian
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white capitalize">
            {dateLabel || "Memuat..."}
          </h1>
        </div>
        <button onClick={load} disabled={loading} className={ghostBtnClass}>
          {loading ? "Menyusun..." : "↻ Refresh"}
        </button>
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      {loading && !briefing ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Menyusun ringkasan...</p>
        </HudPanel>
      ) : briefing ? (
        <>
          {briefing.priorities.length > 0 && (
            <div className="flex flex-col gap-3">
              {briefing.priorities.map((p, i) => {
                const c = COLOR_CLASSES[p.color];
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3.5 bg-panel/70 border border-line border-l-[3px] ${c.border} rounded-md p-3.5`}
                  >
                    <span className={`font-display font-bold text-xl ${c.text} opacity-50 w-6 shrink-0`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-[9.5px] uppercase tracking-wider ${c.text} mb-1`}>
                        {p.tag}
                      </p>
                      <p className="text-sm text-slate-100 mb-0.5">{p.title}</p>
                      <p className="text-xs text-slate-400">{p.reason}</p>
                    </div>
                    <a
                      href={p.href}
                      className={`font-mono text-[10.5px] ${c.text} whitespace-nowrap shrink-0 self-center hover:underline`}
                    >
                      {p.action} →
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          <HudPanel>
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-9 h-9 shrink-0 rounded-full bg-cyan-glow/15 text-cyan-glow border border-cyan-glow/40 flex items-center justify-center"
                aria-label={playing ? "Berhenti dengerin ringkasan" : "Dengerin ringkasan"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-slate-300">
                  {playing ? "Aslan lagi bacain ringkasan..." : "Dengerin ringkasan ini"}
                </p>
                {voiceError && <p className="text-[11px] text-rose-glow mt-0.5">{voiceError}</p>}
              </div>
            </div>
          </HudPanel>

          <div className="flex flex-col gap-3.5">
            {briefing.sections.map((sec) => {
              const c = COLOR_CLASSES[sec.color];
              return (
                <HudPanel key={sec.title}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <h2 className="font-display font-semibold text-white tracking-wide text-sm">
                      {sec.title}
                    </h2>
                  </div>
                  <ul className="space-y-1.5">
                    {sec.items.map((item, i) => (
                      <li key={i} className="text-[13px] text-slate-300 leading-relaxed">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </HudPanel>
              );
            })}
          </div>

          {briefing.priorities.length > 0 && (
            <HudPanel>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="font-display font-semibold text-white tracking-wide text-sm">
                  Insight Aslan
                </h2>
                {!insight && !insightLoading && (
                  <button onClick={askInsight} className={ghostBtnClass}>
                    Minta insight
                  </button>
                )}
              </div>
              {insightLoading && <p className="text-xs font-mono text-slate-500">Mikir...</p>}
              {insightError && <p className="text-xs text-rose-glow">{insightError}</p>}
              {insight && (
                <>
                  <p className="text-sm text-slate-300 leading-relaxed mb-2">{insight.text}</p>
                  {insight.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {insight.sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] border border-cyan-glow/30 text-cyan-glow rounded-full px-2 py-0.5 bg-cyan-glow/[.06] hover:bg-cyan-glow/10"
                        >
                          {s.label}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
              {!insight && !insightLoading && !insightError && (
                <p className="text-xs text-slate-600">
                  Minta Aslan gali topik prioritas #1 di atas lebih dalam (boleh pake web search).
                </p>
              )}
            </HudPanel>
          )}

          {history.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="flex-1 h-px bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
                  Riwayat Briefing
                </span>
                <span className="flex-1 h-px bg-line" />
              </div>
              <div className="flex flex-col gap-1.5">
                {history.map((h) => {
                  const open = openHistoryId === h.id;
                  return (
                    <div key={h.id}>
                      <button
                        onClick={() => setOpenHistoryId(open ? null : h.id)}
                        className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 border border-line rounded-md bg-panel/50 text-left"
                      >
                        <span className="text-[12.5px] text-slate-300 capitalize">
                          {formatDate(h.briefing_date)}
                        </span>
                        <span className="font-mono text-xs text-slate-500">{open ? "−" : "+"}</span>
                      </button>
                      {open && (
                        <p className="text-xs text-slate-400 leading-relaxed mt-2 ml-3.5">{h.preview}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
