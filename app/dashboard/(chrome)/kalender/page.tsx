"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildMonthGrid, dateKey, isSameMonth } from "@/lib/calendarGrid";
import HudPanel from "@/components/HudPanel";
import { ghostBtnClass, primaryBtnClass, inputClass, errorBannerClass } from "@/lib/ui";

type CalItemType = "task" | "debt" | "goal" | "calendar";

type CalItem = {
  type: CalItemType;
  label: string;
  meta?: string;
  href: string;
};

const TYPE_META: Record<CalItemType, { dot: string; text: string; badge: string }> = {
  task: { dot: "bg-cyan-glow", text: "text-cyan-glow", badge: "Tugas" },
  debt: { dot: "bg-rose-glow", text: "text-rose-glow", badge: "Utang" },
  goal: { dot: "bg-mint-glow", text: "text-mint-glow", badge: "Tabungan" },
  calendar: { dot: "bg-amber-glow", text: "text-amber-glow", badge: "Kalender" },
};

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function KalenderPage() {
  const supabase = createClient();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date());
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

    const [{ data: tasks }, { data: debts }, { data: goals }, calendarRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("title, deadline")
        .not("deadline", "is", null)
        .gte("deadline", gridStart.toISOString())
        .lt("deadline", gridEndExclusive.toISOString()),
      supabase
        .from("debts")
        .select("party_name, direction, due_date")
        .eq("status", "unpaid")
        .not("due_date", "is", null)
        .gte("due_date", dateKey(gridStart))
        .lte("due_date", dateKey(gridEnd)),
      supabase
        .from("savings_goals")
        .select("name, deadline")
        .not("deadline", "is", null)
        .gte("deadline", dateKey(gridStart))
        .lte("deadline", dateKey(gridEnd)),
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
      push(dateKey(new Date(t.deadline)), { type: "task", label: t.title, href: "/dashboard/kerjaan" });
    }
    for (const d of debts ?? []) {
      if (!d.due_date) continue;
      push(d.due_date, {
        type: "debt",
        label: `${d.direction === "i_owe" ? "Bayar" : "Tagih"} ${d.party_name}`,
        href: "/dashboard/keuangan",
      });
    }
    for (const g of goals ?? []) {
      if (!g.deadline) continue;
      push(g.deadline, { type: "goal", label: g.name, href: "/dashboard/keuangan" });
    }
    setCalendarConnected(!!calendarRes.connected);
    for (const e of calendarRes.events ?? []) {
      if (!e.start) continue;
      push(dateKey(new Date(e.start)), {
        type: "calendar",
        label: e.summary,
        meta: e.location || undefined,
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
  const selectedItems = itemsByDay[dateKey(selectedDay)] ?? [];

  function shiftMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function openAddEvent(day?: Date) {
    setEventTitle("");
    setEventDate(dateKey(day ?? selectedDay));
    setEventStart("09:00");
    setEventEnd("10:00");
    setEventError(null);
    setShowAddEvent(true);
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
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className={ghostBtnClass}>
            ← Bulan Lalu
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelectedDay(d);
            }}
            className={ghostBtnClass}
          >
            Hari Ini
          </button>
          <button onClick={() => shiftMonth(1)} className={ghostBtnClass}>
            Bulan Depan →
          </button>
          <button onClick={() => openAddEvent()} className={primaryBtnClass}>
            + Tambah Event
          </button>
        </div>
      </header>

      <div className="flex items-center gap-4 flex-wrap text-[11px] font-mono">
        {(Object.keys(TYPE_META) as CalItemType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-slate-400">
            <span className={`w-2 h-2 rounded-full ${TYPE_META[t].dot}`} />
            {TYPE_META[t].badge}
          </span>
        ))}
      </div>

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
            const isSelected = key === dateKey(selectedDay);
            const typesPresent = Array.from(new Set(items.map((i) => i.type)));
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(day)}
                aria-label={key}
                className={`aspect-square rounded-sm border p-1.5 flex flex-col items-start justify-between transition-colors ${
                  isSelected
                    ? "border-cyan-glow bg-cyan-glow/10"
                    : isToday
                      ? "border-cyan-glow/40"
                      : "border-line hover:border-slate-600"
                } ${inMonth ? "" : "opacity-30"}`}
              >
                <span className={`text-xs font-mono ${isToday ? "text-cyan-glow" : "text-slate-300"}`}>
                  {day.getDate()}
                </span>
                <span className="flex gap-0.5 flex-wrap">
                  {typesPresent.map((t) => (
                    <span key={t} className={`w-1.5 h-1.5 rounded-full ${TYPE_META[t].dot}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </HudPanel>

      <HudPanel>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display font-semibold text-white tracking-wide">
            {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long" }).format(
              selectedDay
            )}
          </h2>
          <button
            onClick={() => openAddEvent(selectedDay)}
            className="text-xs font-mono uppercase tracking-wider text-cyan-glow/80 hover:text-cyan-glow"
          >
            + Tambah
          </button>
        </div>

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
                Jam selesai lebih awal dari jam mulai — dianggap berakhir keesokan harinya (event lewat
                tengah malam).
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
          <p className="text-sm text-slate-500">Nggak ada apa-apa di hari ini.</p>
        ) : (
          <ul className="space-y-2">
            {selectedItems.map((item, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_META[item.type].dot}`} />
                <a href={item.href} className={`text-sm hover:underline ${TYPE_META[item.type].text}`}>
                  {item.label}
                </a>
                {item.meta && <span className="text-xs text-slate-500">— {item.meta}</span>}
              </li>
            ))}
          </ul>
        )}
        {!calendarConnected && (
          <p className="text-[11px] text-slate-600 mt-3">
            Google Calendar belum di-connect — cuma nampilin tugas/utang/tabungan, dan event baru belum
            bisa disimpan. Connect di bagian{" "}
            <a href="/dashboard/asisten" className="text-cyan-glow/80 hover:text-cyan-glow hover:underline">
              Pengaturan &amp; Integrasi di halaman Aslan
            </a>
            .
          </p>
        )}
      </HudPanel>
    </div>
  );
}
