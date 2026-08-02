"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JournalEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/date";
import { promptForDate } from "@/lib/journalPrompts";
import HudPanel from "@/components/HudPanel";
import { inputClass, primaryBtnClass, dangerBtnClass } from "@/lib/ui";

export default function JurnalPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = todayKey();
  const prompt = useMemo(() => promptForDate(new Date()), []);
  const todayEntry = entries.find((e) => e.entry_date === today);
  const pastEntries = entries.filter((e) => e.entry_date !== today);

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

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { data } = await supabase
      .from("journal_entries")
      .upsert(
        { user_id: user.id, entry_date: today, content: content.trim(), updated_at: new Date().toISOString() },
        { onConflict: "user_id,entry_date" }
      )
      .select("*")
      .single();
    if (data) {
      setEntries((prev) => {
        const withoutToday = prev.filter((e) => e.entry_date !== today);
        return [data, ...withoutToday].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      });
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("journal_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (id === todayEntry?.id) setContent("");
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

      <HudPanel glow>
        <p className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
          {formatDate(today)}
        </p>
        <p className="text-sm text-cyan-glow/90 italic mb-3">{prompt}</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`${inputClass} min-h-32`}
          placeholder="Tulis apa aja..."
        />
        <div className="flex justify-end mt-3">
          <button onClick={handleSave} disabled={saving || !content.trim()} className={primaryBtnClass}>
            {saving ? "Menyimpan..." : todayEntry ? "Update Catatan Hari Ini" : "Simpan Catatan Hari Ini"}
          </button>
        </div>
      </HudPanel>

      {loading ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Memuat...</p>
        </HudPanel>
      ) : pastEntries.length === 0 ? (
        <HudPanel>
          <p className="text-sm text-slate-500">Belum ada catatan sebelumnya.</p>
        </HudPanel>
      ) : (
        <div className="space-y-3">
          {pastEntries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <HudPanel key={entry.id}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="text-xs font-mono text-cyan-glow/80">{formatDate(entry.entry_date)}</p>
                    <p className={`text-sm text-slate-400 ${expanded ? "whitespace-pre-wrap" : "truncate"}`}>
                      {entry.content}
                    </p>
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className={dangerBtnClass}>
                    Hapus
                  </button>
                </div>
              </HudPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
