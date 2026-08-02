"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantAuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import HudPanel from "@/components/HudPanel";

const TOOL_LABEL: Record<string, string> = {
  remember: "Nyimpen memory",
  forget: "Hapus memory",
  add_transaction: "Nyatetin transaksi",
  delete_transaction: "Hapus transaksi",
  add_task: "Nambah to-do",
  update_task: "Update to-do",
  delete_task: "Hapus to-do",
  add_subtask: "Nambah sub-task",
  toggle_subtask: "Update sub-task",
  add_study_note: "Nambah catatan belajar",
  update_study_note: "Update catatan belajar",
  delete_study_note: "Hapus catatan belajar",
  set_budget: "Set anggaran",
  delete_budget: "Hapus anggaran",
  toggle_habit: "Centang kebiasaan",
  search_email: "Cari email",
  read_email: "Baca email",
  draft_email_reply: "Bikin draft balesan email",
  check_calendar: "Cek kalender",
  add_calendar_event: "Bikin event kalender",
};

function describeInput(toolName: string, input: Record<string, unknown>): string {
  const candidates = ["title", "title_query", "category", "content", "query", "summary"];
  for (const key of candidates) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export default function ActivityLog() {
  const supabase = createClient();
  const [items, setItems] = useState<AssistantAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || items.length > 0) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("assistant_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setItems((data ?? []) as AssistantAuditLog[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300 mb-2"
      >
        {open ? "▾" : "▸"} Aktivitas Aslan
      </button>
      {open && (
        <HudPanel>
          {loading ? (
            <p className="text-sm text-slate-500">Memuat...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada aktivitas tercatat.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {items.map((log) => {
                const detail = describeInput(log.tool_name, log.input);
                return (
                  <li key={log.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-200">
                        {TOOL_LABEL[log.tool_name] ?? log.tool_name}
                        {detail && <span className="text-slate-500"> — {detail}</span>}
                      </p>
                      <p className="text-[10px] font-mono text-slate-600">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                    {!log.result_ok && (
                      <span className="text-[10px] font-mono text-rose-glow shrink-0">gagal</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </HudPanel>
      )}
    </div>
  );
}
