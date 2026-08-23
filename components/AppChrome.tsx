"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";

// Memory Map's node-preview overlay iframes these same routes in a small
// modal (see MemoryMap.tsx's navOverlay) -- it appends ?embed=1 so this
// sidebar/account chrome, which only makes sense as a full-page nav, doesn't
// render nested inside that already-chromed popup.
//
// Read the param off window in an effect (like /login does with its
// ?error= param) rather than useSearchParams, so this layout stays
// statically rendered instead of needing a Suspense boundary. The embedded
// case is only ever loaded fresh inside an iframe, so the one-paint flash
// before this hides itself is not user-visible in practice.
export default function AppChrome({ email }: { email: string | null | undefined }) {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get("embed") === "1");
  }, []);
  if (embedded) return null;

  return (
    <aside className="md:w-56 md:shrink-0 border-b md:border-b-0 md:border-r border-line bg-panel/40 backdrop-blur-sm p-4 md:p-5 md:min-h-screen">
      <div className="flex items-center justify-between md:block mb-0 md:mb-8">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow pulse-dot" />
          <span className="font-display font-bold tracking-widest text-fg text-lg">
            VREKA
          </span>
        </Link>
        <div className="md:hidden">
          <SignOutButton />
        </div>
      </div>
      {/* Mobile gets BottomNav (rendered at the layout level) instead --
          the old horizontally-scrolling nav pill row here was replaced by a
          proper thumb-reachable bottom tab bar. */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="hidden md:block mt-8 pt-4 border-t border-line">
        <p className="text-[11px] font-mono text-fg-subtle truncate mb-3">{email}</p>
        <SignOutButton />
        <p className="text-[10px] font-mono text-fg-subtle mt-4">
          <kbd className="border border-line rounded-sm px-1 py-0.5">⌘K</kbd> buat cari cepat
        </p>
      </div>
    </aside>
  );
}
