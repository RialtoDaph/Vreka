"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JournalEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/date";
import { promptForDate } from "@/lib/journalPrompts";
import HudPanel from "@/components/HudPanel";
import { inputClass, primaryBtnClass, dangerBtnClass, errorBannerClass } from "@/lib/ui";

export default function JurnalPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState(today);

  const selectedEntry = entries.find((e) => e.entry_date === selectedDate);
  const otherEntries = entries.filter((e) => e.entry_date !== selectedDate);
  const prompt = useMemo(
    () => promptForDate(new Date(`${selectedDate}T00:00:00`)),
    [selectedDate]
  );

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
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
      setSaving(false);
      return;
    }
    setEntries((prev) => {
      const withoutDate = prev.filter((e) => e.entry_date !== selectedDate);
      return [data, ...withoutDate].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
    });
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Yakin mau hapus catatan ini?")) return;
    setError(null);
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const { error: deleteError } = await supabase.from("journal_entries").delete().eq("id", id);
    if (deleteError) {
      setEntries(previous);
      setError("Gagal hapus catatan. Coba lagi.");
      return;
    }
    if (id === selectedEntry?.id) setContent("");
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
          Jurnal
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          Catatan Harian
        </h1>
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      <HudPanel glow>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
          <div className="flex items-center gap-2">
            <input
              type="date"
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
          <p className="text-xs font-mono uppercase tracking-wider text-slate-500">
            {formatDate(selectedDate)}
          </p>
        </div>
        <p className="text-sm text-cyan-glow/90 italic mb-3">{prompt}</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`${inputClass} min-h-32`}
          placeholder="Tulis apa aja..."
        />
        <div className="flex justify-end mt-3">
          <button onClick={handleSave} disabled={saving || !content.trim()} className={primaryBtnClass}>
            {saving ? "Menyimpan..." : selectedEntry ? "Update Catatan" : "Simpan Catatan"}
          </button>
        </div>
      </HudPanel>

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Memuat...</p>
        </HudPanel>
      ) : otherEntries.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Belum ada catatan sebelumnya.</p>
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
    </div>
  );
}
