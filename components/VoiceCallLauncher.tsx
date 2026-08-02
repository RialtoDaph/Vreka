"use client";

import { usePathname } from "next/navigation";
import { useVoiceAssistant } from "@/lib/assistant/useVoiceAssistant";

export default function VoiceCallLauncher() {
  const pathname = usePathname();
  const { supported, phase, errorMsg, toggle, audioRef } = useVoiceAssistant();

  // The Memory Map (root dashboard) has its own voice dial wired to the same
  // hook — showing this bottom bar there too would be two competing mics.
  if (pathname === "/dashboard") return null;
  if (!supported) return null;

  const active = phase !== "idle" && phase !== "error";
  const statusLabel =
    phase === "listening"
      ? "Lagi dengerin..."
      : phase === "processing"
        ? "Mikir..."
        : phase === "speaking"
          ? "Ngomong..."
          : phase === "error"
            ? "Error"
            : "Tekan buat ngobrol";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 flex flex-col items-center gap-2">
      <button
        onClick={toggle}
        data-phase={phase}
        className={`w-full flex items-center gap-3 rounded-full border backdrop-blur-sm px-4 py-2.5 transition-colors ${
          active
            ? "bg-panel/90 border-cyan-glow/60 shadow-glow"
            : "bg-panel/70 border-line hover:border-cyan-glow/40"
        }`}
        aria-label={active ? "Hentikan ngobrol sama Aslan" : "Ngobrol sama Aslan"}
        title={active ? "Hentikan ngobrol" : "Ngobrol sama Aslan"}
      >
        <span className="w-9 h-9 shrink-0">
          <span className="aslan-avatar">
            <img src="/aslan.png" alt="" />
          </span>
        </span>
        <span className="min-w-0 text-left">
          <span className="block font-display text-xs font-semibold uppercase tracking-widest text-white">
            Ngobrol Sama Aslan
          </span>
          <span className="block text-[11px] font-mono text-cyan-glow truncate">
            {statusLabel}
          </span>
        </span>
      </button>
      {errorMsg && (
        <p className="text-rose-glow text-xs font-mono text-center">{errorMsg}</p>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
