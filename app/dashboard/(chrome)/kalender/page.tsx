"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildMonthGrid, buildWeekGrid, dateKey, isSameMonth } from "@/lib/calendarGrid";
import { localDateTime, toIsoWithLocalOffset } from "@/lib/date";
import { useConfirm } from "@/lib/useConfirm";
import HudPanel from "@/components/HudPanel";
import { ghostBtnClass, primaryBtnClass, inputClass, errorBannerClass } from "@/lib/ui";
import { Pencil, Trash2 } from "lucide-react";

type CalItemType = "kerjaan" | "keuangan" | "pelajaran" | "asisten";

type CalItem = {
  type: CalItemType;
  label: string;
  meta?: string;
  time?: string;
  href: string;
  // Only set for Google Calendar-sourced ("asisten") items -- lets the UI
  // offer edit/delete for those specifically, since everything else here
  // is derived read-only from other modules (kerjaan/keuangan/pelajaran).
  googleEventId?: string;
  rawStart?: string;
  rawEnd?: string;
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

// A single item row shared by the week view's day panels and the day-detail
// modal. Google Calendar items get Edit/Delete buttons (two-way sync);
// everything else stays a plain link into its owning module.
function CalItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CalItem;
  onEdit: (item: CalItem) => void;
  onDelete: (item: CalItem) => void;
}) {
  const editable = !!item.googleEventId && !!item.rawStart?.includes("T");
  return (
    <li className="flex items-start gap-2.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${TYPE_META[item.type].dot}`} />
      <div className="min-w-0 flex-1">
        <a href={item.href} className="text-sm text-slate-200 hover:underline block truncate">
          {item.label}
        </a>
        <p className="text-[10.5px] font-mono text-slate-400">
          {item.time ?? "Sepanjang hari"} · {TYPE_META[item.type].badge}
          {item.meta ? ` · ${item.meta}` : ""}
        </p>
      </div>
      {item.googleEventId && (
        <div className="flex items-center gap-1 shrink-0">
          {editable && (
            <button
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.label}`}
              className="w-6 h-6 flex items-center justify-center rounded-sm text-slate-400 hover:text-cyan-glow hover:bg-white/5"
            >
              <Pencil aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
            </button>
          )}
          <button
            onClick={() => onDelete(item)}
            aria-label={`Hapus ${item.label}`}
            className="w-6 h-6 flex items-center justify-center rounded-sm text-slate-400 hover:text-rose-glow hover:bg-white/5"
          >
            <Trash2 aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
      )}
    </li>
  );
}

export default function KalenderPage() {
  const supabase = createClient();
  const [view, setView] = useState<"month" | "week">("month");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [visibleWeek, setVisibleWeek] = useState(() => new Date());
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

  const { confirm, confirmDialog } = useConfirm();
  const [editingEvent, setEditingEvent] = useState<{
    googleEventId: string;
    title: string;
    date: string;
    start: string;
    end: string;
  } | null>(null);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventEditError, setEventEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const grid = useMemo(
    () => (view === "month" ? buildMonthGrid(visibleMonth) : buildWeekGrid(visibleWeek)),
    [view, visibleMonth, visibleWeek]
  );

  async function loadItems() {
    setLoading(true);
    const gridStart = grid[0];
    const gridEnd = grid[grid.length - 1];
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
    // Every distinct year/month touched by the grid -- 1-2 for the month
    // view's padding days, potentially 2 for a week view straddling a
    // month boundary. A recurring debt's day-of-month occurrence only
    // counts if it both lands in one of these months AND falls inside the
    // actual visible date range below (guards the week view showing a
    // same-numbered day from the *other* month in its span).
    const monthsInGrid = new Set(grid.map((d) => `${d.getFullYear()}-${d.getMonth()}`));
    for (const d of debts ?? []) {
      const label = `${d.direction === "i_owe" ? "Bayar" : "Tagih"} ${d.party_name}`;
      if (d.is_recurring && d.recurrence_day) {
        for (const ym of monthsInGrid) {
          const [y, m] = ym.split("-").map(Number);
          const occurs = new Date(y, m, d.recurrence_day);
          // Guards short-month overflow (e.g. day 31 rolling into the next
          // month for a 30-day month) the same way the old check did.
          if (occurs.getMonth() !== m) continue;
          if (occurs < gridStart || occurs >= gridEndExclusive) continue;
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
        googleEventId: e.id,
        rawStart: e.start,
        rawEnd: e.end,
      });
    }

    setItemsByDay(map);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, visibleMonth, visibleWeek]);

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(visibleMonth);
  // "27 Jul – 2 Ags 2026" (or "27 – 2 Ags 2026" when the week doesn't cross
  // a month) -- the grid's own first/last day, so it stays correct however
  // the week is anchored.
  const weekLabel = (() => {
    const start = grid[0];
    const end = grid[grid.length - 1];
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = new Intl.DateTimeFormat(
      "id-ID",
      sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }
    ).format(start);
    const endLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
      end
    );
    return `${startLabel} – ${endLabel}`;
  })();
  const headerLabel = view === "month" ? monthLabel : weekLabel;
  const selectedItems = selectedDay ? (itemsByDay[dateKey(selectedDay)] ?? []) : [];

  function shiftMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function shiftWeek(delta: number) {
    setVisibleWeek((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
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

  // Quick-add from a specific day column in the week view -- opens the same
  // shared modal used everywhere else, straight to the form instead of
  // requiring a "+ Tambah event" click first.
  function openAddEventForDay(day: Date) {
    setSelectedDay(day);
    openAddEvent(day);
  }

  function closeDay() {
    setSelectedDay(null);
    setShowAddEvent(false);
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

  // All-day Google events carry a bare date ("2026-08-05", no time-of-day),
  // which the edit form's date+time fields can't represent -- editing those
  // is out of scope for now, only delete is offered for them.
  function openEditEvent(item: CalItem) {
    if (!item.googleEventId || !item.rawStart || !item.rawEnd) return;
    if (!item.rawStart.includes("T")) return;
    const startDt = new Date(item.rawStart);
    const endDt = new Date(item.rawEnd);
    setEventEditError(null);
    setEditingEvent({
      googleEventId: item.googleEventId,
      title: item.label,
      date: dateKey(startDt),
      start: `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`,
      end: `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`,
    });
  }

  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent || !editingEvent.title.trim()) return;
    setEventEditSaving(true);
    setEventEditError(null);
    try {
      const startDt = localDateTime(editingEvent.date, editingEvent.start);
      const endDt = localDateTime(editingEvent.date, editingEvent.end);
      if (editingEvent.end <= editingEvent.start) endDt.setDate(endDt.getDate() + 1);

      const res = await fetch("/api/google/calendar/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: editingEvent.googleEventId,
          summary: editingEvent.title.trim(),
          start: toIsoWithLocalOffset(startDt),
          end: toIsoWithLocalOffset(endDt),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEventEditError(data.error ?? "Gagal update event.");
        return;
      }
      setEditingEvent(null);
      await loadItems();
    } catch {
      setEventEditError("Gagal update event. Coba lagi.");
    } finally {
      setEventEditSaving(false);
    }
  }

  async function handleDeleteEvent(item: CalItem) {
    if (!item.googleEventId) return;
    if (!(await confirm(`Hapus "${item.label}" dari Google Calendar?`))) return;
    setDeleteError(null);
    try {
      const res = await fetch(`/api/google/calendar/delete?eventId=${encodeURIComponent(item.googleEventId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Gagal hapus event.");
        return;
      }
      await loadItems();
    } catch {
      setDeleteError("Gagal hapus event. Coba lagi.");
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
            {headerLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 border border-line rounded-md p-0.5">
            <button
              onClick={() => setView("month")}
              className={`px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider rounded-[3px] ${
                view === "month" ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Bulan
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider rounded-[3px] ${
                view === "week" ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Minggu
            </button>
          </div>
          {view === "month" ? (
            <>
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
            </>
          ) : (
            <>
              <button onClick={() => shiftWeek(-1)} className={ghostBtnClass}>
                ← Minggu Lalu
              </button>
              <button onClick={() => setVisibleWeek(new Date())} className={ghostBtnClass}>
                Minggu Ini
              </button>
              <button onClick={() => shiftWeek(1)} className={ghostBtnClass}>
                Minggu Depan →
              </button>
            </>
          )}
          <button onClick={() => openDay(new Date())} className={primaryBtnClass}>
            + Tambah Event
          </button>
        </div>
      </header>

      {view === "month" ? (
        <HudPanel>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-mono uppercase text-slate-400 py-1">
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
      ) : (
        <div className="space-y-2.5">
          {grid.map((day) => {
            const key = dateKey(day);
            const items = (itemsByDay[key] ?? [])
              .slice()
              .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
            const isToday = key === dateKey(new Date());
            // ring (box-shadow-based) rather than a border/bg override --
            // HudPanel already bakes in border-line/bg-panel, and a
            // passed-in className competing on the same CSS properties
            // would have unpredictable cascade order.
            return (
              <HudPanel key={key} className={isToday ? "ring-1 ring-cyan-glow/40 ring-inset" : ""}>
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <p className={`text-sm font-mono capitalize ${isToday ? "text-cyan-glow" : "text-slate-300"}`}>
                    {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "short" }).format(
                      day
                    )}
                  </p>
                  <button
                    onClick={() => openAddEventForDay(day)}
                    className="text-[11px] font-mono uppercase tracking-wider text-cyan-glow/70 hover:text-cyan-glow shrink-0"
                  >
                    + Event
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-slate-400">Kosong.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item, i) => (
                      <CalItemRow key={i} item={item} onEdit={openEditEvent} onDelete={handleDeleteEvent} />
                    ))}
                  </ul>
                )}
              </HudPanel>
            );
          })}
        </div>
      )}

      {deleteError && <p className={errorBannerClass}>{deleteError}</p>}

      <div className="flex items-center gap-4 flex-wrap text-[11.5px] font-mono">
        {(Object.keys(TYPE_META) as CalItemType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${TYPE_META[t].dot}`} />
            {TYPE_META[t].badge}
          </span>
        ))}
      </div>

      {!calendarConnected && (
        <p className="text-[11px] text-slate-400">
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
          className="fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-center justify-center p-4 animate-backdrop-in"
          onClick={closeDay}
        >
          <div
            className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-panel border border-line rounded-lg p-5 animate-panel-in"
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
                  aria-label="Judul event"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Judul event..."
                  className={inputClass}
                  autoFocus
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    aria-label="Tanggal event"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                  />
                  <input
                    type="time"
                    aria-label="Jam mulai"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                  />
                  <span className="text-xs text-slate-400">s/d</span>
                  <input
                    type="time"
                    aria-label="Jam selesai"
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
                <p className="text-[11px] text-slate-400">
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
              <p className="text-sm text-slate-400">Memuat...</p>
            ) : selectedItems.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada aktivitas.</p>
            ) : (
              <ul className="space-y-2.5">
                {selectedItems.map((item, i) => (
                  <CalItemRow key={i} item={item} onEdit={openEditEvent} onDelete={handleDeleteEvent} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editingEvent && (
        <div
          className="fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-center justify-center p-4 animate-backdrop-in"
          onClick={() => setEditingEvent(null)}
        >
          <div
            className="w-full max-w-sm bg-panel border border-line rounded-lg p-5 animate-panel-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-semibold text-white tracking-wide">Edit Event</h2>
              <button
                onClick={() => setEditingEvent(null)}
                aria-label="Tutup"
                className="w-8 h-8 rounded-sm border border-line text-slate-400 hover:text-slate-200 text-sm shrink-0"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateEvent} className="space-y-2.5">
              {eventEditError && <p className={errorBannerClass}>{eventEditError}</p>}
              <input
                type="text"
                aria-label="Judul event"
                value={editingEvent.title}
                onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                placeholder="Judul event..."
                className={inputClass}
                autoFocus
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  aria-label="Tanggal event"
                  value={editingEvent.date}
                  onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                  className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                />
                <input
                  type="time"
                  aria-label="Jam mulai"
                  value={editingEvent.start}
                  onChange={(e) => setEditingEvent({ ...editingEvent, start: e.target.value })}
                  className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                />
                <span className="text-xs text-slate-400">s/d</span>
                <input
                  type="time"
                  aria-label="Jam selesai"
                  value={editingEvent.end}
                  onChange={(e) => setEditingEvent({ ...editingEvent, end: e.target.value })}
                  className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingEvent(null)} className={ghostBtnClass}>
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={eventEditSaving || !editingEvent.title.trim()}
                  className={primaryBtnClass}
                >
                  {eventEditSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
