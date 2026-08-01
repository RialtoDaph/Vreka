"use client";

import Link from "next/link";
import HudPanel from "@/components/HudPanel";

const tileClass =
  "flex flex-col items-center justify-center gap-1.5 border border-line rounded-sm px-3 py-3.5 text-center hover:border-cyan-glow/50 hover:bg-panel2 transition-colors";
const iconClass = "text-lg text-cyan-glow";
const labelClass = "text-[11px] font-mono uppercase tracking-wider text-slate-300";

export default function QuickCommands() {
  function startVoiceChat() {
    window.dispatchEvent(new Event("vreka:toggle-voice"));
  }

  return (
    <HudPanel>
      <h3 className="font-display font-semibold text-white tracking-wide mb-3">
        Quick Commands
      </h3>
      <div className="grid grid-cols-3 gap-2.5">
        <Link href="/dashboard/keuangan" className={tileClass}>
          <span className={iconClass} aria-hidden="true">⌬</span>
          <span className={labelClass}>Catat Transaksi</span>
        </Link>
        <Link href="/dashboard/kerjaan" className={tileClass}>
          <span className={iconClass} aria-hidden="true">▤</span>
          <span className={labelClass}>Tambah Tugas</span>
        </Link>
        <button type="button" onClick={startVoiceChat} className={tileClass}>
          <span className={iconClass} aria-hidden="true">✦</span>
          <span className={labelClass}>Voice Chat</span>
        </button>
      </div>
    </HudPanel>
  );
}
