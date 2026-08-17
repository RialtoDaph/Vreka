"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeStreak } from "@/lib/habits";
import { localDateKey, todayKey } from "@/lib/date";
import { daysUntil, formatDate } from "@/lib/format";
import { buildDailyBriefing, type BriefingColor, type DailyBriefing } from "@/lib/dailyBriefing";
import type { DailyBriefingRow } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import { Pause, Play } from "lucide-react";
import { ghostBtnClass, errorBannerClass } from "@/lib/ui";

const COLOR_CLASSES: Record<BriefingColor, { border: string; text: string; dot: string }> = {
  rose: { border: "border-l-rose-glow", text: "text-rose-glow", dot: "bg-rose-glow" },
  amber: { border: "border-l-amber-glow", text: "text-amber-glow", dot: "bg-amber-glow" },
  mint: { border: "border-l-mint-glow", text: "text-mint-glow", dot: "bg-mint-glow" },
  cyan: { border: "border-l-cyan-glow", text: "text-cyan-glow", dot: "bg-cyan-glow" },
  violet: { border: "border-l-violet-glow", text: "text-violet-glow", dot: "bg-violet-glow" },
};

type TxRow = { type: string; category: string; amount: number };
type BudgetRow = { category: string; monthly_limit: number };
type TaskRow = { title: string };
type HabitRow = { id: string; title: string };
type HabitCheckRow = { habit_id: string; period: string };
type StudyNoteRow = { title: string; progress: number; updated_at: string };
type JournalRow = { entry_date: string };
type MilestoneRow = { title: string; occurred_on: string };
type CalendarRes = { connected: boolean; events: { summary: string; start: string }[] };

type SourceKey = "keuangan" | "kerjaan" | "pelajaran" | "jurnal" | "timeline";

const SOURCE_LABELS: Record<SourceKey, string> = {
  keuangan: "Keuangan",
  kerjaan: "Kerjaan",
  pelajaran: "Pelajaran",
  jurnal: "Jurnal",
  timeline: "Timeline",
};

type RawSources = {
  keuangan: { txMonth: TxRow[]; budgets: BudgetRow[] };
  kerjaan: { dueTasks: TaskRow[]; overdueTasks: TaskRow[]; habits: HabitRow[]; habitChecks: HabitCheckRow[] };
  pelajaran: { studyNotes: StudyNoteRow[] };
  jurnal: { journalEntries: JournalRow[] };
  timeline: { milestones: MilestoneRow[] };
};

function emptyRawSources(): RawSources {
  return {
    keuangan: { txMonth: [], budgets: [] },
    kerjaan: { dueTasks: [], overdueTasks: [], habits: [], habitChecks: [] },
    pelajaran: { studyNotes: [] },
    jurnal: { journalEntries: [] },
    timeline: { milestones: [] },
  };
}

function dateBounds() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const sevenDaysOut = new Date(startOfToday);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const fourteenDaysAgo = new Date(startOfToday);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  return { firstDayOfMonth, startOfToday, endOfToday, sevenDaysOut, fourteenDaysAgo };
}

function formatToday() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function RingkasanPage() {
  const supabase = createClient();
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState("");

  // Which of the five per-module data sources failed to load on the last
  // attempt -- kept separate from `error` (reserved for a total/fatal
  // failure like an expired session) so one flaky query doesn't blank out a
  // briefing built successfully from the other four.
  const [failedSources, setFailedSources] = useState<Set<SourceKey>>(new Set());
  const [retrying, setRetrying] = useState<SourceKey | null>(null);
  const rawRef = useRef<RawSources>(emptyRawSources());
  const calendarRef = useRef<CalendarRes>({ connected: false, events: [] });

  const [insight, setInsight] = useState<{ text: string; sources: { label: string; url: string }[] } | null>(
    null
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [history, setHistory] = useState<DailyBriefingRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  async function fetchKeuangan(): Promise<RawSources["keuangan"]> {
    const { firstDayOfMonth } = dateBounds();
    const [tx, bud] = await Promise.all([
      supabase.from("transactions").select("type, category, amount").gte("occurred_on", firstDayOfMonth),
      supabase.from("budgets").select("category, monthly_limit"),
    ]);
    if (tx.error || bud.error) throw tx.error ?? bud.error;
    return { txMonth: tx.data ?? [], budgets: bud.data ?? [] };
  }

  async function fetchKerjaan(): Promise<RawSources["kerjaan"]> {
    const { startOfToday, endOfToday } = dateBounds();
    const [due, overdue, habits, checks] = await Promise.all([
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
    ]);
    if (due.error || overdue.error || habits.error || checks.error) {
      throw due.error ?? overdue.error ?? habits.error ?? checks.error;
    }
    return {
      dueTasks: due.data ?? [],
      overdueTasks: overdue.data ?? [],
      habits: habits.data ?? [],
      habitChecks: checks.data ?? [],
    };
  }

  async function fetchPelajaran(): Promise<RawSources["pelajaran"]> {
    const res = await supabase.from("study_notes").select("title, progress, updated_at");
    if (res.error) throw res.error;
    return { studyNotes: res.data ?? [] };
  }

  async function fetchJurnal(): Promise<RawSources["jurnal"]> {
    const res = await supabase.from("journal_entries").select("entry_date");
    if (res.error) throw res.error;
    return { journalEntries: res.data ?? [] };
  }

  async function fetchTimeline(): Promise<RawSources["timeline"]> {
    const { sevenDaysOut } = dateBounds();
    const res = await supabase
      .from("life_milestones")
      .select("title, occurred_on")
      .gte("occurred_on", todayKey())
      .lte("occurred_on", localDateKey(sevenDaysOut));
    if (res.error) throw res.error;
    return { milestones: res.data ?? [] };
  }

  async function fetchCalendar(): Promise<CalendarRes> {
    const { startOfToday, endOfToday } = dateBounds();
    return fetch(`/api/google/calendar/list?from=${startOfToday.toISOString()}&to=${endOfToday.toISOString()}`)
      .then((r) => r.json())
      .catch(() => ({ connected: false, events: [] }));
  }

  function rebuildBriefing(label: string): DailyBriefing {
    const raw = rawRef.current;
    const calendarRes = calendarRef.current;
    const { fourteenDaysAgo } = dateBounds();
    const today = todayKey();

    const income = raw.keuangan.txMonth
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = raw.keuangan.txMonth
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);

    const spentByCategory = new Map<string, number>();
    for (const t of raw.keuangan.txMonth) {
      if (t.type !== "expense") continue;
      spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
    }
    const budgetAlerts = raw.keuangan.budgets
      .map((b) => ({
        category: b.category,
        pct: Math.round(((spentByCategory.get(b.category) ?? 0) / Number(b.monthly_limit)) * 100),
      }))
      .filter((x) => x.pct >= 90);

    const checksByHabit = new Map<string, Set<string>>();
    for (const c of raw.kerjaan.habitChecks) {
      if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
      checksByHabit.get(c.habit_id)!.add(c.period);
    }
    const pendingHabits = raw.kerjaan.habits
      .filter((h) => !(checksByHabit.get(h.id) ?? new Set()).has(today))
      .map((h) => ({ title: h.title, streak: computeStreak(checksByHabit.get(h.id) ?? new Set()) }));

    const staleStudyNotes = raw.pelajaran.studyNotes
      .filter((n) => n.progress < 100 && new Date(n.updated_at) < fourteenDaysAgo)
      .map((n) => ({ title: n.title }));

    const journalPeriods = new Set(raw.jurnal.journalEntries.map((e) => e.entry_date));
    const journalStreak = computeStreak(journalPeriods);
    const journaledToday = journalPeriods.has(today);

    const upcomingMilestones = raw.timeline.milestones.map((m) => {
      const days = daysUntil(m.occurred_on) ?? 0;
      return { title: m.title, dateLabel: days === 0 ? "Hari ini" : `${days} hari lagi` };
    });

    const result = buildDailyBriefing(label, {
      income,
      expense,
      budgetAlerts,
      dueTasks: raw.kerjaan.dueTasks,
      overdueTasks: raw.kerjaan.overdueTasks,
      pendingHabits,
      calendarEvents: calendarRes.events ?? [],
      calendarConnected: !!calendarRes.connected,
      hasStudyNotes: raw.pelajaran.studyNotes.length > 0,
      staleStudyNotes,
      hasJournalHistory: journalPeriods.size > 0,
      journaledToday,
      journalStreak,
      upcomingMilestones,
    });
    setBriefing(result);
    return result;
  }

  // Isolated from the main briefing on purpose -- a hiccup saving/loading
  // "Riwayat Briefing" shouldn't block today's briefing from showing, and
  // vice versa.
  async function saveAndLoadHistory(result: DailyBriefing) {
    setHistoryError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const today = todayKey();
      await supabase
        .from("daily_briefings")
        .upsert(
          { user_id: user.id, briefing_date: today, preview: result.summaryText },
          { onConflict: "user_id,briefing_date" }
        );
      const { data: historyRows } = await supabase
        .from("daily_briefings")
        .select("*")
        .lt("briefing_date", today)
        .order("briefing_date", { ascending: false })
        .limit(14);
      setHistory((historyRows ?? []) as DailyBriefingRow[]);
    } catch {
      setHistoryError("Gagal muat riwayat briefing.");
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    setInsight(null);
    setInsightError(null);

    const label = formatToday();
    setDateLabel(label);

    let userId: string | undefined;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      setError("Gagal konek. Coba refresh lagi.");
      setLoading(false);
      return;
    }
    if (!userId) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      setLoading(false);
      return;
    }

    const domains: { key: SourceKey; run: () => Promise<void> }[] = [
      { key: "keuangan", run: async () => { rawRef.current.keuangan = await fetchKeuangan(); } },
      { key: "kerjaan", run: async () => { rawRef.current.kerjaan = await fetchKerjaan(); } },
      { key: "pelajaran", run: async () => { rawRef.current.pelajaran = await fetchPelajaran(); } },
      { key: "jurnal", run: async () => { rawRef.current.jurnal = await fetchJurnal(); } },
      { key: "timeline", run: async () => { rawRef.current.timeline = await fetchTimeline(); } },
    ];

    const [settled] = await Promise.all([
      Promise.allSettled(domains.map((d) => d.run())),
      fetchCalendar().then((res) => {
        calendarRef.current = res;
      }),
    ]);

    const failed = new Set<SourceKey>();
    settled.forEach((r, i) => {
      if (r.status === "rejected") failed.add(domains[i].key);
    });
    setFailedSources(failed);

    const result = rebuildBriefing(label);
    setLoading(false);

    saveAndLoadHistory(result);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retrySource(key: SourceKey) {
    setRetrying(key);
    try {
      if (key === "keuangan") rawRef.current.keuangan = await fetchKeuangan();
      else if (key === "kerjaan") rawRef.current.kerjaan = await fetchKerjaan();
      else if (key === "pelajaran") rawRef.current.pelajaran = await fetchPelajaran();
      else if (key === "jurnal") rawRef.current.jurnal = await fetchJurnal();
      else if (key === "timeline") rawRef.current.timeline = await fetchTimeline();
    } catch {
      setRetrying(null);
      return;
    }
    setFailedSources((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    rebuildBriefing(dateLabel || formatToday());
    setRetrying(null);
  }

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
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg capitalize">
            {dateLabel || "Memuat..."}
          </h1>
        </div>
        <button onClick={load} disabled={loading} className={ghostBtnClass}>
          {loading ? "Menyusun..." : "↻ Refresh"}
        </button>
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      {failedSources.size > 0 && (
        <div className="flex flex-col gap-1.5 text-xs text-amber-glow bg-amber-glow/10 border border-amber-glow/30 rounded-sm px-3 py-2.5">
          <p>Sebagian data nggak kemuat, jadi ringkasan di bawah bisa aja belum lengkap:</p>
          <ul className="flex flex-col gap-1">
            {[...failedSources].map((key) => (
              <li key={key} className="flex items-center justify-between gap-2">
                <span>{SOURCE_LABELS[key]}</span>
                <button
                  onClick={() => retrySource(key)}
                  disabled={retrying === key}
                  aria-label={`Coba lagi muat ${SOURCE_LABELS[key]}`}
                  className="font-mono uppercase tracking-wider text-[10.5px] text-amber-glow hover:underline disabled:opacity-50"
                >
                  {retrying === key ? "Nyoba lagi..." : "Coba lagi"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && !briefing ? (
        <HudPanel>
          <p className="text-sm text-fg-subtle">Menyusun ringkasan...</p>
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
                      <p className="text-sm text-fg mb-0.5">{p.title}</p>
                      <p className="text-xs text-fg-subtle">{p.reason}</p>
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
                {playing ? (
                  <Pause aria-hidden="true" className="w-4 h-4" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play aria-hidden="true" className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-fg-muted">
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
                    <h2 className="font-display font-semibold text-fg tracking-wide text-sm">
                      {sec.title}
                    </h2>
                  </div>
                  <ul className="space-y-1.5">
                    {sec.items.map((item, i) => (
                      <li key={i} className="text-[13px] text-fg-muted leading-relaxed">
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
                <h2 className="font-display font-semibold text-fg tracking-wide text-sm">
                  Insight Aslan
                </h2>
                {!insight && !insightLoading && (
                  <button onClick={askInsight} className={ghostBtnClass}>
                    Minta insight
                  </button>
                )}
              </div>
              {insightLoading && <p className="text-xs font-mono text-fg-subtle">Mikir...</p>}
              {insightError && <p className="text-xs text-rose-glow">{insightError}</p>}
              {insight && (
                <>
                  <p className="text-sm text-fg-muted leading-relaxed mb-2">{insight.text}</p>
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
                <p className="text-xs text-fg-subtle">
                  Minta Aslan gali topik prioritas #1 di atas lebih dalam (boleh pake web search).
                </p>
              )}
            </HudPanel>
          )}

          {(history.length > 0 || historyError) && (
            <div>
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="flex-1 h-px bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  Riwayat Briefing
                </span>
                <span className="flex-1 h-px bg-line" />
              </div>
              {historyError ? (
                <p className="text-xs text-rose-glow">{historyError}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {history.map((h) => {
                    const open = openHistoryId === h.id;
                    return (
                      <div key={h.id}>
                        <button
                          onClick={() => setOpenHistoryId(open ? null : h.id)}
                          className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 border border-line rounded-md bg-panel/50 text-left"
                        >
                          <span className="text-[12.5px] text-fg-muted capitalize">
                            {formatDate(h.briefing_date)}
                          </span>
                          <span className="font-mono text-xs text-fg-subtle">{open ? "−" : "+"}</span>
                        </button>
                        {open && (
                          <p className="text-xs text-fg-subtle leading-relaxed mt-2 ml-3.5">{h.preview}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
