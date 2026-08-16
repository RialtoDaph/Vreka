"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Circle, type LucideIcon } from "lucide-react";
import type { SearchResultItem } from "@/lib/search";
import { NAV_MODULES } from "@/lib/navModules";

type PaletteItem = { key: string; label: string; sublabel?: string; icon: LucideIcon; href: string };

const SOURCE_ICON: Record<SearchResultItem["source"], LucideIcon> = {
  transaction: NAV_MODULES.find((m) => m.href === "/dashboard/keuangan")!.icon,
  task: NAV_MODULES.find((m) => m.href === "/dashboard/kerjaan")!.icon,
  note: NAV_MODULES.find((m) => m.href === "/dashboard/pelajaran")!.icon,
  journal: NAV_MODULES.find((m) => m.href === "/dashboard/jurnal")!.icon,
  memory: NAV_MODULES.find((m) => m.href === "/dashboard/asisten")!.icon,
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dataResults, setDataResults] = useState<SearchResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

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
    // Remember whatever had focus before opening (⌘K can fire from
    // anywhere on the page, not just a dedicated trigger button) so it can
    // be restored on close instead of leaving focus stranded on <body>.
    triggerRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    setDataResults([]);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  // Debounced live search over the user's own data (transactions, tasks,
  // notes, journal, Aslan memory) so ⌘K doubles as a global search box, not
  // just module navigation. Below 2 chars the query is too noisy to be
  // useful and isn't worth the round trip.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDataResults([]);
      return;
    }
    const controller = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((json) => setDataResults(Array.isArray(json.results) ? json.results : []))
        .catch(() => {
          // Network hiccup or the query changed mid-flight -- the palette
          // just falls back to module matches, nothing to surface to the
          // user over a background search.
        });
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll<HTMLElement>(
      'input, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // Keep Tab/Shift+Tab cycling inside the dialog instead of escaping to
    // whatever's behind the backdrop.
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const filtered = NAV_MODULES.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q);
  });

  const combined: PaletteItem[] = [
    ...filtered.map((c) => ({ key: c.href, label: c.label, icon: c.icon, href: c.href })),
    ...dataResults.map((r) => ({
      key: `${r.source}-${r.id}`,
      label: r.title,
      sublabel: r.snippet,
      icon: SOURCE_ICON[r.source] ?? Circle,
      href: r.href,
    })),
  ];

  function go(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, combined.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (combined[activeIndex]) go(combined[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        className="w-full max-w-lg bg-panel border border-cyan-glow/30 rounded-md shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
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
          {combined.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">Nggak ketemu.</li>
          ) : (
            combined.map((item, i) => (
              <li key={item.key}>
                <button
                  onClick={() => go(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    i === activeIndex ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-300"
                  }`}
                >
                  <item.icon aria-hidden="true" className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.sublabel ? (
                      <span className="block truncate text-xs text-slate-500">{item.sublabel}</span>
                    ) : null}
                  </span>
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
