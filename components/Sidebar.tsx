"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "◈" },
  { href: "/dashboard/keuangan", label: "Keuangan", icon: "⌬" },
  { href: "/dashboard/kerjaan", label: "Kerjaan", icon: "▤" },
  { href: "/dashboard/pelajaran", label: "Pelajaran", icon: "◎" },
  { href: "/dashboard/asisten", label: "Aslan", icon: "✦" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex md:flex-col gap-1 md:gap-1.5 overflow-x-auto md:overflow-visible">
      {NAV.map((item) => {
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
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
