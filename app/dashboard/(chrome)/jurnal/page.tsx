"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JournalEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/date";
import { promptForDate } from "@/lib/journalPrompts";
import { buildHeatmapCells, computeStreak } from "@/lib/habits";
import HudPanel from "@/components/HudPanel";
import MarkdownEditor from "@/components/MarkdownEditor";
import { useConfirm } from "@/lib/useConfirm";
import { Flame } from "lucide-react";
import { primaryBtnClass, dangerBtnClass, errorBannerClass } from "@/lib/ui";

export default function JurnalPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState(today);

  const selectedEntry = entries.find((e) => e.entry_date === selectedDate);
  const otherEntries = entries.filter((e) => e.entry_date !== selectedDate);
  const prompt = useMemo(
    () => promptForDate(new Date(`${selectedDate}T00:00:00`)),
    [selectedDate]
  );

  const entryPeriods = useMemo(() => new Set(entries.map((e) => e.entry_date)), [entries]);
  const streak = computeStreak(entryPeriods);
  const heatmapCells = useMemo(() => buildHeatmapCells(entryPeriods, 30), [entryPeriods]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .order("entry_date", { ascending: false });
    const rows = (data ?? []) as JournalEntry[];
    setEntries(rows);
    setContent(rows.find((e) => e.entry_date === today)?.content ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setContent(entries.find((e) => e.entry_date === date)?.content ?? "");
  }

  // Also used to jump into an existing entry from the list below to edit it.
  function handleEditEntry(entry: JournalEntry) {
    setSelectedDate(entry.entry_date);
    setContent(entry.content);
  }

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // The access token can go stale without logging the user out -- e.g. the
        // tab was backgrounded on mobile (screen lock, app switch) and the SDK's
        // background refresh timer got suspended by the OS. Try one explicit
        // refresh before treating this as a real logout, so a stale token
        // doesn't cost the user their unsaved draft.
        await supabase.auth.refreshSession();
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
      if (!user) {
        setError("Sesi login habis. Login ulang, catatan yang udah ditulis nggak akan hilang.");
        return;
      }
      const { data, error: saveError } = await supabase
        .from("journal_entries")
        .upsert(
          {
            user_id: user.id,
            entry_date: selectedDate,
            content: content.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,entry_date" }
        )
        .select("*")
        .single();
      if (saveError || !data) {
        setError("Gagal simpan catatan. Coba lagi.");
        return;
      }
      setEntries((prev) => {
        const withoutDate = prev.filter((e) => e.entry_date !== selectedDate);
        return [data, ...withoutDate].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      });
    } catch {
      // A dropped/flaky connection can reject these calls outright instead of
      // resolving with a clean error -- without this, saving would get stuck
      // forever with no feedback, which looks exactly like "can't save" even
      // when the write may have actually gone through server-side.
      setError("Koneksi terputus pas nyimpen. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus catatan ini?"))) return;
    setError(null);
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const { error: deleteError } = await supabase.from("journal_entries").delete().eq("id", id);
      if (deleteError) {
        setEntries(previous);
        setError("Gagal hapus catatan. Coba lagi.");
        return;
      }
    } catch {
      setEntries(previous);
      setError("Koneksi terputus pas hapus. Coba lagi.");
      return;
    }
    if (id === selectedEntry?.id) setContent("");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Jurnal
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Catatan Harian
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 border border-amber-glow/35 bg-amber-glow/10 rounded-full px-3.5 py-2">
            <Flame aria-hidden="true" className="w-4 h-4 text-amber-glow" strokeWidth={2} />
            <span className="font-mono text-sm font-semibold text-amber-glow">{streak} hari beruntun</span>
          </div>
        )}
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      <HudPanel glow>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Tanggal entri jurnal"
              value={selectedDate}
              max={today}
              onChange={(e) => e.target.value && handleDateChange(e.target.value)}
              className="bg-panel2 border border-line rounded-sm px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-cyan-glow/60 transition-colors"
            />
            {selectedDate !== today && (
              <button
                onClick={() => handleDateChange(today)}
                className="text-[11px] font-mono uppercase tracking-wider text-cyan-glow/80 hover:text-cyan-glow"
              >
                Hari ini
              </button>
            )}
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
            {formatDate(selectedDate)}
          </p>
        </div>
        <p className="text-sm text-cyan-glow/90 italic mb-3">{prompt}</p>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Tulis apa aja..."
          minHeightClass="min-h-32"
          ariaLabel="Entri jurnal"
        />

        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-4 mb-2">
          30 hari terakhir
        </p>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
          {heatmapCells.map((done, i) => (
            <span
              key={i}
              title={done ? "Ada catatan" : "Nggak nulis"}
              className={`aspect-square rounded-[2px] ${done ? "bg-amber-glow" : "bg-line"}`}
              style={{ opacity: done ? 1 : 0.5 }}
            />
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={handleSave} disabled={saving || !content.trim()} className={primaryBtnClass}>
            {saving ? "Menyimpan..." : selectedEntry ? "Update Catatan" : "Simpan Catatan"}
          </button>
        </div>
      </HudPanel>

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-400">Memuat...</p>
        </HudPanel>
      ) : otherEntries.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-400">Belum ada catatan sebelumnya.</p>
        </HudPanel>
      ) : (
        <div className="space-y-3">
          {otherEntries.map((entry) => (
            <HudPanel key={entry.id}>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => handleEditEntry(entry)}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="text-xs font-mono text-cyan-glow/80">{formatDate(entry.entry_date)}</p>
                  <p className="text-sm text-slate-400 truncate">{entry.content}</p>
                </button>
                <button onClick={() => handleDelete(entry.id)} className={dangerBtnClass}>
                  Hapus
                </button>
              </div>
            </HudPanel>
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
