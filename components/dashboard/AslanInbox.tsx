"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantAuditLog } from "@/lib/types";
import { TOOL_LABEL, describeToolInput, toolSource } from "@/lib/assistant/toolLabels";

const LAST_SEEN_KEY = "aslan-inbox-last-seen";
const POLL_MS = 60_000;
const MAX_SHOWN = 5;

export default function AslanInbox() {
  const supabase = createClient();
  const [unread, setUnread] = useState<AssistantAuditLog[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // First-ever visit: nothing to catch up on -- start the cursor at
      // "now" so only activity from here on ever shows up as unread,
      // instead of dumping a user's whole history on them at once.
      const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
      if (!lastSeen) {
        window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
        return;
      }
      const { data } = await supabase
        .from("assistant_audit_log")
        .select("*")
        .gt("created_at", lastSeen)
        .order("created_at", { ascending: false })
        .limit(MAX_SHOWN);
      if (!cancelled) setUnread((data ?? []) as AssistantAuditLog[]);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setUnread([]);
  }

  if (unread.length === 0) return null;

  return (
    <div className="w-[min(300px,88vw)] bg-panel/90 border border-line rounded-lg backdrop-blur-sm shadow-glow overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-400">Aslan · Inbox</span>
        <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-mint-glow/20 text-mint-glow font-mono text-[9.5px]">
          {unread.length}
        </span>
      </div>
      <ul className="divide-y divide-line/60 max-h-[260px] overflow-y-auto">
        {unread.map((log) => {
          const detail = describeToolInput(log.input);
          const source = toolSource(log.tool_name);
          return (
            <li key={log.id} className="px-3 py-2.5">
              <p className="text-xs text-slate-200">
                🔧 {TOOL_LABEL[log.tool_name] ?? log.tool_name}
                {!log.result_ok && <span className="text-rose-glow"> — gagal</span>}
              </p>
              {(detail || source) && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {detail}
                  {detail && source && " — "}
                  {source && `via ${source}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-3 py-2 border-t border-line">
        <button
          onClick={dismiss}
          className="text-[10.5px] font-mono uppercase tracking-wider text-cyan-glow/80 hover:text-cyan-glow"
        >
          Oke, siap
        </button>
      </div>
    </div>
  );
}
