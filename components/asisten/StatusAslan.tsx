"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

type Props = {
  gmailConnected: boolean;
  telegramConnected: boolean;
  voiceSupported: boolean;
  onManage: () => void;
};

// Real counts only -- no fabricated latency/uptime/context-window numbers.
// Connection flags come from the parent (it already owns that state via its
// own connect/disconnect flows); this component only adds the two stats
// nowhere else in the UI surfaces yet: how much Aslan actually remembers,
// and how active it's been today.
export default function StatusAslan({ gmailConnected, telegramConnected, voiceSupported, onManage }: Props) {
  const supabase = createClient();
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [toolCallsToday, setToolCallsToday] = useState<number | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ count: memCount }, { count: callCount }, { data: lastLog }] = await Promise.all([
        supabase.from("assistant_memories").select("*", { count: "exact", head: true }),
        supabase
          .from("assistant_audit_log")
          .select("*", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("assistant_audit_log")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setMemoryCount(memCount ?? 0);
      setToolCallsToday(callCount ?? 0);
      setLastActivityAt(lastLog?.created_at ?? null);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = [true, gmailConnected, telegramConnected, voiceSupported].filter(Boolean).length;

  return (
    <button
      type="button"
      onClick={onManage}
      className="flex items-center gap-2.5 w-full sm:w-auto border border-line bg-panel/50 rounded-full px-3.5 py-2 text-left hover:border-cyan-glow/40 transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-mint-glow shrink-0 animate-pulse" aria-hidden="true" />
      <span className="font-mono text-[10.5px] text-slate-400 truncate">
        {connected}/4 sistem terhubung · {memoryCount ?? "–"} memori · {toolCallsToday ?? 0} aksi hari ini
        {lastActivityAt && ` · terakhir aktif ${formatDateTime(lastActivityAt)}`}
      </span>
      <span className="font-mono text-[10px] text-cyan-glow shrink-0">Kelola →</span>
    </button>
  );
}
