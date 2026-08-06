"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { AssistantAuditLog, AssistantMemory } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildDailyActivity, buildToolBreakdown, type DailyActivityPoint, type ToolBreakdownEntry } from "@/lib/assistantActivity";
import { CHART_AXIS, CHART_GRID, CHART_INCOME } from "@/lib/chartColors";
import HudPanel from "@/components/HudPanel";
import { dangerBtnClass } from "@/lib/ui";

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
  update_calendar_event: "Update event kalender",
  delete_calendar_event: "Hapus event kalender",
  add_journal_entry: "Nambah catatan jurnal",
  search_records: "Cari data",
  add_debt: "Catat utang/piutang",
  update_debt: "Update utang/piutang",
  delete_debt: "Hapus utang/piutang",
  add_savings_goal: "Bikin target tabungan",
  update_savings_goal: "Update target tabungan",
  delete_savings_goal: "Hapus target tabungan",
  add_recurring_item: "Tambah item rutin",
  delete_recurring_item: "Hapus item rutin",
  add_milestone: "Tambah milestone",
  update_milestone: "Update milestone",
  delete_milestone: "Hapus milestone",
};

const ACTIVITY_DAYS = 14;

function describeInput(toolName: string, input: Record<string, unknown>): string {
  const candidates = ["title", "title_query", "category", "content", "query", "summary"];
  for (const key of candidates) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-panel border border-line rounded-sm px-3 py-2 text-xs font-mono shadow-glow">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      <p style={{ color: CHART_INCOME }}>{payload[0].value} aksi</p>
    </div>
  );
}

export default function ActivityLog() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  const [items, setItems] = useState<AssistantAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [toolBreakdown, setToolBreakdown] = useState<ToolBreakdownEntry[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivityPoint[]>([]);
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [firstMessageAt, setFirstMessageAt] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [memories, setMemories] = useState<AssistantMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    async function loadLogs() {
      setLoading(true);
      const { data } = await supabase
        .from("assistant_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setItems((data ?? []) as AssistantAuditLog[]);
      setLoading(false);
    }

    async function loadStats() {
      setStatsLoading(true);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (ACTIVITY_DAYS - 1));
      cutoff.setHours(0, 0, 0, 0);

      const [{ data: recentLogs }, { count: messageCount }, { data: oldestMessage }] = await Promise.all([
        supabase.from("assistant_audit_log").select("tool_name, created_at").gte("created_at", cutoff.toISOString()),
        supabase.from("assistant_messages").select("*", { count: "exact", head: true }),
        supabase.from("assistant_messages").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      setToolBreakdown(buildToolBreakdown(recentLogs ?? []));
      setDailyActivity(buildDailyActivity(recentLogs ?? [], ACTIVITY_DAYS));
      setTotalMessages(messageCount ?? 0);
      setFirstMessageAt(oldestMessage?.created_at ?? null);
      setStatsLoading(false);
    }

    async function loadMemories() {
      setMemoriesLoading(true);
      const { data } = await supabase
        .from("assistant_memories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setMemories((data ?? []) as AssistantMemory[]);
      setMemoriesLoading(false);
    }

    loadLogs();
    loadStats();
    loadMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleDeleteMemory(id: string) {
    const previous = memories;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("assistant_memories").delete().eq("id", id);
    if (error) setMemories(previous);
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300 mb-2"
      >
        {open ? "▾" : "▸"} Aktivitas Aslan
      </button>
      {open && (
        <div className="space-y-3">
          <HudPanel>
            {statsLoading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : (
              <>
                <p className="text-sm text-slate-300 mb-4">
                  {totalMessages} obrolan
                  {firstMessageAt && ` · udah ngobrol sejak ${formatDate(firstMessageAt)}`}
                </p>

                {toolBreakdown.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                      Tool Paling Sering Dipakai ({ACTIVITY_DAYS} Hari Terakhir)
                    </p>
                    <ul className="space-y-1.5">
                      {toolBreakdown.map((t) => (
                        <li key={t.tool_name} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{TOOL_LABEL[t.tool_name] ?? t.tool_name}</span>
                          <span className="font-mono text-slate-500">{t.count}x</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                    Aktivitas {ACTIVITY_DAYS} Hari Terakhir
                  </p>
                  <div style={{ width: "100%", height: 140 }}>
                    <ResponsiveContainer>
                      <BarChart data={dailyActivity} barCategoryGap="20%">
                        <CartesianGrid vertical={false} stroke={CHART_GRID} />
                        <XAxis
                          dataKey="label"
                          stroke={CHART_AXIS}
                          tick={{ fill: CHART_AXIS, fontSize: 9, fontFamily: "var(--font-jetbrains)" }}
                          axisLine={{ stroke: CHART_GRID }}
                          tickLine={false}
                          interval={1}
                        />
                        <YAxis
                          stroke={CHART_AXIS}
                          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: "var(--font-jetbrains)" }}
                          axisLine={false}
                          tickLine={false}
                          width={24}
                          allowDecimals={false}
                        />
                        <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Bar dataKey="count" name="Aksi" fill={CHART_INCOME} radius={[3, 3, 0, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </HudPanel>

          <HudPanel>
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-3">
              Memori Aslan ({memories.length})
            </p>
            {memoriesLoading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : memories.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada memori tersimpan.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {memories.map((m) => (
                  <li key={m.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-200">{m.content}</p>
                      <p className="text-[10px] font-mono text-slate-600">{formatDateTime(m.created_at)}</p>
                    </div>
                    <button onClick={() => handleDeleteMemory(m.id)} className={`${dangerBtnClass} shrink-0`}>
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </HudPanel>

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
        </div>
      )}
    </div>
  );
}
