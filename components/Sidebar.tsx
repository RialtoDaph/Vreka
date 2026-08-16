"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_MODULES } from "@/lib/navModules";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex md:flex-col gap-1 md:gap-1.5 overflow-x-auto md:overflow-visible">
      {NAV_MODULES.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-sm text-sm font-mono uppercase tracking-wider whitespace-nowrap transition-colors border ${
              active
                ? "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-panel2"
            }`}
          >
            <item.icon aria-hidden="true" className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
