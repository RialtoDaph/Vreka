"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

const MODULE_LINKS = [
  { href: "/dashboard", label: "Beranda" },
  { href: "/dashboard/keuangan", label: "Keuangan" },
  { href: "/dashboard/kerjaan", label: "Kerjaan" },
  { href: "/dashboard/pelajaran", label: "Pelajaran" },
  { href: "/dashboard/kalender", label: "Kalender" },
  { href: "/dashboard/jurnal", label: "Jurnal" },
  { href: "/dashboard/asisten", label: "Aslan" },
];

export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-void text-slate-200">
      <div className="max-w-md w-full text-center space-y-5">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-rose-glow">
          Ada yang salah
        </p>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
          Halaman ini gagal dimuat
        </h1>
        <p className="text-sm text-slate-400">
          Coba lagi, atau lompat ke modul lain lewat link di bawah -- data kamu aman,
          ini cuma error tampilan.
        </p>
        <button
          onClick={reset}
          className="bg-cyan-glow/10 hover:bg-cyan-glow/20 border border-cyan-glow/50 text-cyan-glow font-mono uppercase tracking-wider text-xs py-2.5 px-4 rounded-sm transition-colors"
        >
          Coba Lagi
        </button>
        <div className="flex flex-wrap justify-center gap-2 pt-3 border-t border-line">
          {MODULE_LINKS.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="text-xs font-mono text-slate-400 hover:text-cyan-glow border border-line hover:border-cyan-glow/40 rounded-sm px-2.5 py-1.5 transition-colors"
            >
              {m.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
