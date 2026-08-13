"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildMonthGrid, dateKey, isSameMonth } from "@/lib/calendarGrid";
import HudPanel from "@/components/HudPanel";
import { ghostBtnClass, primaryBtnClass, inputClass, errorBannerClass } from "@/lib/ui";

type CalItemType = "kerjaan" | "keuangan" | "pelajaran" | "asisten";

type CalItem = {
  type: CalItemType;
  label: string;
  meta?: string;
  time?: string;
  href: string;
};

// Order also drives the legend row below the grid.
const TYPE_META: Record<CalItemType, { dot: string; text: string; badge: string }> = {
  kerjaan: { dot: "bg-amber-glow", text: "text-amber-glow", badge: "Kerjaan" },
  keuangan: { dot: "bg-mint-glow", text: "text-mint-glow", badge: "Keuangan" },
  pelajaran: { dot: "bg-rose-glow", text: "text-rose-glow", badge: "Pelajaran" },
  asisten: { dot: "bg-cyan-glow", text: "text-cyan-glow", badge: "Asisten" },
};

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MAX_VISIBLE_CHIPS = 2;

// Only ISO datetimes ("...T...") carry a real time-of-day -- a bare date
// ("2026-08-05") has none, and parsing it as a Date then reading local
// hours would show a bogus time (UTC midnight shifted into local time).
function timeFromIso(iso: string): string | undefined {
  if (!iso.includes("T")) return undefined;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function KalenderPage() {
  const supabase = createClient();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [itemsByDay, setItemsByDay] = useState<Record<string, CalItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(() => dateKey(new Date()));
  const [eventStart, setEventStart] = useState("09:00");
  const [eventEnd, setEventEnd] = useState("10:00");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  async function loadItems() {
    setLoading(true);
    const gridStart = grid[0];
    const gridEnd = grid[41];
    const gridEndExclusive = new Date(gridEnd);
    gridEndExclusive.setDate(gridEndExclusive.getDate() + 1);

    const [{ data: tasks }, { data: debts }, { data: goals }, { data: sessions }, calendarRes] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("title, deadline")
          .not("deadline", "is", null)
          .gte("deadline", gridStart.toISOString())
          .lt("deadline", gridEndExclusive.toISOString()),
        supabase
          .from("debts")
          .select("party_name, direction, due_date, is_recurring, recurrence_day")
          .eq("status", "unpaid"),
        supabase
          .from("savings_goals")
          .select("name, deadline")
          .not("deadline", "is", null)
          .gte("deadline", dateKey(gridStart))
          .lte("deadline", dateKey(gridEnd)),
        supabase
          .from("study_sessions")
          .select("created_at, study_notes(title)")
          .gte("created_at", gridStart.toISOString())
          .lt("created_at", gridEndExclusive.toISOString()),
        fetch(
          `/api/google/calendar/list?from=${gridStart.toISOString()}&to=${gridEndExclusive.toISOString()}`
        )
          .then((r) => r.json())
          .catch(() => ({ connected: false, events: [] })),
      ]);

    const map: Record<string, CalItem[]> = {};
    function push(key: string, item: CalItem) {
      (map[key] ??= []).push(item);
    }

    for (const t of tasks ?? []) {
      if (!t.deadline) continue;
      push(dateKey(new Date(t.deadline)), {
        type: "kerjaan",
        label: t.title,
        time: timeFromIso(t.deadline),
        href: "/dashboard/kerjaan",
      });
    }
    for (const d of debts ?? []) {
      const label = `${d.direction === "i_owe" ? "Bayar" : "Tagih"} ${d.party_name}`;
      if (d.is_recurring && d.recurrence_day) {
        // Only this visible month's occurrence -- grid padding days from
        // adjacent months don't get one, same limitation the non-recurring
        // due_date range already has at the grid edges.
        const occurs = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), d.recurrence_day);
        if (occurs.getMonth() === visibleMonth.getMonth()) {
          push(dateKey(occurs), { type: "keuangan", label, meta: "Berulang", href: "/dashboard/keuangan" });
        }
      } else if (d.due_date) {
        push(d.due_date, { type: "keuangan", label, href: "/dashboard/keuangan" });
      }
    }
    for (const g of goals ?? []) {
      if (!g.deadline) continue;
      push(g.deadline, { type: "keuangan", label: g.name, href: "/dashboard/keuangan" });
    }
    for (const s of (sessions ?? []) as { created_at: string; study_notes: { title: string }[] | null }[]) {
      const title = s.study_notes?.[0]?.title;
      if (!title) continue;
      push(dateKey(new Date(s.created_at)), {
        type: "pelajaran",
        label: `Belajar ${title}`,
        time: timeFromIso(s.created_at),
        href: "/dashboard/pelajaran",
      });
    }
    setCalendarConnected(!!calendarRes.connected);
    for (const e of calendarRes.events ?? []) {
      if (!e.start) continue;
      push(dateKey(new Date(e.start)), {
        type: "asisten",
        label: e.summary,
        meta: e.location || undefined,
        time: timeFromIso(e.start),
        href: "/dashboard/asisten",
      });
    }

    setItemsByDay(map);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth]);

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(visibleMonth);
  const selectedItems = selectedDay ? (itemsByDay[dateKey(selectedDay)] ?? []) : [];

  function shiftMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function openAddEvent(day?: Date) {
    setEventTitle("");
    setEventDate(dateKey(day ?? selectedDay ?? new Date()));
    setEventStart("09:00");
    setEventEnd("10:00");
    setEventError(null);
    setShowAddEvent(true);
  }

  function openDay(day: Date) {
    setSelectedDay(day);
    setShowAddEvent(false);
  }

  function closeDay() {
    setSelectedDay(null);
    setShowAddEvent(false);
  }

  // Builds a Date from separate "YYYY-MM-DD" + "HH:mm" fields using the
  // multi-arg Date constructor (interpreted in the browser's local
  // timezone), instead of parsing a combined string -- parsing is what was
  // silently producing UTC-ambiguous datetimes before.
  function localDateTime(dateStr: string, timeStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  // Google Calendar wants an explicit UTC offset on the dateTime string;
  // without one it's ambiguous which timezone the event is actually in.
  function toIsoWithLocalOffset(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
    const offM = pad(Math.abs(offsetMin) % 60);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${offH}:${offM}`
    );
  }

  // An end clock-time at or before the start clock-time means the event
  // crosses midnight (e.g. a 22:30-10:00 overnight flight), not a 0/negative
  // duration -- roll the end over to the next day instead of sending Google
  // a request it rejects as "timeRangeEmpty".
  const crossesMidnight = eventEnd <= eventStart;

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setEventSaving(true);
    setEventError(null);
    try {
      const startDt = localDateTime(eventDate, eventStart);
      const endDt = localDateTime(eventDate, eventEnd);
      if (crossesMidnight) endDt.setDate(endDt.getDate() + 1);

      const res = await fetch("/api/google/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: eventTitle.trim(),
          start: toIsoWithLocalOffset(startDt),
          end: toIsoWithLocalOffset(endDt),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEventError(
          res.status === 409
            ? "Google Calendar belum di-connect. Connect dulu di halaman Aslan."
            : (data.error ?? "Gagal bikin event.")
        );
        return;
      }
      setShowAddEvent(false);
      await loadItems();
    } catch {
      setEventError("Gagal bikin event. Coba lagi.");
    } finally {
      setEventSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Kalender Terpadu
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white capitalize">
            {monthLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className={ghostBtnClass}>
            ← Bulan Lalu
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className={ghostBtnClass}
          >
            Hari Ini
          </button>
          <button onClick={() => shiftMonth(1)} className={ghostBtnClass}>
            Bulan Depan →
          </button>
          <button onClick={() => openDay(new Date())} className={primaryBtnClass}>
            + Tambah Event
          </button>
        </div>
      </header>

      <HudPanel>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-mono uppercase text-slate-500 py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const key = dateKey(day);
            const items = itemsByDay[key] ?? [];
            const inMonth = isSameMonth(day, visibleMonth);
            const isToday = key === dateKey(new Date());
            const visibleItems = items.slice(0, MAX_VISIBLE_CHIPS);
            const overflow = items.length - MAX_VISIBLE_CHIPS;
            return (
              <button
                key={key}
                onClick={() => openDay(day)}
                aria-label={key}
                className={`min-h-[72px] rounded-sm border p-1.5 flex flex-col items-start text-left transition-colors ${
                  isToday ? "border-cyan-glow/50 bg-cyan-glow/5" : "border-line hover:border-slate-600"
                } ${inMonth ? "" : "opacity-30"}`}
              >
                <span className={`text-xs font-mono ${isToday ? "text-cyan-glow" : "text-slate-300"}`}>
                  {day.getDate()}
                </span>
                <span className="flex flex-col gap-0.5 mt-1.5 w-full">
                  {visibleItems.map((item, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 bg-white/5 rounded-sm px-1 py-0.5 overflow-hidden"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_META[item.type].dot}`} />
                      <span className="text-[9.5px] text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">
                        {item.label}
                      </span>
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[8.5px] font-mono text-cyan-glow pl-1">+{overflow} lagi</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </HudPanel>

      <div className="flex items-center gap-4 flex-wrap text-[11.5px] font-mono">
        {(Object.keys(TYPE_META) as CalItemType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${TYPE_META[t].dot}`} />
            {TYPE_META[t].badge}
          </span>
        ))}
      </div>

      {!calendarConnected && (
        <p className="text-[11px] text-slate-600">
          Google Calendar belum di-connect — cuma nampilin kerjaan/keuangan/pelajaran, dan event baru
          belum bisa disimpan. Connect di bagian{" "}
          <a href="/dashboard/ai-core" className="text-cyan-glow/80 hover:text-cyan-glow hover:underline">
            AI Core
          </a>
          .
        </p>
      )}

      {selectedDay && (
        <div
          className="fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeDay}
        >
          <div
            className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-panel border border-line rounded-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-semibold text-white tracking-wide">
                {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long" }).format(
                  selectedDay
                )}
              </h2>
              <button
                onClick={closeDay}
                aria-label="Tutup"
                className="w-8 h-8 rounded-sm border border-line text-slate-400 hover:text-slate-200 text-sm shrink-0"
              >
                ×
              </button>
            </div>

            {!showAddEvent && (
              <button
                onClick={() => openAddEvent(selectedDay)}
                className="text-xs font-mono uppercase tracking-wider text-cyan-glow/80 hover:text-cyan-glow mb-3"
              >
                + Tambah event
              </button>
            )}

            {showAddEvent && (
              <form
                onSubmit={handleCreateEvent}
                className="mb-4 p-3 border border-line rounded-sm bg-panel2/60 space-y-2.5"
              >
                {eventError && <p className={errorBannerClass}>{eventError}</p>}
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Judul event..."
                  className={inputClass}
                  autoFocus
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                  />
                  <input
                    type="time"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                  />
                  <span className="text-xs text-slate-500">s/d</span>
                  <input
                    type="time"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                  />
                </div>
                {crossesMidnight && (
                  <p className="text-[11px] text-amber-glow">
                    Jam selesai lebih awal dari jam mulai — dianggap berakhir keesokan harinya (event
                    lewat tengah malam).
                  </p>
                )}
                <p className="text-[11px] text-slate-600">
                  Event dibuat langsung di Google Calendar kamu — pastiin udah connect di halaman Aslan.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowAddEvent(false)} className={ghostBtnClass}>
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={eventSaving || !eventTitle.trim()}
                    className={primaryBtnClass}
                  >
                    {eventSaving ? "Menyimpan..." : "Simpan Event"}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : selectedItems.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada aktivitas.</p>
            ) : (
              <ul className="space-y-2.5">
                {selectedItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${TYPE_META[item.type].dot}`}
                    />
                    <div className="min-w-0">
                      <a href={item.href} className="text-sm text-slate-200 hover:underline block truncate">
                        {item.label}
                      </a>
                      <p className="text-[10.5px] font-mono text-slate-500">
                        {item.time ?? "Sepanjang hari"} · {TYPE_META[item.type].badge}
                        {item.meta ? ` · ${item.meta}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
