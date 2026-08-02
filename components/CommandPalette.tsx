"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = { label: string; href: string; icon: string; keywords?: string };

const COMMANDS: Command[] = [
  { label: "Overview", href: "/dashboard", icon: "◈" },
  {
    label: "Keuangan",
    href: "/dashboard/keuangan",
    icon: "⌬",
    keywords: "transaksi anggaran analitik pos tetap utang piutang tabungan struk",
  },
  { label: "Kerjaan", href: "/dashboard/kerjaan", icon: "▤", keywords: "to-do kanban kebiasaan habit project" },
  { label: "Pelajaran", href: "/dashboard/pelajaran", icon: "◎", keywords: "kuis catatan belajar timer resource" },
  { label: "Kalender", href: "/dashboard/kalender", icon: "▦", keywords: "jadwal deadline agenda" },
  { label: "Jurnal", href: "/dashboard/jurnal", icon: "✎", keywords: "diary catatan harian refleksi" },
  { label: "Aslan", href: "/dashboard/asisten", icon: "✦", keywords: "chat asisten ai gmail telegram export aktivitas" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const filtered = COMMANDS.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q);
  });

  function go(cmd: Command) {
    setOpen(false);
    router.push(cmd.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) go(filtered[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-lg bg-panel border border-cyan-glow/30 rounded-md shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ketik buat cari modul..."
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white placeholder:text-slate-600 border-b border-line focus:outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">Nggak ketemu.</li>
          ) : (
            filtered.map((cmd, i) => (
              <li key={cmd.href}>
                <button
                  onClick={() => go(cmd)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    i === activeIndex ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-300"
                  }`}
                >
                  <span aria-hidden="true">{cmd.icon}</span>
                  {cmd.label}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="px-4 py-2 text-[10px] font-mono text-slate-600 border-t border-line">
          ↑↓ pilih · Enter buka · Esc tutup
        </p>
      </div>
    </div>
  );
}
