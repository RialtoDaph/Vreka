"use client";

import { useTheme, type ThemePreference } from "@/components/ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Gelap" },
  { value: "light", label: "Terang" },
  { value: "system", label: "Sistem" },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle mb-0.5">
          Tampilan
        </p>
        <p className="text-fg-muted text-sm">Gelap (default), terang, atau ikut pengaturan device.</p>
      </div>
      <div className="flex gap-0.5 border border-line rounded-md p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPreference(opt.value)}
            aria-pressed={preference === opt.value}
            className={`px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider rounded-[3px] transition ${
              preference === opt.value
                ? "bg-cyan-glow/10 text-cyan-glow"
                : "text-fg-subtle hover:text-fg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
