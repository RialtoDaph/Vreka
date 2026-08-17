"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_MODULES } from "@/lib/navModules";
import { MoreHorizontal } from "lucide-react";

// The 4 highest-frequency modules get their own thumb-reachable tab;
// everything else lives one tap away behind "Lainnya" instead of cramming
// all 11 modules into a bar meant to work with a thumb. Replaces the old
// mobile top bar's horizontally-scrolling nav pills (Sidebar still handles
// desktop, unchanged) -- md:hidden here, hidden md:block on Sidebar.
const PRIMARY_HREFS = ["/dashboard", "/dashboard/keuangan", "/dashboard/kerjaan", "/dashboard/kalender"];

function isActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const primary = PRIMARY_HREFS.map((href) => NAV_MODULES.find((m) => m.href === href)).filter(
    (m): m is (typeof NAV_MODULES)[number] => m !== undefined
  );
  const rest = NAV_MODULES.filter((m) => !PRIMARY_HREFS.includes(m.href));
  const restActive = rest.some((m) => isActive(m.href, pathname));

  // Same as ConfirmDialog/CommandPalette -- Escape dismisses without
  // requiring a keyboard user to tab through every module link first.
  useEffect(() => {
    if (!showMore) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMore(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMore]);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-panel/95 border-t border-line backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[9.5px] font-mono uppercase tracking-wider ${
                  active ? "text-cyan-glow" : "text-fg-subtle"
                }`}
              >
                <item.icon aria-hidden="true" className="w-5 h-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            aria-label="Menu lainnya"
            className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[9.5px] font-mono uppercase tracking-wider ${
              restActive ? "text-cyan-glow" : "text-fg-subtle"
            }`}
          >
            <MoreHorizontal aria-hidden="true" className="w-5 h-5" strokeWidth={1.75} />
            Lainnya
          </button>
        </div>
      </nav>

      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-void/75 backdrop-blur-sm flex items-end animate-backdrop-in"
          onClick={() => setShowMore(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pilih modul lain"
            className="w-full bg-panel border-t border-line rounded-t-lg p-4 animate-sheet-in"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
                Menu lainnya
              </span>
              <button
                type="button"
                onClick={() => setShowMore(false)}
                aria-label="Tutup"
                className="w-7 h-7 flex items-center justify-center rounded-sm border border-line text-fg-subtle hover:text-fg-secondary text-sm"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {rest.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-sm border text-[10px] font-mono uppercase tracking-wider text-center ${
                      active
                        ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow"
                        : "border-line text-fg-subtle"
                    }`}
                  >
                    <item.icon aria-hidden="true" className="w-5 h-5" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
