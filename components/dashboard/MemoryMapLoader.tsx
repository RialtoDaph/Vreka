"use client";

import dynamic from "next/dynamic";
import type { MemoryMapData } from "@/lib/memoryMap";

const MemoryMap = dynamic(() => import("./MemoryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-dvh bg-void flex items-center justify-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-glow pulse-dot">
        Memuat memory core...
      </p>
    </div>
  ),
});

export default function MemoryMapLoader({ data }: { data: MemoryMapData }) {
  return <MemoryMap data={data} />;
}
